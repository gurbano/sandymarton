/**
 * Ambient Heat Transfer Shader
 * Handles environmental heat diffusion (heat layer acts as heat sink for particles)
 *
 * New architecture:
 * - Particle temperature is stored IN the particle texture (G=temp_low, B=temp_high)
 * - Heat layer stores environmental temperature (heat sink)
 * - Hot particles emit heat to the environment
 * - Environment diffuses heat to neighbors
 *
 * Every pass does:
 * 1. Particle heat emission: Hot particles contribute heat to the environment
 * 2. Diffusion: Environmental heat spreads between cells
 * 3. Equilibrium: Environment trends toward room temperature
 */

import { generateMaterialShaderConstants } from '../world/MaterialDefinitions';

export const ambientHeatTransferVertexShader = `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const ambientHeatTransferFragmentShader = `
  uniform sampler2D uCurrentState;    // Particle state texture (R=type, G=temp_low, B=temp_high, A=unused)
  uniform sampler2D uHeatForceLayer;  // Heat/Force layer (R=env_temp_low, G=env_temp_high, B=forceX, A=forceY)
  uniform vec2 uTextureSize;
  uniform float uIteration;
  uniform float uRandomSeed;
  uniform float uEmissionMultiplier;
  uniform float uDiffusionMultiplier;
  uniform float uEquilibriumStrength;
  uniform float uEquilibriumTemperature;
  uniform float uEquilibriumMaxDelta;
  uniform float uEquilibriumEnabled;

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

  // Simple hash for randomization
  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
  }

  void main() {
    vec2 pixelSize = 1.0 / uTextureSize;

    // Get current particle state
    vec4 particleState = texture2D(uCurrentState, vUv);
    float particleType = particleState.r * 255.0;
    float particleTemp = decodeParticleTemperature(particleState);

    // Get current heat layer data (environmental temperature)
    vec4 heatData = texture2D(uHeatForceLayer, vUv);
    float envTemp = decodeHeatLayerTemperature(heatData);

    // Keep force values unchanged
    float forceX = heatData.b;
    float forceY = heatData.a;

    float newEnvTemp = envTemp;

    // Check if this cell is empty (type 0-15)
    bool isCurrentEmpty = particleType < 16.0;

    // Get thermal properties for this material
    float thermalConductivity = getMaterialThermalConductivity(particleType);

  // === Step 1: Emission (particle heat feeds the environment) ===
  // Non-empty particles exchange heat with the environment
    if (!isCurrentEmpty) {
      // Emission strength depends on material conductivity and user multiplier
      float emissionMultiplier = max(uEmissionMultiplier, 0.0);
      float conductivityFactor = clamp(thermalConductivity, 0.0, 1.0);
      float emissionStrength = clamp(emissionMultiplier * conductivityFactor, 0.0, 1.0);

      // Blend toward particle temperature for stability
      newEnvTemp = mix(newEnvTemp, particleTemp, emissionStrength);

      // Clamp to valid 16-bit range (same as particle temperature)
      newEnvTemp = clamp(newEnvTemp, 0.0, 65535.0);
    }

  // === Step 2: Diffusion (environmental heat spreads between cells) ===
    // Random offset for symmetry (prevents directional bias)
    float randOffset = hash(floor(vUv * uTextureSize / 2.0) + vec2(uRandomSeed * 1.5));
    vec2 offset = vec2(
      (randOffset - 0.5) * pixelSize.x,
      (fract(randOffset * 7.0) - 0.5) * pixelSize.y
    );

    // Sample neighbors in a 5x5 area (radius 2) for faster heat spread
    float totalTemp = 0.0;
    float totalWeight = 0.0;

    for (int dy = -2; dy <= 2; dy++) {
      for (int dx = -2; dx <= 2; dx++) {
        vec2 neighborUv = vUv + vec2(float(dx), float(dy)) * pixelSize + offset;

        // Clamp to texture bounds
        neighborUv = clamp(neighborUv, vec2(0.0), vec2(1.0));

        vec4 neighborHeat = texture2D(uHeatForceLayer, neighborUv);
        float neighborEnvTemp = decodeHeatLayerTemperature(neighborHeat);

        // Weight by distance - closer neighbors have more influence
        float dist = sqrt(float(dx * dx + dy * dy));
        float distWeight = 1.0 / (1.0 + dist * 0.5);

        totalTemp += neighborEnvTemp * distWeight;
        totalWeight += distWeight;
      }
    }

    // Diffuse toward weighted average
    if (totalWeight > 0.0) {
      float avgTemp = totalTemp / totalWeight;

      // Fast diffusion for empty cells
  float diffusionBase = isCurrentEmpty ? 0.9 : 0.5;
  float diffusionMultiplier = clamp(uDiffusionMultiplier, 0.0, 2.0);
  float diffusionRate = clamp(diffusionBase * diffusionMultiplier, 0.0, 0.99);

      newEnvTemp = mix(newEnvTemp, avgTemp, diffusionRate);

      // Clamp after diffusion
      newEnvTemp = clamp(newEnvTemp, 0.0, 65535.0);
    }

  // === Step 3: Decay (environment trends toward configurable temperature) ===
    float equilibriumStrength = clamp(uEquilibriumStrength, 0.0, 1.0);
    if (equilibriumStrength > 0.0 && uEquilibriumEnabled > 0.5) {
      float targetTemp = max(uEquilibriumTemperature, 0.0);
      float blendedTemp = mix(newEnvTemp, targetTemp, equilibriumStrength);

      float maxDelta = max(uEquilibriumMaxDelta, 0.0);
      if (maxDelta > 0.0) {
        float delta = blendedTemp - newEnvTemp;
        delta = clamp(delta, -maxDelta, maxDelta);
        newEnvTemp = newEnvTemp + delta;
      } else {
        newEnvTemp = blendedTemp;
      }
    }

    // Encode the new environmental temperature
    vec2 encodedTemp = encodeTemperature(newEnvTemp);

    // Output: R=temp_low, G=temp_high, B=forceX, A=forceY
    gl_FragColor = vec4(encodedTemp.x, encodedTemp.y, forceX, forceY);
  }
`;
