"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.UsageScanner = void 0;
const file_utils_1 = require("./file_utils");
class UsageScanner {
    /**
     * Find real usage examples of a specific method in the codebase
     */
    async findMethodUsages(targetClassName, targetMethodName, projectStructure) {
        const examples = [];
        // Search through all Java classes for method calls
        for (const javaClass of projectStructure.classes) {
            if (javaClass.name === targetClassName) {
                continue; // Skip the class that defines the method
            }
            const classExamples = await this.scanClassForMethodUsage(javaClass, targetClassName, targetMethodName);
            examples.push(...classExamples);
        }
        return examples.sort((a, b) => b.parameters.length - a.parameters.length);
    }
    /**
     * Find how a class is typically instantiated or injected
     */
    async findClassUsagePatterns(targetClassName, projectStructure) {
        const examples = [];
        for (const javaClass of projectStructure.classes) {
            if (javaClass.name === targetClassName) {
                continue;
            }
            const classExamples = await this.scanClassForClassUsage(javaClass, targetClassName);
            examples.push(...classExamples);
        }
        return examples.slice(0, 5); // Return top 5 examples
    }
    async scanClassForMethodUsage(sourceClass, targetClassName, targetMethodName) {
        const examples = [];
        if (!(0, file_utils_1.isFileAccessible)(sourceClass.filePath)) {
            return examples;
        }
        const content = (0, file_utils_1.readFileSafely)(sourceClass.filePath);
        if (!content) {
            return examples;
        }
        const lines = content.split("\n");
        // Look for method calls like: targetClass.targetMethod() or this.targetMethod()
        const methodCallPattern = new RegExp(`\\b(\\w+\\.)?${targetMethodName}\\s*\\(([^)]*)\\)`, "g");
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const matches = Array.from(line.matchAll(methodCallPattern));
            for (const match of matches) {
                // Check if this might be a call to our target method
                if (this.isLikelyTargetMethodCall(line, targetClassName, targetMethodName)) {
                    const example = {
                        sourceFile: sourceClass.filePath,
                        sourceClass: sourceClass.name,
                        methodName: targetMethodName,
                        lineNumber: i + 1,
                        codeSnippet: line.trim(),
                        context: this.extractContext(lines, i),
                        parameters: this.extractParameters(match[2] || ""),
                    };
                    examples.push(example);
                }
            }
        }
        return examples;
    }
    async scanClassForClassUsage(sourceClass, targetClassName) {
        const examples = [];
        if (!(0, file_utils_1.isFileAccessible)(sourceClass.filePath)) {
            return examples;
        }
        const content = (0, file_utils_1.readFileSafely)(sourceClass.filePath);
        if (!content) {
            return examples;
        }
        const lines = content.split("\n");
        // Look for class usage patterns
        const patterns = [
            new RegExp(`@Autowired\\s+private\\s+${targetClassName}`, "i"), // Spring injection
            new RegExp(`private\\s+${targetClassName}\\s+\\w+`, "i"), // Field declaration
            new RegExp(`new\\s+${targetClassName}\\s*\\(`, "i"), // Constructor call
            new RegExp(`${targetClassName}\\s+\\w+\\s*=`, "i"), // Variable declaration
        ];
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            for (const pattern of patterns) {
                if (pattern.test(line)) {
                    const example = {
                        sourceFile: sourceClass.filePath,
                        sourceClass: sourceClass.name,
                        methodName: "class_usage",
                        lineNumber: i + 1,
                        codeSnippet: line.trim(),
                        context: this.extractContext(lines, i),
                        parameters: [],
                    };
                    examples.push(example);
                    break;
                }
            }
        }
        return examples;
    }
    isLikelyTargetMethodCall(line, targetClassName, methodName) {
        const lowerLine = line.toLowerCase();
        const lowerClassName = targetClassName.toLowerCase();
        const lowerMethodName = methodName.toLowerCase();
        // Check if the line contains the method name
        if (!lowerLine.includes(lowerMethodName)) {
            return false;
        }
        // Check for common patterns that suggest this is our target method
        return (lowerLine.includes(lowerClassName.toLowerCase()) || // Direct class reference
            lowerLine.includes("this.") || // Method call on current object
            lowerLine.includes(".") // Any object method call
        );
    }
    extractContext(lines, currentIndex) {
        // Get 2 lines before and after for context
        const start = Math.max(0, currentIndex - 2);
        const end = Math.min(lines.length - 1, currentIndex + 2);
        const contextLines = [];
        for (let i = start; i <= end; i++) {
            const prefix = i === currentIndex ? "→ " : "  ";
            contextLines.push(prefix + lines[i].trim());
        }
        return contextLines.join("\n");
    }
    extractParameters(paramString) {
        if (!paramString || paramString.trim() === "") {
            return [];
        }
        // Simple parameter extraction - split by comma and clean up
        return paramString
            .split(",")
            .map((param) => param.trim())
            .filter((param) => param.length > 0);
    }
    /**
     * Get usage statistics for a method
     */
    async getMethodUsageStats(className, methodName, projectStructure) {
        const examples = await this.findMethodUsages(className, methodName, projectStructure);
        const parameterFrequency = {};
        for (const example of examples) {
            for (const param of example.parameters) {
                parameterFrequency[param] = (parameterFrequency[param] || 0) + 1;
            }
        }
        // Get most common parameters
        const commonParameters = Object.entries(parameterFrequency)
            .sort(([, a], [, b]) => b - a)
            .slice(0, 3)
            .map(([param]) => param);
        return {
            usageCount: examples.length,
            commonParameters,
        };
    }
}
exports.UsageScanner = UsageScanner;
//# sourceMappingURL=usage_scanner.js.map