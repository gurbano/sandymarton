import { ParticleColors } from '../world/ParticleTypes';
import { WORLD_SIZE } from '../constants/worldConstants';

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
  uniform vec2 uTextureSize;  // Size of the world texture
  uniform vec2 uCanvasSize;   // Size of the canvas in pixels
  uniform float uPixelSize;   // Zoom level (1 = 1:1, 2 = each particle is 2x2 pixels)
  uniform vec2 uCenter;       // World coordinates to center the view on
  uniform bool uIsColorTexture; // true if texture already contains colors, false if it contains state data
  uniform float uTime;        // Time in seconds for liquid animation
  varying vec2 vUv;

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

    // Always sample state texture to get particle type
    vec4 stateData = texture2D(uStateTexture, texUV);
    float particleType = stateData.r * 255.0;

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

    // Apply slushing effect to liquids (types 64-111)
    if (particleType >= 64.0 && particleType < 112.0) {
      // DEBUG: Make effect very obvious with strong pulsing
      float debugPulse = sin(uTime / 16.0) * 0.5 + 0.5;

      // Create animated noise using world coordinates and time
      vec2 noiseCoord = worldParticleCoord * 0.05 + vec2(uTime * 0.3, uTime * 0.2);
      float n = smoothNoise(noiseCoord);

      // Create a second layer of noise moving in different direction
      vec2 noiseCoord2 = worldParticleCoord * 0.08 - vec2(uTime * 0.2, uTime * 0.25);
      float n2 = smoothNoise(noiseCoord2);

      // Combine noise layers
      float combinedNoise = (n + n2) * 0.5;

      // DEBUG: Strong color shift to make it very obvious
      float colorShift = (combinedNoise - 0.5) * 0.2 + debugPulse * 0.1;
      color.rgb += vec3(colorShift);
    }

    gl_FragColor = color;
  }
`;
