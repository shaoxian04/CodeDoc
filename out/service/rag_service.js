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
exports.RAGService = void 0;
const output_parsers_1 = require("@langchain/core/output_parsers");
const usage_scanner_1 = require("./usage_scanner");
const vscode = __importStar(require("vscode"));
// We'll import ChatOpenAI only when needed to avoid early validation
let ChatOpenAI;
class RAGService {
    model = null;
    outputParser;
    usageScanner;
    constructor() {
        this.outputParser = new output_parsers_1.StringOutputParser();
        this.usageScanner = new usage_scanner_1.UsageScanner();
        // We don't initialize the model here to avoid requiring API key during extension activation
    }
    async initializeModel() {
        // Lazy import to avoid early validation
        if (!ChatOpenAI) {
            const langchainOpenAI = await Promise.resolve().then(() => __importStar(require("@langchain/openai")));
            ChatOpenAI = langchainOpenAI.ChatOpenAI;
        }
        if (this.model) {
            return this.model;
        }
        // Get configuration
        const config = vscode.workspace.getConfiguration('codedoc');
        const apiKey = config.get('openaiApiKey');
        const modelName = config.get('openaiModel', 'gpt-4');
        const maxTokens = config.get('maxTokens', 1000);
        const temperature = config.get('temperature', 0.3);
        if (!apiKey) {
            throw new Error('OpenAI API key not configured. Please configure it in the settings.');
        }
        this.model = new ChatOpenAI({
            modelName: modelName,
            temperature: temperature,
            maxTokens: maxTokens,
            openAIApiKey: apiKey
        });
        return this.model;
    }
    /**
     * Retrieve relevant code context based on user query
     */
    async retrieveContext(query, structure) {
        // Simple keyword-based retrieval for now
        // In a more advanced implementation, this could use embeddings for semantic search
        const keywords = this.extractKeywords(query);
        const relevantClasses = this.findRelevantClasses(keywords, structure);
        const relevantMethods = this.findRelevantMethods(keywords, structure);
        return {
            relevantClasses,
            relevantMethods,
            projectStats: this.getProjectStats(structure)
        };
    }
    /**
     * Augment a prompt with retrieved context
     */
    async augmentPrompt(prompt, context) {
        const contextSummary = this.createContextSummary(context);
        // Instead of creating a new prompt template, we'll directly augment the prompt string
        // This avoids potential issues with variable interpolation in nested templates
        const augmentedPrompt = `
Use the following context to enhance your response:

Context:
${contextSummary}

Original request:
${prompt}

Please provide a detailed response that incorporates the context above.
        `.trim();
        return augmentedPrompt;
    }
    extractKeywords(query) {
        // Simple keyword extraction
        // In a more advanced implementation, this could use NLP techniques
        return query.toLowerCase().split(/\s+/).filter(word => word.length > 3);
    }
    findRelevantClasses(keywords, structure) {
        return structure.classes.filter(cls => {
            const classText = `${cls.name} ${cls.package} ${cls.annotations.join(' ')}`.toLowerCase();
            return keywords.some(keyword => classText.includes(keyword));
        });
    }
    findRelevantMethods(keywords, structure) {
        const relevantMethods = [];
        structure.classes.forEach(cls => {
            cls.methods.forEach(method => {
                const methodText = `${method.name} ${method.returnType} ${method.annotations.join(' ')}`.toLowerCase();
                if (keywords.some(keyword => methodText.includes(keyword))) {
                    relevantMethods.push({
                        className: cls.name,
                        method: method
                    });
                }
            });
        });
        return relevantMethods;
    }
    getProjectStats(structure) {
        return {
            totalClasses: structure.classes.length,
            totalMethods: structure.classes.reduce((sum, cls) => sum + cls.methods.length, 0),
            totalFields: structure.classes.reduce((sum, cls) => sum + cls.fields.length, 0),
            springComponents: structure.classes.filter(cls => cls.annotations.some(ann => ann.includes('@Service') ||
                ann.includes('@Controller') ||
                ann.includes('@Repository') ||
                ann.includes('@Component') ||
                ann.includes('@RestController'))).length
        };
    }
    createContextSummary(context) {
        let summary = `Project Statistics:\n`;
        summary += `- Total Classes: ${context.projectStats.totalClasses}\n`;
        summary += `- Total Methods: ${context.projectStats.totalMethods}\n`;
        summary += `- Total Fields: ${context.projectStats.totalFields}\n`;
        summary += `- Spring Components: ${context.projectStats.springComponents}\n\n`;
        if (context.relevantClasses.length > 0) {
            summary += `Relevant Classes:\n`;
            context.relevantClasses.slice(0, 5).forEach((cls) => {
                summary += `- ${cls.name} (${cls.package})\n`;
            });
            if (context.relevantClasses.length > 5) {
                summary += `... and ${context.relevantClasses.length - 5} more classes\n\n`;
            }
        }
        if (context.relevantMethods.length > 0) {
            summary += `Relevant Methods:\n`;
            context.relevantMethods.slice(0, 5).forEach((method) => {
                summary += `- ${method.className}.${method.method.name}()\n`;
            });
            if (context.relevantMethods.length > 5) {
                summary += `... and ${context.relevantMethods.length - 5} more methods\n\n`;
            }
        }
        return summary;
    }
    /**
     * Retrieve real usage examples for a specific method
     */
    async retrieveMethodUsageExamples(className, methodName, structure) {
        return await this.usageScanner.findMethodUsages(className, methodName, structure);
    }
    /**
     * Retrieve usage patterns for a class (how it's typically instantiated/injected)
     */
    async retrieveClassUsagePatterns(className, structure) {
        return await this.usageScanner.findClassUsagePatterns(className, structure);
    }
    /**
     * Enhanced context retrieval that includes real usage examples
     */
    async retrieveEnhancedContext(query, structure, targetClassName) {
        // Get basic context
        const basicContext = await this.retrieveContext(query, structure);
        // Add usage examples if we have a target class
        let usageExamples = [];
        if (targetClassName) {
            usageExamples = await this.retrieveClassUsagePatterns(targetClassName, structure);
        }
        return {
            ...basicContext,
            usageExamples,
            hasRealExamples: usageExamples.length > 0
        };
    }
    /**
     * Create usage examples summary for prompt augmentation
     */
    createUsageExamplesSummary(examples) {
        if (examples.length === 0) {
            return "No real usage examples found in the codebase.";
        }
        const summary = examples.slice(0, 3).map((example, index) => {
            return `
Example ${index + 1} (from ${example.sourceClass}):
${example.codeSnippet}
Context: ${example.context.split('\n')[0]}
            `.trim();
        }).join('\n\n');
        return `Real usage examples from codebase:\n${summary}`;
    }
    /**
     * Enhanced prompt augmentation with usage examples
     */
    async augmentPromptWithUsageExamples(prompt, context, usageExamples) {
        const contextSummary = this.createContextSummary(context);
        const usageExamplesSummary = this.createUsageExamplesSummary(usageExamples);
        const augmentedPrompt = `
Use the following context and real usage examples to enhance your response:

Context:
${contextSummary}

${usageExamplesSummary}

Original request:
${prompt}

Please provide a detailed response that incorporates both the context and real usage examples above.
Focus on practical, real-world usage patterns when available.
        `.trim();
        return augmentedPrompt;
    }
}
exports.RAGService = RAGService;
//# sourceMappingURL=rag_service.js.map