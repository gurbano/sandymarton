/**
 * Particle type category boundaries
 * These constants define the ranges for different particle categories
 * and are used both in TypeScript and in shaders (via ShaderConstants)
 */

export const ParticleTypeRanges = {
  // Empty particles: 0-15
  EMPTY_MIN: 0,
  EMPTY_MAX: 15,

  // Static particles: 16-32
  STATIC_MIN: 16,
  STATIC_MAX: 32,

  // Solid movable particles: 33-63
  SOLID_MIN: 33,
  SOLID_MAX: 63,

  // Liquid particles: 64-111
  LIQUID_MIN: 64,
  LIQUID_MAX: 111,

  // Gas particles: 112-159
  GAS_MIN: 112,
  GAS_MAX: 159,
} as const;

/**
 * Individual particle type constants
 * These match the ParticleType enum values
 */
export const ParticleTypeConstants = {
  EMPTY: 0,
  STONE: 17,
  SAND: 35,
  DIRT: 37,
  GRAVEL: 39,
  WATER: 65,
  LAVA: 80,
  SLIME: 96,
  ACID: 97,
  STEAM: 113,
  SMOKE: 128,
  AIR: 144,
} as const;

/**
 * Generate shader constant declarations
 * This creates GLSL constant definitions that can be injected into shaders
 */
export function generateShaderConstants(): string {
  return `
// Particle type category ranges
const float EMPTY_MIN = ${ParticleTypeRanges.EMPTY_MIN}.0;
const float EMPTY_MAX = ${ParticleTypeRanges.EMPTY_MAX}.0;
const float STATIC_MIN = ${ParticleTypeRanges.STATIC_MIN}.0;
const float STATIC_MAX = ${ParticleTypeRanges.STATIC_MAX}.0;
const float SOLID_MIN = ${ParticleTypeRanges.SOLID_MIN}.0;
const float SOLID_MAX = ${ParticleTypeRanges.SOLID_MAX}.0;
const float LIQUID_MIN = ${ParticleTypeRanges.LIQUID_MIN}.0;
const float LIQUID_MAX = ${ParticleTypeRanges.LIQUID_MAX}.0;
const float GAS_MIN = ${ParticleTypeRanges.GAS_MIN}.0;
const float GAS_MAX = ${ParticleTypeRanges.GAS_MAX}.0;

// Individual particle types
const float EMPTY_TYPE = ${ParticleTypeConstants.EMPTY}.0;
const float STONE_TYPE = ${ParticleTypeConstants.STONE}.0;
const float SAND_TYPE = ${ParticleTypeConstants.SAND}.0;
const float DIRT_TYPE = ${ParticleTypeConstants.DIRT}.0;
const float GRAVEL_TYPE = ${ParticleTypeConstants.GRAVEL}.0;
const float WATER_TYPE = ${ParticleTypeConstants.WATER}.0;
const float LAVA_TYPE = ${ParticleTypeConstants.LAVA}.0;
const float SLIME_TYPE = ${ParticleTypeConstants.SLIME}.0;
const float ACID_TYPE = ${ParticleTypeConstants.ACID}.0;
const float STEAM_TYPE = ${ParticleTypeConstants.STEAM}.0;
const float SMOKE_TYPE = ${ParticleTypeConstants.SMOKE}.0;
const float AIR_TYPE = ${ParticleTypeConstants.AIR}.0;

// Internal behavior states for Margolus CA
// These represent how particles behave, not what they are
const float INTERNAL_EMPTY = 0.0;
const float INTERNAL_SOLID = 1.0;
const float INTERNAL_LIQUID = 2.0;
const float INTERNAL_GAS = 3.0;
const float INTERNAL_STATIC = 100.0;
`;
}
