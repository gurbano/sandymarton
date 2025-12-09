/**
 * Overlay Shaders
 * Renders heat and force overlays on top of the base particle visualization
 */

export const overlayVertexShader = `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/**
 * Heat Overlay Fragment Shader
 * Visualizes temperature distribution using a color gradient
 * Blue (cold) -> Cyan -> Green -> Yellow -> Red -> White (very hot)
 * Reads temperature directly from particle texture (G=temp_low, B=temp_high)
 */
export const heatOverlayFragmentShader = `
  uniform sampler2D uBaseTexture;     // Base rendered color texture
  uniform sampler2D uStateTexture;    // Particle state texture (R=type, G=temp_low, B=temp_high, A=unused)
  uniform vec2 uTextureSize;
  uniform float uOverlayStrength;     // Blend strength (0-1)

  varying vec2 vUv;

  // Temperature color mapping function
  // Maps temperature in Kelvin to a color gradient:
  // Cold (0K) = Dark Blue
  // Freezing (273K) = Blue
  // Room temp (298K) = Green
  // Hot (373K / 100°C) = Yellow
  // Very hot (773K / 500°C) = Red
  // Extreme (1273K+ / 1000°C+) = White
  vec3 temperatureToColor(float tempKelvin) {
    // Normalize temperature to useful range (0-1500K mapped to 0-1)
    float t = clamp(tempKelvin / 1500.0, 0.0, 1.0);

    vec3 color;

    if (t < 0.2) {
      // 0-300K: Dark blue to blue
      float f = t / 0.2;
      color = mix(vec3(0.0, 0.0, 0.3), vec3(0.0, 0.3, 1.0), f);
    } else if (t < 0.25) {
      // 300-375K: Blue to cyan (room temp range)
      float f = (t - 0.2) / 0.05;
      color = mix(vec3(0.0, 0.3, 1.0), vec3(0.0, 0.8, 0.8), f);
    } else if (t < 0.35) {
      // 375-525K: Cyan to green to yellow
      float f = (t - 0.25) / 0.1;
      color = mix(vec3(0.0, 0.8, 0.8), vec3(1.0, 1.0, 0.0), f);
    } else if (t < 0.5) {
      // 525-750K: Yellow to orange
      float f = (t - 0.35) / 0.15;
      color = mix(vec3(1.0, 1.0, 0.0), vec3(1.0, 0.5, 0.0), f);
    } else if (t < 0.7) {
      // 750-1050K: Orange to red
      float f = (t - 0.5) / 0.2;
      color = mix(vec3(1.0, 0.5, 0.0), vec3(1.0, 0.0, 0.0), f);
    } else {
      // 1050K+: Red to white (extreme heat)
      float f = (t - 0.7) / 0.3;
      color = mix(vec3(1.0, 0.0, 0.0), vec3(1.0, 1.0, 1.0), f);
    }

    return color;
  }

  void main() {
    // Get base color
    vec4 baseColor = texture2D(uBaseTexture, vUv);

    // Get particle state (R=type, G=temp_low, B=temp_high)
    vec4 particleData = texture2D(uStateTexture, vUv);
    float particleType = particleData.r * 255.0;

    // Empty cells - pass through base color (no particle heat to show)
    if (particleType < 16.0) {
      gl_FragColor = baseColor;
      return;
    }

    // Decode 16-bit temperature from G,B channels
    float tempLow = particleData.g * 255.0;
    float tempHigh = particleData.b * 255.0;
    float temperature = tempLow + tempHigh * 256.0;

    // Calculate how much the temperature deviates from room temp (298K)
    float tempDeviation = abs(temperature - 298.0) / 500.0;
    float heatIntensity = clamp(tempDeviation, 0.0, 1.0);

    // Get temperature color
    vec3 heatColor = temperatureToColor(temperature);

    // Blend heat color with base color - stronger blend so heat is visible
    vec3 finalColor = mix(baseColor.rgb, heatColor, 0.4 + heatIntensity * 0.4);

    gl_FragColor = vec4(finalColor, max(baseColor.a, 0.9));
  }
`;

/**
 * Ambient Heat Overlay Fragment Shader
 * Visualizes the ambient heat layer temperature
 * Reads from the heat/force layer texture (R=temp_low, G=temp_high)
 */
export const ambientHeatOverlayFragmentShader = `
  uniform sampler2D uBaseTexture;     // Base rendered color texture
  uniform sampler2D uStateTexture;    // Particle state texture (R=type)
  uniform sampler2D uHeatForceLayer;  // Heat/Force layer (R=temp_low, G=temp_high, B=forceX, A=forceY)
  uniform vec2 uTextureSize;
  uniform float uOverlayStrength;     // Blend strength (0-1)

  varying vec2 vUv;

  float normalizeAmbientTemperature(float tempKelvin) {
    float tempCelsius = tempKelvin - 273.15;
    return clamp((tempCelsius + 40.0) / 120.0, 0.0, 1.0);
  }

  vec3 temperatureToColor(float tempKelvin) {
    float n = normalizeAmbientTemperature(tempKelvin);
    vec3 color;

    if (n < 0.15) {
      float f = n / 0.15;
      color = mix(vec3(0.03, 0.05, 0.20), vec3(0.05, 0.30, 0.70), f);
    } else if (n < 0.35) {
      float f = (n - 0.15) / 0.20;
      color = mix(vec3(0.05, 0.30, 0.70), vec3(0.00, 0.80, 0.95), f);
    } else if (n < 0.55) {
      float f = (n - 0.35) / 0.20;
      color = mix(vec3(0.00, 0.80, 0.95), vec3(0.45, 0.95, 0.30), f);
    } else if (n < 0.75) {
      float f = (n - 0.55) / 0.20;
      color = mix(vec3(0.45, 0.95, 0.30), vec3(1.00, 0.92, 0.25), f);
    } else if (n < 0.9) {
      float f = (n - 0.75) / 0.15;
      color = mix(vec3(1.00, 0.92, 0.25), vec3(1.00, 0.55, 0.08), f);
    } else {
      float f = (n - 0.9) / 0.1;
      color = mix(vec3(1.00, 0.55, 0.08), vec3(1.00, 0.88, 0.82), clamp(f, 0.0, 1.0));
    }

    return color;
  }

  float computeBlendStrength(float tempKelvin) {
    float n = normalizeAmbientTemperature(tempKelvin);
    float accent = pow(abs(n - 0.5), 1.2);
    float contour = smoothstep(0.05, 0.25, n) * 0.16;
    float blend = 0.22 + accent * 0.5 + contour;
    return clamp(blend, 0.28, 0.82);
  }

  float computeEmptyAlpha(float tempKelvin) {
    float n = normalizeAmbientTemperature(tempKelvin);
    return clamp(0.28 + pow(n, 0.7) * 0.5, 0.28, 0.78);
  }

  void main() {
    // Get base color
    vec4 baseColor = texture2D(uBaseTexture, vUv);

    // Check if cell has a particle
    vec4 particleData = texture2D(uStateTexture, vUv);
    float particleType = particleData.r * 255.0;
    bool hasParticle = particleType >= 16.0;

    // Get ambient heat data (R=temp_low, G=temp_high)
    vec4 heatData = texture2D(uHeatForceLayer, vUv);

    // Decode 16-bit temperature from R,G channels
    float tempLow = heatData.r * 255.0;
    float tempHigh = heatData.g * 255.0;
    float temperature = tempLow + tempHigh * 256.0;

  float blendStrength = computeBlendStrength(temperature);
  vec3 heatColor = temperatureToColor(temperature);

    // For empty cells, show heat color directly (not mixed with black)
    // For particles, blend heat with base color
    vec3 finalColor;
    float alpha;

    if (hasParticle) {
      finalColor = mix(baseColor.rgb, heatColor, blendStrength);
      alpha = 0.85 + blendStrength * 0.1;
    } else {
      // Empty cell - show heat color directly with intensity-based alpha
      finalColor = heatColor;
      alpha = computeEmptyAlpha(temperature);
    }

    gl_FragColor = vec4(finalColor, alpha);
  }
`;

/**
 * Combined Heat Overlay Fragment Shader
 * Shows both particle and ambient heat added together
 */
export const combinedHeatOverlayFragmentShader = `
  uniform sampler2D uBaseTexture;     // Base rendered color texture
  uniform sampler2D uStateTexture;    // Particle state texture (R=type, G=temp_low, B=temp_high)
  uniform sampler2D uHeatForceLayer;  // Heat/Force layer (R=temp_low, G=temp_high)
  uniform vec2 uTextureSize;
  uniform float uOverlayStrength;     // Blend strength (0-1)

  varying vec2 vUv;

  float normalizeAmbientTemperature(float tempKelvin) {
    float tempCelsius = tempKelvin - 273.0;
    return clamp((tempCelsius + 20.0) / 220.0, 0.0, 1.0);
  }

  vec3 temperatureToColor(float tempKelvin) {
    float n = normalizeAmbientTemperature(tempKelvin);
    vec3 color;

    if (n < 0.1) {
      float f = n / 0.1;
      color = mix(vec3(0.05, 0.08, 0.30), vec3(0.08, 0.25, 0.60), f);
    } else if (n < 0.25) {
      float f = (n - 0.1) / 0.15;
      color = mix(vec3(0.08, 0.25, 0.60), vec3(0.00, 0.75, 0.95), f);
    } else if (n < 0.45) {
      float f = (n - 0.25) / 0.20;
      color = mix(vec3(0.00, 0.75, 0.95), vec3(0.50, 0.95, 0.35), f);
    } else if (n < 0.65) {
      float f = (n - 0.45) / 0.20;
      color = mix(vec3(0.50, 0.95, 0.35), vec3(1.00, 0.85, 0.15), f);
    } else if (n < 0.85) {
      float f = (n - 0.65) / 0.20;
      color = mix(vec3(1.00, 0.85, 0.15), vec3(1.00, 0.40, 0.00), f);
    } else {
      float f = (n - 0.85) / 0.15;
      color = mix(vec3(1.00, 0.40, 0.00), vec3(1.00, 0.95, 0.90), clamp(f, 0.0, 1.0));
    }

    return color;
  }

  float computeBlendStrength(float tempKelvin) {
    float n = normalizeAmbientTemperature(tempKelvin);
    float accent = pow(abs(n - 0.45), 0.75);
    float contour = smoothstep(0.0, 0.3, n) * 0.12;
    float blend = 0.28 + accent * 0.55 + contour;
    return clamp(blend, 0.3, 0.95);
  }

  float computeEmptyAlpha(float tempKelvin) {
    float n = normalizeAmbientTemperature(tempKelvin);
    return clamp(0.35 + pow(n, 0.6) * 0.45, 0.35, 0.85);
  }

  void main() {
    // Get base color
    vec4 baseColor = texture2D(uBaseTexture, vUv);

    // Get particle state
    vec4 particleData = texture2D(uStateTexture, vUv);
    float particleType = particleData.r * 255.0;
    bool hasParticle = particleType >= 16.0;

    // Get ambient heat data
    vec4 heatData = texture2D(uHeatForceLayer, vUv);

    // Decode particle temperature (if not empty)
    float particleTemp = 0.0;
    if (hasParticle) {
      float pTempLow = particleData.g * 255.0;
      float pTempHigh = particleData.b * 255.0;
      particleTemp = pTempLow + pTempHigh * 256.0;
    }

    // Decode ambient temperature
    float aTempLow = heatData.r * 255.0;
    float aTempHigh = heatData.g * 255.0;
    float ambientTemp = aTempLow + aTempHigh * 256.0;

    // Combine temperatures (use max for visualization)
    float combinedTemp = max(particleTemp, ambientTemp);

    float blendStrength = computeBlendStrength(combinedTemp);
    vec3 heatColor = temperatureToColor(combinedTemp);

    // For empty cells, show heat color directly (not mixed with black)
    // For particles, blend heat with base color
    vec3 finalColor;
    float alpha;

    if (hasParticle) {
      finalColor = mix(baseColor.rgb, heatColor, blendStrength);
      alpha = 0.85 + blendStrength * 0.1;
    } else {
      finalColor = heatColor;
      alpha = computeEmptyAlpha(combinedTemp);
    }

    gl_FragColor = vec4(finalColor, alpha);
  }
`;

/**
 * Force Overlay Fragment Shader
 * Visualizes force vectors as directional color indicators
 */
export const forceOverlayFragmentShader = `
  uniform sampler2D uBaseTexture;     // Base rendered color texture
  uniform sampler2D uHeatForceLayer;  // Heat/Force layer (B=forceX, A=forceY)
  uniform vec2 uTextureSize;
  uniform float uOverlayStrength;     // Blend strength (0-1)

  varying vec2 vUv;

  void main() {
    // Get base color
    vec4 baseColor = texture2D(uBaseTexture, vUv);

    // Get force data (B=forceX, A=forceY, 128=neutral)
    vec4 heatData = texture2D(uHeatForceLayer, vUv);

    // Decode force from 0-255 to -1 to 1
    float forceX = (heatData.b * 255.0 - 128.0) / 127.0;
    float forceY = (heatData.a * 255.0 - 128.0) / 127.0;

    // Calculate force magnitude
    float forceMag = length(vec2(forceX, forceY));

    // Map force direction to color (like a compass)
    // Right = Red, Up = Green, Left = Cyan, Down = Magenta
    vec3 forceColor = vec3(
      0.5 + forceX * 0.5,
      0.5 + forceY * 0.5,
      0.5 - forceX * 0.5
    );

    // Blend based on force magnitude and overlay strength
    vec3 finalColor = mix(baseColor.rgb, forceColor, forceMag * uOverlayStrength);

    gl_FragColor = vec4(finalColor, baseColor.a);
  }
`;
