import { ProjectStructure, JavaClass } from './java_parser';
import { StringOutputParser } from "@langchain/core/output_parsers";
import { PromptTemplate } from "@langchain/core/prompts";
import { UsageScanner, UsageExample } from './usage_scanner';
import * as vscode from 'vscode';

// We'll import ChatOpenAI only when needed to avoid early validation
let ChatOpenAI: any;

export class RAGService {
    private model: any | null = null;
    private outputParser: StringOutputParser;
    private usageScanner: UsageScanner;

    constructor() {
        this.outputParser = new StringOutputParser();
        this.usageScanner = new UsageScanner();
        // We don't initialize the model here to avoid requiring API key during extension activation
    }

    private async initializeModel() {
        // Lazy import to avoid early validation
        if (!ChatOpenAI) {
            const langchainOpenAI = await import("@langchain/openai");
            ChatOpenAI = langchainOpenAI.ChatOpenAI;
        }

        if (this.model) {
            return this.model;
        }

        // Get configuration
        const config = vscode.workspace.getConfiguration('codedoc');
        const apiKey = config.get<string>('openaiApiKey');
        const modelName = config.get<string>('openaiModel', 'gpt-4');
        const maxTokens = config.get<number>('maxTokens', 1000);
        const temperature = config.get<number>('temperature', 0.3);

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
    public async retrieveContext(query: string, structure: ProjectStructure): Promise<any> {
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
    public async augmentPrompt(prompt: string, context: any): Promise<string> {
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

    private extractKeywords(query: string): string[] {
        // Simple keyword extraction
        // In a more advanced implementation, this could use NLP techniques
        return query.toLowerCase().split(/\s+/).filter(word => word.length > 3);
    }

    private findRelevantClasses(keywords: string[], structure: ProjectStructure): JavaClass[] {
        return structure.classes.filter(cls => {
            const classText = `${cls.name} ${cls.package} ${cls.annotations.join(' ')}`.toLowerCase();
            return keywords.some(keyword => classText.includes(keyword));
        });
    }

    private findRelevantMethods(keywords: string[], structure: ProjectStructure): any[] {
        const relevantMethods: any[] = [];
        
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

    private getProjectStats(structure: ProjectStructure): any {
        return {
            totalClasses: structure.classes.length,
            totalMethods: structure.classes.reduce((sum, cls) => sum + cls.methods.length, 0),
            totalFields: structure.classes.reduce((sum, cls) => sum + cls.fields.length, 0),
            springComponents: structure.classes.filter(cls => 
                cls.annotations.some(ann => 
                    ann.includes('@Service') || 
                    ann.includes('@Controller') || 
                    ann.includes('@Repository') || 
                    ann.includes('@Component') ||
                    ann.includes('@RestController')
                )
            ).length
        };
    }

    private createContextSummary(context: any): string {
        let summary = `Project Statistics:\n`;
        summary += `- Total Classes: ${context.projectStats.totalClasses}\n`;
        summary += `- Total Methods: ${context.projectStats.totalMethods}\n`;
        summary += `- Total Fields: ${context.projectStats.totalFields}\n`;
        summary += `- Spring Components: ${context.projectStats.springComponents}\n\n`;
        
        if (context.relevantClasses.length > 0) {
            summary += `Relevant Classes:\n`;
            context.relevantClasses.slice(0, 5).forEach((cls: JavaClass) => {
                summary += `- ${cls.name} (${cls.package})\n`;
            });
            if (context.relevantClasses.length > 5) {
                summary += `... and ${context.relevantClasses.length - 5} more classes\n\n`;
            }
        }
        
        if (context.relevantMethods.length > 0) {
            summary += `Relevant Methods:\n`;
            context.relevantMethods.slice(0, 5).forEach((method: any) => {
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
    public async retrieveMethodUsageExamples(
        className: string,
        methodName: string,
        structure: ProjectStructure
    ): Promise<UsageExample[]> {
        return await this.usageScanner.findMethodUsages(className, methodName, structure);
    }

    /**
     * Retrieve usage patterns for a class (how it's typically instantiated/injected)
     */
    public async retrieveClassUsagePatterns(
        className: string,
        structure: ProjectStructure
    ): Promise<UsageExample[]> {
        return await this.usageScanner.findClassUsagePatterns(className, structure);
    }

    /**
     * Enhanced context retrieval that includes real usage examples
     */
    public async retrieveEnhancedContext(
        query: string, 
        structure: ProjectStructure,
        targetClassName?: string
    ): Promise<any> {
        // Get basic context
        const basicContext = await this.retrieveContext(query, structure);
        
        // Add usage examples if we have a target class
        let usageExamples: UsageExample[] = [];
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
    public createUsageExamplesSummary(examples: UsageExample[]): string {
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
    public async augmentPromptWithUsageExamples(
        prompt: string,
        context: any,
        usageExamples: UsageExample[]
    ): Promise<string> {
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