/**
 * Phase Transition Shader
 * Transforms particles based on temperature thresholds.
 *
 * Handles:
 * - Boiling: liquid → gas when temp >= boiling point (e.g., water → steam)
 * - Condensation: gas → liquid when temp < condensation point (e.g., steam → water)
 * - Freezing/Solidification: liquid → solid when temp < melting point (e.g., lava → stone)
 */

import { generatePhaseTransitionShaderConstants } from '../world/MaterialDefinitions';

export const phaseTransitionVertexShader = `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const phaseTransitionFragmentShader = `
  uniform sampler2D uCurrentState;    // Particle state texture (R=type, G=temp_low, B=temp_high, A=unused)
  uniform vec2 uTextureSize;

  varying vec2 vUv;

  ${generatePhaseTransitionShaderConstants()}

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

    // Get phase transition thresholds
    float boilingPoint = getMaterialBoilingPoint(particleType);
    float meltingPoint = getMaterialMeltingPoint(particleType);
    float condensationTemp = getMaterialCondensationTemp(particleType);

    // Get transition targets
    int boilsTo = getMaterialBoilsTo(particleType);
  int meltsTo = getMaterialMeltsTo(particleType);
    int condensesTo = getMaterialCondensesTo(particleType);
    int freezesTo = getMaterialFreezesTo(particleType);

    float newParticleType = particleType;

    // Check for boiling (liquid/solid → gas)
    // Only trigger if there's a valid target and temp exceeds boiling point
    if (boilsTo >= 0 && particleTemp >= boilingPoint) {
      newParticleType = float(boilsTo);
    }
    // Check for condensation (gas → liquid)
    // Only trigger if there's a valid target and temp drops below condensation point
    else if (condensesTo >= 0 && condensationTemp > 0.0 && particleTemp < condensationTemp) {
      newParticleType = float(condensesTo);
    }
    // Check for melting (solid → liquid)
    // Trigger when temperature rises above melting point
    else if (meltsTo >= 0 && particleTemp >= meltingPoint) {
      newParticleType = float(meltsTo);
    }
    // Check for freezing/solidification (liquid → solid)
    // Only trigger if there's a valid target and temp drops below melting point
    else if (freezesTo >= 0 && particleTemp < meltingPoint) {
      newParticleType = float(freezesTo);
    }

    // Encode temperature (unchanged)
    vec2 encodedTemp = encodeTemperature(particleTemp);

    // Output: R=type (possibly changed), G=temp_low, B=temp_high, A=unchanged
    gl_FragColor = vec4(newParticleType / 255.0, encodedTemp.x, encodedTemp.y, particleState.a);
  }
`;
