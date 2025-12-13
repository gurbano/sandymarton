/**
 * Physics Configuration Types
 *
 * Configuration for the Rapier.js physics system that handles
 * dynamic particles and rigid bodies.
 */

export interface PhysicsConfig {
  /** Enable/disable physics simulation */
  enabled: boolean;

  /** Gravity strength (pixels/frame^2, positive = down in world coords) */
  gravity: number;

  /** Linear damping for particles (air resistance, 0-1) */
  particleDamping: number;

  /** Particle collision radius in pixels */
  particleRadius: number;

  /** Bounce restitution for particles (0 = no bounce, 1 = perfect bounce) */
  particleRestitution: number;

  /** Friction coefficient for particles */
  particleFriction: number;

  /** Force threshold for ejecting particles from world (0-1 normalized) */
  forceEjectionThreshold: number;

  /** Velocity threshold below which particles settle back into world */
  settleThreshold: number;

  /** Maximum particles to extract per frame */
  maxExtractionsPerFrame: number;

  /** Maximum particles to reintegrate per frame */
  maxReintegrationsPerFrame: number;

  /** Interval (ms) between collision grid rebuilds */
  collisionRebuildInterval: number;

  /** Size of collision grid cells in pixels */
  collisionCellSize: number;

  /** Velocity multiplier for initial ejection */
  ejectionVelocityMultiplier: number;
}

export interface RigidBodyConfig {
  /** Density of rigid bodies (affects mass) */
  density: number;

  /** Restitution (bounciness) of rigid bodies */
  restitution: number;

  /** Friction of rigid bodies */
  friction: number;

  /** Linear damping for rigid bodies */
  linearDamping: number;

  /** Angular damping for rigid bodies */
  angularDamping: number;
}

export const DEFAULT_PHYSICS_CONFIG: PhysicsConfig = {
  enabled: true,
  gravity: -50.0,
  particleDamping: 0.01,
  particleRadius: 0.5,
  particleRestitution: 0.1,
  particleFriction: 0.9,
  forceEjectionThreshold: 0.3,
  settleThreshold: 30.0,
  maxExtractionsPerFrame: 256,
  maxReintegrationsPerFrame: 256,
  collisionRebuildInterval: 500,
  collisionCellSize: 4,
  ejectionVelocityMultiplier: 160.0,
};

export const DEFAULT_RIGID_BODY_CONFIG: RigidBodyConfig = {
  density: 2.0,
  restitution: 0.3,
  friction: 0.6,
  linearDamping: 0.1,
  angularDamping: 0.1,
};

/** Maximum number of physics particles */
export const MAX_PHYSICS_PARTICLES = 10000;

/** Maximum number of rigid bodies */
export const MAX_RIGID_BODIES = 100;

/** Extraction texture width (particles per frame) */
export const EXTRACTION_BUFFER_SIZE = 256;
