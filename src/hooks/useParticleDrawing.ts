import { useEffect, useCallback, useRef } from 'react';
import { WorldGeneration } from '../world/WorldGeneration';
import { ParticleType } from '../world/ParticleTypes';
import type { DataTexture } from 'three';
import { WORLD_SIZE } from '../constants/worldConstants';

interface UseParticleDrawingProps {
  worldGen: WorldGeneration;
  selectedParticle: ParticleType;
  pixelSize: number;
  center: { x: number; y: number };
  onDraw: (newTexture: DataTexture) => void;
  worldTexture: DataTexture;
}

export function useParticleDrawing({
  worldGen,
  selectedParticle,
  pixelSize,
  center,
  onDraw,
  worldTexture,
}: UseParticleDrawingProps) {
  const isDrawingRef = useRef(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastMousePosRef = useRef<{ x: number; y: number } | null>(null);
  const drawIntervalRef = useRef<number | null>(null);

  // Convert screen coordinates to world texture coordinates
  // This mirrors the shader logic exactly
  const screenToWorld = useCallback((screenX: number, screenY: number): { x: number; y: number } | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();

    // Convert to canvas-relative coordinates
    const canvasX = screenX - rect.left;
    const canvasY = screenY - rect.top;

    // Convert to UV [0, 1]
    // IMPORTANT: Invert Y because screen Y increases downward, but UV Y increases upward
    const uvX = canvasX / rect.width;
    const uvY = 1.0 - (canvasY / rect.height);

    // Check bounds
    if (uvX < 0 || uvX > 1 || uvY < 0 || uvY > 1) {
      return null;
    }

    // MATCH SHADER EXACTLY:
    // vec2 pixelCoord = vUv * uCanvasSize;
    const pixelCoordX = uvX * rect.width;
    const pixelCoordY = uvY * rect.height;

    // vec2 particleCoord = floor(pixelCoord / uPixelSize);
    const particleCoordX = Math.floor(pixelCoordX / pixelSize);
    const particleCoordY = Math.floor(pixelCoordY / pixelSize);

    // float particlesInView = uCanvasSize.x / uPixelSize;
    const particlesInView = rect.width / pixelSize;

    // vec2 viewCenter = vec2(particlesInView) / 2.0;
    const viewCenterX = particlesInView / 2.0;
    const viewCenterY = particlesInView / 2.0;

    // vec2 worldParticleCoord = particleCoord - viewCenter + uCenter;
    const worldParticleX = particleCoordX - viewCenterX + center.x;
    const worldParticleY = particleCoordY - viewCenterY + center.y;

    // vec2 texUV = (worldParticleCoord + vec2(1024.0, 1024.0)) / uTextureSize;
    // We want the inverse: texture coordinates to world coordinates
    const worldX = Math.floor(worldParticleX + WORLD_SIZE / 2);
    const worldY = Math.floor(worldParticleY + WORLD_SIZE / 2);

    return { x: worldX, y: worldY };
  }, [pixelSize, center]);

  const drawParticle = useCallback((screenX: number, screenY: number) => {
    const worldPos = screenToWorld(screenX, screenY);
    if (!worldPos) return;

    // Draw particles in a small radius around the cursor
    const brushRadius = 3; // Brush radius in pixels

    for (let dy = -brushRadius; dy <= brushRadius; dy++) {
      for (let dx = -brushRadius; dx <= brushRadius; dx++) {
        // Use circular brush
        const distSq = dx * dx + dy * dy;
        if (distSq <= brushRadius * brushRadius) {
          const drawX = worldPos.x + dx;
          const drawY = worldPos.y + dy;

          // Draw the particle directly on the texture
          worldGen.setParticleOnTexture(worldTexture, drawX, drawY, {
            type: selectedParticle,
            velocityX: 0,
            velocityY: 0,
          });
        }
      }
    }

    // Trigger redraw (texture is already updated in-place)
    onDraw(worldTexture);
  }, [worldTexture, worldGen, selectedParticle, screenToWorld, onDraw]);

  useEffect(() => {
    // Store canvas element reference
    const findCanvas = () => {
      const canvas = document.querySelector('canvas');
      if (canvas) {
        canvasRef.current = canvas;
      }
    };

    // Find canvas after a short delay to ensure it's mounted
    setTimeout(findCanvas, 100);

    const handleMouseDown = (e: MouseEvent) => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      // Check if click is within canvas bounds
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX;
      const y = e.clientY;

      if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
        return; // Click is outside canvas
      }

      // Only left mouse button (button 0)
      if (e.button === 0) {
        isDrawingRef.current = true;
        lastMousePosRef.current = { x: e.clientX, y: e.clientY };

        // Draw immediately
        drawParticle(e.clientX, e.clientY);

        // Start continuous drawing interval
        if (drawIntervalRef.current !== null) {
          clearInterval(drawIntervalRef.current);
        }
        drawIntervalRef.current = window.setInterval(() => {
          if (isDrawingRef.current && lastMousePosRef.current) {
            drawParticle(lastMousePosRef.current.x, lastMousePosRef.current.y);
          }
        }, 50); // Draw every 50ms while holding
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (isDrawingRef.current) {
        const canvas = canvasRef.current;
        if (!canvas) return;

        // Check if mouse is within canvas bounds
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX;
        const y = e.clientY;

        if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
          return; // Mouse is outside canvas
        }

        lastMousePosRef.current = { x: e.clientX, y: e.clientY };
        drawParticle(e.clientX, e.clientY);
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (e.button === 0) {
        isDrawingRef.current = false;
        lastMousePosRef.current = null;

        // Clear the drawing interval
        if (drawIntervalRef.current !== null) {
          clearInterval(drawIntervalRef.current);
          drawIntervalRef.current = null;
        }
      }
    };

    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);

      // Clean up interval on unmount
      if (drawIntervalRef.current !== null) {
        clearInterval(drawIntervalRef.current);
        drawIntervalRef.current = null;
      }
    };
  }, [drawParticle]);
}
