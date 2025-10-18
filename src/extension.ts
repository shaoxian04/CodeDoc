import * as vscode from "vscode";
import { MainViewProvider } from "./views/main_provider";
import { JavaParser, ProjectStructure } from "./service/java_parser";
import { OpenAIService } from "./service/openai_service";
import { WorkflowOrchestrator } from "./agents/workflow_orchestrator";

import * as cp from "child_process";
import * as fs from "fs";

export function activate(context: vscode.ExtensionContext) {
  console.log("CodeDoc extension is now active!");

  console.log("CodeDoc extension activation started");

  const javaParser = new JavaParser();
  const openaiService = new OpenAIService();
  const mainProvider = new MainViewProvider(context.extensionUri);
  const workflowOrchestrator = new WorkflowOrchestrator();

  console.log("CodeDoc services initialized");

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      "codedoc.mainView",
      mainProvider,
      {
        webviewOptions: {
          retainContextWhenHidden: true,
        },
      }
    )
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
          await mainProvider.showProjectDocumentation(response.data);
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

  // Command: sync documentation intelligently with workspace markdown
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "codedoc.syncDocs",
      async (changedFiles?: string[]) => {
        console.log("codedoc.syncDocs command executed", { changedFiles });
        try {
          const structure: ProjectStructure = await javaParser.parseWorkspace();

          // Find all markdown files in workspace (excluding node_modules)
          const mdFiles = await vscode.workspace.findFiles(
            "**/*.md",
            "**/node_modules/**"
          );

          if (!mdFiles || mdFiles.length === 0) {
            // No markdowns — generate a README overview from the project structure
            const resp = await workflowOrchestrator.generateProjectOverview(
              structure,
              "Generate concise project overview for README"
            );
            const generated =
              resp.success && resp.data ? (resp.data as string) : "";

            const create = "Create README.md";
            const preview = "Preview";
            const choice = await vscode.window.showInformationMessage(
              "No markdown files found in workspace. Create a README.md with generated overview?",
              create,
              preview,
              "Cancel"
            );
            if (choice === preview) {
              const doc = await vscode.workspace.openTextDocument({
                content: generated,
                language: "markdown",
              });
              await vscode.window.showTextDocument(doc, { preview: false });
              return;
            }
            if (choice === create) {
              const wsRoot =
                vscode.workspace.workspaceFolders &&
                vscode.workspace.workspaceFolders[0].uri;
              if (!wsRoot) {
                vscode.window.showErrorMessage(
                  "No workspace root found to create README.md"
                );
                return;
              }
              const newUri = vscode.Uri.joinPath(wsRoot, "README.md");
              await vscode.workspace.fs.writeFile(
                newUri,
                Buffer.from(generated, "utf8")
              );
              vscode.window.showInformationMessage(
                "README.md created with generated overview."
              );
              return;
            }
            return;
          }

          // Simple similarity: token overlap
          function similarity(a: string, b: string) {
            const wa = new Set(
              a
                .toLowerCase()
                .replace(/[^a-z0-9\s]/g, " ")
                .split(/\s+/)
                .filter(Boolean)
            );
            const wb = new Set(
              b
                .toLowerCase()
                .replace(/[^a-z0-9\s]/g, " ")
                .split(/\s+/)
                .filter(Boolean)
            );
            const inter = [...wa].filter((x) => wb.has(x)).length;
            const union = new Set([...wa, ...wb]).size || 1;
            return inter / union;
          }

          const replacements: Array<{ uri: vscode.Uri; backup: string }> = [];

          const path = require("path");

          // If changedFiles is provided, narrow down markdown files to those related to changed files
          let filesToCheck = mdFiles;
          if (
            changedFiles &&
            Array.isArray(changedFiles) &&
            changedFiles.length
          ) {
            const related: vscode.Uri[] = [];
            for (const mdUri of mdFiles) {
              const mdDir = path.dirname(mdUri.fsPath);
              for (const cf of changedFiles) {
                try {
                  const cfNorm = cf.replace(/\\/g, "/");
                  const cfDir = path.dirname(cfNorm);
                  if (cfDir.startsWith(mdDir) || mdDir.startsWith(cfDir)) {
                    related.push(mdUri);
                    break;
                  }
                } catch (e) {
                  // ignore path parse errors
                }
              }
            }
            // Always include root README if present
            const rootReadme = mdFiles.find((u) =>
              u.fsPath.toLowerCase().endsWith(path.sep + "readme.md")
            );
            if (
              rootReadme &&
              !related.find((u) => u.fsPath === rootReadme.fsPath)
            )
              related.push(rootReadme);
            if (related.length) filesToCheck = related;
          }

          // Helper: extract significant tokens from markdown to search codebase (identifiers, class names, function names)
          function extractTokensFromMarkdown(text: string) {
            // match camelCase, PascalCase, snake_case, dot.paths, and words longer than 2 chars
            const tokenRe =
              /([A-Za-z_$][A-Za-z0-9_$]{2,}|[A-Z][a-z]+[A-Z][A-Za-z0-9_]*)/g;
            const tokens = new Set<string>();
            let m: RegExpExecArray | null;
            while ((m = tokenRe.exec(text))) {
              const t = m[1].trim();
              if (t && t.length > 2) tokens.add(t);
            }
            return [...tokens].slice(0, 200); // limit
          }

          const workspaceRoot =
            vscode.workspace.workspaceFolders &&
            vscode.workspace.workspaceFolders[0].uri.fsPath;
          // Helper: get last commit timestamp for a file (returns epoch ms) or 0
          async function lastCommitTimeForFile(
            filePath: string,
            cwdPath: string | undefined
          ) {
            try {
              if (!cwdPath) return 0;
              const out = await execGit(
                `log -1 --format=%ct -- ${filePath}`,
                cwdPath
              ).catch(() => "");
              if (!out) return 0;
              const sec = parseInt(out.trim(), 10);
              if (isNaN(sec)) return 0;
              return sec * 1000;
            } catch (e) {
              return 0;
            }
          }

          // If changedFiles were provided, pre-scan them for annotations so we can detect custom mapping changes
          const changedFileAnnotations = new Set<string>();
          if (
            changedFiles &&
            Array.isArray(changedFiles) &&
            changedFiles.length &&
            workspaceRoot
          ) {
            for (const cf of changedFiles) {
              try {
                const absPath =
                  cf.startsWith("/") || cf.indexOf("\\:") >= 0
                    ? cf
                    : path.join(workspaceRoot, cf);
                if (fs.existsSync(absPath)) {
                  const content = await fs.promises.readFile(absPath, "utf8");
                  const as = (function extractAnnotationsLocal(text: string) {
                    const s = new Set<string>();
                    if (!text) return s;
                    const re = /@([A-Za-z_][A-Za-z0-9_]*)/g;
                    let mm: RegExpExecArray | null;
                    while ((mm = re.exec(text))) s.add(mm[1].toLowerCase());
                    return s;
                  })(content);
                  for (const a of as) changedFileAnnotations.add(a);
                }
              } catch (e) {
                // ignore read errors
              }
            }
          }

          // For each markdown file, ask the orchestrator to update the existing file to match the codebase
          for (const mdUri of filesToCheck) {
            try {
              const existing = await vscode.workspace
                .openTextDocument(mdUri)
                .then((d) => d.getText());
              // Determine related code files by extracting tokens from the markdown and searching the codebase
              const relPath = vscode.workspace.asRelativePath(mdUri);
              const tokens = extractTokensFromMarkdown(existing);
              const codeGlobs = ["**/*.{java,js,ts,jsx,tsx,py,go,cs,cpp,c,kt}"];
              const candidateUris: vscode.Uri[] = [];
              for (const g of codeGlobs) {
                const found = await vscode.workspace.findFiles(
                  g,
                  "**/node_modules/**",
                  200
                );
                for (const u of found) candidateUris.push(u);
              }

              // Score files by token occurrences
              const scores: Array<{
                uri: vscode.Uri;
                score: number;
                snippet: string;
              }> = [];
              for (const u of candidateUris) {
                try {
                  const text = await vscode.workspace
                    .openTextDocument(u)
                    .then((d) => d.getText());
                  let s = 0;
                  for (const tk of tokens) {
                    if (text.indexOf(tk) >= 0) s += 1;
                  }
                  if (s > 0) {
                    const snippet = text.slice(0, 2000);
                    scores.push({ uri: u, score: s, snippet });
                  }
                } catch (e) {
                  // ignore
                }
              }

              scores.sort((a, b) => b.score - a.score);
              const topFiles = scores.slice(0, 10);
              const referenced = topFiles.map((f) => f.uri.fsPath);

              // Compute last commit times
              const mdCommit = await lastCommitTimeForFile(
                mdUri.fsPath,
                workspaceRoot
              );
              let latestCodeCommit = 0;
              for (const ref of referenced) {
                const t = await lastCommitTimeForFile(ref, workspaceRoot);
                if (t > latestCodeCommit) latestCodeCommit = t;
              }

              // If no referenced files were found, as a fallback check whole repo latest commit
              if (referenced.length === 0) {
                const repoLatest = await execGit(
                  "log -1 --format=%ct",
                  workspaceRoot
                ).catch(() => "");
                if (repoLatest) {
                  const sec = parseInt(repoLatest.trim(), 10);
                  if (!isNaN(sec))
                    latestCodeCommit = Math.max(latestCodeCommit, sec * 1000);
                }
              }

              // Heuristic: detect if markdown contains tokens that lack descriptions
              function markdownLacksDescription(
                markdownText: string,
                tokens: string[]
              ) {
                // Split into paragraphs
                const paragraphs = markdownText
                  .split(/\n\s*\n/)
                  .map((p) => p.trim())
                  .filter(Boolean);
                for (const tk of tokens.slice(0, 20)) {
                  const occurrences = paragraphs.filter(
                    (p) => p.indexOf(tk) >= 0
                  );
                  if (occurrences.length === 0) continue;
                  // If any occurrence paragraph is extremely short (likely just a code mention), treat as lacking description
                  for (const p of occurrences) {
                    const plain = p.replace(/[`\-*>#]/g, "").trim();
                    if (plain.length < 40) {
                      return true;
                    }
                  }
                }
                return false;
              }

              const lacksDesc = markdownLacksDescription(existing, tokens);

              // New heuristic: detect annotation mismatches generically (any @annotation)
              function extractAnnotations(text: string) {
                const s = new Set<string>();
                if (!text) return s;
                // match @identifier or @identifier(...) and normalize to lower-case simple name
                const re = /@([A-Za-z_][A-Za-z0-9_]*)/g;
                let mm: RegExpExecArray | null;
                while ((mm = re.exec(text))) {
                  s.add(mm[1].toLowerCase());
                }
                return s;
              }

              const mdAnnotations = extractAnnotations(existing);
              const codeAnnotations = new Set<string>();
              for (const f of topFiles) {
                try {
                  const as = extractAnnotations(f.snippet);
                  for (const a of as) codeAnnotations.add(a);
                } catch (e) {
                  /* ignore */
                }
              }

              // Also consider annotations found in the changed files directly (if provided) as authoritative code-side annotations
              for (const a of changedFileAnnotations) codeAnnotations.add(a);

              let annotationMismatch = false;
              if (codeAnnotations.size > 0) {
                // If markdown lacks any annotation that code shows, or shows different ones, flag it
                for (const ca of codeAnnotations) {
                  if (!mdAnnotations.has(ca)) {
                    annotationMismatch = true;
                    break;
                  }
                }
              }

              if (annotationMismatch) {
                console.debug(
                  "[codedoc.syncDocs] annotation mismatch detected for",
                  relPath,
                  "code=",
                  [...codeAnnotations],
                  "md=",
                  [...mdAnnotations]
                );
              }

              // Additional heuristic: detect method signature / parameter mismatches
              function extractMethodSignaturesFromCode(text: string) {
                const sigs = new Set<string>();
                if (!text) return sigs;
                // Very small heuristic regexes for common languages (Java/TS/JS/Python)
                const javaLike =
                  /(?:public|private|protected|static|final|synchronized|async|export)\s+[\w<>,\s\[\]]+\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^\)]*)\)/g;
                let m: RegExpExecArray | null;
                while ((m = javaLike.exec(text))) {
                  const name = m[1];
                  const params = m[2].replace(/\s+/g, " ").trim();
                  sigs.add(`${name}(${params})`);
                }
                // JS/TS arrow functions and function declarations
                const fnRe =
                  /function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^\)]*)\)/g;
                while ((m = fnRe.exec(text))) {
                  const name = m[1];
                  const params = m[2].replace(/\s+/g, " ").trim();
                  sigs.add(`${name}(${params})`);
                }
                const arrowRe =
                  /([A-Za-z_][A-Za-z0-9_]*)\s*=\s*\(([^\)]*)\)\s*=>/g;
                while ((m = arrowRe.exec(text))) {
                  const name = m[1];
                  const params = m[2].replace(/\s+/g, " ").trim();
                  sigs.add(`${name}(${params})`);
                }
                return sigs;
              }

              function extractMentionedParamsFromMarkdown(md: string) {
                const params = new Set<string>();
                if (!md) return params;
                // find patterns like methodName(param1, param2) or param: description
                const callRe = /([A-Za-z_][A-Za-z0-9_]*)\s*\(([^\)]*)\)/g;
                let mm: RegExpExecArray | null;
                while ((mm = callRe.exec(md))) {
                  const name = mm[1];
                  const ps = mm[2]
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean);
                  params.add(`${name}(${ps.join(", ")})`);
                }
                // parameter list bullets: '- paramName: description'
                const paramLineRe = /^[\-\*]\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:/gm;
                while ((mm = paramLineRe.exec(md))) {
                  const p = mm[1];
                  params.add(p);
                }
                return params;
              }

              const codeSigs = new Set<string>();
              for (const f of topFiles) {
                try {
                  const s = extractMethodSignaturesFromCode(f.snippet);
                  for (const ss of s) codeSigs.add(ss);
                } catch (e) {
                  /* ignore */
                }
              }

              const mdParams = extractMentionedParamsFromMarkdown(existing);

              // If code contains a signature that is not mentioned in the markdown (or markdown mentions a different signature), flag mismatch
              let signatureMismatch = false;
              if (codeSigs.size > 0) {
                // If markdown mentions no signatures at all, and code has signatures, we may still want to update if descriptions are short
                if (mdParams.size === 0 && lacksDesc) signatureMismatch = true;
                else {
                  // If any code signature name appears with different parameter list in markdown, flag
                  for (const cs of codeSigs) {
                    // extract method name
                    const name = cs.split("(")[0];
                    const mdMatching = [...mdParams].find(
                      (d) => d.startsWith(name + "(") || d === name
                    );
                    if (!mdMatching) {
                      signatureMismatch = true;
                      break;
                    }
                    // If both present but different param str, and not substring match, flag
                    if (mdMatching && mdMatching !== cs) {
                      signatureMismatch = true;
                      break;
                    }
                  }
                }
              }

              if (signatureMismatch) {
                console.debug(
                  "[codedoc.syncDocs] signature mismatch detected for",
                  relPath,
                  "codeSigs=",
                  [...codeSigs],
                  "mdParams=",
                  [...mdParams]
                );
              }
              ``;
              // If code is not newer than markdown, AND markdown seems to have adequate descriptions, AND no annotation/signature mismatch detected, skip
              if (
                latestCodeCommit <= mdCommit &&
                !lacksDesc &&
                !annotationMismatch &&
                !signatureMismatch
              ) {
                console.debug(
                  "[codedoc.syncDocs] skipping",
                  relPath,
                  "no newer code referenced and descriptions present"
                );
                continue;
              }

              // Truncate existing content in prompt if extremely large
              const existingSnippet =
                existing.length > 3000
                  ? existing.slice(0, 3000) + "\n\n...[truncated]"
                  : existing;
              const prompt = `You are given an existing markdown file (path: ${relPath}) and the current project structure context.\n\nExisting file content:\n---\n${existingSnippet}\n---\n\nReferenced code files (only include content when necessary):\n${referenced.join(
                "\n"
              )}\n\nPlease update this markdown so that it correctly documents the current codebase based on the referenced code. Only change sections that are inconsistent with the code; preserve formatting and headings where possible. Return the full, updated markdown content only.`;
              // Build related file snippets to pass to the orchestrator
              const relatedFilesForAgent = topFiles.map((f) => ({
                path: vscode.workspace.asRelativePath(f.uri),
                snippet: f.snippet,
              }));
              const respForFile = await workflowOrchestrator.updateMarkdownFile(
                structure,
                existing,
                relatedFilesForAgent,
                relPath
              );
              if (!respForFile.success || !respForFile.data) {
                console.warn(
                  "[codedoc.syncDocs] failed to update suggestion for",
                  relPath,
                  respForFile.error
                );
                continue;
              }
              const suggested = respForFile.data as string;

              const sim = similarity(existing, suggested);
              console.debug(
                "[codedoc.syncDocs] file",
                relPath,
                "similarity",
                sim
              );

              // Threshold: if similarity < 0.75, propose update
              // Also: always propose update if we detected annotation or signature mismatches
              if (sim < 0.75 || annotationMismatch || signatureMismatch) {
                const replace = `Replace ${relPath}`;
                const preview = `Preview ${relPath}`;
                const ignore = "Ignore";
                const choice = await vscode.window.showInformationMessage(
                  `${relPath} appears outdated relative to the code. Update this markdown?`,
                  replace,
                  preview,
                  ignore
                );
                if (choice === preview) {
                  const doc = await vscode.workspace.openTextDocument({
                    content: suggested,
                    language: "markdown",
                  });
                  await vscode.window.showTextDocument(doc, { preview: false });
                  // prompt again for replace
                  const confirm = await vscode.window.showInformationMessage(
                    `Replace ${relPath} with suggested content?`,
                    `Replace ${relPath}`,
                    "Cancel"
                  );
                  if (confirm !== `Replace ${relPath}`) continue;
                }
                if (choice === replace || (choice === undefined && false)) {
                  try {
                    // Backup existing
                    const backupPath = mdUri.fsPath + `.bak.${Date.now()}`;
                    const backupUri = vscode.Uri.file(backupPath);
                    await vscode.workspace.fs.writeFile(
                      backupUri,
                      Buffer.from(existing, "utf8")
                    );
                    // Write new content
                    await vscode.workspace.fs.writeFile(
                      mdUri,
                      Buffer.from(suggested, "utf8")
                    );
                    replacements.push({ uri: mdUri, backup: backupPath });
                    vscode.window.showInformationMessage(
                      `${relPath} replaced and backup created.`
                    );
                  } catch (e) {
                    console.error("Error replacing markdown", mdUri.fsPath, e);
                    vscode.window.showErrorMessage(
                      `Failed to replace ${relPath}. See console for details.`
                    );
                  }
                }
              }
            } catch (e) {
              console.error("Error checking markdown file", mdUri.fsPath, e);
            }
          }

          if (replacements.length) {
            vscode.window.showInformationMessage(
              `Updated ${replacements.length} markdown file(s). Backups created.`
            );
          } else {
            vscode.window.showInformationMessage(
              "No markdown files needed updating."
            );
          }
        } catch (error) {
          console.error("Error in syncDocs", error);
          vscode.window.showErrorMessage(`Error syncing docs: ${error}`);
        }
      }
    )
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
          vscode.window.showInformationMessage(
            "Code visualization updated with AI insights!"
          );
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
          await mainProvider.showClassDocumentation(response.data);
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
          // Get the workspace folder to save the documentation
          const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
          if (!workspaceFolder) {
            vscode.window.showErrorMessage("No workspace folder found");
            return;
          }

          // Create docs directory if it doesn't exist
          const docsPath = vscode.Uri.joinPath(workspaceFolder.uri, "docs");
          try {
            await vscode.workspace.fs.createDirectory(docsPath);
          } catch (e) {
            // Directory might already exist
          }

          // Create a filename with timestamp
          const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
          const fileName = `class-documentation-${timestamp}.md`;
          const fileUri = vscode.Uri.joinPath(docsPath, fileName);

          // Write the content to the file
          await vscode.workspace.fs.writeFile(
            fileUri,
            Buffer.from(content, "utf8")
          );

          vscode.window.showInformationMessage(
            `Class documentation saved to ${fileUri.fsPath}`
          );

          // Optionally open the file after saving
          const openFile = await vscode.window.showInformationMessage(
            "Class documentation exported successfully!",
            "Open File"
          );
          if (openFile === "Open File") {
            const doc = await vscode.workspace.openTextDocument(fileUri);
            await vscode.window.showTextDocument(doc);
          }
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
    vscode.commands.registerCommand(
      "codedoc.generateDiagram",
      async (params: any) => {
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
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "codedoc.exportDiagram",
      async (diagramData: any) => {
        console.log("codedoc.exportDiagram command executed");
        try {
          const fileName = `${diagramData.type || "diagram"}-${Date.now()}.md`;
          const uri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file(fileName),
            filters: {
              "Markdown files": ["md"],
            },
          });

          if (uri) {
            await vscode.workspace.fs.writeFile(
              uri,
              Buffer.from(diagramData.rawContent, "utf8")
            );
            vscode.window.showInformationMessage(
              `Diagram exported to ${uri.fsPath}`
            );
          }
        } catch (error) {
          console.error("Error exporting diagram:", error);
          vscode.window.showErrorMessage("Failed to export diagram");
        }
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "codedoc.previewDiagram",
      async (diagramData: any) => {
        console.log("codedoc.previewDiagram command executed");
        try {
          // Check if diagramData has the required content
          if (!diagramData || !diagramData.rawContent) {
            vscode.window.showErrorMessage(
              "No diagram content available to preview"
            );
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
            const os = require("os");
            const path = require("path");
            tempUri = vscode.Uri.file(path.join(os.tmpdir(), fileName));
          }

          await vscode.workspace.fs.writeFile(
            tempUri,
            Buffer.from(diagramData.rawContent, "utf8")
          );
          const document = await vscode.workspace.openTextDocument(tempUri);
          await vscode.window.showTextDocument(document);

          vscode.window.showInformationMessage(
            "Diagram opened in editor. You can copy the content or save it."
          );

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
          vscode.window.showErrorMessage(
            `Failed to preview diagram: ${
              error instanceof Error ? error.message : "Unknown error"
            }`
          );
        }
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "codedoc.saveDiagramToDocs",
      async (diagramData: any) => {
        console.log("codedoc.saveDiagramToDocs command executed");
        try {
          const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
          if (!workspaceFolder) {
            vscode.window.showErrorMessage("No workspace folder found");
            return;
          }

          const docsPath = vscode.Uri.joinPath(
            workspaceFolder.uri,
            "docs",
            "architecture"
          );

          // Create docs/architecture directory if it doesn't exist
          try {
            await vscode.workspace.fs.createDirectory(docsPath);
          } catch (e) {
            // Directory might already exist
          }

          const fileName = `${diagramData.type || "diagram"}-${Date.now()}.md`;
          const fileUri = vscode.Uri.joinPath(docsPath, fileName);

          await vscode.workspace.fs.writeFile(
            fileUri,
            Buffer.from(diagramData.rawContent, "utf8")
          );
          vscode.window.showInformationMessage(
            `Diagram saved to docs/architecture/${fileName}`
          );

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
          vscode.window.showErrorMessage(
            "Failed to save diagram to docs folder"
          );
        }
      }
    )
  );

  // Add image export command
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "codedoc.exportDiagramAsImage",
      async (diagramData: any) => {
        console.log("codedoc.exportDiagramAsImage command executed");
        console.log("Received diagramData for export:", diagramData);

        // Check if we have the required data
        if (!diagramData) {
          console.log("No diagramData provided for export");
          vscode.window.showErrorMessage(
            "No diagram data available for export"
          );
          return;
        }

        try {
          // Check if diagramData has the required content
          if (!diagramData || !diagramData.rawContent) {
            vscode.window.showErrorMessage(
              "No diagram content available to export as image"
            );
            return;
          }

          // Extract the mermaid content from the rawContent
          let mermaidContent = diagramData.rawContent;
          const mermaidMatch = diagramData.rawContent.match(
            /```mermaid([\s\S]*?)```/
          );
          if (mermaidMatch) {
            mermaidContent = mermaidMatch[1].trim();
          }

          // Create SVG from mermaid using mermaid CLI approach
          const svgContent = await convertMermaidToSvg(mermaidContent);

          if (!svgContent) {
            vscode.window.showErrorMessage(
              "Failed to convert diagram to image"
            );
            return;
          }

          const fileName = `${diagramData.type || "diagram"}-${Date.now()}.svg`;
          const uri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file(fileName),
            filters: {
              "SVG files": ["svg"],
              "PNG files": ["png"],
            },
          });

          if (uri) {
            // For PNG conversion, we would need additional processing
            if (uri.path.endsWith(".png")) {
              vscode.window.showErrorMessage(
                "PNG export not yet implemented. Please export as SVG for now."
              );
              return;
            }

            await vscode.workspace.fs.writeFile(
              uri,
              Buffer.from(svgContent, "utf8")
            );
            vscode.window.showInformationMessage(
              `Diagram exported as image to ${uri.fsPath}`
            );
          }
        } catch (error) {
          console.error("Error exporting diagram as image:", error);
          vscode.window.showErrorMessage(
            `Failed to export diagram as image: ${
              error instanceof Error ? error.message : "Unknown error"
            }`
          );
        }
      }
    )
  );

  // Add open as image command
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "codedoc.openDiagramAsImage",
      async (diagramData: any) => {
        console.log("codedoc.openDiagramAsImage command executed");
        console.log("Received diagramData for opening:", diagramData);

        // Check if we have the required data
        if (!diagramData) {
          console.log("No diagramData provided for opening");
          vscode.window.showErrorMessage(
            "No diagram data available for opening"
          );
          return;
        }

        try {
          // Check if diagramData has the required content
          if (!diagramData || !diagramData.rawContent) {
            vscode.window.showErrorMessage(
              "No diagram content available to open as image"
            );
            return;
          }

          // Extract the mermaid content from the rawContent
          let mermaidContent = diagramData.rawContent;
          const mermaidMatch = diagramData.rawContent.match(
            /```mermaid([\s\S]*?)```/
          );
          if (mermaidMatch) {
            mermaidContent = mermaidMatch[1].trim();
          }

          // Create SVG from mermaid
          const svgContent = await convertMermaidToSvg(mermaidContent);

          if (!svgContent) {
            vscode.window.showErrorMessage(
              "Failed to convert diagram to image"
            );
            return;
          }

          // Create temp file
          const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
          const fileName = `temp-diagram-${Date.now()}.svg`;

          let tempUri: vscode.Uri;
          if (workspaceFolder) {
            tempUri = vscode.Uri.joinPath(workspaceFolder.uri, fileName);
          } else {
            // Fallback to system temp directory
            const os = require("os");
            const path = require("path");
            tempUri = vscode.Uri.file(path.join(os.tmpdir(), fileName));
          }

          await vscode.workspace.fs.writeFile(
            tempUri,
            Buffer.from(svgContent, "utf8")
          );
          // Use the preview command to open the SVG as an image instead of text
          await vscode.commands.executeCommand("vscode.open", tempUri, {
            preview: true,
          });

          vscode.window.showInformationMessage(
            "Diagram opened as SVG image in preview."
          );

          // Clean up temp file after a delay
          setTimeout(async () => {
            try {
              await vscode.workspace.fs.delete(tempUri);
            } catch (e) {
              // Ignore cleanup errors
              console.log("Could not clean up temp file:", e);
            }
          }, 60000); // 60 seconds
        } catch (error) {
          console.error("Error opening diagram as image:", error);
          vscode.window.showErrorMessage(
            `Failed to open diagram as image: ${
              error instanceof Error ? error.message : "Unknown error"
            }`
          );
        }
      }
    )
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
  // watcher.onDidChange(() => {
  //     // Debounce the parsing to avoid too frequent updates
  //     setTimeout(async () => {
  //         try {
  //             await vscode.commands.executeCommand('codedoc.visualizeCode');
  //         } catch (error) {
  //             console.error('Error during auto-parse:', error);
  //         }
  //     }, 2000);
  // });
  context.subscriptions.push(watcher);

  console.log("CodeDoc extension activation completed");

  // Start Git remote poller to notify about remote updates
  try {
    const gitPoller = startGitRemotePoller();
    context.subscriptions.push({ dispose: () => gitPoller.stop() });
  } catch (e) {
    console.error("Failed to start git poller", e);
  }
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

// Helper function to convert Mermaid to SVG
async function convertMermaidToSvg(
  mermaidCode: string
): Promise<string | null> {
  try {
    // Import puppeteer dynamically to avoid issues if not installed
    let puppeteer;
    try {
      puppeteer = await import("puppeteer");
    } catch (error) {
      console.warn("Puppeteer not available, using placeholder SVG");
      // Return a placeholder SVG with instructions
      const svgTemplate = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" width="800" height="600">
  <rect x="0" y="0" width="800" height="600" fill="#1e1e1e" />
  <text x="400" y="250" font-family="Arial" font-size="24" fill="white" text-anchor="middle">Mermaid Diagram</text>
  <text x="400" y="290" font-family="Arial" font-size="18" fill="white" text-anchor="middle">Export as Image Feature</text>
  <text x="400" y="330" font-family="Arial" font-size="16" fill="lightblue" text-anchor="middle">Puppeteer is installed but not working properly</text>
  <text x="400" y="360" font-family="Arial" font-size="14" fill="white" text-anchor="middle">Please check your Puppeteer installation</text>
</svg>`;
      return svgTemplate;
    }

    // Create a complete HTML document with Mermaid
    const htmlContent = `
      <!DOCTYPE html>
      <html>
      <head>
        <script src="https://cdn.jsdelivr.net/npm/mermaid@10/dist/mermaid.min.js"></script>
        <style>
          body { margin: 0; padding: 20px; background: #1e1e1e; }
          .mermaid { text-align: center; }
        </style>
      </head>
      <body>
        <div class="mermaid">${mermaidCode}</div>
        <script>
          mermaid.initialize({ 
            startOnLoad: true, 
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
        </script>
      </body>
      </html>
    `;

    // Launch browser and convert to SVG
    const browser = await puppeteer.launch({ headless: "new" });
    const page = await browser.newPage();

    // Set content and wait for mermaid to render
    await page.setContent(htmlContent);
    await page.waitForSelector(".mermaid svg");

    // Get the SVG element
    const svgContent = await page.evaluate(() => {
      // @ts-ignore
      const svg = document.querySelector(".mermaid svg");
      if (!svg) return null;

      // Create a background rect
      const rect = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "rect"
      );
      rect.setAttribute("width", "100%");
      rect.setAttribute("height", "100%");
      rect.setAttribute("fill", "#121212"); // 👈 dark background
      rect.setAttribute("x", "0");
      rect.setAttribute("y", "0");

      // Insert as the first child
      svg.insertBefore(rect, svg.firstChild);

      return svg ? svg.outerHTML : null;
    });

    await browser.close();

    return svgContent;
  } catch (error) {
    console.error("Error converting Mermaid to SVG:", error);
    // Return a fallback SVG
    const svgTemplate = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" version="1.1" width="800" height="600">
  <rect x="0" y="0" width="800" height="600" fill="#1e1e1e" />
  <text x="400" y="250" font-family="Arial" font-size="24" fill="white" text-anchor="middle">Mermaid Diagram</text>
  <text x="400" y="290" font-family="Arial" font-size="18" fill="white" text-anchor="middle">Export Error</text>
  <text x="400" y="330" font-family="Arial" font-size="16" fill="lightblue" text-anchor="middle">${
    error instanceof Error ? error.message : "Unknown error"
  }</text>
</svg>`;
    return svgTemplate;
  }
}

// --- Git helper functions and poller ---
function execGit(cmd: string, cwd?: string): Promise<string> {
  return new Promise((resolve, reject) => {
    cp.exec(`git ${cmd}`, { cwd }, (err, stdout, stderr) => {
      if (err) return reject({ err, stderr });
      resolve(stdout.trim());
    });
  });
}

async function isGitRepo(cwd?: string) {
  try {
    await execGit("rev-parse --is-inside-work-tree", cwd);
    return true;
  } catch (e) {
    return false;
  }
}

function pathJoin(...parts: string[]) {
  const p = require("path");
  return p.join(...parts);
}

function startGitRemotePoller() {
  const config = vscode.workspace.getConfiguration("codedoc");
  const intervalSec = config.get<number>("gitPollIntervalSec", 10) || 10;
  const folders = vscode.workspace.workspaceFolders || [];
  const cwd = folders.length ? folders[0].uri.fsPath : undefined;

  let stopped = false;
  // Track last seen local and remote HEADs. We'll detect when local HEAD advances (pull/merge/local-commit)
  // and try to infer whether the advance came from a remote pull by comparing commit authors or by
  // checking that remote HEAD advanced and local HEAD now matches the remote (i.e., you pulled).
  let lastLocalHead = "";
  let lastRemoteHead = "";

  async function pullRemote() {
    if (!cwd) return;
    if (!cwd) return { success: false, error: "no cwd" };
    try {
      // Prefer fast-forward only to avoid merge conflicts in tests
      const out = await execGit("pull --ff-only", cwd).catch(() => {
        throw new Error("ff-only-failed");
      });
      return { success: true, stdout: out };
    } catch (e) {
      console.warn("[gitPoller] pull --ff-only failed, trying normal pull", e);
      try {
        const out2 = await execGit("pull", cwd);
        return { success: true, stdout: out2 };
      } catch (e2) {
        console.error("[gitPoller] pull failed", e2);
        return { success: false, error: e2 };
      }
    }
  }

  async function checkOnce() {
    if (!cwd) return;
    if (!(await isGitRepo(cwd))) return;

    try {
      // Fetch remote first to get an up-to-date remote head
      await execGit("fetch --all --prune", cwd).catch(() => "");

      const localHead = await execGit("rev-parse HEAD", cwd).catch(() => "");

      // Determine upstream ref (prefer tracked upstream @{u}), fallback to origin/HEAD
      let upstreamRef = "";
      try {
        upstreamRef = await execGit(
          "rev-parse --abbrev-ref --symbolic-full-name @{u}",
          cwd
        );
      } catch (e) {
        upstreamRef = "origin/HEAD";
      }

      const remoteHead = upstreamRef
        ? await execGit(`rev-parse ${upstreamRef}`, cwd).catch(() => "")
        : "";

      if (!lastLocalHead) {
        // Initialize tracking; don't react on first run
        lastLocalHead = localHead;
        lastRemoteHead = remoteHead || lastRemoteHead;
        console.debug(
          "[gitPoller] initialized lastLocalHead",
          lastLocalHead,
          "lastRemoteHead",
          lastRemoteHead
        );
        return;
      }

      // If remote head has advanced and local head now equals remote head, this is likely a pull
      if (
        remoteHead &&
        remoteHead !== lastRemoteHead &&
        localHead &&
        localHead === remoteHead
      ) {
        // Determine which files changed in the incoming commits
        const changed = await execGit(
          `diff --name-only ${lastLocalHead} ${localHead}`,
          cwd
        ).catch(() => "");
        let files = changed
          ? changed
              .split(/\r?\n/)
              .map((s) => s.trim())
              .filter(Boolean)
          : [];
        files = files.filter(
          (f) => f && !/\.git(\/|$)/.test(f) && f !== "." && f !== ".."
        );

        const mdChanged = files.some((f) => /\.md$/i.test(f));
        const codeChanged = files.some((f) =>
          /\.(java|js|ts|py|go|cs|cpp|c|kt)$/i.test(f)
        );

        if (mdChanged) {
          // If markdown files were modified on the remote and pulled, ask user to validate those markdowns
          console.debug(
            "[gitPoller] markdown files were changed in remote pull; prompting validation"
          );
          const validate = "Validate Docs";
          const ignoreMd = "Ignore";
          const mdChoice = await vscode.window.showInformationMessage(
            "Markdown files were updated by this pull — validate and update documentation?",
            validate,
            ignoreMd
          );
          if (mdChoice === validate) {
            try {
              await vscode.commands.executeCommand("codedoc.syncDocs", files);
              vscode.window.showInformationMessage(
                "Documentation validation started."
              );
            } catch (e) {
              console.error(
                "Error invoking syncDocs for markdown validation",
                e
              );
              vscode.window.showErrorMessage(
                "Failed to start documentation validation. See console for details."
              );
            }
          }
          // Advance markers and return early
          lastLocalHead = localHead;
          lastRemoteHead = remoteHead;
          return;
        }

        if (!mdChanged && codeChanged) {
          const updateDocs = "Update Docs";
          const ignore = "Ignore";
          const msg = files.length
            ? `You pulled remote changes. ${files.length} files changed. No markdown updated — update documentation?`
            : "You pulled remote changes. No markdown was updated — update documentation?";
          const choice = await vscode.window.showInformationMessage(
            msg,
            updateDocs,
            ignore
          );
          if (choice === updateDocs) {
            try {
              await vscode.commands.executeCommand("codedoc.syncDocs", files);
              vscode.window.showInformationMessage(
                "Documentation sync started."
              );
            } catch (e) {
              console.error("Error invoking syncDocs", e);
              vscode.window.showErrorMessage(
                "Failed to start documentation sync. See console for details."
              );
            }
          }
        }

        // Advance both markers
        lastLocalHead = localHead;
        lastRemoteHead = remoteHead;
        return;
      }

      // If not handled by remoteHead check, continue with local-author heuristic below
      if (!localHead || localHead === lastLocalHead) {
        return;
      }

      // There are new local commits between lastLocalHead..localHead
      const rawCommits = await execGit(
        `log --format=%H|%an|%ae|%s ${lastLocalHead}..${localHead}`,
        cwd
      ).catch(() => "");
      const commitLines = rawCommits
        ? rawCommits
            .split(/\r?\n/)
            .map((s) => s.trim())
            .filter(Boolean)
        : [];

      // Get local git user to try to infer whether these commits came from remote (pull) or are local commits
      const localName = (
        await execGit("config user.name", cwd).catch(() => "")
      ).trim();
      const localEmail = (
        await execGit("config user.email", cwd).catch(() => "")
      ).trim();

      let inferredRemoteUpdate = false;
      const commits = commitLines.map((line) => {
        const parts = line.split("|");
        return {
          sha: parts[0] || "",
          authorName: parts[1] || "",
          authorEmail: parts[2] || "",
          subject: parts.slice(3).join("|") || "",
        };
      });

      // If any commit author/email differs from local git config, treat as remote-sourced (likely a pull)
      for (const c of commits) {
        if (c.authorEmail && localEmail && c.authorEmail !== localEmail) {
          inferredRemoteUpdate = true;
          break;
        }
        if (c.authorName && localName && c.authorName !== localName) {
          inferredRemoteUpdate = true;
          break;
        }
      }

      if (!inferredRemoteUpdate) {
        // Likely local commits authored by the developer — skip prompting
        lastLocalHead = localHead;
        console.debug(
          "[gitPoller] local-only commits detected, skipping docs prompt"
        );
        return;
      }

      // Determine which files changed in the incoming commits
      const changed = await execGit(
        `diff --name-only ${lastLocalHead} ${localHead}`,
        cwd
      ).catch(() => "");
      let files = changed
        ? changed
            .split(/\r?\n/)
            .map((s) => s.trim())
            .filter(Boolean)
        : [];
      files = files.filter(
        (f) => f && !/\.git(\/|$)/.test(f) && f !== "." && f !== ".."
      );

      // If any markdown files were modified in the range, offer to validate/update them
      const mdChanged = files.some((f) => /\.md$/i.test(f));
      if (mdChanged) {
        console.debug(
          "[gitPoller] markdown files were changed in the update; offering validation"
        );
        const validate = "Validate Docs";
        const ignoreMd = "Ignore";
        const mdChoice = await vscode.window.showInformationMessage(
          "Markdown files were updated by this pull — validate and update documentation?",
          validate,
          ignoreMd
        );
        if (mdChoice === validate) {
          try {
            await vscode.commands.executeCommand("codedoc.syncDocs", files);
            vscode.window.showInformationMessage(
              "Documentation validation started."
            );
          } catch (e) {
            console.error("Error invoking syncDocs for markdown validation", e);
            vscode.window.showErrorMessage(
              "Failed to start documentation validation. See console for details."
            );
          }
        }
        lastLocalHead = localHead;
        return;
      }

      // Only prompt when code changed but markdown didn't
      const codeChanged = files.some((f) =>
        /\.(java|js|ts|py|go|cs|cpp|c|kt)$/i.test(f)
      );
      if (!codeChanged) {
        // No code changes detected (maybe only docs elsewhere), update head and skip
        lastLocalHead = localHead;
        return;
      }

      const updateDocs = "Update Docs";
      const ignore = "Ignore";
      const msg = files.length
        ? `You pulled ${commits.length} commit(s). ${files.length} files changed. No markdown updated — update documentation?`
        : "You pulled new commits. No markdown was updated — update documentation?";

      const choice = await vscode.window.showInformationMessage(
        msg,
        updateDocs,
        ignore
      );
      if (choice === updateDocs) {
        try {
          await vscode.commands.executeCommand("codedoc.syncDocs", files);
          vscode.window.showInformationMessage("Documentation sync started.");
        } catch (e) {
          console.error("Error invoking syncDocs", e);
          vscode.window.showErrorMessage(
            "Failed to start documentation sync. See console for details."
          );
        }
      }

      // Advance head marker after handling
      lastLocalHead = localHead;
    } catch (err) {
      console.error("Git poller error:", err);
    }
  }

  // Start immediately and then at interval
  checkOnce();
  const timer = setInterval(() => {
    if (!stopped) checkOnce();
  }, intervalSec * 1000);

  return {
    stop: () => {
      stopped = true;
      clearInterval(timer);
    },
  };
}
