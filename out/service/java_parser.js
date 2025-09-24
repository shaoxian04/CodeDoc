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
exports.JavaParser = void 0;
const vscode = __importStar(require("vscode"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const file_utils_1 = require("./file_utils");
class JavaParser {
    async parseWorkspace() {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            throw new Error('No workspace folder found');
        }
        const javaFiles = await this.findJavaFiles(workspaceFolder.uri.fsPath);
        console.log('Found Java files:', javaFiles);
        const classes = [];
        for (const filePath of javaFiles) {
            try {
                const javaClass = await this.parseJavaFile(filePath);
                if (javaClass) {
                    classes.push(javaClass);
                }
            }
            catch (error) {
                console.error(`Error parsing ${filePath}:`, error);
            }
        }
        console.log('Parsed classes:', classes.map(cls => cls.name));
        const relationships = this.extractRelationships(classes);
        const result = { classes, relationships };
        console.log('Project structure:', result);
        return result;
    }
    async findJavaFiles(rootPath) {
        const javaFiles = [];
        const searchPattern = new vscode.RelativePattern(rootPath, '**/*.java');
        const files = await vscode.workspace.findFiles(searchPattern);
        return files.map(file => file.fsPath);
    }
    async parseJavaFile(filePath) {
        console.log('Parsing Java file:', filePath);
        // Sanitize the file path to prevent issues with .git extensions
        const sanitizedPath = (0, file_utils_1.sanitizeFilePath)(filePath);
        // Check if file is accessible
        if (!(0, file_utils_1.isFileAccessible)(sanitizedPath)) {
            console.warn('File not accessible:', sanitizedPath);
            return null;
        }
        try {
            const content = (0, file_utils_1.readFileSafely)(sanitizedPath);
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
        }
        catch (error) {
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
    extractImports(content) {
        const importRegex = /import\s+((?:static\s+)?[\w.]+(?:\.\*)?);/g;
        const imports = [];
        let match;
        while ((match = importRegex.exec(content)) !== null) {
            imports.push(match[1]);
        }
        return imports;
    }
    extractMethods(content) {
        // Improved regex pattern to better capture method annotations and signatures
        const methodRegex = /(?:@[a-zA-Z_][a-zA-Z0-9_]*(?:\([^)]*\))?\s*)*(?:(public|private|protected)\s+)?(?:(static)\s+)?(?:(final)\s+)?([a-zA-Z_][a-zA-Z0-9_.<>[\]]*)\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(([^)]*)\)\s*(?:throws\s+[^{;]+)?\s*\{/g;
        const methods = [];
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
    extractFields(content) {
        const fieldRegex = /(?:@\w+(?:\([^)]*\))?\s*)*(?:(public|private|protected)\s+)?(?:(static)\s+)?(?:(final)\s+)?(\w+(?:<[^>]+>)?|\w+\[\])\s+(\w+)(?:\s*=\s*[^;]+)?;/g;
        const fields = [];
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
    parseParameters(parametersStr) {
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
    extractClassAnnotations(content) {
        const classLineMatch = content.match(/(?:@\w+(?:\([^)]*\))?\s*)*(?:public\s+)?(?:abstract\s+)?(?:final\s+)?class/);
        if (!classLineMatch)
            return [];
        const beforeClass = content.substring(0, classLineMatch.index);
        const annotationRegex = /@(\w+)(?:\([^)]*\))?/g;
        const annotations = [];
        let match;
        while ((match = annotationRegex.exec(beforeClass)) !== null) {
            annotations.push(match[0]);
        }
        return annotations;
    }
    extractMethodAnnotations(content, methodIndex) {
        // Look backwards from the method index to find all annotations
        const beforeMethod = content.substring(Math.max(0, methodIndex - 1000), methodIndex);
        const lines = beforeMethod.split('\n');
        const annotations = [];
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
    extractFieldAnnotations(content, fieldIndex) {
        const beforeField = content.substring(Math.max(0, fieldIndex - 200), fieldIndex);
        const annotationRegex = /@(\w+)(?:\([^)]*\))?/g;
        const annotations = [];
        let match;
        while ((match = annotationRegex.exec(beforeField)) !== null) {
            annotations.push(match[0]);
        }
        return annotations;
    }
    extractMethodCalls(content, methodStart) {
        const methodEnd = this.findMethodEnd(content, methodStart);
        const methodBody = content.substring(methodStart, methodEnd);
        const callRegex = /(\w+)\s*\(/g;
        const calls = [];
        let match;
        while ((match = callRegex.exec(methodBody)) !== null) {
            const methodName = match[1];
            if (methodName !== 'if' && methodName !== 'for' && methodName !== 'while' && methodName !== 'switch') {
                calls.push(methodName);
            }
        }
        return [...new Set(calls)];
    }
    findMethodEnd(content, start) {
        let braceCount = 0;
        let inMethod = false;
        for (let i = start; i < content.length; i++) {
            const char = content[i];
            if (char === '{') {
                braceCount++;
                inMethod = true;
            }
            else if (char === '}') {
                braceCount--;
                if (inMethod && braceCount === 0) {
                    return i;
                }
            }
        }
        return content.length;
    }
    extractDependencies(content, imports) {
        const dependencies = [];
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
    isPrimitiveType(type) {
        const primitives = ['boolean', 'byte', 'char', 'short', 'int', 'long', 'float', 'double', 'void'];
        const wrappers = ['Boolean', 'Byte', 'Character', 'Short', 'Integer', 'Long', 'Float', 'Double', 'Void'];
        return primitives.includes(type) || wrappers.includes(type);
    }
    extractRelationships(classes) {
        const relationships = [];
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
    findClassForMethod(classes, methodName) {
        for (const javaClass of classes) {
            if (javaClass.methods.some(method => method.name === methodName)) {
                return javaClass.name;
            }
        }
        return null;
    }
    isSpringController(annotations) {
        return annotations.some(ann => ann.includes('@Controller') ||
            ann.includes('@RestController'));
    }
    extractBaseMapping(annotations) {
        const requestMappingAnnotation = annotations.find(ann => ann.includes('@RequestMapping'));
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
    extractEndpoints(methods, baseMapping) {
        const endpoints = [];
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
    extractEndpointFromMethod(annotations, methodName) {
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
    parseEndpointAnnotation(annotation, mappingType, methodName) {
        let httpMethod = 'GET';
        let path = `/${methodName}`;
        let produces;
        let consumes;
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
    combinePaths(basePath, methodPath) {
        if (!basePath && !methodPath)
            return '/';
        if (!basePath)
            return methodPath || '/';
        if (!methodPath)
            return basePath;
        const cleanBase = basePath.endsWith('/') ? basePath.slice(0, -1) : basePath;
        const cleanMethod = methodPath.startsWith('/') ? methodPath : `/${methodPath}`;
        return cleanBase + cleanMethod;
    }
    // Spring Pattern Analysis Methods
    extractSpringAnnotations(annotations) {
        const springAnnotations = [];
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
    extractAnnotationParameters(annotation) {
        const parameters = {};
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
            }
            else {
                // Handle single value like @RequestMapping("/api")
                parameters['value'] = paramString.replace(/['"]/g, '');
            }
        }
        return parameters;
    }
    detectSpringPatterns(springAnnotations, className) {
        const patterns = [];
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
    extractSpringDependencies(fields, content) {
        const dependencies = [];
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
exports.JavaParser = JavaParser;
//# sourceMappingURL=java_parser.js.map