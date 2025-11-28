/**
 * Particle type definitions
 * Each type occupies a range of 16 values to allow for variants
 */

export enum ParticleType {
  // Empty types (0-15)
  EMPTY = 0,
  // VOID = 1,

  // Solid particles (16-63)
  // SOLID = 16,
  SAND = 17,
  DIRT = 32,
  STONE = 48,

  // Liquid particles (64-111)
  // LIQUID = 64,
  WATER = 65,
  LAVA = 80,
  SLIME = 96,
  ACID = 97,
  
  // Gas particles (112-159)
  // GAS = 112,
  STEAM = 113,
  SMOKE = 128,
  AIR = 144,

}
export type MaterialAttributes = {
  density: number;
  viscosity: number;
  meltingPoint: number;
  boilingPoint: number;
  color: [number, number, number, number]; // RGBA
  hardness: number;
}

const BaseEmptyAttributes: MaterialAttributes = {
  density: 0,
  viscosity: 0,
  meltingPoint: 0,
  boilingPoint: 0,
  color: [0, 0, 0, 0],
  hardness: 0,
};

const BaseSolidAttributes: MaterialAttributes = {
  density: 2000,
  viscosity: 0,
  meltingPoint: 1500,
  boilingPoint: 3000,
  color: [128, 128, 128, 255],
  hardness: 8,
};

const BaseLiquidAttributes: MaterialAttributes = {
  density: 1000,
  viscosity: 100,
  meltingPoint: 0,
  boilingPoint: 100,
  color: [64, 164, 223, 180],
  hardness: 2,
};

const BaseGasAttributes: MaterialAttributes = {
  density: 1,
  viscosity: 10,
  meltingPoint: -100,
  boilingPoint: -50,
  color: [200, 200, 255, 100],
  hardness: 0,
};
/**
 * Particle colors for rendering
 * Maps particle types to RGBA colors (Red, Green, Blue, Alpha)
 * Alpha: 0 = transparent, 255 = opaque
 */
export const ParticleColors: Record<number, [number, number, number, number]> = {
  [ParticleType.EMPTY]: [0, 0, 0, 0],           // Transparent
  [ParticleType.SAND]: [255, 200, 100, 255],    // Opaque yellow-orange
  [ParticleType.DIRT]: [139, 90, 43, 255],      // Opaque brown
  [ParticleType.STONE]: [128, 128, 128, 255],   // Opaque gray
  [ParticleType.WATER]: [0, 0, 223, 180],    // Semi-transparent blue
  [ParticleType.LAVA]: [255, 0, 0, 255],      // Opaque orange-red
  [ParticleType.SLIME]: [100, 255, 100, 200],   // Semi-transparent green
  [ParticleType.ACID]: [150, 255, 50, 220],     // Semi-transparent lime green
  [ParticleType.STEAM]: [200, 200, 255, 100],   // Very transparent light blue
  [ParticleType.SMOKE]: [80, 80, 80, 150],      // Semi-transparent dark gray
};

/**
 * Encode velocity from range [-128, 127] to [0, 255]
 */
export function encodeVelocity(velocity: number): number {
  return Math.max(0, Math.min(255, Math.round(velocity + 128)));
}

/**
 * Decode velocity from range [0, 255] to [-128, 127]
 */
export function decodeVelocity(encoded: number): number {
  return encoded - 128;
}

/**
 * Helper to check if a particle type is empty
 */
export function isEmpty(particleType: number): boolean {
  return particleType < 16;
}

/**
 * Helper to check if a particle type is solid
 */
export function isSolid(particleType: number): boolean {
  return particleType >= 16 && particleType < 64;
}

/**
 * Helper to check if a particle type is liquid
 */
export function isLiquid(particleType: number): boolean {
  return particleType >= 64 && particleType < 112;
}

/**
 * Helper to check if a particle type is gas
 */
export function isGas(particleType: number): boolean {
  return particleType >= 112 && particleType < 160;
}
