import * as vscode from 'vscode';
import { ProjectStructure } from '../service/java_parser';
import { marked } from 'marked';

export class MainViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'codedoc.mainView';
    private _view?: vscode.WebviewView;
    private _projectStructure?: ProjectStructure;

    constructor(private readonly _extensionUri: vscode.Uri) { }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ) {
        this._view = webviewView;

        webviewView.webview.options = {
            enableScripts: true,
            enableCommandUris: true,
            localResourceRoots: [this._extensionUri]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        webviewView.webview.onDidReceiveMessage(
            message => {
                switch (message.type) {
                    case 'sendMessage':
                        this._handleUserMessage(message.text);
                        break;
                    case 'selectNode':
                        this._handleNodeSelection(message.nodeId);
                        break;
                    case 'refreshVisualization':
                        this._refreshVisualization();
                        break;
                    case 'generateProjectDocs':
                        this._generateProjectDocumentation();
                        break;
                    case 'generateClassDocs':
                        this._generateClassDocumentation();
                        break;
                    case 'exportClassDocs':
                        this._exportClassDocumentation(message.content);
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
            }
        );
        
        if (this._projectStructure) {
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
        } else {
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

    public updateVisualization(structure: ProjectStructure) {
        this._projectStructure = structure;
        if (this._view && this._view.webview) {
            setTimeout(() => {
                if (this._view && this._view.webview) {
                    this._view.webview.postMessage({
                        type: 'updateVisualization',
                        data: this._prepareVisualizationData(structure)
                    });
                    this._view.webview.postMessage({
                        type: 'updateProjectStructureForDiagrams',
                        data: structure
                    });
                }
            }, 300); 
        }
    }

    public clearChat() {
        if (this._view) {
            this._view.webview.postMessage({ type: 'clearChat' });
        }
    }

    public showExplanation(text: string, markdown?: string) {
        if (this._view) {
            this._view.webview.postMessage({ 
                type: 'showExplanation', 
                text: text,
                markdown: markdown
            });
        }
    }

    public showProjectOverview(text: string, markdown?: string) {
        if (this._view) {
            this._view.webview.postMessage({ 
                type: 'showProjectOverview', 
                text: text,
                markdown: markdown
            });
        }
    }

    private _handleUserMessage(text: string) {
        vscode.commands.executeCommand('codedoc.handleChatMessage', text);
    }

    private _handleNodeSelection(nodeId: string) {
        vscode.commands.executeCommand('codedoc.explainClass', nodeId);
    }

    private _refreshVisualization() {
        vscode.commands.executeCommand('codedoc.visualizeCode');
    }

    private _generateProjectDocumentation() {
        vscode.commands.executeCommand('codedoc.generateProjectDocs');
    }

    private _generateClassDocumentation() {
        vscode.commands.executeCommand('codedoc.generateClassDocs');
    }

    private _exportClassDocumentation(content: string) {
        vscode.commands.executeCommand('codedoc.exportClassDocs', content);
    }

    private _handleDiagramGeneration(message: any) {
        if (!this._projectStructure) {
            this._view?.webview.postMessage({
                type: 'diagramError',
                error: 'Project structure not available. Please analyze the project first.'
            });
            return;
        }

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

    public showProjectDocumentation(content: string) {
        if (this._view) {
            this._view.webview.postMessage({ 
                type: 'showProjectOverview', 
                text: content
            });
        }
    }

    public showArchitectureDescription(content: string) {
        if (this._view) {
            this._view.webview.postMessage({ 
                type: 'showProjectOverview', 
                text: content
            });
        }
    }

    public showClassDocumentation(content: string) {
        if (this._view) {
            this._view.webview.postMessage({ 
                type: 'showExplanation', 
                text: content
            });
        }
    }

    public showChatResponse(response: any) {
        if (this._view) {
            this._view.webview.postMessage({ 
                type: 'botResponse', 
                text: response.data || response
            });
        }
    }

    public showChatError(error: string) {
        if (this._view) {
            this._view.webview.postMessage({ 
                type: 'botResponse', 
                text: `Error: ${error}`
            });
        }
    }

    private _prepareVisualizationData(structure: ProjectStructure) {
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

    private getNonce() {
        let text = '';
        const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
        for (let i = 0; i < 32; i++) {
            text += possible.charAt(Math.floor(Math.random() * possible.length));
        }
        return text;
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        // Get the nonce for CSP
        const nonce = this.getNonce();
        
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}' 'unsafe-eval'; img-src ${webview.cspSource} data: https:;">
            <title>CodeDoc</title>
            <style>
                body {
                    font-family: var(--vscode-font-family);
                    font-size: var(--vscode-font-size);
                    color: var(--vscode-foreground);
                    background-color: var(--vscode-editor-background);
                    margin: 0;
                    padding: 0;
                    height: 100vh;
                    display: flex;
                    flex-direction: column;
                }
                
                .nav-tabs {
                    display: flex;
                    border-bottom: 1px solid var(--vscode-panel-border);
                    background-color: var(--vscode-tab-inactiveBackground);
                }
                
                .nav-tab {
                    padding: 8px 16px;
                    cursor: pointer;
                    border: none;
                    background: none;
                    color: var(--vscode-tab-inactiveForeground);
                    border-bottom: 2px solid transparent;
                    font-size: 12px;
                    font-weight: 500;
                }
                
                .nav-tab.active {
                    background-color: var(--vscode-tab-activeBackground);
                    color: var(--vscode-tab-activeForeground);
                    border-bottom-color: var(--vscode-tab-activeBorder);
                }
                
                .nav-tab:hover {
                    background-color: var(--vscode-tab-hoverBackground);
                }
                
                .tab-content {
                    flex: 1;
                    display: none;
                    padding: 10px;
                    overflow-y: auto;
                }
                
                .tab-content.active {
                    display: block;
                }
                
                .visualize-btn {
                    padding: 6px 12px;
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                    font-size: 12px;
                    margin: 2px;
                }
                
                .visualize-btn:hover {
                    background-color: var(--vscode-button-hoverBackground);
                }
                
                .visualize-btn.large {
                    padding: 10px 20px;
                    font-size: 14px;
                    font-weight: 500;
                }
                
                .visualize-section {
                    text-align: center;
                    padding: 40px 20px;
                    background-color: var(--vscode-editor-selectionBackground);
                    border-radius: 8px;
                    margin: 20px 0;
                }
                
                .placeholder {
                    text-align: center;
                    color: var(--vscode-descriptionForeground);
                    font-style: italic;
                    padding: 40px 20px;
                }
                
                /* Chat styles */
                .chat-container {
                    display: flex;
                    flex-direction: column;
                    height: 100%;
                }
                
                .chat-messages {
                    flex: 1;
                    overflow-y: auto;
                    margin-bottom: 10px;
                    padding: 5px;
                    border: 1px solid var(--vscode-panel-border);
                    border-radius: 4px;
                    background-color: var(--vscode-input-background);
                }
                
                .message {
                    margin-bottom: 10px;
                    padding: 8px;
                    border-radius: 6px;
                    word-wrap: break-word;
                }
                
                .user-message {
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    margin-left: 20px;
                    text-align: right;
                }
                
                .bot-message {
                    background-color: var(--vscode-editor-selectionBackground);
                    margin-right: 20px;
                }
                
                .chat-input-container {
                    display: flex;
                    gap: 5px;
                }
                
                .chat-input {
                    flex: 1;
                    padding: 6px 10px;
                    border: 1px solid var(--vscode-input-border);
                    background-color: var(--vscode-input-background);
                    color: var(--vscode-input-foreground);
                    border-radius: 4px;
                    resize: none;
                }
                
                .send-button {
                    padding: 6px 12px;
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                }
                
                .documentation-content {
                    padding: 15px;
                    background-color: var(--vscode-editor-background);
                    border: 1px solid var(--vscode-panel-border);
                    border-radius: 4px;
                    max-height: 500px;
                    overflow-y: auto;
                }
            </style>
        </head>
        <body>
            <div style="background: red; color: white; padding: 10px; text-align: center; font-weight: bold;" id="test-div">
                WEBVIEW LOADED - If you see this, HTML is working
            </div>
            <div class="nav-tabs">
                <button class="nav-tab active" id="tab-overview" data-tab="overview">📊 Overview</button>
                <button class="nav-tab" id="tab-chat" data-tab="chat">🤖 AI Assistant</button>
                <button class="nav-tab" id="tab-explanation" data-tab="explanation">📖 Code Explanation</button>
                <button class="nav-tab" id="tab-visualization2" data-tab="visualization2">📈 Visualization</button>
            </div>
            
            <div id="overview-tab" class="tab-content active">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                    <h3 style="margin: 0;">📊 Architecture Overview</h3>
                </div>
                
                <div id="overview-placeholder" class="visualize-section">
                    <p>Click the "Visualize Code" button below to analyze your project and generate a visualization of your code structure.</p>
                    <div style="text-align: center; margin: 20px 0;">
                        <button class="visualize-btn large" onclick="visualizeCode()">🔍 Visualize Code</button>
                    </div>
                    <p><em>This will analyze all Java files in your workspace and show the architecture diagram.</em></p>
                </div>
                
                <div id="overview-content">
                    <div class="placeholder">Click "Visualize Code" to see your project architecture</div>
                </div>
            </div>
            
            <div id="chat-tab" class="tab-content">
                <div class="chat-container">
                    <div class="chat-messages" id="chatMessages">
                        <div class="placeholder">👋 Hi! Ask me about your code structure and documentation!</div>
                    </div>
                    <div class="chat-input-container">
                        <textarea class="chat-input" id="chatInput" placeholder="Ask about your code..." rows="1" onkeydown="handleChatKeydown(event)"></textarea>
                        <button class="send-button" onclick="sendChatMessage()">Send</button>
                    </div>
                </div>
            </div>
            
            <div id="explanation-tab" class="tab-content">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                    <h3 style="margin: 0;">📖 Code Explanation</h3>
                </div>
                
                <div id="explanation-placeholder" class="visualize-section">
                    <p>Generate comprehensive documentation for your code.</p>
                    
                    <div style="margin: 20px 0; text-align: center;">
                        <button class="visualize-btn large" onclick="generateProjectDocs()" style="margin: 10px;">📄 Generate Project Overview</button>
                        <button class="visualize-btn large" onclick="generateClassDocs()" style="margin: 10px;">📑 Generate Class Documentation</button>
                    </div>
                    
                    <p><em>Select code in your editor and click "Generate Class Documentation" to explain the selected code.<br>
                    Click "Generate Project Overview" to create documentation for the entire project.</em></p>
                </div>
                
                <div id="class-documentation-content" style="display: none;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
                        <button class="visualize-btn" onclick="backToExplanation()">↩️ Back to Options</button>
                        <button class="visualize-btn" onclick="exportClassDocs()">💾 Export as File</button>
                    </div>
                    <div id="class-documentation-text" class="documentation-content"></div>
                </div>
            </div>
            
            <div id="visualization2-tab" class="tab-content">
                <div class="placeholder">Diagram generator will be added here</div>
            </div>
            
            <script nonce="${nonce}">
                // Simple test - change the test div if JavaScript works
                document.getElementById('test-div').innerHTML = 'JAVASCRIPT IS WORKING!';
                document.getElementById('test-div').style.background = 'green';
                
                var vscode = acquireVsCodeApi();
                
                // Add event listeners to tabs
                document.addEventListener('DOMContentLoaded', function() {
                    const tabs = document.querySelectorAll('.nav-tab');
                    tabs.forEach(tab => {
                        tab.addEventListener('click', () => {
                            switchTab(tab.getAttribute('data-tab'));
                        });
                    });
                });
                
                function switchTab(tabName) {
                    // Remove active class from all tabs and contents
                    document.querySelectorAll('.nav-tab').forEach(tab => {
                        tab.classList.remove('active');
                    });
                    
                    document.querySelectorAll('.tab-content').forEach(content => {
                        content.classList.remove('active');
                        content.style.display = 'none';
                    });
                    
                    // Add active class to selected tab and content
                    const activeTab = document.querySelector('[data-tab="' + tabName + '"]');
                    if (activeTab) {
                        activeTab.classList.add('active');
                    }
                    
                    const activeContent = document.getElementById(tabName + '-tab');
                    if (activeContent) {
                        activeContent.classList.add('active');
                        activeContent.style.display = 'block';
                    }
                }
                
                function visualizeCode() {
                    vscode.postMessage({ type: 'refreshVisualization' });
                }
                
                function sendChatMessage() {
                    var chatInput = document.getElementById('chatInput');
                    var message = chatInput.value.trim();
                    if (message) {
                        addUserMessage(message);
                        vscode.postMessage({ type: 'sendMessage', text: message });
                        chatInput.value = '';
                    }
                }
                
                function handleChatKeydown(event) {
                    if (event.key === 'Enter' && !event.shiftKey) {
                        event.preventDefault();
                        sendChatMessage();
                    }
                }
                
                function generateProjectDocs() {
                    vscode.postMessage({ type: 'generateProjectDocs' });
                }
                
                function generateClassDocs() {
                    vscode.postMessage({ type: 'generateClassDocs' });
                }
                
                function exportClassDocs() {
                    var content = document.getElementById('class-documentation-text').innerHTML;
                    vscode.postMessage({ type: 'exportClassDocs', content: content });
                }
                
                function backToExplanation() {
                    document.getElementById('explanation-placeholder').style.display = 'block';
                    document.getElementById('class-documentation-content').style.display = 'none';
                }
                
                function addUserMessage(message) {
                    var chatMessages = document.getElementById('chatMessages');
                    var placeholder = chatMessages.querySelector('.placeholder');
                    if (placeholder) {
                        placeholder.remove();
                    }
                    
                    var messageDiv = document.createElement('div');
                    messageDiv.className = 'message user-message';
                    messageDiv.textContent = message;
                    chatMessages.appendChild(messageDiv);
                    chatMessages.scrollTop = chatMessages.scrollHeight;
                }
                
                function addBotMessage(message) {
                    var chatMessages = document.getElementById('chatMessages');
                    var placeholder = chatMessages.querySelector('.placeholder');
                    if (placeholder) {
                        placeholder.remove();
                    }
                    
                    var messageDiv = document.createElement('div');
                    messageDiv.className = 'message bot-message';
                    messageDiv.innerHTML = message;
                    chatMessages.appendChild(messageDiv);
                    chatMessages.scrollTop = chatMessages.scrollHeight;
                }
                
                function showDocumentation(content) {
                    document.getElementById('explanation-placeholder').style.display = 'none';
                    document.getElementById('class-documentation-content').style.display = 'block';
                    
                    var docElement = document.getElementById('class-documentation-text');
                    if (content && typeof content === 'string') {
                        var htmlContent = content
                            .replace(/^# (.*$)/gim, '<h1>$1</h1>')
                            .replace(/^## (.*$)/gim, '<h2>$1</h2>')
                            .replace(/^### (.*$)/gim, '<h3>$1</h3>')
                            .replace(/\*\*(.*)\*\*/gim, '<strong>$1</strong>')
                            .replace(/\*(.*)\*/gim, '<em>$1</em>')
                            .replace(/\n/gim, '<br>');
                        
                        docElement.innerHTML = htmlContent;
                    } else {
                        docElement.innerHTML = content;
                    }
                }
                
                // Handle messages from extension
                window.addEventListener('message', function(event) {
                    var message = event.data;
                    switch (message.type) {
                        case 'botResponse':
                            addBotMessage(message.text);
                            break;
                        case 'showExplanation':
                            showDocumentation(message.text);
                            switchTab('explanation');
                            break;
                        case 'showProjectOverview':
                            showDocumentation(message.text);
                            switchTab('explanation');
                            break;
                    }
                });
            </script>
        </body>
        </html>`;
    }

}