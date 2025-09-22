import * as vscode from "vscode";
import { MainViewProvider } from "./views/main_provider";
import { JavaParser, ProjectStructure } from "./service/java_parser";
import { OpenAIService } from "./service/openai_service";
import { WorkflowOrchestrator } from "./agents/workflow_orchestrator_langchain";

export function activate(context: vscode.ExtensionContext) {
  console.log("CodeDoc extension is now active!");

  // Log activation for debugging
  console.log("CodeDoc extension activation started");

  const javaParser = new JavaParser();
  const openaiService = new OpenAIService();
  const mainProvider = new MainViewProvider(context.extensionUri);
  const workflowOrchestrator = new WorkflowOrchestrator(); // Langchain-based workflow orchestrator with RAG and MCP

  console.log("CodeDoc services initialized");

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider("codedoc.mainView", mainProvider)
  );

  console.log("CodeDoc webview provider registered");

  context.subscriptions.push(
    vscode.commands.registerCommand("codedoc.openChat", () => {
      console.log("codedoc.openChat command executed");
      vscode.commands.executeCommand(
        "workbench.view.extension.codedoc-sidebar"
      );
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("codedoc.clearChat", () => {
      console.log("codedoc.clearChat command executed");
      mainProvider.clearChat();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("codedoc.generateDocs", async () => {
      console.log("codedoc.generateDocs command executed");
      try {
        // Check if API key is configured
        const config = vscode.workspace.getConfiguration("codedoc");
        const apiKey = config.get<string>("openaiApiKey");

        if (!apiKey) {
          const result = await vscode.window.showErrorMessage(
            "OpenAI API key not configured. Please configure it in the settings.",
            "Configure Now"
          );

          if (result === "Configure Now") {
            console.log("Redirecting to configureExtension command");
            vscode.commands.executeCommand("codedoc.configureExtension");
          }
          return;
        }

        vscode.window.showInformationMessage("Generating documentation...");

        // Parse the workspace to get project structure
        const structure: ProjectStructure = await javaParser.parseWorkspace();

        // Use the Langchain-based workflow orchestrator with RAG
        const response = await workflowOrchestrator.generateProjectOverview(
          structure,
          "Generate comprehensive project overview documentation"
        );
        if (response.success && response.data) {
          mainProvider.showProjectDocumentation(response.data);
          vscode.window.showInformationMessage(
            "Documentation generated successfully!"
          );
        } else {
          vscode.window.showErrorMessage(
            response.error || "Failed to generate documentation"
          );
        }
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.includes("Client is not running")
        ) {
          vscode.window.showErrorMessage(
            "Java language server is not ready yet. Please wait a moment and try again."
          );
        } else {
          vscode.window.showErrorMessage(
            `Error generating documentation: ${error}`
          );
        }
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("codedoc.visualizeCode", async () => {
      console.log("codedoc.visualizeCode command executed");
      try {
        // Check if API key is configured
        const config = vscode.workspace.getConfiguration("codedoc");
        const apiKey = config.get<string>("openaiApiKey");

        if (!apiKey) {
          const result = await vscode.window.showErrorMessage(
            "OpenAI API key not configured. Please configure it in the settings.",
            "Configure Now"
          );

          if (result === "Configure Now") {
            console.log("Redirecting to configureExtension command");
            vscode.commands.executeCommand("codedoc.configureExtension");
          }
          return;
        }

        vscode.window.showInformationMessage("Analyzing code structure...");

        // Parse the workspace to get project structure
        const structure: ProjectStructure = await javaParser.parseWorkspace();

        // Use the Langchain-based workflow orchestrator with RAG
        const response = await workflowOrchestrator.generateVisualization(
          structure,
          "Generate architecture diagram and visualization"
        );
        if (response.success && response.data) {
          // Update visualization with enhanced data
          mainProvider.updateVisualization(structure);
          
          // Also show the AI-generated architecture description if available
          if (response.textDescription) {
            mainProvider.showArchitectureDescription(response.textDescription);
          }
          
          await vscode.commands.executeCommand("codedoc.mainView.focus");
          vscode.window.showInformationMessage("Code visualization updated with AI insights!");
        } else {
          vscode.window.showErrorMessage(
            response.error || "Failed to generate visualization"
          );
        }
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.includes("Client is not running")
        ) {
          vscode.window.showErrorMessage(
            "Java language server is not ready yet. Please wait a moment and try again."
          );
        } else {
          vscode.window.showErrorMessage(`Error visualizing code: ${error}`);
        }
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("codedoc.configureExtension", async () => {
      console.log("codedoc.configureExtension command executed");
      const result = await showConfigurationQuickPick();
      if (result) {
        vscode.window.showInformationMessage(
          "Configuration updated successfully!"
        );
        openaiService.reinitialize();
        // Note: We don't need to reinitialize the workflow orchestrator as it uses the config at runtime
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("codedoc.generateClassDocs", async () => {
      console.log("codedoc.generateClassDocs command executed");
      try {
        // Check if API key is configured
        const config = vscode.workspace.getConfiguration("codedoc");
        const apiKey = config.get<string>("openaiApiKey");

        if (!apiKey) {
          const result = await vscode.window.showErrorMessage(
            "OpenAI API key not configured. Please configure it in the settings.",
            "Configure Now"
          );

          if (result === "Configure Now") {
            console.log("Redirecting to configureExtension command");
            vscode.commands.executeCommand("codedoc.configureExtension");
          }
          return;
        }

        vscode.window.showInformationMessage(
          "Generating class documentation..."
        );
        const editor = vscode.window.activeTextEditor;
        if (!editor) {
          vscode.window.showWarningMessage(
            "No active editor found. Please open a Java file and select some code."
          );
          return;
        }

        let code = "";
        let fileName = "";
        if (editor.selection.isEmpty) {
          code = editor.document.getText();
          fileName = editor.document.fileName;
        } else {
          code = editor.document.getText(editor.selection);
          fileName = editor.document.fileName;
        }

        if (!code.trim()) {
          vscode.window.showWarningMessage(
            "No code selected or file is empty."
          );
          return;
        }

        // Parse the workspace to find the relevant class
        const structure: ProjectStructure = await javaParser.parseWorkspace();
        const className =
          fileName.split(/[/\\]/).pop()?.replace(".java", "") || "";
        const javaClass = structure.classes.find(
          (cls) => cls.name === className
        );

        if (!javaClass) {
          vscode.window.showWarningMessage(
            `Could not find class ${className} in the project.`
          );
          return;
        }

        // Find related classes (dependencies)
        const relatedClasses = structure.classes.filter(
          (cls) =>
            javaClass.dependencies.includes(cls.name) ||
            structure.relationships.some(
              (rel) =>
                (rel.from === javaClass.name && rel.to === cls.name) ||
                (rel.to === javaClass.name && rel.from === cls.name)
            )
        );

        // Use the Langchain-based workflow orchestrator for class documentation with RAG
        const response = await workflowOrchestrator.generateClassDocumentation(
          javaClass,
          relatedClasses,
          `Generate documentation for class ${javaClass.name}`
        );
        if (response.success && response.data) {
          mainProvider.showClassDocumentation(response.data);
          vscode.window.showInformationMessage(
            "Class documentation generated successfully!"
          );
        } else {
          vscode.window.showErrorMessage(
            response.error || "Failed to generate class documentation"
          );
        }
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.includes("Client is not running")
        ) {
          vscode.window.showErrorMessage(
            "Java language server is not ready yet. Please wait a moment and try again."
          );
        } else {
          vscode.window.showErrorMessage(
            `Error generating class documentation: ${error}`
          );
        }
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "codedoc.exportClassDocs",
      async (content: string) => {
        console.log("codedoc.exportClassDocs command executed");
        if (!content) {
          vscode.window.showWarningMessage(
            "No documentation content to export."
          );
          return;
        }

        try {
          const doc = await vscode.workspace.openTextDocument({
            content: content,
            language: content.startsWith("#") ? "``" : undefined, // Use code block language if content is code
          });

          await vscode.window.showTextDocument(doc);
          vscode.window.showInformationMessage(
            "Class documentation exported successfully!"
          );
        } catch (error) {
          vscode.window.showErrorMessage(
            `Error exporting documentation: ${error}`
          );
        }
      }
    )
  );

  // Diagram generation commands
  context.subscriptions.push(
    vscode.commands.registerCommand("codedoc.generateDiagram", async (params: any) => {
      console.log("codedoc.generateDiagram command executed", params);
      try {
        const config = vscode.workspace.getConfiguration("codedoc");
        const apiKey = config.get<string>("openaiApiKey");

        if (!apiKey) {
          vscode.window.showErrorMessage(
            "OpenAI API key not configured. Please configure it in the settings."
          );
          return;
        }

        // Generate diagram using the enhanced visualization agent
        const response = await workflowOrchestrator.generateDiagram(params);
        
        if (response.success && response.data) {
          mainProvider.showGeneratedDiagram(response.data);
        } else {
          vscode.window.showErrorMessage(
            response.error || "Failed to generate diagram"
          );
        }
      } catch (error) {
        console.error("Error generating diagram:", error);
        vscode.window.showErrorMessage("Failed to generate diagram");
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("codedoc.exportDiagram", async (diagramData: any) => {
      console.log("codedoc.exportDiagram command executed");
      try {
        const fileName = `${diagramData.type || 'diagram'}-${Date.now()}.md`;
        const uri = await vscode.window.showSaveDialog({
          defaultUri: vscode.Uri.file(fileName),
          filters: {
            'Markdown files': ['md']
          }
        });
        
        if (uri) {
          await vscode.workspace.fs.writeFile(uri, Buffer.from(diagramData.rawContent, 'utf8'));
          vscode.window.showInformationMessage(`Diagram exported to ${uri.fsPath}`);
        }
      } catch (error) {
        console.error("Error exporting diagram:", error);
        vscode.window.showErrorMessage("Failed to export diagram");
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("codedoc.previewDiagram", async (diagramData: any) => {
      console.log("codedoc.previewDiagram command executed");
      try {
        // Check if diagramData has the required content
        if (!diagramData || !diagramData.rawContent) {
          vscode.window.showErrorMessage("No diagram content available to preview");
          return;
        }

        // Create temp file in workspace or system temp directory
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        const fileName = `temp-diagram-${Date.now()}.md`;
        
        let tempUri: vscode.Uri;
        if (workspaceFolder) {
          tempUri = vscode.Uri.joinPath(workspaceFolder.uri, fileName);
        } else {
          // Fallback to system temp directory
          const os = require('os');
          const path = require('path');
          tempUri = vscode.Uri.file(path.join(os.tmpdir(), fileName));
        }
        
        await vscode.workspace.fs.writeFile(tempUri, Buffer.from(diagramData.rawContent, 'utf8'));
        const document = await vscode.workspace.openTextDocument(tempUri);
        await vscode.window.showTextDocument(document);
        
        vscode.window.showInformationMessage("Diagram opened in editor. You can copy the content or save it.");
        
        // Clean up temp file after a delay
        setTimeout(async () => {
          try {
            await vscode.workspace.fs.delete(tempUri);
          } catch (e) {
            // Ignore cleanup errors
            console.log("Could not clean up temp file:", e);
          }
        }, 60000); // Increased to 60 seconds
      } catch (error) {
        console.error("Error previewing diagram:", error);
        vscode.window.showErrorMessage(`Failed to preview diagram: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("codedoc.saveDiagramToDocs", async (diagramData: any) => {
      console.log("codedoc.saveDiagramToDocs command executed");
      try {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
          vscode.window.showErrorMessage("No workspace folder found");
          return;
        }

        const docsPath = vscode.Uri.joinPath(workspaceFolder.uri, 'docs', 'architecture');
        
        // Create docs/architecture directory if it doesn't exist
        try {
          await vscode.workspace.fs.createDirectory(docsPath);
        } catch (e) {
          // Directory might already exist
        }

        const fileName = `${diagramData.type || 'diagram'}-${Date.now()}.md`;
        const fileUri = vscode.Uri.joinPath(docsPath, fileName);
        
        await vscode.workspace.fs.writeFile(fileUri, Buffer.from(diagramData.rawContent, 'utf8'));
        vscode.window.showInformationMessage(`Diagram saved to docs/architecture/${fileName}`);
        
        // Optionally open the file
        const openFile = await vscode.window.showInformationMessage(
          "Diagram saved successfully!", 
          "Open File"
        );
        if (openFile === "Open File") {
          await vscode.window.showTextDocument(fileUri);
        }
      } catch (error) {
        console.error("Error saving diagram to docs:", error);
        vscode.window.showErrorMessage("Failed to save diagram to docs folder");
      }
    })
  );

  // Add chat message processing command
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "codedoc.processChatMessage",
      async (message: string) => {
        console.log(
          "codedoc.processChatMessage command executed with message:",
          message
        );
        try {
          // Check if API key is configured
          const config = vscode.workspace.getConfiguration("codedoc");
          const apiKey = config.get<string>("openaiApiKey");

          if (!apiKey) {
            const result = await vscode.window.showErrorMessage(
              "OpenAI API key not configured. Please configure it in the settings.",
              "Configure Now"
            );

            if (result === "Configure Now") {
              console.log("Redirecting to configureExtension command");
              vscode.commands.executeCommand("codedoc.configureExtension");
            }
            return;
          }

          // Parse the workspace to get project structure for context
          const structure: ProjectStructure = await javaParser.parseWorkspace();
          console.log("Parsed project structure:", structure);

          // Use the Langchain-based workflow orchestrator with RAG for chat
          const response = await workflowOrchestrator.handleChatRequest(
            message,
            { projectStructure: structure }
          );
          console.log("Workflow orchestrator response:", response);

          if (response.success && response.data) {
            mainProvider.showChatResponse(response); // Pass the entire response, not just response.data
          } else {
            mainProvider.showChatError(
              response.error || "Failed to process chat message"
            );
          }
        } catch (error) {
          console.error("Error processing chat message:", error);
          mainProvider.showChatError(`Error processing chat message: ${error}`);
        }
      }
    )
  );

  vscode.commands.executeCommand("setContext", "codedoc.chatViewEnabled", true);

  const watcher = vscode.workspace.createFileSystemWatcher("**/*.java");
  watcher.onDidChange(() => {
    // Debounce the parsing to avoid too frequent updates
    setTimeout(async () => {
      try {
        await vscode.commands.executeCommand("codedoc.visualizeCode");
      } catch (error) {
        console.error("Error during auto-parse:", error);
      }
    }, 2000);
  });
  context.subscriptions.push(watcher);

  console.log("CodeDoc extension activation completed");
}

export function deactivate() {
  console.log("CodeDoc extension is deactivated");
}

async function showConfigurationQuickPick(): Promise<boolean> {
  const config = vscode.workspace.getConfiguration("codedoc");
  const currentApiKey = config.get<string>("openaiApiKey", "");
  const currentModel = config.get<string>("openaiModel", "gpt-4");
  const currentMaxTokens = config.get<number>("maxTokens", 2000);
  const currentTemperature = config.get<number>("temperature", 0.3);

  const options = [
    {
      label: "🔑 Configure API Key",
      description: currentApiKey
        ? "API key is set (****)"
        : "No API key configured",
      action: "apiKey",
    },
    {
      label: "🤖 Select Model",
      description: `Current: ${currentModel}`,
      action: "model",
    },
    {
      label: "📏 Set Max Tokens",
      description: `Current: ${currentMaxTokens}`,
      action: "maxTokens",
    },
    {
      label: "🌡️ Set Temperature",
      description: `Current: ${currentTemperature}`,
      action: "temperature",
    },
    {
      label: "⚙️ Open Settings",
      description: "Open VS Code settings for CodeDoc",
      action: "settings",
    },
  ];

  const selection = await vscode.window.showQuickPick(options, {
    placeHolder: "Choose a configuration option",
    title: "CodeDoc Configuration",
  });

  if (!selection) {
    return false;
  }

  switch (selection.action) {
    case "apiKey":
      return await configureApiKey();
    case "model":
      return await configureModel();
    case "maxTokens":
      return await configureMaxTokens();
    case "temperature":
      return await configureTemperature();
    case "settings":
      vscode.commands.executeCommand(
        "workbench.action.openSettings",
        "codedoc"
      );
      return false;
    default:
      return false;
  }
}

async function configureApiKey(): Promise<boolean> {
  const apiKey = await vscode.window.showInputBox({
    prompt: "Enter your OpenAI API Key",
    placeHolder: "sk-...",
    password: true,
    validateInput: (value) => {
      if (!value || value.trim().length === 0) {
        return "API key cannot be empty";
      }
      if (!value.startsWith("sk-")) {
        return 'OpenAI API keys typically start with "sk-"';
      }
      if (value.length < 20) {
        return "API key seems too short";
      }
      return null;
    },
  });

  if (apiKey) {
    await vscode.workspace
      .getConfiguration("codedoc")
      .update("openaiApiKey", apiKey, vscode.ConfigurationTarget.Global);
    return true;
  }
  return false;
}

async function configureModel(): Promise<boolean> {
  const models = [
    {
      label: "GPT-4",
      description: "Most capable model, best for complex analysis",
      value: "gpt-4",
    },
    {
      label: "GPT-4 Turbo",
      description: "Faster GPT-4 with improved efficiency",
      value: "gpt-4-turbo",
    },
    {
      label: "GPT-4o",
      description: "Latest optimized model with multimodal capabilities",
      value: "gpt-4o",
    },
    {
      label: "GPT-4o Mini",
      description: "Compact version of GPT-4o for quick responses",
      value: "gpt-4o-mini",
    },
    {
      label: "GPT-3.5 Turbo",
      description: "Fast and cost-effective for simple tasks",
      value: "gpt-3.5-turbo",
    },
  ];

  const selection = await vscode.window.showQuickPick(models, {
    placeHolder: "Select an OpenAI model",
    title: "Choose OpenAI Model",
  });

  if (selection) {
    await vscode.workspace
      .getConfiguration("codedoc")
      .update(
        "openaiModel",
        selection.value,
        vscode.ConfigurationTarget.Global
      );
    return true;
  }
  return false;
}

async function configureMaxTokens(): Promise<boolean> {
  const maxTokens = await vscode.window.showInputBox({
    prompt: "Enter maximum tokens for OpenAI responses",
    placeHolder: "500",
    value: vscode.workspace
      .getConfiguration("codedoc")
      .get<number>("maxTokens", 500)
      .toString(),
    validateInput: (value) => {
      const num = parseInt(value);
      if (isNaN(num) || num < 100 || num > 4000) {
        return "Please enter a number between 100 and 4000";
      }
      return null;
    },
  });
  if (maxTokens) {
    await vscode.workspace
      .getConfiguration("codedoc")
      .update(
        "maxTokens",
        parseInt(maxTokens),
        vscode.ConfigurationTarget.Global
      );
    return true;
  }
  return false;
}

async function configureTemperature(): Promise<boolean> {
  const temperature = await vscode.window.showInputBox({
    prompt:
      "Enter temperature for OpenAI responses (0.0 = deterministic, 1.0 = creative)",
    placeHolder: "0.3",
    value: vscode.workspace
      .getConfiguration("codedoc")
      .get<number>("temperature", 0.3)
      .toString(),
    validateInput: (value) => {
      const num = parseFloat(value);
      if (isNaN(num) || num < 0 || num > 1) {
        return "Please enter a number between 0.0 and 1.0";
      }
      return null;
    },
  });

  if (temperature) {
    await vscode.workspace
      .getConfiguration("codedoc")
      .update(
        "temperature",
        parseFloat(temperature),
        vscode.ConfigurationTarget.Global
      );
    return true;
  }
  return false;
}