/**
 * Shared GLSL helpers for temperature encoding and heat exchange logic
 */

export const temperatureShaderUtils = `
  // Decode 16-bit temperature from heat layer texture (R=low byte, G=high byte)
  float decodeHeatLayerTemperature(vec4 heatData) {
    float tempLow = heatData.r * 255.0;
    float tempHigh = heatData.g * 255.0;
    return tempLow + tempHigh * 256.0;
  }

  // Decode 16-bit temperature from particle texture (G=low byte, B=high byte)
  float decodeParticleTemperature(vec4 particleData) {
    float tempLow = particleData.g * 255.0;
    float tempHigh = particleData.b * 255.0;
    return tempLow + tempHigh * 256.0;
  }

  // Encode 16-bit temperature into two bytes for output
  vec2 encodeTemperature(float temp) {
    float clamped = clamp(temp, 0.0, 65535.0);
    float tempLow = mod(clamped, 256.0);
    float tempHigh = floor(clamped / 256.0);
    return vec2(tempLow / 255.0, tempHigh / 255.0);
  }

  // Compute how strongly heat should exchange between two bodies based on conductivity
  float computeHeatExchangeStrength(float thermalConductivity, float emissionMultiplier) {
    float emission = max(emissionMultiplier, 0.0);
    float conductivityFactor = clamp(thermalConductivity, 0.0, 1.0);
    return clamp(emission * conductivityFactor, 0.0, 1.0);
  }

  // Compute the heat delta flowing from source to target using shared exchange logic
  float computeHeatExchangeDelta(
    float sourceTemp,
    float targetTemp,
    float thermalConductivity,
    float emissionMultiplier
  ) {
    float exchangeStrength = computeHeatExchangeStrength(thermalConductivity, emissionMultiplier);
    return (sourceTemp - targetTemp) * exchangeStrength;
  }
`;
