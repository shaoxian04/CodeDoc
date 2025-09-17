import { BaseMessage, HumanMessage, SystemMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { AgentContext, AgentResponse } from './types';
import { StringOutputParser } from "@langchain/core/output_parsers";
import { PromptTemplate } from "@langchain/core/prompts";

export class DocumentationAgent {
    name = 'Documentation Agent';
    description = 'Generates project and class documentation using Langchain';
    
    private llm: ChatOpenAI;
    private outputParser: StringOutputParser;

    constructor(apiKey?: string) {
        // Initialize Langchain components
        this.llm = new ChatOpenAI({ 
            modelName: "gpt-4", 
            temperature: 0.3,
            openAIApiKey: apiKey || process.env.OPENAI_API_KEY
        });
        this.outputParser = new StringOutputParser();
    }

    async execute(context: AgentContext): Promise<AgentResponse> {
        // Determine what type of documentation to generate based on context
        if (context.userQuery?.toLowerCase().includes('project overview') || 
            context.userQuery?.toLowerCase().includes('project documentation')) {
            return await this.generateProjectOverview();
        } else if (context.selectedCode) {
            return await this.generateClassDocumentation(context.selectedCode, context.filePath);
        } else {
            // Default to project overview if no specific context
            return await this.generateProjectOverview();
        }
    }

    private async generateProjectOverview(): Promise<AgentResponse> {
        try {
            // In a full implementation, we would retrieve the actual project structure
            // For now, we'll simulate this with a placeholder
            const projectStructure = await this.retrieveProjectContext();
            
            const prompt = PromptTemplate.fromTemplate(`
                You are a senior software architect. Analyze the following Java/Spring project structure and provide a comprehensive project overview.
                
                Project Structure:
                {projectStructure}
                
                Please provide a comprehensive project overview with the following sections:
                1. Overall system architecture description
                2. Key layers and their responsibilities (Controller, Service, Repository, etc.)
                3. Main data flow and component interactions
                4. Spring Framework patterns being used
                5. Technology stack insights based on the structure
                6. Detailed analysis of module dependencies and interactions
                7. Entity Relationship Diagrams (ERD) and simple class diagrams showing key relationships in a readable format like ASCII or markdown
                8. A detailed request lifecycle walkthrough, tracing a sample flow like 'create account' from Controller → Service → Repository → Database
                9. Unified explanation of technical terms and framework patterns
                10. Potential areas for improvement or refactoring (at the end)
            `);
            
            const chain = prompt.pipe(this.llm).pipe(this.outputParser);
            const response = await chain.invoke({ projectStructure });
            
            return {
                content: response,
                type: 'documentation',
                action: 'generate_docs',
                metadata: {
                    timestamp: new Date().toISOString(),
                    context: 'project_overview'
                }
            };
        } catch (error: any) {
            console.error('Error generating project overview:', error);
            return {
                content: `Error generating project overview: ${error.message}`,
                type: 'documentation',
                action: 'generate_docs'
            };
        }
    }

    private async generateClassDocumentation(code: string, fileName?: string): Promise<AgentResponse> {
        try {
            if (!code.trim()) {
                return {
                    content: 'No code provided for documentation.',
                    type: 'documentation',
                    action: 'generate_docs'
                };
            }

            const prompt = PromptTemplate.fromTemplate(`
                You are a technical documentation expert specializing in Java and Spring Framework. 
                Generate clear, comprehensive documentation for the following Java code:
                
                File: {fileName}
                
                Code:
                {code}
                
                Please provide:
                1. A clear description of the code purpose and responsibility
                2. Explanation of key methods and their functionality (if applicable)
                3. Any Spring Framework specific patterns or annotations used
                4. Dependencies and relationships with other components (if identifiable)
                5. Usage examples if applicable
            `);
            
            const chain = prompt.pipe(this.llm).pipe(this.outputParser);
            const response = await chain.invoke({ fileName: fileName || 'Unknown', code });
            
            return {
                content: response,
                type: 'documentation',
                action: 'generate_docs',
                metadata: {
                    fileName: fileName,
                    timestamp: new Date().toISOString(),
                    context: 'class_documentation'
                }
            };
        } catch (error: any) {
            console.error('Error generating class documentation:', error);
            return {
                content: `Error generating class documentation: ${error.message}`,
                type: 'documentation',
                action: 'generate_docs'
            };
        }
    }

    public async exportDocumentation(content: string): Promise<AgentResponse> {
        try {
            // This method would be called when user wants to export documentation
            return {
                content: content,
                type: 'documentation',
                action: 'export_docs'
            };
        } catch (error: any) {
            console.error('Error exporting documentation:', error);
            return {
                content: `Error exporting documentation: ${error.message}`,
                type: 'documentation',
                action: 'export_docs'
            };
        }
    }

    private async retrieveProjectContext(): Promise<string> {
        // This is a placeholder for the actual project context retrieval
        // In a full implementation, this would use RAG to retrieve relevant project information
        return `{
            "totalClasses": 15,
            "packages": [
                "com.example.controller",
                "com.example.service",
                "com.example.repository",
                "com.example.model"
            ],
            "springComponents": [
                {"name": "UserController", "type": "Controller"},
                {"name": "UserService", "type": "Service"},
                {"name": "UserRepository", "type": "Repository"}
            ],
            "dependencies": [
                {"from": "UserController", "to": "UserService", "type": "calls"},
                {"from": "UserService", "to": "UserRepository", "type": "injects"}
            ]
        }`;
    }
}