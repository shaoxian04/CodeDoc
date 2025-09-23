export enum WebviewMessageType {
    SendMessage = 'sendMessage',
    SelectNode = 'selectNode',
    RefreshVisualization = 'refreshVisualization',
    GenerateProjectDocs = 'generateProjectDocs',
    GenerateClassDocs = 'generateClassDocs',
    ExportClassDocs = 'exportClassDocs',
    UpdateVisualization = 'updateVisualization',
    UpdateProjectStructureForDiagrams = 'updateProjectStructureForDiagrams',
    AnalysisStarted = 'analysisStarted',
    ClearChat = 'clearChat',
    ShowExplanation = 'showExplanation',
    ShowProjectOverview = 'showProjectOverview',
    BotResponse = 'botResponse'
}

export interface WebviewMessage {
    type: WebviewMessageType;
    text?: string;
    nodeId?: string;
    content?: string;
    data?: any;
    markdown?: string;
    message?: string;
}