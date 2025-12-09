/**
 * Particle-Only Heat Transfer Shader
 * Transfers heat directly between neighboring particles without using the heat layer.
 * This is faster as it only samples one texture (particle state).
 *
 * Heat diffusion occurs between:
 * 1. Same-material neighbors (fast diffusion)
 * 2. Different-material neighbors (slower, based on min conductivity)
 */

import { generateMaterialShaderConstants } from '../world/MaterialDefinitions';
import { temperatureShaderUtils } from './temperatureShaderUtils';

export const particleOnlyHeatVertexShader = `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const particleOnlyHeatFragmentShader = `
  uniform sampler2D uCurrentState;    // Particle state texture (R=type, G=temp_low, B=temp_high, A=unused)
  uniform sampler2D uHeatForceLayer;  // Heat/Force layer (R=env_temp_low, G=env_temp_high, B=forceX, A=forceY)
  uniform vec2 uTextureSize;
  uniform float uEmissionMultiplier;
  uniform float uHeatmapCouplingMultiplier;

  varying vec2 vUv;

  ${generateMaterialShaderConstants()}
  ${temperatureShaderUtils}

  void main() {
    vec2 pixelSize = 1.0 / uTextureSize;

    // Get current particle state
    vec4 particleState = texture2D(uCurrentState, vUv);
    float particleType = particleState.r * 255.0;
    float particleTemp = decodeParticleTemperature(particleState);

    // Check if this cell is empty (type 0-15)
    bool isCurrentEmpty = particleType < 16.0;

    // If empty, pass through unchanged
    if (isCurrentEmpty) {
      gl_FragColor = particleState;
      return;
    }

    // Get thermal properties for this material
    float thermalConductivity = getMaterialThermalConductivity(particleType);

    float newParticleTemp = particleTemp;

    // Heat exchange with ambient heat map from previous frame
    vec4 heatData = texture2D(uHeatForceLayer, vUv);
    float ambientTemp = decodeHeatLayerTemperature(heatData);
    float couplingMultiplier = uEmissionMultiplier * uHeatmapCouplingMultiplier;
    if (couplingMultiplier > 0.0) {
      float ambientDelta = 0.01 *computeHeatExchangeDelta(ambientTemp, newParticleTemp, thermalConductivity, couplingMultiplier);
      newParticleTemp = newParticleTemp + ambientDelta;
    }

    // === Heat diffusion with neighbors ===
    // Sample only 4 cardinal neighbors (Von Neumann neighborhood) for performance
    // Diffuse with BOTH same-material and different-material neighbors
    float sameMaterialTempSum = 0.0;
    float sameMaterialWeight = 0.0;
    float diffMaterialTempSum = 0.0;
    float diffMaterialWeight = 0.0;

    // Sample 4 cardinal neighbors only (up, down, left, right)
    vec2 offsets[4];
    offsets[0] = vec2(0.0, 1.0);   // up
    offsets[1] = vec2(0.0, -1.0);  // down
    offsets[2] = vec2(-1.0, 0.0);  // left
    offsets[3] = vec2(1.0, 0.0);   // right

    for (int i = 0; i < 4; i++) {
      vec2 neighborUv = vUv + offsets[i] * pixelSize;

      // Check bounds
      if (neighborUv.x < 0.0 || neighborUv.x > 1.0 || neighborUv.y < 0.0 || neighborUv.y > 1.0) continue;

      vec4 neighborState = texture2D(uCurrentState, neighborUv);
      float neighborType = neighborState.r * 255.0;

      // Skip empty neighbors
      if (neighborType < 16.0) continue;

      float neighborTemp = decodeParticleTemperature(neighborState);

      // Same material type - fast diffusion
      if (abs(neighborType - particleType) < 0.5) {
        sameMaterialTempSum += neighborTemp;
        sameMaterialWeight += 1.0;
      } else {
        // Different material - diffusion rate based on both conductivities
        float neighborConductivity = getMaterialThermalConductivity(neighborType);
        float contactConductivity = min(thermalConductivity, neighborConductivity);
        diffMaterialTempSum += neighborTemp * contactConductivity;
        diffMaterialWeight += contactConductivity;
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
