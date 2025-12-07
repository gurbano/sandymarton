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

    const rangeStart = type;
    const rangeEnd = type + 1;

    code += `  if (particleType >= ${rangeStart}.0 && particleType < ${rangeEnd}.0) {\n`;
    code += `    return vec4(${vecR}, ${vecG}, ${vecB}, ${vecA});\n`;
    code += `  }\n\n`;
  }

  code += `  // Default: magenta for unknown types\n`;
  code += `  return vec4(1.0, 0.0, 1.0, 1.0);`;

  return code;
}

/**
 * Base color shader - converts particle types to colors
 * This is the first pass before post-processing effects
 */

export const baseColorVertexShader = `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const baseColorFragmentShader = `
  uniform sampler2D uStateTexture;
  varying vec2 vUv;

  // Get color based on particle type
  vec4 getParticleColor(float particleType) {
${generateParticleColorCode()}
  }

  void main() {
    // Sample the particle state
    vec4 particleData = texture2D(uStateTexture, vUv);

    // Extract particle type from red channel
    float particleType = particleData.r * 255.0;

    // Get the color for this particle type
    vec4 color = getParticleColor(particleType);

    gl_FragColor = color;
  }
`;
