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
}
exports.VisualizationProvider = VisualizationProvider;
VisualizationProvider.viewType = 'codedoc.visualizationView';
//# sourceMappingURL=visualization_provider.js.map