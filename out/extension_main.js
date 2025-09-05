"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deactivate = exports.activate = void 0;
const vscode = require("vscode");
const chat_provider_1 = require("../src/chat_provider");
const visualization_provider_1 = require("../src/visualization_provider");
const java_parser_1 = require("../src/java_parser");
const openai_service_1 = require("../src/openai_service");
function activate(context) {
    console.log('CodeDoc extension is now active!');
    const javaParser = new java_parser_1.JavaParser();
    const openaiService = new openai_service_1.OpenAIService();
    // Register the chat view provider
    const chatProvider = new chat_provider_1.ChatViewProvider(context.extensionUri);
    // Register the visualization provider
    const visualizationProvider = new visualization_provider_1.VisualizationProvider(context.extensionUri);
    context.subscriptions.push(vscode.window.registerWebviewViewProvider('codedoc.chatView', chatProvider), vscode.window.registerWebviewViewProvider('codedoc.visualizationView', visualizationProvider));
    // Register commands
    context.subscriptions.push(vscode.commands.registerCommand('codedoc.openChat', () => {
        vscode.commands.executeCommand('codedoc-sidebar.focus');
    }));
    context.subscriptions.push(vscode.commands.registerCommand('codedoc.clearChat', () => {
        chatProvider.clearChat();
    }));
    context.subscriptions.push(vscode.commands.registerCommand('codedoc.generateDocs', async () => {
        try {
            vscode.window.showInformationMessage('Generating documentation...');
            const structure = await javaParser.parseWorkspace();
            if (structure.classes.length === 0) {
                vscode.window.showWarningMessage('No Java classes found in the workspace');
                return;
            }
            const overview = await openaiService.generateProjectOverview(structure);
            // Create a new document with the overview
            const doc = await vscode.workspace.openTextDocument({
                content: overview,
                language: 'markdown'
            });
            await vscode.window.showTextDocument(doc);
            vscode.window.showInformationMessage('Documentation generated successfully!');
        }
        catch (error) {
            vscode.window.showErrorMessage(`Error generating documentation: ${error}`);
        }
    }));
    context.subscriptions.push(vscode.commands.registerCommand('codedoc.visualizeCode', async () => {
        try {
            vscode.window.showInformationMessage('Analyzing code structure...');
            const structure = await javaParser.parseWorkspace();
            if (structure.classes.length === 0) {
                vscode.window.showWarningMessage('No Java classes found in the workspace');
                return;
            }
            visualizationProvider.updateVisualization(structure);
            vscode.commands.executeCommand('codedoc-sidebar.focus');
            vscode.window.showInformationMessage('Code visualization updated!');
        }
        catch (error) {
            vscode.window.showErrorMessage(`Error visualizing code: ${error}`);
        }
    }));
    // Set context for when views are enabled
    vscode.commands.executeCommand('setContext', 'codedoc.chatViewEnabled', true);
    // Auto-parse on workspace changes
    const watcher = vscode.workspace.createFileSystemWatcher('**/*.java');
    watcher.onDidChange(() => {
        // Debounce the parsing to avoid too frequent updates
        setTimeout(() => {
            vscode.commands.executeCommand('codedoc.visualizeCode');
        }, 2000);
    });
    context.subscriptions.push(watcher);
}
exports.activate = activate;
function deactivate() {
    console.log('CodeDoc extension is deactivated');
}
exports.deactivate = deactivate;
//# sourceMappingURL=extension_main.js.map