/**
 * Heat Transfer Shader
 * Handles temperature diffusion between particles
 *
 * Two-phase approach:
 * Phase 1 (even iteration): Transfer heat between particle and environment
 *   - Each particle has a default temperature based on its type
 *   - Heat transfers 1K per tick toward equilibrium
 *
 * Phase 2 (odd iteration): Diffuse heat between neighboring cells
 *   - Uses variable block size (3x3 or 2x2) with offset variation
 *   - This spreads heat across adjacent pixels
 */

import { generateMaterialShaderConstants } from '../world/MaterialDefinitions';

export const heatTransferVertexShader = `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const heatTransferFragmentShader = `
  uniform sampler2D uCurrentState;    // Particle state texture (R=type, G=velX, B=velY, A=unused)
  uniform sampler2D uHeatForceLayer;  // Heat/Force layer (R=temp_low, G=temp_high, B=forceX, A=forceY)
  uniform vec2 uTextureSize;
  uniform float uIteration;
  uniform float uRandomSeed;

  varying vec2 vUv;

  ${generateMaterialShaderConstants()}

  // Decode 16-bit temperature from two bytes
  float decodeTemperature(vec4 heatData) {
    float tempLow = heatData.r * 255.0;
    float tempHigh = heatData.g * 255.0;
    return tempLow + tempHigh * 256.0;
  }

  // Encode 16-bit temperature to two bytes
  vec2 encodeTemperature(float temp) {
    float clamped = clamp(temp, 0.0, 65535.0);
    float tempLow = mod(clamped, 256.0);
    float tempHigh = floor(clamped / 256.0);
    return vec2(tempLow / 255.0, tempHigh / 255.0);
  }

  // Simple hash for randomization
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  void main() {
    vec2 pixelSize = 1.0 / uTextureSize;

    // Get current particle state
    vec4 particleState = texture2D(uCurrentState, vUv);
    float particleType = particleState.r * 255.0;

    // Get current heat data
    vec4 heatData = texture2D(uHeatForceLayer, vUv);
    float currentTemp = decodeTemperature(heatData);

    // Keep force values unchanged
    float forceX = heatData.b;
    float forceY = heatData.a;

    float newTemp = currentTemp;

    // Determine phase based on iteration
    int phase = int(mod(uIteration, 2.0));

    if (phase == 0) {
      // Phase 1: Equilibrium transfer
      // Transfer heat toward the particle's default temperature
      float defaultTemp = getMaterialDefaultTemperature(particleType);

      // Transfer rate: 1K per tick toward equilibrium
      float transferRate = 2.0;

      if (currentTemp > defaultTemp) {
        newTemp = max(defaultTemp, currentTemp - transferRate);
      } else if (currentTemp < defaultTemp) {
        newTemp = min(defaultTemp, currentTemp + transferRate);
      }
    } else {
      // Phase 2: Diffusion with neighboring cells
      // Use variable block size and offset for less blocky appearance

      // Skip diffusion for empty cells (type 0-15) - don't lose heat to the void
      bool isCurrentEmpty = particleType < 16.0;
      if (isCurrentEmpty) {
        // Empty cells just keep their default temperature, no diffusion
        newTemp = currentTemp;
      } else {
        // Random values based on position and iteration
        float randBlock = hash(floor(vUv * uTextureSize / 3.0) + vec2(uRandomSeed));
        float randOffset = hash(floor(vUv * uTextureSize / 2.0) + vec2(uRandomSeed * 1.5));

        // Vary block size between 2x2 and 3x3
        int blockSize = randBlock > 0.5 ? 3 : 2;

        // Variable offset (0 or 1 pixel in each direction)
        vec2 offset = vec2(
          randOffset > 0.5 ? pixelSize.x : 0.0,
          fract(randOffset * 7.0) > 0.5 ? pixelSize.y : 0.0
        );

        // Sample neighbors and calculate average (only non-empty cells)
        float totalTemp = 0.0;
        float count = 0.0;

        for (int dy = -1; dy <= 1; dy++) {
          for (int dx = -1; dx <= 1; dx++) {
            // Skip corners for 2x2 effective sampling
            if (blockSize == 2 && abs(dx) + abs(dy) > 1) continue;

            vec2 neighborUv = vUv + vec2(float(dx), float(dy)) * pixelSize + offset;

            // Clamp to texture bounds
            neighborUv = clamp(neighborUv, vec2(0.0), vec2(1.0));

            // Check if neighbor is empty - skip if so (don't diffuse to/from void)
            vec4 neighborState = texture2D(uCurrentState, neighborUv);
            float neighborType = neighborState.r * 255.0;
            bool isNeighborEmpty = neighborType < 16.0;

            if (!isNeighborEmpty) {
              vec4 neighborHeat = texture2D(uHeatForceLayer, neighborUv);
              float neighborTemp = decodeTemperature(neighborHeat);

              totalTemp += neighborTemp;
              count += 1.0;
            }
          }
        }

        // Only diffuse if we found non-empty neighbors
        if (count > 0.0) {
          float avgTemp = totalTemp / count;
          float diffusionRate = 0.3; // How much to blend toward average
          newTemp = mix(currentTemp, avgTemp, diffusionRate);
        }
      }
    }

    // Encode the new temperature
    vec2 encodedTemp = encodeTemperature(newTemp);

    // Output: R=temp_low, G=temp_high, B=forceX, A=forceY
    gl_FragColor = vec4(encodedTemp.x, encodedTemp.y, forceX, forceY);
  }
`;
