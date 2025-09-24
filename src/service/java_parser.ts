import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { sanitizeFilePath, readFileSafely, isFileAccessible } from './file_utils';

export interface JavaClass {
    name: string;
    filePath: string;
    package: string;
    imports: string[];
    methods: JavaMethod[];
    fields: JavaField[];
    annotations: string[];
    extends?: string;
    implements: string[];
    dependencies: string[];
    isController?: boolean;
    endpoints?: SpringEndpoint[];
    // New Spring-specific properties
    springAnnotations: SpringAnnotation[];
    springPatterns: SpringPattern[];
    springDependencies: SpringDependency[];
}

export interface JavaMethod {
    name: string;
    returnType: string;
    parameters: JavaParameter[];
    annotations: string[];
    visibility: string;
    isStatic: boolean;
    calls: string[];
    endpoint?: SpringEndpoint;
}

export interface JavaParameter {
    name: string;
    type: string;
}

export interface JavaField {
    name: string;
    type: string;
    visibility: string;
    isStatic: boolean;
    annotations: string[];
}

export interface ProjectStructure {
    classes: JavaClass[];
    relationships: CodeRelationship[];
}

export interface CodeRelationship {
    from: string;
    to: string;
    type: 'extends' | 'implements' | 'calls' | 'uses' | 'injects';
    method?: string;
}

export interface SpringEndpoint {
    httpMethod: string;
    path: string;
    produces?: string;
    consumes?: string;
    description?: string;
}

// New Spring-specific interfaces
export interface SpringAnnotation {
    name: string;
    parameters?: { [key: string]: string };
}

export interface SpringPattern {
    type: 'CONTROLLER' | 'SERVICE' | 'REPOSITORY' | 'COMPONENT' | 'CONFIGURATION' | 'REST_CONTROLLER';
    description: string;
    layerType: 'PRESENTATION' | 'BUSINESS' | 'DATA' | 'CONFIGURATION' | 'COMPONENT';
}

export interface SpringDependency {
    fieldName: string;
    type: string;
    injectionType: 'FIELD' | 'CONSTRUCTOR' | 'SETTER';
    annotation: string;
}

export class JavaParser {
    
    public async parseWorkspace(): Promise<ProjectStructure> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            throw new Error('No workspace folder found');
        }

        const javaFiles = await this.findJavaFiles(workspaceFolder.uri.fsPath);
        console.log('Found Java files:', javaFiles);
        const classes: JavaClass[] = [];
        
        for (const filePath of javaFiles) {
            try {
                const javaClass = await this.parseJavaFile(filePath);
                if (javaClass) {
                    classes.push(javaClass);
                }
            } catch (error) {
                console.error(`Error parsing ${filePath}:`, error);
            }
        }
        console.log('Parsed classes:', classes.map(cls => cls.name));

        const relationships = this.extractRelationships(classes);
        const result = { classes, relationships };
        console.log('Project structure:', result);
        return result;
    }

    private async findJavaFiles(rootPath: string): Promise<string[]> {
        const javaFiles: string[] = [];
        const searchPattern = new vscode.RelativePattern(rootPath, '**/*.java');
        const files = await vscode.workspace.findFiles(searchPattern);
        
        return files.map(file => file.fsPath);
    }

    private async parseJavaFile(filePath: string): Promise<JavaClass | null> {
        console.log('Parsing Java file:', filePath);
        
        // Sanitize the file path to prevent issues with .git extensions
        const sanitizedPath = sanitizeFilePath(filePath);
        
        // Check if file is accessible
        if (!isFileAccessible(sanitizedPath)) {
            console.warn('File not accessible:', sanitizedPath);
            return null;
        }
        
        try {
            const content = readFileSafely(sanitizedPath);
            if (content === null) {
                console.error('Failed to read file:', sanitizedPath);
                return null;
            }
            
            const fileName = path.basename(sanitizedPath, '.java');
            const packageMatch = content.match(/package\s+([\w.]+);/);
            const packageName = packageMatch ? packageMatch[1] : '';
            const imports = this.extractImports(content);
            const classMatch = content.match(/(?:public\s+)?(?:abstract\s+)?(?:final\s+)?class\s+(\w+)(?:\s+extends\s+(\w+))?(?:\s+implements\s+([\w\s,]+))?/);
            
            if (!classMatch) {
                console.log('No class found in file:', sanitizedPath);
                return null;
            }

            const className = classMatch[1];
            console.log('Found class:', className, 'in file:', sanitizedPath);
            const extendsClass = classMatch[2];
            const implementsClasses = classMatch[3] ? classMatch[3].split(',').map(s => s.trim()) : [];
            
            const methods = this.extractMethods(content);
            const fields = this.extractFields(content);
            const annotations = this.extractClassAnnotations(content);
            const dependencies = this.extractDependencies(content, imports);
            const isController = this.isSpringController(annotations);
            const baseMapping = this.extractBaseMapping(annotations);
            const endpoints = isController ? this.extractEndpoints(methods, baseMapping) : [];

            // Analyze Spring patterns
            const springAnnotations = this.extractSpringAnnotations(annotations);
            const springPatterns = this.detectSpringPatterns(springAnnotations, className);
            const springDependencies = this.extractSpringDependencies(fields, content);

            const result = {
                name: className,
                filePath: sanitizedPath, // Use sanitized path
                package: packageName,
                imports,
                methods,
                fields,
                annotations,
                extends: extendsClass,
                implements: implementsClasses,
                dependencies,
                isController,
                endpoints,
                springAnnotations,
                springPatterns,
                springDependencies
            };
            console.log('Parsed class result:', result);
            return result;
        } catch (error) {
            console.error(`Error parsing ${sanitizedPath}:`, error);
            // Log additional information about the file path
            console.error('File path details:', {
                originalPath: filePath,
                sanitizedPath: sanitizedPath,
                exists: fs.existsSync(sanitizedPath),
                stat: fs.existsSync(sanitizedPath) ? fs.lstatSync(sanitizedPath) : 'File does not exist'
            });
            return null;
        }
    }

    private extractImports(content: string): string[] {
        const importRegex = /import\s+((?:static\s+)?[\w.]+(?:\.\*)?);/g;
        const imports: string[] = [];
        let match;
        
        while ((match = importRegex.exec(content)) !== null) {
            imports.push(match[1]);
        }
        
        return imports;
    }

    private extractMethods(content: string): JavaMethod[] {
        // Improved regex pattern to better capture method annotations and signatures
        const methodRegex = /(?:@[a-zA-Z_][a-zA-Z0-9_]*(?:\([^)]*\))?\s*)*(?:(public|private|protected)\s+)?(?:(static)\s+)?(?:(final)\s+)?([a-zA-Z_][a-zA-Z0-9_.<>[\]]*)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(([^)]*)\)\s*(?:throws\s+[^{;]+)?\s*\{/g;
        const methods: JavaMethod[] = [];
        let match;

        while ((match = methodRegex.exec(content)) !== null) {
            const visibility = match[1] || 'package';
            const isStatic = !!match[2];
            const returnType = match[4];
            const methodName = match[5];
            const parametersStr = match[6];

            const parameters = this.parseParameters(parametersStr);
            const annotations = this.extractMethodAnnotations(content, match.index);
            const calls = this.extractMethodCalls(content, match.index);
            const endpoint = this.extractEndpointFromMethod(annotations, methodName);

            methods.push({
                name: methodName,
                returnType,
                parameters,
                annotations,
                visibility,
                isStatic,
                calls,
                endpoint
            });
        }

        return methods;
    }

    private extractFields(content: string): JavaField[] {
        const fieldRegex = /(?:@\w+(?:\([^)]*\))?\s*)*(?:(public|private|protected)\s+)?(?:(static)\s+)?(?:(final)\s+)?(\w+(?:<[^>]+>)?|\w+\[\])\s+(\w+)(?:\s*=\s*[^;]+)?;/g;
        const fields: JavaField[] = [];
        let match;

        while ((match = fieldRegex.exec(content)) !== null) {
            const visibility = match[1] || 'package';
            const isStatic = !!match[2];
            const type = match[4];
            const name = match[5];
            const annotations = this.extractFieldAnnotations(content, match.index);

            fields.push({
                name,
                type,
                visibility,
                isStatic,
                annotations
            });
        }

        return fields;
    }

    private parseParameters(parametersStr: string): JavaParameter[] {
        if (!parametersStr.trim()) {
            return [];
        }


        return parametersStr.split(',').map(param => {
            const parts = param.trim().split(/\s+/);
            const type = parts[parts.length - 2] || 'Object';
            const name = parts[parts.length - 1];
            return { name, type };
        });
    }

    private extractClassAnnotations(content: string): string[] {
        const classLineMatch = content.match(/(?:@\w+(?:\([^)]*\))?\s*)*(?:public\s+)?(?:abstract\s+)?(?:final\s+)?class/);
        if (!classLineMatch) return [];

        const beforeClass = content.substring(0, classLineMatch.index);
        const annotationRegex = /@(\w+)(?:\([^)]*\))?/g;
        const annotations: string[] = [];
        let match;

        while ((match = annotationRegex.exec(beforeClass)) !== null) {
            annotations.push(match[0]);
        }

        return annotations;
    }

    private extractMethodAnnotations(content: string, methodIndex: number): string[] {
        // Look backwards from the method index to find all annotations
        const beforeMethod = content.substring(Math.max(0, methodIndex - 1000), methodIndex);
        const lines = beforeMethod.split('\n');
        const annotations: string[] = [];

        // Go through lines in reverse order to collect annotations
        for (let i = lines.length - 1; i >= 0; i--) {
            const line = lines[i].trim();
            
            // If we encounter a non-annotation, non-comment, non-empty line, stop
            if (line && !line.startsWith('@') && !line.startsWith('//') && !line.startsWith('/*') && !line.startsWith('*')) {
                break;
            }
            
            // If it's an annotation, add it to our list
            if (line.startsWith('@')) {
                annotations.unshift(line);
            }
        }

        return annotations;
    }

    private extractFieldAnnotations(content: string, fieldIndex: number): string[] {
        const beforeField = content.substring(Math.max(0, fieldIndex - 200), fieldIndex);
        const annotationRegex = /@(\w+)(?:\([^)]*\))?/g;
        const annotations: string[] = [];
        let match;

        while ((match = annotationRegex.exec(beforeField)) !== null) {
            annotations.push(match[0]);
        }

        return annotations;
    }

    private extractMethodCalls(content: string, methodStart: number): string[] {
        const methodEnd = this.findMethodEnd(content, methodStart);
        const methodBody = content.substring(methodStart, methodEnd);
        
        const callRegex = /(\w+)\s*\(/g;
        const calls: string[] = [];
        let match;

        while ((match = callRegex.exec(methodBody)) !== null) {
            const methodName = match[1];
            if (methodName !== 'if' && methodName !== 'for' && methodName !== 'while' && methodName !== 'switch') {
                calls.push(methodName);
            }
        }

        return [...new Set(calls)];
    }

    private findMethodEnd(content: string, start: number): number {
        let braceCount = 0;
        let inMethod = false;

        for (let i = start; i < content.length; i++) {
            const char = content[i];
            if (char === '{') {
                braceCount++;
                inMethod = true;
            } else if (char === '}') {
                braceCount--;
                if (inMethod && braceCount === 0) {
                    return i;
                }
            }
        }

        return content.length;
    }

    private extractDependencies(content: string, imports: string[]): string[] {
        const dependencies: string[] = [];
        
        // 1. Extract Spring annotations
        const springAnnotations = ['@Autowired', '@Inject', '@Resource', '@Service', '@Repository', '@Component', '@Controller', '@RestController'];
        
        for (const annotation of springAnnotations) {
            if (content.includes(annotation)) {
                dependencies.push(annotation.substring(1));
            }
        }
        
        // 2. Extract field injection types
        const fieldInjectionRegex = /@(?:Autowired|Inject|Resource)\s*(?:private|public|protected)?\s+(\w+)/g;
        let match;
        while ((match = fieldInjectionRegex.exec(content)) !== null) {
            dependencies.push(match[1]);
        }
        
        // 3. Extract field types (potential dependencies)
        const fieldRegex = /(?:private|public|protected)?\s+(\w+(?:<[^>]+>)?)\s+\w+\s*;/g;
        while ((match = fieldRegex.exec(content)) !== null) {
            const fieldType = match[1];
            // Only add non-primitive types
            if (!this.isPrimitiveType(fieldType)) {
                // Remove generics if present
                const simpleType = fieldType.replace(/<.*>/, '');
                dependencies.push(simpleType);
            }
        }
        
        // 4. Extract method parameter types
        const methodParamRegex = /\w+\s*\([^)]*\)\s*\{/g;
        const methodMatches = content.match(methodParamRegex) || [];
        for (const methodSignature of methodMatches) {
            // Extract parameters from method signature
            const paramMatch = methodSignature.match(/\(([^)]*)\)/);
            if (paramMatch && paramMatch[1]) {
                const params = paramMatch[1].split(',');
                for (const param of params) {
                    const paramParts = param.trim().split(/\s+/);
                    if (paramParts.length >= 2) {
                        const paramType = paramParts[paramParts.length - 2];
                        if (!this.isPrimitiveType(paramType)) {
                            // Remove generics if present
                            const simpleType = paramType.replace(/<.*>/, '');
                            dependencies.push(simpleType);
                        }
                    }
                }
            }
        }
        
        // 5. Extract method return types
        const methodReturnRegex = /(?:public|private|protected)?\s+(\w+(?:<[^>]+>)?)\s+\w+\s*\([^)]*\)\s*\{/g;
        while ((match = methodReturnRegex.exec(content)) !== null) {
            const returnType = match[1];
            // Only add non-primitive types and not void
            if (returnType !== 'void' && !this.isPrimitiveType(returnType)) {
                // Remove generics if present
                const simpleType = returnType.replace(/<.*>/, '');
                dependencies.push(simpleType);
            }
        }
        
        // 6. Extract types from imports (for fully qualified names)
        for (const imp of imports) {
            // Skip static imports and wildcards
            if (!imp.startsWith('static') && !imp.endsWith('*')) {
                const parts = imp.split('.');
                const className = parts[parts.length - 1];
                dependencies.push(className);
                // Also add the full import for matching
                dependencies.push(imp);
            }
        }

        return [...new Set(dependencies)];
    }
    
    private isPrimitiveType(type: string): boolean {
        const primitives = ['boolean', 'byte', 'char', 'short', 'int', 'long', 'float', 'double', 'void'];
        const wrappers = ['Boolean', 'Byte', 'Character', 'Short', 'Integer', 'Long', 'Float', 'Double', 'Void'];
        return primitives.includes(type) || wrappers.includes(type);
    }

    private extractRelationships(classes: JavaClass[]): CodeRelationship[] {
        const relationships: CodeRelationship[] = [];

        for (const javaClass of classes) {
            if (javaClass.extends) {
                relationships.push({
                    from: javaClass.name,
                    to: javaClass.extends,
                    type: 'extends'
                });
            }

            for (const impl of javaClass.implements) {
                relationships.push({
                    from: javaClass.name,
                    to: impl,
                    type: 'implements'
                });
            }

            for (const method of javaClass.methods) {
                for (const call of method.calls) {
                    const targetClass = this.findClassForMethod(classes, call);
                    if (targetClass && targetClass !== javaClass.name) {
                        relationships.push({
                            from: javaClass.name,
                            to: targetClass,
                            type: 'calls',
                            method: method.name
                        });
                    }
                }
            }
            for (const field of javaClass.fields) {
                if (field.annotations.some(ann => ann.includes('@Autowired') || ann.includes('@Inject'))) {
                    relationships.push({
                        from: javaClass.name,
                        to: field.type,
                        type: 'injects'
                    });
                }
            }
        }
        return relationships;
    }

    private findClassForMethod(classes: JavaClass[], methodName: string): string | null {
        for (const javaClass of classes) {
            if (javaClass.methods.some(method => method.name === methodName)) {
                return javaClass.name;
            }
        }
        return null;
    }

    private isSpringController(annotations: string[]): boolean {
        return annotations.some(ann => 
            ann.includes('@Controller') || 
            ann.includes('@RestController')
        );
    }

    private extractBaseMapping(annotations: string[]): string | undefined {
        const requestMappingAnnotation = annotations.find(ann => 
            ann.includes('@RequestMapping')
        );
        
        if (requestMappingAnnotation) {
            const pathMatch = requestMappingAnnotation.match(/(?:value\s*=\s*|path\s*=\s*)["']([^"']+)["']/);
            if (pathMatch) {
                return pathMatch[1];
            }
            const simplePathMatch = requestMappingAnnotation.match(/@RequestMapping\s*\(\s*["']([^"']+)["']/);
            if (simplePathMatch) {
                return simplePathMatch[1];
            }
        }
        
        return undefined;
    }

    private extractEndpoints(methods: JavaMethod[], baseMapping?: string): SpringEndpoint[] {
        const endpoints: SpringEndpoint[] = [];
        
        for (const method of methods) {
            if (method.endpoint) {
                const fullPath = this.combinePaths(baseMapping, method.endpoint.path);
                endpoints.push({
                    ...method.endpoint,
                    path: fullPath,
                    description: `${method.name}() - ${method.returnType}`
                });
            }
        }
        
        return endpoints;
    }

    private extractEndpointFromMethod(annotations: string[], methodName: string): SpringEndpoint | undefined {
        const mappingAnnotations = [
            '@RequestMapping', '@GetMapping', '@PostMapping', 
            '@PutMapping', '@DeleteMapping', '@PatchMapping'
        ];
        
        // Check each annotation to see if it's a mapping annotation
        for (const annotation of annotations) {
            for (const mappingType of mappingAnnotations) {
                if (annotation.includes(mappingType)) {
                    return this.parseEndpointAnnotation(annotation, mappingType, methodName);
                }
            }
        }
        
        return undefined;
    }

    private parseEndpointAnnotation(annotation: string, mappingType: string, methodName: string): SpringEndpoint {
        let httpMethod = 'GET';
        let path = `/${methodName}`;
        let produces: string | undefined;
        let consumes: string | undefined;

        // Determine HTTP method based on annotation type
        switch (mappingType) {
            case '@PostMapping':
                httpMethod = 'POST';
                break;
            case '@PutMapping':
                httpMethod = 'PUT';
                break;
            case '@DeleteMapping':
                httpMethod = 'DELETE';
                break;
            case '@PatchMapping':
                httpMethod = 'PATCH';
                break;
            case '@RequestMapping':
                // For RequestMapping, check if method is specified
                const methodMatch = annotation.match(/method\s*=\s*RequestMethod\.(\w+)/);
                if (methodMatch) {
                    httpMethod = methodMatch[1];
                }
                break;
            case '@GetMapping':
                httpMethod = 'GET';
                break;
        }
        
        // Extract path from annotation
        // Handle different patterns: @GetMapping("/path"), @GetMapping(path = "/path"), @GetMapping(value = "/path")
        const pathPatterns = [
            /(?:value\s*=\s*|path\s*=\s*)["']([^"']+)["']/,
            new RegExp(`${mappingType.replace('(', '\\(').replace(')', '\\)')}\\s*\\(\\s*["']([^"']+)["']`),
            /["']([^"']+)["']/
        ];

        for (const pattern of pathPatterns) {
            const match = annotation.match(pattern);
            if (match && match[1]) {
                path = match[1];
                break;
            }
        }

        // Extract produces and consumes if present
        const producesMatch = annotation.match(/produces\s*=\s*["']([^"']+)["']/);
        if (producesMatch) {
            produces = producesMatch[1];
        }
        
        const consumesMatch = annotation.match(/consumes\s*=\s*["']([^"']+)["']/);
        if (consumesMatch) {
            consumes = consumesMatch[1];
        }

        return {
            httpMethod,
            path,
            produces,
            consumes
        };
    }

    private combinePaths(basePath?: string, methodPath?: string): string {
        if (!basePath && !methodPath) return '/';
        if (!basePath) return methodPath || '/';
        if (!methodPath) return basePath;
        
        const cleanBase = basePath.endsWith('/') ? basePath.slice(0, -1) : basePath;
        const cleanMethod = methodPath.startsWith('/') ? methodPath : `/${methodPath}`;
        return cleanBase + cleanMethod;
    }

    // Spring Pattern Analysis Methods

    private extractSpringAnnotations(annotations: string[]): SpringAnnotation[] {
        const springAnnotations: SpringAnnotation[] = [];
        
        // Common Spring annotations
        const springAnnotationNames = [
            '@Service', '@Controller', '@RestController', '@Repository', 
            '@Component', '@Configuration', '@Autowired', '@Qualifier',
            '@RequestMapping', '@GetMapping', '@PostMapping', '@PutMapping', 
            '@DeleteMapping', '@Transactional', '@Value', '@Bean'
        ];

        for (const annotation of annotations) {
            for (const springAnnotation of springAnnotationNames) {
                if (annotation.includes(springAnnotation)) {
                    const parameters = this.extractAnnotationParameters(annotation);
                    springAnnotations.push({
                        name: springAnnotation,
                        parameters
                    });
                    break;
                }
            }
        }

        return springAnnotations;
    }

    private extractAnnotationParameters(annotation: string): { [key: string]: string } {
        const parameters: { [key: string]: string } = {};
        
        // Simple parameter extraction for common cases like @RequestMapping(value = "/api")
        const paramMatch = annotation.match(/\((.*)\)/);
        if (paramMatch) {
            const paramString = paramMatch[1];
            // Handle simple value parameter
            if (paramString.includes('=')) {
                const pairs = paramString.split(',');
                for (const pair of pairs) {
                    const [key, value] = pair.split('=').map(s => s.trim());
                    if (key && value) {
                        parameters[key] = value.replace(/['"]/g, '');
                    }
                }
            } else {
                // Handle single value like @RequestMapping("/api")
                parameters['value'] = paramString.replace(/['"]/g, '');
            }
        }

        return parameters;
    }

    private detectSpringPatterns(springAnnotations: SpringAnnotation[], className: string): SpringPattern[] {
        const patterns: SpringPattern[] = [];

        for (const annotation of springAnnotations) {
            switch (annotation.name) {
                case '@Controller':
                    patterns.push({
                        type: 'CONTROLLER',
                        description: 'Spring MVC Controller - handles web requests and returns views',
                        layerType: 'PRESENTATION'
                    });
                    break;
                case '@RestController':
                    patterns.push({
                        type: 'REST_CONTROLLER',
                        description: 'Spring REST Controller - handles HTTP requests and returns JSON/XML responses',
                        layerType: 'PRESENTATION'
                    });
                    break;
                case '@Service':
                    patterns.push({
                        type: 'SERVICE',
                        description: 'Spring Service Layer - contains business logic and coordinates between controllers and repositories',
                        layerType: 'BUSINESS'
                    });
                    break;
                case '@Repository':
                    patterns.push({
                        type: 'REPOSITORY',
                        description: 'Spring Data Access Layer - handles database operations and data persistence',
                        layerType: 'DATA'
                    });
                    break;
                case '@Configuration':
                    patterns.push({
                        type: 'CONFIGURATION',
                        description: 'Spring Configuration Class - defines beans and application configuration',
                        layerType: 'CONFIGURATION'
                    });
                    break;
                case '@Component':
                    patterns.push({
                        type: 'COMPONENT',
                        description: 'Spring Component - generic Spring-managed bean',
                        layerType: 'COMPONENT'
                    });
                    break;
            }
        }

        return patterns;
    }

    private extractSpringDependencies(fields: JavaField[], content: string): SpringDependency[] {
        const dependencies: SpringDependency[] = [];

        for (const field of fields) {
            // Check for @Autowired annotation
            if (field.annotations.some(ann => ann.includes('@Autowired'))) {
                dependencies.push({
                    fieldName: field.name,
                    type: field.type,
                    injectionType: 'FIELD',
                    annotation: '@Autowired'
                });
            }
            
            // Check for @Qualifier annotation
            const qualifierAnnotation = field.annotations.find(ann => ann.includes('@Qualifier'));
            if (qualifierAnnotation) {
                dependencies.push({
                    fieldName: field.name,
                    type: field.type,
                    injectionType: 'FIELD',
                    annotation: qualifierAnnotation
                });
            }
        }

        // TODO: Add constructor and setter injection detection in future enhancement
        return dependencies;
    }
}