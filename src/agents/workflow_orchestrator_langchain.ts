import { DocumentationAgent } from "./documentation_agent_langchain";
import { VisualizationAgent } from "./visualization_agent_langchain";
import { ChatAgent } from "./chat_agent_langchain";
import { AgentContext, AgentResponse } from "./types";
import { ProjectStructure } from "../service/java_parser";
import { MCPService, AgentMessage } from "./mcp_service";

export class WorkflowOrchestrator {
    private documentationAgent: DocumentationAgent;
    private visualizationAgent: VisualizationAgent;
    private chatAgent: ChatAgent;
    private mcpService: MCPService;

    constructor() {
        this.mcpService = new MCPService('codedoc-project');
        this.documentationAgent = new DocumentationAgent();
        this.visualizationAgent = new VisualizationAgent();
        this.chatAgent = new ChatAgent(this.mcpService);
        
        // Register agents with MCP
        this.mcpService.registerAgent('DocumentationAgent', this.documentationAgent);
        this.mcpService.registerAgent('VisualizationAgent', this.visualizationAgent);
        this.mcpService.registerAgent('ChatAgent', this.chatAgent);
    }

    async processRequest(context: AgentContext): Promise<AgentResponse> {
        try {
            switch (context.requestType) {
                case 'generateProjectOverview':
                    return await this.handleProjectOverview(context);
                    
                case 'generateClassDocumentation':
                    return await this.handleClassDocumentation(context);
                    
                case 'generateVisualization':
                    return await this.handleVisualization(context);
                    
                case 'chat':
                    return await this.handleChat(context);
                    
                default:
                    return {
                        success: false,
                        error: `Unknown request type: ${context.requestType}`
                    };
            }
        } catch (error) {
            if (error instanceof Error && error.message.includes('API key not configured')) {
                return {
                    success: false,
                    error: 'OpenAI API key not configured. Please configure it in the settings.'
                };
            }
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error occurred'
            };
        }
    }

    // Direct access to documentation agent for project overview
    async generateProjectOverview(structure: ProjectStructure, userQuery?: string): Promise<AgentResponse> {
        try {
            const result = await this.documentationAgent.execute({
                task: 'generateProjectOverview',
                projectStructure: structure,
                userQuery: userQuery
            });
            
            return {
                success: true,
                data: result
            };
        } catch (error) {
            if (error instanceof Error && error.message.includes('API key not configured')) {
                return {
                    success: false,
                    error: 'OpenAI API key not configured. Please configure it in the settings.'
                };
            }
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to generate project overview'
            };
        }
    }

    // Direct access to documentation agent for class documentation
    async generateClassDocumentation(javaClass: any, relatedClasses: any[] = [], userQuery?: string): Promise<AgentResponse> {
        try {
            const result = await this.documentationAgent.execute({
                task: 'generateClassDocumentation',
                javaClass: javaClass,
                relatedClasses: relatedClasses,
                userQuery: userQuery
            });
            
            return {
                success: true,
                data: result
            };
        } catch (error) {
            if (error instanceof Error && error.message.includes('API key not configured')) {
                return {
                    success: false,
                    error: 'OpenAI API key not configured. Please configure it in the settings.'
                };
            }
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to generate class documentation'
            };
        }
    }

    // Direct access to visualization agent
    async generateVisualization(structure: ProjectStructure, userQuery?: string): Promise<AgentResponse> {
        try {
            const result = await this.visualizationAgent.execute({
                task: 'generateArchitectureDiagram',
                projectStructure: structure,
                userQuery: userQuery
            });
            
            return {
                success: true,
                data: result
            };
        } catch (error) {
            if (error instanceof Error && error.message.includes('API key not configured')) {
                return {
                    success: false,
                    error: 'OpenAI API key not configured. Please configure it in the settings.'
                };
            }
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to generate visualization'
            };
        }
    }

    // Handle chat requests through the chat agent
    async handleChatRequest(userInput: string, projectContext: any): Promise<AgentResponse> {
        console.log('WorkflowOrchestrator handleChatRequest called with:', { userInput, projectContext });
        try {
            const result = await this.chatAgent.execute({
                userInput: userInput,
                projectContext: projectContext
            });
            console.log('Chat agent result:', result);
            
            return {
                success: true,
                data: result
            };
        } catch (error) {
            console.log('Error in handleChatRequest:', error);
            if (error instanceof Error && error.message.includes('API key not configured')) {
                return {
                    success: false,
                    error: 'OpenAI API key not configured. Please configure it in the settings.'
                };
            }
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to process chat request'
            };
        }
    }

    private async handleProjectOverview(context: AgentContext): Promise<AgentResponse> {
        try {
            const result = await this.documentationAgent.execute({
                task: 'generateProjectOverview',
                projectStructure: context.projectStructure,
                userQuery: context.userQuery
            });
            
            return {
                success: true,
                data: result
            };
        } catch (error) {
            if (error instanceof Error && error.message.includes('API key not configured')) {
                return {
                    success: false,
                    error: 'OpenAI API key not configured. Please configure it in the settings.'
                };
            }
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to generate project overview'
            };
        }
    }

    private async handleClassDocumentation(context: AgentContext): Promise<AgentResponse> {
        try {
            const result = await this.documentationAgent.execute({
                task: 'generateClassDocumentation',
                javaClass: context.javaClass,
                relatedClasses: context.relatedClasses || [],
                userQuery: context.userQuery
            });
            
            return {
                success: true,
                data: result
            };
        } catch (error) {
            if (error instanceof Error && error.message.includes('API key not configured')) {
                return {
                    success: false,
                    error: 'OpenAI API key not configured. Please configure it in the settings.'
                };
            }
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to generate class documentation'
            };
        }
    }

    private async handleVisualization(context: AgentContext): Promise<AgentResponse> {
        try {
            const result = await this.visualizationAgent.execute({
                task: 'generateArchitectureDiagram',
                projectStructure: context.projectStructure,
                userQuery: context.userQuery
            });
            
            return {
                success: true,
                data: result
            };
        } catch (error) {
            if (error instanceof Error && error.message.includes('API key not configured')) {
                return {
                    success: false,
                    error: 'OpenAI API key not configured. Please configure it in the settings.'
                };
            }
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to generate visualization'
            };
        }
    }

    private async handleChat(context: AgentContext): Promise<AgentResponse> {
        try {
            const result = await this.chatAgent.execute({
                userInput: context.userInput,
                projectContext: context.projectContext
            });
            
            return {
                success: true,
                data: result
            };
        } catch (error) {
            if (error instanceof Error && error.message.includes('API key not configured')) {
                return {
                    success: false,
                    error: 'OpenAI API key not configured. Please configure it in the settings.'
                };
            }
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Failed to process chat request'
            };
        }
    }

    // MCP coordination method
    async coordinateAgents(task: string, payload: any): Promise<any> {
        return await this.mcpService.coordinateTask('WorkflowOrchestrator', task, payload);
    }
}