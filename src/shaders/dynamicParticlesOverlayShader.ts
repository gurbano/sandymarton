/**
 * Dynamic Particles Overlay Shader
 *
 * Renders dynamic particles on top of the world texture.
 * Dynamic particles take visual precedence when overlapping with world pixels.
 */

import { ParticleColors } from '../world/ParticleTypes';

/**
 * Generate GLSL code for particle color mapping
 * Reuses the same color palette as base color shader
 */
function generateParticleColorCode(): string {
  const sortedTypes = Object.keys(ParticleColors)
    .map(Number)
    .sort((a, b) => a - b);

  let code = '';

  for (const type of sortedTypes) {
    const [r, g, b, a] = ParticleColors[type];
    const vecR = (r / 255).toFixed(3);
    const vecG = (g / 255).toFixed(3);
    const vecB = (b / 255).toFixed(3);
    const vecA = (a / 255).toFixed(3);

    code += `  if (particleType >= ${type}.0 && particleType < ${type + 1}.0) {\n`;
    code += `    return vec4(${vecR}, ${vecG}, ${vecB}, ${vecA});\n`;
    code += `  }\n\n`;
  }

  code += `  // Default: magenta for unknown types\n`;
  code += `  return vec4(1.0, 0.0, 1.0, 1.0);`;

  return code;
}

export const dynamicOverlayVertexShader = `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const dynamicOverlayFragmentShader = `
  precision highp float;

  uniform sampler2D uInputTexture;        // Base/world color texture
  uniform sampler2D uDynamicBuffer;       // Position/velocity buffer
  uniform sampler2D uDynamicAuxBuffer;    // Type/temp/flags buffer
  uniform float uDynamicBufferSize;       // Buffer dimension (32)
  uniform vec2 uTextureSize;              // World size
  uniform float uDynamicEnabled;

  varying vec2 vUv;

  // Flag constants
  const float FLAG_ACTIVE = 1.0;

  // Check if flag is set
  bool hasFlag(float flags, float flag) {
    return mod(floor(flags / flag), 2.0) > 0.5;
  }

  // Get color based on particle type
  vec4 getParticleColor(float particleType) {
${generateParticleColorCode()}
  }

  void main() {
    vec4 baseColor = texture2D(uInputTexture, vUv);

    // Early out if dynamic system disabled
    if (uDynamicEnabled < 0.5) {
      gl_FragColor = baseColor;
      return;
    }

    vec2 worldPos = vUv * uTextureSize;
    vec2 worldCoord = floor(worldPos);

    // Check ALL 1024 slots to find any particle at this position
    // This is O(1024) per pixel but guarantees we find moved particles
    float totalSlots = uDynamicBufferSize * uDynamicBufferSize; // 1024

    for (float slotY = 0.0; slotY < uDynamicBufferSize; slotY += 1.0) {
      for (float slotX = 0.0; slotX < uDynamicBufferSize; slotX += 1.0) {
        vec2 slotUV = vec2((slotX + 0.5) / uDynamicBufferSize, (slotY + 0.5) / uDynamicBufferSize);
        vec4 aux = texture2D(uDynamicAuxBuffer, slotUV);

        // Skip inactive slots
        if (!hasFlag(aux.b, FLAG_ACTIVE)) continue;

        vec4 particle = texture2D(uDynamicBuffer, slotUV);
        vec2 particlePos = particle.rg;
        vec2 particleCoord = floor(particlePos);

        // Check if this fragment is at the particle's position
        if (particleCoord.x == worldCoord.x && particleCoord.y == worldCoord.y) {
          // Render this dynamic particle
          float particleType = aux.r;
          gl_FragColor = getParticleColor(particleType);
          return;
        }
      }
    }

    // No dynamic particle at this position, use base color
    gl_FragColor = baseColor;
  }
`;

/**
 * Optimized version that uses an acceleration texture
 * (for future use if performance becomes an issue)
 */
export const dynamicOverlayOptimizedFragmentShader = `
  precision highp float;

  uniform sampler2D uInputTexture;
  uniform sampler2D uDynamicOccupancy;    // World-sized texture marking dynamic particle locations
  uniform sampler2D uDynamicAuxBuffer;
  uniform vec2 uTextureSize;
  uniform float uDynamicEnabled;

  varying vec2 vUv;

  vec4 getParticleColor(float particleType) {
${generateParticleColorCode()}
  }

  void main() {
    vec4 baseColor = texture2D(uInputTexture, vUv);

    if (uDynamicEnabled < 0.5) {
      gl_FragColor = baseColor;
      return;
    }

    // Sample occupancy texture - if R > 0, there's a dynamic particle here
    vec4 occupancy = texture2D(uDynamicOccupancy, vUv);

    if (occupancy.r > 0.5) {
      // Get particle type from occupancy (stored in G channel)
      float particleType = occupancy.g * 255.0;
      gl_FragColor = getParticleColor(particleType);
    } else {
      gl_FragColor = baseColor;
    }
  }
`;
