import { useState, useEffect } from 'react';

interface UseTextureControlsProps {
  canvasSize: number;
  initialPixelSize?: number;
}

interface TextureControls {
  pixelSize: number;
  center: { x: number; y: number };
  isDragging: boolean;
}

export function useTextureControls({
  canvasSize,
  initialPixelSize = 16,
}: UseTextureControlsProps): TextureControls {
  const [pixelSize, setPixelSize] = useState(initialPixelSize);
  const [center, setCenter] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

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

  // Mouse drag for panning
  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      setIsDragging(true);
      setDragStart({ x: e.clientX, y: e.clientY });
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;

      const deltaX = e.clientX - dragStart.x;
      const deltaY = e.clientY - dragStart.y;

      // Convert screen pixels to texture coordinates
      // Negative because dragging right should move view left (showing content to the right)
      const moveScale = (pixelSize / canvasSize) * (128 / pixelSize);

      setCenter((prev) => ({
        x: prev.x - deltaX * moveScale,
        y: prev.y + deltaY * moveScale, // Y is inverted in screen coordinates
      }));

      setDragStart({ x: e.clientX, y: e.clientY });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('mouseleave', handleMouseUp);

    return () => {
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('mouseleave', handleMouseUp);
    };
  }, [isDragging, dragStart, pixelSize, canvasSize]);

  return {
    pixelSize,
    center,
    isDragging,
  };
}
