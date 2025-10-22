# CodeDocX

Smart documentation assistant with AI chatbot and code visualization for VS Code.

[![VS Code Marketplace](https://img.shields.io/visual-studio-marketplace/v/NP.codedocx)](https://marketplace.visualstudio.com/items?itemName=NP.codedocx)
[![Downloads](https://img.shields.io/visual-studio-marketplace/d/NP.codedocx)](https://marketplace.visualstudio.com/items?itemName=NP.codedocx)

## Overview

CodeDocX addresses the critical documentation challenges in modern software development:

- **Writing**: Slow, repetitive, and often skipped
- **Reading**: Painful and time-consuming, especially for new team members  
- **Maintaining**: Impractical in fast-changing systems — docs quickly become outdated

This leads to onboarding delays, wasted engineering time, and avoidable bugs due to poor documentation.

## Our Solution - CodeDocX

CodeDocX is a powerful VS Code extension designed to enhance developer productivity by providing intelligent code analysis, documentation generation, and visualization capabilities. Whether you're working on a complex enterprise application or a simple project, CodeDoc helps you understand, document, and navigate your codebase more effectively.

## Main Features

### 1. Project Overview 
Automatically analyzes your Java project and displays a layered architecture visualization (Controllers, Services, Repositories, Entities, Others). Shows statistics, class cards, and quick navigation to source files.

### 2. Code Explaination (Documentation Generator)
#### Class Documentation Generator:
Generates detailed Markdown documentation for any Java class, including Spring context, responsibilities, method docs, usage examples, and relationships. Links to related classes and files are included.

#### Project Documentation Generator
Creates a comprehensive project overview document, including architecture diagrams, layer analysis, Spring patterns, class relationships, request lifecycle, and technology stack.

### 3. AI Assistant 
An AI chatbot that acts as the assistant to answer user's questions for coding and provides onboarding help to guide new joiners understand the code base faster

### 4. Visualization
Generates Mermaid diagrams for class relationships, project architecture, and entity relationships to help users understand the code base with visualization

### 5. Stale Documentation Detector
Detect the staleness of the documentations when PR request is made and help users to update the stale docuemntation

## User Guide

### Getting Started

1. **Install CodeDocs** from the VS Code Marketplace.
2. **Open a Java project** in VS Code.
3. **Configure the extension**:
	- Open the command palette (`Ctrl+Shift+P` or `F1`).
	- Run `CodeDoc: Configure Extension`.
	- Enter your OpenAI API key, select the model, and set token/temperature (optional).
4. **Click the CodeDoc icon** in the sidebar to open the main view.

## Supported Technologies

- **Languages**: Java 
- **Frameworks**: Spring Boot 

## Development Setup

1. Clone the repository
2. Run `npm install` to install dependencies
3. Run `npm run watch` to start the TypeScript compiler in watch mode
4. Press `F5` to launch the extension in a new VS Code window
5. Type `codedoc.configureExtension` in the command palette to configure the extension (input your OpenAI API key, select model, and set the max token and temperature(optional))
6. Open a Java project in VS Code and click the CodeDoc icon in the sidebar to start using the extension
