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
          context.scope,
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
    let diagram = "```mermaid\nclassDiagram\n";

    // Add target class
    diagram += `    class ${targetClass.name} {\n`;
    if (targetClass.springPatterns && targetClass.springPatterns.length > 0) {
      diagram += `        <<@${targetClass.springPatterns[0].type}>>\n`;
    }
    targetClass.methods.slice(0, 3).forEach((method: any) => {
      diagram += `        +${method.name}()\n`;
    });
    diagram += "    }\n";

    // Add related classes
    relatedClasses.slice(0, 2).forEach((relatedClass: any) => {
      diagram += `    class ${relatedClass.name} {\n`;
      if (
        relatedClass.springPatterns &&
        relatedClass.springPatterns.length > 0
      ) {
        diagram += `        <<@${relatedClass.springPatterns[0].type}>>\n`;
      }
      diagram += "        +method()\n    }\n";

      // Add relationship
      diagram += `    ${targetClass.name} --> ${relatedClass.name}\n`;
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
    scope: string,
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
      if (scope === 'module' && module) {
        filteredClasses = structure.classes.filter(cls => cls.package === module);
        if (filteredClasses.length === 0) {
          throw new Error(`No classes found in module: ${module}`);
        }
      }

      // Generate diagram based on type
      let diagramContent = '';
      let title = '';
      let stats = '';

      switch (diagramType) {
        case 'component':
          const componentResult = await this.generateComponentDiagram(filteredClasses, scope, module);
          diagramContent = componentResult.content;
          title = componentResult.title;
          stats = componentResult.stats;
          break;
        case 'layered':
          const layeredResult = await this.generateLayeredDiagram(filteredClasses, scope, module);
          diagramContent = layeredResult.content;
          title = layeredResult.title;
          stats = layeredResult.stats;
          break;
        case 'class':
          const classResult = await this.generateClassDiagram(filteredClasses, scope, module);
          diagramContent = classResult.content;
          title = classResult.title;
          stats = classResult.stats;
          break;
        case 'package':
          const packageResult = await this.generatePackageDiagram(structure.classes, scope, module);
          diagramContent = packageResult.content;
          title = packageResult.title;
          stats = packageResult.stats;
          break;
        case 'sequence':
          const sequenceResult = await this.generateSequenceDiagram(filteredClasses, scope, module);
          diagramContent = sequenceResult.content;
          title = sequenceResult.title;
          stats = sequenceResult.stats;
          break;
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
        scope,
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
        scope,
        module
      };
    }
  }

  private async generateComponentDiagram(classes: any[], scope: string, module?: string): Promise<any> {
    const scopeText = scope === 'module' ? ` (${module})` : '';
    const title = `Component Diagram${scopeText}`;
    
    // Group classes by Spring patterns
    const controllers = classes.filter(cls => 
      cls.springPatterns?.some((p: any) => p.type === 'CONTROLLER' || p.type === 'REST_CONTROLLER')
    );
    const services = classes.filter(cls => 
      cls.springPatterns?.some((p: any) => p.type === 'SERVICE')
    );
    const repositories = classes.filter(cls => 
      cls.springPatterns?.some((p: any) => p.type === 'REPOSITORY')
    );

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

  private async generateLayeredDiagram(classes: any[], scope: string, module?: string): Promise<any> {
    const scopeText = scope === 'module' ? ` (${module})` : '';
    const title = `Layered Architecture${scopeText}`;
    
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

  private async generateClassDiagram(classes: any[], scope: string, module?: string): Promise<any> {
    const scopeText = scope === 'module' ? ` (${module})` : '';
    const title = `Class Diagram${scopeText}`;
    
    let mermaidContent = '```mermaid\nclassDiagram\n';
    
    // Remove duplicates and limit to first 8 classes to avoid overwhelming diagrams
    const uniqueClasses = classes.filter((cls, index, self) => 
      index === self.findIndex(c => c.name === cls.name)
    ).slice(0, 8);
    
    // Group classes by type for better organization
    const controllers = uniqueClasses.filter(cls => 
      cls.springPatterns?.some((p: any) => p.type === 'CONTROLLER' || p.type === 'REST_CONTROLLER') ||
      cls.name.toLowerCase().includes('controller')
    );
    const services = uniqueClasses.filter(cls => 
      cls.springPatterns?.some((p: any) => p.type === 'SERVICE') ||
      cls.name.toLowerCase().includes('service')
    );
    const repositories = uniqueClasses.filter(cls => 
      cls.springPatterns?.some((p: any) => p.type === 'REPOSITORY') ||
      cls.name.toLowerCase().includes('repository')
    );
    const entities = uniqueClasses.filter(cls => 
      cls.springPatterns?.some((p: any) => p.type === 'ENTITY') ||
      cls.name.toLowerCase().includes('entity') ||
      cls.name.toLowerCase().includes('model')
    );
    const others = uniqueClasses.filter(cls => 
      !controllers.includes(cls) && !services.includes(cls) && 
      !repositories.includes(cls) && !entities.includes(cls)
    );
    
    // Add classes to diagram
    [...controllers, ...services, ...repositories, ...entities, ...others].forEach(cls => {
      mermaidContent += `    class ${cls.name} {\n`;
      
      // Add Spring annotation or class type
      const springPattern = cls.springPatterns?.[0];
      if (springPattern) {
        mermaidContent += `        <<@${springPattern.type}>>\n`;
      } else if (cls.name.toLowerCase().includes('exception')) {
        mermaidContent += `        <<Exception>>\n`;
      } else if (cls.name.toLowerCase().includes('mapper')) {
        mermaidContent += `        <<Mapper>>\n`;
      } else if (cls.name.toLowerCase().includes('dto')) {
        mermaidContent += `        <<DTO>>\n`;
      }
      
      // Add key fields (limit to 2)
      const keyFields = cls.fields?.slice(0, 2) || [];
      keyFields.forEach((field: any) => {
        mermaidContent += `        -${field.name}: ${field.type || 'Object'}\n`;
      });
      
      // Add key methods (limit to 3, prioritize non-getter/setter methods)
      const allMethods = cls.methods || [];
      const keyMethods = allMethods
        .filter((method: any) => !method.name.startsWith('get') && !method.name.startsWith('set'))
        .slice(0, 3);
      
      // If no non-getter/setter methods, include some getters/setters
      if (keyMethods.length === 0) {
        keyMethods.push(...allMethods.slice(0, 2));
      }
      
      keyMethods.forEach((method: any) => {
        const returnType = method.returnType && method.returnType !== 'void' ? `: ${method.returnType}` : '';
        mermaidContent += `        +${method.name}()${returnType}\n`;
      });
      
      mermaidContent += '    }\n';
    });
    
    // Add meaningful relationships based on Spring patterns and naming
    const addedRelationships = new Set<string>();
    
    // Controller -> Service relationships
    controllers.forEach(controller => {
      const relatedService = services.find(service => 
        controller.dependencies?.some((dep: any) => dep.includes(service.name)) ||
        service.name.toLowerCase().includes(controller.name.toLowerCase().replace('controller', ''))
      );
      if (relatedService) {
        const relationship = `${controller.name} --> ${relatedService.name}`;
        if (!addedRelationships.has(relationship)) {
          mermaidContent += `    ${relationship} : uses\n`;
          addedRelationships.add(relationship);
        }
      }
    });
    
    // Service -> Repository relationships
    services.forEach(service => {
      const relatedRepo = repositories.find(repo => 
        service.dependencies?.some((dep: any) => dep.includes(repo.name)) ||
        repo.name.toLowerCase().includes(service.name.toLowerCase().replace('service', ''))
      );
      if (relatedRepo) {
        const relationship = `${service.name} --> ${relatedRepo.name}`;
        if (!addedRelationships.has(relationship)) {
          mermaidContent += `    ${relationship} : uses\n`;
          addedRelationships.add(relationship);
        }
      }
    });
    
    // Exception inheritance (if multiple exceptions)
    const exceptions = others.filter(cls => cls.name.toLowerCase().includes('exception'));
    if (exceptions.length > 1) {
      const baseException = exceptions.find(ex => ex.name.includes('Base') || ex.name.includes('Custom'));
      if (baseException) {
        exceptions.filter(ex => ex !== baseException).forEach(ex => {
          const relationship = `${baseException.name} <|-- ${ex.name}`;
          if (!addedRelationships.has(relationship)) {
            mermaidContent += `    ${relationship}\n`;
            addedRelationships.add(relationship);
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

  private async generatePackageDiagram(classes: any[], scope: string, module?: string): Promise<any> {
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

  private async generateSequenceDiagram(classes: any[], scope: string, module?: string): Promise<any> {
    const scopeText = scope === 'module' ? ` (${module})` : '';
    const title = `Sequence Diagram${scopeText}`;
    
    let mermaidContent = '```mermaid\nsequenceDiagram\n';
    mermaidContent += '    participant Client\n';
    mermaidContent += '    participant Controller\n';
    mermaidContent += '    participant Service\n';
    mermaidContent += '    participant Repository\n';
    mermaidContent += '    Client->>Controller: HTTP Request\n';
    mermaidContent += '    Controller->>Service: Business Logic\n';
    mermaidContent += '    Service->>Repository: Data Access\n';
    mermaidContent += '    Repository-->>Service: Data\n';
    mermaidContent += '    Service-->>Controller: Result\n';
    mermaidContent += '    Controller-->>Client: HTTP Response\n';
    mermaidContent += '```';
    
    const stats = 'Standard Spring request flow';
    
    return {
      title,
      content: `# ${title}\n\n${mermaidContent}`,
      stats
    };
  }
}
