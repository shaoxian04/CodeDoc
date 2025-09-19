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
exports.ChatAgent = void 0;
const output_parsers_1 = require("@langchain/core/output_parsers");
const prompts_1 = require("@langchain/core/prompts");
const mcp_service_1 = require("./mcp_service");
const rag_service_1 = require("../service/rag_service");
const vscode = __importStar(require("vscode"));
// We'll import ChatOpenAI only when needed to avoid early validation
let ChatOpenAI;
class ChatAgent {
    model = null;
    outputParser;
    mcpService;
    ragService;
    constructor(mcpService) {
        this.outputParser = new output_parsers_1.StringOutputParser();
        this.mcpService = mcpService || new mcp_service_1.MCPService('codedoc-project');
        this.ragService = new rag_service_1.RAGService();
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
        const maxTokens = config.get('maxTokens', 500); // Reduced from 2000 to 500 for concise responses
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
    async execute(context) {
        const userInput = context.userInput;
        const projectContext = context.projectContext;
        console.log('ChatAgent execute called with:', { userInput, projectContext });
        // First, determine what the user wants to do
        const intent = await this.determineIntent(userInput, projectContext);
        console.log('Determined intent:', intent);
        // Based on intent, route to appropriate agent or handle directly
        switch (intent.action) {
            case 'generateDocumentation':
                return await this.delegateToDocumentationAgent(userInput, projectContext, intent.details);
            case 'generateVisualization':
                return await this.delegateToVisualizationAgent(userInput, projectContext, intent.details);
            case 'answerQuestion':
                return await this.answerQuestion(userInput, projectContext);
            default:
                return {
                    action: 'clarify',
                    message: 'I\'m not sure what you want to do. You can ask me to generate documentation, create visualizations, or answer questions about your code.',
                    details: intent.details
                };
        }
    }
    async determineIntent(userInput, projectContext) {
        try {
            const model = await this.initializeModel();
            const promptTemplate = prompts_1.PromptTemplate.fromTemplate(`
                Analyze the user's request and determine their intent:
                
                User Request: {userInput}
                
                Project Context: {projectContext}
                
                Possible intents:
                1. generateDocumentation - User wants to generate documentation (project overview or specific class documentation)
                2. generateVisualization - User wants to create a visualization/diagram
                3. answerQuestion - User has a question about the codebase
                4. unknown - Unclear what the user wants
                
                Special patterns to recognize:
                - Requests containing "generate document" or "generate documentation" with a class name (e.g., "generate document for SchoolController") should be classified as generateDocumentation
                - Requests containing "create diagram" or "visualize" should be classified as generateVisualization
                - General questions about code should be classified as answerQuestion
                
                Respond with JSON in this format:
                {{\n  "action": "generateDocumentation|generateVisualization|answerQuestion|unknown",\n  "details": "any relevant details about the request"\n}}
            `);
            const chain = promptTemplate.pipe(model).pipe(this.outputParser);
            const result = await chain.invoke({
                userInput: userInput,
                projectContext: JSON.stringify(projectContext, null, 2)
            });
            console.log('LLM Intent Result:', result);
            try {
                // Remove markdown code block formatting if present
                let cleanResult = result;
                if (cleanResult.startsWith('```json')) {
                    cleanResult = cleanResult.substring(7);
                }
                if (cleanResult.startsWith('```')) {
                    cleanResult = cleanResult.substring(3);
                }
                if (cleanResult.endsWith('```')) {
                    cleanResult = cleanResult.substring(0, cleanResult.length - 3);
                }
                cleanResult = cleanResult.trim();
                const parsedResult = JSON.parse(cleanResult);
                console.log('Parsed Intent Result:', parsedResult);
                return parsedResult;
            }
            catch (e) {
                // If parsing fails, return a default response
                console.log('Failed to parse LLM result, returning unknown intent');
                return {
                    action: 'unknown',
                    details: 'Could not determine intent'
                };
            }
        }
        catch (error) {
            console.log('Error determining intent:', error);
            if (error instanceof Error && error.message.includes('API key not configured')) {
                throw error; // Re-throw configuration errors
            }
            // If we can't determine intent due to other errors, default to unknown
            return {
                action: 'unknown',
                details: 'Could not determine intent due to an error'
            };
        }
    }
    async delegateToDocumentationAgent(userInput, projectContext, details) {
        console.log('delegateToDocumentationAgent called with:', { userInput, projectContext, details });
        // Use RAG to retrieve relevant context
        let context = null;
        if (projectContext && projectContext.projectStructure) {
            context = await this.ragService.retrieveContext(userInput, projectContext.projectStructure);
        }
        // Determine if this is a request for a specific class
        const classMatch = userInput.match(/(?:generate\s+(?:document|documentation)\s+(?:for\s+)?(\w+))|(?:document\s+(?:for\s+)?(\w+))/i);
        console.log('Class match result:', classMatch);
        if (classMatch) {
            // This is a request for class documentation
            const className = classMatch[1] || classMatch[2];
            console.log('Identified class name:', className);
            // Find the class in the project structure
            if (projectContext && projectContext.projectStructure) {
                console.log('Project structure classes:', projectContext.projectStructure.classes.map((cls) => cls.name));
                const javaClass = projectContext.projectStructure.classes.find((cls) => cls.name === className);
                console.log('Found class:', javaClass);
                if (javaClass) {
                    // Find related classes (dependencies)
                    const relatedClasses = projectContext.projectStructure.classes.filter((cls) => javaClass.dependencies.includes(cls.name) ||
                        projectContext.projectStructure.relationships.some((rel) => (rel.from === javaClass.name && rel.to === cls.name) ||
                            (rel.to === javaClass.name && rel.from === cls.name)));
                    // Create MCP message to delegate to Documentation Agent for class documentation
                    const message = {
                        id: this.generateMessageId(),
                        from: 'ChatAgent',
                        to: 'DocumentationAgent',
                        type: 'generate_documentation',
                        content: {
                            task: 'generateClassDocumentation',
                            javaClass: javaClass,
                            relatedClasses: relatedClasses,
                            userQuery: `Generate documentation for class ${className}`,
                            ragContext: context
                        },
                        timestamp: new Date()
                    };
                    try {
                        // Send message via MCP
                        const response = await this.mcpService.sendMessage(message);
                        console.log('Documentation agent response:', response);
                        return {
                            action: 'generateDocumentation',
                            message: `I've generated the documentation for class ${className}.`,
                            details: details,
                            data: response // The response is already the documentation content
                        };
                    }
                    catch (error) {
                        console.log('Error generating documentation:', error);
                        return {
                            action: 'error',
                            message: `Failed to generate documentation for class ${className}: ${error instanceof Error ? error.message : 'Unknown error'}`,
                            details: details
                        };
                    }
                }
                else {
                    return {
                        action: 'error',
                        message: `Could not find class ${className} in the project.`,
                        details: details
                    };
                }
            }
        }
        // Default to project overview documentation
        // Create MCP message to delegate to Documentation Agent
        const message = {
            id: this.generateMessageId(),
            from: 'ChatAgent',
            to: 'DocumentationAgent',
            type: 'generate_documentation',
            content: {
                task: 'generateProjectOverview',
                projectStructure: projectContext?.projectStructure,
                userQuery: userInput,
                ragContext: context
            },
            timestamp: new Date()
        };
        try {
            // Send message via MCP
            const response = await this.mcpService.sendMessage(message);
            console.log('Documentation agent response (project overview):', response);
            return {
                action: 'generateDocumentation',
                message: 'I\'ve generated the documentation for you.',
                details: details,
                data: response // The response is already the documentation content
            };
        }
        catch (error) {
            console.log('Error generating documentation:', error);
            return {
                action: 'error',
                message: `Failed to generate documentation: ${error instanceof Error ? error.message : 'Unknown error'}`,
                details: details
            };
        }
    }
    async delegateToVisualizationAgent(userInput, projectContext, details) {
        // Use RAG to retrieve relevant context
        let context = null;
        if (projectContext && projectContext.projectStructure) {
            context = await this.ragService.retrieveContext(userInput, projectContext.projectStructure);
        }
        // Create MCP message to delegate to Visualization Agent
        const message = {
            id: this.generateMessageId(),
            from: 'ChatAgent',
            to: 'VisualizationAgent',
            type: 'generate_visualization',
            content: {
                task: 'generateArchitectureDiagram',
                projectStructure: projectContext?.projectStructure,
                userQuery: userInput,
                ragContext: context
            },
            timestamp: new Date()
        };
        try {
            // Send message via MCP
            const response = await this.mcpService.sendMessage(message);
            return {
                action: 'generateVisualization',
                message: 'I\'ve created the visualization for you.',
                details: details,
                data: response
            };
        }
        catch (error) {
            return {
                action: 'error',
                message: `Failed to generate visualization: ${error instanceof Error ? error.message : 'Unknown error'}`,
                details: details
            };
        }
    }
    async answerQuestion(question, context) {
        try {
            const model = await this.initializeModel();
            // Use RAG to retrieve relevant context
            let ragContext = null;
            if (context && context.projectStructure) {
                ragContext = await this.ragService.retrieveContext(question, context.projectStructure);
            }
            const promptTemplate = prompts_1.PromptTemplate.fromTemplate(`
                You are an experienced Java/Spring developer creating documentation for new team members.
                Provide concise, clear explanations that help developers understand the codebase quickly.
                
                Question: {question}
                
                Project Context: {projectContext}
                
                Retrieved Context: {ragContext}
                
                Guidelines for your response:
                1. Be concise and focus on the key points
                2. Use simple language that new developers can understand
                3. Provide practical information that helps with day-to-day development
                4. Include code examples only when necessary for understanding
                5. Limit your response to 3-4 short paragraphs maximum
                6. Focus on what the code does, not implementation details
                7. If asked about a specific class, explain its purpose and main responsibilities
                
                Structure your response with clear headings if needed, but keep it brief.
            `);
            const chain = promptTemplate.pipe(model).pipe(this.outputParser);
            const result = await chain.invoke({
                question: question,
                projectContext: JSON.stringify(context, null, 2),
                ragContext: ragContext ? JSON.stringify(ragContext, null, 2) : 'No additional context available'
            });
            return {
                action: 'answerQuestion',
                message: result,
                details: 'Answered user question'
            };
        }
        catch (error) {
            if (error instanceof Error && error.message.includes('API key not configured')) {
                throw error; // Re-throw configuration errors
            }
            return {
                action: 'error',
                message: `Failed to answer question: ${error instanceof Error ? error.message : 'Unknown error'}`,
                details: 'Failed to answer user question'
            };
        }
    }
    generateMessageId() {
        return Math.random().toString(36).substring(2, 15) +
            Math.random().toString(36).substring(2, 15);
    }
}
exports.ChatAgent = ChatAgent;
//# sourceMappingURL=chat_agent_langchain.js.map