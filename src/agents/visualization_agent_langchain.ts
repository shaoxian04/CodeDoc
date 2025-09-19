import { ChatOpenAI } from "@langchain/openai";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { PromptTemplate } from "@langchain/core/prompts";
import { Agent } from "./types";
import { JavaParser, ProjectStructure } from "../service/java_parser";
import { RAGService } from "../service/rag_service";
import * as vscode from 'vscode';

export class VisualizationAgent implements Agent {
    private model: ChatOpenAI | null = null;
    private outputParser: StringOutputParser;
    private ragService: RAGService;

    constructor() {
        this.outputParser = new StringOutputParser();
        this.ragService = new RAGService();
        // We don't initialize the model here to avoid requiring API key during extension activation
    }

    private initializeModel(): ChatOpenAI {
        if (this.model) {
            return this.model;
        }

        // Get configuration
        const config = vscode.workspace.getConfiguration('codedoc');
        const apiKey = config.get<string>('openaiApiKey');
        const modelName = config.get<string>('openaiModel', 'gpt-4');
        const maxTokens = config.get<number>('maxTokens', 500); // Reduced from 2000 to 500 for concise responses
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

    async execute(context: any): Promise<any> {
        const task = context.task;
        
        switch (task) {
            case 'generateArchitectureDiagram':
                return await this.generateArchitectureDescription(context.projectStructure, context.userQuery);
            default:
                throw new Error(`Unknown task: ${task}`);
        }
    }

    private async generateArchitectureDescription(structure: ProjectStructure, userQuery?: string): Promise<string> {
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
            const javaParser = new JavaParser();
            
            // Create a prompt for generating architecture description
            const promptTemplate = PromptTemplate.fromTemplate(finalPrompt);
            
            // Convert structure to a readable format for the LLM
            const structureSummary = this.createStructureSummary(structure);
            
            const chain = promptTemplate.pipe(model).pipe(this.outputParser);
            const result = await chain.invoke({ structure: structureSummary });
            
            return result;
        } catch (error) {
            if (error instanceof Error && error.message.includes('API key not configured')) {
                throw error; // Re-throw configuration errors
            }
            throw new Error(`Failed to generate architecture description: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    private createStructureSummary(structure: ProjectStructure): string {
        let summary = `Total Classes: ${structure.classes.length}\n\n`;
        
        // Group classes by package
        const packageGroups: { [key: string]: any[] } = {};
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
        const springComponents = structure.classes.filter(cls => 
            cls.annotations.some(ann => 
                ann.includes('@Service') || 
                ann.includes('@Controller') || 
                ann.includes('@Repository') || 
                ann.includes('@Component') ||
                ann.includes('@RestController')
            )
        );
        
        if (springComponents.length > 0) {
            summary += "\nSpring Components:\n";
            springComponents.forEach(comp => {
                const springAnns = comp.annotations.filter(ann => 
                    ann.includes('@Service') || 
                    ann.includes('@Controller') || 
                    ann.includes('@Repository') || 
                    ann.includes('@Component') ||
                    ann.includes('@RestController')
                );
                summary += `- ${comp.name}: ${springAnns.join(', ')}\n`;
            });
        }
        
        // Add relationships
        summary += `\nKey Relationships:\n`;
        const relationshipCounts = structure.relationships.reduce((acc, rel) => {
            acc[rel.type] = (acc[rel.type] || 0) + 1;
            return acc;
        }, {} as { [key: string]: number });
        
        Object.entries(relationshipCounts).forEach(([type, count]) => {
            summary += `- ${type}: ${count} connections\n`;
        });
        
        return summary;
    }
}