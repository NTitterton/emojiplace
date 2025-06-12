export interface Pixel {
  x: number;
  y: number;
  emoji: string;
  username: string;
  lastModified: string;
}

export type WebSocketMessage = 
  | {
      type: 'pixelPlaced';
      data: Pixel;
    }
  | {
      type: 'cooldownViolation';
      message: string;
    };