export interface AgentContext {
    requestType?: string;
    projectStructure?: any;
    javaClass?: any;
    relatedClasses?: any[];
    userInput?: string;
    projectContext?: any;
    task?: string;
    userQuery?: string;
    selectedCode?: string;
    filePath?: string;
    activeEditor?: any;
}

export interface AgentResponse {
    success: boolean;
    data?: any;
    error?: string;
}

export interface Agent {
    execute(context: any): Promise<any>;
}