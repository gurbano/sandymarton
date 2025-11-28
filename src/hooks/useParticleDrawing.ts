import { useEffect, useCallback, useRef } from 'react';
import { WorldGeneration } from '../world/WorldGeneration';
import { ParticleType } from '../world/ParticleTypes';

interface UseParticleDrawingProps {
  worldGen: WorldGeneration;
  selectedParticle: ParticleType;
  pixelSize: number;
  center: { x: number; y: number };
  onDraw: () => void;
}

export function useParticleDrawing({
  worldGen,
  selectedParticle,
  pixelSize,
  center,
  onDraw,
}: UseParticleDrawingProps) {
  const isDrawingRef = useRef(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

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

    console.log('==== Screen to World Debug ====');
    console.log('Screen coords:', { x: screenX, y: screenY });
    console.log('Canvas rect:', { left: rect.left, top: rect.top, width: rect.width, height: rect.height });
    console.log('Canvas-relative:', { x: canvasX, y: canvasY });
    console.log('UV coords:', { x: uvX, y: uvY });

    // Check bounds
    if (uvX < 0 || uvX > 1 || uvY < 0 || uvY > 1) {
      return null;
    }

    // MATCH SHADER EXACTLY:
    // vec2 pixelCoord = vUv * uCanvasSize;
    const pixelCoordX = uvX * rect.width;
    const pixelCoordY = uvY * rect.height;

    console.log('Pixel coords:', { x: pixelCoordX, y: pixelCoordY });

    // vec2 particleCoord = floor(pixelCoord / uPixelSize);
    const particleCoordX = Math.floor(pixelCoordX / pixelSize);
    const particleCoordY = Math.floor(pixelCoordY / pixelSize);

    console.log('Particle coords:', { x: particleCoordX, y: particleCoordY });

    // float particlesInView = uCanvasSize.x / uPixelSize;
    const particlesInView = rect.width / pixelSize;

    console.log('Particles in view:', particlesInView);

    // vec2 viewCenter = vec2(particlesInView) / 2.0;
    const viewCenterX = particlesInView / 2.0;
    const viewCenterY = particlesInView / 2.0;

    console.log('View center:', { x: viewCenterX, y: viewCenterY });

    // vec2 worldParticleCoord = particleCoord - viewCenter + uCenter;
    const worldParticleX = particleCoordX - viewCenterX + center.x;
    const worldParticleY = particleCoordY - viewCenterY + center.y;

    console.log('World particle coords:', { x: worldParticleX, y: worldParticleY });

    // vec2 texUV = (worldParticleCoord + vec2(1024.0, 1024.0)) / uTextureSize;
    // We want the inverse: texture coordinates to world coordinates
    const worldX = Math.floor(worldParticleX + 1024);
    const worldY = Math.floor(worldParticleY + 1024);

    console.log('Final world coords:', { x: worldX, y: worldY });
    console.log('================================');

    return { x: worldX, y: worldY };
  }, [pixelSize, center]);

  const drawParticle = useCallback((screenX: number, screenY: number) => {
    const worldPos = screenToWorld(screenX, screenY);
    if (!worldPos) return;

    // Draw the particle
    worldGen.setParticle(worldPos.x, worldPos.y, {
      type: selectedParticle,
      velocityX: 0,
      velocityY: 0,
    });

    // Trigger redraw
    onDraw();
  }, [worldGen, selectedParticle, screenToWorld, onDraw]);

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
        drawParticle(e.clientX, e.clientY);
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

        drawParticle(e.clientX, e.clientY);
      }
    };

    const handleMouseUp = (e: MouseEvent) => {
      if (e.button === 0) {
        isDrawingRef.current = false;
      }
    };

    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [drawParticle]);
}
