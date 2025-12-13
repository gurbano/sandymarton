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

  // Search radius for finding nearby empty cells
  const int SEARCH_RADIUS = 20;

  // Encode 16-bit temperature to two bytes (G, B channels)
  vec2 encodeTemperature(float temp) {
    float clamped = clamp(temp, 0.0, 65535.0);
    float tempLow = mod(clamped, 256.0);
    float tempHigh = floor(clamped / 256.0);
    return vec2(tempLow / 255.0, tempHigh / 255.0);
  }

  // Check if a cell is empty (type 0)
  bool isCellEmpty(vec2 pos) {
    if (pos.x < 0.0 || pos.y < 0.0 || pos.x >= uTextureSize.x || pos.y >= uTextureSize.y) {
      return false;
    }
    vec2 checkUV = (pos + 0.5) / uTextureSize;
    vec4 state = texture2D(uCurrentState, checkUV);
    return state.r * 255.0 < 0.5;
  }

  // Check if this pixel is the first empty cell in a spiral search from target
  // Returns true if this pixel should accept the particle
  bool isFirstEmptyInSearch(vec2 targetPos, vec2 myPos) {
    // Spiral search order: center, then rings outward
    // For each position in order, check if it's empty
    // If we find an empty cell before reaching myPos, return false
    // If myPos is the first empty cell, return true

    // Ring 0: center (already checked by caller, so skip)

    // Search in expanding rings
    for (int ring = 1; ring <= SEARCH_RADIUS; ring++) {
      // Top and bottom rows of ring
      for (int dx = -ring; dx <= ring; dx++) {
        // Top row
        vec2 checkPos = targetPos + vec2(float(dx), float(-ring));
        if (checkPos == myPos) return true;
        if (isCellEmpty(checkPos)) return false;

        // Bottom row
        checkPos = targetPos + vec2(float(dx), float(ring));
        if (checkPos == myPos) return true;
        if (isCellEmpty(checkPos)) return false;
      }

      // Left and right columns (excluding corners already checked)
      for (int dy = -ring + 1; dy <= ring - 1; dy++) {
        // Left column
        vec2 checkPos = targetPos + vec2(float(-ring), float(dy));
        if (checkPos == myPos) return true;
        if (isCellEmpty(checkPos)) return false;

        // Right column
        checkPos = targetPos + vec2(float(ring), float(dy));
        if (checkPos == myPos) return true;
        if (isCellEmpty(checkPos)) return false;
      }
    }

    return false;
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

      vec2 targetPos = floor(particlePos);

      // Check if target position is empty
      bool targetEmpty = isCellEmpty(targetPos);

      // Case 1: Direct match - particle settles exactly at this position
      if (targetEmpty && targetPos == worldCoord) {
        vec2 encodedTemp = encodeTemperature(temperature);
        gl_FragColor = vec4(particleType / 255.0, encodedTemp.x, encodedTemp.y, 1.0);
        return;
      }

      // Case 2: Target is occupied - find first empty cell nearby
      if (!targetEmpty) {
        // Check if this pixel is within search range
        vec2 offset = worldCoord - targetPos;
        if (abs(offset.x) <= float(SEARCH_RADIUS) && abs(offset.y) <= float(SEARCH_RADIUS)) {
          // Check if this is the first empty cell in the search pattern
          if (isFirstEmptyInSearch(targetPos, worldCoord)) {
            vec2 encodedTemp = encodeTemperature(temperature);
            gl_FragColor = vec4(particleType / 255.0, encodedTemp.x, encodedTemp.y, 1.0);
            return;
          }
        }
      }
    }

    // No particle settling here
    gl_FragColor = current;
  }
`;
