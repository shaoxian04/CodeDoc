import { ChatOpenAI } from "@langchain/openai";
import { StringOutputParser } from "@langchain/core/output_parsers";
import { PromptTemplate } from "@langchain/core/prompts";
import { Agent } from "./types";
import { ProjectStructure, JavaClass } from "../service/java_parser";
import { RAGService } from "../service/rag_service";
import {
  SyntheticExampleGenerator,
  SyntheticExample,
} from "../service/synthetic_example_generator";
import { VisualizationAgent } from "./visualization_agent";
import * as vscode from "vscode";

// Complexity analysis interfaces
export enum ComplexityLevel {
  SIMPLE = "simple", // 1-5 methods, 200-400 words
  MODERATE = "moderate", // 6-15 methods, 400-800 words
  COMPLEX = "complex", // 16+ methods, 800-1500 words
}

export interface ComplexityMetrics {
  methodCount: number;
  dependencyCount: number;
  springPatternCount: number;
  overallComplexity: ComplexityLevel;
  recommendedWordCount: number;
}

export class DocumentationAgent implements Agent {
  private model: ChatOpenAI | null = null;
  private outputParser: StringOutputParser;
  private ragService: RAGService;
  private syntheticGenerator: SyntheticExampleGenerator;
  private visualizationAgent: VisualizationAgent;

  constructor() {
    this.outputParser = new StringOutputParser();
    this.ragService = new RAGService();
    this.syntheticGenerator = new SyntheticExampleGenerator();
    this.visualizationAgent = new VisualizationAgent();
    // We don't initialize the model here to avoid requiring API key during extension activation
  }

  // Complexity Analysis Methods
  private analyzeComplexity(javaClass: JavaClass): ComplexityMetrics {
    const methodCount = javaClass.methods?.length || 0;
    const dependencyCount = javaClass.springDependencies?.length || 0;
    const springPatternCount = javaClass.springPatterns?.length || 0;

    // Determine complexity level based on method count and other factors
    let complexity: ComplexityLevel;
    let recommendedWordCount: number;

    if (methodCount <= 5 && dependencyCount <= 2) {
      complexity = ComplexityLevel.SIMPLE;
      recommendedWordCount = 300; // 200-400 range
    } else if (methodCount <= 15 && dependencyCount <= 5) {
      complexity = ComplexityLevel.MODERATE;
      recommendedWordCount = 600; // 400-800 range
    } else {
      complexity = ComplexityLevel.COMPLEX;
      recommendedWordCount = 1200; // 800-1500 range
    }

    // Adjust for Spring complexity
    if (springPatternCount > 1) {
      recommendedWordCount += 200;
    }

    return {
      methodCount,
      dependencyCount,
      springPatternCount,
      overallComplexity: complexity,
      recommendedWordCount,
    };
  }

  private getSpringContextInfo(javaClass: JavaClass): string {
    if (!javaClass.springPatterns || javaClass.springPatterns.length === 0) {
      // Fallback: check for Spring annotations in the old format
      const hasSpringAnnotations = javaClass.annotations?.some(
        (ann) =>
          ann.includes("@Service") ||
          ann.includes("@Controller") ||
          ann.includes("@Repository") ||
          ann.includes("@Component") ||
          ann.includes("@RestController")
      );

      if (hasSpringAnnotations) {
        return "This is a Spring component based on its annotations.";
      }

      return "This is a regular Java class.";
    }

    const patterns = javaClass.springPatterns
      .map((p) => p.description)
      .join(", ");
    return `This is a Spring component: ${patterns}`;
  }

  private createClassFileMap(
    relatedClasses: any[],
    currentClass: any
  ): { [className: string]: string } {
    const classFileMap: { [className: string]: string } = {};

    // Add current class
    classFileMap[currentClass.name] = currentClass.filePath;

    // Add related classes
    for (const relatedClass of relatedClasses) {
      classFileMap[relatedClass.name] = relatedClass.filePath;
    }

    return classFileMap;
  }

  private async getUsageExamples(
    javaClass: JavaClass,
    relatedClasses: any[]
  ): Promise<{
    realExamples: any[];
    syntheticExamples: SyntheticExample[];
  }> {
    // Try to get real usage examples
    const projectStructure: ProjectStructure = {
      classes: [javaClass, ...relatedClasses],
      relationships: [],
    };
    const realExamples = await this.ragService.retrieveClassUsagePatterns(
      javaClass.name,
      projectStructure
    );

    // Generate synthetic examples as fallback
    const syntheticExamples =
      this.syntheticGenerator.generateClassUsageExamples(
        javaClass,
        javaClass.springPatterns || []
      );

    return { realExamples, syntheticExamples };
  }

  private createAdaptivePrompt(
    complexity: ComplexityMetrics,
    springInfo: string,
    classFileMap: { [className: string]: string },
    usageExamples: {
      realExamples: any[];
      syntheticExamples: SyntheticExample[];
    },
    relationshipDiagram: string
  ): string {
    const basePrompt = `
                Generate comprehensive, Spring-focused documentation for this Java class in Markdown format.
                Target approximately ${
                  complexity.recommendedWordCount
                } words based on class complexity.
                
                Class Information:
                - Class: {className}
                - Package: {package}
                - File: {filePath}
                - Spring Context: ${springInfo}
                - Complexity Level: ${complexity.overallComplexity}
                
                Class Details:
                - Annotations: {annotations}
                - Extends: {extends}
                - Implements: {implements}
                - Fields: {fields}
                - Methods: {methods}
                - Related Classes: {relatedClasses}
                - Spring Patterns: {springPatterns}
                - Spring Dependencies: {springDependencies}
                
                Documentation Structure:
                ## Class Overview
                - Clear purpose statement with Spring context
                - Real-world analogy for beginners
                - When and why to use this class
                
                ## Spring Architecture Role
                - Explain Spring patterns and annotations used
                - Describe the class's role in Spring's layered architecture
                - Mention dependency injection and bean lifecycle if relevant
                
                ## Key Responsibilities
                - List main responsibilities (adapt number based on complexity)
                - Focus on business value and Spring integration
                
                ## Method Documentation
                ${this.getMethodDocumentationGuidelines(complexity)}
                
                ## Usage Examples
                ${this.getUsageExamplesSection(usageExamples)}
                - Show real Spring usage patterns when available
                - Include dependency injection examples
                - Demonstrate integration with other Spring components
                
                ## Relationships & Dependencies
                - Include this class relationship diagram:
                ${relationshipDiagram}
                - When mentioning other classes, create clickable file links using this format: [ClassName](file-path)
                - Available class file mappings: {classFileMap}
                - Example: "This service depends on [UserRepository](src/main/java/com/example/UserRepository.java) for data access"
                - Always link class names when they appear in dependency discussions
                - Explain Spring dependency injection relationships with linked classes
                - Show how this class integrates with other layers using linked references
                - Include links in method documentation when methods interact with other classes
                
                Guidelines:
                - Balance beginner-friendly explanations with technical depth
                - Explain Spring terminology when first used
                - Use inline code formatting (\`code\`) for class/method names
                - Include practical examples over theoretical ones
                - Focus on Spring-specific patterns and best practices
            `;

    return basePrompt;
  }

  private getMethodDocumentationGuidelines(
    complexity: ComplexityMetrics
  ): string {
    switch (complexity.overallComplexity) {
      case ComplexityLevel.SIMPLE:
        return "- Document each public method with purpose and basic usage";
      case ComplexityLevel.MODERATE:
        return `- Document each public method with purpose, parameters, and usage examples
                - Group related methods and explain workflows
                - Include error handling for key methods`;
      case ComplexityLevel.COMPLEX:
        return `- Comprehensive documentation for all public methods
                - Include parameter details, return values, and exceptions
                - Show method interaction patterns and workflows
                - Provide troubleshooting guidance for complex methods
                - Include performance considerations where relevant`;
      default:
        return "- Document key methods with purpose and usage";
    }
  }

  private getUsageExamplesSection(usageExamples: {
    realExamples: any[];
    syntheticExamples: SyntheticExample[];
  }): string {
    let section = "";

    if (usageExamples.realExamples.length > 0) {
      section +=
        "- PRIORITY: Use these real usage examples from the codebase:\n";
      usageExamples.realExamples.slice(0, 2).forEach((example, index) => {
        section += `  Real Example ${index + 1}: ${example.codeSnippet}\n`;
      });
    }

    if (usageExamples.syntheticExamples.length > 0) {
      section += "- Fallback examples if real examples are insufficient:\n";
      usageExamples.syntheticExamples.slice(0, 2).forEach((example, index) => {
        section += `  Example ${index + 1}: ${example.codeSnippet}\n`;
      });
    }

    return section;
  }

  private async generateClassRelationshipDiagram(
    javaClass: JavaClass,
    relatedClasses: any[]
  ): Promise<string> {
    try {
      const diagramResult = await this.visualizationAgent.execute({
        task: "generateClassRelationshipDiagram",
        targetClass: javaClass,
        relatedClasses: relatedClasses,
        springContext: javaClass.springPatterns,
      });

      return diagramResult;
    } catch (error) {
      console.error("Failed to generate class relationship diagram:", error);
      // Return a simple text-based relationship description as fallback
      return this.generateTextBasedRelationships(javaClass, relatedClasses);
    }
  }

  private generateTextBasedRelationships(
    javaClass: JavaClass,
    relatedClasses: any[]
  ): string {
    let relationships = `## Class Relationships\n\n`;
    relationships += `**${javaClass.name}** relationships:\n`;

    // Spring dependencies
    if (
      javaClass.springDependencies &&
      javaClass.springDependencies.length > 0
    ) {
      relationships += `\n**Dependencies (via Spring DI):**\n`;
      javaClass.springDependencies.forEach((dep) => {
        const relatedClass = relatedClasses.find((rc) => rc.name === dep.type);
        const filePath = relatedClass ? relatedClass.filePath : "";
        relationships += `- [${dep.type}](${filePath}) (${dep.annotation})\n`;
      });
    }

    // Inheritance
    if (javaClass.extends) {
      relationships += `\n**Extends:** ${javaClass.extends}\n`;
    }

    if (javaClass.implements && javaClass.implements.length > 0) {
      relationships += `\n**Implements:** ${javaClass.implements.join(", ")}\n`;
    }

    return relationships;
  }

  // Project Overview Enhancement Methods

  private analyzeProjectStructure(structure: ProjectStructure): {
    totalClasses: number;
    springComponents: any[];
    layerDistribution: { [layer: string]: number };
    complexityLevel: "SIMPLE" | "MODERATE" | "COMPLEX";
    recommendedWordCount: number;
  } {
    const totalClasses = structure.classes.length;

    // Identify Spring components
    const springComponents = structure.classes.filter(
      (cls) => cls.springPatterns && cls.springPatterns.length > 0
    );

    // Analyze layer distribution
    const layerDistribution: { [layer: string]: number } = {};
    springComponents.forEach((component) => {
      component.springPatterns?.forEach((pattern: any) => {
        layerDistribution[pattern.layerType] =
          (layerDistribution[pattern.layerType] || 0) + 1;
      });
    });

    // Determine project complexity
    let complexityLevel: "SIMPLE" | "MODERATE" | "COMPLEX";
    let recommendedWordCount: number;

    if (totalClasses <= 10 && springComponents.length <= 5) {
      complexityLevel = "SIMPLE";
      recommendedWordCount = 800;
    } else if (totalClasses <= 30 && springComponents.length <= 15) {
      complexityLevel = "MODERATE";
      recommendedWordCount = 1200;
    } else {
      complexityLevel = "COMPLEX";
      recommendedWordCount = 1800;
    }

    return {
      totalClasses,
      springComponents,
      layerDistribution,
      complexityLevel,
      recommendedWordCount,
    };
  }

  private createProjectOverviewPrompt(
    projectAnalysis: any,
    architectureDiagram: string
  ): string {
    return `
Generate comprehensive Spring-focused project documentation in Markdown format.
Target approximately ${
      projectAnalysis.recommendedWordCount
    } words based on project complexity.

Project Analysis:
- Total Classes: ${projectAnalysis.totalClasses}
- Spring Components: ${projectAnalysis.springComponents.length}
- Complexity Level: ${projectAnalysis.complexityLevel}
- Layer Distribution: ${JSON.stringify(projectAnalysis.layerDistribution)}

IMPORTANT: Your response MUST include ALL sections below in the exact order specified.

## 1. Project Overview
- Clear description of the project's purpose and main functionality
- Target audience and use cases
- Key business value and objectives

## 2. Spring Architecture Analysis
- Identify and explain Spring Boot patterns used
- Describe the layered architecture (Presentation, Business, Data layers)
- Highlight Spring-specific configurations and annotations

## 3. System Architecture Diagram
Include this architecture visualization:
${architectureDiagram}

## 4. Component Layer Analysis
${this.getLayerAnalysisGuidelines(projectAnalysis)}

## 5. Spring Framework Patterns
- List all Spring patterns identified in the project
- Explain how each pattern contributes to the architecture
- Show integration between different Spring components

## 6. Class Relationships & Dependencies
- Create a comprehensive class diagram showing Spring relationships using Mermaid syntax
- Include dependency injection flows
- Show how different layers interact
- ONLY include diagrams that show architectural relationships, NOT database ERDs

## 7. Request Lifecycle & Data Flow
- Walk through a typical request from Controller to Repository
- Explain Spring's request handling mechanism
- Show data transformation between layers

## 8. Technology Stack & Configuration
- List Spring Boot starters and dependencies
- Explain configuration patterns used
- Highlight any custom configurations

## 9. Development Patterns & Best Practices
- Identify coding patterns used in the project
- Highlight Spring best practices being followed
- Suggest areas for improvement

## 10. Getting Started Guide
- Provide practical steps to run and test the application
- Include Maven/Gradle commands (e.g., mvn spring-boot:run)
- List key endpoints or entry points
- Mention configuration requirements
- NO DIAGRAMS in this section - focus on practical instructions

FORMATTING REQUIREMENTS:
- Use exactly the headers shown above (## for section headers)
- Create clickable file links when mentioning classes: [ClassName](file-path)
- Use inline code formatting (\`code\`) for class names, annotations, and technical terms
- Include practical examples and code snippets where helpful
- Balance technical depth with accessibility for different skill levels
- Focus on Spring-specific insights and architectural decisions

DIAGRAM GUIDELINES:
- ONLY use class diagrams to show Spring component relationships in section 6
- DO NOT include Entity Relationship Diagrams (ERDs) unless the project has clear database entities
- DO NOT include any diagrams in the Getting Started Guide section
- Focus on architectural diagrams that help understand Spring component interactions
    `;
  }

  private getLayerAnalysisGuidelines(projectAnalysis: any): string {
    let guidelines = "";

    Object.entries(projectAnalysis.layerDistribution).forEach(
      ([layer, count]) => {
        switch (layer) {
          case "PRESENTATION":
            guidelines += `\n**Presentation Layer (${count} components):**\n`;
            guidelines += "- Controllers handling HTTP requests\n";
            guidelines += "- REST endpoints and request/response mapping\n";
            guidelines += "- Input validation and error handling\n";
            break;
          case "BUSINESS":
            guidelines += `\n**Business Layer (${count} components):**\n`;
            guidelines += "- Service classes containing business logic\n";
            guidelines += "- Transaction management and business rules\n";
            guidelines += "- Integration between different business domains\n";
            break;
          case "DATA":
            guidelines += `\n**Data Layer (${count} components):**\n`;
            guidelines += "- Repository interfaces and implementations\n";
            guidelines += "- Database operations and data access patterns\n";
            guidelines += "- Entity relationships and data modeling\n";
            break;
          case "CONFIGURATION":
            guidelines += `\n**Configuration Layer (${count} components):**\n`;
            guidelines += "- Spring Boot configuration classes\n";
            guidelines += "- Bean definitions and dependency wiring\n";
            guidelines += "- Application properties and profiles\n";
            break;
        }
      }
    );

    return (
      guidelines ||
      "- Analyze the main architectural layers and their responsibilities"
    );
  }

  private generateFallbackArchitectureDiagram(
    structure: ProjectStructure
  ): string {
    const springComponents = structure.classes.filter(
      (cls) => cls.springPatterns && cls.springPatterns.length > 0
    );

    if (springComponents.length === 0) {
      return "```mermaid\ngraph TD\n    A[Java Application] --> B[Main Classes]\n```";
    }

    let diagram = "```mermaid\ngraph TD\n";

    // Group by layer
    const controllers = springComponents.filter((c) =>
      c.springPatterns?.some(
        (p: any) => p.type === "CONTROLLER" || p.type === "REST_CONTROLLER"
      )
    );
    const services = springComponents.filter((c) =>
      c.springPatterns?.some((p: any) => p.type === "SERVICE")
    );
    const repositories = springComponents.filter((c) =>
      c.springPatterns?.some((p: any) => p.type === "REPOSITORY")
    );

    // Add nodes
    controllers.forEach((c, i) => (diagram += `    C${i}[${c.name}]\n`));
    services.forEach((s, i) => (diagram += `    S${i}[${s.name}]\n`));
    repositories.forEach((r, i) => (diagram += `    R${i}[${r.name}]\n`));

    // Add relationships
    if (controllers.length > 0 && services.length > 0) {
      diagram += `    C0 --> S0\n`;
    }
    if (services.length > 0 && repositories.length > 0) {
      diagram += `    S0 --> R0\n`;
    }

    diagram += "```";
    return diagram;
  }

  private createEnhancedStructureSummary(structure: ProjectStructure): string {
    let summary = `Total Classes: ${structure.classes.length}\n\n`;

    // Spring Components Analysis
    const springComponents = structure.classes.filter(
      (cls) => cls.springPatterns && cls.springPatterns.length > 0
    );

    if (springComponents.length > 0) {
      summary += `Spring Components (${springComponents.length}):\n`;

      // Group by Spring pattern type
      const patternGroups: { [pattern: string]: any[] } = {};
      springComponents.forEach((component) => {
        component.springPatterns?.forEach((pattern: any) => {
          if (!patternGroups[pattern.type]) {
            patternGroups[pattern.type] = [];
          }
          patternGroups[pattern.type].push(component);
        });
      });

      Object.entries(patternGroups).forEach(([pattern, components]) => {
        summary += `\n${pattern} (${components.length}):\n`;
        components.forEach((comp) => {
          summary += `- ${comp.name} (${comp.package}) - ${comp.filePath}\n`;
        });
      });
    }

    // Package Distribution
    const packageGroups: { [key: string]: any[] } = {};
    structure.classes.forEach((cls) => {
      const pkg = cls.package || "default";
      if (!packageGroups[pkg]) {
        packageGroups[pkg] = [];
      }
      packageGroups[pkg].push(cls);
    });

    summary += `\nPackage Distribution:\n`;
    Object.entries(packageGroups).forEach(([pkg, classes]) => {
      summary += `- ${pkg}: ${classes.length} classes\n`;
    });

    // Relationships Analysis
    if (structure.relationships && structure.relationships.length > 0) {
      summary += `\nKey Relationships (${structure.relationships.length}):\n`;
      const relationshipCounts = structure.relationships.reduce((acc, rel) => {
        acc[rel.type] = (acc[rel.type] || 0) + 1;
        return acc;
      }, {} as { [key: string]: number });

      Object.entries(relationshipCounts).forEach(([type, count]) => {
        summary += `- ${type}: ${count} connections\n`;
      });
    }

    return summary;
  }

  private initializeModel(): ChatOpenAI {
    if (this.model) {
      return this.model;
    }

    // Get configuration
    const config = vscode.workspace.getConfiguration("codedoc");
    const apiKey = config.get<string>("openaiApiKey");
    const modelName = config.get<string>("openaiModel", "gpt-4");
    // Use higher token limit for detailed project overview documentation
    const maxTokens = config.get<number>("maxTokens", 2000);
    const temperature = config.get<number>("temperature", 0.1);

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
      case "generateProjectOverview":
        return await this.generateProjectOverview(
          context.projectStructure,
          context.userQuery
        );
      case "generateClassDocumentation":
        return await this.generateClassDocumentation(
          context.javaClass,
          context.relatedClasses,
          context.userQuery
        );
      default:
        throw new Error(`Unknown task: ${task}`);
    }
  }

  private async generateProjectOverview(
    structure: ProjectStructure,
    userQuery?: string
  ): Promise<string> {
    try {
      const model = this.initializeModel();

      const projectAnalysis = this.analyzeProjectStructure(structure);

      let architectureDiagram = "";
      try {
        architectureDiagram = await this.visualizationAgent.execute({
          task: "generateArchitectureDiagram",
          projectStructure: structure,
          userQuery: userQuery,
        });
      } catch (error) {
        console.warn("Failed to generate architecture diagram:", error);
        architectureDiagram =
          this.generateFallbackArchitectureDiagram(structure);
      }

      let finalPrompt = this.createProjectOverviewPrompt(
        projectAnalysis,
        architectureDiagram
      );

      if (userQuery && structure) {
        const context = await this.ragService.retrieveEnhancedContext(
          userQuery,
          structure
        );
        const augmentedPrompt = await this.ragService.augmentPrompt(
          finalPrompt,
          context
        );
        finalPrompt = augmentedPrompt;
      }

      const result = await model.invoke(
        finalPrompt +
          `\n\nProject Structure Summary:\n${this.createEnhancedStructureSummary(
            structure
          )}`
      );

      const content =
        typeof result.content === "string" ? result.content : result.toString();

      return content;
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes("API key not configured")
      ) {
        throw error; // Re-throw configuration errors
      }
      throw new Error(
        `Failed to generate project overview: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  private async generateClassDocumentation(
    javaClass: any,
    relatedClasses: any[] = [],
    userQuery?: string
  ): Promise<string> {
    try {
      const model = this.initializeModel();

      const complexity = this.analyzeComplexity(javaClass);
      const springInfo = this.getSpringContextInfo(javaClass);

      const classFileMap = this.createClassFileMap(relatedClasses, javaClass);

      let usageExamples: {
        realExamples: any[];
        syntheticExamples: SyntheticExample[];
      } = {
        realExamples: [],
        syntheticExamples: [],
      };
      try {
        usageExamples = await this.getUsageExamples(javaClass, relatedClasses);
      } catch (error) {
        console.warn(
          "Failed to get usage examples, using empty examples:",
          error
        );
      }

      let relationshipDiagram = "";
      try {
        relationshipDiagram = await this.generateClassRelationshipDiagram(
          javaClass,
          relatedClasses
        );
      } catch (error) {
        console.warn(
          "Failed to generate relationship diagram, using text fallback:",
          error
        );
        relationshipDiagram = this.generateTextBasedRelationships(
          javaClass,
          relatedClasses
        );
      }

      let finalPrompt = this.createAdaptivePrompt(
        complexity,
        springInfo,
        classFileMap,
        usageExamples,
        relationshipDiagram
      );

      if (userQuery && javaClass) {
        const context = {
          relevantClasses: [javaClass],
          relevantMethods: javaClass.methods.map((method: any) => ({
            className: javaClass.name,
            method: method,
          })),
          projectStats: {
            totalClasses: 1,
            totalMethods: javaClass.methods.length,
            totalFields: javaClass.fields.length,
            springComponents: javaClass.annotations.some(
              (ann: string) =>
                ann.includes("@Service") ||
                ann.includes("@Controller") ||
                ann.includes("@Repository") ||
                ann.includes("@Component") ||
                ann.includes("@RestController")
            )
              ? 1
              : 0,
          },
        };
        const augmentedPrompt = await this.ragService.augmentPrompt(
          finalPrompt,
          context
        );
        finalPrompt = augmentedPrompt;
      }

      const promptTemplate = PromptTemplate.fromTemplate(finalPrompt);

      const fieldsStr = javaClass.fields
        .map(
          (f: any) =>
            `- ${f.visibility} ${f.isStatic ? "static " : ""}${f.type} ${
              f.name
            } ${
              f.annotations.length > 0
                ? "(" + f.annotations.join(", ") + ")"
                : ""
            }`
        )
        .join("\n");

      const methodsStr = javaClass.methods
        .map(
          (m: any) =>
            `- ${m.visibility} ${m.isStatic ? "static " : ""}${m.returnType} ${
              m.name
            }(${m.parameters
              .map((p: any) => `${p.type} ${p.name}`)
              .join(", ")}) ${
              m.annotations.length > 0
                ? "(" + m.annotations.join(", ") + ")"
                : ""
            }`
        )
        .join("\n");

      const relatedClassesStr = relatedClasses
        .map((cls: any) => `- ${cls.name} (${cls.package})`)
        .join("\n");

      const springPatternsStr =
        javaClass.springPatterns
          ?.map((p: any) => `${p.type}: ${p.description}`)
          .join(", ") || "None";
      const springDependenciesStr =
        javaClass.springDependencies
          ?.map((d: any) => `${d.fieldName} (${d.type}) - ${d.annotation}`)
          .join(", ") || "None";

      const classFileMapStr = Object.entries(classFileMap)
        .map(([className, filePath]) => `${className}: ${filePath}`)
        .join(", ");

      const chain = promptTemplate.pipe(model).pipe(this.outputParser);
      const result = await chain.invoke({
        className: javaClass.name,
        package: javaClass.package,
        filePath: javaClass.filePath,
        annotations: javaClass.annotations.join(", "),
        extends: javaClass.extends || "None",
        implements: javaClass.implements.join(", ") || "None",
        fields: fieldsStr || "None",
        methods: methodsStr || "None",
        relatedClasses: relatedClassesStr || "None",
        springPatterns: springPatternsStr,
        springDependencies: springDependenciesStr,
        classFileMap: classFileMapStr,
      });

      return result;
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes("API key not configured")
      ) {
        throw error;
      }
      throw new Error(
        `Failed to generate class documentation: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  private async updateMarkdownFile(
    structure: ProjectStructure,
    existing: string,
    relatedFiles: Array<{ path: string; snippet: string }> = [],
    relPath?: string
  ): Promise<string> {
    try {
      console.log(
        `[DocumentationAgent] Starting enhanced stale documentation update for: ${relPath}`
      );

      // Step 1: Advanced class identification with multiple strategies
      const targetClass = await this.identifyTargetClassAdvanced(
        existing,
        structure,
        relatedFiles,
        relPath
      );

      if (targetClass) {
        console.log(
          `[DocumentationAgent] ✅ Identified target class: ${targetClass.name} for ${relPath}`
        );

        // Step 2: Analyze what type of documentation this is
        const docType = this.analyzeDocumentationType(existing, targetClass);
        console.log(`[DocumentationAgent] 📋 Documentation type: ${docType}`);

        // Step 3: Use the appropriate generation strategy
        return await this.regenerateDocumentationIntelligently(
          targetClass,
          structure,
          existing,
          relPath,
          docType
        );
      } else {
        // Enhanced fallback: Try to create documentation from scratch if we can identify related classes
        console.log(
          `[DocumentationAgent] ⚠️ Could not identify target class, attempting smart reconstruction`
        );
        return await this.smartDocumentationReconstruction(
          existing,
          structure,
          relatedFiles,
          relPath
        );
      }
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes("API key not configured")
      ) {
        throw error;
      }
      console.error(
        `[DocumentationAgent] ❌ Failed to update markdown file: ${error}`
      );
      throw new Error(
        `Failed to update markdown file: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  private async identifyTargetClassAdvanced(
    existing: string,
    structure: ProjectStructure,
    relatedFiles: Array<{ path: string; snippet: string }>,
    relPath?: string
  ): Promise<any | null> {
    console.log(
      `[DocumentationAgent] 🔍 Starting advanced class identification...`
    );

    // Strategy 1: Extract from markdown headers and content
    const classFromMarkdown = this.extractClassFromMarkdown(existing);
    if (classFromMarkdown) {
      const targetClass = structure.classes.find(
        (c) =>
          c.name === classFromMarkdown ||
          c.name.endsWith(classFromMarkdown) ||
          classFromMarkdown.includes(c.name)
      );
      if (targetClass) {
        console.log(
          `[DocumentationAgent] ✅ Found class from markdown: ${targetClass.name}`
        );
        return targetClass;
      }
    }

    // Strategy 2: Match by file path
    if (relPath) {
      const classFromPath = this.extractClassFromPath(relPath, structure);
      if (classFromPath) {
        console.log(
          `[DocumentationAgent] ✅ Found class from path: ${classFromPath.name}`
        );
        return classFromPath;
      }
    }

    // Strategy 3: Analyze related files to find the main class
    const classFromRelatedFiles = this.extractClassFromRelatedFiles(
      relatedFiles,
      structure
    );
    if (classFromRelatedFiles) {
      console.log(
        `[DocumentationAgent] ✅ Found class from related files: ${classFromRelatedFiles.name}`
      );
      return classFromRelatedFiles;
    }

    // Strategy 4: Use AI to identify the class from content
    const classFromAI = await this.identifyClassUsingAI(existing, structure);
    if (classFromAI) {
      console.log(
        `[DocumentationAgent] ✅ Found class using AI: ${classFromAI.name}`
      );
      return classFromAI;
    }

    console.log(
      `[DocumentationAgent] ❌ Could not identify target class using any strategy`
    );
    return null;
  }

  private extractClassFromMarkdown(existing: string): string | null {
    const classNamePatterns = [
      /^#\s+(.+?)(?:\s+Class|\s+Documentation)?$/m, // # ClassName or # ClassName Class
      /^##\s+(.+?)(?:\s+Class|\s+Overview)?$/m, // ## ClassName or ## ClassName Class
      /Class:\s*`?([A-Z][a-zA-Z0-9_]+)`?/, // Class: ClassName
      /`([A-Z][a-zA-Z0-9_]+)`\s+class/i, // `ClassName` class
      /\*\*([A-Z][a-zA-Z0-9_]+)\*\*/, // **ClassName**
      /File:\s*.*\/([A-Z][a-zA-Z0-9_]+)\.java/, // File: .../ClassName.java
      /Package:\s*.*\.([A-Z][a-zA-Z0-9_]+)/, // Package: com.example.ClassName
      /^([A-Z][a-zA-Z0-9_]+)\s*$/m, // Standalone ClassName
    ];

    for (const pattern of classNamePatterns) {
      const match = existing.match(pattern);
      if (match) {
        const className = match[1].trim();
        if (className && /^[A-Z][a-zA-Z0-9_]*$/.test(className)) {
          return className;
        }
      }
    }
    return null;
  }

  private extractClassFromPath(
    relPath: string,
    structure: ProjectStructure
  ): any | null {
    // Extract class name from file path
    const pathMatch = relPath.match(
      /([A-Z][a-zA-Z0-9_]+)(?:\.md|\.markdown)?$/
    );
    if (pathMatch) {
      const className = pathMatch[1];
      return structure.classes.find((c) => c.name === className);
    }

    // Try to match by similar file paths
    return structure.classes.find((c) => {
      if (!c.filePath) return false;
      const classFileName = c.filePath.split("/").pop()?.replace(".java", "");
      const docFileName = relPath
        .split("/")
        .pop()
        ?.replace(/\.(md|markdown)$/, "");
      return classFileName === docFileName;
    });
  }

  private extractClassFromRelatedFiles(
    relatedFiles: Array<{ path: string; snippet: string }>,
    structure: ProjectStructure
  ): any | null {
    for (const file of relatedFiles) {
      // Extract class name from Java file path
      const javaClassMatch = file.path.match(/([A-Z][a-zA-Z0-9_]+)\.java$/);
      if (javaClassMatch) {
        const className = javaClassMatch[1];
        const targetClass = structure.classes.find((c) => c.name === className);
        if (targetClass) {
          return targetClass;
        }
      }

      // Extract class name from code snippet
      const classDeclarationMatch = file.snippet.match(
        /(?:public\s+)?class\s+([A-Z][a-zA-Z0-9_]+)/
      );
      if (classDeclarationMatch) {
        const className = classDeclarationMatch[1];
        const targetClass = structure.classes.find((c) => c.name === className);
        if (targetClass) {
          return targetClass;
        }
      }
    }
    return null;
  }

  private async identifyClassUsingAI(
    existing: string,
    structure: ProjectStructure
  ): Promise<any | null> {
    try {
      const model = this.initializeModel();

      const classNames = structure.classes.map((c) => c.name).join(", ");

      const identificationPrompt = `
                Analyze this markdown documentation and identify which Java class it's documenting.
                
                Available classes in the project: ${classNames}
                
                Markdown content:
                ---
                ${existing.substring(0, 1000)}
                ---
                
                Instructions:
                1. Look for class names, method signatures, annotations, or other indicators
                2. Return ONLY the exact class name if you can identify it with high confidence
                3. Return "UNKNOWN" if you cannot identify the class
                4. Do not explain your reasoning, just return the class name or "UNKNOWN"
            `;

      const result = await model.invoke(identificationPrompt);
      const content =
        typeof result.content === "string" ? result.content : result.toString();
      const className = content.trim();

      if (
        className !== "UNKNOWN" &&
        structure.classes.find((c) => c.name === className)
      ) {
        return structure.classes.find((c) => c.name === className);
      }
    } catch (error) {
      console.warn(
        `[DocumentationAgent] AI class identification failed:`,
        error
      );
    }
    return null;
  }

  private analyzeDocumentationType(
    existing: string,
    targetClass: any
  ): "class" | "project" | "mixed" | "unknown" {
    const hasClassSpecificContent =
      /##\s+(Methods?|Fields?|Constructor|Usage|Example)/i.test(existing);
    const hasProjectContent =
      /##\s+(Architecture|Overview|Getting Started|Installation)/i.test(
        existing
      );
    const hasClassName = existing.includes(targetClass.name);

    if (hasClassSpecificContent && hasClassName) return "class";
    if (hasProjectContent) return "project";
    if (hasClassSpecificContent || hasClassName) return "mixed";
    return "unknown";
  }

  private async regenerateDocumentationIntelligently(
    targetClass: any,
    structure: ProjectStructure,
    existingMarkdown: string,
    relPath?: string,
    docType: string = "class"
  ): Promise<string> {
    try {
      console.log(
        `[DocumentationAgent] 🔄 Regenerating ${docType} documentation for: ${targetClass.name}`
      );

      // Get related classes with better context
      const relatedClasses = this.findRelatedClassesIntelligently(
        targetClass,
        structure
      );
      console.log(
        `[DocumentationAgent] 🔗 Found ${relatedClasses.length} related classes`
      );

      // Generate fresh documentation using the full pipeline with enhanced context
      const newDocumentation = await this.generateClassDocumentation(
        targetClass,
        relatedClasses,
        `Update existing documentation for ${targetClass.name}. Focus on accuracy and completeness.`
      );

      // Intelligently preserve user customizations
      const preservedDocumentation =
        await this.preserveUserCustomizationsIntelligently(
          existingMarkdown,
          newDocumentation,
          targetClass,
          relPath
        );

      console.log(
        `[DocumentationAgent] ✅ Successfully regenerated documentation for: ${targetClass.name}`
      );
      return preservedDocumentation;
    } catch (error) {
      console.warn(
        `[DocumentationAgent] ❌ Failed to regenerate documentation for ${targetClass.name}:`,
        error
      );
      // Enhanced fallback
      return await this.enhancedFallbackUpdate(
        existingMarkdown,
        targetClass,
        structure,
        relPath
      );
    }
  }

  private findRelatedClassesIntelligently(
    targetClass: any,
    structure: ProjectStructure
  ): any[] {
    const relatedClasses = new Set<any>();

    // Add classes from Spring dependencies
    if (targetClass.springDependencies) {
      targetClass.springDependencies.forEach((dep: any) => {
        const relatedClass = structure.classes.find((c) => c.name === dep.type);
        if (relatedClass) relatedClasses.add(relatedClass);
      });
    }

    // Add classes from inheritance
    if (targetClass.extends) {
      const parentClass = structure.classes.find(
        (c) => c.name === targetClass.extends
      );
      if (parentClass) relatedClasses.add(parentClass);
    }

    // Add classes from interfaces
    if (targetClass.implements) {
      targetClass.implements.forEach((interfaceName: string) => {
        const interfaceClass = structure.classes.find(
          (c) => c.name === interfaceName
        );
        if (interfaceClass) relatedClasses.add(interfaceClass);
      });
    }

    // Add classes from the same package
    const samePackageClasses = structure.classes
      .filter(
        (c) => c.package === targetClass.package && c.name !== targetClass.name
      )
      .slice(0, 3); // Limit to 3 for performance
    samePackageClasses.forEach((c) => relatedClasses.add(c));

    // Add classes that depend on this class
    const dependentClasses = structure.classes
      .filter((c) =>
        c.springDependencies?.some((dep: any) => dep.type === targetClass.name)
      )
      .slice(0, 2);
    dependentClasses.forEach((c) => relatedClasses.add(c));

    return Array.from(relatedClasses);
  }

  private async preserveUserCustomizationsIntelligently(
    existingMarkdown: string,
    newDocumentation: string,
    targetClass: any,
    relPath?: string
  ): Promise<string> {
    try {
      const model = this.initializeModel();

      // Analyze what user customizations exist
      const customizations = this.analyzeUserCustomizations(existingMarkdown);

      const preservationPrompt = `
                You are an expert technical writer tasked with intelligently merging existing documentation with newly generated documentation.
                
                TARGET CLASS: ${targetClass.name}
                FILE: ${relPath || "unknown"}
                
                EXISTING DOCUMENTATION (contains user customizations):
                ---
                ${existingMarkdown}
                ---

                NEW GENERATED DOCUMENTATION (contains current technical information):
                ---
                ${newDocumentation}
                ---

                DETECTED USER CUSTOMIZATIONS:
                ${customizations
                  .map((c) => `- ${c.type}: ${c.description}`)
                  .join("\n")}

                INTELLIGENT MERGE STRATEGY:
                1. **Use new documentation as foundation** - It has current technical details
                2. **Preserve valuable user content**:
                   - Custom examples and code snippets
                   - Personal insights and explanations
                   - Additional sections (Troubleshooting, Tips, etc.)
                   - Custom links and references
                3. **Update technical accuracy**:
                   - Method signatures and parameters
                   - Annotations and Spring configurations
                   - Dependencies and relationships
                4. **Enhance with user knowledge**:
                   - Merge user examples with generated ones
                   - Keep user's practical insights
                   - Preserve domain-specific explanations

                QUALITY REQUIREMENTS:
                - Maintain professional technical writing style
                - Ensure all code examples are accurate and current
                - Keep Spring Boot focus and architectural context
                - Include proper markdown formatting and links
                - Balance technical depth with readability

                Return the intelligently merged documentation that combines technical accuracy with user insights.
            `;

      const result = await model.invoke(preservationPrompt);
      const content =
        typeof result.content === "string" ? result.content : result.toString();

      return content;
    } catch (error) {
      console.warn(
        `[DocumentationAgent] ❌ Failed to preserve customizations intelligently for ${relPath}:`,
        error
      );
      return newDocumentation;
    }
  }

  private analyzeUserCustomizations(
    existingMarkdown: string
  ): Array<{ type: string; description: string }> {
    const customizations: Array<{ type: string; description: string }> = [];

    // Check for custom sections
    const customSections = existingMarkdown.match(
      /##\s+(Troubleshooting|Tips|Best Practices|Notes|FAQ|Common Issues)/gi
    );
    if (customSections) {
      customizations.push({
        type: "Custom Sections",
        description: `Found custom sections: ${customSections.join(", ")}`,
      });
    }

    // Check for custom code examples
    const codeBlocks = existingMarkdown.match(/```[\s\S]*?```/g);
    if (codeBlocks && codeBlocks.length > 0) {
      customizations.push({
        type: "Code Examples",
        description: `Found ${codeBlocks.length} custom code examples`,
      });
    }

    // Check for custom links
    const customLinks = existingMarkdown.match(/\[([^\]]+)\]\(([^)]+)\)/g);
    if (customLinks && customLinks.length > 0) {
      customizations.push({
        type: "Custom Links",
        description: `Found ${customLinks.length} custom links`,
      });
    }

    // Check for personal notes or comments
    const personalNotes = existingMarkdown.match(
      /(?:Note:|Important:|Warning:|Tip:)/gi
    );
    if (personalNotes) {
      customizations.push({
        type: "Personal Notes",
        description: `Found personal annotations: ${personalNotes.join(", ")}`,
      });
    }

    return customizations;
  }

  private async smartDocumentationReconstruction(
    existing: string,
    structure: ProjectStructure,
    relatedFiles: Array<{ path: string; snippet: string }>,
    relPath?: string
  ): Promise<string> {
    try {
      console.log(
        `[DocumentationAgent] 🔧 Attempting smart reconstruction for: ${relPath}`
      );

      // Try to find the most relevant class from related files
      const candidateClasses = this.findCandidateClasses(
        relatedFiles,
        structure
      );

      if (candidateClasses.length > 0) {
        const bestCandidate = candidateClasses[0];
        console.log(
          `[DocumentationAgent] 🎯 Using best candidate: ${bestCandidate.name}`
        );

        return await this.regenerateDocumentationIntelligently(
          bestCandidate,
          structure,
          existing,
          relPath,
          "mixed"
        );
      } else {
        // Last resort: enhance the existing documentation with AI
        return await this.enhanceExistingDocumentationWithAI(
          existing,
          structure,
          relPath
        );
      }
    } catch (error) {
      console.warn(
        `[DocumentationAgent] ❌ Smart reconstruction failed:`,
        error
      );
      return await this.enhancedFallbackUpdate(
        existing,
        null,
        structure,
        relPath
      );
    }
  }

  private findCandidateClasses(
    relatedFiles: Array<{ path: string; snippet: string }>,
    structure: ProjectStructure
  ): any[] {
    const candidates = new Map<string, { class: any; score: number }>();

    for (const file of relatedFiles) {
      // Score classes based on relevance
      for (const cls of structure.classes) {
        if (!candidates.has(cls.name)) {
          candidates.set(cls.name, { class: cls, score: 0 });
        }

        const candidate = candidates.get(cls.name)!;

        // Score based on file path similarity
        if (file.path.includes(cls.name)) {
          candidate.score += 10;
        }

        // Score based on code content
        if (file.snippet.includes(cls.name)) {
          candidate.score += 5;
        }

        // Score based on package similarity
        if (
          cls.package &&
          file.path.includes(cls.package.replace(/\./g, "/"))
        ) {
          candidate.score += 3;
        }
      }
    }

    return Array.from(candidates.values())
      .sort((a, b) => b.score - a.score)
      .map((c) => c.class)
      .slice(0, 3);
  }

  private async enhanceExistingDocumentationWithAI(
    existing: string,
    structure: ProjectStructure,
    relPath?: string
  ): Promise<string> {
    try {
      const model = this.initializeModel();

      const enhancementPrompt = `
                You are tasked with enhancing existing documentation that may be outdated or incomplete.
                
                EXISTING DOCUMENTATION:
                ---
                ${existing}
                ---
                
                PROJECT CONTEXT:
                - Total classes: ${structure.classes.length}
                - Available classes: ${structure.classes
                  .map((c) => c.name)
                  .slice(0, 10)
                  .join(", ")}${structure.classes.length > 10 ? "..." : ""}
                
                ENHANCEMENT GOALS:
                1. **Improve clarity and completeness** of existing content
                2. **Add missing technical details** where obvious gaps exist
                3. **Enhance code examples** with proper syntax and context
                4. **Improve structure and formatting** for better readability
                5. **Add relevant Spring Boot context** if applicable
                
                GUIDELINES:
                - Preserve the original intent and structure
                - Enhance rather than completely rewrite
                - Add practical examples where helpful
                - Ensure technical accuracy
                - Maintain professional documentation style
                
                Return the enhanced documentation with improvements while preserving the original content's value.
            `;

      const result = await model.invoke(enhancementPrompt);
      const content =
        typeof result.content === "string" ? result.content : result.toString();

      return content;
    } catch (error) {
      console.warn(`[DocumentationAgent] ❌ AI enhancement failed:`, error);
      return existing; // Return original if enhancement fails
    }
  }

  private async enhancedFallbackUpdate(
    existing: string,
    targetClass: any | null,
    structure: ProjectStructure,
    relPath?: string
  ): Promise<string> {
    console.log(
      `[DocumentationAgent] 🔄 Using enhanced fallback update for: ${relPath}`
    );

    try {
      const model = this.initializeModel();

      const fallbackPrompt = `
                Perform a careful update of this documentation, focusing on accuracy and completeness.
                
                EXISTING DOCUMENTATION:
                ---
                ${existing}
                ---
                
                ${
                  targetClass
                    ? `TARGET CLASS: ${targetClass.name}`
                    : "TARGET CLASS: Unknown"
                }
                PROJECT CONTEXT: ${structure.classes.length} classes available
                
                UPDATE STRATEGY:
                1. **Fix obvious errors** in syntax, formatting, or structure
                2. **Improve code examples** with proper formatting and context
                3. **Enhance explanations** where they seem incomplete or unclear
                4. **Add missing sections** if the documentation seems incomplete
                5. **Ensure consistency** in terminology and style
                
                PRESERVATION PRIORITY:
                - Keep all user-written content and examples
                - Preserve the overall structure and flow
                - Maintain the original tone and approach
                - Only update what clearly needs improvement
                
                Return the improved documentation that maintains the original value while fixing issues.
            `;

      const result = await model.invoke(fallbackPrompt);
      const content =
        typeof result.content === "string" ? result.content : result.toString();

      return content;
    } catch (error) {
      console.error(`[DocumentationAgent] ❌ Enhanced fallback failed:`, error);
      return existing; // Return original as last resort
    }
  }

  private createStructureSummary(structure: ProjectStructure): string {
    let summary = `Total Classes: ${structure.classes.length}\n\n`;

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

  private async validateAndFixDiagrams(
    result: string,
    structureSummary: string,
    model: ChatOpenAI
  ): Promise<string> {
    const hasERD =
      result.includes("```mermaid") && result.includes("erDiagram");
    const hasClassDiagram =
      result.includes("```mermaid") && result.includes("classDiagram");

    const hasMalformedERD =
      result.includes("erDiagram") && !result.includes("```mermaid");
    const hasMalformedClassDiagram =
      result.includes("classDiagram") && !result.includes("```mermaid");

    if (hasMalformedERD || hasMalformedClassDiagram) {
      result = this.fixMalformedDiagrams(result);
    }

    const finalHasERD =
      result.includes("```mermaid") && result.includes("erDiagram");
    const finalHasClassDiagram =
      result.includes("```mermaid") && result.includes("classDiagram");

    if (finalHasERD && finalHasClassDiagram) {
      return result;
    }

    let missingDiagrams = "";

    if (!finalHasERD) {
      missingDiagrams += this.generateFallbackERD(structureSummary);
    }

    if (!finalHasClassDiagram) {
      missingDiagrams += this.generateFallbackClassDiagram(structureSummary);
    }

    return result + missingDiagrams;
  }

  private fixMalformedDiagrams(result: string): string {
    if (result.includes("erDiagram") && !result.includes("```mermaid")) {
      const erdRegex = /(erDiagram[\s\S]*?)(?=\n##|\n#|$)/;
      result = result.replace(erdRegex, (match) => {
        return "```mermaid\n" + match.trim() + "\n```";
      });
    }

    if (result.includes("classDiagram") && !result.includes("```mermaid")) {
      const classRegex = /(classDiagram[\s\S]*?)(?=\n##|\n#|$)/;
      result = result.replace(classRegex, (match) => {
        return "```mermaid\n" + match.trim() + "\n```";
      });
    }

    return result;
  }

  private generateFallbackERD(structureSummary: string): string {
    const classMatches = structureSummary.match(/- (\w+):/g);
    const classes = classMatches
      ? classMatches.map((match) => match.replace(/- |:/g, ""))
      : ["Entity1", "Entity2"];

    let erdContent =
      "\n\n## Entity Relationship Diagram (ERD)\n```mermaid\nerDiagram\n";

    classes.slice(0, 3).forEach((className) => {
      erdContent += `    ${className} {\n        string id\n        string name\n    }\n`;
    });

    if (classes.length >= 2) {
      erdContent += `    ${classes[0]} ||--o{ ${classes[1]} : "relates_to"\n`;
    }

    erdContent += "```\n";
    return erdContent;
  }

  private generateFallbackClassDiagram(structureSummary: string): string {
    const classMatches = structureSummary.match(/- (\w+):/g);
    const classes = classMatches
      ? classMatches.map((match) => match.replace(/- |:/g, ""))
      : ["MainClass"];

    let classContent = "\n\n## Class Diagram\n```mermaid\nclassDiagram\n";

    classes.slice(0, 3).forEach((className) => {
      classContent += `    class ${className} {\n        +field: String\n        +method()\n    }\n`;
    });

    if (classes.length >= 2) {
      classContent += `    ${classes[0]} --> ${classes[1]}\n`;
    }

    classContent += "```\n";
    return classContent;
  }
}
