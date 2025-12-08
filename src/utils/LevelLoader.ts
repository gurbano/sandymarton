/**
 * Level loading utilities
 * Loads levels from public/levels directory
 */

import type { Level, LevelIndex } from '../types/Level';
import { DataTexture, RGBAFormat, UnsignedByteType, NearestFilter } from 'three';
import { WORLD_SIZE } from '../constants/worldConstants';
import { ParticleTypeRanges, ParticleTypeConstants } from '../world/ParticleTypeConstants';
import { MaterialDefinitions, getDefaultBaseAttributes } from '../world/MaterialDefinitions';
import { encodeTemperature, ParticleType } from '../world/ParticleTypes';

/**
 * Normalize a particle type value to its canonical form
 * PNG save/load through canvas can cause slight value changes due to color space conversion
 * This maps any value to the nearest known particle type within its category
 */
function normalizeParticleType(value: number): number {
  // Empty range (0-15) -> EMPTY
  if (value <= ParticleTypeRanges.EMPTY_MAX) {
    return ParticleTypeConstants.EMPTY;
  }

  // Static range (16-32) -> find closest: STONE(17), GLASS(18), HEITE(19)
  if (value >= ParticleTypeRanges.STATIC_MIN && value <= ParticleTypeRanges.STATIC_MAX) {
    const staticTypes = [
      ParticleTypeConstants.STONE,
      ParticleTypeConstants.GLASS,
      ParticleTypeConstants.HEITE,
    ];
    return findClosest(value, staticTypes);
  }

  // Solid range (33-63) -> find closest: SAND(35), DIRT(37), GRAVEL(39), COPPER(40), ITE(41)
  if (value >= ParticleTypeRanges.SOLID_MIN && value <= ParticleTypeRanges.SOLID_MAX) {
    const solidTypes = [
      ParticleTypeConstants.SAND,
      ParticleTypeConstants.DIRT,
      ParticleTypeConstants.GRAVEL,
      ParticleTypeConstants.COPPER,
      ParticleTypeConstants.ITE,
    ];
    return findClosest(value, solidTypes);
  }

  // Liquid range (64-111) -> find closest: WATER(65), LAVA(80), SLIME(96), ACID(97), OIL(98), COOLANT(99)
  if (value >= ParticleTypeRanges.LIQUID_MIN && value <= ParticleTypeRanges.LIQUID_MAX) {
    const liquidTypes = [
      ParticleTypeConstants.WATER,
      ParticleTypeConstants.LAVA,
      ParticleTypeConstants.SLIME,
      ParticleTypeConstants.ACID,
      ParticleTypeConstants.OIL,
      ParticleTypeConstants.COOLANT,
    ];
    return findClosest(value, liquidTypes);
  }

  // Gas range (112-159) -> find closest: STEAM(113), SMOKE(128), AIR(144), NITROGEN(145)
  if (value >= ParticleTypeRanges.GAS_MIN && value <= ParticleTypeRanges.GAS_MAX) {
    const gasTypes = [
      ParticleTypeConstants.STEAM,
      ParticleTypeConstants.SMOKE,
      ParticleTypeConstants.AIR,
      ParticleTypeConstants.NITROGEN,
    ];
    return findClosest(value, gasTypes);
  }

  // Unknown range (160-255) -> treat as empty
  return ParticleTypeConstants.EMPTY;
}

/**
 * Find the closest value in an array to the target
 */
function findClosest(target: number, values: number[]): number {
  let closest = values[0];
  let minDiff = Math.abs(target - closest);

  for (const v of values) {
    const diff = Math.abs(target - v);
    if (diff < minDiff) {
      minDiff = diff;
      closest = v;
    }
  }

  return closest;
}

/**
 * Get the default temperature for a particle type
 */
function getDefaultTemperature(particleType: number): number {
  const material = MaterialDefinitions[particleType as ParticleType];
  const defaultAttrs = getDefaultBaseAttributes(particleType);
  return material?.defaultTemperature ?? defaultAttrs.defaultTemperature;
}

/**
 * Normalize all particle types in a pixel data array
 * Also sets proper default temperatures for each particle (for legacy levels without temp data)
 */
function normalizePixelData(data: Uint8Array): void {
  for (let i = 0; i < data.length; i += 4) {
    const normalizedType = normalizeParticleType(data[i]);
    data[i] = normalizedType;

    // Set default temperature for this particle type
    const temperature = getDefaultTemperature(normalizedType);
    const [tempLow, tempHigh] = encodeTemperature(temperature);
    data[i + 1] = tempLow;  // G channel = temp low byte
    data[i + 2] = tempHigh; // B channel = temp high byte
    // A channel (data[i + 3]) is preserved as-is
  }
}

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
      const pixelData = new Uint8Array(imageData.data);

      // Normalize particle types to handle color space conversion artifacts
      normalizePixelData(pixelData);

      resolve(pixelData);
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
