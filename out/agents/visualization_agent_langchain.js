"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.VisualizationAgent = void 0;
const openai_1 = require("@langchain/openai");
const output_parsers_1 = require("@langchain/core/output_parsers");
const prompts_1 = require("@langchain/core/prompts");
const java_parser_1 = require("../service/java_parser");
const rag_service_1 = require("../service/rag_service");
const vscode = __importStar(require("vscode"));
class VisualizationAgent {
    model = null;
    outputParser;
    ragService;
    constructor() {
        this.outputParser = new output_parsers_1.StringOutputParser();
        this.ragService = new rag_service_1.RAGService();
        // We don't initialize the model here to avoid requiring API key during extension activation
    }
    initializeModel() {
        if (this.model) {
            return this.model;
        }
        // Get configuration
        const config = vscode.workspace.getConfiguration('codedoc');
        const apiKey = config.get('openaiApiKey');
        const modelName = config.get('openaiModel', 'gpt-4');
        const maxTokens = config.get('maxTokens', 500); // Reduced from 2000 to 500 for concise responses
        const temperature = config.get('temperature', 0.3);
        if (!apiKey) {
            throw new Error('OpenAI API key not configured. Please configure it in the settings.');
        }
        this.model = new openai_1.ChatOpenAI({
            modelName: modelName,
            temperature: temperature,
            maxTokens: maxTokens,
            openAIApiKey: apiKey
        });
        return this.model;
    }
    async execute(context) {
        const task = context.task;
        switch (task) {
            case 'generateArchitectureDiagram':
                return await this.generateArchitectureDescription(context.projectStructure, context.userQuery);
            default:
                throw new Error(`Unknown task: ${task}`);
        }
    }
    async generateArchitectureDescription(structure, userQuery) {
        try {
            const model = this.initializeModel();
            let finalPrompt = `
                Generate a concise architecture description of this Java/Spring project for new developers.
                Focus on the key components and relationships that matter for understanding the system.
                
                Project Structure:
                {structure}
                
                Guidelines for documentation:
                1. Start with a brief description of the system architecture (1-2 sentences)
                2. Describe the main architectural layers and their responsibilities
                3. List the most important components and their relationships
                4. Include a simple mermaid diagram showing key relationships
                5. Keep the entire documentation under 250 words
                6. Use simple language that new developers can understand
                7. Format the response in clear headings
            `;
            if (userQuery && structure) {
                const context = await this.ragService.retrieveContext(userQuery, structure);
                const augmentedPrompt = await this.ragService.augmentPrompt(finalPrompt, context);
                // Use the augmented prompt directly instead of treating it as a template
                finalPrompt = augmentedPrompt;
            }
            // Use the existing JavaParser to get project structure
            const javaParser = new java_parser_1.JavaParser();
            // Create a prompt for generating architecture description
            const promptTemplate = prompts_1.PromptTemplate.fromTemplate(finalPrompt);
            // Convert structure to a readable format for the LLM
            const structureSummary = this.createStructureSummary(structure);
            const chain = promptTemplate.pipe(model).pipe(this.outputParser);
            const result = await chain.invoke({ structure: structureSummary });
            return result;
        }
        catch (error) {
            if (error instanceof Error && error.message.includes('API key not configured')) {
                throw error; // Re-throw configuration errors
            }
            throw new Error(`Failed to generate architecture description: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    createStructureSummary(structure) {
        let summary = `Total Classes: ${structure.classes.length}\n\n`;
        // Group classes by package
        const packageGroups = {};
        structure.classes.forEach(cls => {
            const pkg = cls.package || 'default';
            if (!packageGroups[pkg]) {
                packageGroups[pkg] = [];
            }
            packageGroups[pkg].push(cls);
        });
        summary += "Packages:\n";
        Object.entries(packageGroups).forEach(([pkg, classes]) => {
            summary += `- ${pkg}: ${classes.length} classes\n`;
        });
        // Add Spring components
        const springComponents = structure.classes.filter(cls => cls.annotations.some(ann => ann.includes('@Service') ||
            ann.includes('@Controller') ||
            ann.includes('@Repository') ||
            ann.includes('@Component') ||
            ann.includes('@RestController')));
        if (springComponents.length > 0) {
            summary += "\nSpring Components:\n";
            springComponents.forEach(comp => {
                const springAnns = comp.annotations.filter(ann => ann.includes('@Service') ||
                    ann.includes('@Controller') ||
                    ann.includes('@Repository') ||
                    ann.includes('@Component') ||
                    ann.includes('@RestController'));
                summary += `- ${comp.name}: ${springAnns.join(', ')}\n`;
            });
        }
        // Add relationships
        summary += `\nKey Relationships:\n`;
        const relationshipCounts = structure.relationships.reduce((acc, rel) => {
            acc[rel.type] = (acc[rel.type] || 0) + 1;
            return acc;
        }, {});
        Object.entries(relationshipCounts).forEach(([type, count]) => {
            summary += `- ${type}: ${count} connections\n`;
        });
        return summary;
    }
}
exports.VisualizationAgent = VisualizationAgent;
//# sourceMappingURL=visualization_agent_langchain.js.map