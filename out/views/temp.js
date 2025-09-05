"use strict";
_getHtmlForWebview(webview, vscode.Webview);
string;
{
    return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta http-equiv="Content-Security-Policy"
                content="default-src 'none';
                   style-src 'unsafe-inline';
                   script-src 'unsafe-inline';
                   img-src ${webview.cspSource} https:;
                   font-src ${webview.cspSource};">
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
                
                .send-button, .refresh-btn {
                    padding: 6px 12px;
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                }
                
                .send-button:hover, .refresh-btn:hover {
                    background-color: var(--vscode-button-hoverBackground);
                }
                
                /* Enhanced Visualization styles */
                .visualization {
                    flex: 1;
                    background-color: var(--vscode-input-background);
                    overflow-y: auto;
                    padding: 10px;
                }
                
                .stats-panel {
                    background-color: var(--vscode-editor-selectionBackground);
                    padding: 10px;
                    border-radius: 4px;
                    margin-bottom: 15px;
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
                
                .architecture-layer {
                    margin-bottom: 20px;
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
            </style>
        </head>
        <body>
            <div class="nav-tabs">
                <button class="nav-tab active" id="tab-visualization">📊 Visualization</button>
                <button class="nav-tab" id="tab-chat">🤖 AI Assistant</button>
                <button class="nav-tab" id="tab-explanation">📖 Code Explanation</button>
            </div>
            
            <!-- Visualization Tab -->
            <div id="visualization-tab" class="tab-content active">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                    <h3 style="margin: 0;">📊 Architecture Overview</h3>
                    <button class="refresh-btn" id="refresh-btn">🔄 Refresh</button>
                </div>
                
                <!-- Stats Panel -->
                <div class="stats-panel" id="statsPanel" style="display: none;">
                    <div class="stats-grid" id="statsGrid"></div>
                </div>
                
                <!-- Architecture Layers -->
                <div class="visualization" id="visualization">
                    <div class="placeholder">Click "Visualize Code" to see your project architecture</div>
                </div>
                
                <!-- Info Panel -->
                <div class="info-panel" id="infoPanel">
                    <h4 id="infoPanelTitle">Class Details</h4>
                    <div id="infoPanelContent"></div>
                </div>
            </div>
            
            <!-- Chat Tab -->
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
            
            <!-- Explanation Tab -->
            <div id="explanation-tab" class="tab-content">
                <div class="placeholder">
                    📖 Code explanation feature coming soon!<br>
                    Select code in your editor to see detailed explanations here.
                </div>
            </div>
            
            <script>
                const vscode = acquireVsCodeApi();
                let visualizationData = null;
                
                // Tab switching function - using your previous logic
                function switchTab(tabName) {
                    const tabs = ['visualization', 'chat', 'explanation'];
                
                    tabs.forEach(name => {
                        const tabContent = document.getElementById(name + '-tab');
                        const tabButton = document.getElementById('tab-' + name);
                
                        if (tabContent) {
                        if (name === tabName) {
                            tabContent.classList.add('active');
                        } else {
                            tabContent.classList.remove('active');
                        }
                        }
                        if (tabButton) {
                            if (name === tabName) {
                                tabButton.classList.add('active');
                            } else {
                                tabButton.classList.remove('active');
                            }
                        }
                    });
                }
                
                // Visualization functions
                function refreshVisualization() {
                    vscode.postMessage({ type: 'refreshVisualization' });
                }
                
                function selectNode(nodeId) {
                    vscode.postMessage({ type: 'selectNode', nodeId: nodeId });
                }
                
                function sendMessage() {
                    const input = document.getElementById('chatInput');
                    const message = input.value.trim();
                    if (message) {
                        addMessage(message, 'user');
                        input.value = '';
                        vscode.postMessage({ type: 'sendMessage', text: message });
                    }
                }
                
                function addMessage(text, sender) {
                    const messages = document.getElementById('chatMessages');
                    const messageDiv = document.createElement('div');
                    messageDiv.className = 'message ' + sender + '-message';
                    messageDiv.textContent = text;
                    messages.appendChild(messageDiv);
                    messages.scrollTop = messages.scrollHeight;
                }
                
                function renderVisualization(data) {
                    console.log('Rendering visualization with data:', data);
                    const container = document.getElementById('visualization');
                    const statsPanel = document.getElementById('statsPanel');
                    const statsGrid = document.getElementById('statsGrid');
                    
                    container.innerHTML = '';
                    
                    if (!data || !data.layers) {
                        container.innerHTML = '<div class="placeholder">No classes found in the workspace</div>';
                        statsPanel.style.display = 'none';
                        return;
                    }
                    
                    // Show stats
                    statsPanel.style.display = 'block';
                    statsGrid.innerHTML = 
                        '<div class="stat-item">' +
                            '<div class="stat-number">' + data.stats.totalClasses + '</div>' +
                            '<div class="stat-label">Total Classes</div>' +
                        '</div>' +
                        '<div class="stat-item">' +
                            '<div class="stat-number">' + data.stats.controllers + '</div>' +
                            '<div class="stat-label">Controllers</div>' +
                        '</div>' +
                        '<div class="stat-item">' +
                            '<div class="stat-number">' + data.stats.services + '</div>' +
                            '<div class="stat-label">Services</div>' +
                        '</div>' +
                        '<div class="stat-item">' +
                            '<div class="stat-number">' + data.stats.repositories + '</div>' +
                            '<div class="stat-label">Repositories</div>' +
                        '</div>' +
                        '<div class="stat-item">' +
                            '<div class="stat-number">' + data.stats.entities + '</div>' +
                            '<div class="stat-label">Entities</div>' +
                        '</div>' +
                        '<div class="stat-item">' +
                            '<div class="stat-number">' + data.stats.dependencies + '</div>' +
                            '<div class="stat-label">Dependencies</div>' +
                        '</div>';
                    
                    // Create layers
                    const layerTypes = [
                        { key: 'controllers', name: 'Controllers', colorClass: 'controller' },
                        { key: 'services', name: 'Services', colorClass: 'service' },
                        { key: 'repositories', name: 'Repositories', colorClass: 'repository' },
                        { key: 'entities', name: 'Entities', colorClass: 'entity' },
                        { key: 'others', name: 'Other Classes', colorClass: '' }
                    ];
                    
                    layerTypes.forEach(layer => {
                        if (data.layers[layer.key] && data.layers[layer.key].length > 0) {
                            const layerDiv = document.createElement('div');
                            layerDiv.className = 'architecture-layer';
                            
                            const layerHeader = document.createElement('div');
                            layerHeader.className = 'layer-header ' + layer.colorClass;
                            layerHeader.innerHTML = 
                                '<span>' + layer.name + ' (' + data.layers[layer.key].length + ')</span>' +
                                '<button class="collapse-toggle" id="toggle-' + layer.key + '">▼</button>';
                            
                            layerHeader.addEventListener('click', function(e) {
                                if (e.target !== this.querySelector('.collapse-toggle')) {
                                    toggleLayer(layer.key);
                                }
                            });
                            
                            const layerContent = document.createElement('div');
                            layerContent.className = 'layer-content';
                            layerContent.id = 'content-' + layer.key;
                            
                            data.layers[layer.key].forEach(cls => {
                                layerContent.innerHTML += createClassCard(cls, data.dependencies);
                            });
                            
                            layerDiv.appendChild(layerHeader);
                            layerDiv.appendChild(layerContent);
                            container.appendChild(layerDiv);
                        }
                    });
                }
                
                function createClassCard(cls, dependencies) {
                    const classDeps = dependencies.filter(dep => dep.from === cls.name);
                    const dependsOn = classDeps.map(dep => dep.to).join(', ');
                    
                    return '<div class="class-card" onclick="selectClass(\'' + cls.name + '\')" ' +
                             'onmouseenter="showClassInfo(\'' + cls.name + '\', \'' + cls.package + '\', ' + cls.methods.length + ', ' + cls.fields.length + ', \'' + dependsOn + '\')" ' +
                             'onmouseleave="hideClassInfo()">' +
                            '<div class="class-name">' + cls.name + '</div>' +
                            '<div class="class-info">📁 ' + cls.package + '</div>' +
                            '<div class="class-info">🔧 ' + cls.methods.length + ' methods | 📊 ' + cls.fields.length + ' fields</div>' +
                            '<div class="class-info">🏷️ ' + cls.annotations.slice(0, 2).join(', ') + '</div>' +
                            (dependsOn ? '<div class="class-dependencies">→ ' + dependsOn + '</div>' : '') +
                        '</div>';
                }
                
                function toggleLayer(layerKey) {
                    const content = document.getElementById('content-' + layerKey);
                    const toggle = document.getElementById('toggle-' + layerKey);
                    
                    if (content.classList.contains('collapsed')) {
                        content.classList.remove('collapsed');
                        toggle.textContent = '▼';
                    } else {
                        content.classList.add('collapsed');
                        toggle.textContent = '▶';
                    }
                }
                
                function selectClass(className) {
                    vscode.postMessage({ type: 'selectNode', nodeId: className });
                }
                
                function showClassInfo(name, pkg, methods, fields, dependencies) {
                    const panel = document.getElementById('infoPanel');
                    const title = document.getElementById('infoPanelTitle');
                    const content = document.getElementById('infoPanelContent');
                    
                    title.textContent = name;
                    content.innerHTML = 
                        '<div><strong>Package:</strong> ' + pkg + '</div>' +
                        '<div><strong>Methods:</strong> ' + methods + '</div>' +
                        '<div><strong>Fields:</strong> ' + fields + '</div>' +
                        (dependencies ? '<div><strong>Dependencies:</strong> ' + dependencies + '</div>' : '') +
                        '<div style="margin-top: 8px; font-style: italic;">Click to open file</div>';
                    
                    panel.classList.add('visible');
                }
                
                function hideClassInfo() {
                    document.getElementById('infoPanel').classList.remove('visible');
                }
                
                window.addEventListener('DOMContentLoaded', () => {
                    document.getElementById('tab-visualization').addEventListener('click', () => {
                        switchTab('visualization');
                        console.log('visual button is clicked');
                    });
                    document.getElementById('tab-chat').addEventListener('click', () => {
                        switchTab('chat');
                    });
                    document.getElementById('tab-explanation').addEventListener('click', () => {
                        switchTab('explanation');
                    });

                    // Refresh button
                    document.getElementById('refresh-btn').addEventListener('click', refreshVisualization);

                    // Chat input
                    document.getElementById('chatInput').addEventListener('keydown', function(e) {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            sendMessage();
                        }
                    });
                    document.getElementById('sendButton').addEventListener('click', sendMessage);

                    // Set initial tab
                    switchTab('visualization');
                });
                
                // Handle messages from extension
                window.addEventListener('message', event => {
                    const message = event.data;
                    console.log('Received message:', message);
                    
                    switch (message.type) {
                        case 'updateVisualization':
                            visualizationData = message.data;
                            console.log('Rendering visualization with data:', visualizationData);
                            renderVisualization(visualizationData);
                            break;
                        case 'botResponse':
                            addMessage(message.text, 'bot');
                            break;
                        case 'clearChat':
                            document.getElementById('chatMessages').innerHTML = 
                                '<div class="placeholder">👋 Hi! Ask me about your code structure and documentation!</div>';
                            break;
                        case 'refreshing':
                            document.getElementById('visualization').innerHTML = 
                                '<div class="placeholder">Refreshing visualization...</div>';
                            break;
                        default:
                            console.log('Unknown message type:', message.type);
                    }
                });
            </script>
        </body>
        </html>`;
}
//# sourceMappingURL=temp.js.map