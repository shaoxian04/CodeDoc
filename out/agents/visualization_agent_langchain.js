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
exports.VisualizationAgent = void 0;
const openai_1 = require("@langchain/openai");
const output_parsers_1 = require("@langchain/core/output_parsers");
const prompts_1 = require("@langchain/core/prompts");
const java_parser_1 = require("../service/java_parser");
const rag_service_1 = require("../service/rag_service");
const vscode = __importStar(require("vscode"));
class VisualizationAgent {
    model = null;
    outputParser;
    ragService;
    constructor() {
        this.outputParser = new output_parsers_1.StringOutputParser();
        this.ragService = new rag_service_1.RAGService();
        // We don't initialize the model here to avoid requiring API key during extension activation
    }
    initializeModel() {
        if (this.model) {
            return this.model;
        }
        // Get configuration
        const config = vscode.workspace.getConfiguration("codedoc");
        const apiKey = config.get("openaiApiKey");
        const modelName = config.get("openaiModel", "gpt-4");
        const maxTokens = config.get("maxTokens", 500); // Reduced from 2000 to 500 for concise responses
        const temperature = config.get("temperature", 0.3);
        if (!apiKey) {
            throw new Error("OpenAI API key not configured. Please configure it in the settings.");
        }
        this.model = new openai_1.ChatOpenAI({
            modelName: modelName,
            temperature: temperature,
            maxTokens: maxTokens,
            openAIApiKey: apiKey,
        });
        return this.model;
    }
    async execute(context) {
        const task = context.task;
        switch (task) {
            case "generateArchitectureDiagram":
                return await this.generateArchitectureDescription(context.projectStructure, context.userQuery);
            case "generateClassRelationshipDiagram":
                return await this.generateClassRelationshipDiagram(context.targetClass, context.relatedClasses, context.springContext);
            case "generateVisualizationData":
                return await this.generateVisualizationData(context.projectStructure, context.userQuery);
            case "generateSpecificDiagram":
                return await this.generateSpecificDiagram(context.diagramType, context.module, context.projectStructure);
            default:
                throw new Error(`Unknown task: ${task}`);
        }
    }
    async generateArchitectureDescription(structure, userQuery) {
        try {
            const model = this.initializeModel();
            let finalPrompt = `
                Generate a concise architecture description of this Java/Spring project for new developers.
                Focus on the key components and relationships that matter for understanding the system.
                
                Project Structure:
                {structure}
                
                Guidelines for documentation:
                1. Start with a brief description of the system architecture (1-2 sentences)
                2. Describe the main architectural layers and their responsibilities
                3. List the most important components and their relationships
                4. Include a simple mermaid diagram showing key relationships
                5. Keep the entire documentation under 250 words
                6. Use simple language that new developers can understand
                7. Format the response in clear headings
            `;
            if (userQuery && structure) {
                const context = await this.ragService.retrieveContext(userQuery, structure);
                const augmentedPrompt = await this.ragService.augmentPrompt(finalPrompt, context);
                // Use the augmented prompt directly instead of treating it as a template
                finalPrompt = augmentedPrompt;
            }
            // Use the existing JavaParser to get project structure
            const javaParser = new java_parser_1.JavaParser();
            // Create a prompt for generating architecture description
            const promptTemplate = prompts_1.PromptTemplate.fromTemplate(finalPrompt);
            // Convert structure to a readable format for the LLM
            const structureSummary = this.createStructureSummary(structure);
            const chain = promptTemplate.pipe(model).pipe(this.outputParser);
            const result = await chain.invoke({ structure: structureSummary });
            return result;
        }
        catch (error) {
            if (error instanceof Error &&
                error.message.includes("API key not configured")) {
                throw error; // Re-throw configuration errors
            }
            throw new Error(`Failed to generate architecture description: ${error instanceof Error ? error.message : "Unknown error"}`);
        }
    }
    createStructureSummary(structure) {
        let summary = `Total Classes: ${structure.classes.length}\n\n`;
        // Group classes by package
        const packageGroups = {};
        structure.classes.forEach((cls) => {
            const pkg = cls.package || "default";
            if (!packageGroups[pkg]) {
                packageGroups[pkg] = [];
            }
            packageGroups[pkg].push(cls);
        });
        summary += "Packages:\n";
        Object.entries(packageGroups).forEach(([pkg, classes]) => {
            summary += `- ${pkg}: ${classes.length} classes\n`;
        });
        // Add Spring components
        const springComponents = structure.classes.filter((cls) => cls.annotations.some((ann) => ann.includes("@Service") ||
            ann.includes("@Controller") ||
            ann.includes("@Repository") ||
            ann.includes("@Component") ||
            ann.includes("@RestController")));
        if (springComponents.length > 0) {
            summary += "\nSpring Components:\n";
            springComponents.forEach((comp) => {
                const springAnns = comp.annotations.filter((ann) => ann.includes("@Service") ||
                    ann.includes("@Controller") ||
                    ann.includes("@Repository") ||
                    ann.includes("@Component") ||
                    ann.includes("@RestController"));
                summary += `- ${comp.name}: ${springAnns.join(", ")}\n`;
            });
        }
        // Add relationships
        summary += `\nKey Relationships:\n`;
        const relationshipCounts = structure.relationships.reduce((acc, rel) => {
            acc[rel.type] = (acc[rel.type] || 0) + 1;
            return acc;
        }, {});
        Object.entries(relationshipCounts).forEach(([type, count]) => {
            summary += `- ${type}: ${count} connections\n`;
        });
        return summary;
    }
    async generateClassRelationshipDiagram(targetClass, relatedClasses, springContext) {
        try {
            const model = this.initializeModel();
            // Create the prompt directly without template variables to avoid LangChain parsing issues
            const promptText = `Generate a Mermaid class relationship diagram for this Java class and its related classes.
Focus on Spring-specific relationships and dependencies.

Target Class: ${targetClass.name}
Spring Patterns: ${targetClass.springPatterns?.map((p) => p.type).join(", ") || "None"}
Spring Dependencies: ${targetClass.springDependencies?.map((d) => d.type).join(", ") ||
                "None"}

Related Classes: ${relatedClasses.map((c) => c.name).join(", ")}

Generate ONLY a Mermaid classDiagram showing:
1. The target class with its key methods and fields
2. Related classes with their Spring annotations
3. Dependency injection relationships (use --> for dependencies)
4. Spring layer relationships (Controller -> Service -> Repository)

Format: Return ONLY the mermaid code block, nothing else.

Example format:
\`\`\`mermaid
classDiagram
    class UserController {{
        <<@RestController>>
        method1()
        method2()
    }}
    class UserService {{
        <<@Service>>
        method1()
        method2()
    }}
    UserController --> UserService : @Autowired
\`\`\``;
            // Use the model directly without PromptTemplate to avoid variable parsing
            const result = await model.invoke(promptText);
            // Extract the content from the result
            return typeof result.content === "string"
                ? result.content
                : result.toString();
        }
        catch (error) {
            // Return a basic fallback diagram if generation fails
            return this.generateFallbackClassDiagram(targetClass, relatedClasses);
        }
    }
    generateFallbackClassDiagram(targetClass, relatedClasses) {
        let diagram = "```mermaid\nclassDiagram\n";
        // Add target class
        diagram += `    class ${targetClass.name} {\n`;
        if (targetClass.springPatterns && targetClass.springPatterns.length > 0) {
            diagram += `        <<@${targetClass.springPatterns[0].type}>>\n`;
        }
        targetClass.methods.slice(0, 3).forEach((method) => {
            diagram += `        +${method.name}()\n`;
        });
        diagram += "    }\n";
        // Add related classes
        relatedClasses.slice(0, 2).forEach((relatedClass) => {
            diagram += `    class ${relatedClass.name} {\n`;
            if (relatedClass.springPatterns &&
                relatedClass.springPatterns.length > 0) {
                diagram += `        <<@${relatedClass.springPatterns[0].type}>>\n`;
            }
            diagram += "        +method()\n    }\n";
            // Add relationship
            diagram += `    ${targetClass.name} --> ${relatedClass.name}\n`;
        });
        diagram += "```";
        return diagram;
    }
    async generateVisualizationData(structure, userQuery) {
        try {
            // Generate both text description and structured data for frontend
            const textDescription = await this.generateArchitectureDescription(structure, userQuery);
            // Create structured data that the frontend expects
            const visualizationData = this.prepareVisualizationData(structure);
            return {
                textDescription,
                visualizationData,
                success: true,
            };
        }
        catch (error) {
            console.error("Failed to generate visualization data:", error);
            return {
                textDescription: "Failed to generate architecture description",
                visualizationData: this.createFallbackVisualizationData(structure),
                success: false,
                error: error instanceof Error ? error.message : "Unknown error",
            };
        }
    }
    prepareVisualizationData(structure) {
        // This matches the format expected by the frontend renderVisualization function
        const layers = {
            controllers: [],
            services: [],
            repositories: [],
            entities: [],
            components: [],
        };
        // Categorize classes by Spring patterns
        structure.classes.forEach((cls) => {
            const springPatterns = cls.springPatterns || [];
            const hasController = springPatterns.some((p) => p.type === "CONTROLLER" || p.type === "REST_CONTROLLER");
            const hasService = springPatterns.some((p) => p.type === "SERVICE");
            const hasRepository = springPatterns.some((p) => p.type === "REPOSITORY");
            const hasComponent = springPatterns.some((p) => p.type === "COMPONENT");
            const classInfo = {
                name: cls.name,
                package: cls.package,
                methods: cls.methods?.length || 0,
                fields: cls.fields?.length || 0,
                annotations: cls.annotations || [],
                dependencies: cls.dependencies || [],
                springPatterns: springPatterns.map((p) => p.type),
            };
            if (hasController) {
                layers.controllers.push(classInfo);
            }
            else if (hasService) {
                layers.services.push(classInfo);
            }
            else if (hasRepository) {
                layers.repositories.push(classInfo);
            }
            else if (hasComponent) {
                layers.components.push(classInfo);
            }
            else {
                // Check for entity-like classes (classes with many fields, few methods)
                if (cls.fields &&
                    cls.methods &&
                    cls.fields.length > cls.methods.length) {
                    layers.entities.push(classInfo);
                }
                else {
                    layers.components.push(classInfo);
                }
            }
        });
        // Calculate statistics
        const stats = {
            totalClasses: structure.classes.length,
            controllers: layers.controllers.length,
            services: layers.services.length,
            repositories: layers.repositories.length,
            entities: layers.entities.length,
            components: layers.components.length,
            relationships: structure.relationships?.length || 0,
        };
        return {
            layers,
            stats,
            relationships: structure.relationships || [],
        };
    }
    createFallbackVisualizationData(structure) {
        // Create basic visualization data when enhanced analysis fails
        const layers = {
            controllers: [],
            services: [],
            repositories: [],
            entities: [],
            components: [],
        };
        // Basic categorization based on class names and annotations
        structure.classes.forEach((cls) => {
            const className = cls.name.toLowerCase();
            const annotations = cls.annotations?.join(" ").toLowerCase() || "";
            const classInfo = {
                name: cls.name,
                package: cls.package,
                methods: cls.methods?.length || 0,
                fields: cls.fields?.length || 0,
                annotations: cls.annotations || [],
                dependencies: cls.dependencies || [],
                springPatterns: [],
            };
            if (annotations.includes("controller") ||
                className.includes("controller")) {
                layers.controllers.push(classInfo);
            }
            else if (annotations.includes("service") ||
                className.includes("service")) {
                layers.services.push(classInfo);
            }
            else if (annotations.includes("repository") ||
                className.includes("repository")) {
                layers.repositories.push(classInfo);
            }
            else {
                layers.components.push(classInfo);
            }
        });
        return {
            layers,
            stats: {
                totalClasses: structure.classes.length,
                controllers: layers.controllers.length,
                services: layers.services.length,
                repositories: layers.repositories.length,
                entities: layers.entities.length,
                components: layers.components.length,
                relationships: 0,
            },
            relationships: [],
        };
    }
    async generateSpecificDiagram(diagramType, module, structure) {
        try {
            // Check if structure is provided
            if (!structure) {
                throw new Error('Project structure is not available. Please analyze the project first.');
            }
            // Check if classes exist
            if (!structure.classes || structure.classes.length === 0) {
                throw new Error('No classes found in the project structure.');
            }
            // Filter classes based on scope
            let filteredClasses = structure.classes;
            // if (scope === 'module' && module) {
            //   filteredClasses = structure.classes.filter(cls => cls.package === module);
            //   if (filteredClasses.length === 0) {
            //     throw new Error(`No classes found in module: ${module}`);
            //   }
            // }
            // Generate diagram based on type
            let diagramContent = '';
            let title = '';
            let stats = '';
            switch (diagramType) {
                case 'component':
                    const componentResult = await this.generateComponentDiagram(filteredClasses);
                    diagramContent = componentResult.content;
                    title = componentResult.title;
                    stats = componentResult.stats;
                    break;
                case 'layered':
                    const layeredResult = await this.generateLayeredDiagram(filteredClasses);
                    diagramContent = layeredResult.content;
                    title = layeredResult.title;
                    stats = layeredResult.stats;
                    break;
                case 'class':
                    const classResult = await this.generateClassDiagram(filteredClasses);
                    diagramContent = classResult.content;
                    title = classResult.title;
                    stats = classResult.stats;
                    break;
                case 'package':
                    const packageResult = await this.generatePackageDiagram(structure.classes);
                    diagramContent = packageResult.content;
                    title = packageResult.title;
                    stats = packageResult.stats;
                    break;
                // case 'sequence':
                //   const sequenceResult = await this.generateSequenceDiagram(filteredClasses, scope, module);
                //   diagramContent = sequenceResult.content;
                //   title = sequenceResult.title;
                //   stats = sequenceResult.stats;
                //   break;
                default:
                    throw new Error(`Unknown diagram type: ${diagramType}`);
            }
            // Extract just the mermaid content for rawContent (without markdown header)
            const mermaidMatch = diagramContent.match(/```mermaid[\s\S]*?```/);
            const rawMermaidContent = mermaidMatch ? mermaidMatch[0] : diagramContent;
            return {
                type: diagramType,
                title,
                content: diagramContent,
                rawContent: rawMermaidContent,
                stats,
                module
            };
        }
        catch (error) {
            console.error('Failed to generate specific diagram:', error);
            return {
                type: diagramType,
                title: `${diagramType} Diagram (Error)`,
                content: `<p>Failed to generate diagram: ${error instanceof Error ? error.message : 'Unknown error'}</p>`,
                rawContent: `# ${diagramType} Diagram\n\nFailed to generate diagram: ${error instanceof Error ? error.message : 'Unknown error'}`,
                stats: 'Generation failed',
                module
            };
        }
    }
    async generateComponentDiagram(classes) {
        // const scopeText = scope === 'module' ? ` (${module})` : '';
        const title = `Component Diagram`;
        // Group classes by Spring patterns
        const controllers = classes.filter(cls => cls.springPatterns?.some((p) => p.type === 'CONTROLLER' || p.type === 'REST_CONTROLLER'));
        const services = classes.filter(cls => cls.springPatterns?.some((p) => p.type === 'SERVICE'));
        const repositories = classes.filter(cls => cls.springPatterns?.some((p) => p.type === 'REPOSITORY'));
        let mermaidContent = '```mermaid\ngraph TD\n';
        // Add controllers
        controllers.forEach((ctrl, i) => {
            mermaidContent += `    C${i}[${ctrl.name}]\n`;
        });
        // Add services
        services.forEach((svc, i) => {
            mermaidContent += `    S${i}[${svc.name}]\n`;
        });
        // Add repositories
        repositories.forEach((repo, i) => {
            mermaidContent += `    R${i}[${repo.name}]\n`;
        });
        // Add relationships
        if (controllers.length > 0 && services.length > 0) {
            mermaidContent += `    C0 --> S0\n`;
        }
        if (services.length > 0 && repositories.length > 0) {
            mermaidContent += `    S0 --> R0\n`;
        }
        mermaidContent += '```';
        const stats = `${controllers.length} Controllers, ${services.length} Services, ${repositories.length} Repositories`;
        return {
            title,
            content: `# ${title}\n\n${mermaidContent}`,
            stats
        };
    }
    async generateLayeredDiagram(classes) {
        // const scopeText = scope === 'module' ? ` (${module})` : '';
        const title = `Layered Architecture`;
        let mermaidContent = '```mermaid\ngraph TB\n';
        mermaidContent += '    subgraph "Presentation Layer"\n';
        mermaidContent += '        Controllers[Controllers]\n';
        mermaidContent += '    end\n';
        mermaidContent += '    subgraph "Business Layer"\n';
        mermaidContent += '        Services[Services]\n';
        mermaidContent += '    end\n';
        mermaidContent += '    subgraph "Data Layer"\n';
        mermaidContent += '        Repositories[Repositories]\n';
        mermaidContent += '    end\n';
        mermaidContent += '    Controllers --> Services\n';
        mermaidContent += '    Services --> Repositories\n';
        mermaidContent += '```';
        const stats = `${classes.length} classes in layered architecture`;
        return {
            title,
            content: `# ${title}\n\n${mermaidContent}`,
            stats
        };
    }
    async generateClassDiagram(classes) {
        //const scopeText = scope === 'module' ? ` (${module})` : '';
        const title = `Class Diagram`;
        // Start a mermaid fenced code block (markdown)
        let mermaidContent = '```mermaid\nclassDiagram\n';
        // Deduplicate by class name, keep first occurrence; limit to 8
        const uniqueClasses = classes.filter((cls, index, self) => index === self.findIndex(c => c.name === cls.name)).slice(0, 8);
        // Helper: sanitize identifier for mermaid (only word chars and underscores)
        const makeSanitizedIdGenerator = () => {
            const used = new Set();
            return (name) => {
                let id = (name || 'Class')
                    .replace(/<[^>]*>/g, '') // drop generics <>...
                    .replace(/[^\w]/g, '_'); // non-word chars -> _
                if (/^\d/.test(id))
                    id = '_' + id;
                let base = id, i = 1;
                while (used.has(id)) {
                    id = `${base}_${i++}`;
                }
                used.add(id);
                return id;
            };
        };
        const genId = makeSanitizedIdGenerator();
        // Helper: simplify type string: drop package prefixes and generics
        const simplifyType = (t) => {
            if (!t)
                return 'Object';
            let s = String(t);
            s = s.replace(/<[^>]*>/g, ''); // remove generics
            const parts = s.split('.');
            return parts[parts.length - 1] || s;
        };
        // Map originalName -> sanitizedId
        const idMap = new Map();
        uniqueClasses.forEach(c => idMap.set(c.name, genId(c.name)));
        // Group classes (controllers/services/repos/entities/others)
        const controllers = uniqueClasses.filter(cls => cls.springPatterns?.some((p) => p.type === 'CONTROLLER' || p.type === 'REST_CONTROLLER') ||
            cls.name.toLowerCase().includes('controller'));
        const services = uniqueClasses.filter(cls => cls.springPatterns?.some((p) => p.type === 'SERVICE') ||
            cls.name.toLowerCase().includes('service'));
        const repositories = uniqueClasses.filter(cls => cls.springPatterns?.some((p) => p.type === 'REPOSITORY') ||
            cls.name.toLowerCase().includes('repository'));
        const entities = uniqueClasses.filter(cls => cls.springPatterns?.some((p) => p.type === 'ENTITY') ||
            cls.name.toLowerCase().includes('entity') ||
            cls.name.toLowerCase().includes('model'));
        const others = uniqueClasses.filter(cls => !controllers.includes(cls) && !services.includes(cls) &&
            !repositories.includes(cls) && !entities.includes(cls));
        // Order to render: controllers -> services -> repos -> entities -> others
        const ordered = [...controllers, ...services, ...repositories, ...entities, ...others];
        // Emit class blocks using sanitized IDs; add original name as a comment inside block
        ordered.forEach(cls => {
            const id = idMap.get(cls.name);
            const springPattern = cls.springPatterns?.[0];
            // Clean stereotype: remove @ and whitespace
            const stereotype = springPattern ? String(springPattern.type).replace(/@/g, '').replace(/\s+/g, '_') : '';
            // Attach stereotype on the class declaration line (not inside braces)
            if (stereotype) {
                mermaidContent += `    class ${id} <<${stereotype}>> {\n`;
            }
            else {
                mermaidContent += `    class ${id} {\n`;
            }
            // Keep original name as a comment (mermaid supports %% comments)
            mermaidContent += `        %% ${cls.name}\n`;
            // Add up to 2 key fields (simplified types)
            const keyFields = (cls.fields || []).slice(0, 2);
            keyFields.forEach((field) => {
                const fname = String(field.name || 'field').replace(/[{}]/g, '');
                const ftype = simplifyType(field.type);
                mermaidContent += `        -${fname}: ${ftype}\n`;
            });
            // Add up to 3 key methods, prefer non-getter/setter
            const allMethods = cls.methods || [];
            const keyMethods = allMethods.filter((m) => !String(m.name).startsWith('get') && !String(m.name).startsWith('set')).slice(0, 3);
            if (keyMethods.length === 0) {
                keyMethods.push(...allMethods.slice(0, 2));
            }
            keyMethods.forEach((method) => {
                const ret = method.returnType && method.returnType !== 'void' ? `: ${simplifyType(method.returnType)}` : '';
                const mname = String(method.name || 'method').replace(/\s+/g, '_');
                mermaidContent += `        +${mname}()${ret}\n`;
            });
            mermaidContent += '    }\n';
        });
        // Build relationships (use sanitized ids)
        const addedRelationships = new Set();
        // Controller --> Service
        controllers.forEach(controller => {
            const relatedService = services.find(service => controller.dependencies?.some((dep) => String(dep).includes(service.name)) ||
                service.name.toLowerCase().includes(controller.name.toLowerCase().replace('controller', '')));
            if (relatedService) {
                const a = idMap.get(controller.name), b = idMap.get(relatedService.name);
                const rel = `${a} --> ${b}`;
                if (!addedRelationships.has(rel)) {
                    mermaidContent += `    ${rel} : uses\n`;
                    addedRelationships.add(rel);
                }
            }
        });
        // Service --> Repository
        services.forEach(service => {
            const relatedRepo = repositories.find(repo => service.dependencies?.some((dep) => String(dep).includes(repo.name)) ||
                repo.name.toLowerCase().includes(service.name.toLowerCase().replace('service', '')));
            if (relatedRepo) {
                const a = idMap.get(service.name), b = idMap.get(relatedRepo.name);
                const rel = `${a} --> ${b}`;
                if (!addedRelationships.has(rel)) {
                    mermaidContent += `    ${rel} : uses\n`;
                    addedRelationships.add(rel);
                }
            }
        });
        // Exception inheritance (if multiple exceptions and a base exception)
        const exceptions = others.filter(cls => cls.name.toLowerCase().includes('exception'));
        if (exceptions.length > 1) {
            const baseException = exceptions.find(ex => /Base|Custom/i.test(ex.name));
            if (baseException) {
                exceptions.filter(ex => ex !== baseException).forEach(ex => {
                    const a = idMap.get(baseException.name), b = idMap.get(ex.name);
                    const rel = `${a} <|-- ${b}`;
                    if (!addedRelationships.has(rel)) {
                        mermaidContent += `    ${rel}\n`;
                        addedRelationships.add(rel);
                    }
                });
            }
        }
        mermaidContent += '```';
        const stats = `${uniqueClasses.length} classes shown (${classes.length} total)`;
        return {
            title,
            content: `# ${title}\n\n${mermaidContent}`,
            stats
        };
    }
    async generatePackageDiagram(classes) {
        const title = 'Package Dependencies';
        // Group classes by package
        const packages = [...new Set(classes.map(cls => cls.package).filter(pkg => pkg))];
        let mermaidContent = '```mermaid\ngraph LR\n';
        packages.forEach((pkg, i) => {
            const safePkgName = pkg.replace(/\./g, '_');
            mermaidContent += `    ${safePkgName}[${pkg}]\n`;
        });
        // Add some basic relationships (simplified)
        if (packages.length > 1) {
            const pkg1 = packages[0].replace(/\./g, '_');
            const pkg2 = packages[1].replace(/\./g, '_');
            mermaidContent += `    ${pkg1} --> ${pkg2}\n`;
        }
        mermaidContent += '```';
        const stats = `${packages.length} packages`;
        return {
            title,
            content: `# ${title}\n\n${mermaidContent}`,
            stats
        };
    }
}
exports.VisualizationAgent = VisualizationAgent;
//# sourceMappingURL=visualization_agent_langchain.js.map