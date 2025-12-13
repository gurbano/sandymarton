/**
 * Particle Reintegration Shader
 *
 * Writes settled physics particles back into the world texture.
 * Only places particles in empty cells.
 *
 * Input: 64x1 RGBA32F texture where each pixel contains:
 * - R: worldX position
 * - G: worldY position
 * - B: particle type (0-255)
 * - A: temperature (Kelvin)
 */

import { EXTRACTION_BUFFER_SIZE } from '../types/PhysicsConfig';

export const particleReintegrationVertexShader = `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const particleReintegrationFragmentShader = `
  precision highp float;

  uniform sampler2D uCurrentState;
  uniform sampler2D uReintegrationTexture;  // 64x1 texture with particles to add
  uniform vec2 uTextureSize;
  uniform float uReintegrationCount;        // Number of valid particles

  varying vec2 vUv;

  // Encode 16-bit temperature to two bytes (G, B channels)
  vec2 encodeTemperature(float temp) {
    float clamped = clamp(temp, 0.0, 65535.0);
    float tempLow = mod(clamped, 256.0);
    float tempHigh = floor(clamped / 256.0);
    return vec2(tempLow / 255.0, tempHigh / 255.0);
  }

  void main() {
    vec4 current = texture2D(uCurrentState, vUv);
    vec2 worldCoord = floor(vUv * uTextureSize);
    float currentType = current.r * 255.0;

    // Only place in empty cells (type 0)
    if (currentType > 0.5) {
      gl_FragColor = current;
      return;
    }

    // Check if any particle wants to settle here
    for (float i = 0.0; i < ${EXTRACTION_BUFFER_SIZE}.0; i += 1.0) {
      if (i >= uReintegrationCount) break;

      // Read particle data from texture
      vec2 particleUV = vec2((i + 0.5) / ${EXTRACTION_BUFFER_SIZE}.0, 0.5);
      vec4 particleData = texture2D(uReintegrationTexture, particleUV);

      vec2 particlePos = particleData.rg;
      float particleType = particleData.b;
      float temperature = particleData.a;

      // Skip invalid positions
      if (particlePos.x < 0.0) continue;

      // Check if this particle settles at this world position
      if (floor(particlePos.x) == worldCoord.x && floor(particlePos.y) == worldCoord.y) {
        // Place particle with encoded temperature
        vec2 encodedTemp = encodeTemperature(temperature);
        gl_FragColor = vec4(particleType / 255.0, encodedTemp.x, encodedTemp.y, 1.0);
        return;
      }
    }

    // No particle settling here
    gl_FragColor = current;
  }
`;
