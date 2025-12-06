/**
 * GPU-accelerated Margolus Cellular Automata shaders
 * Implements the algorithm from "Probabilistic Cellular Automata for Granular Media in Video Games"
 */

import { generateShaderConstants } from '../world/ParticleTypeConstants';

export const margolusVertexShader = `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const margolusFragmentShader = `
  uniform sampler2D uCurrentState;
  uniform vec2 uTextureSize;
  uniform float uIteration; // 0, 1, 2, or 3 for the 4-iteration cycle
  uniform float uToppleProbability;
  uniform float uRandomSeed; // For pseudo-random number generation

  varying vec2 vUv;

  ${generateShaderConstants()}

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
    } else {
      return INTERNAL_EMPTY;
    }
  }

  vec4 createPixel(float cellState, float originalType) {
    // Preserve original type if it matches the behavior category, otherwise use default
    float particleType;

    if (cellState == INTERNAL_EMPTY) {
      particleType = EMPTY_TYPE;
    } else if (cellState == INTERNAL_STATIC) {
      particleType = (originalType >= STATIC_MIN && originalType <= STATIC_MAX) ? originalType : STONE_TYPE;
    } else if (cellState == INTERNAL_SOLID) {
      particleType = (originalType >= SOLID_MIN && originalType <= SOLID_MAX) ? originalType : SAND_TYPE;
    } else if (cellState == INTERNAL_LIQUID) {
      particleType = (originalType >= LIQUID_MIN && originalType <= LIQUID_MAX) ? originalType : WATER_TYPE;
    } else {
      particleType = EMPTY_TYPE;
    }

    return vec4(particleType / 255.0, 0.5, 0.5, 1.0);
  }

  bool isMovable(float state) {
    return state > INTERNAL_EMPTY && state < INTERNAL_STATIC;
  }

  bool isSolid(float state) {
    return state == INTERNAL_SOLID;
  }

  bool isLiquid(float state) {
    return state == INTERNAL_LIQUID;
  }

  // Pseudo-random number generator
  float random(vec2 co, float seed) {
    return fract(sin(dot(co.xy + seed, vec2(12.9898, 78.233))) * 43758.5453);
  }

  void main() {
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
    // Track both state and original particle type
    float tl_new = tl;
    float tr_new = tr;
    float bl_new = bl;
    float br_new = br;

    float tl_new_orig = tl_orig;
    float tr_new_orig = tr_orig;
    float bl_new_orig = bl_orig;
    float br_new_orig = br_orig;

    bool transitionApplied = false;

    // Transition (a): [1,0,0,0] -> [0,0,0,1]
    if (!transitionApplied && isMovable(tl) && tr == INTERNAL_EMPTY && bl == INTERNAL_EMPTY && br == INTERNAL_EMPTY) {
      tl_new = INTERNAL_EMPTY; tr_new = INTERNAL_EMPTY; bl_new = INTERNAL_EMPTY; br_new = tl;
      tl_new_orig = EMPTY_TYPE; tr_new_orig = EMPTY_TYPE; bl_new_orig = EMPTY_TYPE; br_new_orig = tl_orig;
      transitionApplied = true;
    }

    // Transition (b): [0,1,0,0] -> [0,0,1,0]
    if (!transitionApplied && tl == INTERNAL_EMPTY && isMovable(tr) && bl == INTERNAL_EMPTY && br == INTERNAL_EMPTY) {
      tl_new = INTERNAL_EMPTY; tr_new = INTERNAL_EMPTY; bl_new = INTERNAL_EMPTY; br_new = tr;
      tl_new_orig = EMPTY_TYPE; tr_new_orig = EMPTY_TYPE; bl_new_orig = EMPTY_TYPE; br_new_orig = tr_orig;
      transitionApplied = true;
    }

    // Transition (c): [1,1,0,0] -> [0,0,1,1]
    if (!transitionApplied && isMovable(tl) && isMovable(tr) && bl == INTERNAL_EMPTY && br == INTERNAL_EMPTY) {
      tl_new = INTERNAL_EMPTY; tr_new = INTERNAL_EMPTY; bl_new = tr; br_new = tl;
      tl_new_orig = EMPTY_TYPE; tr_new_orig = EMPTY_TYPE; bl_new_orig = tr_orig; br_new_orig = tl_orig;
      transitionApplied = true;
    }

    // Transition (d): [1,1,1,0] -> [0,1,1,1]
    if (!transitionApplied && isMovable(tl) && isMovable(tr) && isMovable(bl) && br == INTERNAL_EMPTY) {
      tl_new = INTERNAL_EMPTY; tr_new = tr; bl_new = bl; br_new = tl;
      tl_new_orig = EMPTY_TYPE; tr_new_orig = tr_orig; bl_new_orig = bl_orig; br_new_orig = tl_orig;
      transitionApplied = true;
    }

    // Transition (f): [0,1,1,0] -> [0,0,1,1]
    if (!transitionApplied && tl == INTERNAL_EMPTY && isMovable(tr) && isMovable(bl) && br == INTERNAL_EMPTY) {
      tl_new = INTERNAL_EMPTY; tr_new = INTERNAL_EMPTY; bl_new = bl; br_new = tr;
      tl_new_orig = EMPTY_TYPE; tr_new_orig = EMPTY_TYPE; bl_new_orig = bl_orig; br_new_orig = tr_orig;
      transitionApplied = true;
    }

    // Transition (g): [1,0,0,1] -> [1,1,0,0]
    if (!transitionApplied && isMovable(tl) && tr == INTERNAL_EMPTY && bl == INTERNAL_EMPTY && isMovable(br)) {
      tl_new = tl; tr_new = br; bl_new = INTERNAL_EMPTY; br_new = INTERNAL_EMPTY;
      tl_new_orig = tl_orig; tr_new_orig = br_orig; bl_new_orig = EMPTY_TYPE; br_new_orig = EMPTY_TYPE;
      transitionApplied = true;
    }

    // Transition (h): [1,1,0,1] -> [1,1,1,0]
    if (!transitionApplied && isMovable(tl) && isMovable(tr) && bl == INTERNAL_EMPTY && isMovable(br)) {
      tl_new = tl; tr_new = tr; bl_new = br; br_new = INTERNAL_EMPTY;
      tl_new_orig = tl_orig; tr_new_orig = tr_orig; bl_new_orig = br_orig; br_new_orig = EMPTY_TYPE;
      transitionApplied = true;
    }

    // PROBABILISTIC TRANSITIONS

    // Transition (i): [0,1,0,1] -> [0,0,1,1] with probability p
    if (!transitionApplied && tl == INTERNAL_EMPTY && isMovable(tr) && bl == INTERNAL_EMPTY && isMovable(br)) {
      float rand = random(blockStart, uRandomSeed);
      if (rand < uToppleProbability) {
        tl_new = INTERNAL_EMPTY; tr_new = INTERNAL_EMPTY; bl_new = br; br_new = tr;
        tl_new_orig = EMPTY_TYPE; tr_new_orig = EMPTY_TYPE; bl_new_orig = br_orig; br_new_orig = tr_orig;
        transitionApplied = true;
      }
    }

    // Transition (j): [1,0,1,0] -> [1,1,0,0] with probability p
    if (!transitionApplied && isMovable(tl) && tr == INTERNAL_EMPTY && isMovable(bl) && br == INTERNAL_EMPTY) {
      float rand = random(blockStart, uRandomSeed + 1.0);
      if (rand < uToppleProbability) {
        tl_new = tl; tr_new = bl; bl_new = INTERNAL_EMPTY; br_new = INTERNAL_EMPTY;
        tl_new_orig = tl_orig; tr_new_orig = bl_orig; bl_new_orig = EMPTY_TYPE; br_new_orig = EMPTY_TYPE;
        transitionApplied = true;
      }
    }

    // LIQUID-SPECIFIC TRANSITIONS
    // Liquids spread horizontally ONLY when resting on solid ground
    // These have lower priority than all vertical/diagonal movements

    // Liquid horizontal spread right when both cells are resting
    // [0,L,S,S] -> [L,0,S,S]
    if (!transitionApplied && tl == INTERNAL_EMPTY && isLiquid(tr) && br != INTERNAL_EMPTY && bl != INTERNAL_EMPTY) {
      tl_new = tr; tr_new = INTERNAL_EMPTY; bl_new = bl; br_new = br;
      tl_new_orig = tr_orig; tr_new_orig = EMPTY_TYPE; bl_new_orig = bl_orig; br_new_orig = br_orig;
      transitionApplied = true;
    }

    // Liquid horizontal spread left when both cells are resting
    // [L,0,S,S] -> [0,L,S,S]
    if (!transitionApplied && isLiquid(tl) && tr == INTERNAL_EMPTY && br != INTERNAL_EMPTY && bl != INTERNAL_EMPTY) {
      tl_new = INTERNAL_EMPTY; tr_new = tl; bl_new = bl; br_new = br;
      tl_new_orig = EMPTY_TYPE; tr_new_orig = tl_orig; bl_new_orig = bl_orig; br_new_orig = br_orig;
      transitionApplied = true;
    }

    // Determine which cell to output based on position in block
    // Remember to swap top/bottom since texture Y is flipped
    float outputState;
    float outputOriginal;
    if (posInBlock.x < 0.5 && posInBlock.y < 0.5) {
      outputState = bl_new; // Bottom-left in texture = top-left in CA
      outputOriginal = bl_new_orig;
    } else if (posInBlock.x >= 0.5 && posInBlock.y < 0.5) {
      outputState = br_new; // Bottom-right in texture = top-right in CA
      outputOriginal = br_new_orig;
    } else if (posInBlock.x < 0.5 && posInBlock.y >= 0.5) {
      outputState = tl_new; // Top-left in texture = bottom-left in CA
      outputOriginal = tl_new_orig;
    } else {
      outputState = tr_new; // Top-right in texture = bottom-right in CA
      outputOriginal = tr_new_orig;
    }

    gl_FragColor = createPixel(outputState, outputOriginal);
  }
`;
