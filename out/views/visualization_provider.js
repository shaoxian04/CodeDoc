"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VisualizationProvider = void 0;
const vscode = require("vscode");
class VisualizationProvider {
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
                case 'selectNode':
                    this._handleNodeSelection(message.nodeId);
                    break;
                case 'refreshVisualization':
                    this._refreshVisualization();
                    break;
            }
        });
    }
    updateVisualization(structure) {
        this._projectStructure = structure;
        if (this._view) {
            this._view.webview.postMessage({
                type: 'updateData',
                data: this._prepareVisualizationData(structure)
            });
        }
    }
    _handleNodeSelection(nodeId) {
        const selectedClass = this._projectStructure?.classes.find(cls => cls.name === nodeId);
        if (selectedClass) {
            // Open the file
            vscode.workspace.openTextDocument(selectedClass.filePath).then(doc => {
                vscode.window.showTextDocument(doc);
            });
        }
    }
    _refreshVisualization() {
        if (this._view) {
            this._view.webview.postMessage({ type: 'refreshing' });
            // Trigger a re-parse of the project
            vscode.commands.executeCommand('codedoc.visualizeCode');
        }
    }
    _prepareVisualizationData(structure) {
        return {
            nodes: structure.classes.map(cls => ({
                id: cls.name,
                label: cls.name,
                package: cls.package,
                type: cls.isController ? 'controller' : 'class',
                annotations: cls.annotations,
                methods: cls.methods.length,
                fields: cls.fields.length
            })),
            edges: structure.relationships.map(rel => ({
                from: rel.from,
                to: rel.to,
                type: rel.type,
                method: rel.method
            }))
        };
    }
    _getHtmlForWebview(webview) {
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Code Visualization</title>
            <style>
                body {
                    font-family: var(--vscode-font-family);
                    font-size: var(--vscode-font-size);
                    color: var(--vscode-foreground);
                    background-color: var(--vscode-editor-background);
                    margin: 0;
                    padding: 10px;
                }
                
                .visualization-container {
                    width: 100%;
                    height: 100vh;
                    display: flex;
                    flex-direction: column;
                }
                
                .controls {
                    padding: 10px 0;
                    border-bottom: 1px solid var(--vscode-panel-border);
                    margin-bottom: 10px;
                }
                
                .refresh-btn {
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    padding: 6px 12px;
                    border-radius: 4px;
                    cursor: pointer;
                }
                
                .refresh-btn:hover {
                    background-color: var(--vscode-button-hoverBackground);
                }
                
                .visualization {
                    flex: 1;
                    border: 1px solid var(--vscode-panel-border);
                    border-radius: 4px;
                    background-color: var(--vscode-input-background);
                    overflow: hidden;
                    position: relative;
                }
                
                .placeholder {
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    height: 100%;
                    color: var(--vscode-descriptionForeground);
                    font-style: italic;
                }
                
                .node {
                    position: absolute;
                    padding: 8px 12px;
                    border: 2px solid var(--vscode-button-background);
                    border-radius: 8px;
                    background-color: var(--vscode-input-background);
                    cursor: pointer;
                    min-width: 100px;
                    text-align: center;
                }
                
                .node:hover {
                    background-color: var(--vscode-button-hoverBackground);
                }
                
                .node.controller {
                    border-color: var(--vscode-gitDecoration-addedResourceForeground);
                }
                
                .node-label {
                    font-weight: bold;
                    margin-bottom: 4px;
                }
                
                .node-info {
                    font-size: 0.8em;
                    color: var(--vscode-descriptionForeground);
                }
            </style>
        </head>
        <body>
            <div class="visualization-container">
                <div class="controls">
                    <button class="refresh-btn" onclick="refreshVisualization()">🔄 Refresh</button>
                </div>
                
                <div class="visualization" id="visualization">
                    <div class="placeholder">
                        Click "Visualize Code" to see your project structure
                    </div>
                </div>
            </div>
            
            <script>
                const vscode = acquireVsCodeApi();
                let visualizationData = null;
                
                function refreshVisualization() {
                    vscode.postMessage({
                        type: 'refreshVisualization'
                    });
                }
                
                function selectNode(nodeId) {
                    vscode.postMessage({
                        type: 'selectNode',
                        nodeId: nodeId
                    });
                }
                
                function renderVisualization(data) {
                    const container = document.getElementById('visualization');
                    container.innerHTML = '';
                    
                    if (!data || !data.nodes || data.nodes.length === 0) {
                        container.innerHTML = '<div class="placeholder">No classes found in the workspace</div>';
                        return;
                    }
                    
                    // Simple grid layout
                    const cols = Math.ceil(Math.sqrt(data.nodes.length));
                    const nodeWidth = 120;
                    const nodeHeight = 80;
                    const spacing = 20;
                    
                    data.nodes.forEach((node, index) => {
                        const row = Math.floor(index / cols);
                        const col = index % cols;
                        
                        const nodeElement = document.createElement('div');
                        nodeElement.className = \`node \${node.type}\`;
                        nodeElement.style.left = \`\${col * (nodeWidth + spacing) + spacing}px\`;
                        nodeElement.style.top = \`\${row * (nodeHeight + spacing) + spacing}px\`;
                        nodeElement.style.width = \`\${nodeWidth}px\`;
                        nodeElement.style.height = \`\${nodeHeight}px\`;
                        
                        nodeElement.innerHTML = \`
                            <div class="node-label">\${node.label}</div>
                            <div class="node-info">\${node.methods}m, \${node.fields}f</div>
                            <div class="node-info">\${node.package}</div>
                        \`;
                        
                        nodeElement.onclick = () => selectNode(node.id);
                        container.appendChild(nodeElement);
                    });
                }
                
                // Handle messages from extension
                window.addEventListener('message', event => {
                    const message = event.data;
                    
                    switch (message.type) {
                        case 'updateData':
                            visualizationData = message.data;
                            renderVisualization(visualizationData);
                            break;
                        case 'refreshing':
                            document.getElementById('visualization').innerHTML = 
                                '<div class="placeholder">Refreshing visualization...</div>';
                            break;
                    }
                });
            </script>
        </body>
        </html>`;
    }
}
exports.VisualizationProvider = VisualizationProvider;
VisualizationProvider.viewType = 'codedoc.visualizationView';
//# sourceMappingURL=visualization_provider.js.map