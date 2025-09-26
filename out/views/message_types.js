"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebviewMessageType = void 0;
var WebviewMessageType;
(function (WebviewMessageType) {
    WebviewMessageType["SendMessage"] = "sendMessage";
    WebviewMessageType["GetSelectedCode"] = "getSelectedCode";
    WebviewMessageType["SelectedCode"] = "selectedCode";
    WebviewMessageType["SelectNode"] = "selectNode";
    WebviewMessageType["RefreshVisualization"] = "refreshVisualization";
    WebviewMessageType["GenerateProjectDocs"] = "generateProjectDocs";
    WebviewMessageType["GenerateClassDocs"] = "generateClassDocs";
    WebviewMessageType["ExportClassDocs"] = "exportClassDocs";
    WebviewMessageType["UpdateVisualization"] = "updateVisualization";
    WebviewMessageType["UpdateProjectStructureForDiagrams"] = "updateProjectStructureForDiagrams";
    WebviewMessageType["AnalysisStarted"] = "analysisStarted";
    WebviewMessageType["ClearChat"] = "clearChat";
    WebviewMessageType["ShowExplanation"] = "showExplanation";
    WebviewMessageType["ShowProjectOverview"] = "showProjectOverview";
    WebviewMessageType["BotResponse"] = "botResponse";
    // Add new diagram-related message types
    WebviewMessageType["GenerateDiagram"] = "generateDiagram";
    WebviewMessageType["ExportDiagram"] = "exportDiagram";
    WebviewMessageType["PreviewDiagram"] = "previewDiagram";
    WebviewMessageType["SaveDiagramToDocs"] = "saveDiagramToDocs";
    WebviewMessageType["DiagramGenerated"] = "diagramGenerated";
    WebviewMessageType["DiagramError"] = "diagramError";
})(WebviewMessageType || (exports.WebviewMessageType = WebviewMessageType = {}));
//# sourceMappingURL=message_types.js.map