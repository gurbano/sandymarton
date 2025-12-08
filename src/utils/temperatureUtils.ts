import type { DataTexture } from 'three';

/**
 * Decode 16-bit temperature from two bytes
 * Returns temperature in Kelvin
 */
export function decodeTemperature(tempLow: number, tempHigh: number): number {
  return tempLow + tempHigh * 256;
}

/**
 * Convert Kelvin to Celsius
 */
export function kelvinToCelsius(kelvin: number): number {
  return kelvin - 273.15;
}

/**
 * Calculate average environmental temperature under the brush area
 * Reads from heat layer texture (environmental heat)
 * @param heatTexture - The heat/force layer texture (RGBA: R=env_temp_low, G=env_temp_high, B=forceX, A=forceY)
 * @param worldX - Center X position in world coordinates
 * @param worldY - Center Y position in world coordinates
 * @param brushSize - Radius of the brush
 * @returns Average environmental temperature in Celsius, or null if no valid samples
 */
export function calculateAverageTemperature(
  heatTexture: DataTexture | null,
  worldX: number,
  worldY: number,
  brushSize: number
): number | null {
  if (!heatTexture || !heatTexture.image?.data) {
    return null;
  }

  const data = heatTexture.image.data as Uint8Array;
  const width = heatTexture.image.width;
  const height = heatTexture.image.height;

  let totalTemp = 0;
  let count = 0;

  // Sample all pixels within brush radius
  for (let dy = -brushSize; dy <= brushSize; dy++) {
    for (let dx = -brushSize; dx <= brushSize; dx++) {
      // Use circular brush (same as drawing)
      const distSq = dx * dx + dy * dy;
      if (distSq > brushSize * brushSize) continue;

      const sampleX = worldX + dx;
      const sampleY = worldY + dy;

      // Check bounds
      if (sampleX < 0 || sampleX >= width || sampleY < 0 || sampleY >= height) {
        continue;
      }

      // Calculate pixel index (RGBA = 4 bytes per pixel)
      const pixelIndex = (sampleY * width + sampleX) * 4;

      // Decode temperature from R and G channels
      const tempLow = data[pixelIndex];
      const tempHigh = data[pixelIndex + 1];
      const tempKelvin = decodeTemperature(tempLow, tempHigh);

      totalTemp += tempKelvin;
      count++;
    }
  }

  if (count === 0) {
    return null;
  }

  const avgKelvin = totalTemp / count;
  return kelvinToCelsius(avgKelvin);
}

/**
 * Calculate average temperature of only non-empty particles under the brush area
 * Reads temperature directly from particle texture (G=temp_low, B=temp_high)
 * @param worldTexture - The particle state texture (R=type, G=temp_low, B=temp_high, A=unused)
 * @param worldX - Center X position in world coordinates
 * @param worldY - Center Y position in world coordinates
 * @param brushSize - Radius of the brush
 * @returns Average temperature in Celsius of particles only, or null if no particles
 */
export function calculateAverageParticleTemperature(
  worldTexture: DataTexture | null,
  worldX: number,
  worldY: number,
  brushSize: number
): number | null {
  if (!worldTexture || !worldTexture.image?.data) {
    return null;
  }

  const worldData = worldTexture.image.data as Uint8Array;
  const width = worldTexture.image.width;
  const height = worldTexture.image.height;

  let totalTemp = 0;
  let count = 0;

  // Sample all pixels within brush radius
  for (let dy = -brushSize; dy <= brushSize; dy++) {
    for (let dx = -brushSize; dx <= brushSize; dx++) {
      // Use circular brush (same as drawing)
      const distSq = dx * dx + dy * dy;
      if (distSq > brushSize * brushSize) continue;

      const sampleX = worldX + dx;
      const sampleY = worldY + dy;

      // Check bounds
      if (sampleX < 0 || sampleX >= width || sampleY < 0 || sampleY >= height) {
        continue;
      }

      // Calculate pixel index (RGBA = 4 bytes per pixel)
      const pixelIndex = (sampleY * width + sampleX) * 4;

      // Check if this cell has a non-empty particle (type >= 16)
      const particleType = worldData[pixelIndex]; // R channel = particle type
      if (particleType < 16) {
        continue; // Skip empty cells
      }

      // Decode temperature from G and B channels of particle texture
      const tempLow = worldData[pixelIndex + 1]; // G channel = temp_low
      const tempHigh = worldData[pixelIndex + 2]; // B channel = temp_high
      const tempKelvin = decodeTemperature(tempLow, tempHigh);

      totalTemp += tempKelvin;
      count++;
    }
  }

  if (count === 0) {
    return null;
  }

  const avgKelvin = totalTemp / count;
  return kelvinToCelsius(avgKelvin);
}
