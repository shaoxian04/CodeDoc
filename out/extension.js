"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.activate = activate;
exports.deactivate = deactivate;
const vscode = __importStar(require("vscode"));
const main_provider_1 = require("./views/main_provider");
const java_parser_1 = require("./service/java_parser");
const openai_service_1 = require("./service/openai_service");
const workflow_orchestrator_langchain_1 = require("./agents/workflow_orchestrator_langchain");
function activate(context) {
    console.log('CodeDoc extension is now active!');
    // Log activation for debugging
    console.log('CodeDoc extension activation started');
    const javaParser = new java_parser_1.JavaParser();
    const openaiService = new openai_service_1.OpenAIService();
    const mainProvider = new main_provider_1.MainViewProvider(context.extensionUri);
    const workflowOrchestrator = new workflow_orchestrator_langchain_1.WorkflowOrchestrator(); // Langchain-based workflow orchestrator with RAG and MCP
    console.log('CodeDoc services initialized');
    context.subscriptions.push(vscode.window.registerWebviewViewProvider('codedoc.mainView', mainProvider));
    console.log('CodeDoc webview provider registered');
    context.subscriptions.push(vscode.commands.registerCommand('codedoc.openChat', () => {
        console.log('codedoc.openChat command executed');
        vscode.commands.executeCommand('workbench.view.extension.codedoc-sidebar');
    }));
    context.subscriptions.push(vscode.commands.registerCommand('codedoc.clearChat', () => {
        console.log('codedoc.clearChat command executed');
        mainProvider.clearChat();
    }));
    context.subscriptions.push(vscode.commands.registerCommand('codedoc.generateDocs', async () => {
        console.log('codedoc.generateDocs command executed');
        try {
            // Check if API key is configured
            const config = vscode.workspace.getConfiguration('codedoc');
            const apiKey = config.get('openaiApiKey');
            if (!apiKey) {
                const result = await vscode.window.showErrorMessage('OpenAI API key not configured. Please configure it in the settings.', 'Configure Now');
                if (result === 'Configure Now') {
                    console.log('Redirecting to configureExtension command');
                    vscode.commands.executeCommand('codedoc.configureExtension');
                }
                return;
            }
            vscode.window.showInformationMessage('Generating documentation...');
            // Parse the workspace to get project structure
            const structure = await javaParser.parseWorkspace();
            // Use the Langchain-based workflow orchestrator with RAG
            const response = await workflowOrchestrator.generateProjectOverview(structure, 'Generate comprehensive project overview documentation');
            if (response.success && response.data) {
                mainProvider.showProjectDocumentation(response.data);
                vscode.window.showInformationMessage('Documentation generated successfully!');
            }
            else {
                vscode.window.showErrorMessage(response.error || 'Failed to generate documentation');
            }
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
<<<<<<< Updated upstream
=======
    // Command: sync documentation intelligently with workspace markdown
    context.subscriptions.push(vscode.commands.registerCommand('codedoc.syncDocs', async (changedFiles) => {
        console.log('codedoc.syncDocs command executed', { changedFiles });
        try {
            const structure = await javaParser.parseWorkspace();
            // Find all markdown files in workspace (excluding node_modules)
            const mdFiles = await vscode.workspace.findFiles('**/*.md', '**/node_modules/**');
            if (!mdFiles || mdFiles.length === 0) {
                // No markdowns — generate a README overview from the project structure
                const resp = await workflowOrchestrator.generateProjectOverview(structure, 'Generate concise project overview for README');
                const generated = resp.success && resp.data ? resp.data : '';
                const create = 'Create README.md';
                const preview = 'Preview';
                const choice = await vscode.window.showInformationMessage('No markdown files found in workspace. Create a README.md with generated overview?', create, preview, 'Cancel');
                if (choice === preview) {
                    const doc = await vscode.workspace.openTextDocument({ content: generated, language: 'markdown' });
                    await vscode.window.showTextDocument(doc, { preview: false });
                    return;
                }
                if (choice === create) {
                    const wsRoot = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0].uri;
                    if (!wsRoot) {
                        vscode.window.showErrorMessage('No workspace root found to create README.md');
                        return;
                    }
                    const newUri = vscode.Uri.joinPath(wsRoot, 'README.md');
                    await vscode.workspace.fs.writeFile(newUri, Buffer.from(generated, 'utf8'));
                    vscode.window.showInformationMessage('README.md created with generated overview.');
                    return;
                }
                return;
            }
            // Simple similarity: token overlap
            function similarity(a, b) {
                const wa = new Set(a.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean));
                const wb = new Set(b.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean));
                const inter = [...wa].filter(x => wb.has(x)).length;
                const union = new Set([...wa, ...wb]).size || 1;
                return inter / union;
            }
            const replacements = [];
            const path = require('path');
            // If changedFiles is provided, narrow down markdown files to those related to changed files
            let filesToCheck = mdFiles;
            if (changedFiles && Array.isArray(changedFiles) && changedFiles.length) {
                const related = [];
                for (const mdUri of mdFiles) {
                    const mdDir = path.dirname(mdUri.fsPath);
                    for (const cf of changedFiles) {
                        try {
                            const cfNorm = cf.replace(/\\/g, '/');
                            const cfDir = path.dirname(cfNorm);
                            if (cfDir.startsWith(mdDir) || mdDir.startsWith(cfDir)) {
                                related.push(mdUri);
                                break;
                            }
                        }
                        catch (e) {
                            // ignore path parse errors
                        }
                    }
                }
                // Always include root README if present
                const rootReadme = mdFiles.find(u => u.fsPath.toLowerCase().endsWith(path.sep + 'readme.md'));
                if (rootReadme && !related.find(u => u.fsPath === rootReadme.fsPath))
                    related.push(rootReadme);
                if (related.length)
                    filesToCheck = related;
            }
            // Helper: extract significant tokens from markdown to search codebase (identifiers, class names, function names)
            function extractTokensFromMarkdown(text) {
                // match camelCase, PascalCase, snake_case, dot.paths, and words longer than 2 chars
                const tokenRe = /([A-Za-z_$][A-Za-z0-9_$]{2,}|[A-Z][a-z]+[A-Z][A-Za-z0-9_]*)/g;
                const tokens = new Set();
                let m;
                while ((m = tokenRe.exec(text))) {
                    const t = m[1].trim();
                    if (t && t.length > 2)
                        tokens.add(t);
                }
                return [...tokens].slice(0, 200); // limit
            }
            const workspaceRoot = vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders[0].uri.fsPath;
            // Helper: get last commit timestamp for a file (returns epoch ms) or 0
            async function lastCommitTimeForFile(filePath, cwdPath) {
                try {
                    if (!cwdPath)
                        return 0;
                    const out = await execGit(`log -1 --format=%ct -- ${filePath}`, cwdPath).catch(() => '');
                    if (!out)
                        return 0;
                    const sec = parseInt(out.trim(), 10);
                    if (isNaN(sec))
                        return 0;
                    return sec * 1000;
                }
                catch (e) {
                    return 0;
                }
            }
            // If changedFiles were provided, pre-scan them for annotations so we can detect custom mapping changes
            const changedFileAnnotations = new Set();
            if (changedFiles && Array.isArray(changedFiles) && changedFiles.length && workspaceRoot) {
                for (const cf of changedFiles) {
                    try {
                        const absPath = cf.startsWith('/') || cf.indexOf('\\:') >= 0 ? cf : path.join(workspaceRoot, cf);
                        if (fs.existsSync(absPath)) {
                            const content = await fs.promises.readFile(absPath, 'utf8');
                            const as = (function extractAnnotationsLocal(text) {
                                const s = new Set();
                                if (!text)
                                    return s;
                                const re = /@([A-Za-z_][A-Za-z0-9_]*)/g;
                                let mm;
                                while ((mm = re.exec(text)))
                                    s.add(mm[1].toLowerCase());
                                return s;
                            })(content);
                            for (const a of as)
                                changedFileAnnotations.add(a);
                        }
                    }
                    catch (e) {
                        // ignore read errors
                    }
                }
            }
            // For each markdown file, ask the orchestrator to update the existing file to match the codebase
            for (const mdUri of filesToCheck) {
                try {
                    const existing = await vscode.workspace.openTextDocument(mdUri).then(d => d.getText());
                    // Determine related code files by extracting tokens from the markdown and searching the codebase
                    const relPath = vscode.workspace.asRelativePath(mdUri);
                    const tokens = extractTokensFromMarkdown(existing);
                    const codeGlobs = ['**/*.{java,js,ts,jsx,tsx,py,go,cs,cpp,c,kt}'];
                    const candidateUris = [];
                    for (const g of codeGlobs) {
                        const found = await vscode.workspace.findFiles(g, '**/node_modules/**', 200);
                        for (const u of found)
                            candidateUris.push(u);
                    }
                    // Score files by token occurrences
                    const scores = [];
                    for (const u of candidateUris) {
                        try {
                            const text = await vscode.workspace.openTextDocument(u).then(d => d.getText());
                            let s = 0;
                            for (const tk of tokens) {
                                if (text.indexOf(tk) >= 0)
                                    s += 1;
                            }
                            if (s > 0) {
                                const snippet = text.slice(0, 2000);
                                scores.push({ uri: u, score: s, snippet });
                            }
                        }
                        catch (e) {
                            // ignore
                        }
                    }
                    scores.sort((a, b) => b.score - a.score);
                    const topFiles = scores.slice(0, 10);
                    const referenced = topFiles.map(f => f.uri.fsPath);
                    // Compute last commit times
                    const mdCommit = await lastCommitTimeForFile(mdUri.fsPath, workspaceRoot);
                    let latestCodeCommit = 0;
                    for (const ref of referenced) {
                        const t = await lastCommitTimeForFile(ref, workspaceRoot);
                        if (t > latestCodeCommit)
                            latestCodeCommit = t;
                    }
                    // If no referenced files were found, as a fallback check whole repo latest commit
                    if (referenced.length === 0) {
                        const repoLatest = await execGit('log -1 --format=%ct', workspaceRoot).catch(() => '');
                        if (repoLatest) {
                            const sec = parseInt(repoLatest.trim(), 10);
                            if (!isNaN(sec))
                                latestCodeCommit = Math.max(latestCodeCommit, sec * 1000);
                        }
                    }
                    // Heuristic: detect if markdown contains tokens that lack descriptions
                    function markdownLacksDescription(markdownText, tokens) {
                        // Split into paragraphs
                        const paragraphs = markdownText.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
                        for (const tk of tokens.slice(0, 20)) {
                            const occurrences = paragraphs.filter(p => p.indexOf(tk) >= 0);
                            if (occurrences.length === 0)
                                continue;
                            // If any occurrence paragraph is extremely short (likely just a code mention), treat as lacking description
                            for (const p of occurrences) {
                                const plain = p.replace(/[`\-*>#]/g, '').trim();
                                if (plain.length < 40) {
                                    return true;
                                }
                            }
                        }
                        return false;
                    }
                    let lacksDesc = markdownLacksDescription(existing, tokens);
                    // New heuristic: detect annotation mismatches generically (any @annotation)
                    function extractAnnotations(text) {
                        const s = new Set();
                        if (!text)
                            return s;
                        // match @identifier or @identifier(...) and normalize to lower-case simple name
                        const re = /@([A-Za-z_][A-Za-z0-9_]*)/g;
                        let mm;
                        while ((mm = re.exec(text))) {
                            s.add(mm[1].toLowerCase());
                        }
                        return s;
                    }
                    const mdAnnotations = extractAnnotations(existing);
                    const codeAnnotations = new Set();
                    for (const f of topFiles) {
                        try {
                            const as = extractAnnotations(f.snippet);
                            for (const a of as)
                                codeAnnotations.add(a);
                        }
                        catch (e) { /* ignore */ }
                    }
                    // Also consider annotations found in the changed files directly (if provided) as authoritative code-side annotations
                    for (const a of changedFileAnnotations)
                        codeAnnotations.add(a);
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
                        console.debug('[codedoc.syncDocs] annotation mismatch detected for', relPath, 'code=', [...codeAnnotations], 'md=', [...mdAnnotations]);
                    }
                    // Additional heuristic: detect method signature / parameter mismatches
                    function extractMethodSignaturesFromCode(text) {
                        const sigs = new Set();
                        if (!text)
                            return sigs;
                        // Very small heuristic regexes for common languages (Java/TS/JS/Python)
                        const javaLike = /(?:public|private|protected|static|final|synchronized|async|export)\s+[\w<>,\s\[\]]+\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^\)]*)\)/g;
                        let m;
                        while ((m = javaLike.exec(text))) {
                            const name = m[1];
                            const params = m[2].replace(/\s+/g, ' ').trim();
                            sigs.add(`${name}(${params})`);
                        }
                        // JS/TS arrow functions and function declarations
                        const fnRe = /function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^\)]*)\)/g;
                        while ((m = fnRe.exec(text))) {
                            const name = m[1];
                            const params = m[2].replace(/\s+/g, ' ').trim();
                            sigs.add(`${name}(${params})`);
                        }
                        const arrowRe = /([A-Za-z_][A-Za-z0-9_]*)\s*=\s*\(([^\)]*)\)\s*=>/g;
                        while ((m = arrowRe.exec(text))) {
                            const name = m[1];
                            const params = m[2].replace(/\s+/g, ' ').trim();
                            sigs.add(`${name}(${params})`);
                        }
                        return sigs;
                    }
                    function extractMentionedParamsFromMarkdown(md) {
                        const params = new Set();
                        if (!md)
                            return params;
                        // find patterns like methodName(param1, param2) or param: description
                        const callRe = /([A-Za-z_][A-Za-z0-9_]*)\s*\(([^\)]*)\)/g;
                        let mm;
                        while ((mm = callRe.exec(md))) {
                            const name = mm[1];
                            const ps = mm[2].split(',').map(s => s.trim()).filter(Boolean);
                            params.add(`${name}(${ps.join(', ')})`);
                        }
                        // parameter list bullets: '- paramName: description'
                        const paramLineRe = /^[\-\*]\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*:/gm;
                        while ((mm = paramLineRe.exec(md))) {
                            const p = mm[1];
                            params.add(p);
                        }
                        return params;
                    }
                    const codeSigs = new Set();
                    for (const f of topFiles) {
                        try {
                            const s = extractMethodSignaturesFromCode(f.snippet);
                            for (const ss of s)
                                codeSigs.add(ss);
                        }
                        catch (e) { /* ignore */ }
                    }
                    const mdParams = extractMentionedParamsFromMarkdown(existing);
                    // If code contains a signature that is not mentioned in the markdown (or markdown mentions a different signature), flag mismatch
                    let signatureMismatch = false;
                    if (codeSigs.size > 0) {
                        // If markdown mentions no signatures at all, and code has signatures, we may still want to update if descriptions are short
                        if (mdParams.size === 0 && lacksDesc)
                            signatureMismatch = true;
                        else {
                            // If any code signature name appears with different parameter list in markdown, flag
                            for (const cs of codeSigs) {
                                // extract method name
                                const name = cs.split('(')[0];
                                const mdMatching = [...mdParams].find(d => d.startsWith(name + '(') || d === name);
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
                        console.debug('[codedoc.syncDocs] signature mismatch detected for', relPath, 'codeSigs=', [...codeSigs], 'mdParams=', [...mdParams]);
                    }
                    ``;
                    // If code is not newer than markdown, AND markdown seems to have adequate descriptions, AND no annotation/signature mismatch detected, skip
                    if (latestCodeCommit <= mdCommit && !lacksDesc && !annotationMismatch && !signatureMismatch) {
                        console.debug('[codedoc.syncDocs] skipping', relPath, 'no newer code referenced and descriptions present');
                        continue;
                    }
                    // If markdown contains paragraphs that are just a method name (or a backticked name),
                    // ask the documentation agent to expand them with a short description and the source code.
                    const paragraphs = existing.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean);
                    const identRe = /^`?([A-Za-z_][A-Za-z0-9_]*)`?$/;
                    const identifierOnly = [];
                    for (const p of paragraphs) {
                        const m = p.match(identRe);
                        if (m)
                            identifierOnly.push(m[1]);
                    }
                    if (identifierOnly.length) {
                        // Treat as lacking description so we force update flow
                        lacksDesc = true;
                    }
                    // Truncate existing content in prompt if extremely large
                    let existingSnippet = existing.length > 3000 ? existing.slice(0, 3000) + '\n\n...[truncated]' : existing;
                    // If identifier-only mentions exist, append a hint for the agent describing desired behavior
                    if (identifierOnly.length) {
                        const hint = `\n\n<!-- CODEDOC_HINT: For the following identifiers found as standalone paragraphs: ${identifierOnly.join(', ')}. Please add a concise (1-2 sentence) description for each and include the method's source code as a fenced code block (use the related code snippets provided). Only modify or augment these sections. -->`;
                        existingSnippet += hint;
                    }
                    const prompt = `You are given an existing markdown file (path: ${relPath}) and the current project structure context.\n\nExisting file content:\n---\n${existingSnippet}\n---\n\nReferenced code files (only include content when necessary):\n${referenced.join('\n')}\n\nPlease update this markdown so that it correctly documents the current codebase based on the referenced code. Only change sections that are inconsistent with the code; preserve formatting and headings where possible. Return the full, updated markdown content only.`;
                    // Build related file snippets to pass to the orchestrator
                    const relatedFilesForAgent = topFiles.map(f => ({ path: vscode.workspace.asRelativePath(f.uri), snippet: f.snippet }));
                    const respForFile = await workflowOrchestrator.updateMarkdownFile(structure, existing, relatedFilesForAgent, relPath);
                    if (!respForFile.success || !respForFile.data) {
                        console.warn('[codedoc.syncDocs] failed to update suggestion for', relPath, respForFile.error);
                        continue;
                    }
                    let suggested = respForFile.data;
                    // Sanitize agent output to remove accidental fenced triples
                    suggested = sanitizeMarkdownOutput(suggested);
                    const sim = similarity(existing, suggested);
                    console.debug('[codedoc.syncDocs] file', relPath, 'similarity', sim);
                    // Threshold: if similarity < 0.75, propose update
                    // Also: always propose update if we detected annotation or signature mismatches
                    if (sim < 0.75 || annotationMismatch || signatureMismatch) {
                        const replace = `Replace ${relPath}`;
                        const preview = `Preview ${relPath}`;
                        const ignore = 'Ignore';
                        const choice = await vscode.window.showInformationMessage(`${relPath} appears outdated relative to the code. Update this markdown?`, replace, preview, ignore);
                        if (choice === preview) {
                            const doc = await vscode.workspace.openTextDocument({ content: sanitizeMarkdownOutput(suggested), language: 'markdown' });
                            await vscode.window.showTextDocument(doc, { preview: false });
                            // prompt again for replace
                            const confirm = await vscode.window.showInformationMessage(`Replace ${relPath} with suggested content?`, `Replace ${relPath}`, 'Cancel');
                            if (confirm !== `Replace ${relPath}`)
                                continue;
                        }
                        if (choice === replace || (choice === undefined && false)) {
                            try {
                                // Backup existing
                                const backupPath = mdUri.fsPath + `.bak.${Date.now()}`;
                                const backupUri = vscode.Uri.file(backupPath);
                                await vscode.workspace.fs.writeFile(backupUri, Buffer.from(existing, 'utf8'));
                                // Write new content
                                await vscode.workspace.fs.writeFile(mdUri, Buffer.from(suggested, 'utf8'));
                                replacements.push({ uri: mdUri, backup: backupPath });
                                vscode.window.showInformationMessage(`${relPath} replaced and backup created.`);
                            }
                            catch (e) {
                                console.error('Error replacing markdown', mdUri.fsPath, e);
                                vscode.window.showErrorMessage(`Failed to replace ${relPath}. See console for details.`);
                            }
                        }
                    }
                }
                catch (e) {
                    console.error('Error checking markdown file', mdUri.fsPath, e);
                }
            }
            if (replacements.length) {
                vscode.window.showInformationMessage(`Updated ${replacements.length} markdown file(s). Backups created.`);
            }
            else {
                vscode.window.showInformationMessage('No markdown files needed updating.');
            }
        }
        catch (error) {
            console.error('Error in syncDocs', error);
            vscode.window.showErrorMessage(`Error syncing docs: ${error}`);
        }
    }));
>>>>>>> Stashed changes
    context.subscriptions.push(vscode.commands.registerCommand('codedoc.visualizeCode', async () => {
        console.log('codedoc.visualizeCode command executed');
        try {
            // Check if API key is configured
            const config = vscode.workspace.getConfiguration('codedoc');
            const apiKey = config.get('openaiApiKey');
            if (!apiKey) {
                const result = await vscode.window.showErrorMessage('OpenAI API key not configured. Please configure it in the settings.', 'Configure Now');
                if (result === 'Configure Now') {
                    console.log('Redirecting to configureExtension command');
                    vscode.commands.executeCommand('codedoc.configureExtension');
                }
                return;
            }
            vscode.window.showInformationMessage('Analyzing code structure...');
            // Parse the workspace to get project structure
            const structure = await javaParser.parseWorkspace();
            // Use the Langchain-based workflow orchestrator with RAG
            const response = await workflowOrchestrator.generateVisualization(structure, 'Generate architecture diagram and visualization');
            if (response.success && response.data) {
                // For visualization, we need to parse the data properly
                mainProvider.updateVisualization(structure);
                await vscode.commands.executeCommand('codedoc.mainView.focus');
                vscode.window.showInformationMessage('Code visualization updated!');
            }
            else {
                vscode.window.showErrorMessage(response.error || 'Failed to generate visualization');
            }
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
        console.log('codedoc.configureExtension command executed');
        const result = await showConfigurationQuickPick();
        if (result) {
            vscode.window.showInformationMessage('Configuration updated successfully!');
            openaiService.reinitialize();
            // Note: We don't need to reinitialize the workflow orchestrator as it uses the config at runtime
        }
    }));
    context.subscriptions.push(vscode.commands.registerCommand('codedoc.generateClassDocs', async () => {
        console.log('codedoc.generateClassDocs command executed');
        try {
            // Check if API key is configured
            const config = vscode.workspace.getConfiguration('codedoc');
            const apiKey = config.get('openaiApiKey');
            if (!apiKey) {
                const result = await vscode.window.showErrorMessage('OpenAI API key not configured. Please configure it in the settings.', 'Configure Now');
                if (result === 'Configure Now') {
                    console.log('Redirecting to configureExtension command');
                    vscode.commands.executeCommand('codedoc.configureExtension');
                }
                return;
            }
            vscode.window.showInformationMessage('Generating class documentation...');
            const editor = vscode.window.activeTextEditor;
            if (!editor) {
                vscode.window.showWarningMessage('No active editor found. Please open a Java file and select some code.');
                return;
            }
            let code = '';
            let fileName = '';
            if (editor.selection.isEmpty) {
                code = editor.document.getText();
                fileName = editor.document.fileName;
            }
            else {
                code = editor.document.getText(editor.selection);
                fileName = editor.document.fileName;
            }
            if (!code.trim()) {
                vscode.window.showWarningMessage('No code selected or file is empty.');
                return;
            }
            // Parse the workspace to find the relevant class
            const structure = await javaParser.parseWorkspace();
            const className = fileName.split(/[/\\]/).pop()?.replace('.java', '') || '';
            const javaClass = structure.classes.find(cls => cls.name === className);
            if (!javaClass) {
                vscode.window.showWarningMessage(`Could not find class ${className} in the project.`);
                return;
            }
            // Find related classes (dependencies)
            const relatedClasses = structure.classes.filter(cls => javaClass.dependencies.includes(cls.name) ||
                structure.relationships.some(rel => (rel.from === javaClass.name && rel.to === cls.name) ||
                    (rel.to === javaClass.name && rel.from === cls.name)));
            // Use the Langchain-based workflow orchestrator for class documentation with RAG
            const response = await workflowOrchestrator.generateClassDocumentation(javaClass, relatedClasses, `Generate documentation for class ${javaClass.name}`);
            if (response.success && response.data) {
                mainProvider.showClassDocumentation(response.data);
                vscode.window.showInformationMessage('Class documentation generated successfully!');
            }
            else {
                vscode.window.showErrorMessage(response.error || 'Failed to generate class documentation');
            }
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
        console.log('codedoc.exportClassDocs command executed');
        if (!content) {
            vscode.window.showWarningMessage('No documentation content to export.');
            return;
        }
        try {
            const doc = await vscode.workspace.openTextDocument({
                content: content,
                language: content.startsWith('#') ? '``' : undefined // Use code block language if content is code
            });
            await vscode.window.showTextDocument(doc);
            vscode.window.showInformationMessage('Class documentation exported successfully!');
        }
        catch (error) {
            vscode.window.showErrorMessage(`Error exporting documentation: ${error}`);
        }
    }));
    // Add chat message processing command
    context.subscriptions.push(vscode.commands.registerCommand('codedoc.processChatMessage', async (message) => {
        console.log('codedoc.processChatMessage command executed with message:', message);
        try {
            // Check if API key is configured
            const config = vscode.workspace.getConfiguration('codedoc');
            const apiKey = config.get('openaiApiKey');
            if (!apiKey) {
                const result = await vscode.window.showErrorMessage('OpenAI API key not configured. Please configure it in the settings.', 'Configure Now');
                if (result === 'Configure Now') {
                    console.log('Redirecting to configureExtension command');
                    vscode.commands.executeCommand('codedoc.configureExtension');
                }
                return;
            }
            // Parse the workspace to get project structure for context
            const structure = await javaParser.parseWorkspace();
            console.log('Parsed project structure:', structure);
            // Use the Langchain-based workflow orchestrator with RAG for chat
            const response = await workflowOrchestrator.handleChatRequest(message, { projectStructure: structure });
            console.log('Workflow orchestrator response:', response);
            if (response.success && response.data) {
                mainProvider.showChatResponse(response); // Pass the entire response, not just response.data
            }
            else {
                mainProvider.showChatError(response.error || 'Failed to process chat message');
            }
        }
        catch (error) {
            console.error('Error processing chat message:', error);
            mainProvider.showChatError(`Error processing chat message: ${error}`);
        }
    }));
    vscode.commands.executeCommand('setContext', 'codedoc.chatViewEnabled', true);
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
    console.log('CodeDoc extension activation completed');
}
function deactivate() {
    console.log('CodeDoc extension is deactivated');
}
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
async function configureMaxTokens() {
    const maxTokens = await vscode.window.showInputBox({
        prompt: 'Enter maximum tokens for OpenAI responses',
        placeHolder: '500',
        value: vscode.workspace.getConfiguration('codedoc').get('maxTokens', 500).toString(),
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
<<<<<<< Updated upstream
=======
// --- Git helper functions and poller ---
function execGit(cmd, cwd) {
    return new Promise((resolve, reject) => {
        cp.exec(`git ${cmd}`, { cwd }, (err, stdout, stderr) => {
            if (err)
                return reject({ err, stderr });
            resolve(stdout.trim());
        });
    });
}
async function isGitRepo(cwd) {
    try {
        await execGit('rev-parse --is-inside-work-tree', cwd);
        return true;
    }
    catch (e) {
        return false;
    }
}
function pathJoin(...parts) {
    const p = require('path');
    return p.join(...parts);
}
function startGitRemotePoller() {
    const config = vscode.workspace.getConfiguration('codedoc');
    const intervalSec = config.get('gitPollIntervalSec', 10) || 10;
    const folders = vscode.workspace.workspaceFolders || [];
    const cwd = folders.length ? folders[0].uri.fsPath : undefined;
    let stopped = false;
    // Track last seen local and remote HEADs. We'll detect when local HEAD advances (pull/merge/local-commit)
    // and try to infer whether the advance came from a remote pull by comparing commit authors or by
    // checking that remote HEAD advanced and local HEAD now matches the remote (i.e., you pulled).
    let lastLocalHead = '';
    let lastRemoteHead = '';
    async function pullRemote() {
        if (!cwd)
            return;
        if (!cwd)
            return { success: false, error: 'no cwd' };
        try {
            // Prefer fast-forward only to avoid merge conflicts in tests
            const out = await execGit('pull --ff-only', cwd).catch(() => { throw new Error('ff-only-failed'); });
            return { success: true, stdout: out };
        }
        catch (e) {
            console.warn('[gitPoller] pull --ff-only failed, trying normal pull', e);
            try {
                const out2 = await execGit('pull', cwd);
                return { success: true, stdout: out2 };
            }
            catch (e2) {
                console.error('[gitPoller] pull failed', e2);
                return { success: false, error: e2 };
            }
        }
    }
    async function checkOnce() {
        if (!cwd)
            return;
        if (!(await isGitRepo(cwd)))
            return;
        try {
            // Fetch remote first to get an up-to-date remote head
            await execGit('fetch --all --prune', cwd).catch(() => '');
            const localHead = await execGit('rev-parse HEAD', cwd).catch(() => '');
            // Determine upstream ref (prefer tracked upstream @{u}), fallback to origin/HEAD
            let upstreamRef = '';
            try {
                upstreamRef = await execGit('rev-parse --abbrev-ref --symbolic-full-name @{u}', cwd);
            }
            catch (e) {
                upstreamRef = 'origin/HEAD';
            }
            const remoteHead = upstreamRef ? await execGit(`rev-parse ${upstreamRef}`, cwd).catch(() => '') : '';
            if (!lastLocalHead) {
                // Initialize tracking; don't react on first run
                lastLocalHead = localHead;
                lastRemoteHead = remoteHead || lastRemoteHead;
                console.debug('[gitPoller] initialized lastLocalHead', lastLocalHead, 'lastRemoteHead', lastRemoteHead);
                return;
            }
            // If remote head has advanced and local head now equals remote head, this is likely a pull
            if (remoteHead && remoteHead !== lastRemoteHead && localHead && localHead === remoteHead) {
                // Sometimes remoteHead moves because *you* pushed from another clone. Check authors between lastRemoteHead..remoteHead
                // and if all commits are authored by the local git user, treat it as a local push and skip prompting.
                try {
                    const rawRemoteCommits = await execGit(`log --format=%H|%an|%ae ${lastRemoteHead}..${remoteHead}`, cwd).catch(() => '');
                    const remoteCommitLines = rawRemoteCommits ? rawRemoteCommits.split(/\r?\n/).map(s => s.trim()).filter(Boolean) : [];
                    const localName = (await execGit('config user.name', cwd).catch(() => '')).trim();
                    const localEmail = (await execGit('config user.email', cwd).catch(() => '')).trim();
                    let allLocalAuthored = true;
                    for (const ln of remoteCommitLines) {
                        const parts = ln.split('|');
                        const authorName = parts[1] || '';
                        const authorEmail = parts[2] || '';
                        if (localEmail && authorEmail && authorEmail === localEmail)
                            continue;
                        if (localName && authorName && authorName === localName)
                            continue;
                        // if we can't match either, consider it non-local
                        allLocalAuthored = false;
                        break;
                    }
                    if (allLocalAuthored && remoteCommitLines.length) {
                        console.debug('[gitPoller] remoteHead advanced but all commits authored by local user; skipping docs prompt');
                        lastLocalHead = localHead;
                        lastRemoteHead = remoteHead;
                        return;
                    }
                }
                catch (e) {
                    // ignore and continue to normal behavior
                }
                // Determine which files changed in the incoming commits
                const changed = await execGit(`diff --name-only ${lastLocalHead} ${localHead}`, cwd).catch(() => '');
                let files = changed ? changed.split(/\r?\n/).map(s => s.trim()).filter(Boolean) : [];
                files = files.filter(f => f && !/\.git(\/|$)/.test(f) && f !== '.' && f !== '..');
                const mdChanged = files.some(f => /\.md$/i.test(f));
                const codeChanged = files.some(f => /\.(java|js|ts|py|go|cs|cpp|c|kt)$/i.test(f));
                if (mdChanged) {
                    // If markdown files were modified on the remote and pulled, ask user to validate those markdowns
                    console.debug('[gitPoller] markdown files were changed in remote pull; prompting validation');
                    const validate = 'Validate Docs';
                    const ignoreMd = 'Ignore';
                    const mdChoice = await vscode.window.showInformationMessage('Markdown files were updated by this pull — validate and update documentation?', validate, ignoreMd);
                    if (mdChoice === validate) {
                        try {
                            await vscode.commands.executeCommand('codedoc.syncDocs', files);
                            vscode.window.showInformationMessage('Documentation validation started.');
                        }
                        catch (e) {
                            console.error('Error invoking syncDocs for markdown validation', e);
                            vscode.window.showErrorMessage('Failed to start documentation validation. See console for details.');
                        }
                    }
                    // Advance markers and return early
                    lastLocalHead = localHead;
                    lastRemoteHead = remoteHead;
                    return;
                }
                if (!mdChanged && codeChanged) {
                    const updateDocs = 'Update Docs';
                    const ignore = 'Ignore';
                    const msg = files.length ? `You pulled remote changes. ${files.length} files changed. No markdown updated — update documentation?` : 'You pulled remote changes. No markdown was updated — update documentation?';
                    const choice = await vscode.window.showInformationMessage(msg, updateDocs, ignore);
                    if (choice === updateDocs) {
                        try {
                            await vscode.commands.executeCommand('codedoc.syncDocs', files);
                            vscode.window.showInformationMessage('Documentation sync started.');
                        }
                        catch (e) {
                            console.error('Error invoking syncDocs', e);
                            vscode.window.showErrorMessage('Failed to start documentation sync. See console for details.');
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
            const rawCommits = await execGit(`log --format=%H|%an|%ae|%s ${lastLocalHead}..${localHead}`, cwd).catch(() => '');
            const commitLines = rawCommits ? rawCommits.split(/\r?\n/).map(s => s.trim()).filter(Boolean) : [];
            // Get local git user to try to infer whether these commits came from remote (pull) or are local commits
            const localName = (await execGit('config user.name', cwd).catch(() => '')).trim();
            const localEmail = (await execGit('config user.email', cwd).catch(() => '')).trim();
            let inferredRemoteUpdate = false;
            const commits = commitLines.map(line => {
                const parts = line.split('|');
                return { sha: parts[0] || '', authorName: parts[1] || '', authorEmail: parts[2] || '', subject: parts.slice(3).join('|') || '' };
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
                console.debug('[gitPoller] local-only commits detected, skipping docs prompt');
                return;
            }
            // Determine which files changed in the incoming commits
            const changed = await execGit(`diff --name-only ${lastLocalHead} ${localHead}`, cwd).catch(() => '');
            let files = changed ? changed.split(/\r?\n/).map(s => s.trim()).filter(Boolean) : [];
            files = files.filter(f => f && !/\.git(\/|$)/.test(f) && f !== '.' && f !== '..');
            // If any markdown files were modified in the range, offer to validate/update them
            const mdChanged = files.some(f => /\.md$/i.test(f));
            if (mdChanged) {
                console.debug('[gitPoller] markdown files were changed in the update; offering validation');
                const validate = 'Validate Docs';
                const ignoreMd = 'Ignore';
                const mdChoice = await vscode.window.showInformationMessage('Markdown files were updated by this pull — validate and update documentation?', validate, ignoreMd);
                if (mdChoice === validate) {
                    try {
                        await vscode.commands.executeCommand('codedoc.syncDocs', files);
                        vscode.window.showInformationMessage('Documentation validation started.');
                    }
                    catch (e) {
                        console.error('Error invoking syncDocs for markdown validation', e);
                        vscode.window.showErrorMessage('Failed to start documentation validation. See console for details.');
                    }
                }
                lastLocalHead = localHead;
                return;
            }
            // Only prompt when code changed but markdown didn't
            const codeChanged = files.some(f => /\.(java|js|ts|py|go|cs|cpp|c|kt)$/i.test(f));
            if (!codeChanged) {
                // No code changes detected (maybe only docs elsewhere), update head and skip
                lastLocalHead = localHead;
                return;
            }
            const updateDocs = 'Update Docs';
            const ignore = 'Ignore';
            const msg = files.length ? `You pulled ${commits.length} commit(s). ${files.length} files changed. No markdown updated — update documentation?` : 'You pulled new commits. No markdown was updated — update documentation?';
            const choice = await vscode.window.showInformationMessage(msg, updateDocs, ignore);
            if (choice === updateDocs) {
                try {
                    await vscode.commands.executeCommand('codedoc.syncDocs', files);
                    vscode.window.showInformationMessage('Documentation sync started.');
                }
                catch (e) {
                    console.error('Error invoking syncDocs', e);
                    vscode.window.showErrorMessage('Failed to start documentation sync. See console for details.');
                }
            }
            // Advance head marker after handling
            lastLocalHead = localHead;
        }
        catch (err) {
            console.error('Git poller error:', err);
        }
    }
    // Start immediately and then at interval
    checkOnce();
    const timer = setInterval(() => { if (!stopped)
        checkOnce(); }, intervalSec * 1000);
    return {
        stop: () => { stopped = true; clearInterval(timer); }
    };
}
// Sanitize markdown-like output from LLMs/agents by removing surrounding code fences
function sanitizeMarkdownOutput(text) {
    if (!text || typeof text !== 'string')
        return text;
    let s = text.trim();
    // If the entire content is wrapped in a single fenced block, remove the outer fences
    const fullFence = s.match(/^```[^\n]*\n([\s\S]*)\n```$/);
    if (fullFence && fullFence[1]) {
        return fullFence[1].trim();
    }
    // Otherwise, strip a single leading fence and a single trailing fence if present
    s = s.replace(/^```[^\n]*\n/, '');
    s = s.replace(/\n```\s*$/, '');
    return s.trim();
}
>>>>>>> Stashed changes
//# sourceMappingURL=extension.js.map