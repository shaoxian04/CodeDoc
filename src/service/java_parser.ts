import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

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

export class JavaParser {
    
    public async parseWorkspace(): Promise<ProjectStructure> {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            throw new Error('No workspace folder found');
        }

        const javaFiles = await this.findJavaFiles(workspaceFolder.uri.fsPath);
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

        const relationships = this.extractRelationships(classes);
        
        return { classes, relationships };
    }

    private async findJavaFiles(rootPath: string): Promise<string[]> {
        const javaFiles: string[] = [];
        
        const searchPattern = new vscode.RelativePattern(rootPath, '**/*.java');
        const files = await vscode.workspace.findFiles(searchPattern);
        
        return files.map(file => file.fsPath);
    }

    private async parseJavaFile(filePath: string): Promise<JavaClass | null> {
        const content = fs.readFileSync(filePath, 'utf-8');
        const fileName = path.basename(filePath, '.java');
        
        // Simple regex-based parsing (you can enhance this with proper AST parsing)
        const packageMatch = content.match(/package\s+([\w.]+);/);
        const packageName = packageMatch ? packageMatch[1] : '';
        
        const imports = this.extractImports(content);
        const classMatch = content.match(/(?:public\s+)?(?:abstract\s+)?(?:final\s+)?class\s+(\w+)(?:\s+extends\s+(\w+))?(?:\s+implements\s+([\w\s,]+))?/);
        
        if (!classMatch) {
            return null;
        }

        const className = classMatch[1];
        const extendsClass = classMatch[2];
        const implementsClasses = classMatch[3] ? classMatch[3].split(',').map(s => s.trim()) : [];
        
        const methods = this.extractMethods(content);
        const fields = this.extractFields(content);
        const annotations = this.extractClassAnnotations(content);
        const dependencies = this.extractDependencies(content, imports);

        // Check if this is a Spring controller
        const isController = this.isSpringController(annotations);
        const baseMapping = this.extractBaseMapping(annotations);
        const endpoints = isController ? this.extractEndpoints(methods, baseMapping) : [];

        return {
            name: className,
            filePath,
            package: packageName,
            imports,
            methods,
            fields,
            annotations,
            extends: extendsClass,
            implements: implementsClasses,
            dependencies,
            isController,
            endpoints
        };
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
        const methodRegex = /(?:@\w+(?:\([^)]*\))?\s*)*(?:(public|private|protected)\s+)?(?:(static)\s+)?(?:(final)\s+)?(\w+(?:<[^>]+>)?|\w+\[\])\s+(\w+)\s*\(([^)]*)\)\s*(?:throws\s+[\w\s,]+)?\s*\{/g;
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
        const beforeMethod = content.substring(Math.max(0, methodIndex - 500), methodIndex);
        const lines = beforeMethod.split('\n');
        const annotations: string[] = [];

        for (let i = lines.length - 1; i >= 0; i--) {
            const line = lines[i].trim();
            if (line.startsWith('@')) {
                annotations.unshift(line);
            } else if (line && !line.startsWith('//') && !line.startsWith('/*')) {
                break;
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
        
        // Spring-specific annotations that indicate dependencies
        const springAnnotations = ['@Autowired', '@Inject', '@Resource', '@Service', '@Repository', '@Component', '@Controller', '@RestController'];
        
        for (const annotation of springAnnotations) {
            if (content.includes(annotation)) {
                dependencies.push(annotation.substring(1));
            }
        }

        // Extract field injection dependencies
        const fieldInjectionRegex = /@(?:Autowired|Inject|Resource)\s*(?:private|public|protected)?\s+(\w+)/g;
        let match;
        while ((match = fieldInjectionRegex.exec(content)) !== null) {
            dependencies.push(match[1]);
        }

        return [...new Set(dependencies)];
    }

    private extractRelationships(classes: JavaClass[]): CodeRelationship[] {
        const relationships: CodeRelationship[] = [];

        for (const javaClass of classes) {
            // Inheritance relationships
            if (javaClass.extends) {
                relationships.push({
                    from: javaClass.name,
                    to: javaClass.extends,
                    type: 'extends'
                });
            }

            // Interface implementation
            for (const impl of javaClass.implements) {
                relationships.push({
                    from: javaClass.name,
                    to: impl,
                    type: 'implements'
                });
            }

            // Method calls and dependencies
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

            // Spring dependency injection
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
            
            // Handle cases like @RequestMapping("/api/users")
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

        // Determine HTTP method from annotation type
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
                // Extract method from RequestMapping
                const methodMatch = annotation.match(/method\s*=\s*RequestMethod\.(\w+)/);
                if (methodMatch) {
                    httpMethod = methodMatch[1];
                }
                break;
        }

        // Extract path
        const pathMatches = [
            /(?:value\s*=\s*|path\s*=\s*)["']([^"']+)["']/,
            new RegExp(`@${mappingType.substring(1)}\\s*\\(\\s*["']([^"']+)["']`)
        ];

        for (const pathMatch of pathMatches) {
            const match = annotation.match(pathMatch);
            if (match) {
                path = match[1];
                break;
            }
        }

        // Extract produces
        const producesMatch = annotation.match(/produces\s*=\s*["']([^"']+)["']/);
        if (producesMatch) {
            produces = producesMatch[1];
        }

        // Extract consumes
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
}