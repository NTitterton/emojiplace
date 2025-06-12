'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import useWebSocket, { ReadyState } from 'react-use-websocket';
import { Pixel, WebSocketMessage } from '../types';
import Canvas, { CanvasRef } from '../components/Canvas';
import EmojiPicker from '../components/EmojiPicker';
import { v4 as uuidv4 } from 'uuid';

// Helper to get or set a unique user ID from local storage
const getUserId = () => {
  if (typeof window !== 'undefined') {
    let uid = localStorage.getItem('emojiPlaceUserId');
    if (!uid) {
      uid = uuidv4();
      localStorage.setItem('emojiPlaceUserId', uid);
    }
    return uid;
  }
  return null;
};

// Tooltip component for hover info and cooldown messages
const Tooltip = ({ content, position }: { content: React.ReactNode, position: { x: number, y: number } | null }) => {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!content || !position || !mounted) return null;

  // Render in a portal to escape parent styling and prevent hover conflicts
  return createPortal(
    <div
      className="absolute top-0 left-0 bg-gray-800 text-white text-sm rounded-md shadow-lg p-2 z-50 pointer-events-none"
      style={{
        transform: `translate(${position.x + 15}px, ${position.y + 15}px)`,
      }}
    >
      {content}
    </div>,
    document.body
  );
};


export default function Home() {
  const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001';
  const canvasRef = useRef<CanvasRef>(null);
  const [userId] = useState(getUserId());
  const [username, setUsername] = useState('guest');
  const [tempUsername, setTempUsername] = useState('guest');
  const [pixels, setPixels] = useState<Record<string, Pixel>>({});
  const [selectedEmoji, setSelectedEmoji] = useState('😀');
  const [tooltip, setTooltip] = useState<{ content: React.ReactNode; position: { x: number, y: number } | null } | null>(null);
  const [jumpCoords, setJumpCoords] = useState({ x: '0', y: '0' });

  const { lastMessage, sendJsonMessage, readyState } = useWebSocket(wsUrl, {
    onOpen: () => console.log('WebSocket connected'),
    onClose: () => console.log('WebSocket disconnected'),
    shouldReconnect: (closeEvent) => true,
  });

  useEffect(() => {
    if (lastMessage !== null) {
      const message: WebSocketMessage = JSON.parse(lastMessage.data as string);
      switch (message.type) {
        case 'pixelPlaced':
          setPixels(prev => ({ ...prev, [`${message.data.x},${message.data.y}`]: message.data }));
          break;
        case 'cooldownViolation':
          setTooltip({
            content: <div className="text-red-400">{message.message}</div>,
            // Position in center of screen for alerts
            position: { x: window.innerWidth / 2, y: window.innerHeight / 2 },
          });
          setTimeout(() => setTooltip(null), 2000); // Hide after 2 seconds
          break;
      }
    }
  }, [lastMessage]);

  const handleSetUsername = () => {
    setUsername(tempUsername);
  };
  
  const handlePixelClick = useCallback((x: number, y: number) => {
    if (readyState === ReadyState.OPEN) {
      sendJsonMessage({
        type: 'placePixel',
        data: { x, y, emoji: selectedEmoji, username: username || 'guest' }
      });
    } else {
      console.log('WebSocket is not connected.');
    }
  }, [readyState, sendJsonMessage, selectedEmoji, username]);

  const handlePixelHover = useCallback((pixel: Pixel | null, mouseX: number, mouseY: number) => {
    if (pixel) {
      setTooltip({
        content: (
          <div>
            <p className="font-bold">{pixel.emoji}</p>
            <p>Placed by: {pixel.username}</p>
            <p>At: {new Date(pixel.lastModified).toLocaleString()}</p>
          </div>
        ),
        position: { x: mouseX, y: mouseY },
      });
    } else {
      setTooltip(null);
    }
  }, []);

  const handleJumpTo = () => {
    const x = parseInt(jumpCoords.x, 10);
    const y = parseInt(jumpCoords.y, 10);
    if (!isNaN(x) && !isNaN(y)) {
      canvasRef.current?.jumpTo(x, y);
    }
  };

  const connectionStatus = {
    [ReadyState.CONNECTING]: 'Connecting...',
    [ReadyState.OPEN]: 'Connected',
    [ReadyState.CLOSING]: 'Closing...',
    [ReadyState.CLOSED]: 'Disconnected',
    [ReadyState.UNINSTANTIATED]: 'Uninstantiated',
  }[readyState];

  return (
    // Main container for the full-screen layout
    <main className="h-screen w-screen bg-gray-100 relative overflow-hidden">
      <Tooltip content={tooltip?.content} position={tooltip?.position} />
      
      {/* Canvas takes up the full space in the background */}
      <div className="absolute top-0 left-0 w-full h-full z-0">
        <Canvas
          ref={canvasRef}
          pixels={pixels}
          onPixelClick={handlePixelClick}
          onPixelHover={handlePixelHover}
        />
      </div>

      {/* Floating UI Panel */}
      <div className="absolute top-4 left-4 bg-white/80 backdrop-blur-sm rounded-lg shadow-xl p-4 space-y-4 max-w-sm z-10">
        <h1 className="text-2xl font-bold">EmojiPlace</h1>
        <p className="text-sm text-gray-600">Connection: {connectionStatus}</p>
        
        {/* User Info Section */}
        <div>
            <h2 className="font-bold">Hello, {username}!</h2>
            <div className="flex items-center space-x-2 mt-1">
                <input
                    type="text"
                    value={tempUsername}
                    onChange={(e) => setTempUsername(e.target.value)}
                    className="border rounded px-2 py-1 text-sm w-full"
                    placeholder="Enter username"
                />
                <button onClick={handleSetUsername} className="bg-blue-500 text-white rounded px-3 py-1 text-sm flex-shrink-0">Set</button>
            </div>
        </div>
        
        {/* Jump To Section */}
        <div>
            <h2 className="font-bold">Jump to Coordinate</h2>
            <div className="flex items-center space-x-2 mt-1">
                <input
                    type="number"
                    value={jumpCoords.x}
                    onChange={(e) => setJumpCoords(c => ({...c, x: e.target.value}))}
                    className="border rounded px-2 py-1 text-sm w-full"
                    placeholder="X"
                />
                <input
                    type="number"
                    value={jumpCoords.y}
                    onChange={(e) => setJumpCoords(c => ({...c, y: e.target.value}))}
                    className="border rounded px-2 py-1 text-sm w-full"
                    placeholder="Y"
                />
                <button onClick={handleJumpTo} className="bg-green-500 text-white rounded px-3 py-1 text-sm flex-shrink-0">Jump</button>
            </div>
        </div>
        
        {/* Emoji Picker */}
        <div>
            <h2 className="font-bold">Select Emoji</h2>
            <EmojiPicker onEmojiSelect={setSelectedEmoji} selectedEmoji={selectedEmoji} />
        </div>
      </div>
    </main>
  );
} 