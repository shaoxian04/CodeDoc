import { ChatOpenAI } from "@langchain/openai";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { PromptTemplate } from "@langchain/core/prompts";
import { Agent } from "./types";
import { ProjectStructure } from "../service/java_parser";
import { RAGService } from "../service/rag_service";
import * as vscode from 'vscode';

export class DocumentationAgent implements Agent {
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
            case 'generateProjectOverview':
                return await this.generateProjectOverview(context.projectStructure, context.userQuery);
            case 'generateClassDocumentation':
                return await this.generateClassDocumentation(context.javaClass, context.relatedClasses, context.userQuery);
            default:
                throw new Error(`Unknown task: ${task}`);
        }
    }

    private async generateProjectOverview(structure: ProjectStructure, userQuery?: string): Promise<string> {
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
            throw new Error(`Failed to generate project overview: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    private async generateClassDocumentation(javaClass: any, relatedClasses: any[] = [], userQuery?: string): Promise<string> {
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
                    relevantMethods: javaClass.methods.map((method: any) => ({
                        className: javaClass.name,
                        method: method
                    })),
                    projectStats: {
                        totalClasses: 1,
                        totalMethods: javaClass.methods.length,
                        totalFields: javaClass.fields.length,
                        springComponents: javaClass.annotations.some((ann: string) => 
                            ann.includes('@Service') || 
                            ann.includes('@Controller') || 
                            ann.includes('@Repository') || 
                            ann.includes('@Component') ||
                            ann.includes('@RestController')
                        ) ? 1 : 0
                    }
                };
                const augmentedPrompt = await this.ragService.augmentPrompt(finalPrompt, context);
                // Use the augmented prompt directly instead of treating it as a template
                finalPrompt = augmentedPrompt;
            }
            
            const promptTemplate = PromptTemplate.fromTemplate(finalPrompt);
            
            const fieldsStr = javaClass.fields.map((f: any) => 
                `- ${f.visibility} ${f.isStatic ? 'static ' : ''}${f.type} ${f.name} ${f.annotations.length > 0 ? '(' + f.annotations.join(', ') + ')' : ''}`
            ).join('\n');
            
            const methodsStr = javaClass.methods.map((m: any) => 
                `- ${m.visibility} ${m.isStatic ? 'static ' : ''}${m.returnType} ${m.name}(${m.parameters.map((p: any) => `${p.type} ${p.name}`).join(', ')}) ${m.annotations.length > 0 ? '(' + m.annotations.join(', ') + ')' : ''}`
            ).join('\n');
            
            const relatedClassesStr = relatedClasses.map((cls: any) => 
                `- ${cls.name} (${cls.package})`
            ).join('\n');
            
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
        } catch (error) {
            if (error instanceof Error && error.message.includes('API key not configured')) {
                throw error; // Re-throw configuration errors
            }
            throw new Error(`Failed to generate class documentation: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

<<<<<<< Updated upstream
=======
    // Update an existing markdown file to reflect the current codebase and related files
    private async updateMarkdownFile(structure: ProjectStructure, existing: string, relatedFiles: Array<{path:string, snippet:string}> = [], relPath?: string): Promise<string> {
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

            const promptTemplate = PromptTemplate.fromTemplate(finalPrompt);
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
        } catch (error) {
            if (error instanceof Error && error.message.includes('API key not configured')) {
                throw error;
            }
            throw new Error(`Failed to update markdown file: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

>>>>>>> Stashed changes
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