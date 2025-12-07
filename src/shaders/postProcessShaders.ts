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
 * Fills in empty pixels that are sandwiched between material pixels (alternating patterns)
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

    // Check if this empty pixel is sandwiched between material pixels
    vec2 texelSize = 1.0 / uTextureSize;

    // Sample neighbors
    vec4 upState = texture2D(uStateTexture, vUv + vec2(0.0, texelSize.y));
    vec4 downState = texture2D(uStateTexture, vUv + vec2(0.0, -texelSize.y));
    vec4 leftState = texture2D(uStateTexture, vUv + vec2(-texelSize.x, 0.0));
    vec4 rightState = texture2D(uStateTexture, vUv + vec2(texelSize.x, 0.0));

    float upType = upState.r * 255.0;
    float downType = downState.r * 255.0;
    float leftType = leftState.r * 255.0;
    float rightType = rightState.r * 255.0;

    bool upIsMaterial = upType >= EMPTY_MAX;
    bool downIsMaterial = downType >= EMPTY_MAX;
    bool leftIsMaterial = leftType >= EMPTY_MAX;
    bool rightIsMaterial = rightType >= EMPTY_MAX;

    // Check if sandwiched vertically or horizontally
    bool verticalGap = upIsMaterial && downIsMaterial;
    bool horizontalGap = leftIsMaterial && rightIsMaterial;

    if (verticalGap || horizontalGap) {
      // Fill in this gap by averaging the material colors on both sides
      vec3 fillColor = vec3(0.0);
      float count = 0.0;

      if (verticalGap) {
        vec4 upColor = texture2D(uColorTexture, vUv + vec2(0.0, texelSize.y));
        vec4 downColor = texture2D(uColorTexture, vUv + vec2(0.0, -texelSize.y));
        fillColor += upColor.rgb + downColor.rgb;
        count += 2.0;
      }

      if (horizontalGap) {
        vec4 leftColor = texture2D(uColorTexture, vUv + vec2(-texelSize.x, 0.0));
        vec4 rightColor = texture2D(uColorTexture, vUv + vec2(texelSize.x, 0.0));
        fillColor += leftColor.rgb + rightColor.rgb;
        count += 2.0;
      }

      fillColor /= count;

      // Blend between current (empty) color and fill color based on strength
      vec3 blendedColor = mix(currentColor.rgb, fillColor, uBlendStrength);
      gl_FragColor = vec4(blendedColor, 1.0);
    } else {
      // Not a gap, keep original
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
