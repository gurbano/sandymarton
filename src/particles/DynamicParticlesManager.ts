/**
 * DynamicParticlesManager - Manages dynamic particle buffer textures
 *
 * Dynamic particles are ejected from the world grid when force exceeds a threshold,
 * follow ballistic trajectories, and settle back when velocity drops.
 *
 * Buffer Layout:
 * - positionBuffer (RGBA32F): position.x, position.y, velocity.x, velocity.y
 * - auxBuffer (RGBA32F): particleType, temperature, flags, lifetime
 *
 * Flags:
 * - bit 0 (1): active
 * - bit 1 (2): justSpawned (first frame after extraction)
 * - bit 2 (4): fromMomentum (spawned from momentum transfer)
 */

import { DataTexture, FloatType, NearestFilter, RGBAFormat } from 'three';
import type { DynamicParticlesConfig } from '../types/DynamicParticlesConfig';
import {
  DYNAMIC_BUFFER_SIZE,
  MAX_DYNAMIC_PARTICLES,
  DEFAULT_DYNAMIC_PARTICLES_CONFIG,
} from '../types/DynamicParticlesConfig';

export const DYNAMIC_FLAGS = {
  ACTIVE: 1,
  JUST_SPAWNED: 2,
  FROM_MOMENTUM: 4,
} as const;

export class DynamicParticlesManager {
  private static instance: DynamicParticlesManager | null = null;

  // DataTextures for GPU
  public positionBuffer: DataTexture;
  public auxBuffer: DataTexture;

  // CPU-side arrays (Float32)
  private positionData: Float32Array;
  private auxData: Float32Array;

  // Configuration
  private config: DynamicParticlesConfig;

  // Debug tracking
  private _activeCount: number = 0;

  private constructor() {
    const size = DYNAMIC_BUFFER_SIZE * DYNAMIC_BUFFER_SIZE * 4;

    // Initialize CPU-side arrays
    this.positionData = new Float32Array(size);
    this.auxData = new Float32Array(size);

    // Initialize all slots as inactive (flags = 0)
    for (let i = 0; i < MAX_DYNAMIC_PARTICLES; i++) {
      const baseIndex = i * 4;
      // Position buffer: all zeros
      this.positionData[baseIndex + 0] = 0; // x
      this.positionData[baseIndex + 1] = 0; // y
      this.positionData[baseIndex + 2] = 0; // vx
      this.positionData[baseIndex + 3] = 0; // vy

      // Aux buffer: inactive
      this.auxData[baseIndex + 0] = 0; // type
      this.auxData[baseIndex + 1] = 0; // temperature
      this.auxData[baseIndex + 2] = 0; // flags (inactive)
      this.auxData[baseIndex + 3] = 0; // lifetime
    }

    // Create position buffer texture
    this.positionBuffer = new DataTexture(
      this.positionData,
      DYNAMIC_BUFFER_SIZE,
      DYNAMIC_BUFFER_SIZE,
      RGBAFormat,
      FloatType
    );
    this.positionBuffer.minFilter = NearestFilter;
    this.positionBuffer.magFilter = NearestFilter;
    this.positionBuffer.needsUpdate = true;

    // Create aux buffer texture
    this.auxBuffer = new DataTexture(
      this.auxData,
      DYNAMIC_BUFFER_SIZE,
      DYNAMIC_BUFFER_SIZE,
      RGBAFormat,
      FloatType
    );
    this.auxBuffer.minFilter = NearestFilter;
    this.auxBuffer.magFilter = NearestFilter;
    this.auxBuffer.needsUpdate = true;

    this.config = { ...DEFAULT_DYNAMIC_PARTICLES_CONFIG };
  }

  static getInstance(): DynamicParticlesManager {
    if (!DynamicParticlesManager.instance) {
      DynamicParticlesManager.instance = new DynamicParticlesManager();
    }
    return DynamicParticlesManager.instance;
  }

  static resetInstance(): void {
    if (DynamicParticlesManager.instance) {
      DynamicParticlesManager.instance.dispose();
      DynamicParticlesManager.instance = null;
    }
  }

  // --- Configuration ---

  get enabled(): boolean {
    return this.config.enabled;
  }

  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
  }

  getConfig(): Readonly<DynamicParticlesConfig> {
    return this.config;
  }

  setConfig(config: Partial<DynamicParticlesConfig>): void {
    this.config = { ...this.config, ...config };
  }

  // --- Debug/Stats ---

  get activeCount(): number {
    return this._activeCount;
  }

  /**
   * Count active particles by scanning aux buffer
   * Call this periodically for debug display (not every frame)
   */
  updateActiveCount(): void {
    let count = 0;
    for (let i = 0; i < MAX_DYNAMIC_PARTICLES; i++) {
      const flags = this.auxData[i * 4 + 2];
      if ((flags & DYNAMIC_FLAGS.ACTIVE) !== 0) {
        count++;
      }
    }
    this._activeCount = count;
  }

  // --- GPU Uniforms ---

  /**
   * Get uniforms for dynamic particle shaders
   */
  getShaderUniforms(): Record<string, { value: unknown }> {
    return {
      uDynamicBuffer: { value: this.positionBuffer },
      uDynamicAuxBuffer: { value: this.auxBuffer },
      uDynamicBufferSize: { value: DYNAMIC_BUFFER_SIZE },
      uMaxDynamicParticles: { value: MAX_DYNAMIC_PARTICLES },
      uDynamicEnabled: { value: this.config.enabled ? 1.0 : 0.0 },
      uForceEjectionThreshold: { value: this.config.forceEjectionThreshold },
      uMaxSpawnsPerFrame: { value: this.config.maxSpawnsPerFrame },
      uMaxTraversal: { value: this.config.maxTraversal },
      uVelocityThreshold: { value: this.config.velocityThreshold },
      uDynamicGravity: { value: this.config.gravity },
      uDynamicFriction: { value: this.config.friction },
      uBounceRestitution: { value: this.config.bounceRestitution },
      uMomentumTransferChance: { value: this.config.momentumTransferChance },
      uSpeedMultiplier: { value: this.config.speedMultiplier },
    };
  }

  /**
   * Get uniforms for the rendering overlay shader
   */
  getRenderUniforms(): Record<string, { value: unknown }> {
    return {
      uDynamicBuffer: { value: this.positionBuffer },
      uDynamicAuxBuffer: { value: this.auxBuffer },
      uDynamicBufferSize: { value: DYNAMIC_BUFFER_SIZE },
      uDynamicEnabled: { value: this.config.enabled ? 1.0 : 0.0 },
    };
  }

  // --- Buffer Management ---

  /**
   * Clear all dynamic particles
   */
  clear(): void {
    for (let i = 0; i < MAX_DYNAMIC_PARTICLES; i++) {
      const baseIndex = i * 4;
      this.positionData[baseIndex + 0] = 0;
      this.positionData[baseIndex + 1] = 0;
      this.positionData[baseIndex + 2] = 0;
      this.positionData[baseIndex + 3] = 0;

      this.auxData[baseIndex + 0] = 0;
      this.auxData[baseIndex + 1] = 0;
      this.auxData[baseIndex + 2] = 0;
      this.auxData[baseIndex + 3] = 0;
    }
    this.positionBuffer.needsUpdate = true;
    this.auxBuffer.needsUpdate = true;
    this._activeCount = 0;
  }

  /**
   * Mark textures as needing update after GPU write-back
   */
  markNeedsUpdate(): void {
    this.positionBuffer.needsUpdate = true;
    this.auxBuffer.needsUpdate = true;
  }

  /**
   * Dispose GPU resources
   */
  dispose(): void {
    this.positionBuffer.dispose();
    this.auxBuffer.dispose();
  }

  /**
   * Reset to default state
   */
  reset(): void {
    this.clear();
    this.config = { ...DEFAULT_DYNAMIC_PARTICLES_CONFIG };
  }
}

// Export singleton getter
export function getDynamicParticlesManager(): DynamicParticlesManager {
  return DynamicParticlesManager.getInstance();
}

export function resetDynamicParticlesManager(): void {
  DynamicParticlesManager.resetInstance();
}
