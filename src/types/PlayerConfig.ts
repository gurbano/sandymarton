/**
 * Player configuration and state types
 * The player uses simple animated hitboxes for collision
 * and is rendered as a sprite overlay (not as particles)
 */

/**
 * Player physics and movement settings
 */
export interface PlayerSettings {
  // Movement
  speed: number;              // Max horizontal speed (pixels/frame)
  jumpStrength: number;       // Initial jump velocity (pixels/frame)
  gravity: number;            // Gravity acceleration (pixels/frame^2)

  // Physics
  mass: number;               // Affects collision with heavy particles
  friction: number;           // Ground friction (0-1)
  airResistance: number;      // Air drag (0-1)

  // Collision response
  pushOutStrength: number;    // How strongly overlapping particles push the player (0-10)

  // Size
  scale: number;              // Scale multiplier for all dimensions (0.1-3.0)
}

/**
 * Player visual/hitbox dimensions
 * Used for both collision detection and sprite rendering
 */
export interface PlayerDimensions {
  // Overall size
  width: number;              // Total width
  height: number;             // Total height

  // Head (circle)
  headRadius: number;

  // Body (rectangle that widens with arm swing)
  bodyWidth: number;
  bodyHeight: number;

  // Legs (rectangles that move horizontally)
  legWidth: number;
  legHeight: number;
  footOffset: number;         // How far feet swing during walk cycle
}

/**
 * Player colors for sprite rendering
 */
export interface PlayerColors {
  head: [number, number, number];   // RGB 0-1
  body: [number, number, number];
  legs: [number, number, number];
}

/**
 * Runtime player state (updated each frame)
 */
export interface PlayerState {
  // Position (sub-pixel precision, bottom-center of player)
  x: number;
  y: number;

  // Velocity
  velocityX: number;
  velocityY: number;

  // Input state (from keyboard)
  inputX: number;    // -1 (left) to 1 (right)
  inputY: number;    // -1 (down) to 1 (up)
  jumping: boolean;  // Jump button pressed

  // Animation
  walkPhase: number; // 0-1, cycles during movement

  // Status flags (read back from GPU)
  grounded: boolean;
  inLiquid: boolean;
  liquidDensity: number;

  // Environmental interaction
  damageFlags: number;       // Bit flags for damage types
}

/**
 * Damage flag bits
 */
export const DAMAGE_FLAGS = {
  NONE: 0,
  HEAT: 1 << 0,      // Touching hot material (lava, heater)
  COLD: 1 << 1,      // Touching cold material (liquid nitrogen)
  ACID: 1 << 2,      // Touching acid
  CRUSH: 1 << 3,     // Crushed between solids
} as const;

/**
 * Base player dimensions (at scale 1.0)
 * These get multiplied by PlayerSettings.scale
 */
export const BASE_PLAYER_DIMENSIONS: PlayerDimensions = {
  width: 10,
  height: 20,
  headRadius: 2.5,
  bodyWidth: 6,
  bodyHeight: 8,
  legWidth: 2.5,
  legHeight: 8,
  footOffset: 2,
};

/**
 * Default player dimensions (computed from BASE_PLAYER_DIMENSIONS * default scale)
 */
export const DEFAULT_PLAYER_DIMENSIONS: PlayerDimensions = {
  width: 10,
  height: 20,
  headRadius: 2.5,
  bodyWidth: 6,
  bodyHeight: 8,
  legWidth: 2.5,
  legHeight: 8,
  footOffset: 2,
};

/**
 * Compute scaled dimensions from base dimensions
 */
export function computeScaledDimensions(scale: number): PlayerDimensions {
  return {
    width: BASE_PLAYER_DIMENSIONS.width * scale,
    height: BASE_PLAYER_DIMENSIONS.height * scale,
    headRadius: BASE_PLAYER_DIMENSIONS.headRadius * scale,
    bodyWidth: BASE_PLAYER_DIMENSIONS.bodyWidth * scale,
    bodyHeight: BASE_PLAYER_DIMENSIONS.bodyHeight * scale,
    legWidth: BASE_PLAYER_DIMENSIONS.legWidth * scale,
    legHeight: BASE_PLAYER_DIMENSIONS.legHeight * scale,
    footOffset: BASE_PLAYER_DIMENSIONS.footOffset * scale,
  };
}

/**
 * Default player colors
 */
export const DEFAULT_PLAYER_COLORS: PlayerColors = {
  head: [1.0, 0.85, 0.7],     // Skin tone
  body: [0.2, 0.4, 0.8],      // Blue shirt
  legs: [0.3, 0.3, 0.35],     // Dark pants
};

/**
 * Default player settings
 */
export const DEFAULT_PLAYER_SETTINGS: PlayerSettings = {
  speed: 2.0,
  jumpStrength: 8.0,
  gravity: 0.50,
  mass: 80.0,
  friction: 0.7,
  airResistance: 0.02,
  pushOutStrength: 3.0,
  scale: 1.0,           // Default scale (base size)
};

/**
 * Initial player state
 */
export const DEFAULT_PLAYER_STATE: PlayerState = {
  x: 512,  // Center of 1024 world
  y: 100,  // Near bottom
  velocityX: 0,
  velocityY: 0,
  inputX: 0,
  inputY: 0,
  jumping: false,
  walkPhase: 0,
  grounded: false,
  inLiquid: false,
  liquidDensity: 0,
  damageFlags: 0,
};

/**
 * Player output texture format (4x4 = 16 pixels for feedback)
 * This small texture is read back to CPU each frame
 */
export const PLAYER_OUTPUT_FORMAT = {
  // Pixel 0: Position
  POSITION_X: 0,      // R channel
  POSITION_Y: 0,      // G channel (same pixel)

  // Pixel 1: Velocity
  VELOCITY_X: 1,
  VELOCITY_Y: 1,

  // Pixel 2: Status flags
  GROUNDED: 2,        // R: 1.0 if grounded
  IN_LIQUID: 2,       // G: liquid density (0 if not in liquid)
  DAMAGE_FLAGS: 2,    // B: damage flags

  // Pixel 3: Animation
  WALK_PHASE: 3,      // R: walk animation phase (0-1)
  IN_LIQUID_FLAG: 3,  // G: 1.0 if in liquid
} as const;
