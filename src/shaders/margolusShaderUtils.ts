/**
 * Shared utilities for Margolus-based shaders
 * Contains common GLSL functions used by both margolus and liquidSpread shaders
 */

import { generateShaderConstants } from '../world/ParticleTypeConstants';
import { generateMaterialShaderConstants } from '../world/MaterialDefinitions';

/**
 * Standard vertex shader for Margolus-based shaders
 */
export const margolusVertexShader = `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/**
 * Common GLSL helper functions used in Margolus-based fragment shaders
 */
export const margolusHelperFunctions = `
  ${generateShaderConstants()}

  ${generateMaterialShaderConstants()}

  vec4 getPixel(vec2 offset) {
    vec2 pixelSize = 1.0 / uTextureSize;
    vec2 sampleUV = vUv + offset * pixelSize;

    if (sampleUV.x < 0.0 || sampleUV.x > 1.0 || sampleUV.y < 0.0 || sampleUV.y > 1.0) {
      return vec4(STONE_TYPE / 255.0, 0.5, 0.5, 1.0);
    }

    return texture2D(uCurrentState, sampleUV);
  }

  float getCellState(float particleType) {
    // Map particle types to internal behavior states
    if (particleType >= EMPTY_MIN && particleType <= EMPTY_MAX) {
      return INTERNAL_EMPTY;
    } else if (particleType >= STATIC_MIN && particleType <= STATIC_MAX) {
      return INTERNAL_STATIC;
    } else if (particleType >= SOLID_MIN && particleType <= SOLID_MAX) {
      return INTERNAL_SOLID;
    } else if (particleType >= LIQUID_MIN && particleType <= LIQUID_MAX) {
      return INTERNAL_LIQUID;
    } else if (particleType >= GAS_MIN && particleType <= GAS_MAX) {
      return INTERNAL_GAS;
    } else if (particleType >= ENTITY_MIN && particleType <= ENTITY_MAX) {
      // Entity particles (player, NPCs) behave as static - they don't move in physics
      return INTERNAL_STATIC;
    } else {
      return INTERNAL_EMPTY;
    }
  }

  // Decode 16-bit temperature from particle texture (G=low, B=high)
  float decodeParticleTemperature(vec4 particleData) {
    float tempLow = particleData.g * 255.0;
    float tempHigh = particleData.b * 255.0;
    return tempLow + tempHigh * 256.0;
  }

  // Encode 16-bit temperature to two bytes for output
  vec2 encodeParticleTemperature(float temp) {
    float clamped = clamp(temp, 0.0, 65535.0);
    float tempLow = mod(clamped, 256.0);
    float tempHigh = floor(clamped / 256.0);
    return vec2(tempLow / 255.0, tempHigh / 255.0);
  }

  vec4 createPixel(float cellState, float originalType, float temperature) {
    // Preserve original type if it matches the behavior category, otherwise use default
    float particleType;

    if (cellState == INTERNAL_EMPTY) {
      particleType = EMPTY_TYPE;
    } else if (cellState == INTERNAL_STATIC) {
      // Preserve entity types (player, etc.) as well as static types
      if (originalType >= ENTITY_MIN && originalType <= ENTITY_MAX) {
        particleType = originalType;
      } else if (originalType >= STATIC_MIN && originalType <= STATIC_MAX) {
        particleType = originalType;
      } else {
        particleType = STONE_TYPE;
      }
    } else if (cellState == INTERNAL_SOLID) {
      particleType = (originalType >= SOLID_MIN && originalType <= SOLID_MAX) ? originalType : SAND_TYPE;
    } else if (cellState == INTERNAL_LIQUID) {
      particleType = (originalType >= LIQUID_MIN && originalType <= LIQUID_MAX) ? originalType : WATER_TYPE;
    } else if (cellState == INTERNAL_GAS) {
      particleType = (originalType >= GAS_MIN && originalType <= GAS_MAX) ? originalType : STEAM_TYPE;
    } else {
      particleType = EMPTY_TYPE;
    }

    // Encode temperature into G,B channels
    vec2 encodedTemp = encodeParticleTemperature(temperature);
    return vec4(particleType / 255.0, encodedTemp.x, encodedTemp.y, 1.0);
  }

  bool isMovable(float state) {
    // Only solids and liquids fall - gases rise (handled separately)
    return state == INTERNAL_SOLID || state == INTERNAL_LIQUID;
  }

  bool isSolid(float state) {
    return state == INTERNAL_SOLID;
  }

  bool isLiquid(float state) {
    return state == INTERNAL_LIQUID;
  }

  bool isGas(float state) {
    return state == INTERNAL_GAS;
  }

  // Pseudo-random number generator
  float random(vec2 co, float seed) {
    return fract(sin(dot(co.xy + seed, vec2(12.9898, 78.233))) * 43758.5453);
  }

  float computeEffectiveDensity(float particleType, float temperature) {
    float baseDensity = getMaterialDensity(particleType);
    float defaultTemp = getMaterialDefaultTemperature(particleType);
    float tempDelta = temperature - defaultTemp;

    float expansionCoeff = 0.0;
    if (particleType >= LIQUID_MIN && particleType <= LIQUID_MAX) {
      expansionCoeff = 0.55;
    } else if (particleType >= GAS_MIN && particleType <= GAS_MAX) {
      expansionCoeff = 1.4;
    } else if (particleType >= SOLID_MIN && particleType <= SOLID_MAX) {
      expansionCoeff = 0.18;
    }

    float adjusted = baseDensity - tempDelta * expansionCoeff;
    float minDensity = baseDensity * 0.2;
    float maxDensity = baseDensity * 3.5;
    return clamp(adjusted, minDensity, maxDensity);
  }
`;

/**
 * Common Margolus block setup code (beginning of main function)
 */
export const margolusBlockSetup = `
  vec2 pixelCoord = floor(vUv * uTextureSize);

  // Determine the 2x2 block offset based on iteration
  // Standard Margolus: iterations 0 and 1
  // Modified: iterations 2 and 3
  int iterInt = int(uIteration);
  int offsetX = iterInt % 2;
  int offsetY = (iterInt / 2) % 2;

  // Determine which 2x2 block this pixel belongs to
  vec2 blockCoord = floor((pixelCoord - vec2(float(offsetX), float(offsetY))) / 2.0);
  vec2 blockStart = blockCoord * 2.0 + vec2(float(offsetX), float(offsetY));

  // Position within the 2x2 block (0-3: TL, TR, BR, BL)
  vec2 posInBlock = pixelCoord - blockStart;

  // Only process pixels that are part of complete 2x2 blocks
  if (blockStart.x < 0.0 || blockStart.y < 0.0 ||
      blockStart.x + 1.0 >= uTextureSize.x || blockStart.y + 1.0 >= uTextureSize.y) {
    // Keep original pixel
    gl_FragColor = texture2D(uCurrentState, vUv);
    return;
  }

  // Read the 2x2 block
  // Note: In texture coords, Y=0 is bottom, so we need to swap top/bottom
  // TL = top-left in CA space = bottom-left in texture space
  vec2 pixelSize = 1.0 / uTextureSize;
  vec2 blockUV = (blockStart + vec2(0.5)) * pixelSize;

  // Swap top and bottom when reading from texture
  vec4 bl_px = texture2D(uCurrentState, blockUV);
  vec4 br_px = texture2D(uCurrentState, blockUV + vec2(pixelSize.x, 0.0));
  vec4 tl_px = texture2D(uCurrentState, blockUV + vec2(0.0, pixelSize.y));
  vec4 tr_px = texture2D(uCurrentState, blockUV + pixelSize);

  // Extract original particle types (before mapping to internal states)
  float tl_orig = tl_px.r * 255.0;
  float tr_orig = tr_px.r * 255.0;
  float bl_orig = bl_px.r * 255.0;
  float br_orig = br_px.r * 255.0;

  // Extract particle temperatures from G,B channels
  float tl_temp = decodeParticleTemperature(tl_px);
  float tr_temp = decodeParticleTemperature(tr_px);
  float bl_temp = decodeParticleTemperature(bl_px);
  float br_temp = decodeParticleTemperature(br_px);

  // Map to internal cell states for Margolus algorithm
  float tl = getCellState(tl_orig);
  float tr = getCellState(tr_orig);
  float bl = getCellState(bl_orig);
  float br = getCellState(br_orig);

  // Don't modify blocks containing static cells
  if (tl == INTERNAL_STATIC || tr == INTERNAL_STATIC || bl == INTERNAL_STATIC || br == INTERNAL_STATIC) {
    gl_FragColor = texture2D(uCurrentState, vUv);
    return;
  }

  // Apply Margolus transitions
  // Track state, original particle type, and temperature
  float tl_new = tl;
  float tr_new = tr;
  float bl_new = bl;
  float br_new = br;

  float tl_new_orig = tl_orig;
  float tr_new_orig = tr_orig;
  float bl_new_orig = bl_orig;
  float br_new_orig = br_orig;

  float tl_new_temp = tl_temp;
  float tr_new_temp = tr_temp;
  float bl_new_temp = bl_temp;
  float br_new_temp = br_temp;

  bool transitionApplied = false;
`;

/**
 * Common output selection code (end of main function)
 */
export const margolusOutputSelection = `
  // Determine which cell to output based on position in block
  // Remember to swap top/bottom since texture Y is flipped
  float outputState;
  float outputOriginal;
  float outputTemp;
  if (posInBlock.x < 0.5 && posInBlock.y < 0.5) {
    outputState = bl_new; // Bottom-left in texture = top-left in CA
    outputOriginal = bl_new_orig;
    outputTemp = bl_new_temp;
  } else if (posInBlock.x >= 0.5 && posInBlock.y < 0.5) {
    outputState = br_new; // Bottom-right in texture = top-right in CA
    outputOriginal = br_new_orig;
    outputTemp = br_new_temp;
  } else if (posInBlock.x < 0.5 && posInBlock.y >= 0.5) {
    outputState = tl_new; // Top-left in texture = bottom-left in CA
    outputOriginal = tl_new_orig;
    outputTemp = tl_new_temp;
  } else {
    outputState = tr_new; // Top-right in texture = bottom-right in CA
    outputOriginal = tr_new_orig;
    outputTemp = tr_new_temp;
  }

  gl_FragColor = createPixel(outputState, outputOriginal, outputTemp);
`;

/**
 * Creates a Margolus fragment shader with custom transition logic
 * @param transitionLogic GLSL code implementing the specific transitions
 */
export function createMargolusFragmentShader(transitionLogic: string): string {
  return `
  uniform sampler2D uCurrentState;
  uniform sampler2D uHeatForceLayer; // Heat texture for temperature-aware transitions
  uniform vec2 uTextureSize;
  uniform float uIteration; // 0, 1, 2, or 3 for the 4-iteration cycle
  uniform float uRandomSeed; // For pseudo-random number generation
  uniform float uFrictionAmplifier; // Exponential friction power (0-10, default 1.3)

  varying vec2 vUv;

  ${margolusHelperFunctions}

  void main() {
    ${margolusBlockSetup}

    ${transitionLogic}

    ${margolusOutputSelection}
  }
`;
}
