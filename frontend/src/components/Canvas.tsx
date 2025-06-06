'use client';

import { useRef, useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
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
const DRAG_THRESHOLD_PX = 5; // Minimum pixel movement to be considered a drag

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
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 }); // For calculating drag deltas
  const mouseDownPositionRef = useRef({ x: 0, y: 0 }); // For detecting click vs drag
  const hasDraggedRef = useRef(false);

  const [hoveredPixel, setHoveredPixel] = useState<Pixel | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<{ x: number; y: number } | null>(null);
  const [mousePosition, setMousePosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });

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

    // Draw dot grid
    ctx.fillStyle = '#ddd'; // Color of the dots
    const dotRadius = 1; // Radius of the dots

    // Iterate through visible grid cells based on viewport
    // Ensure we cover cells that might be partially visible due to fractional viewportX/Y
    const startGridX = Math.floor(viewportX);
    const endGridX = Math.ceil(viewportX + VIEWPORT_WIDTH);
    const startGridY = Math.floor(viewportY);
    const endGridY = Math.ceil(viewportY + VIEWPORT_HEIGHT);

    for (let gridX = startGridX; gridX < endGridX; gridX++) {
      for (let gridY = startGridY; gridY < endGridY; gridY++) {
        // Calculate the center of the cell on the canvas
        const canvasX = (gridX - viewportX) * PIXEL_SIZE + PIXEL_SIZE / 2;
        const canvasY = (gridY - viewportY) * PIXEL_SIZE + PIXEL_SIZE / 2;

        // Draw dot if it's within canvas bounds (optional, but good practice)
        if (canvasX >= 0 && canvasX <= canvas.width && canvasY >= 0 && canvasY <= canvas.height) {
      ctx.beginPath();
          ctx.arc(canvasX, canvasY, dotRadius, 0, 2 * Math.PI);
          ctx.fill();
        }
      }
    }

    // Draw pixels (emojis)
    ctx.font = `${PIXEL_SIZE - 4}px Arial`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Iterate through actual pixel data to draw emojis
    // The range for drawing emojis should be based on the actual pixel data available
    // and the current viewport to optimize rendering.
    pixels.forEach(pixel => {
      // Check if the pixel is within the current, potentially fractional, viewport
      if (
        pixel.x >= Math.floor(viewportX) -1 &&
        pixel.x < Math.ceil(viewportX) + VIEWPORT_WIDTH +1 &&
        pixel.y >= Math.floor(viewportY) -1 &&
        pixel.y < Math.ceil(viewportY) + VIEWPORT_HEIGHT +1
      ) {
        const canvasX = (pixel.x - viewportX) * PIXEL_SIZE;
        const canvasY = (pixel.y - viewportY) * PIXEL_SIZE;

        // Only draw if emoji is actually visible on canvas after viewport transformation
        if (canvasX + PIXEL_SIZE > 0 && canvasX < canvas.width &&
            canvasY + PIXEL_SIZE > 0 && canvasY < canvas.height) {
          ctx.fillText(
            pixel.emoji,
            canvasX + PIXEL_SIZE / 2,
            canvasY + PIXEL_SIZE / 2
          );
        }
      }
    });

    // Highlight hovered pixel
    if (hoveredPixel) {
      const canvasX = (hoveredPixel.x - viewportX) * PIXEL_SIZE;
      const canvasY = (hoveredPixel.y - viewportY) * PIXEL_SIZE;
      
      // Check if the highlight is within canvas bounds
      if (canvasX + PIXEL_SIZE > 0 && canvasX < canvas.width &&
          canvasY + PIXEL_SIZE > 0 && canvasY < canvas.height) {
      ctx.strokeStyle = '#007bff';
      ctx.lineWidth = 2;
      ctx.strokeRect(canvasX, canvasY, PIXEL_SIZE, PIXEL_SIZE);
      }
    }
  }, [pixels, viewportX, viewportY, hoveredPixel, pixelMap]);

  useEffect(() => {
    drawCanvas();
  }, [drawCanvas]);

  const getPixelCoordinates = (clientX: number, clientY: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    const x = Math.floor((clientX - rect.left) / PIXEL_SIZE + viewportX);
    const y = Math.floor((clientY - rect.top) / PIXEL_SIZE + viewportY);

    return { x, y };
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY }); // For delta calculations
    mouseDownPositionRef.current = { x: e.clientX, y: e.clientY }; // For click vs drag detection
    hasDraggedRef.current = false;
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    setMousePosition({ x: e.clientX, y: e.clientY }); // For tooltip

    if (isDragging) {
      const currentX = e.clientX;
      const currentY = e.clientY;

      // Check for total movement since mousedown to qualify as a drag
      const totalMovedX = Math.abs(currentX - mouseDownPositionRef.current.x);
      const totalMovedY = Math.abs(currentY - mouseDownPositionRef.current.y);

      if (totalMovedX > DRAG_THRESHOLD_PX || totalMovedY > DRAG_THRESHOLD_PX) {
        hasDraggedRef.current = true;
      }

      // Viewport update logic (uses dragStart state for incremental deltas)
      const deltaViewportX = (dragStart.x - currentX) / PIXEL_SIZE;
      const deltaViewportY = (dragStart.y - currentY) / PIXEL_SIZE;
      
      if (deltaViewportX !== 0 || deltaViewportY !== 0) {
        onViewportChange(viewportX + deltaViewportX, viewportY + deltaViewportY);
        setDragStart({ x: currentX, y: currentY }); // Update dragStart for the next segment
      }
      
      setTooltipPosition(null); // Hide tooltip while dragging
      setHoveredPixel(null);
    } else {
      // Hover logic (existing)
      const coords = getPixelCoordinates(e.clientX, e.clientY);
      if (coords) {
        const pixel = pixelMap.get(`${coords.x},${coords.y}`);
        setHoveredPixel(pixel || null);
        onPixelHover(pixel || null);
        
        if (pixel) {
          console.log('Setting tooltip for pixel:', pixel, 'at position:', e.clientX, e.clientY);
          setTooltipPosition({ x: e.clientX, y: e.clientY });
        } else {
          setTooltipPosition(null);
        }
      } else {
        setHoveredPixel(null);
        setTooltipPosition(null);
        onPixelHover(null);
      }
    }
  };

  const handleMouseUp = (e: React.MouseEvent) => {
    if (isDragging && !hasDraggedRef.current) {
      // This was a click, not a drag
      const coords = getPixelCoordinates(e.clientX, e.clientY);
      if (coords) {
        onPixelClick(coords.x, coords.y);
      }
    }
    setIsDragging(false);
    // hasDraggedRef is reset on next mousedown
  };

  const handleMouseLeave = () => {
    setIsDragging(false);
    setHoveredPixel(null);
    setTooltipPosition(null);
    onPixelHover(null);
  };

  const renderTooltip = () => {
    if (!hoveredPixel || (!tooltipPosition && !mousePosition)) {
      return null;
    }

    const x = tooltipPosition?.x || mousePosition.x;
    const y = tooltipPosition?.y || mousePosition.y;

    console.log('Rendering tooltip at:', x, y, 'for pixel:', hoveredPixel);

    return (
      <div
        className="fixed bg-black text-white text-xs rounded px-2 py-1 pointer-events-none shadow-lg whitespace-nowrap"
        style={{
          left: x + 15,
          top: y - 60,
          zIndex: 99999,
          position: 'fixed'
        }}
      >
        <div>📍 ({hoveredPixel.x}, {hoveredPixel.y})</div>
        <div>👤 {hoveredPixel.username}</div>
        <div>🕒 {new Date(hoveredPixel.timestamp).toLocaleTimeString()}</div>
      </div>
    );
  };

  return (
    <>
      <div className="relative inline-block">
    <canvas
      ref={canvasRef}
      width={VIEWPORT_WIDTH * PIXEL_SIZE}
      height={VIEWPORT_HEIGHT * PIXEL_SIZE}
      className="border border-gray-300 cursor-pointer select-none"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
        />
      </div>
      
      {typeof window !== 'undefined' && createPortal(renderTooltip(), document.body)}
    </>
  );
} 