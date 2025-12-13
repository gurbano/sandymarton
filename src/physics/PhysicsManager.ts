/**
 * PhysicsManager - Rapier.js physics integration for dynamic particles and rigid bodies
 *
 * Manages:
 * - Physics world initialization and stepping
 * - Dynamic particles ejected from the cellular automaton
 * - Rigid body objects (boxes, circles)
 * - Collision geometry synced from world texture
 * - Render buffers for GPU visualization
 */

import RAPIER from '@dimforge/rapier2d-compat';
import type { PhysicsConfig, RigidBodyConfig } from '../types/PhysicsConfig';
import {
  DEFAULT_PHYSICS_CONFIG,
  DEFAULT_RIGID_BODY_CONFIG,
  MAX_PHYSICS_PARTICLES,
  MAX_RIGID_BODIES,
} from '../types/PhysicsConfig';
import { buildCollisionRects } from './CollisionGridBuilder';

export interface PhysicsParticle {
  body: RAPIER.RigidBody;
  type: number;
  temperature: number;
}

export interface RigidBodyObject {
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
  width: number;
  height: number;
  shape: 'box' | 'circle';
}

export interface SettledParticle {
  x: number;
  y: number;
  type: number;
  temperature: number;
}

export class PhysicsManager {
  private static instance: PhysicsManager | null = null;

  private world: RAPIER.World | null = null;
  private initialized = false;

  // Particles
  private particles: Map<number, PhysicsParticle> = new Map();
  private nextParticleId = 0;

  // Rigid bodies
  private rigidBodies: Map<number, RigidBodyObject> = new Map();
  private nextRigidBodyId = 0;

  // World collision geometry
  private worldColliders: RAPIER.Collider[] = [];
  private boundaryColliders: RAPIER.Collider[] = [];
  private lastCollisionRebuild = 0;
  private dirtyRegions: Set<string> = new Set();

  // Collision rect data for debug rendering (x, y, width, height per rect)
  public collisionRects: Float32Array = new Float32Array(0);
  public collisionRectCount = 0;

  // Configuration
  private config: PhysicsConfig = { ...DEFAULT_PHYSICS_CONFIG };
  private rigidBodyConfig: RigidBodyConfig = { ...DEFAULT_RIGID_BODY_CONFIG };

  // Render buffers (updated each step for GPU upload)
  public particlePositions: Float32Array;
  public particleTypes: Uint8Array;
  public particleCount = 0;

  // Rigid body render data
  public rigidBodyPositions: Float32Array;
  public rigidBodyRotations: Float32Array;
  public rigidBodySizes: Float32Array;
  public rigidBodyCount = 0;

  // Settled particles waiting for reintegration
  public settledParticles: SettledParticle[] = [];

  private constructor() {
    // Pre-allocate render buffers
    this.particlePositions = new Float32Array(MAX_PHYSICS_PARTICLES * 2);
    this.particleTypes = new Uint8Array(MAX_PHYSICS_PARTICLES);
    this.rigidBodyPositions = new Float32Array(MAX_RIGID_BODIES * 2);
    this.rigidBodyRotations = new Float32Array(MAX_RIGID_BODIES);
    this.rigidBodySizes = new Float32Array(MAX_RIGID_BODIES * 2);
  }

  static getInstance(): PhysicsManager {
    if (!PhysicsManager.instance) {
      PhysicsManager.instance = new PhysicsManager();
    }
    return PhysicsManager.instance;
  }

  static resetInstance(): void {
    if (PhysicsManager.instance) {
      PhysicsManager.instance.dispose();
      PhysicsManager.instance = null;
    }
  }

  /**
   * Initialize Rapier physics world (must be called before use)
   */
  async init(): Promise<void> {
    if (this.initialized) return;

    await RAPIER.init();

    // Create physics world with gravity
    // Note: In this world, positive Y is up, so gravity is negative Y
    this.world = new RAPIER.World({ x: 0.0, y: -this.config.gravity });

    this.initialized = true;
    console.log('[PhysicsManager] Rapier initialized');
  }

  /**
   * Create boundary wall colliders around the world edges
   */
  createBoundaryWalls(worldWidth: number, worldHeight: number): void {
    if (!this.world) return;

    // Remove existing boundary colliders
    for (const collider of this.boundaryColliders) {
      this.world.removeCollider(collider, false);
    }
    this.boundaryColliders = [];

    const wallThickness = 20;

    // Left wall
    const leftWall = RAPIER.ColliderDesc.cuboid(wallThickness, worldHeight / 2)
      .setTranslation(-wallThickness, worldHeight / 2);
    this.boundaryColliders.push(this.world.createCollider(leftWall));

    // Right wall
    const rightWall = RAPIER.ColliderDesc.cuboid(wallThickness, worldHeight / 2)
      .setTranslation(worldWidth + wallThickness, worldHeight / 2);
    this.boundaryColliders.push(this.world.createCollider(rightWall));

    // Bottom wall
    const bottomWall = RAPIER.ColliderDesc.cuboid(worldWidth / 2, wallThickness)
      .setTranslation(worldWidth / 2, -wallThickness);
    this.boundaryColliders.push(this.world.createCollider(bottomWall));

    // Top wall
    const topWall = RAPIER.ColliderDesc.cuboid(worldWidth / 2, wallThickness)
      .setTranslation(worldWidth / 2, worldHeight + wallThickness);
    this.boundaryColliders.push(this.world.createCollider(topWall));

    console.log('[PhysicsManager] Created boundary walls');
  }

  /**
   * Check if physics is ready
   */
  get isInitialized(): boolean {
    return this.initialized && this.world !== null;
  }

  /**
   * Get current configuration
   */
  getConfig(): Readonly<PhysicsConfig> {
    return this.config;
  }

  /**
   * Update configuration
   */
  setConfig(config: Partial<PhysicsConfig>): void {
    this.config = { ...this.config, ...config };

    // Update gravity if world exists
    if (this.world) {
      this.world.gravity = { x: 0.0, y: -this.config.gravity };
    }
  }

  /**
   * Enable/disable physics
   */
  setEnabled(enabled: boolean): void {
    this.config.enabled = enabled;
  }

  get enabled(): boolean {
    return this.config.enabled;
  }

  // ==================== PARTICLE MANAGEMENT ====================

  /**
   * Spawn a dynamic particle from world extraction
   */
  spawnParticle(
    x: number,
    y: number,
    vx: number,
    vy: number,
    type: number,
    temperature: number
  ): number | null {
    if (!this.world || !this.config.enabled) return null;
    if (this.particles.size >= MAX_PHYSICS_PARTICLES) return null;

    // Cap velocity to prevent tunneling through collision geometry
    const maxVelocity = 150.0;
    const speed = Math.hypot(vx, vy);
    let cappedVx = vx;
    let cappedVy = vy;
    if (speed > maxVelocity) {
      const scale = maxVelocity / speed;
      cappedVx = vx * scale;
      cappedVy = vy * scale;
    }

    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(x, y)
      .setLinvel(cappedVx, cappedVy)
      .setLinearDamping(this.config.particleDamping)
      .setCcdEnabled(true); // Continuous collision for fast particles

    const body = this.world.createRigidBody(bodyDesc);

    const colliderDesc = RAPIER.ColliderDesc.ball(this.config.particleRadius)
      .setRestitution(this.config.particleRestitution)
      .setFriction(this.config.particleFriction);

    this.world.createCollider(colliderDesc, body);

    const id = this.nextParticleId++;
    this.particles.set(id, { body, type, temperature });

    return id;
  }

  /**
   * Remove a particle by ID
   */
  removeParticle(id: number): void {
    const particle = this.particles.get(id);
    if (particle && this.world) {
      this.world.removeRigidBody(particle.body);
      this.particles.delete(id);
    }
  }

  /**
   * Get active particle count
   */
  get activeParticleCount(): number {
    return this.particles.size;
  }

  // ==================== RIGID BODY MANAGEMENT ====================

  /**
   * Spawn a box rigid body
   */
  spawnBox(
    x: number,
    y: number,
    width: number,
    height: number,
    angle = 0
  ): number | null {
    if (!this.world || !this.config.enabled) return null;
    if (this.rigidBodies.size >= MAX_RIGID_BODIES) return null;

    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(x, y)
      .setRotation(angle)
      .setLinearDamping(this.rigidBodyConfig.linearDamping)
      .setAngularDamping(this.rigidBodyConfig.angularDamping);

    const body = this.world.createRigidBody(bodyDesc);

    const colliderDesc = RAPIER.ColliderDesc.cuboid(width / 2, height / 2)
      .setDensity(this.rigidBodyConfig.density)
      .setRestitution(this.rigidBodyConfig.restitution)
      .setFriction(this.rigidBodyConfig.friction);

    const collider = this.world.createCollider(colliderDesc, body);

    const id = this.nextRigidBodyId++;
    this.rigidBodies.set(id, { body, collider, width, height, shape: 'box' });

    return id;
  }

  /**
   * Spawn a circle rigid body
   */
  spawnCircle(x: number, y: number, radius: number): number | null {
    if (!this.world || !this.config.enabled) return null;
    if (this.rigidBodies.size >= MAX_RIGID_BODIES) return null;

    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setTranslation(x, y)
      .setLinearDamping(this.rigidBodyConfig.linearDamping)
      .setAngularDamping(this.rigidBodyConfig.angularDamping);

    const body = this.world.createRigidBody(bodyDesc);

    const colliderDesc = RAPIER.ColliderDesc.ball(radius)
      .setDensity(this.rigidBodyConfig.density)
      .setRestitution(this.rigidBodyConfig.restitution)
      .setFriction(this.rigidBodyConfig.friction);

    const collider = this.world.createCollider(colliderDesc, body);

    const id = this.nextRigidBodyId++;
    this.rigidBodies.set(id, {
      body,
      collider,
      width: radius * 2,
      height: radius * 2,
      shape: 'circle',
    });

    return id;
  }

  /**
   * Remove a rigid body by ID
   */
  removeRigidBody(id: number): void {
    const rb = this.rigidBodies.get(id);
    if (rb && this.world) {
      this.world.removeRigidBody(rb.body);
      this.rigidBodies.delete(id);
    }
  }

  /**
   * Get active rigid body count
   */
  get activeRigidBodyCount(): number {
    return this.rigidBodies.size;
  }

  // ==================== WORLD COLLISION GEOMETRY ====================

  /**
   * Mark a region as dirty (needs collision rebuild)
   */
  markDirty(x: number, y: number): void {
    const cellSize = this.config.collisionCellSize;
    const gx = Math.floor(x / cellSize);
    const gy = Math.floor(y / cellSize);
    this.dirtyRegions.add(`${gx},${gy}`);
  }

  /**
   * Check if collision grid should be rebuilt
   */
  shouldRebuildColliders(now: number): boolean {
    // Build colliders if none exist yet (initial build, allows debug overlay without particles)
    const needsInitialBuild = this.worldColliders.length === 0;
    // Rebuild periodically when we have active particles
    const needsPeriodicRebuild =
      this.particles.size > 0 &&
      now - this.lastCollisionRebuild > this.config.collisionRebuildInterval;

    return needsInitialBuild || needsPeriodicRebuild;
  }

  /**
   * Rebuild world collision geometry from texture data
   */
  rebuildWorldColliders(
    worldData: Uint8Array,
    width: number,
    height: number
  ): void {
    if (!this.world) return;

    // Remove old colliders
    for (const collider of this.worldColliders) {
      this.world.removeCollider(collider, false);
    }
    this.worldColliders = [];

    // Build optimized collision rectangles using greedy meshing
    const rects = buildCollisionRects(
      worldData,
      width,
      height,
      this.config.collisionCellSize
    );

    // Store rect data for debug rendering (x, y, width, height per rect)
    this.collisionRects = new Float32Array(rects.length * 4);
    this.collisionRectCount = rects.length;

    // Create static colliders for each merged rectangle
    for (let i = 0; i < rects.length; i++) {
      const rect = rects[i];
      const halfWidth = rect.width / 2;
      const halfHeight = rect.height / 2;
      // Convert from screen coords (Y=0 at top) to Rapier coords (Y=0 at bottom)
      const rapierY = height - rect.y - rect.height;
      const colliderDesc = RAPIER.ColliderDesc.cuboid(halfWidth, halfHeight)
        .setTranslation(rect.x + halfWidth, rapierY + halfHeight);

      const collider = this.world.createCollider(colliderDesc);
      this.worldColliders.push(collider);

      // Store Rapier coords for rendering (renderer will flip back to screen)
      this.collisionRects[i * 4] = rect.x;
      this.collisionRects[i * 4 + 1] = rapierY;
      this.collisionRects[i * 4 + 2] = rect.width;
      this.collisionRects[i * 4 + 3] = rect.height;
    }

    this.dirtyRegions.clear();
    this.lastCollisionRebuild = performance.now();

    console.log(
      `[PhysicsManager] Rebuilt collision grid: ${rects.length} colliders (greedy meshed)`
    );
  }

  // ==================== SIMULATION STEP ====================

  /**
   * Step the physics simulation
   */
  step(): void {
    if (!this.world || !this.config.enabled) return;

    // Step Rapier world
    this.world.step();

    // Check for settled particles
    const toRemove: number[] = [];

    for (const [id, particle] of this.particles) {
      const vel = particle.body.linvel();
      const speed = Math.hypot(vel.x, vel.y);

      if (speed < this.config.settleThreshold) {
        const pos = particle.body.translation();

        // Queue for reintegration
        this.settledParticles.push({
          x: Math.floor(pos.x),
          y: Math.floor(pos.y),
          type: particle.type,
          temperature: particle.temperature,
        });

        toRemove.push(id);
      }
    }

    // Remove settled particles
    for (const id of toRemove) {
      this.removeParticle(id);
    }

    // Update render buffers
    this.updateRenderBuffers();
  }

  /**
   * Update render buffers for GPU upload
   */
  private updateRenderBuffers(): void {
    // Update particle buffers
    let i = 0;
    for (const [, particle] of this.particles) {
      if (i >= MAX_PHYSICS_PARTICLES) break;

      const pos = particle.body.translation();
      this.particlePositions[i * 2] = pos.x;
      this.particlePositions[i * 2 + 1] = pos.y;
      this.particleTypes[i] = particle.type;
      i++;
    }
    this.particleCount = i;

    // Update rigid body buffers
    let j = 0;
    for (const [, rb] of this.rigidBodies) {
      if (j >= MAX_RIGID_BODIES) break;

      const pos = rb.body.translation();
      const rot = rb.body.rotation();

      this.rigidBodyPositions[j * 2] = pos.x;
      this.rigidBodyPositions[j * 2 + 1] = pos.y;
      this.rigidBodyRotations[j] = rot;
      this.rigidBodySizes[j * 2] = rb.width;
      this.rigidBodySizes[j * 2 + 1] = rb.height;
      j++;
    }
    this.rigidBodyCount = j;
  }

  /**
   * Get settled particles for reintegration (clears internal queue)
   */
  getSettledParticles(maxCount: number): SettledParticle[] {
    return this.settledParticles.splice(0, maxCount);
  }

  // ==================== CLEANUP ====================

  /**
   * Clear all particles and rigid bodies
   */
  clear(): void {
    if (!this.world) return;

    // Remove all particles
    for (const [, particle] of this.particles) {
      this.world.removeRigidBody(particle.body);
    }
    this.particles.clear();

    // Remove all rigid bodies
    for (const [, rb] of this.rigidBodies) {
      this.world.removeRigidBody(rb.body);
    }
    this.rigidBodies.clear();

    // Clear settled queue
    this.settledParticles = [];

    // Reset counters
    this.particleCount = 0;
    this.rigidBodyCount = 0;

    console.log('[PhysicsManager] Cleared all physics objects');
  }

  /**
   * Dispose of physics world and resources
   */
  dispose(): void {
    this.clear();

    // Remove world colliders
    if (this.world) {
      for (const collider of this.worldColliders) {
        this.world.removeCollider(collider, false);
      }
    }
    this.worldColliders = [];

    this.world = null;
    this.initialized = false;

    console.log('[PhysicsManager] Disposed');
  }

  /**
   * Reset to initial state
   */
  reset(): void {
    this.clear();
    this.config = { ...DEFAULT_PHYSICS_CONFIG };
    this.rigidBodyConfig = { ...DEFAULT_RIGID_BODY_CONFIG };
    this.nextParticleId = 0;
    this.nextRigidBodyId = 0;
    this.dirtyRegions.clear();
    this.lastCollisionRebuild = 0;
  }
}

// Singleton accessors
export function getPhysicsManager(): PhysicsManager {
  return PhysicsManager.getInstance();
}

export function resetPhysicsManager(): void {
  PhysicsManager.resetInstance();
}
