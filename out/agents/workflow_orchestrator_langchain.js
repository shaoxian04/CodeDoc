"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WorkflowOrchestrator = void 0;
const documentation_agent_langchain_1 = require("./documentation_agent_langchain");
const visualization_agent_langchain_1 = require("./visualization_agent_langchain");
const chat_agent_langchain_1 = require("./chat_agent_langchain");
const mcp_service_1 = require("./mcp_service");
class WorkflowOrchestrator {
    documentationAgent;
    visualizationAgent;
    chatAgent;
    mcpService;
    constructor() {
        this.mcpService = new mcp_service_1.MCPService('codedoc-project');
        this.documentationAgent = new documentation_agent_langchain_1.DocumentationAgent();
        this.visualizationAgent = new visualization_agent_langchain_1.VisualizationAgent();
        this.chatAgent = new chat_agent_langchain_1.ChatAgent(this.mcpService);
        // Register agents with MCP
        this.mcpService.registerAgent('DocumentationAgent', this.documentationAgent);
        this.mcpService.registerAgent('VisualizationAgent', this.visualizationAgent);
        this.mcpService.registerAgent('ChatAgent', this.chatAgent);
    }
    async processRequest(context) {
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
        }
        catch (error) {
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
    async generateProjectOverview(structure, userQuery) {
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
        }
        catch (error) {
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
    async generateClassDocumentation(javaClass, relatedClasses = [], userQuery) {
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
        }
        catch (error) {
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
    async generateVisualization(structure, userQuery) {
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
        }
        catch (error) {
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
    async handleChatRequest(userInput, projectContext) {
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
        }
        catch (error) {
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
    async handleProjectOverview(context) {
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
        }
        catch (error) {
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
    async handleClassDocumentation(context) {
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
        }
        catch (error) {
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
    async handleVisualization(context) {
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
        }
        catch (error) {
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
    async handleChat(context) {
        try {
            const result = await this.chatAgent.execute({
                userInput: context.userInput,
                projectContext: context.projectContext
            });
            return {
                success: true,
                data: result
            };
        }
        catch (error) {
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
    async coordinateAgents(task, payload) {
        return await this.mcpService.coordinateTask('WorkflowOrchestrator', task, payload);
    }
    // Wrapper method to update markdown file
    async updateMarkdownFile(structure, existing, relatedFiles = [], relPath) {
        try {
            const result = await this.documentationAgent['updateMarkdownFile'](structure, existing, relatedFiles, relPath);
            return { success: true, data: result };
        }
        catch (error) {
            return {
                success: false,
                error: error instanceof Error ? error.message : 'Unknown error occurred'
            };
        }
    }
}
exports.WorkflowOrchestrator = WorkflowOrchestrator;
//# sourceMappingURL=workflow_orchestrator_langchain.js.map