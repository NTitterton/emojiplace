'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { Pixel } from '../types';

interface CanvasProps {
  pixels: Pixel[];
  onPixelClick: (x: number, y: number) => void;
  onPixelHover: (pixel: Pixel | null) => void;
  viewportX: number;
  viewportY: number;
  onViewportChange: (x: number, y: number) => void;
}

const PIXEL_SIZE = 20;
const VIEWPORT_WIDTH = 50;
const VIEWPORT_HEIGHT = 30;

export default function Canvas({
  pixels,
  onPixelClick,
  onPixelHover,
  viewportX,
  viewportY,
  onViewportChange
}: CanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [hoveredPixel, setHoveredPixel] = useState<Pixel | null>(null);

  const pixelMap = new Map();
  pixels.forEach(pixel => {
    pixelMap.set(`${pixel.x},${pixel.y}`, pixel);
  });

  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw grid
    ctx.strokeStyle = '#ddd';
    ctx.lineWidth = 1;
    
    for (let i = 0; i <= VIEWPORT_WIDTH; i++) {
      ctx.beginPath();
      ctx.moveTo(i * PIXEL_SIZE, 0);
      ctx.lineTo(i * PIXEL_SIZE, canvas.height);
      ctx.stroke();
    }
    
    for (let i = 0; i <= VIEWPORT_HEIGHT; i++) {
      ctx.beginPath();
      ctx.moveTo(0, i * PIXEL_SIZE);
      ctx.lineTo(canvas.width, i * PIXEL_SIZE);
      ctx.stroke();
    }

    // Draw pixels
    ctx.font = `${PIXEL_SIZE - 4}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    for (let x = viewportX; x < viewportX + VIEWPORT_WIDTH; x++) {
      for (let y = viewportY; y < viewportY + VIEWPORT_HEIGHT; y++) {
        const pixel = pixelMap.get(`${x},${y}`);
        if (pixel) {
          const canvasX = (x - viewportX) * PIXEL_SIZE;
          const canvasY = (y - viewportY) * PIXEL_SIZE;
          
          ctx.fillText(
            pixel.emoji,
            canvasX + PIXEL_SIZE / 2,
            canvasY + PIXEL_SIZE / 2
          );
        }
      }
    }

    // Highlight hovered pixel
    if (hoveredPixel) {
      const canvasX = (hoveredPixel.x - viewportX) * PIXEL_SIZE;
      const canvasY = (hoveredPixel.y - viewportY) * PIXEL_SIZE;
      
      ctx.strokeStyle = '#007bff';
      ctx.lineWidth = 2;
      ctx.strokeRect(canvasX, canvasY, PIXEL_SIZE, PIXEL_SIZE);
    }
  }, [pixels, viewportX, viewportY, hoveredPixel, pixelMap]);

  useEffect(() => {
    drawCanvas();
  }, [drawCanvas]);

  const getPixelCoordinates = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    const x = Math.floor((clientX - rect.left) / PIXEL_SIZE) + viewportX;
    const y = Math.floor((clientY - rect.top) / PIXEL_SIZE) + viewportY;

    return { x, y };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging) {
      const deltaX = Math.floor((dragStart.x - e.clientX) / PIXEL_SIZE);
      const deltaY = Math.floor((dragStart.y - e.clientY) / PIXEL_SIZE);
      
      if (deltaX !== 0 || deltaY !== 0) {
        onViewportChange(viewportX + deltaX, viewportY + deltaY);
        setDragStart({ x: e.clientX, y: e.clientY });
      }
    } else {
      const coords = getPixelCoordinates(e.clientX, e.clientY);
      if (coords) {
        const pixel = pixelMap.get(`${coords.x},${coords.y}`);
        setHoveredPixel(pixel || null);
        onPixelHover(pixel || null);
      }
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleClick = (e: React.MouseEvent) => {
    if (!isDragging) {
      const coords = getPixelCoordinates(e.clientX, e.clientY);
      if (coords) {
        onPixelClick(coords.x, coords.y);
      }
    }
  };

  return (
    <canvas
      ref={canvasRef}
      width={VIEWPORT_WIDTH * PIXEL_SIZE}
      height={VIEWPORT_HEIGHT * PIXEL_SIZE}
      className="border border-gray-300 cursor-pointer select-none"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={() => {
        setIsDragging(false);
        setHoveredPixel(null);
        onPixelHover(null);
      }}
      onClick={handleClick}
    />
  );
} 