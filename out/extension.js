"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deactivate = exports.activate = void 0;
const vscode = require("vscode");
const main_provider_1 = require("./views/main_provider");
const java_parser_1 = require("./service/java_parser");
const openai_service_1 = require("./service/openai_service");
function activate(context) {
    console.log('CodeDoc extension is now active!');
    const javaParser = new java_parser_1.JavaParser();
    const openaiService = new openai_service_1.OpenAIService();
    // Register the main view provider
    const mainProvider = new main_provider_1.MainViewProvider(context.extensionUri);
    context.subscriptions.push(vscode.window.registerWebviewViewProvider('codedoc.mainView', mainProvider));
    // Register commands
    context.subscriptions.push(vscode.commands.registerCommand('codedoc.openChat', () => {
        vscode.commands.executeCommand('workbench.view.extension.codedoc-sidebar');
    }));
    context.subscriptions.push(vscode.commands.registerCommand('codedoc.clearChat', () => {
        mainProvider.clearChat();
    }));
    context.subscriptions.push(vscode.commands.registerCommand('codedoc.generateDocs', async () => {
        try {
            vscode.window.showInformationMessage('Generating documentation...');
            // Add a small delay to ensure Java language server is ready
            await new Promise(resolve => setTimeout(resolve, 1000));
            const structure = await javaParser.parseWorkspace();
            if (structure.classes.length === 0) {
                vscode.window.showWarningMessage('No Java classes found in the workspace');
                return;
            }
            const overview = await openaiService.generateProjectOverview(structure);
            // Send documentation to webview
            mainProvider.showProjectDocumentation(overview);
            vscode.window.showInformationMessage('Documentation generated successfully!');
        }
        catch (error) {
            if (error instanceof Error && error.message.includes('Client is not running')) {
                vscode.window.showErrorMessage('Java language server is not ready yet. Please wait a moment and try again.');
            }
            else {
                vscode.window.showErrorMessage(`Error generating documentation: ${error}`);
            }
        }
    }));
    context.subscriptions.push(vscode.commands.registerCommand('codedoc.visualizeCode', async () => {
        try {
            vscode.window.showInformationMessage('Analyzing code structure...');
            // Add a small delay to ensure Java language server is ready
            await new Promise(resolve => setTimeout(resolve, 1000));
            const structure = await javaParser.parseWorkspace();
            if (structure.classes.length === 0) {
                vscode.window.showWarningMessage('No Java classes found in the workspace');
                return;
            }
            mainProvider.updateVisualization(structure);
            // Focus on the main view
            await vscode.commands.executeCommand('codedoc.mainView.focus');
            vscode.window.showInformationMessage('Code visualization updated!');
        }
        catch (error) {
            if (error instanceof Error && error.message.includes('Client is not running')) {
                vscode.window.showErrorMessage('Java language server is not ready yet. Please wait a moment and try again.');
            }
            else {
                vscode.window.showErrorMessage(`Error visualizing code: ${error}`);
            }
        }
    }));
    context.subscriptions.push(vscode.commands.registerCommand('codedoc.configureExtension', async () => {
        const result = await showConfigurationQuickPick();
        if (result) {
            vscode.window.showInformationMessage('Configuration updated successfully!');
            // Reinitialize OpenAI service with new settings
            openaiService.reinitialize();
        }
    }));
    context.subscriptions.push(vscode.commands.registerCommand('codedoc.generateClassDocs', async () => {
        try {
            vscode.window.showInformationMessage('Generating class documentation...');
            // Add a small delay to ensure Java language server is ready
            await new Promise(resolve => setTimeout(resolve, 1000));
            // Get the active text editor
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showWarningMessage('No active editor found. Please open a Java file and select some code.');
                return;
            }
            // Get selected text or entire file content
            let code = '';
            let fileName = '';
            if (editor.selection.isEmpty) {
                // No selection, use entire file
                code = editor.document.getText();
                fileName = editor.document.fileName;
            }
            else {
                // Use selected text
                code = editor.document.getText(editor.selection);
                fileName = editor.document.fileName;
            }
            if (!code.trim()) {
                vscode.window.showWarningMessage('No code selected or file is empty.');
                return;
            }
            const documentation = await openaiService.generateCodeExplanation(code, fileName);
            // Send documentation to webview
            mainProvider.showClassDocumentation(documentation);
            vscode.window.showInformationMessage('Class documentation generated successfully!');
        }
        catch (error) {
            if (error instanceof Error && error.message.includes('Client is not running')) {
                vscode.window.showErrorMessage('Java language server is not ready yet. Please wait a moment and try again.');
            }
            else {
                vscode.window.showErrorMessage(`Error generating class documentation: ${error}`);
            }
        }
    }));
    context.subscriptions.push(vscode.commands.registerCommand('codedoc.exportClassDocs', async (content) => {
        if (!content) {
            vscode.window.showWarningMessage('No documentation content to export.');
            return;
        }
        try {
            // Create a new document with the documentation
            const doc = await vscode.workspace.openTextDocument({
                content: content,
                language: content.startsWith('#') ? '``' : undefined // Use markdown language if content is markdown
            });
            await vscode.window.showTextDocument(doc);
            vscode.window.showInformationMessage('Class documentation exported successfully!');
        }
        catch (error) {
            vscode.window.showErrorMessage(`Error exporting documentation: ${error}`);
        }
    }));
    // Set context for when views are enabled
    vscode.commands.executeCommand('setContext', 'codedoc.chatViewEnabled', true);
    // Auto-parse on workspace changes with debounce and error handling
    const watcher = vscode.workspace.createFileSystemWatcher('**/*.java');
    watcher.onDidChange(() => {
        // Debounce the parsing to avoid too frequent updates
        setTimeout(async () => {
            try {
                await vscode.commands.executeCommand('codedoc.visualizeCode');
            }
            catch (error) {
                console.error('Error during auto-parse:', error);
            }
        }, 2000);
    });
    context.subscriptions.push(watcher);
}
exports.activate = activate;
function deactivate() {
    console.log('CodeDoc extension is deactivated');
}
exports.deactivate = deactivate;
/**
 * Shows a configuration quick pick dialog for OpenAI settings
 */
async function showConfigurationQuickPick() {
    const config = vscode.workspace.getConfiguration('codedoc');
    const currentApiKey = config.get('openaiApiKey', '');
    const currentModel = config.get('openaiModel', 'gpt-4');
    const currentMaxTokens = config.get('maxTokens', 2000);
    const currentTemperature = config.get('temperature', 0.3);
    const options = [
        {
            label: '🔑 Configure API Key',
            description: currentApiKey ? 'API key is set (****)' : 'No API key configured',
            action: 'apiKey'
        },
        {
            label: '🤖 Select Model',
            description: `Current: ${currentModel}`,
            action: 'model'
        },
        {
            label: '📏 Set Max Tokens',
            description: `Current: ${currentMaxTokens}`,
            action: 'maxTokens'
        },
        {
            label: '🌡️ Set Temperature',
            description: `Current: ${currentTemperature}`,
            action: 'temperature'
        },
        {
            label: '⚙️ Open Settings',
            description: 'Open VS Code settings for CodeDoc',
            action: 'settings'
        }
    ];
    const selection = await vscode.window.showQuickPick(options, {
        placeHolder: 'Choose a configuration option',
        title: 'CodeDoc Configuration'
    });
    if (!selection) {
        return false;
    }
    switch (selection.action) {
        case 'apiKey':
            return await configureApiKey();
        case 'model':
            return await configureModel();
        case 'maxTokens':
            return await configureMaxTokens();
        case 'temperature':
            return await configureTemperature();
        case 'settings':
            vscode.commands.executeCommand('workbench.action.openSettings', 'codedoc');
            return false;
        default:
            return false;
    }
}
/**
 * Configure OpenAI API Key
 */
async function configureApiKey() {
    const apiKey = await vscode.window.showInputBox({
        prompt: 'Enter your OpenAI API Key',
        placeHolder: 'sk-...',
        password: true,
        validateInput: (value) => {
            if (!value || value.trim().length === 0) {
                return 'API key cannot be empty';
            }
            if (!value.startsWith('sk-')) {
                return 'OpenAI API keys typically start with "sk-"';
            }
            if (value.length < 20) {
                return 'API key seems too short';
            }
            return null;
        }
    });
    if (apiKey) {
        await vscode.workspace.getConfiguration('codedoc').update('openaiApiKey', apiKey, vscode.ConfigurationTarget.Global);
        return true;
    }
    return false;
}
/**
 * Configure OpenAI Model
 */
async function configureModel() {
    const models = [
        { label: 'GPT-4', description: 'Most capable model, best for complex analysis', value: 'gpt-4' },
        { label: 'GPT-4 Turbo', description: 'Faster GPT-4 with improved efficiency', value: 'gpt-4-turbo' },
        { label: 'GPT-4o', description: 'Latest optimized model with multimodal capabilities', value: 'gpt-4o' },
        { label: 'GPT-4o Mini', description: 'Compact version of GPT-4o for quick responses', value: 'gpt-4o-mini' },
        { label: 'GPT-3.5 Turbo', description: 'Fast and cost-effective for simple tasks', value: 'gpt-3.5-turbo' }
    ];
    const selection = await vscode.window.showQuickPick(models, {
        placeHolder: 'Select an OpenAI model',
        title: 'Choose OpenAI Model'
    });
    if (selection) {
        await vscode.workspace.getConfiguration('codedoc').update('openaiModel', selection.value, vscode.ConfigurationTarget.Global);
        return true;
    }
    return false;
}
/**
 * Configure Max Tokens
 */
async function configureMaxTokens() {
    const maxTokens = await vscode.window.showInputBox({
        prompt: 'Enter maximum tokens for OpenAI responses',
        placeHolder: '2000',
        value: vscode.workspace.getConfiguration('codedoc').get('maxTokens', 2000).toString(),
        validateInput: (value) => {
            const num = parseInt(value);
            if (isNaN(num) || num < 100 || num > 4000) {
                return 'Please enter a number between 100 and 4000';
            }
            return null;
        }
    });
    if (maxTokens) {
        await vscode.workspace.getConfiguration('codedoc').update('maxTokens', parseInt(maxTokens), vscode.ConfigurationTarget.Global);
        return true;
    }
    return false;
}
/**
 * Configure Temperature
 */
async function configureTemperature() {
    const temperature = await vscode.window.showInputBox({
        prompt: 'Enter temperature for OpenAI responses (0.0 = deterministic, 1.0 = creative)',
        placeHolder: '0.3',
        value: vscode.workspace.getConfiguration('codedoc').get('temperature', 0.3).toString(),
        validateInput: (value) => {
            const num = parseFloat(value);
            if (isNaN(num) || num < 0 || num > 1) {
                return 'Please enter a number between 0.0 and 1.0';
            }
            return null;
        }
    });
    if (temperature) {
        await vscode.workspace.getConfiguration('codedoc').update('temperature', parseFloat(temperature), vscode.ConfigurationTarget.Global);
        return true;
    }
    return false;
}
//# sourceMappingURL=extension.js.map