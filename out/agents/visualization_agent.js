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
    }
    initializeModel() {
        if (this.model) {
            return this.model;
        }
        const config = vscode.workspace.getConfiguration("codedoc");
        const apiKey = config.get("openaiApiKey");
        const modelName = config.get("openaiModel", "gpt-4");
        const maxTokens = config.get("maxTokens", 500); // Reduced from 2000 to 500 for concise responses
        const temperature = config.get("temperature", 0.3);
        if (!apiKey) {
            throw new Error();
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
                finalPrompt = augmentedPrompt;
            }
            const javaParser = new java_parser_1.JavaParser();
            const promptTemplate = prompts_1.PromptTemplate.fromTemplate(finalPrompt);
            const structureSummary = this.createStructureSummary(structure);
            const chain = promptTemplate.pipe(model).pipe(this.outputParser);
            const result = await chain.invoke({ structure: structureSummary });
            return result;
        }
        catch (error) {
            if (error instanceof Error &&
                error.message.includes("API key not configured")) {
                throw error;
            }
            throw new Error(`Failed to generate architecture description: ${error instanceof Error ? error.message : "Unknown error"}`);
        }
    }
    createStructureSummary(structure) {
        let summary = `Total Classes: ${structure.classes.length}\n\n`;
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
            const result = await model.invoke(promptText);
            return typeof result.content === "string"
                ? result.content
                : result.toString();
        }
        catch (error) {
            return this.generateFallbackClassDiagram(targetClass, relatedClasses);
        }
    }
    generateFallbackClassDiagram(targetClass, relatedClasses) {
        const uniqueRelatedClasses = relatedClasses.filter((cls, index, self) => index === self.findIndex(c => c.name === cls.name) && cls.name !== targetClass.name).slice(0, 5); // Limit to 5 related classes
        let diagram = "```mermaid\nclassDiagram\n";
        const targetClassName = targetClass.name.replace(/[^a-zA-Z0-9_]/g, '_');
        diagram += `    class ${targetClassName} {\n`;
        if (targetClass.springPatterns && targetClass.springPatterns.length > 0) {
            const stereotype = String(targetClass.springPatterns[0].type).replace(/@/g, '').replace(/\s+/g, '_');
            if (stereotype && stereotype.trim() !== '') {
                diagram += `        <<${stereotype}>>\n`;
            }
        }
        (targetClass.methods || []).slice(0, 3).forEach((method) => {
            const methodName = String(method.name || 'method').replace(/[^a-zA-Z0-9_]/g, '_');
            diagram += `        +${methodName}()\n`;
        });
        diagram += "    }\n";
        uniqueRelatedClasses.forEach((relatedClass) => {
            const relatedClassName = relatedClass.name.replace(/[^a-zA-Z0-9_]/g, '_');
            diagram += `    class ${relatedClassName} {\n`;
            if (relatedClass.springPatterns &&
                relatedClass.springPatterns.length > 0) {
                const stereotype = String(relatedClass.springPatterns[0].type).replace(/@/g, '').replace(/\s+/g, '_');
                if (stereotype && stereotype.trim() !== '') {
                    diagram += `        <<${stereotype}>>\n`;
                }
            }
            diagram += "        +method()\n    }\n";
            if (relatedClassName !== targetClassName) {
                diagram += `    ${targetClassName} --> ${relatedClassName}\n`;
            }
        });
        diagram += "```";
        return diagram;
    }
    async generateVisualizationData(structure, userQuery) {
        try {
            const textDescription = await this.generateArchitectureDescription(structure, userQuery);
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
        const layers = {
            controllers: [],
            services: [],
            repositories: [],
            entities: [],
            components: [],
        };
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
        const layers = {
            controllers: [],
            services: [],
            repositories: [],
            entities: [],
            components: [],
        };
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
            if (!structure) {
                throw new Error('Project structure is not available. Please analyze the project first.');
            }
            if (!structure.classes || structure.classes.length === 0) {
                throw new Error('No classes found in the project structure.');
            }
            let filteredClasses = structure.classes;
            // if (scope === 'module' && module) {
            //   filteredClasses = structure.classes.filter(cls => cls.package === module);
            //   if (filteredClasses.length === 0) {
            //     throw new Error(`No classes found in module: ${module}`);
            //   }
            // }
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
        console.log('Generating component diagram for classes:', classes.length);
        const controllers = classes.filter(cls => cls.springPatterns?.some((p) => p.type === 'CONTROLLER' || p.type === 'REST_CONTROLLER') ||
            cls.name.toLowerCase().includes('controller'));
        const services = classes.filter(cls => cls.springPatterns?.some((p) => p.type === 'SERVICE') ||
            cls.name.toLowerCase().includes('service'));
        const repositories = classes.filter(cls => cls.springPatterns?.some((p) => p.type === 'REPOSITORY') ||
            cls.name.toLowerCase().includes('repository') ||
            cls.name.toLowerCase().includes('dao'));
        console.log('Found components:', {
            controllers: controllers.length,
            services: services.length,
            repositories: repositories.length
        });
        let mermaidContent = '```mermaid\ngraph TD\n';
        if (controllers.length === 0 && services.length === 0 && repositories.length === 0) {
            console.log('No Spring components found, creating generic component diagram');
            const fallbackControllers = classes.filter(cls => cls.name.toLowerCase().includes('controller'));
            const fallbackServices = classes.filter(cls => cls.name.toLowerCase().includes('service'));
            const fallbackRepositories = classes.filter(cls => cls.name.toLowerCase().includes('repository') ||
                cls.name.toLowerCase().includes('dao'));
            if (fallbackControllers.length === 0 && fallbackServices.length === 0 && fallbackRepositories.length === 0) {
                classes.slice(0, 10).forEach((cls, i) => {
                    mermaidContent += `    C${i}[${cls.name}]\n`;
                });
            }
            else {
                fallbackControllers.forEach((cls, i) => {
                    mermaidContent += `    CTRL${i}[${cls.name}]\n`;
                });
                fallbackServices.forEach((cls, i) => {
                    mermaidContent += `    SVC${i}[${cls.name}]\n`;
                });
                fallbackRepositories.forEach((cls, i) => {
                    mermaidContent += `    REPO${i}[${cls.name}]\n`;
                });
            }
            mermaidContent += '```';
            const stats = `${fallbackControllers.length} Controllers, ${fallbackServices.length} Services, ${fallbackRepositories.length} Repositories`;
            return {
                title,
                content: `# ${title}\n\n${mermaidContent}`,
                stats
            };
        }
        const classMap = new Map();
        classes.forEach(cls => {
            classMap.set(cls.name, cls);
            const simpleName = cls.name.split('.').pop() || cls.name;
            classMap.set(simpleName, cls);
        });
        controllers.forEach((ctrl, i) => {
            mermaidContent += `    C${i}[${ctrl.name}]\n`;
        });
        services.forEach((svc, i) => {
            mermaidContent += `    S${i}[${svc.name}]\n`;
        });
        repositories.forEach((repo, i) => {
            mermaidContent += `    R${i}[${repo.name}]\n`;
        });
        controllers.forEach((ctrl, i) => {
            if (ctrl.dependencies) {
                ctrl.dependencies.forEach((dep) => {
                    services.forEach((svc, j) => {
                        const depStr = String(dep);
                        if (depStr.includes(svc.name) ||
                            svc.name.includes(depStr) ||
                            svc.name.toLowerCase().includes(ctrl.name.toLowerCase().replace('controller', '')) ||
                            ctrl.name.toLowerCase().replace('controller', '').includes(svc.name.toLowerCase().replace('service', ''))) {
                            mermaidContent += `    C${i} -->|uses| S${j}\n`;
                        }
                    });
                });
            }
        });
        services.forEach((svc, i) => {
            if (svc.dependencies) {
                svc.dependencies.forEach((dep) => {
                    repositories.forEach((repo, j) => {
                        const depStr = String(dep);
                        if (depStr.includes(repo.name) ||
                            repo.name.includes(depStr) ||
                            repo.name.toLowerCase().includes(svc.name.toLowerCase().replace('service', '')) ||
                            svc.name.toLowerCase().replace('service', '').includes(repo.name.toLowerCase().replace('repository', '').replace('dao', ''))) {
                            mermaidContent += `    S${i} -->|uses| R${j}\n`;
                        }
                    });
                });
            }
        });
        services.forEach((svc1, i) => {
            if (svc1.dependencies) {
                svc1.dependencies.forEach((dep) => {
                    services.forEach((svc2, j) => {
                        if (i !== j) {
                            const depStr = String(dep);
                            if (depStr.includes(svc2.name) ||
                                svc2.name.includes(depStr)) {
                                mermaidContent += `    S${i} -->|uses| S${j}\n`;
                            }
                        }
                    });
                });
            }
        });
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
        let mermaidContent = '```mermaid\nclassDiagram\n';
        const uniqueClasses = classes.filter((cls, index, self) => index === self.findIndex(c => c.name === cls.name)).slice(0, 15);
        const makeSanitizedIdGenerator = () => {
            const used = new Set();
            const reservedWords = new Set(['class', 'interface', 'enum', 'abstract', 'extends', 'implements', 'public', 'private', 'protected', 'static', 'final']);
            return (name) => {
                let id = (name || 'Class')
                    .replace(/<[^>]*>/g, '') // drop generics <>...
                    .replace(/[^\w]/g, '_') // non-word chars -> _
                    .replace(/_+/g, '_') // collapse multiple underscores
                    .replace(/^_+|_+$/g, ''); // trim leading/trailing underscores
                // Ensure valid identifier
                if (!id || /^\d/.test(id))
                    id = 'Class_' + id;
                if (!id || id.length === 0)
                    id = 'Class';
                // Avoid reserved words
                if (reservedWords.has(id.toLowerCase())) {
                    id = id + '_Class';
                }
                // Ensure uniqueness
                let base = id, i = 1;
                while (used.has(id)) {
                    id = `${base}_${i++}`;
                }
                used.add(id);
                return id;
            };
        };
        const genId = makeSanitizedIdGenerator();
        const simplifyType = (t) => {
            if (!t)
                return 'Object';
            let s = String(t);
            s = s.replace(/<[^>]*>/g, ''); // remove generics
            s = s.replace(/[^\w.]/g, ''); // remove special chars except dots
            const parts = s.split('.');
            let result = parts[parts.length - 1] || s;
            // Ensure valid type name
            if (!result || result.length === 0)
                result = 'Object';
            result = result.replace(/[^\w]/g, ''); // remove any remaining special chars
            if (!result || /^\d/.test(result))
                result = 'Type_' + result;
            return result || 'Object';
        };
        const idMap = new Map();
        uniqueClasses.forEach(c => idMap.set(c.name, genId(c.name)));
        const controllers = uniqueClasses.filter(cls => {
            const hasSpringControllerAnnotation = cls.springPatterns?.some((p) => p.type === 'CONTROLLER' ||
                p.type === 'REST_CONTROLLER' ||
                String(p.type).toUpperCase().includes('CONTROLLER'));
            const hasControllerName = cls.name.toLowerCase().includes('controller');
            const isInControllerPackage = cls.package && (cls.package.toLowerCase().includes('controller') ||
                cls.package.toLowerCase().includes('web') ||
                cls.package.toLowerCase().includes('api'));
            return hasSpringControllerAnnotation || hasControllerName || isInControllerPackage;
        });
        const services = uniqueClasses.filter(cls => {
            const hasSpringServiceAnnotation = cls.springPatterns?.some((p) => p.type === 'SERVICE' ||
                String(p.type).toUpperCase().includes('SERVICE'));
            const hasServiceName = cls.name.toLowerCase().includes('service');
            const isServiceImpl = cls.name.toLowerCase().includes('serviceimpl');
            const isInServicePackage = cls.package && (cls.package.toLowerCase().includes('service') ||
                cls.package.toLowerCase().includes('business') ||
                cls.package.toLowerCase().includes('logic'));
            return hasSpringServiceAnnotation || hasServiceName || isServiceImpl || isInServicePackage;
        });
        const repositories = uniqueClasses.filter(cls => {
            const hasSpringRepositoryAnnotation = cls.springPatterns?.some((p) => p.type === 'REPOSITORY' ||
                p.type === 'DAO' ||
                String(p.type).toUpperCase().includes('REPOSITORY') ||
                String(p.type).toUpperCase().includes('DAO'));
            const hasRepositoryName = cls.name.toLowerCase().includes('repository') ||
                cls.name.toLowerCase().includes('dao') ||
                cls.name.toLowerCase().includes('repo');
            const isInRepositoryPackage = cls.package && (cls.package.toLowerCase().includes('repository') ||
                cls.package.toLowerCase().includes('dao') ||
                cls.package.toLowerCase().includes('persistence') ||
                cls.package.toLowerCase().includes('data'));
            return hasSpringRepositoryAnnotation || hasRepositoryName || isInRepositoryPackage;
        });
        const entities = uniqueClasses.filter(cls => {
            const hasEntityAnnotation = cls.springPatterns?.some((p) => p.type === 'ENTITY' ||
                String(p.type).toUpperCase().includes('ENTITY'));
            const hasJpaAnnotation = cls.annotations?.some((ann) => ann.includes('@Entity') ||
                ann.includes('@Table'));
            const hasEntityName = cls.name.toLowerCase().includes('entity') ||
                cls.name.toLowerCase().includes('model') ||
                cls.name.toLowerCase().includes('dto') ||
                cls.name.toLowerCase().includes('vo');
            const isInEntityPackage = cls.package && (cls.package.toLowerCase().includes('entity') ||
                cls.package.toLowerCase().includes('model') ||
                cls.package.toLowerCase().includes('domain') ||
                cls.package.toLowerCase().includes('dto'));
            return hasEntityAnnotation || hasJpaAnnotation || hasEntityName || isInEntityPackage;
        });
        const others = uniqueClasses.filter(cls => !controllers.includes(cls) &&
            !services.includes(cls) &&
            !repositories.includes(cls) &&
            !entities.includes(cls));
        const ordered = [...controllers, ...services, ...repositories, ...entities, ...others];
        // Emit class blocks using sanitized IDs; add original name as a comment inside block
        ordered.forEach(cls => {
            const id = idMap.get(cls.name);
            const springPattern = cls.springPatterns?.[0];
            // Clean stereotype: remove @ and whitespace
            let stereotype = springPattern ? String(springPattern.type).replace(/@/g, '').replace(/\s+/g, '_') : '';
            // Sanitize stereotype
            stereotype = stereotype
                .replace(/[^\w]/g, '_')
                .replace(/_+/g, '_')
                .replace(/^_+|_+$/g, '');
            // Attach stereotype on the class declaration line (not inside braces)
            if (stereotype && stereotype.trim() !== '') {
                mermaidContent += `    class ${id} <<${stereotype}>> {\n`;
            }
            else {
                mermaidContent += `    class ${id} {\n`;
            }
            // Keep original name as a comment (mermaid supports %% comments)
            mermaidContent += `        %% ${cls.name}\n`;
            // Add up to 5 key fields (simplified types) with more descriptive names
            const keyFields = (cls.fields || []).slice(0, 5);
            let hasContent = false;
            keyFields.forEach((field) => {
                let fname = String(field.name || 'field')
                    .replace(/[{}<>]/g, '')
                    .replace(/[^\w]/g, '_')
                    .replace(/_+/g, '_')
                    .replace(/^_+|_+$/g, '');
                // Ensure valid field name
                if (!fname || fname.length === 0)
                    fname = 'field';
                if (/^\d/.test(fname))
                    fname = 'field_' + fname;
                const ftype = simplifyType(field.type);
                // Escape field name and type for Mermaid
                const safeFname = fname.replace(/[:"]/g, '_');
                const safeFtype = ftype.replace(/[:"]/g, '_');
                mermaidContent += `        -${safeFname} : ${safeFtype}\n`;
                hasContent = true;
            });
            const allMethods = cls.methods || [];
            // Prioritize non-getter/setter methods
            const nonGetterSetterMethods = allMethods.filter((m) => !String(m.name).startsWith('get') &&
                !String(m.name).startsWith('set') &&
                !String(m.name).startsWith('is')).slice(0, 8);
            let keyMethods = [...nonGetterSetterMethods];
            if (keyMethods.length < 8) {
                const remainingSlots = 8 - keyMethods.length;
                const getterSetterMethods = allMethods.filter((m) => String(m.name).startsWith('get') ||
                    String(m.name).startsWith('set') ||
                    String(m.name).startsWith('is')).slice(0, remainingSlots);
                keyMethods = [...keyMethods, ...getterSetterMethods];
            }
            if (keyMethods.length < 8) {
                const remainingSlots = 8 - keyMethods.length;
                const otherMethods = allMethods.filter((m) => !keyMethods.includes(m)).slice(0, remainingSlots);
                keyMethods = [...keyMethods, ...otherMethods];
            }
            keyMethods.forEach((method) => {
                let mname = String(method.name || 'method')
                    .replace(/\s+/g, '_')
                    .replace(/[{}<>]/g, '')
                    .replace(/[^\w]/g, '_')
                    .replace(/_+/g, '_')
                    .replace(/^_+|_+$/g, '');
                // Ensure valid method name
                if (!mname || mname.length === 0)
                    mname = 'method';
                if (/^\d/.test(mname))
                    mname = 'method_' + mname;
                // Safe return type
                const returnType = method.returnType && method.returnType !== 'void' ? simplifyType(method.returnType) : '';
                const safeReturnType = returnType ? returnType.replace(/[:"]/g, '_') : '';
                const ret = safeReturnType ? ` : ${safeReturnType}` : '';
                // Escape method name for Mermaid
                const safeMname = mname.replace(/[:"]/g, '_');
                mermaidContent += `        +${safeMname}()${ret}\n`;
                hasContent = true;
            });
            // If class has no fields or methods, add a placeholder to avoid empty class syntax error
            if (!hasContent) {
                mermaidContent += `        %% No public members\n`;
            }
            mermaidContent += '    }\n\n'; // Add extra newline between classes
        });
        const addedRelationships = new Set();
        // Add separator comment before relationships
        mermaidContent += '\n    %% Class Relationships\n';
        uniqueClasses.forEach(cls => {
            const classId = idMap.get(cls.name);
            if (cls.dependencies && classId) {
                cls.dependencies.forEach((dep) => {
                    const depClass = uniqueClasses.find(c => (c.name === dep ||
                        c.name === dep.replace(/.*\./g, '') ||
                        dep.includes(c.name) ||
                        (c.name.includes('$') && dep.includes(c.name.split('$')[0])) ||
                        (dep.includes('.') && c.name.endsWith(dep.split('.').pop() || '')) ||
                        (c.name.toLowerCase().includes(dep.toLowerCase()) || dep.toLowerCase().includes(c.name.toLowerCase()))) &&
                        c.name !== cls.name // Avoid self-references
                    );
                    if (depClass) {
                        const depId = idMap.get(depClass.name);
                        if (depId && depId !== classId) {
                            const rel = `${classId} --> ${depId}`;
                            if (!addedRelationships.has(rel)) {
                                mermaidContent += `    ${rel} : "depends on"\n`;
                                addedRelationships.add(rel);
                            }
                        }
                    }
                });
            }
            if (cls.fields && classId) {
                cls.fields.forEach((field) => {
                    const fieldType = simplifyType(field.type);
                    const fieldClass = uniqueClasses.find(c => (c.name === fieldType ||
                        c.name.endsWith(fieldType) ||
                        c.name.includes(fieldType) ||
                        fieldType.includes(c.name.split('.').pop() || c.name)) &&
                        c.name !== cls.name);
                    if (fieldClass) {
                        const fieldId = idMap.get(fieldClass.name);
                        if (fieldId && fieldId !== classId) {
                            const rel = `${classId} --> ${fieldId}`;
                            if (!addedRelationships.has(rel)) {
                                const safeFieldName = String(field.name || 'field').replace(/[:"]/g, '_');
                                mermaidContent += `    ${rel} : "has ${safeFieldName}"\n`;
                                addedRelationships.add(rel);
                            }
                        }
                    }
                });
            }
            if (cls.methods && classId) {
                cls.methods.forEach((method) => {
                    if (method.parameters) {
                        method.parameters.forEach((param) => {
                            const paramType = simplifyType(param.type);
                            const paramClass = uniqueClasses.find(c => (c.name === paramType ||
                                c.name.endsWith(paramType) ||
                                c.name.includes(paramType) ||
                                paramType.includes(c.name.split('.').pop() || c.name)) &&
                                c.name !== cls.name);
                            if (paramClass) {
                                const paramId = idMap.get(paramClass.name);
                                if (paramId && paramId !== classId) {
                                    const rel = `${classId} ..> ${paramId}`;
                                    if (!addedRelationships.has(rel)) {
                                        const safeParamName = String(param.name || 'param').replace(/[:"]/g, '_');
                                        mermaidContent += `    ${rel} : "uses ${safeParamName}"\n`;
                                        addedRelationships.add(rel);
                                    }
                                }
                            }
                        });
                    }
                    if (method.returnType) {
                        const returnType = simplifyType(method.returnType);
                        const returnClass = uniqueClasses.find(c => (c.name === returnType ||
                            c.name.endsWith(returnType) ||
                            c.name.includes(returnType) ||
                            returnType.includes(c.name.split('.').pop() || c.name)) &&
                            c.name !== cls.name);
                        if (returnClass) {
                            const returnId = idMap.get(returnClass.name);
                            if (returnId && returnId !== classId) {
                                const rel = `${classId} ..> ${returnId}`;
                                if (!addedRelationships.has(rel)) {
                                    const safeMethodName = String(method.name || 'method').replace(/[:"]/g, '_');
                                    mermaidContent += `    ${rel} : "returns ${safeMethodName}"\n`;
                                    addedRelationships.add(rel);
                                }
                            }
                        }
                    }
                });
            }
        });
        controllers.forEach(controller => {
            const relatedServices = services.filter(service => controller.dependencies?.some((dep) => (String(dep).includes(service.name) ||
                service.name.includes(String(dep)) ||
                service.name.toLowerCase().includes(controller.name.toLowerCase().replace('controller', '')) ||
                controller.name.toLowerCase().replace('controller', '').includes(service.name.toLowerCase().replace('service', ''))) &&
                service.name !== controller.name // Avoid self-references
            ));
            relatedServices.forEach(service => {
                const a = idMap.get(controller.name), b = idMap.get(service.name);
                const rel = `${a} --> ${b}`;
                if (!addedRelationships.has(rel)) {
                    mermaidContent += `    ${rel} : "uses"\n`;
                    addedRelationships.add(rel);
                }
            });
        });
        services.forEach(service => {
            const relatedRepos = repositories.filter(repo => service.dependencies?.some((dep) => (String(dep).includes(repo.name) ||
                repo.name.includes(String(dep)) ||
                repo.name.toLowerCase().includes(service.name.toLowerCase().replace('service', '')) ||
                service.name.toLowerCase().replace('service', '').includes(repo.name.toLowerCase().replace('repository', '').replace('dao', ''))) &&
                repo.name !== service.name));
            relatedRepos.forEach(repo => {
                const a = idMap.get(service.name), b = idMap.get(repo.name);
                const rel = `${a} --> ${b}`;
                if (!addedRelationships.has(rel)) {
                    mermaidContent += `    ${rel} : "uses"\n`;
                    addedRelationships.add(rel);
                }
            });
        });
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
        // Debug: Check if newlines are preserved
        console.log('🔍 Generated Mermaid content length:', mermaidContent.length);
        console.log('🔍 Newline count in content:', (mermaidContent.match(/\n/g) || []).length);
        console.log('🔍 First 500 chars of generated content:');
        console.log(mermaidContent.substring(0, 500));
        console.log('🔍 Content includes classDiagram:', mermaidContent.includes('classDiagram'));
        console.log('🔍 All lines of generated content:');
        const debugLines = mermaidContent.split('\n');
        debugLines.forEach((line, i) => {
            if (i < 20) { // Show first 20 lines
                console.log(`Line ${i + 1}: "${line}"`);
            }
        });
        // Check for problematic patterns
        const problematicLines = debugLines.filter((line, i) => line.includes('{}') || line.match(/class\s+\w+\s*\{\s*\}/) || line.includes('}class'));
        if (problematicLines.length > 0) {
            console.warn('🚨 Found potentially problematic lines:', problematicLines);
        }
        // Validate and fix the generated Mermaid content for common syntax issues
        const lines = mermaidContent.split('\n');
        let hasErrors = false;
        const errors = [];
        const fixedLines = [];
        lines.forEach((line, index) => {
            const trimmed = line.trim();
            let fixedLine = line;
            // Check for missing newlines between class definitions (common cause of parse errors)
            if (trimmed.includes('}{') || trimmed.includes('}class')) {
                errors.push(`Line ${index + 1}: Missing newline between class definitions`);
                hasErrors = true;
                // Try to fix by splitting on }class or }{
                fixedLine = line.replace(/}(\s*class)/g, '}\n    $1').replace(/}{/g, '}\n    {');
            }
            // Check for empty class definitions and fix them
            if (trimmed.match(/class\s+\w+\s*\{\s*\}/)) {
                errors.push(`Line ${index + 1}: Fixed empty class definition`);
                hasErrors = true;
                // Replace empty class with class containing a comment
                fixedLine = fixedLine.replace(/(class\s+\w+\s*)\{\s*\}/, '$1{\n        %% No public members\n    }');
            }
            fixedLines.push(fixedLine);
            if (trimmed && !trimmed.startsWith('```') && !trimmed.startsWith('classDiagram') && !trimmed.startsWith('%%')) {
                // Check for invalid characters in class definitions
                if (trimmed.includes('class ') && (trimmed.includes('"') || trimmed.includes("'") || trimmed.includes('`'))) {
                    errors.push(`Line ${index + 1}: Invalid characters in class definition`);
                    hasErrors = true;
                }
                // Check for empty field/method names
                if ((trimmed.includes('-') || trimmed.includes('+')) && trimmed.includes(' : ')) {
                    const parts = trimmed.split(' : ');
                    if (parts[0].trim().length <= 1) {
                        errors.push(`Line ${index + 1}: Empty field/method name`);
                        hasErrors = true;
                    }
                }
                // Check for malformed class definitions
                if (trimmed.startsWith('class ') && !trimmed.includes('{') && !trimmed.includes('<<')) {
                    errors.push(`Line ${index + 1}: Incomplete class definition`);
                    hasErrors = true;
                }
                // Check for empty class definitions (class Name {})
                if (trimmed.match(/class\s+\w+\s*\{\s*\}/)) {
                    errors.push(`Line ${index + 1}: Empty class definition (no members)`);
                    hasErrors = true;
                }
            }
        });
        if (hasErrors) {
            console.warn('🚨 Mermaid syntax validation found issues:', errors);
            // Use fixed content if we made repairs
            mermaidContent = fixedLines.join('\n');
            // Add error comment to the diagram
            mermaidContent = mermaidContent.replace(/```$/, `\n%% Validation warnings: ${errors.join(', ')}\n\`\`\``);
            console.log('🔧 Applied automatic fixes to Mermaid content');
        }
        else {
            console.log('✅ Mermaid content validation passed');
        }
        const stats = `${uniqueClasses.length} classes shown (${classes.length} total)`;
        return {
            title,
            content: `# ${title}\n\n${mermaidContent}`,
            stats
        };
    }
    async generatePackageDiagram(classes) {
        const title = 'Package Dependencies';
        const packages = [...new Set(classes.map(cls => cls.package).filter(pkg => pkg))];
        const packageIdMap = new Map();
        packages.forEach(pkg => {
            const safeId = pkg.replace(/\./g, '_');
            packageIdMap.set(pkg, safeId);
        });
        let mermaidContent = '```mermaid\ngraph LR\n';
        packages.forEach(pkg => {
            const safeId = packageIdMap.get(pkg);
            mermaidContent += `    ${safeId}["${pkg}"]\n`;
        });
        const classToPackageMap = new Map();
        classes.forEach(cls => {
            if (cls.package) {
                classToPackageMap.set(cls.name, cls.package);
                const simpleName = cls.name.split('.').pop() || cls.name;
                classToPackageMap.set(simpleName, cls.package);
            }
        });
        const packageDependencies = new Set();
        const dependencyCounts = new Map();
        classes.forEach(cls => {
            if (cls.dependencies && cls.package) {
                const sourcePackage = cls.package;
                const sourcePackageId = packageIdMap.get(sourcePackage);
                if (sourcePackageId) {
                    cls.dependencies.forEach((dep) => {
                        let targetPackage = null;
                        if (classToPackageMap.has(dep)) {
                            targetPackage = classToPackageMap.get(dep) || null;
                        }
                        else {
                            const depStr = String(dep);
                            const depParts = depStr.split('.');
                            const simpleDepName = depParts[depParts.length - 1];
                            if (classToPackageMap.has(simpleDepName)) {
                                targetPackage = classToPackageMap.get(simpleDepName) || null;
                            }
                            else if (depStr.includes('$')) {
                                const innerClassParts = depStr.split('$');
                                const outerClass = innerClassParts[0];
                                const outerClassName = outerClass.split('.').pop() || outerClass;
                                if (classToPackageMap.has(outerClassName)) {
                                    targetPackage = classToPackageMap.get(outerClassName) || null;
                                }
                            }
                        }
                        if (targetPackage && targetPackage !== sourcePackage) {
                            const targetPackageId = packageIdMap.get(targetPackage);
                            if (targetPackageId) {
                                const relationshipKey = `${sourcePackageId}->${targetPackageId}`;
                                const relationship = `${sourcePackageId} -->|depends on| ${targetPackageId}`;
                                if (!packageDependencies.has(relationshipKey)) {
                                    packageDependencies.add(relationshipKey);
                                    packageDependencies.add(relationship);
                                    dependencyCounts.set(relationshipKey, 1);
                                }
                                else {
                                    const currentCount = dependencyCounts.get(relationshipKey) || 1;
                                    dependencyCounts.set(relationshipKey, currentCount + 1);
                                }
                            }
                        }
                    });
                }
            }
        });
        packageDependencies.forEach(rel => {
            if (rel.includes('-->') && !rel.includes('->')) {
                mermaidContent += `    ${rel}\n`;
            }
        });
        mermaidContent += '```';
        const stats = `${packages.length} packages, ${dependencyCounts.size} dependencies`;
        return {
            title,
            content: `# ${title}\n\n${mermaidContent}`,
            stats
        };
    }
}
exports.VisualizationAgent = VisualizationAgent;
//# sourceMappingURL=visualization_agent.js.map