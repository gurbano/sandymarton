import type { MaterialAttributes } from './ParticleTypes';
import { MaterialDefinitions, getDefaultBaseAttributes } from './MaterialDefinitions';

const materialDefinitionsById = MaterialDefinitions as Partial<Record<number, MaterialAttributes>>;

function buildGlowStrengthMap(): Record<number, number> {
  const glowMap: Record<number, number> = {};

  for (let i = 0; i < 256; i++) {
    const material = materialDefinitionsById[i];
    const fallback = getDefaultBaseAttributes(i);
    glowMap[i] = material?.glowStrength ?? fallback.glowStrength ?? 0;
  }

  return glowMap;
}

export const ParticleGlowStrengths: Record<number, number> = buildGlowStrengthMap();

export function generateParticleGlowCode(): string {
  const entries = Object.entries(ParticleGlowStrengths)
    .map(([type, strength]) => [Number(type), strength as number])
    .sort((a, b) => a[0] - b[0]);

  let code = '';

  for (const [type, strength] of entries) {
    const start = type;
    const end = type + 1;
    const glowValue = (strength ?? 0).toFixed(3);

    code += `  if (particleType >= ${start}.0 && particleType < ${end}.0) {\n`;
    code += `    return ${glowValue};\n`;
    code += '  }\n\n';
  }

  code += '  return 0.0;';
  return code;
}
