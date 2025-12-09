/**
 * Post-processing shaders for visual effects
 * Applied after simulation to enhance rendering
 */

import { fbmNoise } from './noiseUtils';
import { generateShaderConstants } from '../world/ParticleTypeConstants';
import { generateParticleGlowCode } from '../world/RenderMaterialProperties';

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

export const glowFragmentShader = `
  uniform sampler2D uColorTexture;
  uniform sampler2D uStateTexture;
  uniform vec2 uTextureSize;
  uniform float uGlowIntensity;
  uniform float uGlowRadius;

  varying vec2 vUv;

  ${generateShaderConstants()}

  float getParticleGlow(float particleType) {
${generateParticleGlowCode()}
  }

  void main() {
    vec4 baseColor = texture2D(uColorTexture, vUv);
    vec4 statePixel = texture2D(uStateTexture, vUv);
    float particleType = statePixel.r * 255.0;

    float selfGlow = getParticleGlow(particleType);
    vec3 baseRgb = baseColor.rgb;
    vec3 glowAccum = vec3(0.0);
    float totalWeight = 0.0;

    float baseSelfWeight = selfGlow * 0.35;
    glowAccum += baseRgb * baseSelfWeight;
    totalWeight += baseSelfWeight;

    vec2 texelSize = 1.0 / uTextureSize;
    vec2 offsets[8];
    offsets[0] = vec2(1.0, 0.0);
    offsets[1] = vec2(-1.0, 0.0);
    offsets[2] = vec2(0.0, 1.0);
    offsets[3] = vec2(0.0, -1.0);
    offsets[4] = vec2(1.0, 1.0);
    offsets[5] = vec2(-1.0, 1.0);
    offsets[6] = vec2(1.0, -1.0);
    offsets[7] = vec2(-1.0, -1.0);

    float weights[8];
    weights[0] = 1.0;
    weights[1] = 1.0;
    weights[2] = 1.0;
    weights[3] = 1.0;
    weights[4] = 0.7;
    weights[5] = 0.7;
    weights[6] = 0.7;
    weights[7] = 0.7;

    float borderSum = 0.0;
    float emptySum = 0.0;
    float sameSum = 0.0;

    for (int i = 0; i < 8; i++) {
      vec2 scaledOffset = offsets[i] * texelSize * max(uGlowRadius, 0.5);
      vec2 neighborUV = clamp(vUv + scaledOffset, 0.0, 1.0);
      vec4 neighborColor = texture2D(uColorTexture, neighborUV);
      vec4 neighborState = texture2D(uStateTexture, neighborUV);
      float neighborType = neighborState.r * 255.0;
      float neighborGlow = getParticleGlow(neighborType);
      float relationWeight = weights[i];

      bool isEmptyNeighbor = neighborType < EMPTY_MAX;
      bool isSameMaterial = abs(neighborType - particleType) < 0.5;

      if (isEmptyNeighbor) {
        emptySum += relationWeight;
      } else if (!isSameMaterial) {
        borderSum += relationWeight;
      } else {
        sameSum += relationWeight;
      }

      float weight = neighborGlow * relationWeight;

      if (isEmptyNeighbor) {
        weight *= 1.6;
      } else if (isSameMaterial) {
        weight *= 0.35;
      } else {
        weight *= 1.2;
      }

      glowAccum += neighborColor.rgb * weight;
      totalWeight += weight;
    }

    float borderIntensity = clamp(borderSum / 6.0, 0.0, 1.0);
    float emptyIntensity = clamp(emptySum / 4.0, 0.0, 1.0);

    vec3 glowColor = totalWeight > 0.0 ? glowAccum / totalWeight : baseRgb;
    vec3 edgeGlow = max(vec3(0.0), glowColor - baseRgb);
    vec3 highlight = baseRgb * selfGlow * (0.04 + 0.5 * borderIntensity + 0.45 * emptyIntensity);

    float glowStrength = uGlowIntensity * (0.35 + 0.45 * borderIntensity + 0.4 * emptyIntensity);
    vec3 finalColor = baseRgb + (edgeGlow + highlight) * glowStrength;
    gl_FragColor = vec4(clamp(finalColor, 0.0, 1.0), baseColor.a);
  }
`;

/**
 * Edge Blending Effect
 * Blends pixels at material boundaries for smooth anti-aliased edges
 * If any neighbor has a different material type, blend the 3x3 neighborhood together
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

    vec2 texelSize = 1.0 / uTextureSize;

    // Sample all 8 neighbors
    vec2 offsets[8];
    offsets[0] = vec2(-1.0, -1.0); // Bottom-left
    offsets[1] = vec2( 0.0, -1.0); // Bottom
    offsets[2] = vec2( 1.0, -1.0); // Bottom-right
    offsets[3] = vec2(-1.0,  0.0); // Left
    offsets[4] = vec2( 1.0,  0.0); // Right
    offsets[5] = vec2(-1.0,  1.0); // Top-left
    offsets[6] = vec2( 0.0,  1.0); // Top
    offsets[7] = vec2( 1.0,  1.0); // Top-right

    // Check if any neighbor has a different material type
    bool hasDifferentNeighbor = false;
    for (int i = 0; i < 8; i++) {
      vec2 neighborUV = vUv + offsets[i] * texelSize;
      vec4 neighborState = texture2D(uStateTexture, neighborUV);
      float neighborType = neighborState.r * 255.0;

      if (neighborType != particleType) {
        hasDifferentNeighbor = true;
        break;
      }
    }

    // If no different neighbors, pass through unchanged
    if (!hasDifferentNeighbor) {
      gl_FragColor = currentColor;
      return;
    }

    // Blend the 3x3 neighborhood
    vec3 blendedColor = vec3(0.0);
    float totalWeight = 0.0;

    // Center pixel
    blendedColor += currentColor.rgb;
    totalWeight += 1.0;

    // Add all 8 neighbors
    for (int i = 0; i < 8; i++) {
      vec2 neighborUV = vUv + offsets[i] * texelSize;
      vec4 neighborColor = texture2D(uColorTexture, neighborUV);
      blendedColor += neighborColor.rgb;
      totalWeight += 1.0;
    }

    // Average the colors
    blendedColor /= totalWeight;

    // Mix between original and blended based on blend strength
    vec3 finalColor = mix(currentColor.rgb, blendedColor, uBlendStrength);

    gl_FragColor = vec4(finalColor, currentColor.a);
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
