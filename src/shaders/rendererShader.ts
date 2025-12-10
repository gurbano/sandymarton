import { ParticleColors } from '../world/ParticleTypes';
import { WORLD_SIZE } from '../constants/worldConstants';
import { generateShaderConstants } from '../world/ParticleTypeConstants';

/**
 * Generate GLSL code for particle color mapping
 * Automatically generates if/else statements from ParticleColors
 */
function generateParticleColorCode(): string {
  const sortedTypes = Object.keys(ParticleColors)
    .map(Number)
    .sort((a, b) => a - b);

  let code = '';

  for (const type of sortedTypes) {
    const [r, g, b, a] = ParticleColors[type];
    const vecR = (r / 255).toFixed(3);
    const vecG = (g / 255).toFixed(3);
    const vecB = (b / 255).toFixed(3);
    const vecA = (a / 255).toFixed(3);

    // Determine the range for this particle type (each type occupies 16 values)
    const rangeStart = type;
    const rangeEnd = type + 1;

    code += `  if (particleType >= ${rangeStart}.0 && particleType < ${rangeEnd}.0) {\n`;
    code += `    return vec4(${vecR}, ${vecG}, ${vecB}, ${vecA});\n`;
    code += `  }\n\n`;
  }

  // Default case for unknown particle types
  code += `  // Default: magenta for unknown types\n`;
  code += `  return vec4(1.0, 0.0, 1.0, 1.0);`;

  return code;
}

/**
 * Particle rendering shaders
 *
 * The texture stores particle data in RGBA format:
 * R = Particle Type (0-255)
 * G = Velocity X (encoded -128 to +127 as 0-255)
 * B = Velocity Y (encoded -128 to +127 as 0-255)
 * A = Additional data
 */

export const vertexShader = `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const fragmentShader = `
  uniform sampler2D uTexture;
  uniform sampler2D uStateTexture; // Always contains state data (particle types)
  uniform sampler2D uBackgroundTexture; // Optional background texture
  uniform vec2 uTextureSize;  // Size of the world texture
  uniform vec2 uCanvasSize;   // Size of the canvas in pixels
  uniform float uPixelSize;   // Zoom level (1 = 1:1, 2 = each particle is 2x2 pixels)
  uniform vec2 uCenter;       // World coordinates to center the view on
  uniform bool uIsColorTexture; // true if texture already contains colors, false if it contains state data
  uniform float uHasBackground;  // >0 when a background texture is provided
  const int MAX_BACKGROUND_COLORS = 6;
  uniform vec3 uBackgroundPalette[MAX_BACKGROUND_COLORS];
  uniform int uBackgroundPaletteSize;
  uniform float uBackgroundSeed;
  uniform vec2 uBackgroundNoiseOffsets[2];
  uniform float uTime;        // Time in seconds for liquid animation
  varying vec2 vUv;

  ${generateShaderConstants()}

  // Simple 2D noise function
  float noise(vec2 p) {
    return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
  }

  // Smooth noise using bilinear interpolation
  float smoothNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f); // Smoothstep

    float a = noise(i);
    float b = noise(i + vec2(1.0, 0.0));
    float c = noise(i + vec2(0.0, 1.0));
    float d = noise(i + vec2(1.0, 1.0));

    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
  }

  bool isParticleType(float typeValue, float targetType) {
    return typeValue >= targetType && typeValue < targetType + 1.0;
  }

  vec3 getBackgroundPaletteColor(int index) {
    int paletteCount = max(uBackgroundPaletteSize, 1);
    int clampedIndex = int(mod(float(index), float(paletteCount)));
    vec3 color = uBackgroundPalette[0];
    if (clampedIndex == 0) {
      color = uBackgroundPalette[0];
    } else if (clampedIndex == 1) {
      color = uBackgroundPalette[1];
    } else if (clampedIndex == 2) {
      color = uBackgroundPalette[2];
    } else if (clampedIndex == 3) {
      color = uBackgroundPalette[3];
    } else if (clampedIndex == 4) {
      color = uBackgroundPalette[4];
    } else {
      color = uBackgroundPalette[5];
    }
    return color;
  }

  // Get color based on particle type
  // This code is auto-generated from ParticleColors
  vec4 getParticleColor(float particleType) {
${generateParticleColorCode()}
  }

  void main() {
    // Canvas is square, so we can directly work with pixels
    // Convert UV to pixel coordinates
    vec2 pixelCoord = vUv * uCanvasSize;

    // Convert to particle coordinates (each particle is uPixelSize x uPixelSize pixels)
    vec2 particleCoord = floor(pixelCoord / uPixelSize);

    // Calculate how many particles fit in the canvas
    float particlesInView = uCanvasSize.x / uPixelSize;

    // Center of the view in particle coordinates
    vec2 viewCenter = vec2(particlesInView) / 2.0;

    // Apply center offset to get world particle coordinates
    vec2 worldParticleCoord = particleCoord - viewCenter + uCenter;

    // Convert to texture UV coordinates [0, 1]
    vec2 texUV = (worldParticleCoord + vec2(${WORLD_SIZE / 2}.0, ${WORLD_SIZE / 2}.0)) / uTextureSize;

    // Check if we're outside the texture bounds
    if (texUV.x < 0.0 || texUV.x > 1.0 || texUV.y < 0.0 || texUV.y > 1.0) {
      // Outside bounds - render as dark grid pattern
      float gridSize = 32.0;
      float grid = mod(floor(worldParticleCoord.x / gridSize) + floor(worldParticleCoord.y / gridSize), 2.0);
      vec3 gridColor = mix(vec3(0.05, 0.05, 0.08), vec3(0.08, 0.08, 0.12), grid);
      gl_FragColor = vec4(gridColor, 1.0);
      return;
    }

    vec2 cellUV = fract(pixelCoord / uPixelSize);
    float edgeDistance = min(min(cellUV.x, 1.0 - cellUV.x), min(cellUV.y, 1.0 - cellUV.y));
    float centerDistance = distance(cellUV, vec2(0.5));

    // Always sample state texture to get particle type
    vec4 stateData = texture2D(uStateTexture, texUV);
    float particleType = stateData.r * 255.0;

    // Sample background for this pixel (defaults to procedural stripes if none provided)
    vec4 backgroundSample;
    if (uHasBackground > 0.5) {
      vec2 backgroundUV = clamp(texUV, 0.0, 1.0);
      backgroundSample = texture2D(uBackgroundTexture, backgroundUV);
    } else {
      float paletteCount = float(max(uBackgroundPaletteSize, 1));
      float stripeScale = 42.0;
      float stripeCoord = (worldParticleCoord.y + uBackgroundSeed) / stripeScale;
      float stripeIndex = floor(stripeCoord);
      float stripeLocal = fract(stripeCoord);
      int baseIndex = int(mod(stripeIndex, paletteCount));
      int nextIndex = int(mod(float(baseIndex + 1), paletteCount));
      vec3 baseColor = getBackgroundPaletteColor(baseIndex);
      vec3 nextColor = getBackgroundPaletteColor(nextIndex);
      float blend = smoothstep(0.25, 0.75, stripeLocal) * 0.4;
      vec3 backgroundColor = mix(baseColor, nextColor, blend);

      vec2 rockCoord1 = worldParticleCoord * 0.08 + uBackgroundNoiseOffsets[0];
      vec2 rockCoord2 = worldParticleCoord * 0.18 + uBackgroundNoiseOffsets[1];
      float rockNoise = smoothNoise(rockCoord1) * 0.6 + smoothNoise(rockCoord2) * 0.4;
      float rockContrast = (rockNoise - 0.5) * 0.16;
      backgroundColor = clamp(backgroundColor + vec3(rockContrast), 0.0, 1.0);

      vec2 mistCoord1 = worldParticleCoord * 0.028 + vec2(uTime * 0.008, uTime * 0.006);
      vec2 mistCoord2 = worldParticleCoord * 0.054 + vec2(-uTime * 0.006, uTime * 0.005);
      vec2 mistCoord3 = worldParticleCoord * 0.095 + vec2(uTime * 0.004, -uTime * 0.003);
      float mistSample1 = smoothNoise(mistCoord1);
      float mistSample2 = smoothNoise(mistCoord2);
      float mistSample3 = smoothNoise(mistCoord3);
      float mist = (mistSample1 + mistSample2 + mistSample3) / 3.0;
      float mistAmount = (mist - 0.5) * 0.025;
      backgroundColor = clamp(backgroundColor + vec3(mistAmount), 0.0, 1.0);

      backgroundSample = vec4(backgroundColor, 1.0);
    }

    // Get color from either post-processed texture or compute from particle type
    vec4 color;
    if (uIsColorTexture) {
      // Use post-processed color
      vec4 texelData = texture2D(uTexture, texUV);
      color = texelData;
    } else {
      // Compute color from particle type
      color = getParticleColor(particleType);
    }

    // Apply animated wave effect to liquids
    if (particleType >= LIQUID_MIN && particleType <= LIQUID_MAX) {
      // Traveling wave effect - multiple sine waves at different angles and speeds
      float waveSpeed1 = uTime * 2.0;
      float waveSpeed2 = uTime * 1.5;
      float waveSpeed3 = uTime * 2.5;

      // Wave 1: travels diagonally (down-right)
      float wave1 = sin((worldParticleCoord.x + worldParticleCoord.y) * 0.15 + waveSpeed1);

      // Wave 2: travels horizontally (left)
      float wave2 = sin(worldParticleCoord.x * 0.2 - waveSpeed2) * 0.7;

      // Wave 3: travels vertically (up) with higher frequency
      float wave3 = sin(worldParticleCoord.y * 0.25 + waveSpeed3) * 0.5;

      // Combine waves for organic movement
      float combinedWave = (wave1 + wave2 + wave3) / 3.0;

      // Add subtle noise variation on top of waves
      vec2 noiseCoord = worldParticleCoord * 0.08 + vec2(uTime * 0.5, uTime * 0.3);
      float n = smoothNoise(noiseCoord);

      // Final effect: waves control brightness, noise adds texture
      float brightness = combinedWave * 0.12 + (n - 0.5) * 0.08;

      // Apply to color - slightly stronger on blue channel for water-like feel
      color.r += brightness * 0.8;
      color.g += brightness * 0.9;
      color.b += brightness * 1.0;
    }

    // Apply chaotic animated effect to gases
    if (particleType >= GAS_MIN && particleType <= GAS_MAX) {
      // Faster, more chaotic animation than liquids
      float gasTime = uTime * 4.0; // Much faster than liquid

      // Multiple noise layers at different scales and speeds for chaotic motion
      // Layer 1: Large scale, slow drift
      vec2 noiseCoord1 = worldParticleCoord * 0.05 + vec2(gasTime * 0.3, gasTime * 0.2);
      float n1 = smoothNoise(noiseCoord1);

      // Layer 2: Medium scale, medium speed, different direction
      vec2 noiseCoord2 = worldParticleCoord * 0.12 + vec2(-gasTime * 0.5, gasTime * 0.4);
      float n2 = smoothNoise(noiseCoord2);

      // Layer 3: Fine detail, fast turbulence
      vec2 noiseCoord3 = worldParticleCoord * 0.25 + vec2(gasTime * 0.8, -gasTime * 0.6);
      float n3 = smoothNoise(noiseCoord3);

      // Layer 4: Very fine, very fast (creates flickering effect)
      vec2 noiseCoord4 = worldParticleCoord * 0.5 + vec2(gasTime * 1.5, gasTime * 1.2);
      float n4 = noise(noiseCoord4); // Use non-smooth noise for sharper variation

      // Combine noise layers with different weights
      float combinedNoise = n1 * 0.3 + n2 * 0.3 + n3 * 0.25 + n4 * 0.15;

      // Create brightness variation (more dramatic than liquids)
      float brightness = (combinedNoise - 0.5) * 0.4;

      // Apply brightness to color
      color.rgb += vec3(brightness);

      // Dynamic transparency - gas fades in and out
      // Use different noise combination for alpha to create wispy effect
      float alphaNoise = n1 * 0.4 + n2 * 0.35 + n3 * 0.25;
      float alphaVariation = (alphaNoise - 0.5) * 0.5; // Range: -0.25 to +0.25

      // Apply alpha variation (multiply base alpha by variation factor)
      color.a *= (0.75 + alphaVariation); // Range: 0.5 to 1.0 multiplier
      color.a = clamp(color.a, 0.1, 1.0); // Ensure some minimum visibility
    }

    if (isParticleType(particleType, GLASS_TYPE)) {
      float rim = 1.0 - smoothstep(0.10, 0.28, edgeDistance);
      float sparkleNoise = smoothNoise(worldParticleCoord * 0.35 + vec2(uTime * 0.4, uTime * 0.23));
      float sparkle = smoothstep(0.6, 0.9, sparkleNoise);
      float shimmer = clamp(rim * 0.6 + sparkle * 0.4, 0.0, 1.0);
      color.rgb += vec3(0.18, 0.22, 0.28) * shimmer;
      color.a *= 0.55 + rim * 0.35;
    }

    bool isIceFamily =
      isParticleType(particleType, ICE_TYPE) ||
      isParticleType(particleType, COOLANT_ICE_TYPE) ||
      isParticleType(particleType, NITROGEN_ICE_TYPE);

    if (isIceFamily) {
      float frostNoise = smoothNoise(worldParticleCoord * 0.18 + vec2(uTime * 0.1, uTime * 0.07));
      float frostSparkle = smoothstep(0.65, 1.0, frostNoise);
      float rimSparkle = 1.0 - smoothstep(0.12, 0.30, edgeDistance);
      float sparkle = clamp(frostSparkle * 0.5 + rimSparkle * 0.5, 0.0, 1.0);
      color.rgb += vec3(0.12, 0.18, 0.28) * sparkle;
    }

    bool isMetallic = isParticleType(particleType, COPPER_TYPE) || isParticleType(particleType, HEITE_TYPE);
    if (isMetallic) {
      vec2 centeredUV = (cellUV - 0.5) * 2.0;
      vec2 lightDir = normalize(vec2(0.4, 1.0));
      float spec = max(0.0, dot(normalize(centeredUV), lightDir));
      spec = pow(spec, 6.0);
      float pulse = 0.5 + 0.5 * sin(uTime * 3.0 + worldParticleCoord.x * 0.25 + worldParticleCoord.y * 0.35);
      float highlight = spec * (0.6 + 0.4 * pulse);
      color.rgb += vec3(0.22, 0.15, 0.08) * highlight;

      float rimSheen = 1.0 - smoothstep(0.14, 0.32, edgeDistance);
      color.rgb += vec3(0.08, 0.05, 0.03) * rimSheen * 0.3;

      if (isParticleType(particleType, HEITE_TYPE)) {
        color.rgb += vec3(0.25, 0.08, 0.02) * rimSheen * 0.4;
      }
    }

    if (isParticleType(particleType, OIL_TYPE)) {
      float centerShadow = 1.0 - smoothstep(0.0, 0.45, centerDistance);
      float darkness = 0.75 - centerShadow * 0.2;
      color.rgb *= clamp(darkness, 0.5, 0.85);

      float swirlNoise = smoothNoise(worldParticleCoord * 0.22 + vec2(uTime * 0.45, -uTime * 0.33));
      float sheenNoise = (swirlNoise - 0.5) * 0.4;
      float rim = 1.0 - smoothstep(0.10, 0.25, edgeDistance);
      float sheen = clamp(rim * 0.5 + sheenNoise, 0.0, 1.0);
      color.rgb += vec3(0.10, 0.07, 0.04) * sheen;

      color.a *= 0.9;
    }

    color.rgb = clamp(color.rgb, 0.0, 1.0);
    color.a = clamp(color.a, 0.0, 1.0);

    vec3 finalColor = mix(backgroundSample.rgb, color.rgb, color.a);
    float finalAlpha = clamp(backgroundSample.a + color.a * (1.0 - backgroundSample.a), 0.0, 1.0);

    gl_FragColor = vec4(clamp(finalColor, 0.0, 1.0), max(finalAlpha, 1e-3));
  }
`;
