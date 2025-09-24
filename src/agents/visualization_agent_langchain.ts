import { ChatOpenAI } from "@langchain/openai";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { PromptTemplate } from "@langchain/core/prompts";
import { Agent } from "./types";
import { JavaParser, ProjectStructure } from "../service/java_parser";
import { RAGService } from "../service/rag_service";
import * as vscode from "vscode";

export class VisualizationAgent implements Agent {
  private model: ChatOpenAI | null = null;
  private outputParser: StringOutputParser;
  private ragService: RAGService;

  constructor() {
    this.outputParser = new StringOutputParser();
    this.ragService = new RAGService();
    // We don't initialize the model here to avoid requiring API key during extension activation
  }

  private initializeModel(): ChatOpenAI {
    if (this.model) {
      return this.model;
    }

    // Get configuration
    const config = vscode.workspace.getConfiguration("codedoc");
    const apiKey = config.get<string>("openaiApiKey");
    const modelName = config.get<string>("openaiModel", "gpt-4");
    const maxTokens = config.get<number>("maxTokens", 500); // Reduced from 2000 to 500 for concise responses
    const temperature = config.get<number>("temperature", 0.3);

    if (!apiKey) {
      throw new Error(
        "OpenAI API key not configured. Please configure it in the settings."
      );
    }

    this.model = new ChatOpenAI({
      modelName: modelName,
      temperature: temperature,
      maxTokens: maxTokens,
      openAIApiKey: apiKey,
    });

    return this.model;
  }

  async execute(context: any): Promise<any> {
    const task = context.task;

    switch (task) {
      case "generateArchitectureDiagram":
        return await this.generateArchitectureDescription(
          context.projectStructure,
          context.userQuery
        );
      case "generateClassRelationshipDiagram":
        return await this.generateClassRelationshipDiagram(
          context.targetClass,
          context.relatedClasses,
          context.springContext
        );
      case "generateVisualizationData":
        return await this.generateVisualizationData(
          context.projectStructure,
          context.userQuery
        );
      case "generateSpecificDiagram":
        return await this.generateSpecificDiagram(
          context.diagramType,
          context.module,
          context.projectStructure
        );
      default:
        throw new Error(`Unknown task: ${task}`);
    }
  }

  private async generateArchitectureDescription(
    structure: ProjectStructure,
    userQuery?: string
  ): Promise<string> {
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
        const context = await this.ragService.retrieveContext(
          userQuery,
          structure
        );
        const augmentedPrompt = await this.ragService.augmentPrompt(
          finalPrompt,
          context
        );
        // Use the augmented prompt directly instead of treating it as a template
        finalPrompt = augmentedPrompt;
      }

      // Use the existing JavaParser to get project structure
      const javaParser = new JavaParser();

      // Create a prompt for generating architecture description
      const promptTemplate = PromptTemplate.fromTemplate(finalPrompt);

      // Convert structure to a readable format for the LLM
      const structureSummary = this.createStructureSummary(structure);

      const chain = promptTemplate.pipe(model).pipe(this.outputParser);
      const result = await chain.invoke({ structure: structureSummary });

      return result;
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes("API key not configured")
      ) {
        throw error; // Re-throw configuration errors
      }
      throw new Error(
        `Failed to generate architecture description: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  private createStructureSummary(structure: ProjectStructure): string {
    let summary = `Total Classes: ${structure.classes.length}\n\n`;

    // Group classes by package
    const packageGroups: { [key: string]: any[] } = {};
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
    const springComponents = structure.classes.filter((cls) =>
      cls.annotations.some(
        (ann) =>
          ann.includes("@Service") ||
          ann.includes("@Controller") ||
          ann.includes("@Repository") ||
          ann.includes("@Component") ||
          ann.includes("@RestController")
      )
    );

    if (springComponents.length > 0) {
      summary += "\nSpring Components:\n";
      springComponents.forEach((comp) => {
        const springAnns = comp.annotations.filter(
          (ann) =>
            ann.includes("@Service") ||
            ann.includes("@Controller") ||
            ann.includes("@Repository") ||
            ann.includes("@Component") ||
            ann.includes("@RestController")
        );
        summary += `- ${comp.name}: ${springAnns.join(", ")}\n`;
      });
    }

    // Add relationships
    summary += `\nKey Relationships:\n`;
    const relationshipCounts = structure.relationships.reduce((acc, rel) => {
      acc[rel.type] = (acc[rel.type] || 0) + 1;
      return acc;
    }, {} as { [key: string]: number });

    Object.entries(relationshipCounts).forEach(([type, count]) => {
      summary += `- ${type}: ${count} connections\n`;
    });

    return summary;
  }

  private async generateClassRelationshipDiagram(
    targetClass: any,
    relatedClasses: any[],
    springContext?: any
  ): Promise<string> {
    try {
      const model = this.initializeModel();

      // Create the prompt directly without template variables to avoid LangChain parsing issues
      const promptText = `Generate a Mermaid class relationship diagram for this Java class and its related classes.
Focus on Spring-specific relationships and dependencies.

Target Class: ${targetClass.name}
Spring Patterns: ${
        targetClass.springPatterns?.map((p: any) => p.type).join(", ") || "None"
      }
Spring Dependencies: ${
        targetClass.springDependencies?.map((d: any) => d.type).join(", ") ||
        "None"
      }

Related Classes: ${relatedClasses.map((c: any) => c.name).join(", ")}

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
    } catch (error) {
      // Return a basic fallback diagram if generation fails
      return this.generateFallbackClassDiagram(targetClass, relatedClasses);
    }
  }

  private generateFallbackClassDiagram(
    targetClass: any,
    relatedClasses: any[]
  ): string {
    // Deduplicate related classes by name
    const uniqueRelatedClasses = relatedClasses.filter((cls, index, self) =>
      index === self.findIndex(c => c.name === cls.name) && cls.name !== targetClass.name
    ).slice(0, 5); // Limit to 5 related classes
    
    let diagram = "```mermaid\nclassDiagram\n";

    // Add target class
    const targetClassName = targetClass.name.replace(/[^a-zA-Z0-9_]/g, '_');
    diagram += `    class ${targetClassName} {\n`;
    if (targetClass.springPatterns && targetClass.springPatterns.length > 0) {
      const stereotype = String(targetClass.springPatterns[0].type).replace(/@/g, '').replace(/\s+/g, '_');
      if (stereotype && stereotype.trim() !== '') {
        diagram += `        <<${stereotype}>>\n`;
      }
    }
    
    // Add methods
    (targetClass.methods || []).slice(0, 3).forEach((method: any) => {
      const methodName = String(method.name || 'method').replace(/[^a-zA-Z0-9_]/g, '_');
      diagram += `        +${methodName}()\n`;
    });
    diagram += "    }\n";

    // Add related classes
    uniqueRelatedClasses.forEach((relatedClass: any) => {
      const relatedClassName = relatedClass.name.replace(/[^a-zA-Z0-9_]/g, '_');
      diagram += `    class ${relatedClassName} {\n`;
      if (
        relatedClass.springPatterns &&
        relatedClass.springPatterns.length > 0
      ) {
        const stereotype = String(relatedClass.springPatterns[0].type).replace(/@/g, '').replace(/\s+/g, '_');
        if (stereotype && stereotype.trim() !== '') {
          diagram += `        <<${stereotype}>>\n`;
        }
      }
      diagram += "        +method()\n    }\n";

      // Add relationship, avoiding self-references
      if (relatedClassName !== targetClassName) {
        diagram += `    ${targetClassName} --> ${relatedClassName}\n`;
      }
    });

    diagram += "```";
    return diagram;
  }

  private async generateVisualizationData(
    structure: ProjectStructure,
    userQuery?: string
  ): Promise<any> {
    try {
      // Generate both text description and structured data for frontend
      const textDescription = await this.generateArchitectureDescription(
        structure,
        userQuery
      );

      // Create structured data that the frontend expects
      const visualizationData = this.prepareVisualizationData(structure);

      return {
        textDescription,
        visualizationData,
        success: true,
      };
    } catch (error) {
      console.error("Failed to generate visualization data:", error);
      return {
        textDescription: "Failed to generate architecture description",
        visualizationData: this.createFallbackVisualizationData(structure),
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  private prepareVisualizationData(structure: ProjectStructure) {
    // This matches the format expected by the frontend renderVisualization function
    const layers: {
      controllers: any[];
      services: any[];
      repositories: any[];
      entities: any[];
      components: any[];
    } = {
      controllers: [],
      services: [],
      repositories: [],
      entities: [],
      components: [],
    };

    // Categorize classes by Spring patterns
    structure.classes.forEach((cls) => {
      const springPatterns = cls.springPatterns || [];
      const hasController = springPatterns.some(
        (p) => p.type === "CONTROLLER" || p.type === "REST_CONTROLLER"
      );
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
      } else if (hasService) {
        layers.services.push(classInfo);
      } else if (hasRepository) {
        layers.repositories.push(classInfo);
      } else if (hasComponent) {
        layers.components.push(classInfo);
      } else {
        // Check for entity-like classes (classes with many fields, few methods)
        if (
          cls.fields &&
          cls.methods &&
          cls.fields.length > cls.methods.length
        ) {
          layers.entities.push(classInfo);
        } else {
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

  private createFallbackVisualizationData(structure: ProjectStructure) {
    // Create basic visualization data when enhanced analysis fails
    const layers: {
      controllers: any[];
      services: any[];
      repositories: any[];
      entities: any[];
      components: any[];
    } = {
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

      if (
        annotations.includes("controller") ||
        className.includes("controller")
      ) {
        layers.controllers.push(classInfo);
      } else if (
        annotations.includes("service") ||
        className.includes("service")
      ) {
        layers.services.push(classInfo);
      } else if (
        annotations.includes("repository") ||
        className.includes("repository")
      ) {
        layers.repositories.push(classInfo);
      } else {
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

  private async generateSpecificDiagram(
    diagramType: string,
    module: string,
    structure: ProjectStructure
  ): Promise<any> {
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
    } catch (error) {
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

  private async generateComponentDiagram(classes: any[]): Promise<any> {
    // const scopeText = scope === 'module' ? ` (${module})` : '';
    const title = `Component Diagram`;
    
    console.log('Generating component diagram for classes:', classes.length);
    
    // Group classes by Spring patterns with fallback to naming conventions
    const controllers = classes.filter(cls => 
      cls.springPatterns?.some((p: any) => p.type === 'CONTROLLER' || p.type === 'REST_CONTROLLER') ||
      cls.name.toLowerCase().includes('controller')
    );
    
    const services = classes.filter(cls => 
      cls.springPatterns?.some((p: any) => p.type === 'SERVICE') ||
      cls.name.toLowerCase().includes('service')
    );
    
    const repositories = classes.filter(cls => 
      cls.springPatterns?.some((p: any) => p.type === 'REPOSITORY') ||
      cls.name.toLowerCase().includes('repository') ||
      cls.name.toLowerCase().includes('dao')
    );
    
    console.log('Found components:', {
      controllers: controllers.length,
      services: services.length,
      repositories: repositories.length
    });

    let mermaidContent = '```mermaid\ngraph TD\n';
    
    // If no components found, create a simple diagram with all classes
    if (controllers.length === 0 && services.length === 0 && repositories.length === 0) {
      console.log('No Spring components found, creating generic component diagram');
      
      // Use naming conventions as fallback
      const fallbackControllers = classes.filter(cls => cls.name.toLowerCase().includes('controller'));
      const fallbackServices = classes.filter(cls => cls.name.toLowerCase().includes('service'));
      const fallbackRepositories = classes.filter(cls => 
        cls.name.toLowerCase().includes('repository') || 
        cls.name.toLowerCase().includes('dao')
      );
      
      // Add all classes as generic components if still no matches
      if (fallbackControllers.length === 0 && fallbackServices.length === 0 && fallbackRepositories.length === 0) {
        classes.slice(0, 10).forEach((cls, i) => {
          mermaidContent += `    C${i}[${cls.name}]\n`;
        });
      } else {
        // Add fallback components
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
    
    // Create maps for easier lookup
    const classMap = new Map<string, any>();
    classes.forEach(cls => {
      classMap.set(cls.name, cls);
      // Also map simplified names
      const simpleName = cls.name.split('.').pop() || cls.name;
      classMap.set(simpleName, cls);
    });
    
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
    
    // Add more detailed relationships based on actual dependencies
    // Controller --> Service relationships
    controllers.forEach((ctrl, i) => {
      if (ctrl.dependencies) {
        ctrl.dependencies.forEach((dep: any) => {
          // Find matching service
          services.forEach((svc, j) => {
            // Check if this dependency matches the service
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
    
    // Service --> Repository relationships
    services.forEach((svc, i) => {
      if (svc.dependencies) {
        svc.dependencies.forEach((dep: any) => {
          // Find matching repository
          repositories.forEach((repo, j) => {
            // Check if this dependency matches the repository
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
    
    // Add relationships between services if they depend on each other
    services.forEach((svc1, i) => {
      if (svc1.dependencies) {
        svc1.dependencies.forEach((dep: any) => {
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

  private async generateLayeredDiagram(classes: any[]): Promise<any> {
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

  private async generateClassDiagram(classes: any[]): Promise<any> {
    //const scopeText = scope === 'module' ? ` (${module})` : '';
    const title = `Class Diagram`;
  
    // Start a mermaid fenced code block (```)
    let mermaidContent = '```mermaid\nclassDiagram\n';
  
    // Deduplicate by class name, keep first occurrence; limit to 15 for better visibility
    const uniqueClasses = classes.filter((cls, index, self) =>
      index === self.findIndex(c => c.name === cls.name)
    ).slice(0, 15);
  
    // Helper: sanitize identifier for mermaid (only word chars and underscores)
    const makeSanitizedIdGenerator = () => {
      const used = new Set<string>();
      return (name: string) => {
        let id = (name || 'Class')
          .replace(/<[^>]*>/g, '')      // drop generics <>...
          .replace(/[^\w]/g, '_')       // non-word chars -> _
          .replace(/_+/g, '_')          // collapse multiple underscores
          .replace(/^_+|_+$/g, '');     // trim leading/trailing underscores
        if (!id || /^\d/.test(id)) id = '_' + id;
        // Ensure non-empty
        if (!id) id = 'Class';
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
    const simplifyType = (t: any) => {
      if (!t) return 'Object';
      let s = String(t);
      s = s.replace(/<[^>]*>/g, '');           // remove generics
      const parts = s.split('.');
      return parts[parts.length - 1] || s;
    };
  
    // Map originalName -> sanitizedId
    const idMap = new Map<string, string>();
    uniqueClasses.forEach(c => idMap.set(c.name, genId(c.name)));
  
    // Group classes (controllers/services/repos/entities/others) with improved detection
    const controllers = uniqueClasses.filter(cls => {
      // Check for Spring annotations first
      const hasSpringControllerAnnotation = cls.springPatterns?.some((p: any) => 
        p.type === 'CONTROLLER' || 
        p.type === 'REST_CONTROLLER' ||
        String(p.type).toUpperCase().includes('CONTROLLER')
      );
      
      // Check for naming conventions
      const hasControllerName = cls.name.toLowerCase().includes('controller');
      
      // Check package names
      const isInControllerPackage = cls.package && (
        cls.package.toLowerCase().includes('controller') ||
        cls.package.toLowerCase().includes('web') ||
        cls.package.toLowerCase().includes('api')
      );
      
      return hasSpringControllerAnnotation || hasControllerName || isInControllerPackage;
    });
    
    const services = uniqueClasses.filter(cls => {
      // Check for Spring annotations first
      const hasSpringServiceAnnotation = cls.springPatterns?.some((p: any) => 
        p.type === 'SERVICE' ||
        String(p.type).toUpperCase().includes('SERVICE')
      );
      
      // Check for naming conventions
      const hasServiceName = cls.name.toLowerCase().includes('service');
      
      // Check for implementation classes
      const isServiceImpl = cls.name.toLowerCase().includes('serviceimpl');
      
      // Check package names
      const isInServicePackage = cls.package && (
        cls.package.toLowerCase().includes('service') ||
        cls.package.toLowerCase().includes('business') ||
        cls.package.toLowerCase().includes('logic')
      );
      
      return hasSpringServiceAnnotation || hasServiceName || isServiceImpl || isInServicePackage;
    });
    
    const repositories = uniqueClasses.filter(cls => {
      // Check for Spring annotations first
      const hasSpringRepositoryAnnotation = cls.springPatterns?.some((p: any) => 
        p.type === 'REPOSITORY' ||
        p.type === 'DAO' ||
        String(p.type).toUpperCase().includes('REPOSITORY') ||
        String(p.type).toUpperCase().includes('DAO')
      );
      
      // Check for naming conventions
      const hasRepositoryName = cls.name.toLowerCase().includes('repository') || 
                               cls.name.toLowerCase().includes('dao') ||
                               cls.name.toLowerCase().includes('repo');
      
      // Check package names
      const isInRepositoryPackage = cls.package && (
        cls.package.toLowerCase().includes('repository') ||
        cls.package.toLowerCase().includes('dao') ||
        cls.package.toLowerCase().includes('persistence') ||
        cls.package.toLowerCase().includes('data')
      );
      
      return hasSpringRepositoryAnnotation || hasRepositoryName || isInRepositoryPackage;
    });
    
    const entities = uniqueClasses.filter(cls => {
      // Check for Spring annotations first
      const hasEntityAnnotation = cls.springPatterns?.some((p: any) => 
        p.type === 'ENTITY' ||
        String(p.type).toUpperCase().includes('ENTITY')
      );
      
      // JPA/Hibernate annotations
      const hasJpaAnnotation = cls.annotations?.some((ann: string) => 
        ann.includes('@Entity') ||
        ann.includes('@Table')
      );
      
      // Check for naming conventions
      const hasEntityName = cls.name.toLowerCase().includes('entity') ||
                           cls.name.toLowerCase().includes('model') ||
                           cls.name.toLowerCase().includes('dto') ||
                           cls.name.toLowerCase().includes('vo');
      
      // Check package names
      const isInEntityPackage = cls.package && (
        cls.package.toLowerCase().includes('entity') ||
        cls.package.toLowerCase().includes('model') ||
        cls.package.toLowerCase().includes('domain') ||
        cls.package.toLowerCase().includes('dto')
      );
      
      return hasEntityAnnotation || hasJpaAnnotation || hasEntityName || isInEntityPackage;
    });
    
    const others = uniqueClasses.filter(cls =>
      !controllers.includes(cls) && 
      !services.includes(cls) &&
      !repositories.includes(cls) && 
      !entities.includes(cls)
    );
  
    // Order to render: controllers -> services -> repos -> entities -> others
    const ordered = [...controllers, ...services, ...repositories, ...entities, ...others];
  
    // Emit class blocks using sanitized IDs; add original name as a comment inside block
    ordered.forEach(cls => {
      const id = idMap.get(cls.name)!;
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
      } else {
        mermaidContent += `    class ${id} {\n`;
      }
  
      // Keep original name as a comment (mermaid supports %% comments)
      mermaidContent += `        %% ${cls.name}\n`;
  
      // Add up to 5 key fields (simplified types) with more descriptive names
      const keyFields = (cls.fields || []).slice(0, 5);
      keyFields.forEach((field: any) => {
        let fname = String(field.name || 'field')
          .replace(/[{}<>]/g, '')
          .replace(/[^\w]/g, '_')
          .replace(/_+/g, '_')
          .replace(/^_+|_+$/g, '');
        // Ensure non-empty
        if (!fname) {
          fname = 'field';
        }
        const ftype = simplifyType(field.type);
        mermaidContent += `        -${fname}: ${ftype}\n`;
      });
  
      // Add up to 8 key methods, prefer non-getter/setter with return types
      const allMethods = cls.methods || [];
      // Prioritize non-getter/setter methods
      const nonGetterSetterMethods = allMethods.filter((m: any) => 
        !String(m.name).startsWith('get') && 
        !String(m.name).startsWith('set') &&
        !String(m.name).startsWith('is')
      ).slice(0, 8);
      
      // If we don't have enough non-getter/setter methods, add some getters/setters
      let keyMethods = [...nonGetterSetterMethods];
      if (keyMethods.length < 8) {
        const remainingSlots = 8 - keyMethods.length;
        const getterSetterMethods = allMethods.filter((m: any) => 
          String(m.name).startsWith('get') || 
          String(m.name).startsWith('set') ||
          String(m.name).startsWith('is')
        ).slice(0, remainingSlots);
        keyMethods = [...keyMethods, ...getterSetterMethods];
      }
      
      // If still not enough, add any methods
      if (keyMethods.length < 8) {
        const remainingSlots = 8 - keyMethods.length;
        const otherMethods = allMethods.filter((m: any) => 
          !keyMethods.includes(m)
        ).slice(0, remainingSlots);
        keyMethods = [...keyMethods, ...otherMethods];
      }
      
      keyMethods.forEach((method: any) => {
        const ret = method.returnType && method.returnType !== 'void' ? `: ${simplifyType(method.returnType)}` : '';
        let mname = String(method.name || 'method')
          .replace(/\s+/g, '_')
          .replace(/[{}<>]/g, '')
          .replace(/[^\w]/g, '_')
          .replace(/_+/g, '_')
          .replace(/^_+|_+$/g, '');
        // Ensure non-empty
        if (!mname) {
          mname = 'method';
        }
        mermaidContent += `        +${mname}()${ret}\n`;
      });
  
      mermaidContent += '    }\n';
    });
  
    // Build relationships (use sanitized ids)
    const addedRelationships = new Set<string>();
  
    // Enhanced dependency detection
    uniqueClasses.forEach(cls => {
      const classId = idMap.get(cls.name);
      if (cls.dependencies && classId) {
        cls.dependencies.forEach((dep: any) => {
          // Find the dependent class in our uniqueClasses
          const depClass = uniqueClasses.find(c => 
            (c.name === dep || 
            c.name === dep.replace(/.*\./g, '') || // Remove package prefix
            dep.includes(c.name) ||
            // Handle inner classes
            (c.name.includes('$') && dep.includes(c.name.split('$')[0])) ||
            // Handle case where dependency is a partial match
            (dep.includes('.') && c.name.endsWith(dep.split('.').pop() || '')) ||
            // Handle case where both have similar names
            (c.name.toLowerCase().includes(dep.toLowerCase()) || dep.toLowerCase().includes(c.name.toLowerCase()))) &&
            c.name !== cls.name // Avoid self-references
          );
          
          if (depClass) {
            const depId = idMap.get(depClass.name);
            if (depId && depId !== classId) { // Avoid self-references
              const rel = `${classId} --> ${depId}`;
              if (!addedRelationships.has(rel)) {
                mermaidContent += `    ${rel} : depends on\n`;
                addedRelationships.add(rel);
              }
            }
          }
        });
      }
      
      // Add field-based dependencies with better matching
      if (cls.fields && classId) {
        cls.fields.forEach((field: any) => {
          const fieldType = simplifyType(field.type);
          // Look for classes that match this field type with more flexible matching
          const fieldClass = uniqueClasses.find(c => 
            (c.name === fieldType ||
            c.name.endsWith(fieldType) ||
            c.name.includes(fieldType) ||
            fieldType.includes(c.name.split('.').pop() || c.name)) &&
            c.name !== cls.name // Avoid self-references
          );
          
          if (fieldClass) {
            const fieldId = idMap.get(fieldClass.name);
            if (fieldId && fieldId !== classId) { // Avoid self-references
              const rel = `${classId} --> ${fieldId}`;
              if (!addedRelationships.has(rel)) {
                mermaidContent += `    ${rel} : has ${field.name}\n`;
                addedRelationships.add(rel);
              }
            }
          }
        });
      }
      
      // Add method parameter-based dependencies with better matching
      if (cls.methods && classId) {
        cls.methods.forEach((method: any) => {
          if (method.parameters) {
            method.parameters.forEach((param: any) => {
              const paramType = simplifyType(param.type);
              // Look for classes that match this parameter type with more flexible matching
              const paramClass = uniqueClasses.find(c => 
                (c.name === paramType ||
                c.name.endsWith(paramType) ||
                c.name.includes(paramType) ||
                paramType.includes(c.name.split('.').pop() || c.name)) &&
                c.name !== cls.name // Avoid self-references
              );
              
              if (paramClass) {
                const paramId = idMap.get(paramClass.name);
                if (paramId && paramId !== classId) { // Avoid self-references
                  const rel = `${classId} ..> ${paramId}`;
                  if (!addedRelationships.has(rel)) {
                    mermaidContent += `    ${rel} : uses ${param.name}\n`;
                    addedRelationships.add(rel);
                  }
                }
              }
            });
          }
          
          // Add return type dependencies with better matching
          if (method.returnType) {
            const returnType = simplifyType(method.returnType);
            const returnClass = uniqueClasses.find(c => 
              (c.name === returnType ||
              c.name.endsWith(returnType) ||
              c.name.includes(returnType) ||
              returnType.includes(c.name.split('.').pop() || c.name)) &&
              c.name !== cls.name // Avoid self-references
            );
            
            if (returnClass) {
              const returnId = idMap.get(returnClass.name);
              if (returnId && returnId !== classId) { // Avoid self-references
                const rel = `${classId} ..> ${returnId}`;
                if (!addedRelationships.has(rel)) {
                  mermaidContent += `    ${rel} : returns ${method.name}\n`;
                  addedRelationships.add(rel);
                }
              }
            }
          }
        });
      }
    });
  
    // Controller --> Service with improved matching
    controllers.forEach(controller => {
      const relatedServices = services.filter(service =>
        controller.dependencies?.some((dep: any) => 
          (String(dep).includes(service.name) ||
          service.name.includes(String(dep)) ||
          service.name.toLowerCase().includes(controller.name.toLowerCase().replace('controller', '')) ||
          controller.name.toLowerCase().replace('controller', '').includes(service.name.toLowerCase().replace('service', ''))) &&
          service.name !== controller.name // Avoid self-references
        )
      );
      
      relatedServices.forEach(service => {
        const a = idMap.get(controller.name)!, b = idMap.get(service.name)!;
        const rel = `${a} --> ${b}`;
        if (!addedRelationships.has(rel)) {
          mermaidContent += `    ${rel} : uses\n`;
          addedRelationships.add(rel);
        }
      });
    });
  
    // Service --> Repository with improved matching
    services.forEach(service => {
      const relatedRepos = repositories.filter(repo =>
        service.dependencies?.some((dep: any) => 
          (String(dep).includes(repo.name) ||
          repo.name.includes(String(dep)) ||
          repo.name.toLowerCase().includes(service.name.toLowerCase().replace('service', '')) ||
          service.name.toLowerCase().replace('service', '').includes(repo.name.toLowerCase().replace('repository', '').replace('dao', ''))) &&
          repo.name !== service.name // Avoid self-references
        )
      );
      
      relatedRepos.forEach(repo => {
        const a = idMap.get(service.name)!, b = idMap.get(repo.name)!;
        const rel = `${a} --> ${b}`;
        if (!addedRelationships.has(rel)) {
          mermaidContent += `    ${rel} : uses\n`;
          addedRelationships.add(rel);
        }
      });
    });
  
    // Exception inheritance (if multiple exceptions and a base exception)
    const exceptions = others.filter(cls => cls.name.toLowerCase().includes('exception'));
    if (exceptions.length > 1) {
      const baseException = exceptions.find(ex => /Base|Custom/i.test(ex.name));
      if (baseException) {
        exceptions.filter(ex => ex !== baseException).forEach(ex => {
          const a = idMap.get(baseException.name)!, b = idMap.get(ex.name)!;
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
  

  private async generatePackageDiagram(classes: any[]): Promise<any> {
    const title = 'Package Dependencies';
    
    // Group classes by package
    const packages = [...new Set(classes.map(cls => cls.package).filter(pkg => pkg))];
    
    // Create a map of package names to their safe identifiers
    const packageIdMap = new Map<string, string>();
    packages.forEach(pkg => {
      const safeId = pkg.replace(/\./g, '_');
      packageIdMap.set(pkg, safeId);
    });
    
    let mermaidContent = '```mermaid\ngraph LR\n';
    
    // Add all packages as nodes
    packages.forEach(pkg => {
      const safeId = packageIdMap.get(pkg)!;
      mermaidContent += `    ${safeId}["${pkg}"]\n`;
    });
    
    // Create a map of class names to their packages for quick lookup
    const classToPackageMap = new Map<string, string>();
    classes.forEach(cls => {
      if (cls.package) {
        classToPackageMap.set(cls.name, cls.package);
        // Also map simplified class names (without package)
        const simpleName = cls.name.split('.').pop() || cls.name;
        classToPackageMap.set(simpleName, cls.package);
      }
    });
    
    // Analyze dependencies between packages
    const packageDependencies = new Set<string>();
    const dependencyCounts = new Map<string, number>();
    
    classes.forEach(cls => {
      if (cls.dependencies && cls.package) {
        const sourcePackage = cls.package;
        const sourcePackageId = packageIdMap.get(sourcePackage);
        
        if (sourcePackageId) {
          cls.dependencies.forEach((dep: any) => {
            // Try to find which package this dependency belongs to
            let targetPackage: string | null = null;
            
            // Direct match with full class name
            if (classToPackageMap.has(dep)) {
              targetPackage = classToPackageMap.get(dep) || null;
            } 
            // Try with simplified name
            else {
              const depStr = String(dep);
              const depParts = depStr.split('.');
              const simpleDepName = depParts[depParts.length - 1];
              if (classToPackageMap.has(simpleDepName)) {
                targetPackage = classToPackageMap.get(simpleDepName) || null;
              }
              // Try with the last part of the dependency if it contains $
              else if (depStr.includes('$')) {
                const innerClassParts = depStr.split('$');
                const outerClass = innerClassParts[0];
                const outerClassName = outerClass.split('.').pop() || outerClass;
                if (classToPackageMap.has(outerClassName)) {
                  targetPackage = classToPackageMap.get(outerClassName) || null;
                }
              }
            }
            
            // If we found the target package and it's different from source
            if (targetPackage && targetPackage !== sourcePackage) {
              const targetPackageId = packageIdMap.get(targetPackage);
              if (targetPackageId) {
                const relationshipKey = `${sourcePackageId}->${targetPackageId}`;
                const relationship = `${sourcePackageId} -->|depends on| ${targetPackageId}`;
                if (!packageDependencies.has(relationshipKey)) {
                  packageDependencies.add(relationshipKey);
                  packageDependencies.add(relationship);
                  dependencyCounts.set(relationshipKey, 1);
                } else {
                  // Increment count for this relationship
                  const currentCount = dependencyCounts.get(relationshipKey) || 1;
                  dependencyCounts.set(relationshipKey, currentCount + 1);
                }
              }
            }
          });
        }
      }
    });
    
    // Add the discovered package dependencies
    packageDependencies.forEach(rel => {
      // Only add the actual relationship lines, not the keys
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

  // private async generateSequenceDiagram(classes: any[], scope: string, module?: string): Promise<any> {
  //   const scopeText = scope === 'module' ? ` (${module})` : '';
  //   const title = `Sequence Diagram${scopeText}`;
    
  //   let mermaidContent = '``mermaid\nsequenceDiagram\n';
  //   mermaidContent += '    participant Client\n';
  //   mermaidContent += '    participant Controller\n';
  //   mermaidContent += '    participant Service\n';
  //   mermaidContent += '    participant Repository\n';
  //   mermaidContent += '    Client->>Controller: HTTP Request\n';
  //   mermaidContent += '    Controller->>Service: Business Logic\n';
  //   mermaidContent += '    Service->>Repository: Data Access\n';
  //   mermaidContent += '    Repository-->>Service: Data\n';
  //   mermaidContent += '    Service-->>Controller: Result\n';
  //   mermaidContent += '    Controller-->>Client: HTTP Response\n';
  //   mermaidContent += '```';
    
  //   const stats = 'Standard Spring request flow';
    
  //   return {
  //     title,
  //     content: `# ${title}\n\n${mermaidContent}`,
  //     stats
  //   };
  // }
}