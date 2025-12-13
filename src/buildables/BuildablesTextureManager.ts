/**
 * Manages the GPU textures for buildables system
 * Handles CPU-side bookkeeping and texture synchronization
 */

import { DataTexture, FloatType, NearestFilter, RGBAFormat } from 'three';
import {
  BUILDABLES_TEXTURE_WIDTH,
  BUILDABLES_TEXTURE_HEIGHT,
  MAX_BUILDABLES,
  BUILDABLE_FLAGS,
  LIFETIME_PERMANENT,
  DEFAULT_RADIUS,
  DEFAULT_EMISSION_RATE,
  packTypeAndSubtype,
  packRateAndCooldown,
} from './BuildablesConstants';
import type {
  BuildableInstance,
  CreateBuildableOptions,
} from './BuildablesConstants';

/**
 * Manages two RGBA32F textures for buildables:
 * - positionTexture: x, y, velocityX, velocityY
 * - dataTexture: packed(type,subtype), radius, lifetime, packed(rate,cooldown)
 */
export class BuildablesTextureManager {
  // Textures
  public positionTexture: DataTexture;
  public dataTexture: DataTexture;

  // CPU-side data arrays (Float32)
  private positionData: Float32Array;
  private dataData: Float32Array;

  // Buildable tracking
  private buildables: Map<number, BuildableInstance> = new Map();
  private freeSlots: number[] = [];
  private nextId = 0;

  // Rigid body tracking: slot -> Rapier rigid body ID
  private rigidBodyIds: Map<number, number> = new Map();

  // Dirty tracking for partial updates
  private dirtySlots: Set<number> = new Set();
  private needsFullUpdate = true;

  constructor() {
    const size = BUILDABLES_TEXTURE_WIDTH * BUILDABLES_TEXTURE_HEIGHT * 4;

    // Initialize CPU-side arrays
    this.positionData = new Float32Array(size);
    this.dataData = new Float32Array(size);

    // Initialize all slots as free
    for (let i = MAX_BUILDABLES - 1; i >= 0; i--) {
      this.freeSlots.push(i);
    }

    // Create position texture (x, y, vx, vy)
    this.positionTexture = new DataTexture(
      this.positionData,
      BUILDABLES_TEXTURE_WIDTH,
      BUILDABLES_TEXTURE_HEIGHT,
      RGBAFormat,
      FloatType
    );
    this.positionTexture.minFilter = NearestFilter;
    this.positionTexture.magFilter = NearestFilter;
    this.positionTexture.needsUpdate = true;

    // Create data texture (packed type/subtype, radius, lifetime, packed rate/cooldown)
    this.dataTexture = new DataTexture(
      this.dataData,
      BUILDABLES_TEXTURE_WIDTH,
      BUILDABLES_TEXTURE_HEIGHT,
      RGBAFormat,
      FloatType
    );
    this.dataTexture.minFilter = NearestFilter;
    this.dataTexture.magFilter = NearestFilter;
    this.dataTexture.needsUpdate = true;
  }

  /**
   * Get the number of active buildables
   */
  get count(): number {
    return this.buildables.size;
  }

  /**
   * Get available slots remaining
   */
  get availableSlots(): number {
    return this.freeSlots.length;
  }

  /**
   * Add a new buildable and return its ID
   */
  addBuildable(options: CreateBuildableOptions): number | null {
    if (this.freeSlots.length === 0) {
      console.warn('BuildablesTextureManager: No free slots available');
      return null;
    }

    const slot = this.freeSlots.pop()!;
    const id = this.nextId++;

    const instance: BuildableInstance = {
      id,
      type: options.type,
      x: options.x,
      y: options.y,
      velocityX: options.velocityX ?? 0,
      velocityY: options.velocityY ?? 0,
      subtype: options.subtype ?? 0,
      radius: options.radius ?? DEFAULT_RADIUS,
      lifetime: options.lifetime ?? LIFETIME_PERMANENT,
      rate: options.rate ?? DEFAULT_EMISSION_RATE,
      cooldown: 0,
      period: options.period ?? 0,
      flags: BUILDABLE_FLAGS.ACTIVE,
      radiusChangeRate: options.radiusChangeRate ?? 0,
    };

    // Set growing/shrinking flags
    if (instance.radiusChangeRate > 0) {
      instance.flags |= BUILDABLE_FLAGS.GROWING;
    } else if (instance.radiusChangeRate < 0) {
      instance.flags |= BUILDABLE_FLAGS.SHRINKING;
    }

    // Set periodic flag
    if (instance.period > 0) {
      instance.flags |= BUILDABLE_FLAGS.PERIODIC;
    }

    this.buildables.set(slot, instance);
    this.writeToTextures(slot, instance);
    this.dirtySlots.add(slot);

    return slot;
  }

  /**
   * Remove a buildable by its slot index
   * Note: If this is a rigid body buildable, caller should also remove the Rapier body
   * @returns The rigid body ID if one was associated, or undefined
   */
  removeBuildable(slot: number): { removed: boolean; rigidBodyId?: number } {
    if (!this.buildables.has(slot)) {
      return { removed: false };
    }

    // Get rigid body ID before clearing (so caller can remove it from PhysicsManager)
    const rigidBodyId = this.rigidBodyIds.get(slot);
    this.rigidBodyIds.delete(slot);

    this.buildables.delete(slot);
    this.clearSlot(slot);
    this.freeSlots.push(slot);
    this.dirtySlots.add(slot);

    return { removed: true, rigidBodyId };
  }

  /**
   * Get a buildable instance by slot
   */
  getBuildable(slot: number): BuildableInstance | undefined {
    return this.buildables.get(slot);
  }

  /**
   * Set the Rapier rigid body ID associated with a buildable slot
   */
  setRigidBodyId(slot: number, rigidBodyId: number): void {
    this.rigidBodyIds.set(slot, rigidBodyId);
  }

  /**
   * Get the Rapier rigid body ID associated with a buildable slot
   */
  getRigidBodyId(slot: number): number | undefined {
    return this.rigidBodyIds.get(slot);
  }

  /**
   * Clear the Rapier rigid body ID for a slot
   */
  clearRigidBodyId(slot: number): void {
    this.rigidBodyIds.delete(slot);
  }

  /**
   * Check if a slot has an associated rigid body
   */
  hasRigidBody(slot: number): boolean {
    return this.rigidBodyIds.has(slot);
  }

  /**
   * Update a buildable's properties
   */
  updateBuildable(slot: number, updates: Partial<BuildableInstance>): boolean {
    const instance = this.buildables.get(slot);
    if (!instance) return false;

    Object.assign(instance, updates);
    this.writeToTextures(slot, instance);
    this.dirtySlots.add(slot);

    return true;
  }

  /**
   * Remove all buildables in a radius around a position
   * @returns Object with count of removed buildables and array of rigid body IDs that need to be removed
   */
  removeBuildablesInRadius(x: number, y: number, radius: number): { removed: number; rigidBodyIds: number[] } {
    let removed = 0;
    const rigidBodyIds: number[] = [];
    const radiusSq = radius * radius;

    for (const [slot, instance] of this.buildables) {
      const dx = instance.x - x;
      const dy = instance.y - y;
      if (dx * dx + dy * dy <= radiusSq) {
        const result = this.removeBuildable(slot);
        if (result.removed) {
          removed++;
          if (result.rigidBodyId !== undefined) {
            rigidBodyIds.push(result.rigidBodyId);
          }
        }
      }
    }

    return { removed, rigidBodyIds };
  }

  /**
   * Clear all buildables
   * @returns Array of rigid body IDs that need to be removed from PhysicsManager
   */
  clear(): number[] {
    const rigidBodyIds = Array.from(this.rigidBodyIds.values());

    for (const slot of this.buildables.keys()) {
      this.clearSlot(slot);
      this.freeSlots.push(slot);
    }
    this.buildables.clear();
    this.rigidBodyIds.clear();
    this.needsFullUpdate = true;

    return rigidBodyIds;
  }

  /**
   * Write buildable data to texture arrays
   */
  private writeToTextures(slot: number, instance: BuildableInstance): void {
    const baseIndex = slot * 4;

    // Position texture: x, y, vx, vy
    this.positionData[baseIndex + 0] = instance.x;
    this.positionData[baseIndex + 1] = instance.y;
    this.positionData[baseIndex + 2] = instance.velocityX;
    this.positionData[baseIndex + 3] = instance.velocityY;

    // Data texture: packed(type,subtype), radius, lifetime, packed(rate,cooldown+flags)
    this.dataData[baseIndex + 0] = packTypeAndSubtype(instance.type, instance.subtype);
    this.dataData[baseIndex + 1] = instance.radius;
    this.dataData[baseIndex + 2] = instance.lifetime;
    // Pack rate, period, and flags together
    // We'll use: rate(16 bits) + flags(8 bits) + period(8 bits scaled)
    this.dataData[baseIndex + 3] = packRateAndCooldown(instance.rate, instance.flags + instance.period * 256);
  }

  /**
   * Clear a slot in the texture arrays (mark as empty)
   */
  private clearSlot(slot: number): void {
    const baseIndex = slot * 4;

    // Clear position
    this.positionData[baseIndex + 0] = 0;
    this.positionData[baseIndex + 1] = 0;
    this.positionData[baseIndex + 2] = 0;
    this.positionData[baseIndex + 3] = 0;

    // Clear data (type 0 = EMPTY)
    this.dataData[baseIndex + 0] = 0;
    this.dataData[baseIndex + 1] = 0;
    this.dataData[baseIndex + 2] = 0;
    this.dataData[baseIndex + 3] = 0;
  }

  /**
   * Update buildables each frame - decrements lifetimes and removes expired ones
   * Should be called once per simulation frame
   */
  update(): void {
    const toRemove: number[] = [];

    for (const [slot, instance] of this.buildables) {
      // Skip permanent buildables
      if (instance.lifetime === LIFETIME_PERMANENT) continue;

      // Decrement lifetime
      instance.lifetime--;

      // Mark for removal if expired
      if (instance.lifetime <= 0) {
        toRemove.push(slot);
      } else {
        // Update texture with new lifetime
        this.writeToTextures(slot, instance);
        this.dirtySlots.add(slot);
      }
    }

    // Remove expired buildables
    for (const slot of toRemove) {
      this.removeBuildable(slot);
    }
  }

  /**
   * Sync textures to GPU (call after adding/removing buildables)
   */
  syncToGPU(): void {
    if (this.needsFullUpdate || this.dirtySlots.size > 0) {
      // For now, just mark the whole texture as needing update
      // Three.js will handle the upload
      this.positionTexture.needsUpdate = true;
      this.dataTexture.needsUpdate = true;
      this.dirtySlots.clear();
      this.needsFullUpdate = false;
    }
  }

  /**
   * Read back position data from GPU after shader updates (if needed)
   * Note: This is expensive and should be avoided if possible
   */
  readBackFromGPU(_gl: WebGLRenderingContext | WebGL2RenderingContext): void {
    // For now, we'll let the GPU handle updates and not read back
    // If we need CPU-side tracking of positions, we'd implement this
    console.warn('BuildablesTextureManager.readBackFromGPU: Not implemented');
  }

  /**
   * Dispose of textures
   */
  dispose(): void {
    this.positionTexture.dispose();
    this.dataTexture.dispose();
  }

  /**
   * Get all buildables (for debugging/inspection)
   */
  getAllBuildables(): BuildableInstance[] {
    return Array.from(this.buildables.values());
  }

  /**
   * Get texture dimensions for shaders
   */
  static getTextureDimensions(): { width: number; height: number } {
    return {
      width: BUILDABLES_TEXTURE_WIDTH,
      height: BUILDABLES_TEXTURE_HEIGHT,
    };
  }
}

// Singleton instance for global access
let globalManager: BuildablesTextureManager | null = null;

/**
 * Get the global buildables texture manager instance
 */
export function getBuildablesManager(): BuildablesTextureManager {
  if (!globalManager) {
    globalManager = new BuildablesTextureManager();
  }
  return globalManager;
}

/**
 * Reset the global manager (for testing or world reset)
 */
export function resetBuildablesManager(): void {
  if (globalManager) {
    globalManager.dispose();
    globalManager = null;
  }
}
