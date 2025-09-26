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
exports.MainViewProvider = void 0;
const vscode = __importStar(require("vscode"));
const marked_1 = require("marked");
const message_types_1 = require("./message_types");
const WEBVIEW_UPDATE_DELAY = 500;
const VISUALIZATION_UPDATE_DELAY = 300;
class MainViewProvider {
    _extensionUri;
    static viewType = 'codedoc.mainView';
    _view;
    _projectStructure;
    constructor(_extensionUri) {
        this._extensionUri = _extensionUri;
    }
    getWebviewUri(webview, ...pathSegments) {
        return webview.asWebviewUri(vscode.Uri.joinPath(this._extensionUri, 'src', 'views', 'webview', ...pathSegments));
    }
    async resolveWebviewView(webviewView, context, _token) {
        this._view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };
        webviewView.webview.html = await this._getHtmlForWebview(webviewView.webview);
        webviewView.webview.onDidReceiveMessage((message) => {
            switch (message.type) {
                case message_types_1.WebviewMessageType.GetSelectedCode: {
                    const selectedText = this.getSelectedText();
                    this.postWebviewMessage({
                        type: message_types_1.WebviewMessageType.SelectedCode,
                        text: selectedText || "No code selected"
                    });
                    break;
                }
                case message_types_1.WebviewMessageType.SendMessage: {
                    if (message.text) {
                        // Pass along both the text and any attached snippet
                        this._handleUserMessage(message.text, message.contextSnippet);
                    }
                    break;
                }
                // case WebviewMessageType.SendMessage:
                //     if (message.text) {
                //         this._handleUserMessage(message.text);
                //     }
                //     break;
                case message_types_1.WebviewMessageType.SelectNode:
                    if (message.nodeId) {
                        this._handleNodeSelection(message.nodeId);
                    }
                    break;
                case message_types_1.WebviewMessageType.RefreshVisualization:
                    this._refreshVisualization();
                    break;
                case message_types_1.WebviewMessageType.GenerateProjectDocs:
                    this._generateProjectDocumentation();
                    break;
                case message_types_1.WebviewMessageType.GenerateClassDocs:
                    this._generateClassDocumentation();
                    break;
                case message_types_1.WebviewMessageType.ExportClassDocs:
                    if (message.content) {
                        this._exportClassDocumentation(message.content);
                    }
                    break;
                case message_types_1.WebviewMessageType.GenerateDiagram:
                    this._handleDiagramGeneration(message);
                    break;
                case message_types_1.WebviewMessageType.ExportDiagram:
                    this._handleDiagramExport(message.diagramData);
                    break;
                case message_types_1.WebviewMessageType.PreviewDiagram:
                    this._handleDiagramPreview(message.diagramData);
                    break;
                case message_types_1.WebviewMessageType.SaveDiagramToDocs:
                    this._handleSaveDiagramToDocs(message.diagramData);
                    break;
                case 'generateDiagram':
                    this._handleDiagramGeneration(message);
                    break;
                case 'exportDiagram':
                    this._handleDiagramExport(message.diagramData);
                    break;
                case 'previewDiagram':
                    this._handleDiagramPreview(message.diagramData);
                    break;
                case 'saveDiagramToDocs':
                    this._handleSaveDiagramToDocs(message.diagramData);
                    break;
            }
        });
        if (this._projectStructure) {
            console.log('Resending existing visualization data to newly resolved webview');
            setTimeout(() => {
                if (this._view && this._view.webview) {
                    this._view.webview.postMessage({
                        type: 'updateVisualization',
                        data: this._prepareVisualizationData(this._projectStructure)
                    });
                    // Also update project structure for diagram generator
                    this._view.webview.postMessage({
                        type: 'updateProjectStructureForDiagrams',
                        data: this._projectStructure
                    });
                }
            }, 500);
        }
        else {
            // Auto-trigger project analysis if no structure is available
            console.log('No project structure available, triggering auto-analysis');
            // Notify webview that analysis is starting
            setTimeout(() => {
                if (this._view && this._view.webview) {
                    this._view.webview.postMessage({
                        type: 'analysisStarted'
                    });
                }
            }, 500);
            setTimeout(() => {
                vscode.commands.executeCommand('codedoc.visualizeCode');
            }, 1000);
        }
    }
    updateVisualization(structure) {
        this._projectStructure = structure;
        if (this._view && this._view.webview) {
            console.log('Sending visualization data to webview');
            setTimeout(() => {
                if (this._view && this._view.webview) {
                    console.log('Actually sending visualization data');
                    this._view.webview.postMessage({
                        type: 'updateVisualization',
                        data: this._prepareVisualizationData(structure)
                    });
                    // Also update project structure for diagram generator
                    this._view.webview.postMessage({
                        type: 'updateProjectStructureForDiagrams',
                        data: structure
                    });
                }
            }, 300);
        }
        else {
            console.log('Webview not ready, cannot send data');
            return;
        }
        console.log('Sending visualization data to webview');
        setTimeout(() => {
            this.postWebviewMessage({
                type: message_types_1.WebviewMessageType.UpdateVisualization,
                data: this._prepareVisualizationData(structure)
            });
            this.postWebviewMessage({
                type: message_types_1.WebviewMessageType.UpdateProjectStructureForDiagrams,
                data: structure
            });
        }, VISUALIZATION_UPDATE_DELAY);
    }
    clearChat() {
        if (this._view) {
            this._view.webview.postMessage({ type: 'clearChat' });
        }
    }
    async convertToHtml(content) {
        if (!content)
            return '';
        const isHtml = content.startsWith('<') || content.includes('<h1') || content.includes('<p>');
        if (isHtml)
            return content;
        try {
            const result = (0, marked_1.marked)(content);
            return result instanceof Promise ? await result : result;
        }
        catch (error) {
            console.error('Error converting markdown to HTML:', error);
            return `<pre>${content}</pre>`;
        }
    }
    postWebviewMessage(message) {
        if (this._view?.webview) {
            this._view.webview.postMessage(message);
        }
    }
    showClassDocumentation(content) {
        if (this._view) {
            console.log('showClassDocumentation called with content length:', content?.length || 0);
            console.log('Content preview:', content?.substring(0, 200) + (content && content.length > 200 ? '...' : ''));
            // Check if content is already HTML
            const isHtml = content && (content.startsWith('<') || content.includes('<h1') || content.includes('<p>'));
            console.log('Content is HTML:', isHtml);
            try {
                if (!isHtml) {
                    console.log('Converting markdown to HTML');
                    // Handle both synchronous and asynchronous versions of marked
                    const result = (0, marked_1.marked)(content);
                    if (result instanceof Promise) {
                        result.then(htmlContent => {
                            console.log('Converted HTML length:', htmlContent?.length || 0);
                            console.log('Converted HTML preview:', htmlContent?.substring(0, 200) + (htmlContent && htmlContent.length > 200 ? '...' : ''));
                            this._view.webview.postMessage({
                                type: 'showExplanation',
                                text: htmlContent,
                                markdown: content
                            });
                        }).catch(error => {
                            console.error('Error converting markdown to HTML:', error);
                            // Fallback to showing raw content if markdown conversion fails
                            this._view.webview.postMessage({
                                type: 'showExplanation',
                                text: `<pre>${content || ''}</pre>`,
                                markdown: content
                            });
                        });
                    }
                    else {
                        const htmlContent = result;
                        console.log('Converted HTML length:', htmlContent?.length || 0);
                        console.log('Converted HTML preview:', htmlContent?.substring(0, 200) + (htmlContent && htmlContent.length > 200 ? '...' : ''));
                        this._view.webview.postMessage({
                            type: 'showExplanation',
                            text: htmlContent,
                            markdown: content
                        });
                    }
                }
                else {
                    console.log('Content is already HTML, using as-is');
                    this._view.webview.postMessage({
                        type: 'showExplanation',
                        text: content,
                        markdown: content
                    });
                }
            }
            catch (error) {
                console.error('Error converting markdown to HTML:', error);
                // Fallback to showing raw content if markdown conversion fails
                this._view.webview.postMessage({
                    type: 'showExplanation',
                    text: `<pre>${content || ''}</pre>`,
                    markdown: content
                });
            }
        }
    }
    showProjectDocumentation(content) {
        if (this._view) {
            console.log('showProjectDocumentation called with content length:', content?.length || 0);
            console.log('Content preview:', content?.substring(0, 200) + (content && content.length > 200 ? '...' : ''));
            // Check if content is already HTML
            const isHtml = content && (content.startsWith('<') || content.includes('<h1') || content.includes('<p>'));
            console.log('Content is HTML:', isHtml);
            try {
                if (!isHtml) {
                    console.log('Converting markdown to HTML');
                    // Handle both synchronous and asynchronous versions of marked
                    const result = (0, marked_1.marked)(content);
                    if (result instanceof Promise) {
                        result.then(htmlContent => {
                            console.log('Converted HTML length:', htmlContent?.length || 0);
                            console.log('Converted HTML preview:', htmlContent?.substring(0, 200) + (htmlContent && htmlContent.length > 200 ? '...' : ''));
                            this._view.webview.postMessage({
                                type: 'showProjectOverview',
                                text: htmlContent,
                                markdown: content
                            });
                        }).catch(error => {
                            console.error('Error converting markdown to HTML:', error);
                            // Fallback to showing raw content if markdown conversion fails
                            this._view.webview.postMessage({
                                type: 'showProjectOverview',
                                text: `<pre>${content || ''}</pre>`,
                                markdown: content
                            });
                        });
                    }
                    else {
                        const htmlContent = result;
                        console.log('Converted HTML length:', htmlContent?.length || 0);
                        console.log('Converted HTML preview:', htmlContent?.substring(0, 200) + (htmlContent && htmlContent.length > 200 ? '...' : ''));
                        this._view.webview.postMessage({
                            type: 'showProjectOverview',
                            text: htmlContent,
                            markdown: content
                        });
                    }
                }
                else {
                    console.log('Content is already HTML, using as-is');
                    this._view.webview.postMessage({
                        type: 'showProjectOverview',
                        text: content,
                        markdown: content
                    });
                }
            }
            catch (error) {
                console.error('Error converting markdown to HTML:', error);
                // Fallback to showing raw content if markdown conversion fails
                this._view.webview.postMessage({
                    type: 'showProjectOverview',
                    text: `<pre>${content || ''}</pre>`,
                    markdown: content
                });
            }
        }
    }
    postDelayedWebviewMessage(message, delay = WEBVIEW_UPDATE_DELAY) {
        setTimeout(() => this.postWebviewMessage(message), delay);
    }
    initializeVisualization() {
        if (!this._projectStructure) {
            console.log('No project structure available, triggering auto-analysis');
            this.postDelayedWebviewMessage({ type: message_types_1.WebviewMessageType.AnalysisStarted });
            setTimeout(() => {
                vscode.commands.executeCommand('codedoc.visualizeCode');
            }, WEBVIEW_UPDATE_DELAY);
            return;
        }
        console.log('Resending existing visualization data to newly resolved webview');
        this.postDelayedWebviewMessage({
            type: message_types_1.WebviewMessageType.UpdateVisualization,
            data: this._prepareVisualizationData(this._projectStructure)
        });
        this.postDelayedWebviewMessage({
            type: message_types_1.WebviewMessageType.UpdateProjectStructureForDiagrams,
            data: this._projectStructure
        });
    }
    async showClassDocumentation(content) {
        if (!this._view)
            return;
        console.log('showClassDocumentation called with content length:', content?.length || 0);
        const htmlContent = await this.convertToHtml(content);
        this.postWebviewMessage({
            type: message_types_1.WebviewMessageType.ShowExplanation,
            text: htmlContent,
            markdown: content
        });
    }
    async showProjectDocumentation(content) {
        if (!this._view)
            return;
        console.log('showProjectDocumentation called with content length:', content?.length || 0);
        const htmlContent = await this.convertToHtml(content);
        this.postWebviewMessage({
            type: message_types_1.WebviewMessageType.ShowProjectOverview,
            text: htmlContent,
            markdown: content
        });
    }
    showChatResponse(response) {
        console.log('showChatResponse called with:', response);
        if (this._view) {
            // The response comes from the workflow orchestrator which wraps the chat agent response
            // So we need to unwrap it first
            let chatResponse = response;
            if (response && response.success && response.data) {
                // Unwrap the response from the workflow orchestrator
                chatResponse = response.data;
            }
            console.log('Unwrapped chat response:', chatResponse);
            // Format the response based on the action type
            switch (chatResponse.action) {
                case 'generateDocumentation':
                    // Handle documentation generation
                    // The documentation content is directly in chatResponse.data
                    let documentationContent = chatResponse.data;
                    console.log('Documentation content:', documentationContent);
                    if (documentationContent) {
                        // Show the generated documentation in the explanation tab
                        const htmlContent = (0, marked_1.marked)(documentationContent);
                        this._view.webview.postMessage({
                            type: 'showExplanation',
                            text: htmlContent,
                            markdown: documentationContent
                        });
                        // Show a message in the chat
                        this._view.webview.postMessage({
                            type: 'botResponse',
                            text: chatResponse.message || 'I\'ve generated the documentation for you. You can find it in the Code Explanation tab.'
                        });
                    }
                    else {
                        this._view.webview.postMessage({
                            type: 'botResponse',
                            text: chatResponse.message || 'I\'ve generated the documentation for you.'
                        });
                    }
                    break;
                case 'generateVisualization':
                    // Handle visualization generation
                    if (chatResponse.message) {
                        this._view.webview.postMessage({
                            type: 'botResponse',
                            text: chatResponse.message
                        });
                    }
                    else {
                        this._view.webview.postMessage({
                            type: 'botResponse',
                            text: 'I\'ve created the visualization for you.'
                        });
                    }
                    break;
                case 'answerQuestion':
                    // For question answers, also convert markdown to HTML
                    const answerHtmlContent = (0, marked_1.marked)(chatResponse.message || 'Here\'s what I found:');
                    this._view.webview.postMessage({
                        type: 'botResponse',
                        text: answerHtmlContent
                    });
                    break;
                case 'clarify':
                    const clarifyHtmlContent = (0, marked_1.marked)(chatResponse.message || 'I\'m not sure what you want to do. You can ask me to generate documentation, create visualizations, or answer questions about your code.');
                    this._view.webview.postMessage({
                        type: 'botResponse',
                        text: clarifyHtmlContent
                    });
                    break;
                default:
                    const defaultHtmlContent = (0, marked_1.marked)(chatResponse.message || 'I\'ve processed your request.');
                    this._view.webview.postMessage({
                        type: 'botResponse',
                        text: defaultHtmlContent
                    });
            }
        }
    }
    showChatError(error) {
        if (this._view) {
            this._view.webview.postMessage({
                type: 'botResponse',
                text: `❌ Error: ${error}`
            });
        }
    }
    showArchitectureDescription(description) {
        if (this._view) {
            // Convert markdown to HTML for better display
            const htmlContent = (0, marked_1.marked)(description);
            this._view.webview.postMessage({
                type: 'showArchitectureDescription',
                text: htmlContent,
                markdown: description
            });
        }
    }
    // private _handleUserMessage(message: string) {
    //     // Send message to backend for processing by the Langchain-based chat agent
    //     if (this._view) {
    //         // Show loading indicator
    //         this._view.webview.postMessage({
    //             type: 'botResponse',
    //             text: 'Thinking...'
    //         });
    //         // Send message to backend
    //         vscode.commands.executeCommand('codedoc.processChatMessage', message);
    //     }
    // }
    _handleUserMessage(message, contextSnippet) {
        if (this._view) {
            // Show loading indicator
            this._view.webview.postMessage({
                type: 'botResponse',
                text: 'Thinking...'
            });
            // Send to backend: include contextSnippet if available
            vscode.commands.executeCommand('codedoc.processChatMessage', {
                message,
                contextSnippet
            });
        }
    }
    _handleNodeSelection(nodeId) {
        const selectedClass = this._projectStructure?.classes.find(cls => cls.name === nodeId);
        if (selectedClass) {
            vscode.workspace.openTextDocument(selectedClass.filePath).then(doc => {
                vscode.window.showTextDocument(doc);
            });
        }
    }
    _refreshVisualization() {
        if (this._view) {
            this._view.webview.postMessage({ type: 'refreshing' });
            vscode.commands.executeCommand('codedoc.visualizeCode');
        }
    }
    _generateProjectDocumentation() {
        vscode.commands.executeCommand('codedoc.generateDocs');
    }
    _generateClassDocumentation() {
        vscode.commands.executeCommand('codedoc.generateClassDocs');
    }
    _exportClassDocumentation(content) {
        vscode.commands.executeCommand('codedoc.exportClassDocs', content);
    }
    _handleDiagramGeneration(message) {
        // Check if project structure is available
        if (!this._projectStructure) {
            this._view?.webview.postMessage({
                type: 'diagramError',
                error: 'Project structure not available. Please analyze the project first.'
            });
            return;
        }
        // Send diagram generation request to backend
        vscode.commands.executeCommand('codedoc.generateDiagram', {
            diagramType: message.diagramType,
            scope: message.scope,
            module: message.module,
            projectStructure: this._projectStructure
        });
    }
    _handleDiagramExport(diagramData) {
        vscode.commands.executeCommand('codedoc.exportDiagram', diagramData);
    }
    _handleDiagramPreview(diagramData) {
        vscode.commands.executeCommand('codedoc.previewDiagram', diagramData);
    }
    _handleSaveDiagramToDocs(diagramData) {
        vscode.commands.executeCommand('codedoc.saveDiagramToDocs', diagramData);
    }
    showGeneratedDiagram(diagramData) {
        if (this._view && this._view.webview) {
            this._view.webview.postMessage({
                type: 'diagramGenerated',
                data: diagramData
            });
        }
    }
    _prepareVisualizationData(structure) {
        // Categorize classes by architectural layers with enhanced detection
        const layers = {
            controllers: structure.classes.filter(cls => cls.annotations.some(ann => ann.includes('@Controller') || ann.includes('@RestController')) ||
                cls.package.includes('.controller') ||
                cls.name.endsWith('Controller')),
            services: structure.classes.filter(cls => cls.annotations.some(ann => ann.includes('@Service')) ||
                cls.package.includes('.service') ||
                cls.name.endsWith('Service') ||
                cls.name.endsWith('ServiceImpl')),
            repositories: structure.classes.filter(cls => cls.annotations.some(ann => ann.includes('@Repository')) ||
                cls.package.includes('.repository') ||
                cls.name.endsWith('Repository')),
            entities: structure.classes.filter(cls => cls.annotations.some(ann => ann.includes('@Entity')) ||
                cls.package.includes('.entity') ||
                cls.package.includes('.domain.entity')),
            others: structure.classes.filter(cls => !cls.annotations.some(ann => ann.includes('@Controller') || ann.includes('@RestController') ||
                ann.includes('@Service') || ann.includes('@Repository') || ann.includes('@Entity')) &&
                !cls.package.includes('.controller') &&
                !cls.package.includes('.service') &&
                !cls.name.endsWith('Service') &&
                !cls.name.endsWith('ServiceImpl') &&
                !cls.package.includes('.repository') &&
                !cls.name.endsWith('Repository') &&
                !cls.package.includes('.entity') &&
                !cls.package.includes('.domain.entity') &&
                !cls.name.endsWith('Controller'))
        };
        const dependencies = structure.relationships.map(rel => ({
            from: rel.from,
            to: rel.to,
            type: rel.type,
            method: rel.method
        }));
        return {
            layers,
            dependencies,
            stats: {
                totalClasses: structure.classes.length,
                controllers: layers.controllers.length,
                services: layers.services.length,
                repositories: layers.repositories.length,
                entities: layers.entities.length,
                others: layers.others.length,
                dependencies: dependencies.length
            }
        };
    }
    async _getHtmlForWebview(webview) {
        const scriptUri = this.getWebviewUri(webview, 'main.js');
        const styleUri = this.getWebviewUri(webview, 'styles.css');
        const nonce = this.getNonce();
        // Read the HTML template
        const htmlContent = await vscode.workspace.fs.readFile(vscode.Uri.joinPath(this._extensionUri, 'src', 'views', 'webview', 'main.html'));
        const htmlTemplate = htmlContent.toString();
        // Replace placeholders in the template
        return htmlTemplate
            .replace(/#{scriptUri}/g, scriptUri.toString())
            .replace(/#{cssUri}/g, styleUri.toString())
            .replace(/#{cspSource}/g, webview.cspSource);
    }
    getNonce() {
        let text = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }
    getSelectedText() {
        const editor = vscode.window.activeTextEditor;
        if (!editor)
            return null;
        const selection = editor.selection;
        if (selection.isEmpty)
            return null;
        console.log("Selected code: " + selection);
        return editor.document.getText(selection);
    }
}
exports.MainViewProvider = MainViewProvider;
//# sourceMappingURL=main_provider.js.map