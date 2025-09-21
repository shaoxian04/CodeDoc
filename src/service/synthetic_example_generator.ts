import { JavaClass, JavaMethod, JavaParameter, SpringPattern } from './java_parser';

export interface SyntheticExample {
    methodName: string;
    codeSnippet: string;
    description: string;
    parameters: string[];
    context: string;
}

export class SyntheticExampleGenerator {
    
    /**
     * Generate realistic examples for a method when no real usage is found
     */
    public generateMethodExamples(
        javaClass: JavaClass,
        method: JavaMethod,
        springPatterns: SpringPattern[]
    ): SyntheticExample[] {
        const examples: SyntheticExample[] = [];
        
        // Generate basic usage example
        const basicExample = this.generateBasicMethodExample(javaClass, method);
        examples.push(basicExample);
        
        // Generate Spring-specific examples if applicable
        if (springPatterns.length > 0) {
            const springExample = this.generateSpringMethodExample(javaClass, method, springPatterns[0]);
            if (springExample) {
                examples.push(springExample);
            }
        }
        
        // Generate error handling example for complex methods
        if (method.parameters.length > 2) {
            const errorExample = this.generateErrorHandlingExample(javaClass, method);
            examples.push(errorExample);
        }
        
        return examples;
    }
    
    /**
     * Generate class instantiation examples
     */
    public generateClassUsageExamples(
        javaClass: JavaClass,
        springPatterns: SpringPattern[]
    ): SyntheticExample[] {
        const examples: SyntheticExample[] = [];
        
        // Generate Spring injection example if it's a Spring component
        if (springPatterns.length > 0) {
            const injectionExample = this.generateSpringInjectionExample(javaClass, springPatterns[0]);
            examples.push(injectionExample);
        } else {
            // Generate regular constructor example
            const constructorExample = this.generateConstructorExample(javaClass);
            examples.push(constructorExample);
        }
        
        return examples;
    }
    
    private generateBasicMethodExample(javaClass: JavaClass, method: JavaMethod): SyntheticExample {
        const instanceName = this.getInstanceName(javaClass.name);
        const parameters = this.generateParameterValues(method.parameters);
        const paramString = parameters.join(', ');
        
        let codeSnippet: string;
        let context: string;
        
        if (method.returnType === 'void') {
            codeSnippet = `${instanceName}.${method.name}(${paramString});`;
            context = `// Call ${method.name} to perform the operation`;
        } else {
            const resultVar = this.getVariableName(method.returnType);
            codeSnippet = `${method.returnType} ${resultVar} = ${instanceName}.${method.name}(${paramString});`;
            context = `// Get ${method.returnType} result from ${method.name}`;
        }
        
        return {
            methodName: method.name,
            codeSnippet,
            description: `Basic usage of ${method.name} method`,
            parameters,
            context
        };
    }
    
    private generateSpringMethodExample(
        javaClass: JavaClass,
        method: JavaMethod,
        springPattern: SpringPattern
    ): SyntheticExample | null {
        const instanceName = this.getInstanceName(javaClass.name);
        const parameters = this.generateParameterValues(method.parameters);
        const paramString = parameters.join(', ');
        
        let codeSnippet: string;
        let context: string;
        
        switch (springPattern.type) {
            case 'CONTROLLER':
            case 'REST_CONTROLLER':
                if (method.annotations.some(ann => ann.includes('Mapping'))) {
                    codeSnippet = `// HTTP ${this.getHttpMethod(method)} request handler\n${method.returnType} response = ${instanceName}.${method.name}(${paramString});`;
                    context = `// This method handles HTTP requests and returns ${method.returnType}`;
                } else {
                    return null;
                }
                break;
                
            case 'SERVICE':
                codeSnippet = `// Business logic execution\n${method.returnType} result = ${instanceName}.${method.name}(${paramString});`;
                context = `// Service layer method for business operations`;
                break;
                
            case 'REPOSITORY':
                codeSnippet = `// Data access operation\n${method.returnType} data = ${instanceName}.${method.name}(${paramString});`;
                context = `// Repository method for database operations`;
                break;
                
            default:
                return null;
        }
        
        return {
            methodName: method.name,
            codeSnippet,
            description: `Spring ${springPattern.type} usage of ${method.name}`,
            parameters,
            context
        };
    }
    
    private generateErrorHandlingExample(javaClass: JavaClass, method: JavaMethod): SyntheticExample {
        const instanceName = this.getInstanceName(javaClass.name);
        const parameters = this.generateParameterValues(method.parameters);
        const paramString = parameters.join(', ');
        
        const codeSnippet = `
try {
    ${method.returnType !== 'void' ? method.returnType + ' result = ' : ''}${instanceName}.${method.name}(${paramString});
    // Handle success case
} catch (Exception e) {
    // Handle error case
    logger.error("Error calling ${method.name}: " + e.getMessage());
}`.trim();
        
        return {
            methodName: method.name,
            codeSnippet,
            description: `Error handling example for ${method.name}`,
            parameters,
            context: `// Proper error handling when calling ${method.name}`
        };
    }
    
    private generateSpringInjectionExample(javaClass: JavaClass, springPattern: SpringPattern): SyntheticExample {
        const instanceName = this.getInstanceName(javaClass.name);
        
        const codeSnippet = `
@Autowired
private ${javaClass.name} ${instanceName};

// Usage in another Spring component
public void someMethod() {
    ${instanceName}.someOperation();
}`.trim();
        
        return {
            methodName: 'class_injection',
            codeSnippet,
            description: `Spring dependency injection of ${javaClass.name}`,
            parameters: [],
            context: `// ${springPattern.description}`
        };
    }
    
    private generateConstructorExample(javaClass: JavaClass): SyntheticExample {
        const instanceName = this.getInstanceName(javaClass.name);
        
        const codeSnippet = `
${javaClass.name} ${instanceName} = new ${javaClass.name}();
// Use the instance
${instanceName}.someMethod();`.trim();
        
        return {
            methodName: 'constructor',
            codeSnippet,
            description: `Creating instance of ${javaClass.name}`,
            parameters: [],
            context: `// Standard object instantiation`
        };
    }
    
    private generateParameterValues(parameters: JavaParameter[]): string[] {
        return parameters.map(param => this.generateValueForType(param.type, param.name));
    }
    
    private generateValueForType(type: string, paramName: string): string {
        // Generate realistic parameter values based on type
        switch (type.toLowerCase()) {
            case 'string':
                return `"${this.generateStringValue(paramName)}"`;
            case 'int':
            case 'integer':
                return this.generateIntValue(paramName);
            case 'long':
                return this.generateIntValue(paramName) + 'L';
            case 'boolean':
                return 'true';
            case 'double':
            case 'float':
                return '0.0';
            case 'date':
                return 'new Date()';
            case 'list':
            case 'arraylist':
                return 'Arrays.asList()';
            default:
                // For custom objects, use variable name
                return this.getInstanceName(type);
        }
    }
    
    private generateStringValue(paramName: string): string {
        const lowerName = paramName.toLowerCase();
        
        if (lowerName.includes('name')) return 'John Doe';
        if (lowerName.includes('email')) return 'user@example.com';
        if (lowerName.includes('id')) return '12345';
        if (lowerName.includes('url')) return 'https://example.com';
        if (lowerName.includes('path')) return '/api/users';
        if (lowerName.includes('message')) return 'Hello World';
        
        return 'example';
    }
    
    private generateIntValue(paramName: string): string {
        const lowerName = paramName.toLowerCase();
        
        if (lowerName.includes('id')) return '1';
        if (lowerName.includes('count')) return '10';
        if (lowerName.includes('size')) return '100';
        if (lowerName.includes('page')) return '0';
        
        return '1';
    }
    
    private getInstanceName(className: string): string {
        // Convert ClassName to instanceName
        return className.charAt(0).toLowerCase() + className.slice(1);
    }
    
    private getVariableName(type: string): string {
        // Generate appropriate variable name for return type
        const lowerType = type.toLowerCase();
        
        if (lowerType.includes('list')) return 'items';
        if (lowerType.includes('string')) return 'result';
        if (lowerType.includes('user')) return 'user';
        if (lowerType.includes('response')) return 'response';
        
        return 'result';
    }
    
    private getHttpMethod(method: JavaMethod): string {
        const annotations = method.annotations.join(' ').toLowerCase();
        
        if (annotations.includes('getmapping') || annotations.includes('get')) return 'GET';
        if (annotations.includes('postmapping') || annotations.includes('post')) return 'POST';
        if (annotations.includes('putmapping') || annotations.includes('put')) return 'PUT';
        if (annotations.includes('deletemapping') || annotations.includes('delete')) return 'DELETE';
        
        return 'GET';
    }
}