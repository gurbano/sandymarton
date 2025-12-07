import { ParticleColors } from '../world/ParticleTypes';

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
  uniform vec2 uTextureSize;  // Size of the world texture (e.g., 2048x2048)
  uniform vec2 uCanvasSize;   // Size of the canvas in pixels
  uniform float uPixelSize;   // Zoom level (1 = 1:1, 2 = each particle is 2x2 pixels)
  uniform vec2 uCenter;       // World coordinates to center the view on
  uniform bool uIsColorTexture; // true if texture already contains colors, false if it contains state data
  varying vec2 vUv;

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
    vec2 texUV = (worldParticleCoord + vec2(1024.0, 1024.0)) / uTextureSize;

    // Check if we're outside the texture bounds
    if (texUV.x < 0.0 || texUV.x > 1.0 || texUV.y < 0.0 || texUV.y > 1.0) {
      // Outside bounds - render as dark grid pattern
      float gridSize = 32.0;
      float grid = mod(floor(worldParticleCoord.x / gridSize) + floor(worldParticleCoord.y / gridSize), 2.0);
      vec3 gridColor = mix(vec3(0.05, 0.05, 0.08), vec3(0.08, 0.08, 0.12), grid);
      gl_FragColor = vec4(gridColor, 1.0);
      return;
    }

    // Sample the texture
    vec4 texelData = texture2D(uTexture, texUV);

    // If texture already contains colors (post-processed), use them directly
    if (uIsColorTexture) {
      gl_FragColor = texelData;
      return;
    }

    // Otherwise, extract particle type from red channel and convert to color
    float particleType = texelData.r * 255.0;
    vec4 color = getParticleColor(particleType);
    gl_FragColor = color;
  }
`;
