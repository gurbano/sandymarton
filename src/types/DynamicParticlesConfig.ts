/**
 * Configuration for the dynamic particles system
 * Dynamic particles are ejected from the world when force exceeds a threshold,
 * follow ballistic trajectories, and settle back when velocity drops.
 */

export const DYNAMIC_BUFFER_SIZE = 32; // 32x32 = 1024 max dynamic particles
export const MAX_DYNAMIC_PARTICLES = DYNAMIC_BUFFER_SIZE * DYNAMIC_BUFFER_SIZE;

export interface DynamicParticlesConfig {
  /** Enable/disable the dynamic particles system */
  enabled: boolean;
  /** Maximum new dynamic particles that can spawn per frame */
  maxSpawnsPerFrame: number;
  /** Maximum pixels a dynamic particle can travel per frame */
  maxTraversal: number;
  /** Velocity threshold below which particle settles back into world */
  velocityThreshold: number;
  /** Force magnitude required to eject a particle from the world */
  forceEjectionThreshold: number;
  /** Gravity applied to dynamic particles (pixels/frame²) */
  gravity: number;
  /** Air resistance multiplier (0-1, applied each frame) */
  friction: number;
  /** Bounce energy retention on collision (0-1) */
  bounceRestitution: number;
  /** Chance (0-1) that hitting a moveable particle makes it dynamic too */
  momentumTransferChance: number;
  /** Speed multiplier for dynamic particles (0.05-1.0, affects ejection velocity and physics) */
  speedMultiplier: number;
}

export const DEFAULT_DYNAMIC_PARTICLES_CONFIG: DynamicParticlesConfig = {
  enabled: true,
  maxSpawnsPerFrame: 256,
  maxTraversal: 16,
  velocityThreshold: 0.5,
  forceEjectionThreshold: 0.3,  // Force is in [-1,1] range, max magnitude ~1.41
  gravity: 0.01,
  friction: 1.0,
  bounceRestitution: 0.6,
  momentumTransferChance: 0.3,
  speedMultiplier: 1.5, // 20% of full speed by default
};
