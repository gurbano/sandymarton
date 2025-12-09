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

    float glowFactor = clamp(selfGlow, 0.0, 1.5);
    float luminance = dot(baseRgb, vec3(0.299, 0.587, 0.114));
    vec3 vividBase = mix(vec3(luminance), baseRgb, clamp(0.35 + glowFactor * 0.5, 0.0, 1.0));
    vec3 emissiveBase = clamp(vividBase * (1.05 + glowFactor * 0.75), 0.0, 1.5);

    float radiusBase = max(uGlowRadius, 0.5);
    float radiusMultiplier = radiusBase * (0.85 + glowFactor * 0.95);

    vec2 texelSize = 1.0 / uTextureSize;

    vec2 sampleOffsets[16];
    float sampleDistance[16];
    float sampleWeights[16];

    sampleOffsets[0] = vec2(1.0, 0.0); sampleDistance[0] = 1.0; sampleWeights[0] = 1.05;
    sampleOffsets[1] = vec2(-1.0, 0.0); sampleDistance[1] = 1.0; sampleWeights[1] = 1.05;
    sampleOffsets[2] = vec2(0.0, 1.0); sampleDistance[2] = 1.0; sampleWeights[2] = 1.05;
    sampleOffsets[3] = vec2(0.0, -1.0); sampleDistance[3] = 1.0; sampleWeights[3] = 1.05;

    sampleOffsets[4] = vec2(1.0, 1.0); sampleDistance[4] = 1.4; sampleWeights[4] = 0.85;
    sampleOffsets[5] = vec2(-1.0, 1.0); sampleDistance[5] = 1.4; sampleWeights[5] = 0.85;
    sampleOffsets[6] = vec2(1.0, -1.0); sampleDistance[6] = 1.4; sampleWeights[6] = 0.85;
    sampleOffsets[7] = vec2(-1.0, -1.0); sampleDistance[7] = 1.4; sampleWeights[7] = 0.85;

    sampleOffsets[8] = vec2(2.0, 0.0); sampleDistance[8] = 2.0; sampleWeights[8] = 0.68;
    sampleOffsets[9] = vec2(-2.0, 0.0); sampleDistance[9] = 2.0; sampleWeights[9] = 0.68;
    sampleOffsets[10] = vec2(0.0, 2.0); sampleDistance[10] = 2.0; sampleWeights[10] = 0.68;
    sampleOffsets[11] = vec2(0.0, -2.0); sampleDistance[11] = 2.0; sampleWeights[11] = 0.68;

    sampleOffsets[12] = vec2(2.0, 1.0); sampleDistance[12] = 2.24; sampleWeights[12] = 0.55;
    sampleOffsets[13] = vec2(-2.0, 1.0); sampleDistance[13] = 2.24; sampleWeights[13] = 0.55;
    sampleOffsets[14] = vec2(2.0, -1.0); sampleDistance[14] = 2.24; sampleWeights[14] = 0.55;
    sampleOffsets[15] = vec2(-2.0, -1.0); sampleDistance[15] = 2.24; sampleWeights[15] = 0.55;

  vec3 emissiveAccum = emissiveBase * (glowFactor * 0.6 + 0.08);
  float emissiveWeight = glowFactor * 0.6 + 0.08;
    float borderSum = 0.0;
    float emptySum = 0.0;
    float sampleWeightSum = 0.0;
  float highGlowSum = 0.0;
  vec3 highGlowColor = vec3(0.0);

    for (int i = 0; i < 16; i++) {
      float ringScale = sampleDistance[i];
      float relationWeight = sampleWeights[i];
      sampleWeightSum += relationWeight;

      vec2 scaledOffset = sampleOffsets[i] * texelSize * radiusMultiplier * ringScale;
      vec2 neighborUV = clamp(vUv + scaledOffset, 0.0, 1.0);

      vec4 neighborState = texture2D(uStateTexture, neighborUV);
      float neighborType = neighborState.r * 255.0;
      float neighborGlow = getParticleGlow(neighborType);

      bool isEmptyNeighbor = neighborType < EMPTY_MAX;
      bool isSameMaterial = abs(neighborType - particleType) < 0.5;
      if (isEmptyNeighbor) {
        emptySum += relationWeight;
      } else if (!isSameMaterial) {
        borderSum += relationWeight;
      }

      float weight = neighborGlow * relationWeight;

      if (isEmptyNeighbor) {
        weight *= 2.6;
      } else if (isSameMaterial) {
        weight *= 0.35;
      } else {
        weight *= 1.65;
      }

      float distanceAtten = mix(1.0, 0.55, clamp((ringScale - 1.0) * 0.6, 0.0, 1.0));
      weight *= distanceAtten;
      weight *= (0.82 + glowFactor * 0.45);

      vec4 neighborColor = texture2D(uColorTexture, neighborUV);
      vec3 neighborRgb = neighborColor.rgb;
      float neighborLuma = dot(neighborRgb, vec3(0.299, 0.587, 0.114));
      vec3 neighborVivid = mix(vec3(neighborLuma), neighborRgb, clamp(0.35 + neighborGlow * 0.5, 0.0, 1.0));
      vec3 neighborEmissive = clamp(neighborVivid * (1.0 + neighborGlow * 0.8), 0.0, 1.5);

      emissiveAccum += neighborEmissive * weight;
      emissiveWeight += weight;

      float highGlow = smoothstep(0.4, 1.0, neighborGlow);
      if (highGlow > 0.0) {
        float highContribution = highGlow * relationWeight;
        highGlowSum += highContribution;
        highGlowColor += neighborEmissive * highContribution;
      }
    }

    float borderIntensity = sampleWeightSum > 0.0 ? clamp(borderSum / sampleWeightSum, 0.0, 1.0) : 0.0;
    float emptyIntensity = sampleWeightSum > 0.0 ? clamp(emptySum / sampleWeightSum, 0.0, 1.0) : 0.0;
    vec3 haloColor = emissiveWeight > 0.0 ? emissiveAccum / emissiveWeight : emissiveBase;
    vec3 haloDiff = max(vec3(0.0), haloColor - baseRgb * 0.85);

    float highGlowIntensity = sampleWeightSum > 0.0 ? clamp(highGlowSum / sampleWeightSum, 0.0, 1.0) : 0.0;
    vec3 highGlowAverage = highGlowSum > 0.0 ? highGlowColor / max(highGlowSum, 0.0001) : haloColor;
    vec3 vividHalo = mix(haloDiff, max(highGlowAverage - baseRgb * 0.65, vec3(0.0)), clamp(highGlowIntensity * 0.9, 0.0, 1.0));

    float envInfluence = clamp(borderIntensity * 0.7 + emptyIntensity * 0.5, 0.0, 1.5);
    float haloStrength = uGlowIntensity * (0.4 + glowFactor * 0.55 + envInfluence * 0.35 + highGlowIntensity * 0.4);

    vec3 rimContribution = vividHalo * haloStrength * (0.78 + envInfluence * 0.55 + highGlowIntensity * 0.35);
    vec3 innerHighlight = emissiveBase * glowFactor * (0.12 + 0.42 * borderIntensity + 0.24 * emptyIntensity + 0.2 * highGlowIntensity);
    vec3 heatBloom = emissiveBase * pow(glowFactor, 1.15) * (0.26 + highGlowIntensity * 0.55);

    vec3 finalColor = baseRgb + rimContribution + innerHighlight + heatBloom;
    finalColor = mix(finalColor, haloColor, clamp(glowFactor * 0.15 + highGlowIntensity * 0.25, 0.0, 0.45));

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
