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
    BotResponse = 'botResponse',
    // Add new diagram-related message types
    GenerateDiagram = 'generateDiagram',
    ExportDiagram = 'exportDiagram',
    PreviewDiagram = 'previewDiagram',
    SaveDiagramToDocs = 'saveDiagramToDocs',
    DiagramGenerated = 'diagramGenerated',
    DiagramError = 'diagramError'
}

export interface WebviewMessage {
    type: WebviewMessageType;
    text?: string;
    nodeId?: string;
    content?: string;
    data?: any;
    markdown?: string;
    message?: string;
    // Add new diagram-related properties
    diagramType?: string;
    scope?: string;
    module?: string;
    diagramData?: any;
    error?: string;
}