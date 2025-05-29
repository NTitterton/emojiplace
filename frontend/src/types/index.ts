export interface Pixel {
  x: number;
  y: number;
  emoji: string;
  placedBy: string;
  username?: string;
  timestamp: number;
}

export interface User {
  ip: string;
  username?: string;
  lastSeen?: number;
}

export interface UserState {
  user: User;
  canPlace: boolean;
  cooldownEnd?: number;
}

export interface WebSocketMessage {
  type: string;
  data?: any;
  message?: string;
} 