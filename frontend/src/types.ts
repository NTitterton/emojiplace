export interface Pixel {
  x: number;
  y: number;
  emoji: string;
  username: string;
  userId: string; // This line is important
  timestamp: string;
}

export interface User {
  userId: string; // And this line
  username: string;
}

export interface UserState {
  user: User;
  canPlace: boolean;
}

export interface WebSocketMessage {
  type: 'pixel_placed' | 'place_error' | 'place_success';
  data?: any;
  message?: string;
  cooldownEnd?: number;
}