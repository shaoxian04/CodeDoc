# CodeDoc Agents with Langchain

This directory contains the agent implementations for the CodeDoc extension using the Langchain framework.

## Documentation Agent

The Documentation Agent is responsible for generating project and class documentation using Langchain and OpenAI.

### Features

1. **Project Overview Generation**: Creates comprehensive documentation for entire projects
2. **Class Documentation**: Generates detailed documentation for specific classes or code snippets
3. **Export Functionality**: Exports generated documentation in various formats

### Implementation Details

The Documentation Agent uses the following Langchain components:

- `ChatOpenAI`: For interacting with OpenAI's GPT models
- `PromptTemplate`: For creating structured prompts
- `StringOutputParser`: For parsing LLM responses

### Usage

```typescript
import { DocumentationAgent } from './agents/documentation_agent_langchain';

const agent = new DocumentationAgent(apiKey);

// Generate project overview
const projectResponse = await agent.execute({
    userQuery: 'Generate project overview documentation'
});

// Generate class documentation
const classResponse = await agent.execute({
    selectedCode: 'public class MyClass { ... }',
    filePath: 'MyClass.java'
});
```

### Integration with VS Code Extension

The agent is designed to integrate with the existing VS Code extension architecture:

1. It retrieves the OpenAI API key from VS Code configuration
2. It works with the existing webview provider for displaying results
3. It follows the same command structure as the original implementation

### Future Enhancements

1. **RAG Integration**: Implement Retrieval-Augmented Generation for better context awareness
2. **MCP Support**: Add Multi-Agent Communication Protocol for coordination with other agents
3. **Advanced Prompting**: Implement more sophisticated prompt engineering techniques
4. **Caching**: Add caching mechanisms for improved performance