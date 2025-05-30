'use client';

import { useState, useEffect, useCallback } from 'react';
import Canvas from '../components/Canvas';
import EmojiPicker from '../components/EmojiPicker';
import { Pixel, UserState, WebSocketMessage } from '../types';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001';

export default function Home() {
  const [pixels, setPixels] = useState<Pixel[]>([]);
  const [selectedEmoji, setSelectedEmoji] = useState('😀');
  const [userState, setUserState] = useState<UserState | null>(null);
  const [hoveredPixel, setHoveredPixel] = useState<Pixel | null>(null);
  const [viewportX, setViewportX] = useState(0);
  const [viewportY, setViewportY] = useState(0);
  const [jumpCoords, setJumpCoords] = useState({ x: '', y: '' });
  const [username, setUsername] = useState('');
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [cooldownTime, setCooldownTime] = useState<number | null>(null);

  // WebSocket connection
  useEffect(() => {
    const websocket = new WebSocket(WS_URL);
    
    websocket.onopen = () => {
      console.log('WebSocket connected');
      setWs(websocket);
    };
    
    websocket.onmessage = (event) => {
      const message: WebSocketMessage = JSON.parse(event.data);
      
      switch (message.type) {
        case 'pixel_placed':
          setPixels(prev => {
            const newPixels = prev.filter(p => !(p.x === message.data.x && p.y === message.data.y));
            return [...newPixels, message.data];
          });
          break;
        case 'place_error':
          alert(message.message);
          if (message.cooldownEnd) {
            setCooldownTime(message.cooldownEnd);
          }
          break;
        case 'place_success':
          fetchUserState();
          break;
      }
    };
    
    websocket.onclose = () => {
      console.log('WebSocket disconnected');
      setWs(null);
    };
    
    return () => {
      websocket.close();
    };
  }, []);

  // Fetch initial data
  useEffect(() => {
    fetchUserState();
    fetchPixels();
  }, [viewportX, viewportY]);

  // Cooldown timer
  useEffect(() => {
    if (!cooldownTime) return;
    
    const timer = setInterval(() => {
      const now = Date.now();
      if (now >= cooldownTime) {
        setCooldownTime(null);
        fetchUserState();
      }
      // Force re-render to update display every second
      setUserState(prev => prev ? { ...prev } : null);
    }, 1000);
    
    return () => clearInterval(timer);
  }, [cooldownTime]);

  const fetchUserState = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/users/me`);
      const data = await response.json();
      setUserState(data);
      
      if (data.cooldownEnd && data.cooldownEnd > Date.now()) {
        setCooldownTime(data.cooldownEnd);
      }
    } catch (error) {
      console.error('Failed to fetch user state:', error);
    }
  };

  const fetchPixels = async () => {
    try {
      // Fetch a larger region to handle fractional viewports and ensure we get all pixels
      const startX = Math.floor(viewportX) - 5;
      const startY = Math.floor(viewportY) - 5;
      const width = 60; // Increased from 50
      const height = 40; // Increased from 30
      
      const response = await fetch(
        `${API_BASE}/api/pixels/region/${startX}/${startY}/${width}/${height}`
      );
      const data = await response.json();
      setPixels(data.pixels || []);
    } catch (error) {
      console.error('Failed to fetch pixels:', error);
    }
  };

  const handlePixelClick = useCallback((x: number, y: number) => {
    if (!ws || !userState?.canPlace || cooldownTime) {
      if (cooldownTime) {
        const remainingSeconds = Math.ceil((cooldownTime - Date.now()) / 1000);
        alert(`Please wait ${remainingSeconds} seconds before placing another pixel`);
      } else {
        alert('Cannot place pixel right now');
      }
      return;
    }

    ws.send(JSON.stringify({
      type: 'place_pixel',
      payload: {
        x,
        y,
        emoji: selectedEmoji,
        username: userState.user.username
      }
    }));
  }, [ws, selectedEmoji, userState, cooldownTime]);

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
    if (!username.trim()) return;
    
    try {
      const response = await fetch(`${API_BASE}/api/users/username`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim() })
      });
      
      if (response.ok) {
        fetchUserState();
        setUsername('');
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
                  <div>IP: {userState.user.ip}</div>
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
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
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