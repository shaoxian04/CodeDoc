import { Agent } from "./types";

export interface AgentMessage {
    id: string;
    from: string;
    to: string;
    type: string;
    content: any;
    timestamp: Date;
}

export interface SharedContext {
    projectId: string;
    projectStructure: any;
    userIntent: string;
    conversationHistory: any[];
    taskProgress: Map<string, any>;
}

export class MCPService {
    private agents: Map<string, Agent>;
    private sharedContext: SharedContext;
    private messageQueue: AgentMessage[];
    private observers: ((message: AgentMessage) => void)[];

    constructor(projectId: string) {
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
    public registerAgent(name: string, agent: Agent): void {
        console.log('Registering agent:', name);
        this.agents.set(name, agent);
    }

    /**
     * Send a message to a specific agent
     */
    public async sendMessage(message: AgentMessage): Promise<any> {
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
        } catch (error) {
            console.error(`Error executing agent ${message.to}:`, error);
            throw error;
        }
    }

    /**
     * Broadcast a message to all agents
     */
    public async broadcastMessage(message: AgentMessage): Promise<any[]> {
        const responses: any[] = [];
        
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
                } catch (error) {
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
    public updateSharedContext(updates: Partial<SharedContext>): void {
        this.sharedContext = {
            ...this.sharedContext,
            ...updates
        };
    }

    /**
     * Get shared context
     */
    public getSharedContext(): SharedContext {
        return { ...this.sharedContext };
    }

    /**
     * Add an observer for message monitoring
     */
    public addObserver(observer: (message: AgentMessage) => void): void {
        this.observers.push(observer);
    }

    /**
     * Remove an observer
     */
    public removeObserver(observer: (message: AgentMessage) => void): void {
        const index = this.observers.indexOf(observer);
        if (index > -1) {
            this.observers.splice(index, 1);
        }
    }

    private notifyObservers(message: AgentMessage): void {
        this.observers.forEach(observer => observer(message));
    }

    /**
     * Coordinate a task between multiple agents
     */
    public async coordinateTask(
        coordinator: string,
        task: string,
        payload: any
    ): Promise<any> {
        // Create coordination message
        const coordinationMessage: AgentMessage = {
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

    private generateMessageId(): string {
        return Math.random().toString(36).substring(2, 15) + 
               Math.random().toString(36).substring(2, 15);
    }
}