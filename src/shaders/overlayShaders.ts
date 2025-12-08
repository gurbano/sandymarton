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
 */
export const heatOverlayFragmentShader = `
  uniform sampler2D uBaseTexture;     // Base rendered color texture
  uniform sampler2D uHeatForceLayer;  // Heat/Force layer (R=temp_low, G=temp_high, B=forceX, A=forceY)
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

    // Get heat data (R=temp_low, G=temp_high as 16-bit temperature)
    vec4 heatData = texture2D(uHeatForceLayer, vUv);

    // Decode 16-bit temperature from two bytes
    float tempLow = heatData.r * 255.0;
    float tempHigh = heatData.g * 255.0;
    float temperature = tempLow + tempHigh * 256.0;

    // Get temperature color
    vec3 heatColor = temperatureToColor(temperature);

    // Blend heat color with base color based on overlay strength
    // Use additive blending for a nice glow effect
    vec3 finalColor = mix(baseColor.rgb, heatColor, uOverlayStrength * 0.7);

    // Also add a subtle glow for very hot areas
    float hotness = clamp((temperature - 500.0) / 1000.0, 0.0, 1.0);
    finalColor += heatColor * hotness * uOverlayStrength * 0.3;

    // Always show heat overlay even on transparent/empty areas
    // Make alpha at least as strong as the overlay to ensure visibility
    float finalAlpha = max(baseColor.a, uOverlayStrength);

    gl_FragColor = vec4(finalColor, finalAlpha);
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
