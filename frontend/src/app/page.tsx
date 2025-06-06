'use client';

import { useState, useEffect, useCallback } from 'react';
import { v4 as uuidv4 } from 'uuid';
import Canvas from '../components/Canvas';
import EmojiPicker from '../components/EmojiPicker';
import { Pixel, UserState, WebSocketMessage } from '../types';

const API_BASE = process.env.NEXT_PUBLIC_API_BASE;
const WS_URL = process.env.NEXT_PUBLIC_WS_URL;

console.log("API_BASE:", API_BASE);
console.log("WS_URL:", WS_URL);

// Function to get or create a userId from localStorage
const getUserId = () => {
  if (typeof window === 'undefined') return null;
  let userId = localStorage.getItem('emojiplace_userId');
  if (!userId) {
    userId = uuidv4();
    localStorage.setItem('emojiplace_userId', userId);
  }
  return userId;
};

export default function Home() {
  const [pixels, setPixels] = useState<Pixel[]>([]);
  const [selectedEmoji, setSelectedEmoji] = useState('😀');
  const [userState, setUserState] = useState<UserState | null>(null);
  const [hoveredPixel, setHoveredPixel] = useState<Pixel | null>(null);
  const [viewportX, setViewportX] = useState(0);
  const [viewportY, setViewportY] = useState(0);
  const [jumpCoords, setJumpCoords] = useState({ x: '', y: '' });
  const [usernameInput, setUsernameInput] = useState('');
  const [userId, setUserId] = useState<string | null>(null);
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [cooldownTime, setCooldownTime] = useState<number | null>(null);

  // Set userId on initial client-side load
  useEffect(() => {
    setUserId(getUserId());
  }, []);

  // WebSocket connection
  useEffect(() => {
    if (!userId || !WS_URL) return;

    const websocket = new WebSocket(`${WS_URL}?userId=${userId}`);
    
    websocket.onopen = () => console.log('WebSocket connected');
    
    websocket.onmessage = (event) => {
      const message: WebSocketMessage = JSON.parse(event.data);
      if (message.type === 'pixel_placed') {
        fetchPixels(); // Refetch all pixels for simplicity
      }
    };
    
    websocket.onclose = () => console.log('WebSocket disconnected');
    setWs(websocket);
    
    return () => websocket.close();
  }, [userId]);

  // Fetch initial data & poll for cooldown status
  useEffect(() => {
    if (!userId) return;

    fetchUserState();
    fetchPixels();

    const interval = setInterval(() => {
      fetchUserState();
    }, 5000); // Poll every 5 seconds

    return () => clearInterval(interval);
  }, [userId]);

  const fetchUserState = async () => {
    if (!userId) return;
    try {
      const response = await fetch(`${API_BASE}/api/users/me?userId=${userId}`);
      if (response.ok) setUserState(await response.json());
    } catch (error) {
      console.error('Failed to fetch user state:', error);
    }
  };

  const fetchPixels = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/pixels/region/0/0/1000/1000`);
      if (response.ok) setPixels(await response.json());
    } catch (error) {
      console.error('Failed to fetch pixels:', error);
    }
  };

  const handlePixelClick = useCallback((x: number, y: number) => {
    if (!ws || !userState?.canPlace) {
      alert('Cannot place pixel right now. Please wait for the cooldown.');
      return;
    }

    ws.send(JSON.stringify({
      type: 'place_pixel',
      data: { x, y, emoji: selectedEmoji }
    }));

    // Optimistically place pixel and trigger UI cooldown state
    const optimisticPixel: Pixel = { 
      x, y, emoji: selectedEmoji, 
      username: userState.user.username, 
      userId: userState.user.userId, 
      timestamp: new Date().toISOString() 
    };
    setPixels(prev => [...prev.filter(p => !(p.x === x && p.y === y)), optimisticPixel]);
    setUserState(prev => prev ? { ...prev, canPlace: false } : null);

  }, [ws, selectedEmoji, userState]);

  const handleViewportChange = useCallback((x: number, y: number) => {
    setViewportX(x);
    setViewportY(y);
  }, []);

  const handleJump = () => {
    const x = parseInt(jumpCoords.x);
    const y = parseInt(jumpCoords.y);
    
    if (!isNaN(x) && !isNaN(y)) {
      // Center the coordinates and fetch pixels immediately
      const newViewportX = x - 25;
      const newViewportY = y - 15;
      setViewportX(newViewportX);
      setViewportY(newViewportY);
      
      // Force immediate pixel fetch for the new location
      setTimeout(() => {
        fetchPixels();
      }, 100);
    }
  };

  const handleSetUsername = async () => {
    if (!userId || !usernameInput.trim()) return;
    
    try {
      const response = await fetch(`${API_BASE}/api/users/username`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, username: usernameInput.trim() })
      });
      
      if (response.ok) {
        const { user } = await response.json();
        setUserState(prev => prev ? { ...prev, user } : null);
        setUsernameInput(''); // Clear input on success
      }
    } catch (error) {
      console.error('Failed to set username:', error);
    }
  };

  const getCooldownDisplay = () => {
    if (!cooldownTime) return null;
    
    const remainingMs = cooldownTime - Date.now();
    if (remainingMs <= 0) return null;
    
    const minutes = Math.floor(remainingMs / 60000);
    const seconds = Math.floor((remainingMs % 60000) / 1000);
    
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-6xl mx-auto">
        <h1 className="text-4xl font-bold text-center mb-8">🎨 EmojiPlace</h1>
        
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-3">
            <div className="bg-white p-4 rounded-lg shadow-lg">
              <div className="mb-4 flex items-center justify-between">
                <div className="text-sm text-gray-600">
                  Viewport: ({viewportX}, {viewportY}) to ({viewportX + 49}, {viewportY + 29})
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    placeholder="X"
                    value={jumpCoords.x}
                    onChange={(e) => setJumpCoords(prev => ({ ...prev, x: e.target.value }))}
                    className="w-20 px-2 py-1 border border-gray-300 rounded"
                  />
                  <input
                    type="number"
                    placeholder="Y"
                    value={jumpCoords.y}
                    onChange={(e) => setJumpCoords(prev => ({ ...prev, y: e.target.value }))}
                    className="w-20 px-2 py-1 border border-gray-300 rounded"
                  />
                  <button
                    onClick={handleJump}
                    className="px-3 py-1 bg-blue-500 text-white rounded hover:bg-blue-600"
                  >
                    Jump
                  </button>
                </div>
              </div>
              
              <Canvas
                pixels={pixels}
                onPixelClick={handlePixelClick}
                onPixelHover={setHoveredPixel}
                viewportX={viewportX}
                viewportY={viewportY}
                onViewportChange={handleViewportChange}
              />
              
              <div className="mt-4 text-sm text-gray-600">
                Click to place emoji • Drag to move around • Hover for info
              </div>
            </div>
          </div>
          
          <div className="space-y-4">
            {/* User Info */}
            <div className="bg-white p-4 rounded-lg shadow-lg">
              <h3 className="font-semibold mb-2">User Info</h3>
              {userState && (
                <div className="space-y-2 text-sm">
                  <div>Username: {userState.user.username || 'Not set'}</div>
                  <div>Can place: {userState.canPlace ? '✅' : '❌'}</div>
                  {cooldownTime && (
                    <div className="text-red-600">
                      Cooldown: {getCooldownDisplay()}
                    </div>
                  )}
                </div>
              )}
              
              <div className="mt-3 flex gap-2">
                <input
                  type="text"
                  placeholder="Set username"
                  value={usernameInput}
                  onChange={(e) => setUsernameInput(e.target.value)}
                  className="flex-1 px-2 py-1 border border-gray-300 rounded text-sm"
                  maxLength={20}
                />
                <button
                  onClick={handleSetUsername}
                  className="px-3 py-1 bg-green-500 text-white rounded hover:bg-green-600 text-sm"
                >
                  Set
                </button>
              </div>
            </div>
            
            {/* Emoji Picker */}
            <div className="bg-white p-4 rounded-lg shadow-lg">
              <h3 className="font-semibold mb-2">Select Emoji</h3>
              <EmojiPicker
                onEmojiSelect={setSelectedEmoji}
                selectedEmoji={selectedEmoji}
              />
            </div>
            
            {/* Connection Status */}
            <div className="bg-white p-4 rounded-lg shadow-lg">
              <h3 className="font-semibold mb-2">Connection</h3>
              <div className={`text-sm ${ws ? 'text-green-600' : 'text-red-600'}`}>
                {ws ? '🟢 Connected' : '🔴 Disconnected'}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 