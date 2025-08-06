'use client';

import { AgentMessage } from '../types';

interface MessagesDisplayProps {
  messages: AgentMessage[];
  isCollapsed: boolean;
  onToggle: () => void;
}

const formatAgentName = (agentId: string) => {
  const names: Record<string, string> = {
    'claude-4-sonnet': 'Claude',
    'gemini-2.5-pro': 'Gemini',
    'openai-o3': 'OpenAI',
  };
  return names[agentId] || agentId;
};

const getAgentColor = (agentId: string) => {
  const colors: Record<string, string> = {
    'claude-4-sonnet': 'text-orange-600',
    'gemini-2.5-pro': 'text-blue-600',
    'openai-o3': 'text-green-600',
  };
  return colors[agentId] || 'text-gray-600';
};

const formatTimeAgo = (timestamp: number) => {
  const now = Date.now();
  const diff = now - timestamp;
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return `${seconds}s ago`;
};

export default function MessagesDisplay({ messages, isCollapsed, onToggle }: MessagesDisplayProps) {
  const sortedMessages = [...messages].sort((a, b) => b.timestamp - a.timestamp);
  const recentMessages = sortedMessages.slice(0, 5);

  return (
    <div style={{
      position: 'fixed',
      bottom: '1rem',
      right: '1rem',
      width: '20rem',
      maxWidth: 'calc(100vw - 2rem)',
      zIndex: 50
    }}>
      {/* Header */}
      <div
        onClick={onToggle}
        className="bg-white/90 backdrop-blur-sm rounded-t-lg shadow-lg border border-gray-200 p-3 cursor-pointer hover:bg-white/95 transition-colors"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></div>
            <h3 className="font-semibold text-sm text-gray-800">AI Agent Chat</h3>
            {messages.length > 0 && (
              <span className="bg-blue-100 text-blue-800 text-xs px-2 py-0.5 rounded-full">
                {messages.length}
              </span>
            )}
          </div>
          {isCollapsed ? (
            <span className="text-gray-500">▲</span>
          ) : (
            <span className="text-gray-500">▼</span>
          )}
        </div>
      </div>

      {/* Messages Content */}
      {!isCollapsed && (
        <div className="bg-white/90 backdrop-blur-sm rounded-b-lg shadow-lg border-l border-r border-b border-gray-200 max-h-80 overflow-hidden">
          {recentMessages.length > 0 ? (
            <div className="overflow-y-auto max-h-80">
              {recentMessages.map((message, index) => (
                <div
                  key={message.messageId}
                  className={`p-3 border-b border-gray-100 last:border-b-0 ${
                    index % 2 === 0 ? 'bg-gray-50/30' : 'bg-white/30'
                  }`}
                >
                  <div className="flex items-start justify-between text-xs text-gray-500 mb-1">
                    <div className="flex items-center space-x-1">
                      <span className={`font-medium ${getAgentColor(message.from)}`}>
                        {formatAgentName(message.from)}
                      </span>
                      <span>→</span>
                      <span className={`font-medium ${getAgentColor(message.to)}`}>
                        {formatAgentName(message.to)}
                      </span>
                    </div>
                    <span>{formatTimeAgo(message.timestamp)}</span>
                  </div>
                  <p className="text-sm text-gray-700 leading-relaxed">
                    {message.content}
                  </p>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-6 text-center text-gray-500">
              <div className="text-2xl mb-2">🤖</div>
              <p className="text-sm">No messages yet</p>
              <p className="text-xs mt-1">AI agents will communicate here</p>
            </div>
          )}

          {messages.length > 5 && (
            <div className="p-2 text-center text-xs text-gray-500 bg-gray-50/50 border-t border-gray-100">
              Showing 5 of {messages.length} messages
            </div>
          )}
        </div>
      )}
    </div>
  );
}
