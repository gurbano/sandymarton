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

    // === STEP 1: Particle heat emission to environment ===
    // Non-empty particles exchange heat with the environment
    // Heat flows from particle to environment based on temperature difference
    if (!isCurrentEmpty) {
      // Heat flows based on difference between particle and environment (not room temp)
      // This prevents unbounded accumulation
      float tempDiff = particleTemp - envTemp;

      // Emission rate depends on thermal conductivity
      // High conductivity = transfers heat quickly (conductors)
      // Low conductivity = transfers heat slowly (insulators)
      float emissionRate = 0.02 * thermalConductivity;

      // Transfer heat from particle to environment
      newEnvTemp = newEnvTemp + tempDiff * emissionRate;

      // Clamp to valid 16-bit range (same as particle temperature)
      newEnvTemp = clamp(newEnvTemp, 0.0, 65535.0);
    }

    // === STEP 2: Diffusion (environmental heat spreads between cells) ===
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
      float diffusionRate = isCurrentEmpty ? 0.9 : 0.5;

      newEnvTemp = mix(newEnvTemp, avgTemp, diffusionRate);

      // Clamp after diffusion
      newEnvTemp = clamp(newEnvTemp, 0.0, 65535.0);
    }

    // === STEP 3: Equilibrium (environment trends toward room temperature) ===
    float roomTemp = 298.0; // Room temperature in Kelvin
    float tempDiff = abs(newEnvTemp - roomTemp);

    // Slow decay toward room temperature
    float baseRate = 0.01;
    float maxRate = 2.0;
    float decayRate = min(tempDiff * baseRate, maxRate);

    if (newEnvTemp > roomTemp) {
      newEnvTemp = max(roomTemp, newEnvTemp - decayRate);
    } else if (newEnvTemp < roomTemp) {
      newEnvTemp = min(roomTemp, newEnvTemp + decayRate);
    }

    // Encode the new environmental temperature
    vec2 encodedTemp = encodeTemperature(newEnvTemp);

    // Output: R=temp_low, G=temp_high, B=forceX, A=forceY
    gl_FragColor = vec4(encodedTemp.x, encodedTemp.y, forceX, forceY);
  }
`;
