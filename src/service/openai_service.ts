import OpenAI from 'openai';
import * as vscode from 'vscode';
import { JavaClass, ProjectStructure, CodeRelationship } from './java_parser';

export class OpenAIService {
    private openai: OpenAI | null = null;
    private currentModel: string = 'gpt-4';
    private maxTokens: number = 2000;
    private temperature: number = 0.3;

    constructor() {
        // We don't initialize the OpenAI client here to avoid requiring API key during extension activation
    }

    private async initializeOpenAI() {
        const config = vscode.workspace.getConfiguration('codedoc');
        const apiKey = config.get<string>('openaiApiKey');
        this.currentModel = config.get<string>('openaiModel', 'gpt-4');
        this.maxTokens = config.get<number>('maxTokens', 2000);
        this.temperature = config.get<number>('temperature', 0.3);
        
        if (apiKey) {
            this.openai = new OpenAI({
                apiKey: apiKey,
            });
        }
    }
    
    public async reinitialize(): Promise<void> {
        await this.initializeOpenAI();
    }

    private ensureInitialized(): void {
        if (!this.openai) {
            throw new Error('OpenAI service not initialized. Please configure your API key.');
        }
    }

    public async generateClassDocumentation(javaClass: JavaClass, relatedClasses: JavaClass[] = []): Promise<string> {
        await this.initializeOpenAI();
        this.ensureInitialized();

        const prompt = this.createClassDocumentationPrompt(javaClass, relatedClasses);
        
        try {
            const response = await this.openai!.chat.completions.create({
                model: this.currentModel,
                messages: [
                    {
                        role: 'system',
                        content: 'You are a technical documentation expert specializing in Java and Spring Framework. Generate clear, comprehensive documentation that explains code structure, relationships, and functionality.'
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                max_tokens: this.maxTokens,
                temperature: this.temperature
            });

            return response.choices[0]?.message?.content || 'No documentation generated';
        } catch (error) {
            console.error('OpenAI API error:', error);
            throw new Error('Failed to generate documentation. Please check your API key and try again.');
        }
    }

    public async generateProjectOverview(structure: ProjectStructure): Promise<string> {
        await this.initializeOpenAI();
        this.ensureInitialized();

        const prompt = this.createProjectOverviewPrompt(structure);

        try {
            const response = await this.openai!.chat.completions.create({
                model: this.currentModel,
                messages: [
                    {
                        role: 'system',
                        content: 'You are a senior software architect. Analyze the project structure and provide a high-level overview of the system architecture, key components, and how they interact.'
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                max_tokens: this.maxTokens,
                temperature: this.temperature
            });

            return response.choices[0]?.message?.content || 'No overview generated';
        } catch (error) {
            console.error('OpenAI API error:', error);
            throw new Error('Failed to generate project overview');
        }
    }

    public async generateCodeExplanation(code: string, fileName: string): Promise<string> {
        await this.initializeOpenAI();
        this.ensureInitialized();

        const prompt = this.createCodeExplanationPrompt(code, fileName);

        try {
            const response = await this.openai!.chat.completions.create({
                model: this.currentModel,
                messages: [
                    {
                        role: 'system',
                        content: 'You are a technical documentation expert specializing in Java and Spring Framework. Generate clear, comprehensive documentation that explains code structure, relationships, and functionality.'
                    },
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                max_tokens: this.maxTokens,
                temperature: this.temperature
            });

            return response.choices[0]?.message?.content || 'No documentation generated';
        } catch (error) {
            console.error('OpenAI API error:', error);
            throw new Error('Failed to generate documentation. Please check your API key and try again.');
        }
    }

    public async answerCodeQuestion(question: string, context: ProjectStructure): Promise<string> {
        await this.initializeOpenAI();
        this.ensureInitialized();

        const contextPrompt = this.createContextPrompt(context);
        const fullPrompt = `${contextPrompt}\n\nQuestion: ${question}`;

        try {
            const response = await this.openai!.chat.completions.create({
                model: this.currentModel,
                messages: [
                    {
                        role: 'system',
                        content: 'You are a senior Java/Spring developer helping with code understanding. Answer questions about the codebase structure, relationships, and functionality. Be specific and reference actual classes and methods when possible.'
                    },
                    {
                        role: 'user',
                        content: fullPrompt
                    }
                ],
                max_tokens: Math.min(this.maxTokens, 1000),
                temperature: this.temperature
            });

            return response.choices[0]?.message?.content || 'No answer generated';
        } catch (error) {
            console.error('OpenAI API error:', error);
            throw new Error('Failed to get answer');
        }
    }

    private createCodeExplanationPrompt(code: string, fileName: string): string {
        let prompt = `Generate comprehensive documentation for this Java code:\n\n`;
        
        prompt += `File: ${fileName}\n\n`;
        prompt += `Code:\n\`\`\`java\n${code}\n\`\`\`\n\n`;

        prompt += `Please provide:\n`;
        prompt += `1. A clear description of the code purpose and responsibility\n`;
        prompt += `2. Explanation of key methods and their functionality (if applicable)\n`;
        prompt += `3. Any Spring Framework specific patterns or annotations used\n`;
        prompt += `4. Dependencies and relationships with other components (if identifiable)\n`;
        prompt += `5. Usage examples if applicable\n\n`;
        
        prompt += `Format the response in clear text with appropriate headers and sections.`;

        return prompt;
    }

    private createClassDocumentationPrompt(javaClass: JavaClass, relatedClasses: JavaClass[]): string {
        let prompt = `Generate comprehensive documentation for this Java class:\n\n`;
        
        prompt += `Class: ${javaClass.name}\n`;
        prompt += `Package: ${javaClass.package}\n`;
        prompt += `File: ${javaClass.filePath}\n\n`;

        if (javaClass.annotations.length > 0) {
            prompt += `Annotations:\n${javaClass.annotations.join('\n')}\n\n`;
        }

        if (javaClass.extends) {
            prompt += `Extends: ${javaClass.extends}\n`;
        }

        if (javaClass.implements.length > 0) {
            prompt += `Implements: ${javaClass.implements.join(', ')}\n\n`;
        }

        if (javaClass.fields.length > 0) {
            prompt += `Fields:\n`;
            javaClass.fields.forEach(field => {
                prompt += `- ${field.visibility} ${field.isStatic ? 'static ' : ''}${field.type} ${field.name}`;
                if (field.annotations.length > 0) {
                    prompt += ` (${field.annotations.join(', ')})`;
                }
                prompt += '\n';
            });
            prompt += '\n';
        }

        if (javaClass.methods.length > 0) {
            prompt += `Methods:\n`;
            javaClass.methods.forEach(method => {
                prompt += `- ${method.visibility} ${method.isStatic ? 'static ' : ''}${method.returnType} ${method.name}(`;
                prompt += method.parameters.map(p => `${p.type} ${p.name}`).join(', ');
                prompt += ')';
                if (method.annotations.length > 0) {
                    prompt += ` (${method.annotations.join(', ')})`;
                }
                prompt += '\n';
            });
            prompt += '\n';
        }

        if (relatedClasses.length > 0) {
            prompt += `Related Classes:\n`;
            relatedClasses.forEach(related => {
                prompt += `- ${related.name} (${related.package})\n`;
            });
            prompt += '\n';
        }

        prompt += `Please provide:\n`;
        prompt += `1. A clear description of the class purpose and responsibility\n`;
        prompt += `2. Explanation of key methods and their functionality\n`;
        prompt += `3. How this class fits into the overall system architecture\n`;
        prompt += `4. Any Spring Framework specific patterns or annotations used\n`;
        prompt += `5. Dependencies and relationships with other components\n`;
        prompt += `6. Usage examples if applicable\n\n`;
        
        prompt += `Format the response in clear text with appropriate headers and sections.`;

        return prompt;
    }

    private createProjectOverviewPrompt(structure: ProjectStructure): string {
        let prompt = `Analyze this Java/Spring project structure:\n\n`;

        prompt += `Total Classes: ${structure.classes.length}\n\n`;
        const packageGroups: { [key: string]: JavaClass[] } = {};
        structure.classes.forEach(cls => {
            const pkg = cls.package || 'default';
            if (!packageGroups[pkg]) {
                packageGroups[pkg] = [];
            }
            packageGroups[pkg].push(cls);
        });

        prompt += `Packages:\n`;
        Object.entries(packageGroups).forEach(([pkg, classes]) => {
            prompt += `- ${pkg}: ${classes.length} classes\n`;
        });
        prompt += '\n';
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
            prompt += `Spring Components:\n`;
            springComponents.forEach(comp => {
                const springAnns = comp.annotations.filter(ann => 
                    ann.includes('@Service') || 
                    ann.includes('@Controller') || 
                    ann.includes('@Repository') || 
                    ann.includes('@Component') ||
                    ann.includes('@RestController')
                );
                prompt += `- ${comp.name}: ${springAnns.join(', ')}\n`;
            });
            prompt += '\n';
        }
        prompt += `Relationships:\n`;
        const relationshipCounts = structure.relationships.reduce((acc, rel) => {
            acc[rel.type] = (acc[rel.type] || 0) + 1;
            return acc;
        }, {} as { [key: string]: number });

        Object.entries(relationshipCounts).forEach(([type, count]) => {
            prompt += `- ${type}: ${count} connections\n`;
        });

        prompt += '\nDetailed Dependencies:\n';
        const relationshipsBySource: { [key: string]: CodeRelationship[] } = {};
        structure.relationships.forEach(rel => {
            if (!relationshipsBySource[rel.from]) {
                relationshipsBySource[rel.from] = [];
            }
            relationshipsBySource[rel.from].push(rel);
        });
        Object.entries(relationshipsBySource).forEach(([source, relationships]) => {
            prompt += `\n${source} dependencies:\n`;
            relationships.forEach(rel => {
                prompt += `  - ${rel.type} ${rel.to}`;
                if (rel.method) {
                    prompt += ` (via ${rel.method})`;
                }
                prompt += '\n';
            });
        });

        prompt += `\nPlease provide a comprehensive project overview with the following sections:\n`;
        prompt += `1. Overall system architecture description\n`;
        prompt += `2. Key layers and their responsibilities (Controller, Service, Repository, etc.)\n`;
        prompt += `3. Main data flow and component interactions\n`;
        prompt += `4. Spring Framework patterns being used\n`;
        prompt += `5. Technology stack insights based on the structure\n`;
        prompt += `6. Detailed analysis of module dependencies and interactions\n`;
        prompt += `7. Entity Relationship Diagrams (ERD) and simple class diagrams showing key relationships in a readable format like ASCII or markdown\n`;
        prompt += `8. A detailed request lifecycle walkthrough, tracing a sample flow like 'create account' from Controller → Service → Repository → Database\n`;
        prompt += `9. Unified explanation of technical terms and framework patterns\n`;
        prompt += `10. Potential areas for improvement or refactoring (at the end)\n`;

        return prompt;
    }

    private createContextPrompt(structure: ProjectStructure): string {
        let context = `Current project context:\n\n`;
        
        context += `Classes (${structure.classes.length}):\n`;
        structure.classes.forEach(cls => {
            context += `- ${cls.name} (${cls.package}): `;
            const springAnns = cls.annotations.filter(ann => 
                ann.includes('@Service') || ann.includes('@Controller') || 
                ann.includes('@Repository') || ann.includes('@Component') ||
                ann.includes('@RestController')
            );
            if (springAnns.length > 0) {
                context += springAnns.join(', ') + ' - ';
            }
            context += `${cls.methods.length} methods, ${cls.fields.length} fields`;
            if (cls.isController && cls.endpoints && cls.endpoints.length > 0) {
                context += `, ${cls.endpoints.length} endpoints`;
                context += ` (${cls.endpoints.map(e => `${e.httpMethod} ${e.path}`).join(', ')})`;
            }
            context += '\n';
        });

        context += `\nKey Relationships:\n`;
        structure.relationships.forEach(rel => {
            context += `- ${rel.from} ${rel.type} ${rel.to}`;
            if (rel.method) {
                context += ` (via ${rel.method})`;
            }
            context += '\n';
        });
        
        context += `\nDependency Matrix:\n`;
        const dependencyMap: { [key: string]: Set<string> } = {};
        structure.classes.forEach(cls => {
            dependencyMap[cls.name] = new Set();
        });
        structure.relationships.forEach(rel => {
            if (dependencyMap[rel.from]) {
                dependencyMap[rel.from].add(rel.to);
            }
        });
        Object.entries(dependencyMap).forEach(([className, dependencies]) => {
            if (dependencies.size > 0) {
                context += `${className} -> [${Array.from(dependencies).join(', ')}]\n`;
            }
        });

        return context;
    }
}