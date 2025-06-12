'use client';

import { useRef, useEffect, useState, useCallback, useImperativeHandle, forwardRef, memo } from 'react';
import { createPortal } from 'react-dom';
import { Pixel } from '../types';

// A custom hook for debouncing
function useDebouncedCallback<A extends any[]>(
  callback: (...args: A) => void,
  wait: number
) {
  const argsRef = useRef<A>();
  const timeout = useRef<ReturnType<typeof setTimeout>>();

  function cleanup() {
    if (timeout.current) {
      clearTimeout(timeout.current);
    }
  }

  useEffect(() => cleanup, []);

  return function debouncedCallback(...args: A) {
    argsRef.current = args;
    cleanup();
    timeout.current = setTimeout(() => {
      if (argsRef.current) {
        callback(...argsRef.current);
      }
    }, wait);
  };
}

const API_BASE = process.env.NEXT_PUBLIC_API_BASE;
const CHUNK_SIZE = 100; // Must match backend CHUNK_SIZE

interface CanvasProps {
  pixels: Record<string, Pixel>; // Now an object for efficient lookups
  onPixelClick: (x: number, y: number) => void;
  onPixelHover: (pixel: Pixel | null, mouseX: number, mouseY: number) => void;
}

const MIN_PIXEL_SIZE = 5;
const MAX_PIXEL_SIZE = 50;

// The ref will expose a jumpTo function
export interface CanvasRef {
  jumpTo(x: number, y: number): void;
}

const Canvas = forwardRef<CanvasRef, CanvasProps>(({ pixels, onPixelClick, onPixelHover }, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isInitialResize = useRef(true);
  
  // Viewport is now centered dynamically on load by the effect below
  const [viewport, setViewport] = useState({ x: 0, y: 0, scale: 20 });
  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;
  
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const dragDistance = useRef(0);
  const [loadedChunks, setLoadedChunks] = useState<Set<string>>(new Set());
  const [pixelData, setPixelData] = useState<Record<string, Pixel>>({});

  // Merge broadcasted pixels with fetched chunk pixels
  useEffect(() => {
    setPixelData(prev => ({ ...prev, ...pixels }));
  }, [pixels]);

  // This function is stable and won't be re-created on each render
  const fetchChunk = useCallback(async (chunkX: number, chunkY: number) => {
    const chunkId = `${chunkX},${chunkY}`;
    // We access loadedChunks via a function to get the latest state
    // This avoids adding loadedChunks to useCallback's dependencies
    setLoadedChunks(currentLoadedChunks => {
      if (currentLoadedChunks.has(chunkId) || !API_BASE) {
        return currentLoadedChunks;
      }
      
      console.log(`Fetching chunk: ${chunkId}`);

      (async () => {
        try {
          const response = await fetch(`${API_BASE}/api/pixels/region/${chunkX * CHUNK_SIZE}/${chunkY * CHUNK_SIZE}`);
          if (response.redirected) {
              const chunkResponse = await fetch(response.url);
              if (chunkResponse.ok) {
                  const chunkData: Record<string, Pixel> = await chunkResponse.json();
                  setPixelData(prev => ({ ...prev, ...chunkData }));
              }
          } else if (response.ok) {
            const chunkData: Record<string, Pixel> = await response.json();
            setPixelData(prev => ({ ...prev, ...chunkData }));
          } else if (!response.ok) {
              console.error(`Failed to fetch chunk ${chunkId}, status: ${response.status}`);
              // Important: If the fetch fails (e.g. 403), remove from loaded so we can retry
              setLoadedChunks(prev => {
                  const newSet = new Set(prev);
                  newSet.delete(chunkId);
                  return newSet;
              });
          }
        } catch (error) {
          console.error(`Failed to fetch chunk ${chunkId}:`, error);
          setLoadedChunks(prev => {
              const newSet = new Set(prev);
              newSet.delete(chunkId);
              return newSet;
          });
        }
      })();
      
      return new Set(currentLoadedChunks).add(chunkId);
    });
  }, []); // No dependencies, this function is created only once

  const fetchVisibleChunks = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Use the ref to get the current viewport state without depending on it
    const { x, y, scale } = viewportRef.current;
    const startX = Math.floor(x / CHUNK_SIZE);
    const startY = Math.floor(y / CHUNK_SIZE);
    const endX = Math.floor((x + canvas.width / scale) / CHUNK_SIZE);
    const endY = Math.floor((y + canvas.height / scale) / CHUNK_SIZE);
    
    for (let cx = startX; cx <= endX; cx++) {
      for (let cy = startY; cy <= endY; cy++) {
        fetchChunk(cx, cy);
      }
    }
  }, [fetchChunk]); // Now depends only on stable fetchChunk

  // Use our new debounced hook
  const debouncedFetch = useDebouncedCallback(fetchVisibleChunks, 300);

  useEffect(() => {
    debouncedFetch();
  }, [viewport, debouncedFetch]);
  
  const drawGrid = useCallback((ctx: CanvasRenderingContext2D, width: number, height: number) => {
    const { x: viewX, y: viewY, scale } = viewport;
    
    if (scale < 8) return; // Don't draw grid if pixels are too small

    ctx.fillStyle = '#ccc';
    
    const startX = Math.floor(viewX);
    const endX = startX + Math.ceil(width / scale) + 1;
    const startY = Math.floor(viewY);
    const endY = startY + Math.ceil(height / scale) + 1;

    for (let x = startX; x <= endX; x++) {
      for (let y = startY; y <= endY; y++) {
        const canvasX = (x - viewX) * scale;
        const canvasY = (y - viewY) * scale;
        if (canvasX >= 0 && canvasX <= width && canvasY >= 0 && canvasY <= height) {
          // Offset by half the scale to center the dot in the grid cell
          ctx.fillRect(canvasX + scale / 2 - 1, canvasY + scale / 2 - 1, 2, 2);
        }
      }
    }
  }, [viewport]);

  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Draw the grid first
    drawGrid(ctx, canvas.width, canvas.height);
    
    const { x: viewX, y: viewY, scale } = viewport;

    // Draw pixels
    ctx.font = `${scale - 4}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (const key in pixelData) {
      const pixel = pixelData[key];
      const canvasX = (pixel.x - viewX) * scale;
      const canvasY = (pixel.y - viewY) * scale;

      if (canvasX + scale > 0 && canvasX < canvas.width && canvasY + scale > 0 && canvasY < canvas.height) {
        ctx.fillText(pixel.emoji, canvasX + scale / 2, canvasY + scale / 2);
      }
    }
  }, [pixelData, viewport, drawGrid]);

  useEffect(() => {
    drawCanvas();
  }, [drawCanvas]);
  
  // Mouse and interaction handlers
  const getPixelCoordinates = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor((clientX - rect.left) / viewport.scale + viewport.x);
    const y = Math.floor((clientY - rect.top) / viewport.scale + viewport.y);
    return { x, y };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });
    dragDistance.current = 0; // Reset drag distance
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      const dx = e.clientX - dragStart.x;
      const dy = e.clientY - dragStart.y;
      dragDistance.current += Math.abs(dx) + Math.abs(dy); // Accumulate distance
      setViewport(prev => ({
        ...prev,
        x: prev.x - dx / prev.scale,
        y: prev.y - dy / prev.scale,
      }));
      setDragStart({ x: e.clientX, y: e.clientY });
      onPixelHover(null, 0, 0);
    } else {
      const coords = getPixelCoordinates(e.clientX, e.clientY);
      if (coords) {
        const key = `${coords.x},${coords.y}`;
        onPixelHover(pixelData[key] || null, e.clientX, e.clientY);
      }
    }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    // Only register a click if the mouse has barely moved
    if (dragDistance.current < 5) {
      const coords = getPixelCoordinates(e.clientX, e.clientY);
      if (coords) {
        onPixelClick(coords.x, coords.y);
      }
    }
    setIsDragging(false);
  };

  // REMOVED for disabling zoom
  // const handleWheel = (e: React.WheelEvent) => {
  //   e.preventDefault();
  //   const newScale = Math.min(MAX_PIXEL_SIZE, Math.max(MIN_PIXEL_SIZE, viewport.scale - e.deltaY * 0.01));
  //   setViewport(prev => ({ ...prev, scale: newScale }));
  // };
  
  // Expose the jumpTo function via the ref
  useImperativeHandle(ref, () => ({
    jumpTo(x: number, y: number) {
      const canvas = canvasRef.current;
      if (!canvas) return;
      
      setViewport(prev => ({
        ...prev,
        // Calculate the top-left corner to center the target coordinates
        x: x - (canvas.width / prev.scale / 2),
        y: y - (canvas.height / prev.scale / 2),
      }));
    }
  }));

  // This effect runs once to set up the responsive canvas size
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Create an observer to resize the canvas element when its container changes size
    const resizeObserver = new ResizeObserver(() => {
      const { width, height } = canvas.getBoundingClientRect();
      
      // Update canvas resolution
      if (canvas.width !== width || canvas.height !== height) {
          canvas.width = width;
          canvas.height = height;
      }

      // Center the view on the very first resize
      if (isInitialResize.current) {
        isInitialResize.current = false;
        setViewport(prev => ({
          ...prev,
          x: 0 - (width / prev.scale / 2),
          y: 0 - (height / prev.scale / 2),
        }));
      }
    });

    resizeObserver.observe(canvas);
    return () => resizeObserver.disconnect();
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="block w-full h-full cursor-pointer select-none" // Use block and w-full/h-full
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={() => {
        setIsDragging(false);
        onPixelHover(null, 0, 0);
      }}
      // onWheel={handleWheel} // Zoom disabled
    />
  );
});

export default memo(Canvas); 