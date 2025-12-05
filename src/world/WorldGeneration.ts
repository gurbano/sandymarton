import { DataTexture, RGBAFormat, UnsignedByteType } from 'three';
import { ParticleType, encodeVelocity } from './ParticleTypes';

export interface WorldOptions {
  width?: number;
  height?: number;
  grid?: boolean;
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
    // A = Additional data (density, temperature, etc.)
    for (let i = 0; i < width * height; i++) {
      const stride = i * 4;
      worldData[stride] = ParticleType.EMPTY;  // Type
      worldData[stride + 1] = encodeVelocity(0); // Velocity X
      worldData[stride + 2] = encodeVelocity(0); // Velocity Y
      worldData[stride + 3] = 255; // Data (fully opaque)
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

    if (options?.grid) {
      // Draw stone boundaries
      for (let x = 0; x < width; x++) {
        // Top boundary
        const topIndex = (0 * width + x) * 4;
        worldData[topIndex] = ParticleType.STONE;
        // Bottom boundary
        const bottomIndex = ((height - 1) * width + x) * 4;
        worldData[bottomIndex] = ParticleType.STONE;
      }
      for (let y = 0; y < height; y++) {
        // Left boundary
        const leftIndex = (y * width + 0) * 4;
        worldData[leftIndex] = ParticleType.STONE;
        // Right boundary
        const rightIndex = (y * width + (width - 1)) * 4;
        worldData[rightIndex] = ParticleType.STONE;
      }

      // Add stone particles in a grid pattern
      for (let y = 0; y < height; y += 16) {
        for (let x = 0; x < width; x += 16) {
          const index = (y * width + x) * 4;
          worldData[index] = ParticleType.SAND;
        }
      }
      // Draw axis lines
      for (let x = 0; x < width; x++) {
        const midY = Math.floor(height / 2);
        const index = (midY * width + x) * 4;
        worldData[index] = ParticleType.STONE;
      }
      for (let y = 0; y < height; y++) {
        const midX = Math.floor(width / 2);
        const index = (y * width + midX) * 4;
        worldData[index] = ParticleType.STONE;
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
    data[index + 3] = particle.data ?? 255;

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
