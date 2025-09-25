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
exports.DocumentationAgent = void 0;
const openai_1 = require("@langchain/openai");
const output_parsers_1 = require("@langchain/core/output_parsers");
const prompts_1 = require("@langchain/core/prompts");
const rag_service_1 = require("../service/rag_service");
const vscode = __importStar(require("vscode"));
class DocumentationAgent {
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
            case 'generateProjectOverview':
                return await this.generateProjectOverview(context.projectStructure, context.userQuery);
            case 'generateClassDocumentation':
                return await this.generateClassDocumentation(context.javaClass, context.relatedClasses, context.userQuery);
            default:
                throw new Error(`Unknown task: ${task}`);
        }
    }
    async generateProjectOverview(structure, userQuery) {
        try {
            const model = this.initializeModel();
            let finalPrompt = `
                Generate a concise overview of this Java/Spring project for new developers.
                Focus on architecture and key components that matter for onboarding.
                
                Project Structure:
                {structure}
                
                Guidelines for documentation:
                1. Start with a brief description of what the project does (1-2 sentences)
                2. Describe the main architectural layers (Controller, Service, Repository, etc.)
                3. List the most important classes and what they do
                4. Explain the data flow through the system
                5. Keep the entire documentation under 300 words
                6. Use simple language that new developers can understand
                7. Format the response in code with clear headings
            `;
            if (userQuery && structure) {
                const context = await this.ragService.retrieveContext(userQuery, structure);
                const augmentedPrompt = await this.ragService.augmentPrompt(finalPrompt, context);
                // Use the augmented prompt directly instead of treating it as a template
                finalPrompt = augmentedPrompt;
            }
            // Create a prompt for generating project documentation
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
            throw new Error(`Failed to generate project overview: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    async generateClassDocumentation(javaClass, relatedClasses = [], userQuery) {
        try {
            const model = this.initializeModel();
            let finalPrompt = `
                Generate concise, developer-friendly documentation for this Java class.
                Focus on what the class does and how to use it, not implementation details.
                
                Class: {className}
                Package: {package}
                File: {filePath}
                
                Annotations: {annotations}
                Extends: {extends}
                Implements: {implements}
                
                Fields:
                {fields}
                
                Methods:
                {methods}
                
                Related Classes:
                {relatedClasses}
                
                Guidelines for documentation:
                1. Start with a clear, one-sentence description of the class purpose
                2. List the main responsibilities in bullet points (3-5 items max)
                3. Briefly describe important methods (focus on what they do, not how)
                4. Mention key relationships with other classes
                5. Keep the entire documentation under 200 words
                6. Use simple language that new developers can understand
                7. Format the response in code with clear headings
            `;
            if (userQuery && javaClass) {
                // For class documentation, we can create a simple context
                const context = {
                    relevantClasses: [javaClass],
                    relevantMethods: javaClass.methods.map((method) => ({
                        className: javaClass.name,
                        method: method
                    })),
                    projectStats: {
                        totalClasses: 1,
                        totalMethods: javaClass.methods.length,
                        totalFields: javaClass.fields.length,
                        springComponents: javaClass.annotations.some((ann) => ann.includes('@Service') ||
                            ann.includes('@Controller') ||
                            ann.includes('@Repository') ||
                            ann.includes('@Component') ||
                            ann.includes('@RestController')) ? 1 : 0
                    }
                };
                const augmentedPrompt = await this.ragService.augmentPrompt(finalPrompt, context);
                // Use the augmented prompt directly instead of treating it as a template
                finalPrompt = augmentedPrompt;
            }
            const promptTemplate = prompts_1.PromptTemplate.fromTemplate(finalPrompt);
            const fieldsStr = javaClass.fields.map((f) => `- ${f.visibility} ${f.isStatic ? 'static ' : ''}${f.type} ${f.name} ${f.annotations.length > 0 ? '(' + f.annotations.join(', ') + ')' : ''}`).join('\n');
            const methodsStr = javaClass.methods.map((m) => `- ${m.visibility} ${m.isStatic ? 'static ' : ''}${m.returnType} ${m.name}(${m.parameters.map((p) => `${p.type} ${p.name}`).join(', ')}) ${m.annotations.length > 0 ? '(' + m.annotations.join(', ') + ')' : ''}`).join('\n');
            const relatedClassesStr = relatedClasses.map((cls) => `- ${cls.name} (${cls.package})`).join('\n');
            const chain = promptTemplate.pipe(model).pipe(this.outputParser);
            const result = await chain.invoke({
                className: javaClass.name,
                package: javaClass.package,
                filePath: javaClass.filePath,
                annotations: javaClass.annotations.join(', '),
                extends: javaClass.extends || 'None',
                implements: javaClass.implements.join(', ') || 'None',
                fields: fieldsStr || 'None',
                methods: methodsStr || 'None',
                relatedClasses: relatedClassesStr || 'None'
            });
            return result;
        }
        catch (error) {
            if (error instanceof Error && error.message.includes('API key not configured')) {
                throw error; // Re-throw configuration errors
            }
            throw new Error(`Failed to generate class documentation: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }
    // Update an existing markdown file to reflect the current codebase and related files
    async updateMarkdownFile(structure, existing, relatedFiles = [], relPath) {
        try {
            const model = this.initializeModel();
            let finalPrompt = `
                You are given an existing markdown file and several related code snippets. Update the markdown only where it is inconsistent with the code. Preserve headings and formatting when possible. Keep changes minimal and focused.

                File path: ${relPath || 'unknown'}
                Existing markdown (begin):\n{existing}\nExisting markdown (end)

                Related code snippets (begin):\n{snippets}\nRelated code snippets (end)

                Guidelines:
                1. Only modify sections that are outdated or incorrect relative to the code.
                2. Preserve examples and formatting where possible; update only necessary descriptions.
                3. If the markdown is missing a short usage example, you may add a concise example based on the code.
                4. Return the full updated markdown content only.
            `;
            const snippets = relatedFiles.map(r => `---\nfile: ${r.path}\n\n${r.snippet}\n---`).join('\n');
            const promptTemplate = prompts_1.PromptTemplate.fromTemplate(finalPrompt);
            const chain = promptTemplate.pipe(model).pipe(this.outputParser);
            const result = await chain.invoke({ existing: existing.slice(0, 3000), snippets });
            // Remove surrounding markdown fences if present
            if (typeof result === 'string') {
                let s = result.trim();
                const fullFence = s.match(/^```[^\n]*\n([\s\S]*)\n```$/);
                if (fullFence && fullFence[1]) {
                    return fullFence[1].trim();
                }
                s = s.replace(/^```[^\n]*\n/, '');
                s = s.replace(/\n```\s*$/, '');
                return s.trim();
            }
            return result;
        }
        catch (error) {
            if (error instanceof Error && error.message.includes('API key not configured')) {
                throw error;
            }
            throw new Error(`Failed to update markdown file: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
exports.DocumentationAgent = DocumentationAgent;
//# sourceMappingURL=documentation_agent_langchain.js.map