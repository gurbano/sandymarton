import { useState, useEffect, useRef } from 'react';
import type { RefObject } from 'react';

interface UseTextureControlsProps {
  canvasSize: number;
  initialPixelSize?: number;
}

interface TextureControls {
  pixelSize: number;
  center: { x: number; y: number };
  centerRef: RefObject<{ x: number; y: number }>;
  isDragging: boolean;
  setCenter: (center: { x: number; y: number }) => void;
}

export function useTextureControls({
  canvasSize,
  initialPixelSize = .3,
}: UseTextureControlsProps): TextureControls {
  const [pixelSize, setPixelSize] = useState(initialPixelSize);
  const [center, setCenter] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Ref for high-frequency updates (camera follow) without triggering re-renders
  const centerRef = useRef({ x: 0, y: 0 });

  // Keep ref in sync when state changes (manual pan, reset, etc.)
  useEffect(() => {
    centerRef.current = center;
  }, [center]);

  // Mouse wheel for zoom
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();

      setPixelSize((prev) => {
        // deltaY is positive when scrolling down, negative when scrolling up
        const delta = e.deltaY > 0 ? 1 : -1;
        const newSize = prev + delta;

        // Clamp between 1 and 256
        return Math.max(1, Math.min(256, newSize));
      });
    };

    window.addEventListener('wheel', handleWheel, { passive: false });
    return () => window.removeEventListener('wheel', handleWheel);
  }, []);

  // Right-click drag for panning
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      // Only right mouse button (button 2)
      if (e.button === 2) {
        e.preventDefault();
        setIsDragging(true);
        setDragStart({ x: e.clientX, y: e.clientY });
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;

      const deltaX = e.clientX - dragStart.x;
      const deltaY = e.clientY - dragStart.y;

      // Convert screen pixels to texture coordinates
      // Negative because dragging right should move view left (showing content to the right)
      const moveScale = (pixelSize / canvasSize) * (512 / (pixelSize * pixelSize));

      setCenter((prev) => ({
        x: prev.x - deltaX * moveScale,
        y: prev.y + deltaY * moveScale, // Y is inverted in screen coordinates
      }));

      setDragStart({ x: e.clientX, y: e.clientY });
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (e.button === 2) {
        setIsDragging(false);
      }
    };

    const handleContextMenu = (e: MouseEvent) => {
      e.preventDefault(); // Prevent right-click context menu
    };

    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('contextmenu', handleContextMenu);

    return () => {
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('contextmenu', handleContextMenu);
    };
  }, [isDragging, dragStart, pixelSize, canvasSize]);

  return {
    pixelSize,
    center,
    centerRef,
    isDragging,
    setCenter,
  };
}
