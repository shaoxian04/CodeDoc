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
class MainViewProvider {
    _extensionUri;
    static viewType = 'codedoc.mainView';
    _view;
    _projectStructure;
    constructor(_extensionUri) {
        this._extensionUri = _extensionUri;
    }
    resolveWebviewView(webviewView, context, _token) {
        this._view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };
        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
        webviewView.webview.onDidReceiveMessage(message => {
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
                // case 'generateDiagram':
                //     this._handleDiagramGeneration(message);
                //     break;
                // case 'exportDiagram':
                //     this._handleDiagramExport(message.diagramData);
                //     break;
                // case 'previewDiagram':
                //     this._handleDiagramPreview(message.diagramData);
                //     break;
                // case 'saveDiagramToDocs':
                //     this._handleSaveDiagramToDocs(message.diagramData);
                //     break;
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
        }
    }
    clearChat() {
        if (this._view) {
            this._view.webview.postMessage({ type: 'clearChat' });
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
    _handleUserMessage(message) {
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
    //TODO: check this visualization function
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
    _getHtmlForWebview(webview) {
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
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
                    display: flex;
                    flex-direction: column;
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
                
                .send-button, .visualize-btn {
                    padding: 6px 12px;
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                }
                
                .send-button:hover, .visualize-btn:hover {
                    background-color: var(--vscode-button-hoverBackground);
                }
                
                .visualization {
                    flex: 1;
                    background-color: var(--vscode-input-background);
                    overflow-y: auto;
                    padding: 10px;
                    display: flex;
                    flex-direction: column;
                    gap: 15px;
                }
                
                .stats-panel {
                    background-color: var(--vscode-editor-selectionBackground);
                    padding: 10px;
                    border-radius: 4px;
                    font-size: 12px;
                }
                
                .stats-grid {
                    display: grid;
                    grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
                    gap: 10px;
                }
                
                .stat-item {
                    text-align: center;
                }
                
                .stat-number {
                    font-size: 18px;
                    font-weight: bold;
                    color: var(--vscode-button-background);
                }
                
                .stat-label {
                    font-size: 10px;
                    color: var(--vscode-descriptionForeground);
                }
                
                .architecture-layers-container {
                    display: flex;
                    flex-direction: column;
                    gap: 20px;
                }
                
                .architecture-layer {
                    border: 1px solid var(--vscode-panel-border);
                    border-radius: 6px;
                    overflow: hidden;
                }
                
                .layer-header {
                    background-color: var(--vscode-tab-inactiveBackground);
                    padding: 8px 12px;
                    font-weight: bold;
                    font-size: 13px;
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    cursor: pointer;
                }
                
                .layer-header:hover {
                    background-color: var(--vscode-tab-hoverBackground);
                }
                
                .layer-header.controller {
                    background-color: #28a745;
                    color: white;
                }
                
                .layer-header.service {
                    background-color: #007bff;
                    color: white;
                }
                
                .layer-header.repository {
                    background-color: #fd7e14;
                    color: white;
                }
                
                .layer-header.entity {
                    background-color: #6610f2;
                    color: white;
                }
                
                .layer-content {
                    padding: 10px;
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
                    gap: 10px;
                }
                
                .layer-content.collapsed {
                    display: none;
                }
                
                .class-card {
                    border: 1px solid var(--vscode-button-background);
                    border-radius: 4px;
                    padding: 8px;
                    background-color: var(--vscode-input-background);
                    cursor: pointer;
                    transition: all 0.2s;
                }
                
                .class-card:hover {
                    background-color: var(--vscode-button-hoverBackground);
                    transform: translateY(-1px);
                }
                
                .class-name {
                    font-weight: bold;
                    margin-bottom: 4px;
                    color: var(--vscode-foreground);
                }
                
                .class-info {
                    font-size: 11px;
                    color: var(--vscode-descriptionForeground);
                    margin-bottom: 2px;
                }
                
                .class-dependencies {
                    font-size: 10px;
                    color: var(--vscode-button-background);
                    margin-top: 4px;
                }
                
                .dependency-arrow {
                    margin: 10px 0;
                    text-align: center;
                    color: var(--vscode-descriptionForeground);
                    position: relative;
                }
                
                .dependency-arrow::before {
                    content: '';
                    position: absolute;
                    left: 50%;
                    top: 50%;
                    transform: translateX(-50%);
                    width: 2px;
                    height: 20px;
                    background: linear-gradient(to bottom, transparent, var(--vscode-descriptionForeground), transparent);
                }
                
                .collapse-toggle {
                    background: none;
                    border: none;
                    color: inherit;
                    cursor: pointer;
                    font-size: 12px;
                }
                
                .info-panel {
                    position: fixed;
                    top: 10px;
                    right: 10px;
                    width: 250px;
                    background-color: var(--vscode-editor-background);
                    border: 1px solid var(--vscode-panel-border);
                    border-radius: 4px;
                    padding: 10px;
                    font-size: 11px;
                    display: none;
                    z-index: 100;
                    box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                }
                
                .info-panel.visible {
                    display: block;
                }
                
                .info-panel h4 {
                    margin: 0 0 8px 0;
                    color: var(--vscode-button-background);
                }
                
                .placeholder {
                    text-align: center;
                    color: var(--vscode-descriptionForeground);
                    font-style: italic;
                    padding: 20px;
                }
                
                .visualize-section {
                    text-align: center;
                    padding: 20px;
                }
                
                .visualize-btn.large {
                    padding: 10px 20px;
                    font-size: 14px;
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                }
                
                #visualization-content {
                    display: none;
                }
                
                .documentation-content {
                    font-family: var(--vscode-editor-font-family);
                    line-height: 1.6;
                }
                
                .documentation-content h1 {
                    font-size: 1.8em;
                    font-weight: bold;
                    margin: 0.67em 0;
                    color: var(--vscode-foreground);
                }
                
                .documentation-content h2 {
                    font-size: 1.5em;
                    font-weight: bold;
                    margin: 0.83em 0;
                    color: var(--vscode-foreground);
                }
                
                .documentation-content h3 {
                    font-size: 1.3em;
                    font-weight: bold;
                    margin: 1em 0;
                    color: var(--vscode-foreground);
                }
                
                .documentation-content h4 {
                    font-size: 1.1em;
                    font-weight: bold;
                    margin: 1.33em 0;
                    color: var(--vscode-foreground);
                }
                
                .documentation-content p {
                    margin: 1em 0;
                    color: var(--vscode-foreground);
                }
                
                .documentation-content ul, .documentation-content ol {
                    margin: 1em 0;
                    padding-left: 2em;
                }
                
                .documentation-content li {
                    margin: 0.5em 0;
                    color: var(--vscode-foreground);
                }
                
                .documentation-content code {
                    font-family: var(--vscode-editor-font-family);
                    background-color: var(--vscode-textBlockQuote-background);
                    padding: 0.2em 0.4em;
                    border-radius: 3px;
                    color: var(--vscode-foreground);
                }
                
                .documentation-content pre {
                    background-color: var(--vscode-textBlockQuote-background);
                    padding: 1em;
                    border-radius: 5px;
                    overflow-x: auto;
                }
                
                .documentation-content pre code {
                    background-color: transparent;
                    padding: 0;
                }
                
                .documentation-content blockquote {
                    margin: 1em 0;
                    padding: 0.5em 1em;
                    border-left: 4px solid var(--vscode-button-background);
                    background-color: var(--vscode-textBlockQuote-background);
                }
                
                .documentation-content table {
                    border-collapse: collapse;
                    width: 100%;
                    margin: 1em 0;
                }
                
                .documentation-content th, .documentation-content td {
                    border: 1px solid var(--vscode-panel-border);
                    padding: 0.5em;
                    text-align: left;
                }
                
                .documentation-content th {
                    background-color: var(--vscode-tab-inactiveBackground);
                    font-weight: bold;
                }
                .documentation-content * {
                    box-sizing: border-box;
                }
                
                .documentation-content a {
                    color: var(--vscode-textLink-foreground);
                    text-decoration: none;
                }
                
                .documentation-content a:hover {
                    text-decoration: underline;
                }
                
                .documentation-content hr {
                    border: 0;
                    border-top: 1px solid var(--vscode-panel-border);
                    margin: 1em 0;
                }
                
                .documentation-content img {
                    max-width: 100%;
                    height: auto;
                }
                
                /* Mermaid diagram styling */
                .mermaid {
                    text-align: center;
                    margin: 20px 0;
                    background-color: var(--vscode-editor-background);
                    border: 1px solid var(--vscode-panel-border);
                    border-radius: 4px;
                    padding: 10px;
                }
                
                .mermaid svg {
                    max-width: 100%;
                    height: auto;
                }
                
                /* Architecture description styling */
                .architecture-description {
                    padding: 20px;
                    max-width: 100%;
                    overflow-y: auto;
                }
                
                .architecture-description h3 {
                    color: var(--vscode-foreground);
                    margin-bottom: 15px;
                    text-align: center;
                }
                
                .architecture-content {
                    background-color: var(--vscode-editor-background);
                    border: 1px solid var(--vscode-panel-border);
                    border-radius: 4px;
                    padding: 15px;
                    line-height: 1.6;
                }
                
                .architecture-content h1,
                .architecture-content h2,
                .architecture-content h3,
                .architecture-content h4 {
                    color: var(--vscode-foreground);
                    margin-top: 20px;
                    margin-bottom: 10px;
                }
                
                .architecture-content p {
                    margin: 10px 0;
                    color: var(--vscode-foreground);
                }
                
                .architecture-content ul,
                .architecture-content ol {
                    margin: 10px 0;
                    padding-left: 20px;
                }
                
                .architecture-content li {
                    margin: 5px 0;
                    color: var(--vscode-foreground);
                }
                
                .architecture-content code {
                    background-color: var(--vscode-textBlockQuote-background);
                    padding: 2px 4px;
                    border-radius: 3px;
                    font-family: var(--vscode-editor-font-family);
                }
                
                /* Diagram Generator Styling */
                .diagram-generator {
                    padding: 20px;
                    max-width: 100%;
                }
                
                .diagram-generator h3 {
                    color: var(--vscode-foreground);
                    margin-bottom: 20px;
                    text-align: center;
                    border-bottom: 1px solid var(--vscode-panel-border);
                    padding-bottom: 10px;
                }
                
                .generator-controls {
                    background-color: var(--vscode-input-background);
                    border: 1px solid var(--vscode-panel-border);
                    border-radius: 6px;
                    padding: 20px;
                    margin-bottom: 20px;
                }
                
                .control-group {
                    margin-bottom: 15px;
                }
                
                .control-group label {
                    display: block;
                    color: var(--vscode-foreground);
                    font-weight: 500;
                    margin-bottom: 5px;
                }
                
                .control-select {
                    width: 100%;
                    padding: 8px 12px;
                    background-color: var(--vscode-input-background);
                    border: 1px solid var(--vscode-input-border);
                    border-radius: 4px;
                    color: var(--vscode-input-foreground);
                    font-size: 14px;
                }
                
                .control-select:focus {
                    outline: none;
                    border-color: var(--vscode-focusBorder);
                }
                
                .radio-group {
                    display: flex;
                    gap: 15px;
                    margin-top: 5px;
                }
                
                .radio-label {
                    display: flex;
                    align-items: center;
                    gap: 5px;
                    color: var(--vscode-foreground);
                    cursor: pointer;
                    font-weight: normal;
                }
                
                .radio-label input[type="radio"] {
                    margin: 0;
                }
                
                .button-group {
                    display: flex;
                    gap: 10px;
                    margin-top: 20px;
                    flex-wrap: wrap;
                }
                
                .visualize-btn.primary {
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    flex: 1;
                    min-width: 150px;
                }
                
                .visualize-btn.secondary {
                    background-color: var(--vscode-button-secondaryBackground);
                    color: var(--vscode-button-secondaryForeground);
                    border: 1px solid var(--vscode-button-border);
                }
                
                .visualize-btn.small {
                    padding: 4px 8px;
                    font-size: 12px;
                    min-width: auto;
                }
                
                .visualize-btn:disabled {
                    opacity: 0.5;
                    cursor: not-allowed;
                }
                
                .diagram-result {
                    background-color: var(--vscode-editor-background);
                    border: 1px solid var(--vscode-panel-border);
                    border-radius: 6px;
                    overflow: hidden;
                }
                
                .diagram-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 15px 20px;
                    background-color: var(--vscode-tab-inactiveBackground);
                    border-bottom: 1px solid var(--vscode-panel-border);
                }
                
                .diagram-header h4 {
                    margin: 0;
                    color: var(--vscode-foreground);
                }
                
                .diagram-actions {
                    display: flex;
                    gap: 8px;
                }
                
                .diagram-content {
                    padding: 20px;
                    max-height: 500px;
                    overflow: auto;
                    background-color: var(--vscode-editor-background);
                }
                
                .diagram-info {
                    padding: 10px 20px;
                    background-color: var(--vscode-tab-inactiveBackground);
                    border-top: 1px solid var(--vscode-panel-border);
                    color: var(--vscode-descriptionForeground);
                }
                
                .loading-indicator {
                    text-align: center;
                    padding: 40px;
                    color: var(--vscode-foreground);
                }
                
                .spinner {
                    border: 3px solid var(--vscode-progressBar-background);
                    border-top: 3px solid var(--vscode-button-background);
                    border-radius: 50%;
                    width: 30px;
                    height: 30px;
                    animation: spin 1s linear infinite;
                    margin: 0 auto 15px;
                }
                
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
                
                .analysis-status {
                    text-align: center;
                    padding: 30px;
                    color: var(--vscode-foreground);
                    background-color: var(--vscode-editor-selectionBackground);
                    border-radius: 8px;
                    margin: 20px 0;
                }
                
                .analysis-status p {
                    margin: 10px 0 5px 0;
                    font-weight: 500;
                }
                
                .analysis-status small {
                    color: var(--vscode-descriptionForeground);
                    font-style: italic;
                }
            </style>
        </head>
        <body>
            <div class="nav-tabs">
                <button class="nav-tab active" id="tab-overview">📊 Overview</button>
                <button class="nav-tab" id="tab-chat">🤖 AI Assistant</button>
                <button class="nav-tab" id="tab-explanation">📖 Code Explanation</button>
                <button class="nav-tab" id="tab-visualization2">📈 Visualization </button>
            </div>
            <div id="overview-tab" class="tab-content active">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                    <h3 style="margin: 0;">📊 Architecture Overview</h3>
                </div>
                
                <div id="overview-placeholder" class="visualize-section">
                    <p>Click the "Visualize Code" button above to analyze your project and generate a visualization of your code structure.</p>
                    <button class="visualize-btn large" id="visualize-btn-large">🔍 Get Overview</button>
                    <p><em>This will analyze all Java files in your workspace and show the architecture diagram.</em></p>
                </div>
                
                <div class="stats-panel" id="statsPanel" style="display: none;">
                    <div class="stats-grid" id="statsGrid"></div>
                </div>
                <div class="visualization" id="overview-content">
                    <div class="placeholder">Click "Visualize Code" to see your project architecture</div>
                </div>
                
                <div class="info-panel" id="infoPanel">
                    <h4 id="infoPanelTitle">Class Details</h4>
                    <div id="infoPanelContent"></div>
                </div>
            </div>
            
            <div id="chat-tab" class="tab-content">
                <div class="chat-container">
                    <div class="chat-messages" id="chatMessages">
                        <div class="placeholder">👋 Hi! Ask me about your code structure and documentation!</div>
                    </div>
                    <div class="chat-input-container">
                        <textarea class="chat-input" id="chatInput" placeholder="Ask about your code..." rows="1"></textarea>
                        <button class="send-button" id="sendButton">Send</button>
                    </div>
                </div>
            </div>
            
            <div id="explanation-tab" class="tab-content">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                    <h3 style="margin: 0;">📖 Code Explanation</h3>
                </div>
                
                <div id="explanation-placeholder" class="visualize-section">
                    <p>Generate documentation for your code directly from this panel.</p>
                    
                    <div style="margin: 20px 0; text-align: center;">
                        <button class="visualize-btn large" id="generate-project-doc-btn" style="margin: 10px;">📄 Generate Project Overview</button>
                        <button class="visualize-btn large" id="generate-class-doc-btn" style="margin: 10px;">📑 Generate Class Documentation</button>
                    </div>
                    
                    <p><em>Select code in your editor and click "Generate Class Documentation" to explain the selected code.<br>
                    Click "Generate Project Overview" to create documentation for the entire project.</em></p>
                </div>
                
                <div id="class-documentation-content" style="display: none;">
                    <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
                        <button class="visualize-btn" id="back-to-explanation-btn">↩️ Back to Options</button>
                        <button class="visualize-btn" id="export-class-doc-btn">💾 Export as File</button>
                    </div>
                    <div id="class-documentation-text" class="documentation-content"></div>
                </div>
            </div>

            <div id="visualization2-tab" class="tab-content">
                <div class="diagram-generator">
                    <h3>📊 Diagram Generator</h3>
                    
                    <div class="generator-controls">
                        <div class="control-group">
                            <label for="diagramType">Diagram Type:</label>
                            <select id="diagramType" class="control-select">
                                <option value="component">Component Diagram</option>
                                <option value="layered">Layered Architecture</option>
                                <option value="class">Class Diagram</option>
                                <option value="package">Package Dependencies</option>
                                <option value="sequence">Sequence Diagram</option>
                            </select>
                        </div>
                        
                        <div class="control-group">
                            <label>Scope:</label>
                            <div class="radio-group">
                                <label class="radio-label">
                                    <input type="radio" name="scope" value="project" checked> Whole Project
                                </label>
                                <label class="radio-label">
                                    <input type="radio" name="scope" value="module"> Specific Module
                                </label>
                            </div>
                        </div>
                        
                        <div class="control-group" id="moduleSelector" style="display: none;">
                            <label for="moduleSelect">Package/Module:</label>
                            <select id="moduleSelect" class="control-select">
                                <option value="">Select a package...</option>
                            </select>
                        </div>
                        
                        <div class="button-group">
                            <button id="generateDiagramBtn" class="visualize-btn primary">🎨 Generate Diagram</button>
                            <button id="exportDiagramBtn" class="visualize-btn secondary" disabled>💾 Export as .md</button>
                            <button id="copyDiagramBtn" class="visualize-btn secondary" disabled>📋 Copy</button>
                            <button id="testMermaidBtn" class="visualize-btn secondary">🧪 Test Mermaid</button>
                        </div>
                    </div>
                    
                    <div id="diagramResult" class="diagram-result" style="display: none;">
                        <div class="diagram-header">
                            <h4 id="diagramTitle">Generated Diagram</h4>
                            <div class="diagram-actions">
                                <button id="previewInVSCodeBtn" class="visualize-btn small">👁 Preview in VS Code</button>
                                <button id="saveToDocs" class="visualize-btn small">📁 Save to docs/</button>
                            </div>
                        </div>
                        <div id="diagramContent" class="diagram-content"></div>
                        <div class="diagram-info">
                            <small id="diagramStats"></small>
                        </div>
                    </div>
                    
                    <div id="diagramLoading" class="loading-indicator" style="display: none;">
                        <div class="spinner"></div>
                        <p>Generating diagram...</p>
                    </div>
                    
                    <div id="projectAnalysisStatus" class="analysis-status" style="display: none;">
                        <div class="spinner"></div>
                        <p>Analyzing project structure...</p>
                        <small>This may take a moment for large projects</small>
                    </div>
                </div>
            </div>
            
            <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>

            <script>
        const vscode = acquireVsCodeApi();

        if (typeof mermaid !== 'undefined') {
            console.log('Mermaid library loaded successfully');
            mermaid.initialize({ 
                startOnLoad: false, 
                theme: 'dark',
                themeVariables: {
                darkMode: true,
                primaryColor: '#bb86fc',
                primaryTextColor: '#ffffff',
                primaryBorderColor: '#bb86fc',
                lineColor: '#ffffff',
                secondaryColor: '#03dac6',
                tertiaryColor: '#cf6679'
                }
            });
                    console.log('Mermaid initialized with dark theme');
        } else {
            console.error('Mermaid library not found!');
        }

        function switchTab(tabName) {
            const tabs = ['overview', 'chat', 'explanation', 'visualization2'];

            tabs.forEach(name => {
                const tabContent = document.getElementById(name + '-tab');
                const tabButton = document.getElementById('tab-' + name);

                if (tabContent) {
                    tabContent.classList.toggle('active', name === tabName);
                }
                if (tabButton) {
                    tabButton.classList.toggle('active', name === tabName);
                }
            });
            
            if (tabName === 'explanation') {
                const documentationContent = document.getElementById('class-documentation-content');
                const placeholder = document.getElementById('explanation-placeholder');
                
                if (documentationContent && documentationContent.style.display !== 'none') {
                    // Documentation is already visible, keep it that way
                } else {
                    if (placeholder) {
                        placeholder.style.display = 'block';
                    }
                    if (documentationContent) {
                        documentationContent.style.display = 'none';
                    }
                }
            }
        }

        function refreshVisualization() {
            vscode.postMessage({ type: 'refreshVisualization' });
        }

        function generateProjectDocumentation() {
            vscode.postMessage({ type: 'generateProjectDocs' });
        }

        function generateClassDocumentation() {
            vscode.postMessage({ type: 'generateClassDocs' });
        }

        function exportClassDocumentation() {
            const contentContainer = document.getElementById('class-documentation-content');
            // Use stored markdown content if available, otherwise use HTML content
            const markdownContent = contentContainer.dataset.markdown;
            const content = markdownContent || document.getElementById('class-documentation-text').innerHTML;
            vscode.postMessage({ type: 'exportClassDocs', content: content });
        }

        function showClassDocumentation(content) {
            console.log('showClassDocumentation called in webview with content length:', content ? content.length : 0);
                    if (content) {
                        console.log('Content preview:', content.substring(0, Math.min(200, content.length)) + (content.length > 200 ? '...' : ''));
                    }
                    
                    document.getElementById('explanation-placeholder').style.display = 'none';
                    document.getElementById('class-documentation-content').style.display = 'block';
                    const docTextElement = document.getElementById('class-documentation-text');
                    
                    // Check if content is already HTML or needs to be converted
                    const isHtml = content && (content.startsWith('<') || content.includes('<h1') || content.includes('<p>') || content.includes('<div'));
                    console.log('Content is HTML in webview:', isHtml);
                    
                    if (isHtml) {
                        // Content is already HTML
                        console.log('Content is already HTML, using as-is');
                        docTextElement.innerHTML = content;
                    } else {
                        // Content is markdown, convert it to HTML
                        console.log('Converting markdown to HTML in webview');
                        try {
                            const convertedHtml = marked(content || '');
                            console.log('Converted HTML length:', convertedHtml.length);
                            if (convertedHtml) {
                                console.log('Converted HTML preview:', convertedHtml.substring(0, Math.min(200, convertedHtml.length)) + (convertedHtml.length > 200 ? '...' : ''));
                            }
                            docTextElement.innerHTML = convertedHtml;
                        } catch (error) {
                            console.error('Error converting markdown to HTML in webview:', error);
                            docTextElement.innerHTML = '<pre>' + (content || '') + '</pre>';
                        }
                    }
                    
                    // Force reflow to ensure proper rendering
                    docTextElement.style.display = 'none';
                    docTextElement.offsetHeight; // Trigger reflow
                    docTextElement.style.display = 'block';
                    
                    // Apply styling to markdown elements and process Mermaid diagrams
                    setTimeout(() => {
                        applyMarkdownStyling(docTextElement);
                        processMermaidDiagrams(docTextElement);
                    }, 100);
        }

        function showProjectDocumentation(content) {
            console.log('showProjectDocumentation called in webview with content length:', content ? content.length : 0);
                    if (content) {
                        console.log('Content preview:', content.substring(0, Math.min(200, content.length)) + (content.length > 200 ? '...' : ''));
                    }
                    
                    document.getElementById('explanation-placeholder').style.display = 'none';
                    document.getElementById('class-documentation-content').style.display = 'block';
                    const docTextElement = document.getElementById('class-documentation-text');
                    
                    // Check if content is already HTML or needs to be converted
                    const isHtml = content && (content.startsWith('<') || content.includes('<h1') || content.includes('<p>') || content.includes('<div'));
                    console.log('Content is HTML in webview:', isHtml);
                    
                    if (isHtml) {
                        // Content is already HTML
                        console.log('Content is already HTML, using as-is');
                        docTextElement.innerHTML = content;
                    } else {
                        // Content is markdown, convert it to HTML
                        console.log('Converting markdown to HTML in webview');
                        try {
                            const convertedHtml = marked(content || '');
                            console.log('Converted HTML length:', convertedHtml.length);
                            if (convertedHtml) {
                                console.log('Converted HTML preview:', convertedHtml.substring(0, Math.min(200, convertedHtml.length)) + (convertedHtml.length > 200 ? '...' : ''));
                            }
                            docTextElement.innerHTML = convertedHtml;
                        } catch (error) {
                            console.error('Error converting markdown to HTML in webview:', error);
                            docTextElement.innerHTML = '<pre>' + (content || '') + '</pre>';
                        }
                    }
                    
                    // Force reflow to ensure proper rendering
                    docTextElement.style.display = 'none';
                    docTextElement.offsetHeight; // Trigger reflow
                    docTextElement.style.display = 'block';
                    
                    // Apply styling to markdown elements and process Mermaid diagrams
                    setTimeout(() => {
                        applyMarkdownStyling(docTextElement);
                        processMermaidDiagrams(docTextElement);
                    }, 100);
        }
        function processMermaidDiagrams(element) {
                    console.log('Processing Mermaid diagrams...');
                    console.log('Element HTML:', element.innerHTML);
                    
                    // Find all code blocks that might contain Mermaid
                    const codeBlocks = element.querySelectorAll('pre code, code');
                    console.log('Found code blocks:', codeBlocks.length);
                    let mermaidCount = 0;
                    
                    codeBlocks.forEach((block, index) => {
                        const content = block.textContent || '';
                        
                        // Check if this is a Mermaid diagram
                        if (content.trim().startsWith('erDiagram') || 
                            content.trim().startsWith('classDiagram') || 
                            content.trim().startsWith('graph') ||
                            content.trim().startsWith('flowchart') ||
                            content.trim().startsWith('sequenceDiagram') ||
                            content.trim().startsWith('gantt') ||
                            content.trim().startsWith('pie') ||
                            content.trim().startsWith('gitgraph')) {
                            
                            console.log('Found Mermaid diagram:', content.substring(0, 50) + '...');
                            
                            // Create a new div for the Mermaid diagram
                            const mermaidDiv = document.createElement('div');
                            mermaidDiv.className = 'mermaid';
                            mermaidDiv.textContent = content.trim();
                            mermaidDiv.id = 'mermaid-' + Date.now() + '-' + mermaidCount;
                            mermaidDiv.style.textAlign = 'center';
                            mermaidDiv.style.margin = '20px 0';
                            mermaidDiv.style.backgroundColor = 'var(--vscode-editor-background)';
                            mermaidDiv.style.padding = '20px';
                            mermaidDiv.style.borderRadius = '8px';
                            mermaidDiv.style.border = '1px solid var(--vscode-panel-border)';
                            
                            // Replace the code block with the Mermaid div
                            const parentPre = block.closest('pre');
                            if (parentPre) {
                                parentPre.replaceWith(mermaidDiv);
                            } else {
                                block.replaceWith(mermaidDiv);
                            }
                            
                            mermaidCount++;
                        }
                    });
                    
                    // Render Mermaid diagrams if any were found
                    if (mermaidCount > 0 && typeof mermaid !== 'undefined') {
                        console.log('Rendering ' + mermaidCount + ' Mermaid diagrams...');
                        try {
                            // Use mermaid.run() to render all diagrams with class 'mermaid'
                            mermaid.run({
                                querySelector: '.mermaid'
                            });
                            console.log('Mermaid diagrams rendered successfully');
                        } catch (error) {
                            console.error('Error rendering Mermaid diagrams:', error);
                            // Fallback: try the older API
                            try {
                                mermaid.init(undefined, '.mermaid');
                                console.log('Mermaid diagrams rendered with fallback method');
                            } catch (fallbackError) {
                                console.error('Fallback rendering also failed:', fallbackError);
                            }
                        }
                    } else if (mermaidCount > 0) {
                        console.error('Mermaid library not available');
                    }
                }

                function applyMarkdownStyling(element) {
                    // Apply styling to all markdown elements
                    element.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach(el => {
                        el.style.marginTop = '1em';
                        el.style.marginBottom = '0.5em';
                        el.style.color = 'var(--vscode-foreground)';
                    });
                    element.querySelectorAll('p').forEach(el => {
                        el.style.marginTop = '0.5em';
                        el.style.marginBottom = '0.5em';
                        el.style.color = 'var(--vscode-foreground)';
                    });
                    element.querySelectorAll('ul, ol').forEach(el => {
                        el.style.paddingLeft = '2em';
                        el.style.marginTop = '0.5em';
                        el.style.marginBottom = '0.5em';
                    });
                    element.querySelectorAll('li').forEach(el => {
                        el.style.marginTop = '0.25em';
                        el.style.marginBottom = '0.25em';
                    });
                    element.querySelectorAll('code').forEach(el => {
                        el.style.fontFamily = 'var(--vscode-editor-font-family)';
                        el.style.backgroundColor = 'var(--vscode-textBlockQuote-background)';
                        el.style.padding = '0.2em 0.4em';
                        el.style.borderRadius = '3px';
                        el.style.color = 'var(--vscode-foreground)';
                    });
                    element.querySelectorAll('pre').forEach(el => {
                        el.style.backgroundColor = 'var(--vscode-textBlockQuote-background)';
                        el.style.padding = '1em';
                        el.style.borderRadius = '5px';
                        el.style.overflowX = 'auto';
                        el.style.marginTop = '1em';
                        el.style.marginBottom = '1em';
                    });
                    element.querySelectorAll('blockquote').forEach(el => {
                        el.style.margin = '1em 0';
                        el.style.padding = '0.5em 1em';
                        el.style.borderLeft = '4px solid var(--vscode-button-background)';
                        el.style.backgroundColor = 'var(--vscode-textBlockQuote-background)';
                    });
                    element.querySelectorAll('table').forEach(el => {
                        el.style.borderCollapse = 'collapse';
                        el.style.width = '100%';
                        el.style.margin = '1em 0';
                    });
                    element.querySelectorAll('th, td').forEach(el => {
                        el.style.border = '1px solid var(--vscode-panel-border)';
                        el.style.padding = '0.5em';
                        el.style.textAlign = 'left';
                    });
                    element.querySelectorAll('th').forEach(el => {
                        el.style.backgroundColor = 'var(--vscode-tab-inactiveBackground)';
                        el.style.fontWeight = 'bold';
                    });
                    element.querySelectorAll('a').forEach(el => {
                        el.style.color = 'var(--vscode-textLink-foreground)';
                        el.style.textDecoration = 'none';
                    });
                    element.querySelectorAll('a:hover').forEach(el => {
                        el.style.textDecoration = 'underline';
                    });
                    element.querySelectorAll('hr').forEach(el => {
                        el.style.border = '0';
                        el.style.borderTop = '1px solid var(--vscode-panel-border)';
                        el.style.margin = '1em 0';
                    });
                }

        function showExplanationOptions() {
            document.getElementById('explanation-placeholder').style.display = 'block';
            document.getElementById('class-documentation-content').style.display = 'none';
        }

        function renderVisualization(data) {
            const visualizationContent = document.getElementById('overview-content');
            const statsPanel = document.getElementById('statsPanel');
            const statsGrid = document.getElementById('statsGrid');
            const placeholder = document.getElementById('overview-placeholder');
            
            placeholder.style.display = 'none';
            visualizationContent.style.display = 'flex';
            statsPanel.style.display = 'block';
        

        statsGrid.innerHTML = \`
            <div class="stat-item">
                <div class="stat-number">\${data.stats.totalClasses}</div>
                <div class="stat-label">Classes</div>
            </div>
            <div class="stat-item">
                <div class="stat-number">\${data.stats.controllers}</div>
                <div class="stat-label">Controllers</div>
            </div>
            <div class="stat-item">
                <div class="stat-number">\${data.stats.services}</div>
                <div class="stat-label">Services</div>
            </div>
            <div class="stat-item">
                <div class="stat-number">\${data.stats.repositories}</div>
                <div class="stat-label">Repositories</div>
            </div>
            <div class="stat-item">
                <div class="stat-number">\${data.stats.entities}</div>
                <div class="stat-label">Entities</div>
            </div>
            <div class="stat-item">
                <div class="stat-number">\${data.stats.dependencies}</div>
                <div class="stat-label">Dependencies</div>
            </div>
        \`;
        
        visualizationContent.innerHTML = '<div class="architecture-layers-container"></div>';
        const layersContainer = visualizationContent.querySelector('.architecture-layers-container');
        
        // Controllers layer
        if (data.layers.controllers.length > 0) {
            const controllerLayer = document.createElement('div');
            controllerLayer.className = 'architecture-layer';
            controllerLayer.innerHTML = \`
                <div class="layer-header controller">
                    <span>Controller Layer (\${data.layers.controllers.length})</span>
                </div>
                <div class="layer-content">
                    \${data.layers.controllers.map(cls => \`
                        <div class="class-card" data-id="\${cls.name}">
                            <div class="class-name">\${cls.name}</div>
                            <div class="class-info">\${cls.package}</div>
                            <div class="class-dependencies">
                                Dependencies: \${data.dependencies.filter(d => d.from === cls.name || d.to === cls.name).length}
                            </div>
                        </div>
                    \`).join('')}
                </div>
            \`;
            layersContainer.appendChild(controllerLayer);
        }
        
        // Services layer
        if (data.layers.services.length > 0) {
            const serviceLayer = document.createElement('div');
            serviceLayer.className = 'architecture-layer';
            serviceLayer.innerHTML = \`
                <div class="layer-header service">
                    <span>Service Layer (\${data.layers.services.length})</span>
                </div>
                <div class="layer-content">
                    \${data.layers.services.map(cls => \`
                        <div class="class-card" data-id="\${cls.name}">
                            <div class="class-name">\${cls.name}</div>
                            <div class="class-info">\${cls.package}</div>
                            <div class="class-dependencies">
                                Dependencies: \${data.dependencies.filter(d => d.from === cls.name || d.to === cls.name).length}
                            </div>
                        </div>
                    \`).join('')}
                </div>
            \`;
            layersContainer.appendChild(serviceLayer);
        }
        
        // Repositories layer
        if (data.layers.repositories.length > 0) {
            const repositoryLayer = document.createElement('div');
            repositoryLayer.className = 'architecture-layer';
            repositoryLayer.innerHTML = \`
                <div class="layer-header repository">
                    <span>Repository Layer (\${data.layers.repositories.length})</span>
                </div>
                <div class="layer-content">
                    \${data.layers.repositories.map(cls => \`
                        <div class="class-card" data-id="\${cls.name}">
                            <div class="class-name">\${cls.name}</div>
                            <div class="class-info">\${cls.package}</div>
                            <div class="class-dependencies">
                                Dependencies: \${data.dependencies.filter(d => d.from === cls.name || d.to === cls.name).length}
                            </div>
                        </div>
                    \`).join('')}
                </div>
            \`;
            layersContainer.appendChild(repositoryLayer);
        }
        
        // Entities layer
        if (data.layers.entities.length > 0) {
            const entityLayer = document.createElement('div');
            entityLayer.className = 'architecture-layer';
            entityLayer.innerHTML = \`
                <div class="layer-header entity">
                    <span>Entity Layer (\${data.layers.entities.length})</span>
                </div>
                <div class="layer-content">
                    \${data.layers.entities.map(cls => \`
                        <div class="class-card" data-id="\${cls.name}">
                            <div class="class-name">\${cls.name}</div>
                            <div class="class-info">\${cls.package}</div>
                            <div class="class-dependencies">
                                Dependencies: \${data.dependencies.filter(d => d.from === cls.name || d.to === cls.name).length}
                            </div>
                        </div>
                    \`).join('')}
                </div>
            \`;
            layersContainer.appendChild(entityLayer);
        }
        
        // Others layer
        if (data.layers.others.length > 0) {
            const otherLayer = document.createElement('div');
            otherLayer.className = 'architecture-layer';
            otherLayer.innerHTML = \`
                <div class="layer-header">
                    <span>Other Components (\${data.layers.others.length})</span>
                </div>
                <div class="layer-content">
                    \${data.layers.others.map(cls => \`
                        <div class="class-card" data-id="\${cls.name}">
                            <div class="class-name">\${cls.name}</div>
                            <div class="class-info">\${cls.package}</div>
                            <div class="class-dependencies">
                                Dependencies: \${data.dependencies.filter(d => d.from === cls.name || d.to === cls.name).length}
                            </div>
                        </div>
                    \`).join('')}
                </div>
            \`;
            layersContainer.appendChild(otherLayer);
        }
        
        // Add click handlers for class cards
        document.querySelectorAll('.class-card').forEach(card => {
            card.addEventListener('click', () => {
                const nodeId = card.getAttribute('data-id');
                vscode.postMessage({ type: 'selectNode', nodeId: nodeId });
            });
        });
    }

    window.addEventListener('DOMContentLoaded', () => {
        document.getElementById('tab-overview').addEventListener('click', () => {
            switchTab('overview');
            console.log('overview button is clicked');
        });
        document.getElementById('tab-chat').addEventListener('click', () => {
            switchTab('chat');
        });
        document.getElementById('tab-explanation').addEventListener('click', () => {
            switchTab('explanation');
        });
        document.getElementById('tab-visualization2').addEventListener('click', () => {
            switchTab('visualization2');
        });
        document.getElementById('visualize-btn-large').addEventListener('click', refreshVisualization);
        
        document.getElementById('generate-project-doc-btn').addEventListener('click', generateProjectDocumentation);
        document.getElementById('generate-class-doc-btn').addEventListener('click', generateClassDocumentation);
        document.getElementById('export-class-doc-btn').addEventListener('click', exportClassDocumentation);
        document.getElementById('back-to-explanation-btn').addEventListener('click', showExplanationOptions);

        switchTab('overview');
    });

    window.addEventListener('message', event => {
        const message = event.data;
        switch (message.type) {
            case 'updateVisualization':
                renderVisualization(message.data);
                break;
            case 'showExplanation':
                showClassDocumentation(message.text);
                if (message.markdown) {
                    document.getElementById('class-documentation-content').dataset.markdown = message.markdown;
                }
                switchTab('explanation');
                break;
            case 'showProjectOverview':
                showProjectDocumentation(message.text);
                if (message.markdown) {
                    document.getElementById('class-documentation-content').dataset.markdown = message.markdown;
                }
                switchTab('explanation');
                break;
            case 'botResponse':
                showBotResponse(message.text);
                break;
            case 'refreshing':
                break;
        }
    });

    function showBotResponse(text) {
        const chatMessages = document.getElementById('chatMessages');
        const placeholder = chatMessages.querySelector('.placeholder');
        if (placeholder) {
            placeholder.remove();
        }

        const messageDiv = document.createElement('div');
        messageDiv.className = 'message bot-message';
        messageDiv.innerHTML = text;
        chatMessages.appendChild(messageDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;

        // Clear input
        document.getElementById('chatInput').value = '';
    }

    // Add chat functionality
    document.addEventListener('DOMContentLoaded', () => {
        const chatInput = document.getElementById('chatInput');
        const sendButton = document.getElementById('sendButton');

        // Auto-resize textarea
        chatInput.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = (this.scrollHeight) + 'px';
        });

        // Send message on button click
        sendButton.addEventListener('click', () => {
            const message = chatInput.value.trim();
            if (message) {
                // Add user message to chat
                const chatMessages = document.getElementById('chatMessages');
                const placeholder = chatMessages.querySelector('.placeholder');
                if (placeholder) {
                    placeholder.remove();
                }

                const userMessageDiv = document.createElement('div');
                userMessageDiv.className = 'message user-message';
                userMessageDiv.textContent = message;
                chatMessages.appendChild(userMessageDiv);
                chatMessages.scrollTop = chatMessages.scrollHeight;

                // Send to backend
                vscode.postMessage({ type: 'sendMessage', text: message });
            }
        });

        // Send message on Enter key (without Shift)
        chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendButton.click();
            }
        });
    });

</script>

        </body>
        </html>`;
    }
}
exports.MainViewProvider = MainViewProvider;
//# sourceMappingURL=main_provider.js.map