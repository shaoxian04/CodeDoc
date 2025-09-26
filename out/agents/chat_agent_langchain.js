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
    // private async determineIntent(userInput: string, projectContext: any): Promise<any> {
    //     try {
    //         // --- 1. Quick keyword shortcut (regex) ---
    //         const lowerInput = userInput.toLowerCase();
    //         if (/(generate\s+doc|generate\s+documentation|document\s+for)/.test(lowerInput)) {
    //             return { action: "generateDocumentation", details: userInput };
    //         }
    //         if (/(diagram|flowchart|visualize|visualisation|visualization)/.test(lowerInput)) {
    //             return { action: "generateVisualization", details: userInput };
    //         }
    //         if (/^(what|how|why|explain|describe)\b/.test(lowerInput)) {
    //             return { action: "answerQuestion", details: userInput };
    //         }
    //         // --- 2. Fallback to LLM classification ---
    //         const model = await this.initializeModel();
    //         const promptTemplate = PromptTemplate.fromTemplate(`
    //             Analyze the user's request and determine their intent:
    //             User Request: {userInput}
    //             Project Context: {projectContext}
    //             Possible intents:
    //             1. generateDocumentation - User wants to generate documentation (project overview or specific class documentation)
    //             2. generateVisualization - User wants to create a visualization/diagram
    //             3. answerQuestion - User has a question about the codebase
    //             4. unknown - Unclear what the user wants
    //              Extra robustness rules:
    //             - Ignore case sensitivity (treat "UserService" and "userservice" the same)
    //             - Be forgiving with typos (e.g., "documnt" → documentation, "visulize" → visualize)
    //             - Match intent to the closest possible option
    //            Return ONLY a valid JSON object, no explanations, no code block markers.
    //             Format:
    //             {
    //             "action": "generateDocumentation" | "generateVisualization" | "answerQuestion" | "unknown",
    //             "details": "<string with any useful extra info>"
    //             }
    //         `);
    //         const chain = promptTemplate.pipe(model).pipe(this.outputParser as any);
    //         const result = await chain.invoke({ 
    //             userInput: userInput,
    //             projectContext: JSON.stringify(projectContext, null, 2)
    //         });
    //         console.log('LLM Intent Result:', result);
    //         try {
    //             // --- 3. Remove markdown code block formatting if present to guarantee valid JSON
    //             let cleanResult = result as string;
    //             if (cleanResult.startsWith('```json')) {
    //                 cleanResult = cleanResult.substring(7);
    //             }
    //             if (cleanResult.startsWith('```')) {
    //                 cleanResult = cleanResult.substring(3);
    //             }
    //             if (cleanResult.endsWith('```')) {
    //                 cleanResult = cleanResult.substring(0, cleanResult.length - 3);
    //             }
    //             cleanResult = cleanResult.trim();
    //             const parsedResult = JSON.parse(cleanResult);
    //             console.log('Parsed Intent Result:', parsedResult);
    //             return parsedResult;
    //         } catch (e) {
    //             // If parsing fails, return a default response
    //             console.log('Failed to parse LLM result, returning unknown intent');
    //             return {
    //                 action: 'unknown',
    //                 details: 'Could not determine intent'
    //             };
    //         }
    //     } catch (error) {
    //         console.log('Error determining intent:', error);
    //         if (error instanceof Error && error.message.includes('API key not configured')) {
    //             throw error; // Re-throw configuration errors
    //         }
    //         // If we can't determine intent due to other errors, default to unknown
    //         return {
    //             action: 'unknown',
    //             details: 'Could not determine intent due to an error'
    //         };
    //     }
    // }
    async determineIntent(userInput, projectContext) {
        // Helper: normalize
        const normalize = (s) => s.trim().toLowerCase();
        // Helper: Levenshtein distance
        function levenshtein(a, b) {
            const A = a.split('');
            const B = b.split('');
            const m = A.length, n = B.length;
            const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
            for (let i = 0; i <= m; i++)
                dp[i][0] = i;
            for (let j = 0; j <= n; j++)
                dp[0][j] = j;
            for (let i = 1; i <= m; i++) {
                for (let j = 1; j <= n; j++) {
                    const cost = A[i - 1] === B[j - 1] ? 0 : 1;
                    dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
                }
            }
            return dp[m][n];
        }
        // similarity 0..1
        function similarity(a, b) {
            if (!a.length && !b.length)
                return 1;
            const dist = levenshtein(a, b);
            return 1 - dist / Math.max(a.length, b.length);
        }
        // fuzzy match a keyword against input tokens/phrases
        function fuzzyMatchKeyword(keyword, input, tokens) {
            const k = normalize(keyword);
            if (input.includes(k))
                return true; // exact substring
            // compare against tokens
            for (const t of tokens) {
                if (similarity(k, t) >= 0.77)
                    return true; // tuned threshold
            }
            // also compare full input phrase similarity
            if (similarity(k, input) >= 0.72)
                return true;
            return false;
        }
        try {
            const origInput = userInput || '';
            const lowerInput = normalize(origInput);
            const tokens = lowerInput.split(/\W+/).filter(Boolean);
            // Intent keyword lists (expand as needed)
            const docKeywords = [
                "generate doc", "generate documentation", "document", "docs", "documentation", "write docs", "document for", "api docs", "readme", "generate readme"
            ];
            const vizKeywords = [
                "diagram", "flowchart", "visualize", "visualisation", "visualization", "call graph", "sequence diagram", "architecture", "graph", "flow chart"
            ];
            const qnaKeywords = [
                "what", "how", "why", "explain", "describe", "help", "debug", "where", "when", "is there", "does", "can i", "why is"
            ];
            // Quick high-confidence syntactic checks (not fuzzy)
            // If input explicitly starts with question words -> QnA
            if (/^\s*(what|how|why|explain|describe|where|when)\b/i.test(origInput)) {
                return { action: "answerQuestion", details: userInput, confidence: "high" };
            }
            // Detect explicit doc or viz keywords fast
            for (const k of docKeywords) {
                if (lowerInput.includes(k)) {
                    return { action: "generateDocumentation", details: userInput, confidence: "high" };
                }
            }
            for (const k of vizKeywords) {
                if (lowerInput.includes(k)) {
                    return { action: "generateVisualization", details: userInput, confidence: "high" };
                }
            }
            // Scoring approach (counts and fuzzy matches)
            let scores = { generateDocumentation: 0, generateVisualization: 0, answerQuestion: 0 };
            // exact or fuzzy keyword matches
            for (const kw of docKeywords) {
                if (fuzzyMatchKeyword(kw, lowerInput, tokens))
                    scores.generateDocumentation += 2;
            }
            for (const kw of vizKeywords) {
                if (fuzzyMatchKeyword(kw, lowerInput, tokens))
                    scores.generateVisualization += 2;
            }
            for (const kw of qnaKeywords) {
                if (fuzzyMatchKeyword(kw, lowerInput, tokens))
                    scores.answerQuestion += 1;
            }
            // Detect class / symbol names (strong signal for documentation)
            // e.g., "SchoolController", "userService", `processOrder`
            const classPattern = /`?([A-Za-z_][A-Za-z0-9_]*?(Controller|Service|Repository|Manager|Client|Dto|Model|Handler|Helper))`?/g;
            let classMatch;
            let docCandidates = [];
            while ((classMatch = classPattern.exec(origInput)) !== null) {
                docCandidates.push(classMatch[1]);
                scores.generateDocumentation += 3; // strong boost
            }
            // function-like tokens (backticks or token with parentheses)
            const fnPattern = /`?([a-z_][A-Za-z0-9_]*)\s*\(/g;
            while ((classMatch = fnPattern.exec(origInput)) !== null) {
                scores.generateDocumentation += 2;
                docCandidates.push(classMatch[1]);
            }
            // If input contains quotes/backticks around an identifier -> documentation likely
            if (/[`'"]\w+[`'"]/.test(origInput)) {
                scores.generateDocumentation += 1;
            }
            // Small heuristic: if many code-like tokens present, bias to QnA or documentation
            const codeLike = (origInput.match(/[A-Za-z0-9_]+(?:\.\w+)?\(\)?/g) || []).length;
            if (codeLike >= 2) {
                scores.generateDocumentation += 1;
                scores.answerQuestion += 1;
            }
            // Decide best local intent and compute confidence
            const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1]);
            const best = sorted[0];
            const second = sorted[1];
            const bestIntent = best[0];
            const bestScore = best[1];
            const secondScore = second ? second[1] : -Infinity;
            // Confidence heuristics
            let confidence = "low";
            if (bestScore >= 4 && bestScore - secondScore >= 2)
                confidence = "high";
            else if (bestScore >= 2)
                confidence = "medium";
            else
                confidence = "low";
            // If high confidence locally, return immediately
            if (confidence === "high") {
                const details = docCandidates.length ? docCandidates.join(", ") : userInput;
                return { action: bestIntent, details, confidence };
            }
            // Otherwise, fallback to LLM but give it our local hint to be robust
            const model = await this.initializeModel();
            const promptTemplate = prompts_1.PromptTemplate.fromTemplate(`
Analyze the user's request and determine their intent into ONE of:
- generateDocumentation
- generateVisualization
- answerQuestion
- unknown

User Request: {userInput}

Project Context (summary): {projectContext}

Local heuristic suggestion: {localSuggestion} (score: {localScore}) — use this as a hint but decide correctly.

Extra rules:
- Ignore case differences and be forgiving with small typos.
- If the user mentions a class/function (e.g., SchoolController or processOrder), prefer generateDocumentation.
- Return ONLY valid JSON (no explanations, no surrounding text).

Return JSON exactly like:
{
  "action": "generateDocumentation" | "generateVisualization" | "answerQuestion" | "unknown",
  "details": "<optional detail, e.g., target class or short reason>"
}
Examples:
User: "generate document for SchoolController"
Output: {"action":"generateDocumentation","details":"SchoolController"}
User: "create diagram of login flow"
Output: {"action":"generateVisualization","details":"login flow"}
User: "what does loginService do?"
Output: {"action":"answerQuestion","details":"loginService"}
Now classify:
        `);
            const chain = promptTemplate.pipe(model).pipe(this.outputParser);
            const result = await chain.invoke({
                userInput: userInput,
                projectContext: JSON.stringify(projectContext, null, 2),
                localSuggestion: bestIntent,
                localScore: bestScore
            });
            console.log('LLM Intent Result:', result);
            // sanitize JSON
            try {
                let cleanResult = result.trim();
                cleanResult = cleanResult.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
                const parsed = JSON.parse(cleanResult);
                // attach confidence info from local heuristics if LLM doesn't provide it
                parsed.confidence = parsed.confidence || confidence;
                return parsed;
            }
            catch (e) {
                console.log('Failed to parse LLM result, returning local best-guess');
                return {
                    action: bestIntent,
                    details: docCandidates.length ? docCandidates.join(", ") : userInput,
                    confidence
                };
            }
        }
        catch (error) {
            console.log('Error determining intent:', error);
            if (error instanceof Error && error.message.includes('API key not configured')) {
                throw error;
            }
            return { action: 'unknown', details: 'Could not determine intent due to an error', confidence: 'low' };
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
            // Prepare user-attached snippet if available
            const extraContext = context?.extraContext
                ? context.extraContext
                : "No user-attached snippet";
            const promptTemplate = prompts_1.PromptTemplate.fromTemplate(`
                You are an experienced Java/Spring developer creating documentation for new team members.
                Provide concise, clear explanations that help developers understand the codebase quickly.
                
                Question: {question}
                
                Project Context: {projectContext}
                
                Retrieved Context: {ragContext}

                User-Attached Snippet: {extraContext}
                
                Guidelines for your response:
                1. Be concise and focus on the key points
                2. Use simple language that new developers can understand
                3. Provide practical information that helps with day-to-day development
                4. Include code examples only when necessary for understanding
                5. Limit your response to 3-4 short paragraphs maximum
                6. Focus on what the code does, not implementation details
                7. If asked about a specific class, explain its purpose and main responsibilities
                8. 🔹 **Do not be sensitive to casing or typos in the question.**
       - Treat "UserService", "userservice", and "user srvice" as referring to the same thing.
       - Always try to interpret the closest match from the project context or provided snippet.

                Structure your response with clear headings if needed, but keep it brief.
            `);
            const chain = promptTemplate.pipe(model).pipe(this.outputParser);
            const result = await chain.invoke({
                question: question,
                projectContext: JSON.stringify(context, null, 2),
                ragContext: ragContext ? JSON.stringify(ragContext, null, 2) : 'No additional context available',
                extraContext
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