import * as vscode from "vscode";
import { ProjectStructure } from "../service/java_parser";
import { marked } from "marked";
import { SentryService } from "../service/sentry_service";

export class MainViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "codedoc.mainView";
  private _view?: vscode.WebviewView;
  private _projectStructure?: ProjectStructure;
  private _isAnalysisStarted: boolean = false;
  private _isAnalysisCompleted: boolean = false;
  private _webViewState: "initial" | "analyzing" | "completed" = "initial";
  private static _cachedProjectStructure?: ProjectStructure;
  private static _cachedAnalysisState: {
    started: boolean;
    completed: boolean;
    state: string;
  } = {
    started: false,
    completed: false,
    state: "initial",
  };

  private sentry = SentryService.getInstance();

  constructor(private readonly _extensionUri: vscode.Uri) {
    console.log("MainViewProvider constructor called");
    this.sentry.addBreadcrumb("MainViewProvider initialized", "ui");

    // Restore cached state
    if (MainViewProvider._cachedProjectStructure) {
      console.log(
        "Restoring cached project structure with",
        MainViewProvider._cachedProjectStructure.classes.length,
        "classes"
      );
      this._projectStructure = MainViewProvider._cachedProjectStructure;
      this._isAnalysisStarted = MainViewProvider._cachedAnalysisState.started;
      this._isAnalysisCompleted =
        MainViewProvider._cachedAnalysisState.completed;
      this._webViewState = MainViewProvider._cachedAnalysisState.state as any;

      this.sentry.addBreadcrumb("Cached project structure restored", "ui", {
        classCount: MainViewProvider._cachedProjectStructure.classes.length,
      });
    } else {
      console.log("No cached project structure found");
    }
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ) {
    console.log(
      "resolveWebviewView called, has cached structure:",
      !!MainViewProvider._cachedProjectStructure
    );
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [this._extensionUri],
    };

    // Enable context retention
    (webviewView as any).retainContextWhenHidden = true;

    webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

    webviewView.onDidDispose(() => {
      console.log("Webview disposed, preserving state for next session");
      this._view = undefined;
      // State is preserved in static variables, so no need to clear project structure
    });

    webviewView.webview.onDidReceiveMessage((message) => {
      switch (message.type) {
        case "sendMessage":
          this._handleUserMessage(message.text);
          break;
        case "selectNode":
          this._handleNodeSelection(message.nodeId);
          break;
        case "refreshVisualization":
          this._refreshVisualization();
          break;
        case "generateProjectDocs":
          this._generateProjectDocumentation();
          break;
        case "generateClassDocs":
          this._generateClassDocumentation();
          break;
        case "exportClassDocs":
          this._exportClassDocumentation(message.content);
          break;
        case "generateDiagram":
          this._handleDiagramGeneration(message);
          break;
        case "exportDiagram":
          this._handleDiagramExport(message.diagramData);
          break;
        case "previewDiagram":
          this._handleDiagramPreview(message.diagramData);
          break;
        case "saveDiagramToDocs":
          this._handleSaveDiagramToDocs(message.diagramData);
          break;
        case "exportDiagramAsImage":
          this._handleDiagramExportAsImage(message.diagramData);
          break;
        case "openDiagramAsImage":
          this._handleDiagramOpenAsImage(message.diagramData);
          break;
      }
    });

    this._restoreWebViewState();
  }

  private _restoreWebViewState() {
    console.log("Restoring webview state. Current state:", {
      hasProjectStructure: !!this._projectStructure,
      isAnalysisStarted: this._isAnalysisStarted,
      isAnalysisCompleted: this._isAnalysisCompleted,
      webViewState: this._webViewState,
    });

    if (this._projectStructure) {
      console.log(
        "Resending existing visualization data to newly resolved webview"
      );
      setTimeout(() => {
        if (this._view && this._view.webview) {
          this._view.webview.postMessage({
            type: "updateVisualization",
            data: this._prepareVisualizationData(this._projectStructure!),
          });

          this._view.webview.postMessage({
            type: "updateProjectStructureForDiagrams",
            data: this._projectStructure,
          });

          // Restore the correct UI state based on analysis status
          if (this._isAnalysisCompleted) {
            this._view.webview.postMessage({
              type: "analysisCompleted",
            });
          } else if (this._isAnalysisStarted) {
            this._view.webview.postMessage({
              type: "analysisStarted",
            });
          }
        }
      }, 100);
    } else if (!this._isAnalysisStarted && this._webViewState === "initial") {
      // Don't auto-trigger analysis - let user manually trigger it
      console.log(
        "No project structure available, waiting for user to trigger analysis"
      );
      // Just show the initial state without auto-analysis
    } else if (this._webViewState === "analyzing") {
      setTimeout(() => {
        if (this._view && this._view.webview) {
          this._view.webview.postMessage({
            type: "analysisStarted",
          });
        }
      }, 100);
    } else if (this._webViewState === "completed" && this._projectStructure) {
      setTimeout(() => {
        if (this._view && this._view.webview) {
          this._view.webview.postMessage({
            type: "updateVisualization",
            data: this._prepareVisualizationData(this._projectStructure!),
          });

          this._view.webview.postMessage({
            type: "analysisCompleted",
          });
        }
      }, 100);
    }
  }

  public updateVisualization(structure: ProjectStructure) {
    this._projectStructure = structure;
    this._isAnalysisCompleted = true;
    this._webViewState = "completed";

    // Cache the state for future webview sessions
    MainViewProvider._cachedProjectStructure = structure;
    MainViewProvider._cachedAnalysisState = {
      started: this._isAnalysisStarted,
      completed: this._isAnalysisCompleted,
      state: this._webViewState,
    };

    if (this._view && this._view.webview) {
      console.log("Sending visualization data to webview");
      setTimeout(() => {
        if (this._view && this._view.webview) {
          console.log("Actually sending visualization data");
          this._view.webview.postMessage({
            type: "updateVisualization",
            data: this._prepareVisualizationData(structure),
          });

          this._view.webview.postMessage({
            type: "updateProjectStructureForDiagrams",
            data: structure,
          });

          this._view.webview.postMessage({
            type: "analysisCompleted",
          });
        }
      }, 100);
    } else {
      console.log("Webview not ready, cannot send data");
    }
  }

  public clearChat() {
    if (this._view) {
      this._view.webview.postMessage({ type: "clearChat" });
    }
  }

  public testMarkdownConversion() {
    // Test method to verify markdown conversion is working
    // Simulate the actual problem: content wrapped in markdown code fences
    const testMarkdown = `\`\`\`markdown
# Test Documentation

This is a **test** of markdown conversion.

## Features
- Item 1
- Item 2
- Item 3

### Code Example
\`\`\`java
public class Test {
    public void method() {
        System.out.println("Hello");
    }
}
\`\`\`

### Mermaid Diagram
\`\`\`mermaid
classDiagram
    class Test {
        +method()
    }
\`\`\`
\`\`\``;
    console.log(
      "🧪 Testing markdown conversion with wrapped content (simulating agent output)"
    );
    this.showClassDocumentation(testMarkdown);
  }

  public showClassDocumentation(content: string) {
    if (this._view) {
      console.log(
        "showClassDocumentation called with content length:",
        content?.length || 0
      );
      console.log(
        "Content preview:",
        content?.substring(0, 200) +
          (content && content.length > 200 ? "..." : "")
      );

      // Hide loading state
      this._view.webview.postMessage({ type: "hideDocumentationLoading" });

      try {
        // Always convert markdown to HTML for consistent display
        console.log("Converting markdown to HTML using marked library");
        console.log("Input content type:", typeof content);
        console.log("Input content sample:", content?.substring(0, 300));

        // Strip outer markdown code fences if present (for display only)
        let processedContent = content || "";
        const trimmedContent = processedContent.trim();

        // Check for markdown code fences with more flexible pattern
        if (
          trimmedContent.startsWith("```markdown") &&
          trimmedContent.endsWith("```")
        ) {
          console.log(
            "🔧 Detected markdown code fences, stripping for display"
          );
          console.log("Original length:", processedContent.length);

          // Remove opening ```markdown (with optional whitespace/newline)
          processedContent = trimmedContent.replace(/^```markdown\s*/, "");
          // Remove closing ``` (with optional whitespace before)
          processedContent = processedContent.replace(/\s*```$/, "");

          console.log("✂️ After stripping length:", processedContent.length);
          console.log(
            "✂️ Stripped content sample:",
            processedContent.substring(0, 300)
          );
        } else {
          console.log("ℹ️ No markdown code fences detected");
          console.log(
            "Starts with ```markdown:",
            trimmedContent.startsWith("```markdown")
          );
          console.log("Ends with ```:", trimmedContent.endsWith("```"));
          console.log("First 50 chars:", trimmedContent.substring(0, 50));
          console.log(
            "Last 50 chars:",
            trimmedContent.substring(Math.max(0, trimmedContent.length - 50))
          );
        }

        const result = marked(processedContent);
        if (result instanceof Promise) {
          result
            .then((htmlContent) => {
              console.log("✅ Async conversion successful");
              console.log("Converted HTML length:", htmlContent?.length || 0);
              console.log(
                "Converted HTML preview:",
                htmlContent?.substring(0, 300) +
                  (htmlContent && htmlContent.length > 300 ? "..." : "")
              );
              this._view!.webview.postMessage({
                type: "showClassDocumentation",
                content: htmlContent,
                text: htmlContent,
                markdown: content,
              });
            })
            .catch((error) => {
              console.error("❌ Error in async markdown conversion:", error);
              this._view!.webview.postMessage({
                type: "showClassDocumentation",
                content: content,
                text: content,
                markdown: content,
              });
            });
          return;
        } else {
          console.log("✅ Sync conversion successful");
          console.log("Converted HTML length:", result?.length || 0);
          console.log(
            "Converted HTML preview:",
            result?.substring(0, 300) +
              (result && result.length > 300 ? "..." : "")
          );
          this._view!.webview.postMessage({
            type: "showClassDocumentation",
            content: result,
            text: result,
            markdown: content,
          });
        }
      } catch (error) {
        console.error("❌ Error converting content to HTML:", error);
        console.error("Error details:", error);
        this._view!.webview.postMessage({
          type: "showClassDocumentation",
          content: content,
        });
      }
    }
  }

  public showProjectDocumentation(content: string) {
    if (this._view) {
      console.log(
        "showProjectDocumentation called with content length:",
        content?.length || 0
      );
      console.log(
        "Content preview:",
        content?.substring(0, 200) +
          (content && content.length > 200 ? "..." : "")
      );

      // Hide loading state
      this._view.webview.postMessage({ type: "hideDocumentationLoading" });

      const isHtml =
        content &&
        (content.startsWith("<") ||
          content.includes("<h1") ||
          content.includes("<p>"));
      console.log("Content is HTML:", isHtml);

      try {
        if (!isHtml) {
          console.log("Converting markdown to HTML");
          const result = marked(content);
          if (result instanceof Promise) {
            result
              .then((htmlContent) => {
                console.log("Converted HTML length:", htmlContent?.length || 0);
                console.log(
                  "Converted HTML preview:",
                  htmlContent?.substring(0, 200) +
                    (htmlContent && htmlContent.length > 200 ? "..." : "")
                );
                this._view!.webview.postMessage({
                  type: "showProjectOverview",
                  text: htmlContent,
                  markdown: content,
                });
              })
              .catch((error) => {
                console.error("Error converting markdown to HTML:", error);
                this._view!.webview.postMessage({
                  type: "showProjectOverview",
                  text: `<pre>${content || ""}</pre>`,
                  markdown: content,
                });
              });
          } else {
            const htmlContent = result as string;
            console.log("Converted HTML length:", htmlContent?.length || 0);
            console.log(
              "Converted HTML preview:",
              htmlContent?.substring(0, 200) +
                (htmlContent && htmlContent.length > 200 ? "..." : "")
            );
            this._view.webview.postMessage({
              type: "showProjectOverview",
              text: htmlContent,
              markdown: content,
            });
          }
        } else {
          console.log("Content is already HTML, using as-is");
          this._view.webview.postMessage({
            type: "showProjectOverview",
            text: content,
            markdown: content,
          });
        }
      } catch (error) {
        console.error("Error converting markdown to HTML:", error);
        this._view.webview.postMessage({
          type: "showProjectOverview",
          text: `<pre>${content || ""}</pre>`,
          markdown: content,
        });
      }
    }
  }

  public showChatResponse(response: any) {
    console.log("showChatResponse called with:", response);
    if (this._view) {
      let chatResponse = response;
      if (response && response.success && response.data) {
        chatResponse = response.data;
      }
      console.log("Unwrapped chat response:", chatResponse);

      switch (chatResponse.action) {
        case "generateDocumentation":
          let documentationContent = chatResponse.data;
          console.log("Documentation content:", documentationContent);

          if (documentationContent) {
            const htmlContent = marked(documentationContent);
            this._view.webview.postMessage({
              type: "showExplanation",
              text: htmlContent,
              markdown: documentationContent,
            });
            this._view.webview.postMessage({
              type: "botResponse",
              text:
                chatResponse.message ||
                "I've generated the documentation for you. You can find it in the Code Explanation tab.",
            });
          } else {
            this._view.webview.postMessage({
              type: "botResponse",
              text:
                chatResponse.message ||
                "I've generated the documentation for you.",
            });
          }
          break;
        case "generateVisualization":
          if (chatResponse.message) {
            this._view.webview.postMessage({
              type: "botResponse",
              text: chatResponse.message,
            });
          } else {
            this._view.webview.postMessage({
              type: "botResponse",
              text: "I've created the visualization for you.",
            });
          }
          break;
        case "answerQuestion":
          const answerHtmlContent = marked(
            chatResponse.message || "Here's what I found:"
          );
          this._view.webview.postMessage({
            type: "botResponse",
            text: answerHtmlContent,
          });
          break;
        case "clarify":
          const clarifyHtmlContent = marked(
            chatResponse.message ||
              "I'm not sure what you want to do. You can ask me to generate documentation, create visualizations, or answer questions about your code."
          );
          this._view.webview.postMessage({
            type: "botResponse",
            text: clarifyHtmlContent,
          });
          break;
        default:
          const defaultHtmlContent = marked(
            chatResponse.message || "I've processed your request."
          );
          this._view.webview.postMessage({
            type: "botResponse",
            text: defaultHtmlContent,
          });
      }
    }
  }

  public showChatError(error: string) {
    if (this._view) {
      this._view.webview.postMessage({
        type: "botResponse",
        text: `❌ Error: ${error}`,
      });
    }
  }

  public showArchitectureDescription(description: string) {
    if (this._view) {
      // Convert markdown to HTML for better display
      const htmlContent = marked(description);
      this._view.webview.postMessage({
        type: "showArchitectureDescription",
        text: htmlContent,
        markdown: description,
      });
    }
  }

  private _handleUserMessage(message: string) {
    if (this._view) {
      this._view.webview.postMessage({
        type: "botResponse",
        text: "Thinking...",
      });

      vscode.commands.executeCommand("codedoc.processChatMessage", message);
    }
  }

  private _handleNodeSelection(nodeId: string) {
    const selectedClass = this._projectStructure?.classes.find(
      (cls) => cls.name === nodeId
    );
    if (selectedClass) {
      vscode.workspace.openTextDocument(selectedClass.filePath).then((doc) => {
        vscode.window.showTextDocument(doc);
      });
    }
  }
  private _refreshVisualization() {
    this._isAnalysisStarted = true;
    this._isAnalysisCompleted = false;
    this._webViewState = "analyzing";

    if (this._view) {
      this._view.webview.postMessage({ type: "refreshing" });
      this._view.webview.postMessage({ type: "analysisStarted" });
      vscode.commands.executeCommand("codedoc.visualizeCode");
    }
  }

  private _generateProjectDocumentation() {
    if (this._view) {
      this._view.webview.postMessage({
        type: "showDocumentationLoading",
        message: "Generating project documentation...",
        docType: "project",
      });
    }
    vscode.commands.executeCommand("codedoc.generateDocs");
  }

  private _generateClassDocumentation() {
    if (this._view) {
      this._view.webview.postMessage({
        type: "showDocumentationLoading",
        message: "Generating class documentation...",
        docType: "class",
      });
    }
    vscode.commands.executeCommand("codedoc.generateClassDocs");
  }

  private _exportClassDocumentation(content: string) {
    vscode.commands.executeCommand("codedoc.exportClassDocs", content);
  }
  private _handleDiagramGeneration(message: any) {
    if (!this._projectStructure) {
      this._view?.webview.postMessage({
        type: "diagramError",
        error:
          "Project structure not available. Please analyze the project first.",
      });
      return;
    }

    vscode.commands.executeCommand("codedoc.generateDiagram", {
      diagramType: message.diagramType,
      scope: message.scope,
      module: message.module,
      projectStructure: this._projectStructure,
    });
  }
  private _handleDiagramExport(diagramData: any) {
    vscode.commands.executeCommand("codedoc.exportDiagram", diagramData);
  }

  private _handleDiagramPreview(diagramData: any) {
    vscode.commands.executeCommand("codedoc.previewDiagram", diagramData);
  }

  private _handleSaveDiagramToDocs(diagramData: any) {
    vscode.commands.executeCommand("codedoc.saveDiagramToDocs", diagramData);
  }

  private _handleDiagramExportAsImage(diagramData: any) {
    console.log(
      "Handling exportDiagramAsImage message with data:",
      diagramData
    );
    vscode.commands.executeCommand("codedoc.exportDiagramAsImage", diagramData);
  }

  private _handleDiagramOpenAsImage(diagramData: any) {
    console.log("Handling openDiagramAsImage message with data:", diagramData);
    vscode.commands.executeCommand("codedoc.openDiagramAsImage", diagramData);
  }

  // public showGeneratedDiagram(diagramData: any) {
  //     if (this._view && this._view.webview) {
  //         this._view.webview.postMessage({
  //             type: 'diagramGenerated',
  //             data: diagramData
  //         });
  //     }
  // }
  public showGeneratedDiagram(diagramData: any) {
    if (this._view && this._view.webview) {
      console.log("🎨 showGeneratedDiagram called with:", diagramData);
      console.log(
        "📄 Raw content preview:",
        diagramData.content?.substring(0, 200)
      );

      try {
        // Always convert markdown to HTML for consistent display
        console.log(
          "🔄 Converting diagram content to HTML using marked library"
        );

        // Strip outer markdown code fences if present (for display only)
        let processedContent = diagramData.content || "";
        const trimmedContent = processedContent.trim();

        // Check for markdown code fences with more flexible pattern
        if (
          trimmedContent.startsWith("```markdown") &&
          trimmedContent.endsWith("```")
        ) {
          console.log(
            "🔧 Detected markdown code fences, stripping for display"
          );
          processedContent = trimmedContent
            .replace(/^```markdown\s*/, "")
            .replace(/\s*```$/, "");
          console.log(
            "✂️ Stripped content preview:",
            processedContent.substring(0, 200)
          );
        }

        const result = marked(processedContent);
        if (result instanceof Promise) {
          result
            .then((htmlContent) => {
              console.log("✅ Async diagram conversion successful");
              console.log(
                "📊 Converted HTML preview:",
                htmlContent?.substring(0, 200)
              );
              this._view!.webview.postMessage({
                type: "diagramGenerated",
                data: {
                  ...diagramData,
                  content: htmlContent,
                  text: htmlContent,
                  markdown: diagramData.content,
                },
              });
            })
            .catch((error) => {
              console.error("❌ Error in async diagram conversion:", error);
              this._view!.webview.postMessage({
                type: "diagramGenerated",
                data: {
                  ...diagramData,
                  content: diagramData.content,
                  text: diagramData.content,
                  markdown: diagramData.content,
                },
              });
            });
          return;
        } else {
          console.log("✅ Sync diagram conversion successful");
          console.log("📊 Converted HTML preview:", result?.substring(0, 200));
          this._view.webview.postMessage({
            type: "diagramGenerated",
            data: {
              ...diagramData,
              content: result,
              text: result,
              markdown: diagramData.content,
            },
          });
        }
      } catch (error) {
        console.error("❌ Error converting diagram content to HTML:", error);
        this._view.webview.postMessage({
          type: "diagramGenerated",
          data: {
            ...diagramData,
            content: diagramData.content,
            text: diagramData.content,
            markdown: diagramData.content,
          },
        });
      }
    }
  }

  private _prepareVisualizationData(structure: ProjectStructure) {
    const layers = {
      controllers: structure.classes.filter(
        (cls) =>
          cls.annotations.some(
            (ann) =>
              ann.includes("@Controller") || ann.includes("@RestController")
          ) ||
          cls.package.includes(".controller") ||
          cls.name.endsWith("Controller")
      ),
      services: structure.classes.filter(
        (cls) =>
          cls.annotations.some((ann) => ann.includes("@Service")) ||
          cls.package.includes(".service") ||
          cls.name.endsWith("Service") ||
          cls.name.endsWith("ServiceImpl")
      ),
      repositories: structure.classes.filter(
        (cls) =>
          cls.annotations.some((ann) => ann.includes("@Repository")) ||
          cls.package.includes(".repository") ||
          cls.name.endsWith("Repository")
      ),
      entities: structure.classes.filter(
        (cls) =>
          cls.annotations.some((ann) => ann.includes("@Entity")) ||
          cls.package.includes(".entity") ||
          cls.package.includes(".domain.entity")
      ),
      others: structure.classes.filter(
        (cls) =>
          !cls.annotations.some(
            (ann) =>
              ann.includes("@Controller") ||
              ann.includes("@RestController") ||
              ann.includes("@Service") ||
              ann.includes("@Repository") ||
              ann.includes("@Entity")
          ) &&
          !cls.package.includes(".controller") &&
          !cls.package.includes(".service") &&
          !cls.name.endsWith("Service") &&
          !cls.name.endsWith("ServiceImpl") &&
          !cls.package.includes(".repository") &&
          !cls.name.endsWith("Repository") &&
          !cls.package.includes(".entity") &&
          !cls.package.includes(".domain.entity") &&
          !cls.name.endsWith("Controller")
      ),
    };

    const dependencies = structure.relationships.map((rel) => ({
      from: rel.from,
      to: rel.to,
      type: rel.type,
      method: rel.method,
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
        dependencies: dependencies.length,
      },
    };
  }

  private _getHtmlForWebview(webview: vscode.Webview): string {
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
                
                #refresh-overview-btn {
                    padding: 4px 8px;
                    font-size: 12px;
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
                
                /* Loading Bar Styles */
                .documentation-loading {
                    position: fixed;
                    top: 0;
                    left: 0;
                    right: 0;
                    background-color: var(--vscode-editor-background);
                    border-bottom: 1px solid var(--vscode-panel-border);
                    padding: 10px;
                    z-index: 1000;
                    display: none;
                }
                
                .loading-content {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                }
                
                .loading-spinner {
                    width: 16px;
                    height: 16px;
                    border: 2px solid var(--vscode-panel-border);
                    border-top: 2px solid var(--vscode-button-background);
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                }
                
                @keyframes spin {
                    0% { transform: rotate(0deg); }
                    100% { transform: rotate(360deg); }
                }
                
                .loading-message {
                    font-size: 13px;
                    color: var(--vscode-foreground);
                }
                
                .loading-progress {
                    flex: 1;
                    height: 4px;
                    background-color: var(--vscode-panel-border);
                    border-radius: 2px;
                    overflow: hidden;
                    margin-left: 10px;
                }
                
                .loading-progress-bar {
                    height: 100%;
                    background-color: var(--vscode-button-background);
                    width: 0%;
                    animation: progress 2s ease-in-out infinite;
                }
                
                @keyframes progress {
                    0% { width: 0%; }
                    50% { width: 70%; }
                    100% { width: 100%; }
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
            <!-- Documentation Loading Bar -->
            <div id="documentation-loading" class="documentation-loading">
                <div class="loading-content">
                    <div class="loading-spinner"></div>
                    <span id="loading-message" class="loading-message">Generating documentation...</span>
                    <div class="loading-progress">
                        <div class="loading-progress-bar"></div>
                    </div>
                </div>
            </div>
            
            <div class="nav-tabs">
                <button class="nav-tab active" id="tab-overview">📊 Overview</button>
                <button class="nav-tab" id="tab-chat">🤖 AI Assistant</button>
                <button class="nav-tab" id="tab-explanation">📖 Code Explanation</button>
                <button class="nav-tab" id="tab-visualization2">📈 Visualization </button>
            </div>
            <div id="overview-tab" class="tab-content active">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                    <h3 style="margin: 0;">📊 Architecture Overview</h3>
                    <button class="visualize-btn" id="refresh-overview-btn">🔄 Refresh</button>
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
                            </select>
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
                            <!-- <button id="testMermaidBtn" class="visualize-btn secondary">🧪 Test Mermaid</button> -->
                        </div>
                    </div>
                    
                    <div id="diagramResult" class="diagram-result" style="display: none;">
                        <div class="diagram-header">
                            <h4 id="diagramTitle">Generated Diagram</h4>
                            <div class="diagram-actions">
                                <button id="previewInVSCodeBtn" class="visualize-btn small">👁 Preview in VS Code</button>
                                <button id="exportAsImageBtn" class="visualize-btn small">🖼️ Export as Image</button>
                                <button id="openAsImageBtn" class="visualize-btn small">🖼️ Open as Image</button>
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
                        <small>Preparing diagrams for your Java project. This may take a moment for large projects.</small>
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
                    background: '#121212',
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
            
            // Ensure visualization tab starts in clean state
            if (tabName === 'visualization2') {
                // Only show analysis status if we don't have project structure AND user hasn't started analysis
                if (!currentProjectStructure && !document.getElementById('projectAnalysisStatus').style.display.includes('block')) {
                    // Don't automatically show analysis - let user initiate it
                    console.log('Switched to visualization tab - ready for user to generate diagrams');
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
            const markdownContent = contentContainer.dataset.markdown;
            const content = markdownContent || document.getElementById('class-documentation-text').innerHTML;
            vscode.postMessage({ type: 'exportClassDocs', content: content });
        }

        function showDocumentationLoading(message, docType) {
            console.log('Showing documentation loading:', message, docType);
            const loadingElement = document.getElementById('documentation-loading');
            const messageElement = document.getElementById('loading-message');
            
            if (loadingElement && messageElement) {
                messageElement.textContent = message;
                loadingElement.style.display = 'block';
                
                // Switch to explanation tab to show the loading
                switchTab('explanation');
                
                // Hide the explanation content while loading
                const explanationContent = document.getElementById('class-documentation-content');
                const explanationPlaceholder = document.getElementById('explanation-placeholder');
                if (explanationContent) explanationContent.style.display = 'none';
                if (explanationPlaceholder) explanationPlaceholder.style.display = 'none';
            }
        }
        
        function hideDocumentationLoading() {
            console.log('Hiding documentation loading');
            const loadingElement = document.getElementById('documentation-loading');
            if (loadingElement) {
                loadingElement.style.display = 'none';
            }
        }
        


        function showClassDocumentation(content) {
            console.log('🎯 showClassDocumentation called in webview');
            console.log('Content length:', content ? content.length : 0);
            console.log('Content type:', typeof content);
            if (content) {
                console.log('Content preview (first 300 chars):', content.substring(0, Math.min(300, content.length)) + (content.length > 300 ? '...' : ''));
                console.log('Content contains HTML tags:', content.includes('<') && content.includes('>'));
            }
            
            document.getElementById('explanation-placeholder').style.display = 'none';
            document.getElementById('class-documentation-content').style.display = 'block';
            const docTextElement = document.getElementById('class-documentation-text');
            
            if (!docTextElement) {
                console.error('❌ Could not find class-documentation-text element!');
                return;
            }
            
            // Backend should always send HTML, so just set it directly
            console.log('✅ Setting content as HTML (backend converted)');
            docTextElement.innerHTML = content || '<p>No content available</p>';
            
            console.log('📄 Content set, element innerHTML length:', docTextElement.innerHTML.length);
            
            docTextElement.style.display = 'none';
            docTextElement.offsetHeight; // Trigger reflow
            docTextElement.style.display = 'block';
            
            console.log('🎨 Applying styling and processing diagrams...');
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
                    
                    // Check if content is HTML or markdown
                    const isHtml = content && (content.startsWith('<') || content.includes('<h1') || content.includes('<p>') || content.includes('<div'));
                    console.log('Content is HTML in webview:', isHtml);
                    
                    if (isHtml) {
                        console.log('Setting HTML content directly');
                        docTextElement.innerHTML = content || '';
                    } else {
                        console.log('Content appears to be markdown, setting as-is (backend should have converted)');
                        // Backend should have converted markdown to HTML, but if not, set as-is
                        docTextElement.innerHTML = content || '';
                    }
                    
                    docTextElement.style.display = 'none';
                    docTextElement.offsetHeight; // Trigger reflow
                    docTextElement.style.display = 'block';
                    
                    setTimeout(() => {
                        applyMarkdownStyling(docTextElement);
                        processMermaidDiagrams(docTextElement);
                    }, 100);
        }
        function processMermaidDiagrams(element) {
                    try {
                        console.log('Processing Mermaid diagrams...');
                        console.log('Element HTML length:', element.innerHTML.length);
                        
                        // Look for both code blocks and existing mermaid divs
                        const codeBlocks = element.querySelectorAll('pre code, code, .language-mermaid');
                        console.log('Found code blocks:', codeBlocks.length);
                        let mermaidCount = 0;
                        
                        codeBlocks.forEach((block, index) => {
                            try {
                                const content = (block.textContent || '').trim();
                                
                                // Check if this is a Mermaid diagram
                                const isMermaid = content.startsWith('erDiagram') || 
                                    content.startsWith('classDiagram') || 
                                    content.startsWith('graph') ||
                                    content.startsWith('flowchart') ||
                                    content.startsWith('sequenceDiagram') ||
                                    content.startsWith('gantt') ||
                                    content.startsWith('pie') ||
                                    content.startsWith('gitgraph') ||
                                    content.startsWith('journey') ||
                                    content.startsWith('stateDiagram') ||
                                    block.className.includes('language-mermaid') ||
                                    block.classList.contains('mermaid');
                                
                                if (isMermaid && content.length > 0) {
                                    console.log('Found Mermaid diagram ' + (index + 1) + ':', content.substring(0, 50) + '...');
                                    
                                    // Create new mermaid div
                                    const mermaidDiv = document.createElement('div');
                                    mermaidDiv.className = 'mermaid';
                                    mermaidDiv.textContent = content;
                                    mermaidDiv.id = 'mermaid-' + Date.now() + '-' + mermaidCount;
                                    
                                    // Style the mermaid container
                                    mermaidDiv.style.textAlign = 'center';
                                    mermaidDiv.style.margin = '20px 0';
                                    mermaidDiv.style.backgroundColor = 'var(--vscode-editor-background)';
                                    mermaidDiv.style.padding = '20px';
                                    mermaidDiv.style.borderRadius = '8px';
                                    mermaidDiv.style.border = '1px solid var(--vscode-panel-border)';
                                    mermaidDiv.style.minHeight = '100px';
                                    
                                    // Replace the code block with mermaid div
                                    const parentPre = block.closest('pre');
                                    if (parentPre) {
                                        parentPre.parentNode?.replaceChild(mermaidDiv, parentPre);
                                    } else if (block.parentNode) {
                                        block.parentNode.replaceChild(mermaidDiv, block);
                                    }
                                    
                                    mermaidCount++;
                                }
                            } catch (blockError) {
                                console.error('Error processing individual code block:', blockError);
                            }
                        });
                        
                        // Render mermaid diagrams if any were found
                        if (mermaidCount > 0) {
                            console.log('🎨 Found ' + mermaidCount + ' Mermaid diagrams to render');
                            
                            // Wait a bit for DOM to settle, then render
                            setTimeout(() => {
                                if (typeof mermaid !== 'undefined') {
                                    console.log('✅ Mermaid library available, rendering diagrams...');
                                    
                                    // Get all mermaid elements to render
                                    const mermaidElements = document.querySelectorAll('.mermaid');
                                    console.log('📊 Found ' + mermaidElements.length + ' mermaid elements in DOM');
                                    
                                    mermaidElements.forEach((element, index) => {
                                        console.log('🔍 Mermaid element ' + (index + 1) + ' content:', element.textContent?.substring(0, 100));
                                    });
                                    
                                    try {
                                        // Don't re-initialize if already initialized, just render
                                        console.log('🚀 Starting Mermaid rendering...');
                                        
                                        // Use the newer run method with specific elements
                                        mermaid.run({
                                            nodes: Array.from(mermaidElements)
                                        }).then(() => {
                                            console.log('✅ Mermaid diagrams rendered successfully with run()');
                                            // Verify rendering worked
                                            mermaidElements.forEach((el, index) => {
                                                if (el.innerHTML.trim() === el.textContent?.trim()) {
                                                    console.warn('⚠️ Mermaid element ' + (index + 1) + ' was not rendered (content unchanged)');
                                                } else {
                                                    console.log('✅ Mermaid element ' + (index + 1) + ' rendered successfully');
                                                }
                                            });
                                        }).catch(error => {
                                            console.error('❌ Error with mermaid.run:', error);
                                            console.log('🔄 Trying fallback init method...');
                                            
                                            // Fallback to init method with individual elements
                                            try {
                                                mermaidElements.forEach((el, index) => {
                                                    try {
                                                        console.log('🔄 Initializing element ' + (index + 1) + ' individually...');
                                                        mermaid.init(undefined, el);
                                                    } catch (elementError) {
                                                        console.error('❌ Failed to render element ' + (index + 1) + ':', elementError);
                                                        el.innerHTML = '<div style="color: red; border: 1px solid red; padding: 10px; margin: 10px 0; border-radius: 4px; font-family: monospace;">❌ Mermaid Error: ' + (elementError.message || 'Unknown error') + '<br><br>Original content:<br><pre style="margin: 5px 0; padding: 5px; background: rgba(255,255,255,0.1);">' + (el.textContent || '').substring(0, 200) + '</pre></div>';
                                                    }
                                                });
                                                console.log('✅ Fallback init method completed');
                                            } catch (initError) {
                                                console.error('❌ Fallback init method also failed:', initError);
                                                // Show detailed error message in diagrams
                                                mermaidElements.forEach((el, index) => {
                                                    if (el.innerHTML.trim() === el.textContent?.trim()) {
                                                        el.innerHTML = '<div style="color: red; border: 1px solid red; padding: 10px; margin: 10px 0; border-radius: 4px; font-family: monospace;">❌ Mermaid Rendering Failed<br><br>Error: ' + (error.message || 'Unknown error') + '<br><br>Original content:<br><pre style="margin: 5px 0; padding: 5px; background: rgba(255,255,255,0.1);">' + (el.textContent || '').substring(0, 200) + '</pre></div>';
                                                    }
                                                });
                                            }
                                        });
                                    } catch (error) {
                                        console.error('❌ Error starting Mermaid rendering:', error);
                                        // Show error in all mermaid elements
                                        mermaidElements.forEach((el, index) => {
                                            if (el.innerHTML.trim() === el.textContent?.trim()) {
                                                el.innerHTML = '<div style="color: red; border: 1px solid red; padding: 10px; margin: 10px 0; border-radius: 4px; font-family: monospace;">❌ Mermaid Initialization Error<br><br>Error: ' + (error.message || 'Unknown error') + '<br><br>Original content:<br><pre style="margin: 5px 0; padding: 5px; background: rgba(255,255,255,0.1);">' + (el.textContent || '').substring(0, 200) + '</pre></div>';
                                            }
                                        });
                                    }
                                } else {
                                    console.error('❌ Mermaid library not available');
                                    // Show message that Mermaid is not available
                                    document.querySelectorAll('.mermaid').forEach(el => {
                                        el.innerHTML = '<div style="color: orange; border: 1px solid orange; padding: 10px; margin: 10px 0; border-radius: 4px; font-family: monospace;">⚠️ Mermaid Library Not Available<br><br>The Mermaid library failed to load. Please check your internet connection and try again.</div>';
                                    });
                                }
                            }, 300); // Increased timeout for better DOM settling
                        } else {
                            console.log('ℹ️ No Mermaid diagrams found in content');
                        }
                    } catch (error) {
                        console.error('Error in processMermaidDiagrams:', error);
                    }
                }



                function applyMarkdownStyling(element) {
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
        

        statsGrid.innerHTML = '\\n            <div class=\\"stat-item\\">\\n                <div class=\\"stat-number\\">' + data.stats.totalClasses + '</div>\\n                <div class=\\"stat-label\\">Classes</div>\\n            </div>\\n            <div class=\\"stat-item\\">\\n                <div class=\\"stat-number\\">' + data.stats.controllers + '</div>\\n                <div class=\\"stat-label\\">Controllers</div>\\n            </div>\\n            <div class=\\"stat-item\\">\\n                <div class=\\"stat-number\\">' + data.stats.services + '</div>\\n                <div class=\\"stat-label\\">Services</div>\\n            </div>\\n            <div class=\\"stat-item\\">\\n                <div class=\\"stat-number\\">' + data.stats.repositories + '</div>\\n                <div class=\\"stat-label\\">Repositories</div>\\n            </div>\\n            <div class=\\"stat-item\\">\\n                <div class=\\"stat-number\\">' + data.stats.entities + '</div>\\n                <div class=\\"stat-label\\">Entities</div>\\n            </div>\\n            <div class=\\"stat-item\\">\\n                <div class=\\"stat-number\\">' + data.stats.dependencies + '</div>\\n                <div class=\\"stat-label\\">Dependencies</div>\\n            </div>\\n        ';
        
        visualizationContent.innerHTML = '<div class="architecture-layers-container"></div>';
        const layersContainer = visualizationContent.querySelector('.architecture-layers-container');
        
        if (data.layers.controllers.length > 0) {
            const controllerLayer = document.createElement('div');
            controllerLayer.className = 'architecture-layer';
            controllerLayer.innerHTML = '\\n                <div class=\\"layer-header controller\\">\\n                    <span>Controller Layer (' + data.layers.controllers.length + ')</span>\\n                </div>\\n                <div class=\\"layer-content\\">\\n                    ' + data.layers.controllers.map(cls => '\\n                        <div class=\\"class-card\\" data-id=\\"' + cls.name + '\\">\\n                            <div class=\\"class-name\\">' + cls.name + '</div>\\n                            <div class=\\"class-info\\">' + cls.package + '</div>\\n                            <div class=\\"class-dependencies\\">\\n                                Dependencies: ' + data.dependencies.filter(d => d.from === cls.name || d.to === cls.name).length + '\\n                            </div>\\n                        </div>\\n                    ').join('') + '\\n                </div>\\n            ';
            layersContainer.appendChild(controllerLayer);
        }
        
        if (data.layers.services.length > 0) {
            const serviceLayer = document.createElement('div');
            serviceLayer.className = 'architecture-layer';
            serviceLayer.innerHTML = '\\n                <div class=\\"layer-header service\\">\\n                    <span>Service Layer (' + data.layers.services.length + ')</span>\\n                </div>\\n                <div class=\\"layer-content\\">\\n                    ' + data.layers.services.map(cls => '\\n                        <div class=\\"class-card\\" data-id=\\"' + cls.name + '\\">\\n                            <div class=\\"class-name\\">' + cls.name + '</div>\\n                            <div class=\\"class-info\\">' + cls.package + '</div>\\n                            <div class=\\"class-dependencies\\">\\n                                Dependencies: ' + data.dependencies.filter(d => d.from === cls.name || d.to === cls.name).length + '\\n                            </div>\\n                        </div>\\n                    ').join('') + '\\n                </div>\\n            ';
            layersContainer.appendChild(serviceLayer);
        }
        
        if (data.layers.repositories.length > 0) {
            const repositoryLayer = document.createElement('div');
            repositoryLayer.className = 'architecture-layer';
            repositoryLayer.innerHTML = '\\n                <div class=\\"layer-header repository\\">\\n                    <span>Repository Layer (' + data.layers.repositories.length + ')</span>\\n                </div>\\n                <div class=\\"layer-content\\">\\n                    ' + data.layers.repositories.map(cls => '\\n                        <div class=\\"class-card\\" data-id=\\"' + cls.name + '\\">\\n                            <div class=\\"class-name\\">' + cls.name + '</div>\\n                            <div class=\\"class-info\\">' + cls.package + '</div>\\n                            <div class=\\"class-dependencies\\">\\n                                Dependencies: ' + data.dependencies.filter(d => d.from === cls.name || d.to === cls.name).length + '\\n                            </div>\\n                        </div>\\n                    ').join('') + '\\n                </div>\\n            ';
            layersContainer.appendChild(repositoryLayer);
        }
        
        if (data.layers.entities.length > 0) {
            const entityLayer = document.createElement('div');
            entityLayer.className = 'architecture-layer';
            entityLayer.innerHTML = '\\n                <div class=\\"layer-header entity\\">\\n                    <span>Entity Layer (' + data.layers.entities.length + ')</span>\\n                </div>\\n                <div class=\\"layer-content\\">\\n                    ' + data.layers.entities.map(cls => '\\n                        <div class=\\"class-card\\" data-id=\\"' + cls.name + '\\">\\n                            <div class=\\"class-name\\">' + cls.name + '</div>\\n                            <div class=\\"class-info\\">' + cls.package + '</div>\\n                            <div class=\\"class-dependencies\\">\\n                                Dependencies: ' + data.dependencies.filter(d => d.from === cls.name || d.to === cls.name).length + '\\n                            </div>\\n                        </div>\\n                    ').join('') + '\\n                </div>\\n            ';
            layersContainer.appendChild(entityLayer);
        }
        
        if (data.layers.others.length > 0) {
            const otherLayer = document.createElement('div');
            otherLayer.className = 'architecture-layer';
            otherLayer.innerHTML = '\\n                <div class=\\"layer-header\\">\\n                    <span>Other Components (' + data.layers.others.length + ')</span>\\n                </div>\\n                <div class=\\"layer-content\\">\\n                    ' + data.layers.others.map(cls => '\\n                        <div class=\\"class-card\\" data-id=\\"' + cls.name + '\\">\\n                            <div class=\\"class-name\\">' + cls.name + '</div>\\n                            <div class=\\"class-info\\">' + cls.package + '</div>\\n                            <div class=\\"class-dependencies\\">\\n                                Dependencies: ' + data.dependencies.filter(d => d.from === cls.name || d.to === cls.name).length + '\\n                            </div>\\n                        </div>\\n                    ').join('') + '\\n                </div>\\n            ';
            layersContainer.appendChild(otherLayer);
        }
        
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
        document.getElementById('refresh-overview-btn').addEventListener('click', refreshVisualization);
        
        document.getElementById('generate-project-doc-btn').addEventListener('click', generateProjectDocumentation);
        document.getElementById('generate-class-doc-btn').addEventListener('click', generateClassDocumentation);
        document.getElementById('export-class-doc-btn').addEventListener('click', exportClassDocumentation);
        document.getElementById('back-to-explanation-btn').addEventListener('click', showExplanationOptions);

        initializeDiagramGenerator();
                    
        // Show analysis status on load since we auto-analyze on startup
        // This will be hidden once the analysis completes
        console.log("🎯 [FRONTEND] Initializing auto-analysis status...");
        console.log("🕐 [FRONTEND] Frontend initialization time:", new Date().toISOString());
        console.log("� [FRONTENDn] Current project structure available:", !!currentProjectStructure);
        
        if (!currentProjectStructure) {
            console.log("🔄 [FRONTEND] No project structure found - showing analysis status");
            console.log("⏳ [FRONTEND] Waiting for backend auto-analysis to complete...");
            showAnalysisStatus();
        } else {
            console.log("✅ [FRONTEND] Project structure already available - hiding analysis status");
            hideAnalysisStatus();
        }
                    
        // Test mermaid rendering
        //testMermaidRendering();

        switchTab('overview');
    });

    window.addEventListener('message', event => {
                    const message = event.data;
                    switch (message.type) {
                        case 'updateVisualization':
                            renderVisualization(message.data);
                            break;
                        case 'showDocumentationLoading':
                            showDocumentationLoading(message.message, message.docType);
                            break;
                        case 'hideDocumentationLoading':
                            hideDocumentationLoading();
                            break;
                        case 'showClassDocumentation':
                            showClassDocumentation(message.text || message.content);
                            if (message.markdown) {
                                document.getElementById('class-documentation-content').dataset.markdown = message.markdown;
                            }
                            switchTab('explanation');
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
                        case 'diagramGenerated':
                            showGeneratedDiagram(message.data);
                            break;
                        case 'diagramError':
                            showDiagramError(message.error);
                            break;
                        case 'updateProjectStructureForDiagrams':
                            updateProjectStructureForDiagrams(message.data);
                            hideAnalysisStatus();
                            break;
                        case 'botResponse':
                            showBotResponse(message.text);
                            break;
                        case 'analysisStarted':
                            console.log('📨 [FRONTEND] Received analysisStarted message from backend');
                            showAnalysisStatus();
                            break;
                        case 'analysisCompleted':
                            console.log('📨 [FRONTEND] Received analysisCompleted message from backend');
                            hideAnalysisStatus();
                            break;
                        case 'refreshing':
                            break;
                        case 'exportDiagramAsImage':
                            this._handleDiagramExportAsImage(message.diagramData);
                            break;
                        case 'openDiagramAsImage':
                            this._handleDiagramOpenAsImage(message.diagramData);
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

        document.getElementById('chatInput').value = '';
    }
    
    // ------------------------------------------------------------
    // Diagram Generator Functions
    let currentProjectStructure = null;
    let currentDiagramData = null;

    function initializeDiagramGenerator() {
                    //const scopeRadios = document.querySelectorAll('input[name="scope"]');
                    //const moduleSelector = document.getElementById('moduleSelector');
                    const generateBtn = document.getElementById('generateDiagramBtn');
                    const exportBtn = document.getElementById('exportDiagramBtn');
                    const copyBtn = document.getElementById('copyDiagramBtn');
                    const previewBtn = document.getElementById('previewInVSCodeBtn');
                    const saveBtn = document.getElementById('saveToDocs');
                    const exportAsImageBtn = document.getElementById('exportAsImageBtn');
                    const openAsImageBtn = document.getElementById('openAsImageBtn');
                    
                    // Handle scope change
                    // scopeRadios.forEach(radio => {
                    //     radio.addEventListener('change', function() {
                    //         if (this.value === 'module') {
                    //             moduleSelector.style.display = 'block';
                    //             populateModuleSelector();
                    //         } else {
                    //             moduleSelector.style.display = 'none';
                    //         }
                    //     });
                    // });
                    
                    // Generate diagram button
                    generateBtn.addEventListener('click', generateDiagram);
                    
                    // Export buttons
                    exportBtn.addEventListener('click', exportDiagram);
                    copyBtn.addEventListener('click', copyDiagram);
                    previewBtn.addEventListener('click', previewInVSCode);
                    exportAsImageBtn.addEventListener('click', exportDiagramAsImage);
                    openAsImageBtn.addEventListener('click', openDiagramAsImage);
                    
                    // Test button
                    //document.getElementById('testMermaidBtn').addEventListener('click', testMermaidManually);
                    saveBtn.addEventListener('click', saveToDocs);
                }
        // function populateModuleSelector() {
        //             const moduleSelect = document.getElementById('moduleSelect');
        //             moduleSelect.innerHTML = '<option value="">Select a package...</option>';
                    
        //             if (currentProjectStructure && currentProjectStructure.classes) {
        //                 const packages = [...new Set(currentProjectStructure.classes.map(cls => cls.package).filter(pkg => pkg))];
        //                 packages.sort().forEach(pkg => {
        //                     const option = document.createElement('option');
        //                     option.value = pkg;
        //                     option.textContent = pkg;
        //                     moduleSelect.appendChild(option);
        //                 });
        //             }
        // }
        
        function generateDiagram() {
                    const diagramType = document.getElementById('diagramType').value;
                    //const scope = document.querySelector('input[name="scope"]:checked').value;
                    const selectedModule = document.getElementById('moduleSelect').value;
                    
                    // if (scope === 'module' && !selectedModule) {
                    //     alert('Please select a package/module');
                    //     return;
                    // }
                    
                    // Check if project structure is available
                    if (!currentProjectStructure) {
                        showDiagramError('Project structure not available. Please analyze the project first by switching to the Overview tab and clicking "Refresh Visualization".');
                        return;
                    }
                    
                    // Show loading
                    document.getElementById('diagramLoading').style.display = 'block';
                    document.getElementById('diagramResult').style.display = 'none';
                    
                    // Send request to backend
                    vscode.postMessage({
                        type: 'generateDiagram',
                        diagramType: diagramType,
                        // scope: scope,
                        module: selectedModule
                    });
                }
                // function showGeneratedDiagram(diagramData) {
                //     console.log('showGeneratedDiagram called with:', diagramData);
                //     console.log('Raw content:', diagramData.rawContent);
                //     console.log('Content:', diagramData.content);
                    
                //     const resultDiv = document.getElementById('diagramResult');
                //     const contentDiv = document.getElementById('diagramContent');
                //     const titleElement = document.getElementById('diagramTitle');
                //     const statsElement = document.getElementById('diagramStats');
                //     const loadingDiv = document.getElementById('diagramLoading');
                    
                //     // Hide loading
                //     loadingDiv.style.display = 'none';
                    
                //     // Store diagram data
                //     currentDiagramData = diagramData;
                    
                //     // Update title
                //     titleElement.textContent = diagramData.title || 'Generated Diagram';
                    
                //     // Show diagram content as before
                //     if (diagramData.content) {
                //         try {
                //             const htmlContent = marked(diagramData.content);
                //             console.log('HTML content:', htmlContent);
                //             contentDiv.innerHTML = htmlContent;
                            
                //             // Process Mermaid diagrams after a short delay
                //             setTimeout(() => {
                //                 processMermaidDiagrams(contentDiv);
                //             }, 200);
                //         } catch (error) {
                //             console.error('Error converting diagram content to HTML:', error);
                //             contentDiv.innerHTML = diagramData.content;
                //         }
                //     }
                    
                //     // Update stats
                //     statsElement.textContent = diagramData.stats || '';
                    
                //     // Enable export buttons
                //     document.getElementById('exportDiagramBtn').disabled = false;
                //     document.getElementById('copyDiagramBtn').disabled = false;
                    
                //     // Show result
                //     resultDiv.style.display = 'block';
                    
                //     // Scroll to result
                //     resultDiv.scrollIntoView({ behavior: 'smooth' });
                // }

                function showGeneratedDiagram(diagramData) {
                    console.log('🎨 showGeneratedDiagram called in webview with:', diagramData);
                    console.log('📄 Raw content:', diagramData.rawContent);
                    console.log('📊 Content length:', diagramData.content ? diagramData.content.length : 0);
                    console.log('📝 Text length:', diagramData.text ? diagramData.text.length : 0);

                    const resultDiv = document.getElementById('diagramResult');
                    const contentDiv = document.getElementById('diagramContent');
                    const titleElement = document.getElementById('diagramTitle');
                    const statsElement = document.getElementById('diagramStats');
                    const loadingDiv = document.getElementById('diagramLoading');

                    if (!contentDiv) {
                        console.error('❌ Could not find diagramContent element!');
                        return;
                    }

                    // Hide loading
                    loadingDiv.style.display = 'none';

                    // Store diagram data
                    console.log('💾 Setting currentDiagramData:', diagramData);
                    currentDiagramData = diagramData;

                    // Update title
                    titleElement.textContent = diagramData.title || 'Generated Diagram';

                    // Use the converted HTML from backend (like class documentation)
                    const htmlContent = diagramData.text || diagramData.content || '<p>No diagram content available</p>';
                    console.log('✅ Setting diagram HTML content (backend converted)');
                    console.log('📊 HTML content preview:', htmlContent.substring(0, 300));
                    
                    contentDiv.innerHTML = htmlContent;

                    console.log('🎨 Processing Mermaid diagrams in generated content...');
                    setTimeout(() => {
                        processMermaidDiagrams(contentDiv);
                    }, 200);

                    statsElement.textContent = diagramData.stats || '';

                    document.getElementById('exportDiagramBtn').disabled = false;
                    document.getElementById('copyDiagramBtn').disabled = false;

                    resultDiv.style.display = 'block';

                    resultDiv.scrollIntoView({ behavior: 'smooth' });
                }
                function exportDiagram() {
                    if (currentDiagramData) {
                        vscode.postMessage({
                            type: 'exportDiagram',
                            diagramData: currentDiagramData
                        });
                    }
                }
                
                function exportDiagramAsImage() {
                    console.log('exportDiagramAsImage button clicked');
                    if (currentDiagramData) {
                        console.log('Sending exportDiagramAsImage message with data:', currentDiagramData);
                        vscode.postMessage({
                            type: 'exportDiagramAsImage',
                            diagramData: currentDiagramData
                        });
                    } else {
                        console.log('No currentDiagramData available for export');
                    }
                }
                
                function openDiagramAsImage() {
                    console.log('openDiagramAsImage button clicked');
                    if (currentDiagramData) {
                        console.log('Sending openDiagramAsImage message with data:', currentDiagramData);
                        vscode.postMessage({
                            type: 'openDiagramAsImage',
                            diagramData: currentDiagramData
                        });
                    } else {
                        console.log('No currentDiagramData available for opening');
                    }
                }
                
                function copyDiagram() {
                    console.log('copyDiagram called, currentDiagramData:', currentDiagramData);
                    if (currentDiagramData && currentDiagramData.rawContent) {
                        console.log('Copying rawContent:', currentDiagramData.rawContent);
                        navigator.clipboard.writeText(currentDiagramData.rawContent).then(() => {
                            // Show temporary success message
                            const copyBtn = document.getElementById('copyDiagramBtn');
                            const originalText = copyBtn.textContent;
                            copyBtn.textContent = '✅ Copied!';
                            setTimeout(() => {
                                copyBtn.textContent = originalText;
                            }, 2000);
                        }).catch(error => {
                            console.error('Failed to copy to clipboard:', error);
                        });
                    } else {
                        console.error('No diagram data or rawContent available');
                    }
                }
                
                function previewInVSCode() {
                    if (currentDiagramData) {
                        vscode.postMessage({
                            type: 'previewDiagram',
                            diagramData: currentDiagramData
                        });
                    }
                }
                
                function saveToDocs() {
                    if (currentDiagramData) {
                        vscode.postMessage({
                            type: 'saveDiagramToDocs',
                            diagramData: currentDiagramData
                        });
                    }
                }
                function showDiagramError(errorMessage) {
                    const resultDiv = document.getElementById('diagramResult');
                    const loadingDiv = document.getElementById('diagramLoading');
                    const titleElement = document.getElementById('diagramTitle');
                    const contentDiv = document.getElementById('diagramContent');
                    const statsElement = document.getElementById('diagramStats');
                    
                    loadingDiv.style.display = 'none';
                    
                    currentDiagramData = null;
                    titleElement.textContent = 'Class Diagram (Error)';
                    
                    contentDiv.innerHTML = '<div class="error-message" style="color: #f48771; padding: 20px; text-align: center; border: 1px solid #f48771; border-radius: 4px; background-color: rgba(244, 135, 113, 0.1);">' +
                        '<h4>Failed to generate diagram</h4>' +
                        '<p>' + errorMessage + '</p>' +
                        '</div>';
                    
                    statsElement.textContent = 'Generation failed';
                    
                    document.getElementById('exportDiagramBtn').disabled = true;
                    document.getElementById('copyDiagramBtn').disabled = true;
                    
                    resultDiv.style.display = 'block';
                    
                    resultDiv.scrollIntoView({ behavior: 'smooth' });
                }
                function updateProjectStructureForDiagrams(structure) {
                    console.log('📊 [FRONTEND] updateProjectStructureForDiagrams() called');
                    console.log('🕐 [FRONTEND] Project structure updated at:', new Date().toISOString());
                    console.log('📈 [FRONTEND] Structure contains:', {
                        classes: structure?.classes?.length || 0,
                        packages: structure?.packages?.length || 0,
                        dependencies: structure?.dependencies?.length || 0
                    });
                    
                    currentProjectStructure = structure;
                    console.log('✅ [FRONTEND] Project structure stored in currentProjectStructure');
                    
                    // Log some sample data for debugging
                    if (structure?.classes?.length > 0) {
                        console.log('📝 [FRONTEND] Sample classes:', structure.classes.slice(0, 3).map(c => c.name));
                    }
                    
                //    populateModuleSelector();
                }

                function showAnalysisStatus() {
                    console.log("🔄 [FRONTEND] showAnalysisStatus() called");
                    console.log("🕐 [FRONTEND] Analysis status shown at:", new Date().toISOString());
                    
                    const statusElement = document.getElementById('projectAnalysisStatus');
                    const generateBtn = document.getElementById('generateDiagramBtn');
                    
                    if (statusElement) {
                        statusElement.style.display = 'block';
                        console.log("✅ [FRONTEND] Analysis status element made visible");
                    } else {
                        console.error("❌ [FRONTEND] Could not find projectAnalysisStatus element!");
                    }
                    
                    if (generateBtn) {
                        generateBtn.disabled = true;
                        console.log("🚫 [FRONTEND] Generate diagram button disabled");
                    } else {
                        console.error("❌ [FRONTEND] Could not find generateDiagramBtn element!");
                    }
                }

                function hideAnalysisStatus() {
                    console.log('🎉 [FRONTEND] hideAnalysisStatus() called - Analysis completed!');
                    console.log('🕐 [FRONTEND] Analysis completed at:', new Date().toISOString());
                    console.log('✅ [FRONTEND] Enabling diagram generation...');
                    
                    const statusDiv = document.getElementById('projectAnalysisStatus');
                    const generateBtn = document.getElementById('generateDiagramBtn');
                    
                    if (statusDiv) {
                        statusDiv.style.display = 'none';
                        console.log('✅ [FRONTEND] Analysis status element hidden');
                    } else {
                        console.error('❌ [FRONTEND] Could not find projectAnalysisStatus element!');
                    }
                    
                    if (generateBtn) {
                        generateBtn.disabled = false;
                        console.log('🎯 [FRONTEND] Generate diagram button enabled');
                    } else {
                        console.error('❌ [FRONTEND] Could not find generateDiagramBtn element!');
                    }
                    
                    // Show a brief success message
                    if (statusDiv) {
                        console.log('🎊 [FRONTEND] Showing success message...');
                        statusDiv.innerHTML = '<div style="color: #4CAF50; text-align: center; padding: 10px;">' +
                            '<span style="font-size: 18px;">✅</span>' +
                            '<p style="margin: 5px 0;">Project analysis complete!</p>' +
                            '<small>Ready to generate diagrams</small>' +
                            '</div>';
                        statusDiv.style.display = 'block';
                        
                        // Hide the success message after 3 seconds
                        setTimeout(() => {
                            console.log('⏰ [FRONTEND] Hiding success message after 3 seconds');
                            statusDiv.style.display = 'none';
                            // Restore original content for future use
                            statusDiv.innerHTML = '<div class="spinner"></div>' +
                                '<p>Analyzing project structure...</p>' +
                                '<small>Preparing diagrams for your Java project. This may take a moment for large projects.</small>';
                            console.log('🔄 [FRONTEND] Success message hidden, original content restored');
                        }, 3000);
                    }
                }
                
            
    document.addEventListener('DOMContentLoaded', () => {
        const chatInput = document.getElementById('chatInput');
        const sendButton = document.getElementById('sendButton');

        chatInput.addEventListener('input', function() {
            this.style.height = 'auto';
            this.style.height = (this.scrollHeight) + 'px';
        });

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

                vscode.postMessage({ type: 'sendMessage', text: message });
            }
        });

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
