/**
 * Constants and types for GPU-based buildables system
 * Uses two RGBA32F textures to store buildable data
 */

// Texture dimensions (1024x512 = 524,288 slots)
export const BUILDABLES_TEXTURE_WIDTH = 1024;
export const BUILDABLES_TEXTURE_HEIGHT = 512;
export const MAX_BUILDABLES = BUILDABLES_TEXTURE_WIDTH * BUILDABLES_TEXTURE_HEIGHT;

// GPU Buildable Types (must match shader constants)
export const GPU_BUILDABLE_TYPE = {
  EMPTY: 0,
  MATERIAL_SOURCE: 1,
  MATERIAL_SINK: 2,
  HEAT_SOURCE: 3,
  COLD_SOURCE: 4,
} as const;

export type GpuBuildableType = (typeof GPU_BUILDABLE_TYPE)[keyof typeof GPU_BUILDABLE_TYPE];

// Flags (bit positions in the flags field)
export const BUILDABLE_FLAGS = {
  ACTIVE: 1 << 0,        // Buildable is active
  PAUSED: 1 << 1,        // Temporarily paused
  PERIODIC: 1 << 2,      // Uses periodic emission (vs continuous)
  GROWING: 1 << 3,       // Radius is growing over time
  SHRINKING: 1 << 4,     // Radius is shrinking over time
} as const;

// Lifetime constants
export const LIFETIME_PERMANENT = -1;

// Default values
export const DEFAULT_EMISSION_RATE = 1.0;    // Particles per frame
export const DEFAULT_RADIUS = 3.0;           // World units
export const DEFAULT_HEAT_INTENSITY = 500;   // Temperature units to add/remove

/**
 * CPU-side buildable instance data
 * This is the full representation used on CPU before packing to textures
 */
export interface BuildableInstance {
  // Identity
  id: number;                    // Unique ID (also texture index)
  type: GpuBuildableType;        // GPU buildable type

  // Position & Movement
  x: number;                     // World X position (float)
  y: number;                     // World Y position (float)
  velocityX: number;             // Pixels per frame
  velocityY: number;             // Pixels per frame

  // Type-specific data
  subtype: number;               // Material type for sources, or other subtype
  radius: number;                // Effect radius (emission/absorption area)

  // Timing
  lifetime: number;              // Frames remaining (-1 = permanent)
  rate: number;                  // Emission rate (particles or heat per frame)
  cooldown: number;              // Current cooldown counter
  period: number;                // Period for periodic emission (0 = continuous)

  // Flags
  flags: number;                 // Bit flags (ACTIVE, PAUSED, etc.)

  // Growth/shrink
  radiusChangeRate: number;      // How much radius changes per frame
}

/**
 * Simplified buildable creation options
 */
export interface CreateBuildableOptions {
  type: GpuBuildableType;
  x: number;
  y: number;
  subtype?: number;              // Material type for sources
  radius?: number;
  lifetime?: number;             // -1 for permanent
  rate?: number;                 // Emission rate
  period?: number;               // 0 for continuous, >0 for periodic
  velocityX?: number;
  velocityY?: number;
  radiusChangeRate?: number;     // For growing/shrinking buildables
}

/**
 * Pack type and subtype into a single float
 * Lower 8 bits: type, Upper 8 bits: subtype
 */
export function packTypeAndSubtype(type: number, subtype: number): number {
  return (type & 0xFF) | ((subtype & 0xFF) << 8);
}

/**
 * Unpack type from packed value
 */
export function unpackType(packed: number): number {
  return packed & 0xFF;
}

/**
 * Unpack subtype from packed value
 */
export function unpackSubtype(packed: number): number {
  return (packed >> 8) & 0xFF;
}

/**
 * Pack rate and cooldown into a single float
 * Uses 16 bits each, scaled to fit in float precision
 */
export function packRateAndCooldown(rate: number, cooldown: number): number {
  // Scale rate to 0-65535 range (assumes rate is 0-100 or so)
  const scaledRate = Math.min(65535, Math.max(0, Math.floor(rate * 100)));
  const scaledCooldown = Math.min(65535, Math.max(0, Math.floor(cooldown)));
  return scaledRate + scaledCooldown * 65536;
}

/**
 * Unpack rate from packed value
 */
export function unpackRate(packed: number): number {
  return (packed % 65536) / 100;
}

/**
 * Unpack cooldown from packed value
 */
export function unpackCooldown(packed: number): number {
  return Math.floor(packed / 65536);
}

/**
 * GLSL code for unpacking functions (to be included in shaders)
 */
export const BUILDABLES_GLSL_UTILS = `
// Buildable type constants
const float BUILDABLE_EMPTY = 0.0;
const float BUILDABLE_MATERIAL_SOURCE = 1.0;
const float BUILDABLE_MATERIAL_SINK = 2.0;
const float BUILDABLE_HEAT_SOURCE = 3.0;
const float BUILDABLE_COLD_SOURCE = 4.0;

// Flag constants
const float FLAG_ACTIVE = 1.0;
const float FLAG_PAUSED = 2.0;
const float FLAG_PERIODIC = 4.0;
const float FLAG_GROWING = 8.0;
const float FLAG_SHRINKING = 16.0;

// Lifetime constant
const float LIFETIME_PERMANENT = -1.0;

// Unpack type from packed value (lower 8 bits)
float unpackType(float packed) {
  return mod(packed, 256.0);
}

// Unpack subtype from packed value (upper 8 bits)
float unpackSubtype(float packed) {
  return floor(packed / 256.0);
}

// Pack type and subtype
float packTypeAndSubtype(float type, float subtype) {
  return type + subtype * 256.0;
}

// Unpack rate from packed value
float unpackRate(float packed) {
  return mod(packed, 65536.0) / 100.0;
}

// Unpack cooldown from packed value
float unpackCooldown(float packed) {
  return floor(packed / 65536.0);
}

// Pack rate and cooldown
float packRateAndCooldown(float rate, float cooldown) {
  return floor(rate * 100.0) + floor(cooldown) * 65536.0;
}

// Check if flag is set
bool hasFlag(float flags, float flag) {
  return mod(floor(flags / flag), 2.0) >= 1.0;
}

// Set a flag
float setFlag(float flags, float flag) {
  if (!hasFlag(flags, flag)) {
    return flags + flag;
  }
  return flags;
}

// Clear a flag
float clearFlag(float flags, float flag) {
  if (hasFlag(flags, flag)) {
    return flags - flag;
  }
  return flags;
}
`;
