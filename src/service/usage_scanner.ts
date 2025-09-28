import * as vscode from "vscode";
import * as fs from "fs";
import { ProjectStructure, JavaClass } from "./java_parser";
import { readFileSafely, isFileAccessible } from "./file_utils";

export interface UsageExample {
  sourceFile: string;
  sourceClass: string;
  methodName: string;
  lineNumber: number;
  codeSnippet: string;
  context: string;
  parameters: string[];
}

export interface MethodUsage {
  methodName: string;
  className: string;
  examples: UsageExample[];
  usageCount: number;
}

export class UsageScanner {
  /**
   * Find real usage examples of a specific method in the codebase
   */
  public async findMethodUsages(
    targetClassName: string,
    targetMethodName: string,
    projectStructure: ProjectStructure
  ): Promise<UsageExample[]> {
    const examples: UsageExample[] = [];

    // Search through all Java classes for method calls
    for (const javaClass of projectStructure.classes) {
      if (javaClass.name === targetClassName) {
        continue; // Skip the class that defines the method
      }

      const classExamples = await this.scanClassForMethodUsage(
        javaClass,
        targetClassName,
        targetMethodName
      );
      examples.push(...classExamples);
    }

    return examples.sort((a, b) => b.parameters.length - a.parameters.length);
  }

  /**
   * Find how a class is typically instantiated or injected
   */
  public async findClassUsagePatterns(
    targetClassName: string,
    projectStructure: ProjectStructure
  ): Promise<UsageExample[]> {
    const examples: UsageExample[] = [];

    for (const javaClass of projectStructure.classes) {
      if (javaClass.name === targetClassName) {
        continue;
      }

      const classExamples = await this.scanClassForClassUsage(
        javaClass,
        targetClassName
      );
      examples.push(...classExamples);
    }

    return examples.slice(0, 5); // Return top 5 examples
  }

  private async scanClassForMethodUsage(
    sourceClass: JavaClass,
    targetClassName: string,
    targetMethodName: string
  ): Promise<UsageExample[]> {
    const examples: UsageExample[] = [];

    if (!isFileAccessible(sourceClass.filePath)) {
      return examples;
    }

    const content = readFileSafely(sourceClass.filePath);
    if (!content) {
      return examples;
    }

    const lines = content.split("\n");

    // Look for method calls like: targetClass.targetMethod() or this.targetMethod()
    const methodCallPattern = new RegExp(
      `\\b(\\w+\\.)?${targetMethodName}\\s*\\(([^)]*)\\)`,
      "g"
    );

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const matches = Array.from(line.matchAll(methodCallPattern));

      for (const match of matches) {
        // Check if this might be a call to our target method
        if (
          this.isLikelyTargetMethodCall(line, targetClassName, targetMethodName)
        ) {
          const example: UsageExample = {
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

  private async scanClassForClassUsage(
    sourceClass: JavaClass,
    targetClassName: string
  ): Promise<UsageExample[]> {
    const examples: UsageExample[] = [];

    if (!isFileAccessible(sourceClass.filePath)) {
      return examples;
    }

    const content = readFileSafely(sourceClass.filePath);
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
          const example: UsageExample = {
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

  private isLikelyTargetMethodCall(
    line: string,
    targetClassName: string,
    methodName: string
  ): boolean {
    const lowerLine = line.toLowerCase();
    const lowerClassName = targetClassName.toLowerCase();
    const lowerMethodName = methodName.toLowerCase();

    // Check if the line contains the method name
    if (!lowerLine.includes(lowerMethodName)) {
      return false;
    }

    // Check for common patterns that suggest this is our target method
    return (
      lowerLine.includes(lowerClassName.toLowerCase()) || // Direct class reference
      lowerLine.includes("this.") || // Method call on current object
      lowerLine.includes(".") // Any object method call
    );
  }

  private extractContext(lines: string[], currentIndex: number): string {
    // Get 2 lines before and after for context
    const start = Math.max(0, currentIndex - 2);
    const end = Math.min(lines.length - 1, currentIndex + 2);

    const contextLines: string[] = [];
    for (let i = start; i <= end; i++) {
      const prefix = i === currentIndex ? "→ " : "  ";
      contextLines.push(prefix + lines[i].trim());
    }

    return contextLines.join("\n");
  }

  private extractParameters(paramString: string): string[] {
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
  public async getMethodUsageStats(
    className: string,
    methodName: string,
    projectStructure: ProjectStructure
  ): Promise<{ usageCount: number; commonParameters: string[] }> {
    const examples = await this.findMethodUsages(
      className,
      methodName,
      projectStructure
    );

    const parameterFrequency: { [param: string]: number } = {};

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