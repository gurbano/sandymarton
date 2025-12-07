import { DataTexture, RGBAFormat, UnsignedByteType } from 'three';
import { ParticleType, encodeVelocity } from './ParticleTypes';

export const WorldInitType = {
  EMPTY: 'empty',
  AXIS: 'axis',
  HOURGLASS: 'hourglass',
  PLATFORMS: 'platforms',
} as const;

export type WorldInitType = typeof WorldInitType[keyof typeof WorldInitType];

export interface WorldOptions {
  width?: number;
  height?: number;
  initType?: WorldInitType;
  randomParticles?: boolean;
}

export interface Particle {
  type: ParticleType;
  velocityX: number;
  velocityY: number;
  data?: number; // Alpha channel for additional data
}

export class WorldGeneration {
  private width: number;
  private height: number;

  constructor(width: number = 2048, height: number = 2048) {
    this.width = width;
    this.height = height;
  }

  /**
   * Generate a new world texture
   * Initializes an empty world with all particles set to EMPTY
   */
  initNewWorld(options?: WorldOptions): DataTexture {
    const width = options?.width ?? this.width;
    const height = options?.height ?? this.height;

    // Update dimensions
    this.width = width;
    this.height = height;

    // Create new world data array
    const worldData = new Uint8Array(4 * width * height);

    // Fill with empty particles
    // RGBA format:
    // R = Particle Type
    // G = Velocity X (encoded -128 to +127 as 0-255)
    // B = Velocity Y (encoded -128 to +127 as 0-255)
    // A = Unused (set to 255)
    for (let i = 0; i < width * height; i++) {
      const stride = i * 4;
      worldData[stride] = ParticleType.EMPTY;  // Type
      worldData[stride + 1] = encodeVelocity(0); // Velocity X
      worldData[stride + 2] = encodeVelocity(0); // Velocity Y
      worldData[stride + 3] = 255; // Alpha (unused, set to opaque)
    }

    // Draw 5-pixel boundaries for all init types except EMPTY
    const initType = options?.initType ?? WorldInitType.EMPTY;
    if (initType !== WorldInitType.EMPTY) {
      const boundaryThickness = 5;

      // Top and bottom boundaries
      for (let thickness = 0; thickness < boundaryThickness; thickness++) {
        for (let x = 0; x < width; x++) {
          // Top boundary
          const topIndex = (thickness * width + x) * 4;
          worldData[topIndex] = ParticleType.STONE;
          // Bottom boundary
          const bottomIndex = ((height - 1 - thickness) * width + x) * 4;
          worldData[bottomIndex] = ParticleType.STONE;
        }
      }

      // Left and right boundaries
      for (let thickness = 0; thickness < boundaryThickness; thickness++) {
        for (let y = 0; y < height; y++) {
          // Left boundary
          const leftIndex = (y * width + thickness) * 4;
          worldData[leftIndex] = ParticleType.STONE;
          // Right boundary
          const rightIndex = (y * width + (width - 1 - thickness)) * 4;
          worldData[rightIndex] = ParticleType.STONE;
        }
      }
    }

    if (options?.randomParticles) {
      // Add 2 million random particles
      const particleCount = 4_000_000;
      const availableTypes = [
        ParticleType.SAND,
      ];

      for (let i = 0; i < particleCount; i++) {
        const x = Math.floor(Math.random() * width);
        const y = Math.floor(Math.random() * height);
        const index = (y * width + x) * 4;

        // Pick a random particle type
        const randomType = availableTypes[Math.floor(Math.random() * availableTypes.length)];
        worldData[index] = randomType;
      }
    }

    if (initType === WorldInitType.HOURGLASS) {
      // Create hourglass shape
      const centerX = Math.floor(width / 2);
      const centerY = Math.floor(height / 2);
      const hourglassWidth = Math.floor(width * 0.3);
      const hourglassHeight = Math.floor(height * 0.8);
      const halfWidth = Math.floor(hourglassWidth / 2);
      const halfHeight = Math.floor(hourglassHeight / 2);
      const neckWidth = Math.floor(hourglassWidth / 8);

      // Draw the hourglass outline
      for (let dy = -halfHeight; dy <= halfHeight; dy++) {
        const y = centerY + dy;
        if (y < 0 || y >= height) continue;

        // Calculate width at this height
        const normalizedY = Math.abs(dy) / halfHeight;
        const currentWidth = neckWidth + (halfWidth - neckWidth) * normalizedY;

        // Draw left and right walls (2 pixels thick)
        const leftX = Math.floor(centerX - currentWidth);
        const rightX = Math.floor(centerX + currentWidth);

        for (let thickness = 0; thickness < 2; thickness++) {
          if (leftX - thickness >= 0 && leftX - thickness < width) {
            const index = (y * width + (leftX - thickness)) * 4;
            worldData[index] = ParticleType.STONE;
          }
          if (rightX + thickness >= 0 && rightX + thickness < width) {
            const index = (y * width + (rightX + thickness)) * 4;
            worldData[index] = ParticleType.STONE;
          }
        }
      }

      // Add sand in the top chamber of the hourglass
      const topChamberY = centerY - Math.floor(halfHeight * 0.6);
      const topChamberHeight = Math.floor(halfHeight * 0.5);

      for (let dy = 0; dy < topChamberHeight; dy++) {
        const y = topChamberY + dy;
        if (y < 0 || y >= height) continue;

        const normalizedY = Math.abs((topChamberY + dy - centerY)) / halfHeight;
        const currentWidth = neckWidth + (halfWidth - neckWidth) * normalizedY;

        for (let dx = -Math.floor(currentWidth) + 3; dx <= Math.floor(currentWidth) - 3; dx++) {
          const x = centerX + dx;
          if (x >= 0 && x < width) {
            const index = (y * width + x) * 4;
            worldData[index] = ParticleType.SAND;
          }
        }
      }
    } else if (initType === WorldInitType.AXIS) {
      // Draw horizontal and vertical axis lines through the center
      const midX = Math.floor(width / 2);
      const midY = Math.floor(height / 2);

      // Horizontal axis
      for (let x = 0; x < width; x++) {
        const index = (midY * width + x) * 4;
        worldData[index] = ParticleType.STONE;
      }

      // Vertical axis
      for (let y = 0; y < height; y++) {
        const index = (y * width + midX) * 4;
        worldData[index] = ParticleType.STONE;
      }
    } else if (initType === WorldInitType.PLATFORMS) {
      // Create random horizontal platforms
      const platformCount = 5 + Math.floor(Math.random() * 5); // 5-10 platforms
      const boundaryThickness = 5;

      for (let i = 0; i < platformCount; i++) {
        // Random Y position (avoiding boundaries)
        const y = boundaryThickness + Math.floor(Math.random() * (height - 2 * boundaryThickness));

        // Random X start and width
        const minWidth = Math.floor(width * 0.1);
        const maxWidth = Math.floor(width * 0.4);
        const platformWidth = minWidth + Math.floor(Math.random() * (maxWidth - minWidth));

        const maxStartX = width - boundaryThickness - platformWidth;
        const startX = boundaryThickness + Math.floor(Math.random() * (maxStartX - boundaryThickness));

        // Draw platform (2 pixels thick)
        for (let thickness = 0; thickness < 2; thickness++) {
          const platformY = y + thickness;
          if (platformY >= height) continue;

          for (let x = startX; x < startX + platformWidth; x++) {
            if (x >= 0 && x < width) {
              const index = (platformY * width + x) * 4;
              worldData[index] = ParticleType.STONE;
            }
          }
        }
      }
    }
    // Create DataTexture
    const texture = new DataTexture(worldData, width, height, RGBAFormat, UnsignedByteType);
    texture.needsUpdate = true;

    return texture;
  }

  /**
   * Set a particle at a specific position directly on a texture
   * Modifies the texture data in-place and marks it for update
   */
  setParticleOnTexture(texture: DataTexture, x: number, y: number, particle: Particle): void {
    const width = texture.image.width;
    const height = texture.image.height;

    if (x < 0 || x >= width || y < 0 || y >= height) {
      return; // Out of bounds
    }

    const data = texture.image.data as Uint8Array;
    const index = (y * width + x) * 4;

    data[index] = particle.type;
    data[index + 1] = encodeVelocity(particle.velocityX);
    data[index + 2] = encodeVelocity(particle.velocityY);
    data[index + 3] = particle.data ?? 255; // Default to 255 (opaque alpha)

    texture.needsUpdate = true;
  }

  /**
   * Get a particle at a specific position from a texture
   */
  getParticleFromTexture(texture: DataTexture, x: number, y: number): Particle | null {
    const width = texture.image.width;
    const height = texture.image.height;

    if (x < 0 || x >= width || y < 0 || y >= height) {
      return null; // Out of bounds
    }

    const data = texture.image.data as Uint8Array;
    const index = (y * width + x) * 4;

    return {
      type: data[index] as ParticleType,
      velocityX: data[index + 1] - 128,
      velocityY: data[index + 2] - 128,
      data: data[index + 3],
    };
  }
}
