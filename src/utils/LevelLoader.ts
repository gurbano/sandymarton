/**
 * Level loading utilities
 * Loads levels from public/levels directory
 */

import type { Level, LevelIndex } from '../types/Level';
import { DataTexture, RGBAFormat, UnsignedByteType, NearestFilter } from 'three';
import { WORLD_SIZE } from '../constants/worldConstants';

/**
 * Load the level index file
 */
export async function loadLevelIndex(): Promise<LevelIndex> {
  const response = await fetch(`${import.meta.env.BASE_URL}levels/index.json`);
  if (!response.ok) {
    throw new Error(`Failed to load level index: ${response.statusText}`);
  }
  return await response.json();
}

/**
 * Load a level's metadata
 */
export async function loadLevelMetadata(levelId: string): Promise<Level> {
  const response = await fetch(`${import.meta.env.BASE_URL}levels/${levelId}/level.json`);
  if (!response.ok) {
    throw new Error(`Failed to load level ${levelId}: ${response.statusText}`);
  }
  return await response.json();
}

/**
 * Load a PNG texture and convert it to Uint8Array
 */
async function loadPNGTexture(url: string): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      // Create canvas to extract pixel data
      const canvas = document.createElement('canvas');
      canvas.width = WORLD_SIZE;
      canvas.height = WORLD_SIZE;
      const ctx = canvas.getContext('2d', {
        willReadFrequently: true,
        colorSpace: 'srgb'
      });

      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }

      // Disable image smoothing to prevent interpolation
      ctx.imageSmoothingEnabled = false;

      // Draw image to canvas
      ctx.drawImage(img, 0, 0, WORLD_SIZE, WORLD_SIZE);

      // Get pixel data
      const imageData = ctx.getImageData(0, 0, WORLD_SIZE, WORLD_SIZE);
      resolve(new Uint8Array(imageData.data));
    };

    img.onerror = () => {
      reject(new Error(`Failed to load image: ${url}`));
    };

    img.src = url;
  });
}

/**
 * Load a level's particle texture as DataTexture
 */
export async function loadLevelTexture(levelId: string, texturePath: string): Promise<DataTexture> {
  const url = `${import.meta.env.BASE_URL}levels/${levelId}/${texturePath}`;
  const pixelData = await loadPNGTexture(url);

  // Create DataTexture from pixel data
  const texture = new DataTexture(
    pixelData,
    WORLD_SIZE,
    WORLD_SIZE,
    RGBAFormat,
    UnsignedByteType
  );

  texture.needsUpdate = true;
  texture.minFilter = NearestFilter;
  texture.magFilter = NearestFilter;

  return texture;
}

/**
 * Load a complete level (metadata + textures)
 */
export async function loadLevel(levelId: string): Promise<{
  metadata: Level;
  particleTexture: DataTexture;
}> {
  const metadata = await loadLevelMetadata(levelId);
  const particleTexture = await loadLevelTexture(levelId, metadata.textures.particles);

  return {
    metadata,
    particleTexture,
  };
}
