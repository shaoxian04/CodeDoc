export interface AgentContext {
    projectStructure?: any;
    userQuery?: string;
    selectedCode?: string;
    filePath?: string;
    activeEditor?: any;
}

export interface AgentResponse {
    content: string;
    type: 'documentation' | 'visualization' | 'chat';
    action?: 'generate_docs' | 'generate_diagram' | 'answer_question' | 'export_docs';
    metadata?: Record<string, any>;
}

export interface BaseAgent {
    name: string;
    description: string;
    execute(context: AgentContext): Promise<AgentResponse>;
}