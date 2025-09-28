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
exports.DocumentationAgent = exports.ComplexityLevel = void 0;
const openai_1 = require("@langchain/openai");
const output_parsers_1 = require("@langchain/core/output_parsers");
const prompts_1 = require("@langchain/core/prompts");
const rag_service_1 = require("../service/rag_service");
const synthetic_example_generator_1 = require("../service/synthetic_example_generator");
const visualization_agent_1 = require("./visualization_agent");
const vscode = __importStar(require("vscode"));
// Complexity analysis interfaces
var ComplexityLevel;
(function (ComplexityLevel) {
    ComplexityLevel["SIMPLE"] = "simple";
    ComplexityLevel["MODERATE"] = "moderate";
    ComplexityLevel["COMPLEX"] = "complex"; // 16+ methods, 800-1500 words
})(ComplexityLevel || (exports.ComplexityLevel = ComplexityLevel = {}));
class DocumentationAgent {
    model = null;
    outputParser;
    ragService;
    syntheticGenerator;
    visualizationAgent;
    constructor() {
        this.outputParser = new output_parsers_1.StringOutputParser();
        this.ragService = new rag_service_1.RAGService();
        this.syntheticGenerator = new synthetic_example_generator_1.SyntheticExampleGenerator();
        this.visualizationAgent = new visualization_agent_1.VisualizationAgent();
        // We don't initialize the model here to avoid requiring API key during extension activation
    }
    // Complexity Analysis Methods
    analyzeComplexity(javaClass) {
        const methodCount = javaClass.methods?.length || 0;
        const dependencyCount = javaClass.springDependencies?.length || 0;
        const springPatternCount = javaClass.springPatterns?.length || 0;
        // Determine complexity level based on method count and other factors
        let complexity;
        let recommendedWordCount;
        if (methodCount <= 5 && dependencyCount <= 2) {
            complexity = ComplexityLevel.SIMPLE;
            recommendedWordCount = 300; // 200-400 range
        }
        else if (methodCount <= 15 && dependencyCount <= 5) {
            complexity = ComplexityLevel.MODERATE;
            recommendedWordCount = 600; // 400-800 range
        }
        else {
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
            recommendedWordCount
        };
    }
    getSpringContextInfo(javaClass) {
        if (!javaClass.springPatterns || javaClass.springPatterns.length === 0) {
            // Fallback: check for Spring annotations in the old format
            const hasSpringAnnotations = javaClass.annotations?.some(ann => ann.includes('@Service') || ann.includes('@Controller') ||
                ann.includes('@Repository') || ann.includes('@Component') ||
                ann.includes('@RestController'));
            if (hasSpringAnnotations) {
                return "This is a Spring component based on its annotations.";
            }
            return "This is a regular Java class.";
        }
        const patterns = javaClass.springPatterns.map(p => p.description).join(", ");
        return `This is a Spring component: ${patterns}`;
    }
    createClassFileMap(relatedClasses, currentClass) {
        const classFileMap = {};
        // Add current class
        classFileMap[currentClass.name] = currentClass.filePath;
        // Add related classes
        for (const relatedClass of relatedClasses) {
            classFileMap[relatedClass.name] = relatedClass.filePath;
        }
        return classFileMap;
    }
    async getUsageExamples(javaClass, relatedClasses) {
        // Try to get real usage examples
        const projectStructure = { classes: [javaClass, ...relatedClasses], relationships: [] };
        const realExamples = await this.ragService.retrieveClassUsagePatterns(javaClass.name, projectStructure);
        // Generate synthetic examples as fallback
        const syntheticExamples = this.syntheticGenerator.generateClassUsageExamples(javaClass, javaClass.springPatterns || []);
        return { realExamples, syntheticExamples };
    }
    createAdaptivePrompt(complexity, springInfo, classFileMap, usageExamples, relationshipDiagram) {
        const basePrompt = `
                Generate comprehensive, Spring-focused documentation for this Java class in Markdown format.
                Target approximately ${complexity.recommendedWordCount} words based on class complexity.
                
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
    getMethodDocumentationGuidelines(complexity) {
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
    getUsageExamplesSection(usageExamples) {
        let section = "";
        if (usageExamples.realExamples.length > 0) {
            section += "- PRIORITY: Use these real usage examples from the codebase:\n";
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
    async generateClassRelationshipDiagram(javaClass, relatedClasses) {
        try {
            const diagramResult = await this.visualizationAgent.execute({
                task: 'generateClassRelationshipDiagram',
                targetClass: javaClass,
                relatedClasses: relatedClasses,
                springContext: javaClass.springPatterns
            });
            return diagramResult;
        }
        catch (error) {
            console.error('Failed to generate class relationship diagram:', error);
            // Return a simple text-based relationship description as fallback
            return this.generateTextBasedRelationships(javaClass, relatedClasses);
        }
    }
    generateTextBasedRelationships(javaClass, relatedClasses) {
        let relationships = `## Class Relationships\n\n`;
        relationships += `**${javaClass.name}** relationships:\n`;
        // Spring dependencies
        if (javaClass.springDependencies && javaClass.springDependencies.length > 0) {
            relationships += `\n**Dependencies (via Spring DI):**\n`;
            javaClass.springDependencies.forEach(dep => {
                const relatedClass = relatedClasses.find(rc => rc.name === dep.type);
                const filePath = relatedClass ? relatedClass.filePath : '';
                relationships += `- [${dep.type}](${filePath}) (${dep.annotation})\n`;
            });
        }
        // Inheritance
        if (javaClass.extends) {
            relationships += `\n**Extends:** ${javaClass.extends}\n`;
        }
        if (javaClass.implements && javaClass.implements.length > 0) {
            relationships += `\n**Implements:** ${javaClass.implements.join(', ')}\n`;
        }
        return relationships;
    }
    // Project Overview Enhancement Methods
    analyzeProjectStructure(structure) {
        const totalClasses = structure.classes.length;
        // Identify Spring components
        const springComponents = structure.classes.filter(cls => cls.springPatterns && cls.springPatterns.length > 0);
        // Analyze layer distribution
        const layerDistribution = {};
        springComponents.forEach(component => {
            component.springPatterns?.forEach((pattern) => {
                layerDistribution[pattern.layerType] = (layerDistribution[pattern.layerType] || 0) + 1;
            });
        });
        // Determine project complexity
        let complexityLevel;
        let recommendedWordCount;
        if (totalClasses <= 10 && springComponents.length <= 5) {
            complexityLevel = 'SIMPLE';
            recommendedWordCount = 800;
        }
        else if (totalClasses <= 30 && springComponents.length <= 15) {
            complexityLevel = 'MODERATE';
            recommendedWordCount = 1200;
        }
        else {
            complexityLevel = 'COMPLEX';
            recommendedWordCount = 1800;
        }
        return {
            totalClasses,
            springComponents,
            layerDistribution,
            complexityLevel,
            recommendedWordCount
        };
    }
    createProjectOverviewPrompt(projectAnalysis, architectureDiagram) {
        return `
Generate comprehensive Spring-focused project documentation in Markdown format.
Target approximately ${projectAnalysis.recommendedWordCount} words based on project complexity.

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
    getLayerAnalysisGuidelines(projectAnalysis) {
        let guidelines = "";
        Object.entries(projectAnalysis.layerDistribution).forEach(([layer, count]) => {
            switch (layer) {
                case 'PRESENTATION':
                    guidelines += `\n**Presentation Layer (${count} components):**\n`;
                    guidelines += "- Controllers handling HTTP requests\n";
                    guidelines += "- REST endpoints and request/response mapping\n";
                    guidelines += "- Input validation and error handling\n";
                    break;
                case 'BUSINESS':
                    guidelines += `\n**Business Layer (${count} components):**\n`;
                    guidelines += "- Service classes containing business logic\n";
                    guidelines += "- Transaction management and business rules\n";
                    guidelines += "- Integration between different business domains\n";
                    break;
                case 'DATA':
                    guidelines += `\n**Data Layer (${count} components):**\n`;
                    guidelines += "- Repository interfaces and implementations\n";
                    guidelines += "- Database operations and data access patterns\n";
                    guidelines += "- Entity relationships and data modeling\n";
                    break;
                case 'CONFIGURATION':
                    guidelines += `\n**Configuration Layer (${count} components):**\n`;
                    guidelines += "- Spring Boot configuration classes\n";
                    guidelines += "- Bean definitions and dependency wiring\n";
                    guidelines += "- Application properties and profiles\n";
                    break;
            }
        });
        return guidelines || "- Analyze the main architectural layers and their responsibilities";
    }
    generateFallbackArchitectureDiagram(structure) {
        const springComponents = structure.classes.filter(cls => cls.springPatterns && cls.springPatterns.length > 0);
        if (springComponents.length === 0) {
            return "```mermaid\ngraph TD\n    A[Java Application] --> B[Main Classes]\n```";
        }
        let diagram = "```mermaid\ngraph TD\n";
        // Group by layer
        const controllers = springComponents.filter(c => c.springPatterns?.some((p) => p.type === 'CONTROLLER' || p.type === 'REST_CONTROLLER'));
        const services = springComponents.filter(c => c.springPatterns?.some((p) => p.type === 'SERVICE'));
        const repositories = springComponents.filter(c => c.springPatterns?.some((p) => p.type === 'REPOSITORY'));
        // Add nodes
        controllers.forEach((c, i) => diagram += `    C${i}[${c.name}]\n`);
        services.forEach((s, i) => diagram += `    S${i}[${s.name}]\n`);
        repositories.forEach((r, i) => diagram += `    R${i}[${r.name}]\n`);
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
    createEnhancedStructureSummary(structure) {
        let summary = `Total Classes: ${structure.classes.length}\n\n`;
        // Spring Components Analysis
        const springComponents = structure.classes.filter(cls => cls.springPatterns && cls.springPatterns.length > 0);
        if (springComponents.length > 0) {
            summary += `Spring Components (${springComponents.length}):\n`;
            // Group by Spring pattern type
            const patternGroups = {};
            springComponents.forEach(component => {
                component.springPatterns?.forEach((pattern) => {
                    if (!patternGroups[pattern.type]) {
                        patternGroups[pattern.type] = [];
                    }
                    patternGroups[pattern.type].push(component);
                });
            });
            Object.entries(patternGroups).forEach(([pattern, components]) => {
                summary += `\n${pattern} (${components.length}):\n`;
                components.forEach(comp => {
                    summary += `- ${comp.name} (${comp.package}) - ${comp.filePath}\n`;
                });
            });
        }
        // Package Distribution
        const packageGroups = {};
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
            }, {});
            Object.entries(relationshipCounts).forEach(([type, count]) => {
                summary += `- ${type}: ${count} connections\n`;
            });
        }
        return summary;
    }
    initializeModel() {
        if (this.model) {
            return this.model;
        }
        // Get configuration
        const config = vscode.workspace.getConfiguration("codedoc");
        const apiKey = config.get("openaiApiKey");
        const modelName = config.get("openaiModel", "gpt-4");
        // Use higher token limit for detailed project overview documentation
        const maxTokens = config.get("maxTokens", 2000);
        const temperature = config.get("temperature", 0.1);
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
            case "generateProjectOverview":
                return await this.generateProjectOverview(context.projectStructure, context.userQuery);
            case "generateClassDocumentation":
                return await this.generateClassDocumentation(context.javaClass, context.relatedClasses, context.userQuery);
            default:
                throw new Error(`Unknown task: ${task}`);
        }
    }
    async generateProjectOverview(structure, userQuery) {
        try {
            const model = this.initializeModel();
            const projectAnalysis = this.analyzeProjectStructure(structure);
            let architectureDiagram = '';
            try {
                architectureDiagram = await this.visualizationAgent.execute({
                    task: 'generateArchitectureDiagram',
                    projectStructure: structure,
                    userQuery: userQuery
                });
            }
            catch (error) {
                console.warn('Failed to generate architecture diagram:', error);
                architectureDiagram = this.generateFallbackArchitectureDiagram(structure);
            }
            let finalPrompt = this.createProjectOverviewPrompt(projectAnalysis, architectureDiagram);
            if (userQuery && structure) {
                const context = await this.ragService.retrieveEnhancedContext(userQuery, structure);
                const augmentedPrompt = await this.ragService.augmentPrompt(finalPrompt, context);
                finalPrompt = augmentedPrompt;
            }
            const result = await model.invoke(finalPrompt + `\n\nProject Structure Summary:\n${this.createEnhancedStructureSummary(structure)}`);
            const content = typeof result.content === 'string' ? result.content : result.toString();
            return content;
        }
        catch (error) {
            if (error instanceof Error &&
                error.message.includes("API key not configured")) {
                throw error; // Re-throw configuration errors
            }
            throw new Error(`Failed to generate project overview: ${error instanceof Error ? error.message : "Unknown error"}`);
        }
    }
    async generateClassDocumentation(javaClass, relatedClasses = [], userQuery) {
        try {
            const model = this.initializeModel();
            const complexity = this.analyzeComplexity(javaClass);
            const springInfo = this.getSpringContextInfo(javaClass);
            const classFileMap = this.createClassFileMap(relatedClasses, javaClass);
            let usageExamples = {
                realExamples: [],
                syntheticExamples: []
            };
            try {
                usageExamples = await this.getUsageExamples(javaClass, relatedClasses);
            }
            catch (error) {
                console.warn('Failed to get usage examples, using empty examples:', error);
            }
            let relationshipDiagram = '';
            try {
                relationshipDiagram = await this.generateClassRelationshipDiagram(javaClass, relatedClasses);
            }
            catch (error) {
                console.warn('Failed to generate relationship diagram, using text fallback:', error);
                relationshipDiagram = this.generateTextBasedRelationships(javaClass, relatedClasses);
            }
            let finalPrompt = this.createAdaptivePrompt(complexity, springInfo, classFileMap, usageExamples, relationshipDiagram);
            if (userQuery && javaClass) {
                const context = {
                    relevantClasses: [javaClass],
                    relevantMethods: javaClass.methods.map((method) => ({
                        className: javaClass.name,
                        method: method,
                    })),
                    projectStats: {
                        totalClasses: 1,
                        totalMethods: javaClass.methods.length,
                        totalFields: javaClass.fields.length,
                        springComponents: javaClass.annotations.some((ann) => ann.includes("@Service") ||
                            ann.includes("@Controller") ||
                            ann.includes("@Repository") ||
                            ann.includes("@Component") ||
                            ann.includes("@RestController"))
                            ? 1
                            : 0,
                    },
                };
                const augmentedPrompt = await this.ragService.augmentPrompt(finalPrompt, context);
                finalPrompt = augmentedPrompt;
            }
            const promptTemplate = prompts_1.PromptTemplate.fromTemplate(finalPrompt);
            const fieldsStr = javaClass.fields
                .map((f) => `- ${f.visibility} ${f.isStatic ? "static " : ""}${f.type} ${f.name} ${f.annotations.length > 0
                ? "(" + f.annotations.join(", ") + ")"
                : ""}`)
                .join("\n");
            const methodsStr = javaClass.methods
                .map((m) => `- ${m.visibility} ${m.isStatic ? "static " : ""}${m.returnType} ${m.name}(${m.parameters
                .map((p) => `${p.type} ${p.name}`)
                .join(", ")}) ${m.annotations.length > 0
                ? "(" + m.annotations.join(", ") + ")"
                : ""}`)
                .join("\n");
            const relatedClassesStr = relatedClasses
                .map((cls) => `- ${cls.name} (${cls.package})`)
                .join("\n");
            const springPatternsStr = javaClass.springPatterns?.map((p) => `${p.type}: ${p.description}`).join(", ") || "None";
            const springDependenciesStr = javaClass.springDependencies?.map((d) => `${d.fieldName} (${d.type}) - ${d.annotation}`).join(", ") || "None";
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
                classFileMap: classFileMapStr
            });
            return result;
        }
        catch (error) {
            if (error instanceof Error &&
                error.message.includes("API key not configured")) {
                throw error;
            }
            throw new Error(`Failed to generate class documentation: ${error instanceof Error ? error.message : "Unknown error"}`);
        }
    }
    async updateMarkdownFile(structure, existing, relatedFiles = [], relPath) {
        try {
            const model = this.initializeModel();
            let finalPrompt = `
                You are given an existing markdown file and several related code snippets. Update the markdown only where it is inconsistent with the code. Preserve headings and formatting when possible. Keep changes minimal and focused.

                File path: ${relPath || 'unknown'}
                Existing markdown (begin):\n{existing}\nExisting markdown (end)

                Related code snippets (begin):\n{snippets}\nRelated code snippets (end)

                Guidelines:
                1. Only modify sections that are outdated or incorrect relative to the code.
                2. Preserve examples and formatting where possible; update only necessary descriptions.
                3. If the markdown is missing a short usage example, you may add a concise example based on the code.
                4. Return the full updated markdown content only.
            `;
            const snippets = relatedFiles.map(r => `---\nfile: ${r.path}\n\n${r.snippet}\n---`).join('\n');
            const promptTemplate = prompts_1.PromptTemplate.fromTemplate(finalPrompt);
            const chain = promptTemplate.pipe(model).pipe(this.outputParser);
            const result = await chain.invoke({ existing: existing.slice(0, 3000), snippets });
            if (typeof result === 'string') {
                let s = result.trim();
                const fullFence = s.match(/^```[^\n]*\n([\s\S]*)\n```$/);
                if (fullFence && fullFence[1]) {
                    return fullFence[1].trim();
                }
                s = s.replace(/^```[^\n]*\n/, '');
                s = s.replace(/\n```\s*$/, '');
                return s.trim();
            }
            return result;
        }
        catch (error) {
            if (error instanceof Error && error.message.includes('API key not configured')) {
                throw error;
            }
            throw new Error(`Failed to update markdown file: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
    async validateAndFixDiagrams(result, structureSummary, model) {
        const hasERD = result.includes("```mermaid") && result.includes("erDiagram");
        const hasClassDiagram = result.includes("```mermaid") && result.includes("classDiagram");
        const hasMalformedERD = result.includes("erDiagram") && !result.includes("```mermaid");
        const hasMalformedClassDiagram = result.includes("classDiagram") && !result.includes("```mermaid");
        if (hasMalformedERD || hasMalformedClassDiagram) {
            result = this.fixMalformedDiagrams(result);
        }
        const finalHasERD = result.includes("```mermaid") && result.includes("erDiagram");
        const finalHasClassDiagram = result.includes("```mermaid") && result.includes("classDiagram");
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
    fixMalformedDiagrams(result) {
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
    generateFallbackERD(structureSummary) {
        const classMatches = structureSummary.match(/- (\w+):/g);
        const classes = classMatches
            ? classMatches.map((match) => match.replace(/- |:/g, ""))
            : ["Entity1", "Entity2"];
        let erdContent = "\n\n## Entity Relationship Diagram (ERD)\n```mermaid\nerDiagram\n";
        classes.slice(0, 3).forEach((className) => {
            erdContent += `    ${className} {\n        string id\n        string name\n    }\n`;
        });
        if (classes.length >= 2) {
            erdContent += `    ${classes[0]} ||--o{ ${classes[1]} : "relates_to"\n`;
        }
        erdContent += "```\n";
        return erdContent;
    }
    generateFallbackClassDiagram(structureSummary) {
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
exports.DocumentationAgent = DocumentationAgent;
//# sourceMappingURL=documentation_agen.js.map