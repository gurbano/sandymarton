/**
 * Particle type definitions
 * Each type occupies a range of 16 values to allow for variants
 */

import { ParticleTypeRanges } from './ParticleTypeConstants';

export enum ParticleType {
  // Empty types (0-15)
  EMPTY = 0,
  // VOID = 1,

  // static particles (16-32)
  // STATIC = 16,
  STONE = 17,
  GLASS = 18,      // Insulator - very low conductivity
  HEITE = 19,      // Heat emitter - constantly hot

  // Solid movable particles (33-63)
  // SOLID = 33,
  SAND = 35,
  DIRT = 37,
  GRAVEL = 39,
  COPPER = 40,     // Conductor - very high conductivity
  ITE = 41,      // Insulator - wool-like, very low conductivity
  ICE = 42,      // Frozen water solid phase
  OIL_SLUDGE = 43, // Semi-solidified oil residue
  SLIME_CRYSTAL = 44, // Frozen slime shards
  ACID_CRYSTAL = 45,  // Crystallized acid salts
  COOLANT_ICE = 46,   // Frozen coolant pellets
  NITROGEN_ICE = 47,  // Frozen nitrogen (dry ice equivalent)

  // Liquid particles (64-111)
  // LIQUID = 64,
  WATER = 65,
  LAVA = 80,
  SLIME = 96,
  ACID = 97,
  OIL = 98,        // Insulator liquid - low conductivity
  COOLANT = 99,    // Cooling liquid - high conductivity, cold default
  LIQUID_NITROGEN = 100, // Cryogenic nitrogen

  // Gas particles (112-159)
  // GAS = 112,
  STEAM = 113,
  SMOKE = 128,
  AIR = 144,
  NITROGEN = 145,  // Cold gas - cooling effect
  OIL_VAPOR = 146, // Vaporized oil fumes
  SLIME_VAPOR = 147, // Suspended slime spores
  ACID_VAPOR = 148,  // Acidic fumes
  COOLANT_VAPOR = 149, // Chilled coolant mist

}

// Temperature constants
export const KELVIN_OFFSET = 273; // 0°C = 273K
export const MAX_TEMPERATURE = 65535; // Max temperature in Kelvin (2 bytes)
export const ROOM_TEMPERATURE_K = 298; // 25°C in Kelvin

// Helper to convert Celsius to Kelvin
export function celsiusToKelvin(celsius: number): number {
  return Math.round(celsius + KELVIN_OFFSET);
}

// Helper to convert Kelvin to Celsius
export function kelvinToCelsius(kelvin: number): number {
  return kelvin - KELVIN_OFFSET;
}

// Encode 16-bit temperature into two bytes (low, high)
export function encodeTemperature(kelvin: number): [number, number] {
  const clamped = Math.max(0, Math.min(MAX_TEMPERATURE, Math.round(kelvin)));
  const low = clamped & 0xFF;
  const high = (clamped >> 8) & 0xFF;
  return [low, high];
}

// Decode two bytes back to 16-bit temperature
export function decodeTemperature(low: number, high: number): number {
  return low | (high << 8);
}

export type MaterialAttributes = {
  density: number;
  viscosity: number;
  meltingPoint: number;
  boilingPoint: number;
  color: [number, number, number, number]; // RGBA
  hardness: number;
  friction: number; // For Margolus CA topple probability (0.0 - 1.0)
  defaultTemperature: number; // Default temperature in Kelvin when particle is created
  thermalCapacity: number; // Thermal capacity (0.0 - 1.0): higher = particle loses LESS temp when emitting heat (lava=0.9 loses 10% of emitted heat)
  thermalConductivity: number; // Thermal conductivity (0.0 - 1.0): rate of heat transfer. Low = insulator, High = conductor
  glowStrength: number; // Emissive/glow strength (0.0 - 1.0)
}

/**
 * Particle colors for rendering
 * Maps particle types to RGBA colors (Red, Green, Blue, Alpha)
 * Alpha: 0 = transparent, 255 = opaque
 */
export const ParticleColors: Record<number, [number, number, number, number]> = {
  [ParticleType.EMPTY]: [0, 0, 0, 0],           // Transparent
  [ParticleType.STONE]: [128, 128, 128, 255],   // Opaque gray
  [ParticleType.GLASS]: [200, 230, 255, 150],   // Semi-transparent light blue (glass)
  [ParticleType.HEITE]: [255, 100, 50, 255],    // Orange-red (heat emitter)
  [ParticleType.SAND]: [255, 200, 100, 255],    // Opaque yellow-orange
  [ParticleType.DIRT]: [139, 90, 43, 255],      // Opaque brown
  [ParticleType.GRAVEL]: [100, 100, 100, 255],  // Opaque dark gray
  [ParticleType.COPPER]: [184, 115, 51, 255],   // Copper brown-orange
  [ParticleType.ITE]: [255, 250, 220, 255],  // Off-white (wool/insulation)
  [ParticleType.ICE]: [180, 220, 255, 255],     // Frosted blue-white
  [ParticleType.OIL_SLUDGE]: [60, 40, 25, 255], // Dark brown solid
  [ParticleType.SLIME_CRYSTAL]: [140, 255, 160, 255], // Bright green crystal
  [ParticleType.ACID_CRYSTAL]: [200, 255, 120, 255],  // Neon yellow crystal
  [ParticleType.COOLANT_ICE]: [150, 220, 255, 255],   // Pale cyan ice
  [ParticleType.NITROGEN_ICE]: [200, 230, 255, 255],  // Nearly white ice
  [ParticleType.WATER]: [50, 150, 255, 220],    // Bright cyan-blue, less transparent
  [ParticleType.LAVA]: [255, 0, 0, 255],        // Opaque orange-red
  [ParticleType.SLIME]: [100, 255, 100, 200],   // Semi-transparent green
  [ParticleType.ACID]: [150, 255, 50, 220],     // Semi-transparent lime green
  [ParticleType.OIL]: [40, 30, 20, 200],        // Dark brown (oil)
  [ParticleType.COOLANT]: [100, 200, 255, 200], // Light blue (coolant)
  [ParticleType.LIQUID_NITROGEN]: [180, 220, 255, 220], // Transparent icy blue
  [ParticleType.STEAM]: [200, 200, 255, 100],   // Very transparent light blue
  [ParticleType.SMOKE]: [80, 80, 80, 150],      // Semi-transparent dark gray
  [ParticleType.NITROGEN]: [150, 200, 255, 80], // Very transparent cold blue
  [ParticleType.OIL_VAPOR]: [120, 120, 110, 110], // Pale gray brown fumes
  [ParticleType.SLIME_VAPOR]: [140, 255, 170, 100], // Greenish mist
  [ParticleType.ACID_VAPOR]: [190, 255, 120, 110],  // Yellow-green vapor
  [ParticleType.COOLANT_VAPOR]: [160, 220, 255, 110], // Chilled mist
};

// Note: Velocity functions removed - particle texture now stores temperature in G,B channels
// Particle texture format: R=type, G=temp_low, B=temp_high, A=unused

/**
 * Helper to check if a particle type is empty
 */
export function isEmpty(particleType: number): boolean {
  return particleType >= ParticleTypeRanges.EMPTY_MIN && particleType <= ParticleTypeRanges.EMPTY_MAX;
}

/**
 * Helper to check if a particle type is static (immovable solid)
 */
export function isStatic(particleType: number): boolean {
  return particleType >= ParticleTypeRanges.STATIC_MIN && particleType <= ParticleTypeRanges.STATIC_MAX;
}

/**
 * Helper to check if a particle type is solid (movable)
 */
export function isSolid(particleType: number): boolean {
  return particleType >= ParticleTypeRanges.SOLID_MIN && particleType <= ParticleTypeRanges.SOLID_MAX;
}

/**
 * Helper to check if a particle type is liquid
 */
export function isLiquid(particleType: number): boolean {
  return particleType >= ParticleTypeRanges.LIQUID_MIN && particleType <= ParticleTypeRanges.LIQUID_MAX;
}

/**
 * Helper to check if a particle type is gas
 */
export function isGas(particleType: number): boolean {
  return particleType >= ParticleTypeRanges.GAS_MIN && particleType <= ParticleTypeRanges.GAS_MAX;
}
