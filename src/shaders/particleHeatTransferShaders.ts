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

    // === STEP 2: Heat diffusion between same-material neighbors ===
    // Sample 4 direct neighbors (von Neumann neighborhood)
    float neighborTempSum = 0.0;
    float neighborCount = 0.0;

    // Up neighbor
    vec2 upUv = vUv + vec2(0.0, pixelSize.y);
    if (upUv.y <= 1.0) {
      vec4 upState = texture2D(uCurrentState, upUv);
      float upType = upState.r * 255.0;
      if (abs(upType - particleType) < 0.5) {
        // Same material type - include in diffusion
        float upTemp = decodeParticleTemperature(upState);
        neighborTempSum += upTemp;
        neighborCount += 1.0;
      }
    }

    // Down neighbor
    vec2 downUv = vUv - vec2(0.0, pixelSize.y);
    if (downUv.y >= 0.0) {
      vec4 downState = texture2D(uCurrentState, downUv);
      float downType = downState.r * 255.0;
      if (abs(downType - particleType) < 0.5) {
        float downTemp = decodeParticleTemperature(downState);
        neighborTempSum += downTemp;
        neighborCount += 1.0;
      }
    }

    // Left neighbor
    vec2 leftUv = vUv - vec2(pixelSize.x, 0.0);
    if (leftUv.x >= 0.0) {
      vec4 leftState = texture2D(uCurrentState, leftUv);
      float leftType = leftState.r * 255.0;
      if (abs(leftType - particleType) < 0.5) {
        float leftTemp = decodeParticleTemperature(leftState);
        neighborTempSum += leftTemp;
        neighborCount += 1.0;
      }
    }

    // Right neighbor
    vec2 rightUv = vUv + vec2(pixelSize.x, 0.0);
    if (rightUv.x <= 1.0) {
      vec4 rightState = texture2D(uCurrentState, rightUv);
      float rightType = rightState.r * 255.0;
      if (abs(rightType - particleType) < 0.5) {
        float rightTemp = decodeParticleTemperature(rightState);
        neighborTempSum += rightTemp;
        neighborCount += 1.0;
      }
    }

    // If we have same-material neighbors, diffuse heat toward average
    if (neighborCount > 0.0) {
      float avgNeighborTemp = neighborTempSum / neighborCount;

      // Diffusion rate depends on thermal conductivity
      // High conductivity (copper) = fast internal diffusion
      // Low conductivity (glass) = slow internal diffusion
      float diffusionRate = 0.1 * thermalConductivity;

      // Blend toward neighbor average
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
