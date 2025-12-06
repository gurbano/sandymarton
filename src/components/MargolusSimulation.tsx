import { useEffect, useMemo, useRef } from 'react';
import { DataTexture } from 'three';
import { useFrame } from '@react-three/fiber';
import { MargolusCA, CellState } from '../world/MargolusCA';
import { ParticleType } from '../world/ParticleTypes';

interface MargolusSimulationProps {
  worldTexture: DataTexture;
  textureSize: number;
  onTextureUpdate: (texture: DataTexture) => void;
  enabled?: boolean;
  toppleProbability?: number;
  resetCount?: number;
}

/**
 * CPU-based Margolus Cellular Automata simulation
 * Implements the algorithm from "Probabilistic Cellular Automata for Granular Media in Video Games"
 */
function MargolusSimulation({
  worldTexture,
  textureSize,
  onTextureUpdate,
  enabled = true,
  toppleProbability = 0.75,
  resetCount = 0,
}: MargolusSimulationProps) {
  // Create the CA instance
  const caRef = useRef<MargolusCA | null>(null);
  const initializedRef = useRef(false);
  const lastTextureVersionRef = useRef(0);

  // Initialize CA
  useEffect(() => {
    const ca = new MargolusCA({
      width: textureSize,
      height: textureSize,
      toppleProbability,
    });

    caRef.current = ca;
    initializedRef.current = false;

    return () => {
      caRef.current = null;
    };
  }, [textureSize, toppleProbability]);

  // Update topple probability when it changes
  useEffect(() => {
    if (caRef.current) {
      caRef.current.setToppleProbability(toppleProbability);
    }
  }, [toppleProbability]);

  // Sync texture to CA grid (supports drawing)
  const syncTextureToCA = useRef((ca: MargolusCA, data: Uint8Array, textureSize: number) => {
    // Convert texture data to CA grid
    // Note: Flip Y coordinate because texture Y=0 is at bottom, but CA Y=0 is at top
    for (let y = 0; y < textureSize; y++) {
      for (let x = 0; x < textureSize; x++) {
        const texY = textureSize - 1 - y; // Flip Y
        const index = (texY * textureSize + x) * 4;
        const particleType = data[index];

        // Map particle types to CA cell states
        let cellState: CellState;
        if (particleType === ParticleType.EMPTY || particleType === ParticleType.AIR) {
          cellState = CellState.EMPTY;
        } else if (particleType === ParticleType.STONE) {
          cellState = CellState.STATIC;
        } else if (particleType === ParticleType.SAND) {
          cellState = CellState.SAND;
        } else if (particleType === ParticleType.DIRT) {
          cellState = CellState.DIRT;
        } else if (particleType === ParticleType.GRAVEL) {
          cellState = CellState.GRAVEL;
        } else if (particleType === ParticleType.WATER) {
          cellState = CellState.WATER;
        } else if (particleType === ParticleType.LAVA) {
          cellState = CellState.LAVA;
        } else {
          // Default to sand for unknown types
          cellState = CellState.SAND;
        }

        ca.setCell(x, y, cellState);
      }
    }
  });

  // Initialize CA state from texture (re-initializes on reset)
  useEffect(() => {
    if (!caRef.current) return;

    const ca = caRef.current;
    const data = worldTexture.image.data as Uint8Array;

    syncTextureToCA.current(ca, data, textureSize);
    initializedRef.current = true;
    lastTextureVersionRef.current = worldTexture.version;
  }, [worldTexture, textureSize, resetCount]);

  // Run simulation each frame
  useFrame(() => {
    if (!enabled || !caRef.current || !initializedRef.current) {
      return;
    }

    const ca = caRef.current;
    const data = worldTexture.image.data as Uint8Array;

    // Check if texture was modified externally (user drawing)
    if (worldTexture.version !== lastTextureVersionRef.current) {
      // Re-sync texture to CA grid
      syncTextureToCA.current(ca, data, textureSize);
      lastTextureVersionRef.current = worldTexture.version;
      return; // Skip simulation this frame to avoid lag
    }

    // Run multiple CA steps per frame for faster simulation
    const STEPS_PER_FRAME = 4;
    for (let i = 0; i < STEPS_PER_FRAME; i++) {
      ca.step();
    }

    // Convert CA grid back to texture
    const grid = ca.getGrid();

    for (let y = 0; y < textureSize; y++) {
      for (let x = 0; x < textureSize; x++) {
        const gridIndex = y * textureSize + x;
        const texY = textureSize - 1 - y; // Flip Y
        const texIndex = (texY * textureSize + x) * 4;
        const cellState = grid[gridIndex];

        // Map CA cell states back to particle types
        let particleType: ParticleType;
        switch (cellState) {
          case CellState.EMPTY:
            particleType = ParticleType.EMPTY;
            break;
          case CellState.SAND:
            particleType = ParticleType.SAND;
            break;
          case CellState.DIRT:
            particleType = ParticleType.DIRT;
            break;
          case CellState.GRAVEL:
            particleType = ParticleType.GRAVEL;
            break;
          case CellState.WATER:
            particleType = ParticleType.WATER;
            break;
          case CellState.LAVA:
            particleType = ParticleType.LAVA;
            break;
          case CellState.STATIC:
            particleType = ParticleType.STONE;
            break;
          default:
            particleType = ParticleType.SAND;
        }

        data[texIndex] = particleType;
        data[texIndex + 1] = 128; // Velocity X = 0
        data[texIndex + 2] = 128; // Velocity Y = 0
        data[texIndex + 3] = 255;
      }
    }

    worldTexture.needsUpdate = true;
    onTextureUpdate(worldTexture);
  });

  return null;
}

export default MargolusSimulation;
