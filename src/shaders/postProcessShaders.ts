/**
 * Post-processing shaders for visual effects
 * Applied after simulation to enhance rendering
 */

import { fbmNoise } from './noiseUtils';
import { generateShaderConstants } from '../world/ParticleTypeConstants';

/**
 * Standard vertex shader for post-processing effects
 */
export const postProcessVertexShader = `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/**
 * Material Variation Effect
 * Adds Simplex noise-based texture variation to materials
 * This prevents large uniform blocks of color
 */
export const materialVariationFragmentShader = `
  uniform sampler2D uColorTexture;  // Base color texture from previous pass
  uniform sampler2D uStateTexture;  // Particle state texture for type lookup
  uniform vec2 uTextureSize;
  uniform float uNoiseScale;    // Scale of noise pattern
  uniform float uNoiseStrength; // Strength of variation (0-1)

  varying vec2 vUv;

  ${generateShaderConstants()}

  ${fbmNoise}

  void main() {
    // Read base color from previous pass
    vec4 baseColor = texture2D(uColorTexture, vUv);

    // Read particle state to determine material type
    vec4 statePixel = texture2D(uStateTexture, vUv);
    float particleType = statePixel.r * 255.0;

    // Skip variation for empty cells
    if (particleType < EMPTY_MAX) {
      gl_FragColor = baseColor;
      return;
    }

    // Calculate world-space position for noise sampling
    vec2 worldPos = vUv * uTextureSize;

    // Generate noise at different scales using fBm (Fractional Brownian Motion)
    // This creates more natural, organic variation
    float noise = fbm(worldPos / uNoiseScale, 3, 2.0, 0.5);

    // Normalize noise from [-1, 1] to [0, 1]
    noise = noise * 0.5 + 0.5;

    // Apply variation as a multiplier to the base color
    // This darkens/lightens the color while preserving hue
    float variation = 1.0 + (noise - 0.5) * uNoiseStrength * 2.0;
    vec3 variedColor = baseColor.rgb * variation;

    // Ensure color stays in valid range
    variedColor = clamp(variedColor, 0.0, 1.0);

    gl_FragColor = vec4(variedColor, baseColor.a);
  }
`;

/**
 * Edge Blending Effect
 * Smooths alternating material/empty patterns by blending empty pixels with their material neighbors
 * This reduces the checkerboard artifacts common in cellular automata
 */
export const edgeBlendingFragmentShader = `
  uniform sampler2D uColorTexture;  // Color texture from previous pass
  uniform sampler2D uStateTexture;  // Particle state texture
  uniform vec2 uTextureSize;
  uniform float uBlendStrength;     // Blend strength (0-1)

  varying vec2 vUv;

  ${generateShaderConstants()}

  void main() {
    // Read current pixel
    vec4 currentColor = texture2D(uColorTexture, vUv);
    vec4 statePixel = texture2D(uStateTexture, vUv);
    float particleType = statePixel.r * 255.0;

    // If not empty, pass through unchanged
    if (particleType >= EMPTY_MAX) {
      gl_FragColor = currentColor;
      return;
    }

    // Sample 4 cardinal neighbors
    vec2 texelSize = 1.0 / uTextureSize;
    vec2 offsets[4];
    offsets[0] = vec2(0.0, texelSize.y);   // up
    offsets[1] = vec2(0.0, -texelSize.y);  // down
    offsets[2] = vec2(-texelSize.x, 0.0);  // left
    offsets[3] = vec2(texelSize.x, 0.0);   // right

    // Accumulate neighbor colors
    vec3 neighborColorSum = vec3(0.0);
    float neighborCount = 0.0;

    for (int i = 0; i < 4; i++) {
      vec2 neighborUv = vUv + offsets[i];

      // Skip if out of bounds
      if (neighborUv.x < 0.0 || neighborUv.x > 1.0 || neighborUv.y < 0.0 || neighborUv.y > 1.0) {
        continue;
      }

      vec4 neighborState = texture2D(uStateTexture, neighborUv);
      float neighborType = neighborState.r * 255.0;

      // Only blend with non-empty neighbors
      if (neighborType >= EMPTY_MAX) {
        vec4 neighborColor = texture2D(uColorTexture, neighborUv);
        neighborColorSum += neighborColor.rgb;
        neighborCount += 1.0;
      }
    }

    // If we have material neighbors, blend with them
    if (neighborCount > 0.0) {
      vec3 avgNeighborColor = neighborColorSum / neighborCount;
      vec3 blendedColor = mix(currentColor.rgb, avgNeighborColor, uBlendStrength);
      gl_FragColor = vec4(blendedColor, currentColor.a);
    } else {
      gl_FragColor = currentColor;
    }
  }
`;

/**
 * Pass-through shader (for effects that are disabled)
 */
export const passThroughFragmentShader = `
  uniform sampler2D uTexture;
  varying vec2 vUv;

  void main() {
    gl_FragColor = texture2D(uTexture, vUv);
  }
`;
