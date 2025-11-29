import { DataTexture, RGBAFormat, UnsignedByteType } from 'three';
import { ParticleType, encodeVelocity } from './ParticleTypes';

export interface WorldOptions {
  width?: number;
  height?: number;
  grid?: boolean;
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
  private worldData: Uint8Array;

  constructor(width: number = 2048, height: number = 2048) {
    this.width = width;
    this.height = height;
    this.worldData = new Uint8Array(4 * width * height);
  }

  /**
   * Generate a new world texture
   * Initializes an empty world with all particles set to EMPTY
   */
  initNewWorld(options?: WorldOptions): DataTexture {
    const width = options?.width ?? this.width;
    const height = options?.height ?? this.height;

    // Reset world data if size changed
    if (width !== this.width || height !== this.height) {
      this.width = width;
      this.height = height;
      this.worldData = new Uint8Array(4 * width * height);
    }

    // Fill with empty particles
    // RGBA format:
    // R = Particle Type
    // G = Velocity X (encoded -128 to +127 as 0-255)
    // B = Velocity Y (encoded -128 to +127 as 0-255)
    // A = Additional data (density, temperature, etc.)
    for (let i = 0; i < width * height; i++) {
      const stride = i * 4;
      this.worldData[stride] = ParticleType.EMPTY;  // Type
      this.worldData[stride + 1] = encodeVelocity(0); // Velocity X
      this.worldData[stride + 2] = encodeVelocity(0); // Velocity Y
      this.worldData[stride + 3] = 255; // Data (fully opaque)
    }

    if (options?.grid) {
      // add stone particles in a grid pattern
      for (let y = 0; y < height; y += 16) {
        for (let x = 0; x < width; x += 16) {
          const index = (y * width + x) * 4;
          this.worldData[index] = ParticleType.SAND;
        }
      }
      // draw axis lines
      for (let x = 0; x < width; x++) {
        const midY = Math.floor(height / 2);
        const index = (midY * width + x) * 4;
        this.worldData[index] = ParticleType.STONE;
      }
      for (let y = 0; y < height; y++) {
        const midX = Math.floor(width / 2);
        const index = (y * width + midX) * 4;
        this.worldData[index] = ParticleType.STONE;
      }
    }
    // Create DataTexture
    const texture = new DataTexture(this.worldData, width, height, RGBAFormat, UnsignedByteType);
    texture.needsUpdate = true;

    return texture;
  }

  fromTexture(texture: DataTexture): void {
    if (texture.image.width !== this.width || texture.image.height !== this.height) {
      throw new Error('Texture size does not match world size');
    }
    this.worldData = new Uint8Array(texture.image.data || [] as Uint8Array);
  }
  /**
   * Set a particle at a specific position
   */
  setParticle(x: number, y: number, particle: Particle): void {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) {
      return; // Out of bounds
    }

    const index = (y * this.width + x) * 4;
    this.worldData[index] = particle.type;
    this.worldData[index + 1] = encodeVelocity(particle.velocityX);
    this.worldData[index + 2] = encodeVelocity(particle.velocityY);
    this.worldData[index + 3] = particle.data ?? 255;
  }

  /**
   * Get a particle at a specific position
   */
  getParticle(x: number, y: number): Particle | null {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) {
      return null; // Out of bounds
    }

    const index = (y * this.width + x) * 4;
    return {
      type: this.worldData[index] as ParticleType,
      velocityX: this.worldData[index + 1] - 128,
      velocityY: this.worldData[index + 2] - 128,
      data: this.worldData[index + 3],
    };
  }

  /**
   * Get the raw world data for direct manipulation
   */
  getWorldData(): Uint8Array {
    return this.worldData;
  }
}
