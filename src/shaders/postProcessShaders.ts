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
 * Pass-through shader (for effects that are disabled)
 */
export const passThroughFragmentShader = `
  uniform sampler2D uTexture;
  varying vec2 vUv;

  void main() {
    gl_FragColor = texture2D(uTexture, vUv);
  }
`;
