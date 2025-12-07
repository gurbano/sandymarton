/**
 * Level saving utilities
 * Saves current simulation state as a level
 */

import type { DataTexture } from 'three';
import type { Level } from '../types/Level';
import { WORLD_SIZE } from '../constants/worldConstants';

/**
 * Convert DataTexture to PNG and download
 */
export function saveTextureAsPNG(texture: DataTexture, filename: string): void {
  const canvas = document.createElement('canvas');
  canvas.width = WORLD_SIZE;
  canvas.height = WORLD_SIZE;
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    throw new Error('Failed to get canvas context');
  }

  // Get texture data
  const data = texture.image.data as Uint8Array;

  // Create ImageData from texture data
  const imageData = ctx.createImageData(WORLD_SIZE, WORLD_SIZE);
  imageData.data.set(data);

  // Put image data on canvas
  ctx.putImageData(imageData, 0, 0);

  // Convert to blob and download
  canvas.toBlob((blob) => {
    if (!blob) {
      throw new Error('Failed to create blob');
    }

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();

    // Cleanup
    URL.revokeObjectURL(url);
  }, 'image/png');
}

/**
 * Save level metadata as JSON and download
 */
export function saveLevelMetadata(level: Level, filename: string): void {
  const json = JSON.stringify(level, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();

  // Cleanup
  URL.revokeObjectURL(url);
}

/**
 * Save current simulation state as a complete level
 */
export function saveLevel(
  texture: DataTexture,
  levelName: string,
  description?: string
): void {
  // Create sanitized ID from name
  const levelId = levelName.toLowerCase().replace(/[^a-z0-9]+/g, '-');

  // Create level metadata
  const level: Level = {
    id: levelId,
    name: levelName,
    description,
    textures: {
      particles: 'particles.png',
    },
  };

  // Download both files
  saveTextureAsPNG(texture, 'particles.png');
  saveLevelMetadata(level, 'level.json');

  console.log(`Level "${levelName}" saved! Files downloaded:`);
  console.log('- particles.png');
  console.log('- level.json');
  console.log(`\nTo add to your project, create a folder: public/levels/${levelId}/`);
}
