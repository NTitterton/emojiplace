export interface Pixel {
  x: number;
  y: number;
  emoji: string;
  username: string;
  lastModified: string;
}

export interface AgentMessage {
  messageId: string;
  timestamp: number;
  from: string;
  to: string;
  content: string;
  createdAt: string;
}

export type WebSocketMessage = 
  | {
      type: 'pixelPlaced';
      data: Pixel;
    }
  | {
      type: 'cooldownViolation';
      message: string;
    }
  | {
      type: 'cooldownStatus';
      data: {
        canPlace: boolean;
        remaining: number;
      };
    }
  | {
      type: 'agentMessage';
      data: AgentMessage;
    }
  | {
      type: 'recentMessages';
      data: AgentMessage[];
    };