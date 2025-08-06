'use client';

import { AgentMessage } from '../types';

interface MessagesDisplayProps {
  messages: AgentMessage[];
  isCollapsed: boolean;
  onToggle: () => void;
}

export default function MessagesDisplay({ messages, isCollapsed, onToggle }: MessagesDisplayProps) {
  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100vw',
      height: '100vh',
      backgroundColor: 'rgba(0, 255, 0, 0.5)',
      zIndex: 99999
    }}>
      <h1>This is the Messages Display Component</h1>
    </div>
  );
}
