"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChatViewProvider = void 0;
class ChatViewProvider {
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
        // Handle messages from the webview
        webviewView.webview.onDidReceiveMessage(message => {
            switch (message.type) {
                case 'sendMessage':
                    this._handleUserMessage(message.text);
                    break;
            }
        });
    }
    clearChat() {
        if (this._view) {
            this._view.webview.postMessage({ type: 'clearChat' });
        }
    }
    _handleUserMessage(message) {
        // For now, just echo back a response
        // This is where you'll integrate your AI logic later
        if (this._view) {
            this._view.webview.postMessage({
                type: 'botResponse',
                text: `I received: "${message}". AI integration coming soon!`
            });
        }
    }
    _getHtmlForWebview(webview) {
        return `<!DOCTYPE html>
        <html lang="en">
        <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>CodeDoc Assistant</title>
            <style>
                body {
                    font-family: var(--vscode-font-family);
                    font-size: var(--vscode-font-size);
                    color: var(--vscode-foreground);
                    background-color: var(--vscode-editor-background);
                    margin: 0;
                    padding: 10px;
                    height: 100vh;
                    display: flex;
                    flex-direction: column;
                }
                
                .chat-container {
                    display: flex;
                    flex-direction: column;
                    height: 100%;
                }
                
                .chat-header {
                    padding: 10px 0;
                    border-bottom: 1px solid var(--vscode-panel-border);
                    margin-bottom: 10px;
                }
                
                .chat-header h3 {
                    margin: 0;
                    color: var(--vscode-foreground);
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
                    align-items: flex-end;
                }
                
                .chat-input {
                    flex: 1;
                    min-height: 32px;
                    max-height: 100px;
                    padding: 6px 10px;
                    border: 1px solid var(--vscode-input-border);
                    background-color: var(--vscode-input-background);
                    color: var(--vscode-input-foreground);
                    border-radius: 4px;
                    resize: none;
                    font-family: inherit;
                    font-size: inherit;
                }
                
                .chat-input:focus {
                    outline: 1px solid var(--vscode-focusBorder);
                }
                
                .send-button {
                    padding: 6px 12px;
                    background-color: var(--vscode-button-background);
                    color: var(--vscode-button-foreground);
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                    height: 32px;
                }
                
                .send-button:hover {
                    background-color: var(--vscode-button-hoverBackground);
                }
                
                .send-button:disabled {
                    opacity: 0.6;
                    cursor: not-allowed;
                }
                
                .typing-indicator {
                    display: none;
                    padding: 8px;
                    color: var(--vscode-descriptionForeground);
                    font-style: italic;
                }
                
                .welcome-message {
                    text-align: center;
                    color: var(--vscode-descriptionForeground);
                    margin: 20px 0;
                    font-style: italic;
                }
            </style>
        </head>
        <body>
            <div class="chat-container">
                <div class="chat-header">
                    <h3>🤖 CodeDoc Assistant</h3>
                </div>
                
                <div class="chat-messages" id="chatMessages">
                    <div class="welcome-message">
                        👋 Hi! I'm your CodeDoc assistant. Ask me about your code structure, modules, or documentation!
                    </div>
                </div>
                
                <div class="typing-indicator" id="typingIndicator">
                    CodeDoc is thinking...
                </div>
                
                <div class="chat-input-container">
                    <textarea 
                        class="chat-input" 
                        id="chatInput" 
                        placeholder="Ask about your code..."
                        rows="1"
                    ></textarea>
                    <button class="send-button" id="sendButton">Send</button>
                </div>
            </div>
            
            <script>
                const vscode = acquireVsCodeApi();
                const chatMessages = document.getElementById('chatMessages');
                const chatInput = document.getElementById('chatInput');
                const sendButton = document.getElementById('sendButton');
                const typingIndicator = document.getElementById('typingIndicator');

                // Auto-resize textarea
                chatInput.addEventListener('input', function() {
                    this.style.height = 'auto';
                    this.style.height = Math.min(this.scrollHeight, 100) + 'px';
                });

                // Send message on Enter (Shift+Enter for new line)
                chatInput.addEventListener('keypress', function(e) {
                    if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        sendMessage();
                    }
                });

                sendButton.addEventListener('click', sendMessage);

                function sendMessage() {
                    const message = chatInput.value.trim();
                    if (message) {
                        addMessage(message, 'user');
                        chatInput.value = '';
                        chatInput.style.height = 'auto';
                        sendButton.disabled = true;
                        showTypingIndicator();
                        
                        vscode.postMessage({
                            type: 'sendMessage',
                            text: message
                        });
                    }
                }

                function addMessage(text, sender) {
                    const messageDiv = document.createElement('div');
                    messageDiv.className = \`message \${sender}-message\`;
                    messageDiv.textContent = text;
                    chatMessages.appendChild(messageDiv);
                    chatMessages.scrollTop = chatMessages.scrollHeight;
                }

                function showTypingIndicator() {
                    typingIndicator.style.display = 'block';
                }

                function hideTypingIndicator() {
                    typingIndicator.style.display = 'none';
                    sendButton.disabled = false;
                }

                // Handle messages from extension
                window.addEventListener('message', event => {
                    const message = event.data;
                    
                    switch (message.type) {
                        case 'botResponse':
                            hideTypingIndicator();
                            addMessage(message.text, 'bot');
                            break;
                        case 'clearChat':
                            chatMessages.innerHTML = '<div class="welcome-message">👋 Hi! I\\'m your CodeDoc assistant. Ask me about your code structure, modules, or documentation!</div>';
                            break;
                    }
                });

                // Focus on input when panel is opened
                chatInput.focus();
            </script>
        </body>
        </html>`;
    }
}
exports.ChatViewProvider = ChatViewProvider;
ChatViewProvider.viewType = 'codedoc.chatView';
//# sourceMappingURL=chat_provider.js.map