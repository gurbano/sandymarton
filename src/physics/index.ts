/**
 * Physics module - Rapier.js integration for dynamic particles and rigid bodies
 */

export { PhysicsManager, getPhysicsManager, resetPhysicsManager } from './PhysicsManager';
export type { PhysicsParticle, RigidBodyObject, SettledParticle } from './PhysicsManager';

export { PhysicsRenderer } from './PhysicsRenderer';

export { usePhysicsSimulation } from './usePhysicsSimulation';

export { buildCollisionGrid, buildHeightmap } from './CollisionGridBuilder';
export type { CollisionCell } from './CollisionGridBuilder';
