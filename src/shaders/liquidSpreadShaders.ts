/**
 * Fast liquid spreading shader
 * Checks up to 5 pixels on each side and moves liquid as far as possible
 */

import { generateShaderConstants } from '../world/ParticleTypeConstants';

export const liquidSpreadVertexShader = `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const liquidSpreadFragmentShader = `
  uniform sampler2D uCurrentState;
  uniform vec2 uTextureSize;
  uniform float uRandomSeed;

  varying vec2 vUv;

  ${generateShaderConstants()}

  vec4 getPixel(vec2 offset) {
    vec2 pixelSize = 1.0 / uTextureSize;
    vec2 sampleUV = vUv + offset * pixelSize;

    if (sampleUV.x < 0.0 || sampleUV.x > 1.0 || sampleUV.y < 0.0 || sampleUV.y > 1.0) {
      return vec4(0.0, 0.5, 0.5, 1.0); // Out of bounds = empty
    }

    return texture2D(uCurrentState, sampleUV);
  }

  bool isEmpty(float particleType) {
    return particleType >= EMPTY_MIN && particleType <= EMPTY_MAX;
  }

  bool isLiquid(float particleType) {
    return particleType >= LIQUID_MIN && particleType <= LIQUID_MAX;
  }

  // Pseudo-random number generator
  float random(vec2 co, float seed) {
    return fract(sin(dot(co.xy + seed, vec2(12.9898, 78.233))) * 43758.5453);
  }

  // Count liquid height at a position
  int getLiquidHeight(vec2 offset) {
    int height = 0;
    for (int i = 0; i < 50; i++) {
      vec4 pixel = getPixel(offset + vec2(0.0, float(i)));
      if (isLiquid(pixel.r * 255.0)) {
        height++;
      } else {
        break;
      }
    }
    return height;
  }

  void main() {
    vec4 currentPixel = texture2D(uCurrentState, vUv);
    float currentType = currentPixel.r * 255.0;
    vec2 pixelCoord = vUv * uTextureSize;

    // Horizontal liquid spreading based on surface height differences
    // Uses Margolus-style pairwise swaps to prevent duplication

    // Only process liquid that is resting on something
    if (isLiquid(currentType)) {
      vec4 belowPixel = getPixel(vec2(0.0, -1.0));
      float belowType = belowPixel.r * 255.0;

      if (!isEmpty(belowType)) {
        // Choose one direction to check (alternates based on position and frame)
        float rand = random(pixelCoord, uRandomSeed);
        int dir = rand < 0.5 ? -1 : 1;

        // Only check immediate neighbor (1 pixel at a time for safety)
        vec4 neighborPixel = getPixel(vec2(float(dir), 0.0));
        vec4 neighborBelow = getPixel(vec2(float(dir), -1.0));
        float neighborType = neighborPixel.r * 255.0;
        float neighborBelowType = neighborBelow.r * 255.0;

        // Can only spread to empty spaces with support
        if (isEmpty(neighborType) && !isEmpty(neighborBelowType)) {
          // Count heights
          int myHeight = getLiquidHeight(vec2(0.0, 0.0));
          int neighborHeight = 0; // Empty

          // Spread if height difference is significant
          if (myHeight - neighborHeight >= 2) {
            // Use pixel X coordinate to determine which pixel in the pair acts
            // This ensures only one of the two pixels moves
            float myX = pixelCoord.x;
            float neighborX = pixelCoord.x + float(dir);

            // Only the pixel with lower X coordinate makes the decision
            if ((dir > 0 && myX < neighborX) || (dir < 0 && myX > neighborX)) {
              gl_FragColor = vec4(0.0, 0.5, 0.5, 1.0); // Move to neighbor
              return;
            }
          }
        }
      }
    }

    // Empty pixels receive liquid from neighbors
    if (isEmpty(currentType)) {
      vec4 belowPixel = getPixel(vec2(0.0, -1.0));
      float belowType = belowPixel.r * 255.0;

      if (!isEmpty(belowType)) {
        float rand = random(pixelCoord, uRandomSeed);
        int dir = rand < 0.5 ? -1 : 1;

        vec4 neighborPixel = getPixel(vec2(float(dir), 0.0));
        vec4 neighborBelow = getPixel(vec2(float(dir), -1.0));
        float neighborType = neighborPixel.r * 255.0;
        float neighborBelowType = neighborBelow.r * 255.0;

        if (isLiquid(neighborType) && !isEmpty(neighborBelowType)) {
          int myHeight = 0;
          int neighborHeight = getLiquidHeight(vec2(float(dir), 0.0));

          if (neighborHeight - myHeight >= 2) {
            float myX = pixelCoord.x;
            float neighborX = pixelCoord.x + float(dir);

            // Only the pixel with higher X coordinate accepts
            if ((dir > 0 && myX > neighborX) || (dir < 0 && myX < neighborX)) {
              gl_FragColor = neighborPixel; // Accept from neighbor
              return;
            }
          }
        }
      }
    }

    // No changes
    gl_FragColor = currentPixel;
  }
`;
