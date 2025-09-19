"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MCPService = void 0;
class MCPService {
    agents;
    sharedContext;
    messageQueue;
    observers;
    constructor(projectId) {
        this.agents = new Map();
        this.messageQueue = [];
        this.observers = [];
        this.sharedContext = {
            projectId,
            projectStructure: null,
            userIntent: '',
            conversationHistory: [],
            taskProgress: new Map()
        };
    }
    /**
     * Register an agent with the MCP
     */
    registerAgent(name, agent) {
        console.log('Registering agent:', name);
        this.agents.set(name, agent);
    }
    /**
     * Send a message to a specific agent
     */
    async sendMessage(message) {
        console.log('Sending message:', message);
        this.messageQueue.push(message);
        this.notifyObservers(message);
        const targetAgent = this.agents.get(message.to);
        if (!targetAgent) {
            console.log('Agent not found:', message.to);
            throw new Error(`Agent ${message.to} not found`);
        }
        console.log('Found agent:', message.to);
        try {
            const response = await targetAgent.execute(message.content);
            console.log('Agent response:', response);
            return response;
        }
        catch (error) {
            console.error(`Error executing agent ${message.to}:`, error);
            throw error;
        }
    }
    /**
     * Broadcast a message to all agents
     */
    async broadcastMessage(message) {
        const responses = [];
        for (const [agentName, agent] of this.agents.entries()) {
            if (agentName !== message.from) {
                try {
                    const response = await agent.execute({
                        ...message.content,
                        broadcast: true
                    });
                    responses.push({
                        agent: agentName,
                        response
                    });
                }
                catch (error) {
                    console.error(`Error executing agent ${agentName}:`, error);
                    responses.push({
                        agent: agentName,
                        error: error instanceof Error ? error.message : 'Unknown error'
                    });
                }
            }
        }
        return responses;
    }
    /**
     * Update shared context
     */
    updateSharedContext(updates) {
        this.sharedContext = {
            ...this.sharedContext,
            ...updates
        };
    }
    /**
     * Get shared context
     */
    getSharedContext() {
        return { ...this.sharedContext };
    }
    /**
     * Add an observer for message monitoring
     */
    addObserver(observer) {
        this.observers.push(observer);
    }
    /**
     * Remove an observer
     */
    removeObserver(observer) {
        const index = this.observers.indexOf(observer);
        if (index > -1) {
            this.observers.splice(index, 1);
        }
    }
    notifyObservers(message) {
        this.observers.forEach(observer => observer(message));
    }
    /**
     * Coordinate a task between multiple agents
     */
    async coordinateTask(coordinator, task, payload) {
        // Create coordination message
        const coordinationMessage = {
            id: this.generateMessageId(),
            from: coordinator,
            to: 'all',
            type: 'coordinate_task',
            content: {
                task,
                payload,
                coordinator
            },
            timestamp: new Date()
        };
        // Broadcast to all agents
        const responses = await this.broadcastMessage(coordinationMessage);
        // Process responses and determine next steps
        return {
            task,
            coordinator,
            responses,
            timestamp: new Date()
        };
    }
    generateMessageId() {
        return Math.random().toString(36).substring(2, 15) +
            Math.random().toString(36).substring(2, 15);
    }
}
exports.MCPService = MCPService;
//# sourceMappingURL=mcp_service.js.map