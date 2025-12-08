/**
 * Particle Heat Transfer Shader
 * Updates particle temperatures based on:
 * 1. Heat exchange with environment (ambient)
 * 2. Heat diffusion between neighboring particles of the same material
 *
 * Heat exchange rate depends on thermal conductivity (how fast heat transfers)
 * Actual temp change depends on thermal capacity (how much particle loses)
 *   - High capacity (0.95) = particle loses only 5% of emitted heat (like lava)
 *   - Low capacity (0.1) = particle loses 90% of emitted heat
 */

import { generateMaterialShaderConstants } from '../world/MaterialDefinitions';

export const particleHeatTransferVertexShader = `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const particleHeatTransferFragmentShader = `
  uniform sampler2D uCurrentState;    // Particle state texture (R=type, G=temp_low, B=temp_high, A=unused)
  uniform sampler2D uHeatForceLayer;  // Heat/Force layer (R=env_temp_low, G=env_temp_high, B=forceX, A=forceY)
  uniform vec2 uTextureSize;

  varying vec2 vUv;

  ${generateMaterialShaderConstants()}

  // Decode 16-bit temperature from two bytes
  float decodeHeatLayerTemperature(vec4 heatData) {
    float tempLow = heatData.r * 255.0;
    float tempHigh = heatData.g * 255.0;
    return tempLow + tempHigh * 256.0;
  }

  // Decode particle temperature from G,B channels
  float decodeParticleTemperature(vec4 particleData) {
    float tempLow = particleData.g * 255.0;
    float tempHigh = particleData.b * 255.0;
    return tempLow + tempHigh * 256.0;
  }

  // Encode 16-bit temperature to two bytes
  vec2 encodeTemperature(float temp) {
    float clamped = clamp(temp, 0.0, 65535.0);
    float tempLow = mod(clamped, 256.0);
    float tempHigh = floor(clamped / 256.0);
    return vec2(tempLow / 255.0, tempHigh / 255.0);
  }

  void main() {
    vec2 pixelSize = 1.0 / uTextureSize;

    // Get current particle state
    vec4 particleState = texture2D(uCurrentState, vUv);
    float particleType = particleState.r * 255.0;
    float particleTemp = decodeParticleTemperature(particleState);

    // Get environmental temperature from heat layer
    vec4 heatData = texture2D(uHeatForceLayer, vUv);
    float envTemp = decodeHeatLayerTemperature(heatData);

    // Check if this cell is empty (type 0-15)
    bool isCurrentEmpty = particleType < 16.0;

    // If empty, pass through unchanged
    if (isCurrentEmpty) {
      gl_FragColor = particleState;
      return;
    }

    // Get thermal properties for this material
    float thermalConductivity = getMaterialThermalConductivity(particleType);
    float thermalCapacity = getMaterialThermalCapacity(particleType);

    float newParticleTemp = particleTemp;

    // === STEP 1: Heat exchange with environment ===
    // Positive tempDiff means particle is hotter than environment -> particle cools
    // Negative tempDiff means particle is colder than environment -> particle warms
    float tempDiff = particleTemp - envTemp;

    // Exchange rate depends on thermal conductivity (matches ambient heat transfer shader)
    // High conductivity = fast heat transfer, Low conductivity = slow transfer
    float exchangeRate = 0.02 * thermalConductivity;

    // Calculate how much heat is exchanged
    float heatExchange = tempDiff * exchangeRate;

    // Actual temperature change depends on thermal capacity
    // High capacity (0.95) = particle loses only 5% of exchanged heat
    // Low capacity (0.1) = particle loses 90% of exchanged heat
    float tempChange = heatExchange * (1.0 - thermalCapacity);

    // Update particle temperature from environment exchange
    newParticleTemp = newParticleTemp - tempChange;

    // === STEP 2: Heat diffusion with neighbors ===
    // Sample all 8 neighbors (Moore neighborhood)
    // Diffuse with BOTH same-material and different-material neighbors
    float sameMaterialTempSum = 0.0;
    float sameMaterialWeight = 0.0;
    float diffMaterialTempSum = 0.0;
    float diffMaterialWeight = 0.0;

    // Sample 3x3 neighborhood (excluding center)
    for (int dy = -1; dy <= 1; dy++) {
      for (int dx = -1; dx <= 1; dx++) {
        if (dx == 0 && dy == 0) continue; // Skip self

        vec2 neighborUv = vUv + vec2(float(dx), float(dy)) * pixelSize;

        // Check bounds
        if (neighborUv.x < 0.0 || neighborUv.x > 1.0 || neighborUv.y < 0.0 || neighborUv.y > 1.0) continue;

        vec4 neighborState = texture2D(uCurrentState, neighborUv);
        float neighborType = neighborState.r * 255.0;

        // Skip empty neighbors
        if (neighborType < 16.0) continue;

        float neighborTemp = decodeParticleTemperature(neighborState);

        // Weight diagonal neighbors less (distance ~1.41 vs 1.0)
        float distWeight = (dx != 0 && dy != 0) ? 0.707 : 1.0;

        // Same material type - fast diffusion
        if (abs(neighborType - particleType) < 0.5) {
          sameMaterialTempSum += neighborTemp * distWeight;
          sameMaterialWeight += distWeight;
        } else {
          // Different material - diffusion rate based on both conductivities
          float neighborConductivity = getMaterialThermalConductivity(neighborType);
          float contactConductivity = min(thermalConductivity, neighborConductivity);
          float weight = distWeight * contactConductivity;
          diffMaterialTempSum += neighborTemp * weight;
          diffMaterialWeight += weight;
        }
      }
    }

    // Diffuse with same-material neighbors (fast)
    if (sameMaterialWeight > 0.0) {
      float avgNeighborTemp = sameMaterialTempSum / sameMaterialWeight;
      // High base rate for same material
      float diffusionRate = 0.3 + 0.5 * thermalConductivity;
      newParticleTemp = mix(newParticleTemp, avgNeighborTemp, diffusionRate);
    }

    // Diffuse with different-material neighbors (slower, based on conductivity)
    if (diffMaterialWeight > 0.0) {
      float avgNeighborTemp = diffMaterialTempSum / diffMaterialWeight;
      // Rate depends on this particle's conductivity
      float diffusionRate = 0.2 * thermalConductivity;
      newParticleTemp = mix(newParticleTemp, avgNeighborTemp, diffusionRate);
    }

    // Clamp to valid range
    newParticleTemp = clamp(newParticleTemp, 0.0, 65535.0);

    // Encode new temperature
    vec2 encodedTemp = encodeTemperature(newParticleTemp);

    // Output: R=type (unchanged), G=temp_low, B=temp_high, A=unused (unchanged)
    gl_FragColor = vec4(particleState.r, encodedTemp.x, encodedTemp.y, particleState.a);
  }
`;
