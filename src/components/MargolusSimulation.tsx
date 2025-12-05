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
        if (particleType === ParticleType.EMPTY || particleType === ParticleType.AIR) {
          ca.setCell(x, y, CellState.EMPTY);
        } else if (particleType === ParticleType.STONE) {
          ca.setCell(x, y, CellState.STATIC);
        } else {
          // Any other particle type becomes a CA particle
          ca.setCell(x, y, CellState.PARTICLE);
        }
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
        switch (cellState) {
          case CellState.EMPTY:
            data[texIndex] = ParticleType.EMPTY;
            data[texIndex + 1] = 128; // Velocity X = 0
            data[texIndex + 2] = 128; // Velocity Y = 0
            data[texIndex + 3] = 255;
            break;
          case CellState.PARTICLE:
            data[texIndex] = ParticleType.SAND;
            data[texIndex + 1] = 128;
            data[texIndex + 2] = 128;
            data[texIndex + 3] = 255;
            break;
          case CellState.STATIC:
            data[texIndex] = ParticleType.STONE;
            data[texIndex + 1] = 128;
            data[texIndex + 2] = 128;
            data[texIndex + 3] = 255;
            break;
        }
      }
    }

    worldTexture.needsUpdate = true;
    onTextureUpdate(worldTexture);
  });

  return null;
}

export default MargolusSimulation;
