"use strict";
/**
 * This is an example of how the Documentation Agent with Langchain
 * would be integrated into the main extension.ts file.
 *
 * This is not meant to be run directly, but rather to show the integration pattern.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExtensionIntegrationExample = void 0;
const documentation_agent_langchain_1 = require("./documentation_agent_langchain");
// This would be in the extension.ts activate function
class ExtensionIntegrationExample {
    documentationAgent;
    constructor() {
        // Initialize the agent with the OpenAI API key from VS Code config
        this.documentationAgent = new documentation_agent_langchain_1.DocumentationAgent();
    }
    // This would replace the existing generateDocs command
    async generateDocumentationCommand() {
        try {
            // Show progress message
            console.log('Generating documentation...');
            // Create context for the agent
            const context = {
                userQuery: 'Generate project overview documentation'
            };
            // Execute the agent
            const response = await this.documentationAgent.execute(context);
            if (response.content) {
                // In the real extension, this would update the webview
                console.log('Documentation generated successfully!');
                console.log('Content:', response.content.substring(0, 200) + '...');
                // Return success
                return { success: true, content: response.content };
            }
            else {
                console.log('No documentation was generated.');
                return { success: false, error: 'No documentation generated' };
            }
        }
        catch (error) {
            console.error('Error generating documentation:', error);
            return { success: false, error: error.message };
        }
    }
    // This would replace the existing generateClassDocs command
    async generateClassDocumentationCommand(selectedCode, fileName) {
        try {
            console.log('Generating class documentation...');
            // Create context for the agent
            const context = {
                selectedCode: selectedCode,
                filePath: fileName,
                userQuery: 'Generate class documentation'
            };
            // Execute the agent
            const response = await this.documentationAgent.execute(context);
            if (response.content) {
                console.log('Class documentation generated successfully!');
                console.log('Content:', response.content.substring(0, 200) + '...');
                return { success: true, content: response.content };
            }
            else {
                console.log('No documentation was generated.');
                return { success: false, error: 'No documentation generated' };
            }
        }
        catch (error) {
            console.error('Error generating class documentation:', error);
            return { success: false, error: error.message };
        }
    }
    // This would be used for exporting documentation
    async exportDocumentation(content) {
        try {
            const response = await this.documentationAgent.exportDocumentation(content);
            console.log('Documentation exported successfully!');
            return { success: true, content: response.content };
        }
        catch (error) {
            console.error('Error exporting documentation:', error);
            return { success: false, error: error.message };
        }
    }
}
exports.ExtensionIntegrationExample = ExtensionIntegrationExample;
// Example usage
const example = new ExtensionIntegrationExample();
console.log('Documentation Agent with Langchain integration example created.');
//# sourceMappingURL=integration_example.js.map