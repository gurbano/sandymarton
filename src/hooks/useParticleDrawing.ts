import { useEffect, useCallback, useRef } from 'react';
import type { RefObject } from 'react';
import { WorldGeneration } from '../world/WorldGeneration';
import { ParticleType } from '../world/ParticleTypes';
import type { DataTexture } from 'three';
import { WORLD_SIZE } from '../constants/worldConstants';

export type ToolMode = 'inspect' | 'add' | 'build' | 'remove' | 'fill';

// Inspect data structure
export interface InspectData {
  composition: { type: string; count: number; percentage: number; color: [number, number, number] }[];
  mainComponent: string;
  avgParticleTemp: number | null;
  avgAmbientTemp: number | null;
  totalParticles: number;
  position: { x: number; y: number };
  brushSize: number;
}

// Particle type colors for visualization
const PARTICLE_COLORS: Record<string, [number, number, number]> = {
  SAND: [194, 178, 128],
  DIRT: [139, 90, 43],
  STONE: [128, 128, 128],
  GRAVEL: [160, 160, 160],
  BASALT: [72, 60, 58],
  OBSIDIAN: [46, 24, 69],
  WATER: [64, 164, 223],
  LAVA: [255, 80, 20],
  SLIME: [0, 255, 100],
  ACID: [180, 255, 0],
  STEAM: [200, 200, 220],
  SMOKE: [80, 80, 80],
  AIR: [135, 206, 235],
};

export interface BuildContext {
  worldX: number;
  worldY: number;
  brushSize: number;
  worldTexture: DataTexture;
  heatTextureRef: RefObject<DataTexture | null>;
}

interface UseParticleDrawingProps {
  worldGen: WorldGeneration;
  selectedParticle: ParticleType;
  pixelSize: number;
  center: { x: number; y: number };
  onDraw: (newTexture: DataTexture) => void;
  worldTexture: DataTexture;
  heatTextureRef?: RefObject<DataTexture | null>;
  toolMode?: ToolMode;
  brushSize?: number;
  onMouseMove?: (pos: { x: number; y: number } | null) => void;
  onInspectData?: (data: InspectData | null) => void;
  onBuild?: (context: BuildContext) => void;
}

// Convert Kelvin to Celsius
function kelvinToCelsius(kelvin: number): number {
  return kelvin - 273.15;
}

export function useParticleDrawing({
  worldGen,
  selectedParticle,
  pixelSize,
  center,
  onDraw,
  worldTexture,
  heatTextureRef,
  toolMode = 'add',
  brushSize = 3,
  onMouseMove,
  onInspectData,
  onBuild,
}: UseParticleDrawingProps) {
  const isDrawingRef = useRef(false);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const lastMousePosRef = useRef<{ x: number; y: number } | null>(null);
  const drawIntervalRef = useRef<number | null>(null);
  const inspectThrottleRef = useRef<boolean>(false);
  const lastInspectPosRef = useRef<{ x: number; y: number } | null>(null);

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

  // Inspect particles at a world position
  const inspectAt = useCallback((worldPos: { x: number; y: number }) => {
    const data = worldTexture.image.data as Uint8Array;
    if (!data) return null;

    const heatTexture = heatTextureRef?.current;
    const heatImage = heatTexture?.image as { data?: Uint8Array; width?: number; height?: number } | undefined;
    const heatData = heatImage?.data instanceof Uint8Array ? heatImage.data : undefined;
    const heatWidth = heatImage?.width ?? WORLD_SIZE;
    const heatHeight = heatImage?.height ?? WORLD_SIZE;

    const counts: Record<number, number> = {};
    let totalTemp = 0;
    let tempCount = 0;
    let totalParticles = 0;
    let totalAmbientTemp = 0;
    let ambientCount = 0;

    // Sample in a radius around the position
    for (let dy = -brushSize; dy <= brushSize; dy++) {
      for (let dx = -brushSize; dx <= brushSize; dx++) {
        const distSq = dx * dx + dy * dy;
        if (distSq <= brushSize * brushSize) {
          const sampleX = worldPos.x + dx;
          const sampleY = worldPos.y + dy;

          // Bounds check
          if (sampleX < 0 || sampleX >= WORLD_SIZE || sampleY < 0 || sampleY >= WORLD_SIZE) {
            continue;
          }

          const idx = (sampleY * WORLD_SIZE + sampleX) * 4;
          const particleType = data[idx]; // R channel = particle type

          if (heatData && sampleX < heatWidth && sampleY < heatHeight) {
            const heatIdx = (sampleY * heatWidth + sampleX) * 4;
            const ambientTempLow = heatData[heatIdx];
            const ambientTempHigh = heatData[heatIdx + 1];
            const ambientTempKelvin = ambientTempLow + ambientTempHigh * 256;
            if (ambientTempKelvin > 0) {
              totalAmbientTemp += ambientTempKelvin;
              ambientCount++;
            }
          }

          if (particleType !== ParticleType.EMPTY) {
            counts[particleType] = (counts[particleType] || 0) + 1;
            totalParticles++;

            // Read temperature from G,B channels (16-bit value)
            // G channel = temp_low, B channel = temp_high
            const tempLow = data[idx + 1];
            const tempHigh = data[idx + 2];
            const tempKelvin = tempLow + tempHigh * 256;
            if (tempKelvin > 0) {
              totalTemp += tempKelvin;
              tempCount++;
            }
          }
        }
      }
    }

    // Build composition array
    const composition: InspectData['composition'] = [];
    for (const [typeStr, count] of Object.entries(counts)) {
      const typeNum = parseInt(typeStr, 10);
      const typeName = ParticleType[typeNum] || `UNKNOWN_${typeNum}`;
      composition.push({
        type: typeName,
        count,
        percentage: (count / totalParticles) * 100,
        color: PARTICLE_COLORS[typeName] || [128, 128, 128],
      });
    }

    // Sort by count descending
    composition.sort((a, b) => b.count - a.count);

    const avgParticleTemp = tempCount > 0 ? kelvinToCelsius(totalTemp / tempCount) : null;
    const avgAmbientTemp = ambientCount > 0 ? kelvinToCelsius(totalAmbientTemp / ambientCount) : null;
    const hasParticles = totalParticles > 0;

    return {
      composition,
      mainComponent: hasParticles ? (composition[0]?.type || 'UNKNOWN') : 'Empty Cell',
      avgParticleTemp,
      avgAmbientTemp,
      totalParticles,
      position: worldPos,
      brushSize,
    };
  }, [worldTexture, brushSize, heatTextureRef]);

  const drawParticle = useCallback((screenX: number, screenY: number) => {
    // Don't draw in inspect mode
    if (toolMode === 'inspect') return;

    const worldPos = screenToWorld(screenX, screenY);
    if (!worldPos) return;

    // Handle build mode separately
    if (toolMode === 'build') {
      onBuild?.({
        worldX: worldPos.x,
        worldY: worldPos.y,
        brushSize,
        worldTexture,
        heatTextureRef: heatTextureRef as RefObject<DataTexture | null>,
      });
      return;
    }

    // Determine particle type based on tool mode
    const particleType = toolMode === 'remove' ? ParticleType.EMPTY : selectedParticle;

    // Draw particles in a small radius around the cursor
    for (let dy = -brushSize; dy <= brushSize; dy++) {
      for (let dx = -brushSize; dx <= brushSize; dx++) {
        // Use circular brush
        const distSq = dx * dx + dy * dy;
        if (distSq <= brushSize * brushSize) {
          const drawX = worldPos.x + dx;
          const drawY = worldPos.y + dy;

          // Draw the particle directly on the texture
          // Temperature will be set to default for the particle type
          worldGen.setParticleOnTexture(worldTexture, drawX, drawY, {
            type: particleType,
          });
        }
      }
    }

    // Trigger redraw (texture is already updated in-place)
    onDraw(worldTexture);
  }, [worldTexture, worldGen, selectedParticle, screenToWorld, onDraw, toolMode, brushSize, onBuild, heatTextureRef]);

  // Leading-edge throttled inspect function
  // Executes immediately on first call, then ignores calls for 500ms
  const scheduleInspect = useCallback((worldPos: { x: number; y: number }) => {
    lastInspectPosRef.current = worldPos;

    // If throttled, ignore this call
    if (inspectThrottleRef.current) {
      return;
    }

    // Execute immediately (leading edge)
    const inspectData = inspectAt(worldPos);
    onInspectData?.(inspectData);

    // Start throttle period
    inspectThrottleRef.current = true;
    window.setTimeout(() => {
      inspectThrottleRef.current = false;
      // Optionally update with latest position after throttle ends
      if (lastInspectPosRef.current) {
        const latestData = inspectAt(lastInspectPosRef.current);
        onInspectData?.(latestData);
      }
    }, 500);
  }, [inspectAt, onInspectData]);

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
      // Don't process drawing in inspect mode
      if (toolMode === 'inspect') return;

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
        // Build mode: single click only, no continuous drawing
        if (toolMode === 'build') {
          drawParticle(e.clientX, e.clientY);
          return;
        }

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
      const canvas = canvasRef.current;
      if (!canvas) return;

      // Check if mouse is within canvas bounds
      const rect = canvas.getBoundingClientRect();
      const x = e.clientX;
      const y = e.clientY;

      if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
        // Mouse is outside canvas - hide cursor and clear inspect
        onMouseMove?.(null);
        onInspectData?.(null);
        return;
      }

      // Update cursor position
      onMouseMove?.({ x: e.clientX, y: e.clientY });

      // Handle inspect mode
      if (toolMode === 'inspect') {
        const worldPos = screenToWorld(e.clientX, e.clientY);
        if (worldPos) {
          scheduleInspect(worldPos);
        }
        return;
      }

      // Draw if left mouse button is held (non-inspect modes)
      if (isDrawingRef.current) {
        lastMousePosRef.current = { x: e.clientX, y: e.clientY };
        drawParticle(e.clientX, e.clientY);
      }
    };

    const handleMouseLeave = () => {
      onMouseMove?.(null);
      onInspectData?.(null);
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
    window.addEventListener('mouseleave', handleMouseLeave);

    return () => {
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('mouseleave', handleMouseLeave);

      // Clean up intervals on unmount
      if (drawIntervalRef.current !== null) {
        clearInterval(drawIntervalRef.current);
        drawIntervalRef.current = null;
      }
    };
  }, [drawParticle, onMouseMove, onInspectData, screenToWorld, toolMode, scheduleInspect]);
}
