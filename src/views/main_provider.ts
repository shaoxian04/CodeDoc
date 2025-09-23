import * as vscode from 'vscode';
import { ProjectStructure } from '../service/java_parser';
import { marked } from 'marked';
import { WebviewMessageType, WebviewMessage } from './message_types';

const WEBVIEW_UPDATE_DELAY = 500;
const VISUALIZATION_UPDATE_DELAY = 300;

export class MainViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'codedoc.mainView';
    private _view?: vscode.WebviewView;
    private _projectStructure?: ProjectStructure;

    constructor(private readonly _extensionUri: vscode.Uri) { }

    private getWebviewUri(webview: vscode.Webview, ...pathSegments: string[]): vscode.Uri {
        return webview.asWebviewUri(
            vscode.Uri.joinPath(this._extensionUri, 'src', 'views', 'webview', ...pathSegments)
        );
    }

    public async resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };
        
        webviewView.webview.html = await this._getHtmlForWebview(webviewView.webview);

        webviewView.webview.onDidReceiveMessage((message: WebviewMessage) => {
            switch (message.type) {
                case WebviewMessageType.SendMessage:
                    if (message.text) {
                        this._handleUserMessage(message.text);
                    }
                    break;
                case WebviewMessageType.SelectNode:
                    if (message.nodeId) {
                        this._handleNodeSelection(message.nodeId);
                    }
                    break;
                case WebviewMessageType.RefreshVisualization:
                    this._refreshVisualization();
                    break;
                case WebviewMessageType.GenerateProjectDocs:
                    this._generateProjectDocumentation();
                    break;
                case WebviewMessageType.GenerateClassDocs:
                    this._generateClassDocumentation();
                    break;
                case WebviewMessageType.ExportClassDocs:
                    if (message.content) {
                        this._exportClassDocumentation(message.content);
                    }
                    break;
                case WebviewMessageType.GenerateDiagram:
                    this._handleDiagramGeneration(message);
                    break;
                case WebviewMessageType.ExportDiagram:
                    this._handleDiagramExport(message.diagramData);
                    break;
                case WebviewMessageType.PreviewDiagram:
                    this._handleDiagramPreview(message.diagramData);
                    break;
                case WebviewMessageType.SaveDiagramToDocs:
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
                        data: this._prepareVisualizationData(this._projectStructure!)
                    });
                
                    this._view.webview.postMessage({
                        type: 'updateProjectStructureForDiagrams',
                        data: this._projectStructure
                    });

                }
            }, 500); 
        }else {
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
    public updateVisualization(structure: ProjectStructure): void {
        this._projectStructure = structure;
        if (!this._view?.webview) {
            console.log('Webview not ready, cannot send data');
            return;
        }

        console.log('Sending visualization data to webview');
        setTimeout(() => {
            this.postWebviewMessage({
                type: WebviewMessageType.UpdateVisualization,
                data: this._prepareVisualizationData(structure)
            });
            
            this.postWebviewMessage({
                type: WebviewMessageType.UpdateProjectStructureForDiagrams,
                data: structure
            });
        }, VISUALIZATION_UPDATE_DELAY);
    }

    public clearChat() {
        if (this._view) {
            this._view.webview.postMessage({ type: 'clearChat' });
        }
    }

    private async convertToHtml(content: string): Promise<string> {
        if (!content) return '';
        
        const isHtml = content.startsWith('<') || content.includes('<h1') || content.includes('<p>');
        if (isHtml) return content;

        try {
            const result = marked(content);
            return result instanceof Promise ? await result : result;
        } catch (error) {
            console.error('Error converting markdown to HTML:', error);
            return `<pre>${content}</pre>`;
        }
    }

    private postWebviewMessage(message: WebviewMessage): void {
        if (this._view?.webview) {
            this._view.webview.postMessage(message);
        }
    }

    private postDelayedWebviewMessage(message: WebviewMessage, delay: number = WEBVIEW_UPDATE_DELAY): void {
        setTimeout(() => this.postWebviewMessage(message), delay);
    }

    private initializeVisualization(): void {
        if (!this._projectStructure) {
            console.log('No project structure available, triggering auto-analysis');
            this.postDelayedWebviewMessage({ type: WebviewMessageType.AnalysisStarted });
            setTimeout(() => {
                vscode.commands.executeCommand('codedoc.visualizeCode');
            }, WEBVIEW_UPDATE_DELAY);
            return;
        }

        console.log('Resending existing visualization data to newly resolved webview');
        this.postDelayedWebviewMessage({
            type: WebviewMessageType.UpdateVisualization,
            data: this._prepareVisualizationData(this._projectStructure)
        });

        this.postDelayedWebviewMessage({
            type: WebviewMessageType.UpdateProjectStructureForDiagrams,
            data: this._projectStructure
        });
    }

    public async showClassDocumentation(content: string): Promise<void> {
        if (!this._view) return;

        console.log('showClassDocumentation called with content length:', content?.length || 0);
        const htmlContent = await this.convertToHtml(content);
        
        this.postWebviewMessage({
            type: WebviewMessageType.ShowExplanation,
            text: htmlContent,
            markdown: content
        });
    }

    public async showProjectDocumentation(content: string): Promise<void> {
        if (!this._view) return;

        console.log('showProjectDocumentation called with content length:', content?.length || 0);
        const htmlContent = await this.convertToHtml(content);
        
        this.postWebviewMessage({
            type: WebviewMessageType.ShowProjectOverview,
            text: htmlContent,
            markdown: content
        });
    }

    public showChatResponse(response: any) {
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
                        const htmlContent = marked(documentationContent);
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
                    } else {
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
                    } else {
                        this._view.webview.postMessage({
                            type: 'botResponse',
                            text: 'I\'ve created the visualization for you.'
                        });
                    }
                    break;
                case 'answerQuestion':
                    // For question answers, also convert markdown to HTML
                    const answerHtmlContent = marked(chatResponse.message || 'Here\'s what I found:');
                    this._view.webview.postMessage({
                        type: 'botResponse',
                        text: answerHtmlContent
                    });
                    break;
                case 'clarify':
                    const clarifyHtmlContent = marked(chatResponse.message || 'I\'m not sure what you want to do. You can ask me to generate documentation, create visualizations, or answer questions about your code.');
                    this._view.webview.postMessage({
                        type: 'botResponse',
                        text: clarifyHtmlContent
                    });
                        break;
                    default:
                        const defaultHtmlContent = marked(chatResponse.message || 'I\'ve processed your request.');
                        this._view.webview.postMessage({
                            type: 'botResponse',
                            text: defaultHtmlContent
                        });
            }
        }
    }

    public showChatError(error: string) {
        if (this._view) {
            this._view.webview.postMessage({
                type: 'botResponse',
                text: `❌ Error: ${error}`
            });
        }
    }

    public showArchitectureDescription(description: string) {
        if (this._view) {
            // Convert markdown to HTML for better display
            const htmlContent = marked(description);
            this._view.webview.postMessage({
                type: 'showArchitectureDescription',
                text: htmlContent,
                markdown: description
            });
        }
    }

    private _handleUserMessage(message: string) {
        // Send message to backend for processing by the Langchain-based chat agent
        if (this._view) {
            // Show loading indicator
            this._view.webview.postMessage({
                type: 'botResponse',
                text: 'Thinking...'
            });
            
            // Send message to backend
            vscode.commands.executeCommand('codedoc.processChatMessage', message);
        }
    }

    private _handleNodeSelection(nodeId: string) {
        const selectedClass = this._projectStructure?.classes.find(cls => cls.name === nodeId);
        if (selectedClass) {
            vscode.workspace.openTextDocument(selectedClass.filePath).then(doc => {
                vscode.window.showTextDocument(doc);
            });
        }
    }
    private _refreshVisualization() {
        if (this._view) {
            this._view.webview.postMessage({ type: 'refreshing' });
            vscode.commands.executeCommand('codedoc.visualizeCode');
        }
    }

    private _generateProjectDocumentation() {
        vscode.commands.executeCommand('codedoc.generateDocs');
    }

    private _generateClassDocumentation() {
        vscode.commands.executeCommand('codedoc.generateClassDocs');
    }

    private _exportClassDocumentation(content: string) {
        vscode.commands.executeCommand('codedoc.exportClassDocs', content);
    }
    //TODO: check this visualization function
    private _handleDiagramGeneration(message: any) {
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
    private _handleDiagramExport(diagramData: any) {
        vscode.commands.executeCommand('codedoc.exportDiagram', diagramData);
    }

    private _handleDiagramPreview(diagramData: any) {
        vscode.commands.executeCommand('codedoc.previewDiagram', diagramData);
    }

    private _handleSaveDiagramToDocs(diagramData: any) {
        vscode.commands.executeCommand('codedoc.saveDiagramToDocs', diagramData);
    }

    public showGeneratedDiagram(diagramData: any) {
        if (this._view && this._view.webview) {
            this._view.webview.postMessage({
                type: 'diagramGenerated',
                data: diagramData
            });
        }
    }

    private _prepareVisualizationData(structure: ProjectStructure) {
        // Categorize classes by architectural layers with enhanced detection
        const layers = {
            controllers: structure.classes.filter(cls => 
                cls.annotations.some(ann => ann.includes('@Controller') || ann.includes('@RestController')) ||
                cls.package.includes('.controller') ||
                cls.name.endsWith('Controller')
            ),
            services: structure.classes.filter(cls => 
                cls.annotations.some(ann => ann.includes('@Service')) ||
                cls.package.includes('.service') ||
                cls.name.endsWith('Service') ||
                cls.name.endsWith('ServiceImpl')
            ),
            repositories: structure.classes.filter(cls => 
                cls.annotations.some(ann => ann.includes('@Repository')) ||
                cls.package.includes('.repository') ||
                cls.name.endsWith('Repository')
            ),
            entities: structure.classes.filter(cls => 
                cls.annotations.some(ann => ann.includes('@Entity')) ||
                cls.package.includes('.entity') ||
                cls.package.includes('.domain.entity')
            ),
            others: structure.classes.filter(cls => 
                !cls.annotations.some(ann => 
                    ann.includes('@Controller') || ann.includes('@RestController') ||
                    ann.includes('@Service') || ann.includes('@Repository') || ann.includes('@Entity')
                ) &&
                !cls.package.includes('.controller') &&
                !cls.package.includes('.service') &&
                !cls.name.endsWith('Service') &&
                !cls.name.endsWith('ServiceImpl') &&
                !cls.package.includes('.repository') &&
                !cls.name.endsWith('Repository') &&
                !cls.package.includes('.entity') &&
                !cls.package.includes('.domain.entity') &&
                !cls.name.endsWith('Controller')
            )
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

    private async _getHtmlForWebview(webview: vscode.Webview): Promise<string> {
        const scriptUri = this.getWebviewUri(webview, 'main.js');
        const styleUri = this.getWebviewUri(webview, 'styles.css');
        const nonce = this.getNonce();

        // Read the HTML template
        const htmlContent = await vscode.workspace.fs.readFile(
            vscode.Uri.joinPath(this._extensionUri, 'src', 'views', 'webview', 'main.html')
        );
        
        const htmlTemplate = htmlContent.toString();

        // Replace placeholders in the template
        return htmlTemplate
            .replace(/#{scriptUri}/g, scriptUri.toString())
            .replace(/#{cssUri}/g, styleUri.toString())
            .replace(/#{cspSource}/g, webview.cspSource);
    }

    private getNonce(): string {
        let text = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }

}