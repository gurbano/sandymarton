/**
 * Material definitions for all particle types
 * Uses base attributes with overrides for specific materials
 */

import { ParticleType } from './ParticleTypes';
import type { MaterialAttributes } from './ParticleTypes';
import { ParticleTypeRanges } from './ParticleTypeConstants';

// Base material attributes for each category
const BaseEmptyAttributes: MaterialAttributes = {
  density: 0,
  viscosity: 0,
  meltingPoint: 0,
  boilingPoint: 0,
  color: [0, 0, 0, 0],
  hardness: 0,
  friction: 0,
};

const BaseStaticAttributes: MaterialAttributes = {
  density: 2500,
  viscosity: 0,
  meltingPoint: 1500,
  boilingPoint: 3000,
  color: [128, 128, 128, 255],
  hardness: 9,
  friction: 1.0, // Static particles don't move
};

const BaseSolidAttributes: MaterialAttributes = {
  density: 2000,
  viscosity: 0,
  meltingPoint: 1500,
  boilingPoint: 3000,
  color: [128, 128, 128, 255],
  hardness: 8,
  friction: 0.75, // Default friction for solids
};

const BaseLiquidAttributes: MaterialAttributes = {
  density: 1000,
  viscosity: 100,
  meltingPoint: 0,
  boilingPoint: 100,
  color: [64, 164, 223, 180],
  hardness: 2,
  friction: 0.1, // Low friction for liquids
};

const BaseGasAttributes: MaterialAttributes = {
  density: 1,
  viscosity: 10,
  meltingPoint: -273,
  boilingPoint: -273,
  color: [200, 200, 255, 100],
  hardness: 0,
  friction: 0.05, // Very low friction for gases
};

export const MaterialDefinitions: Partial<Record<ParticleType, MaterialAttributes>> = {
  [ParticleType.EMPTY]: BaseEmptyAttributes,

  // Static particles
  [ParticleType.STONE]: BaseStaticAttributes,

  // Solid movable particles
  [ParticleType.SAND]: {
    ...BaseSolidAttributes,
    density: 1600,
    meltingPoint: 1700,
    boilingPoint: 2230,
    color: [255, 200, 100, 255],
    hardness: 4,
    friction: 0.8, // High friction - piles well
  },

  [ParticleType.DIRT]: {
    ...BaseSolidAttributes,
    density: 1200,
    meltingPoint: 800,
    boilingPoint: 1500,
    color: [139, 90, 43, 255],
    hardness: 3,
    friction: 0.85, // Very high friction - clumpy
  },

  [ParticleType.GRAVEL]: {
    ...BaseSolidAttributes,
    density: 1800,
    meltingPoint: 1400,
    boilingPoint: 2500,
    color: [100, 100, 100, 255],
    hardness: 6,
    friction: 0.6, // Lower friction - flows more easily
  },

  // Liquid particles
  [ParticleType.WATER]: {
    ...BaseLiquidAttributes,
    viscosity: 10,
    color: [0, 0, 223, 180],
    hardness: 1,
    friction: 0.05, // Very low friction - flows easily
  },

  [ParticleType.LAVA]: {
    ...BaseLiquidAttributes,
    density: 3100,
    viscosity: 1000,
    meltingPoint: -273,
    boilingPoint: 2000,
    color: [255, 0, 0, 255],
    hardness: 1,
    friction: 0.3, // Medium friction - viscous flow
  },

  [ParticleType.SLIME]: {
    ...BaseLiquidAttributes,
    density: 1100,
    viscosity: 500,
    meltingPoint: -50,
    boilingPoint: 150,
    color: [100, 255, 100, 200],
    hardness: 1,
    friction: 0.4, // Medium-high friction - gooey
  },

  [ParticleType.ACID]: {
    ...BaseLiquidAttributes,
    density: 1200,
    viscosity: 15,
    meltingPoint: -20,
    boilingPoint: 110,
    color: [150, 255, 50, 220],
    hardness: 1,
    friction: 0.08, // Very low friction - corrosive liquid
  },

  // Gas particles
  [ParticleType.STEAM]: {
    ...BaseGasAttributes,
    density: 0.6,
    viscosity: 1,
    color: [200, 200, 255, 100],
    friction: 0.02, // Extremely low friction
  },

  [ParticleType.SMOKE]: {
    ...BaseGasAttributes,
    density: 1.2,
    viscosity: 5,
    color: [80, 80, 80, 150],
    friction: 0.05, // Very low friction
  },

  [ParticleType.AIR]: {
    ...BaseGasAttributes,
    density: 1.3,
    viscosity: 2,
    color: [200, 220, 255, 50],
    friction: 0.01, // Lowest friction
  },
};

/**
 * Get default base attributes for a particle type based on its category
 */
function getDefaultBaseAttributes(particleType: number): MaterialAttributes {
  if (particleType >= ParticleTypeRanges.EMPTY_MIN && particleType <= ParticleTypeRanges.EMPTY_MAX) {
    return BaseEmptyAttributes;
  } else if (particleType >= ParticleTypeRanges.STATIC_MIN && particleType <= ParticleTypeRanges.STATIC_MAX) {
    return BaseStaticAttributes;
  } else if (particleType >= ParticleTypeRanges.SOLID_MIN && particleType <= ParticleTypeRanges.SOLID_MAX) {
    return BaseSolidAttributes;
  } else if (particleType >= ParticleTypeRanges.LIQUID_MIN && particleType <= ParticleTypeRanges.LIQUID_MAX) {
    return BaseLiquidAttributes;
  } else if (particleType >= ParticleTypeRanges.GAS_MIN && particleType <= ParticleTypeRanges.GAS_MAX) {
    return BaseGasAttributes;
  }
  return BaseEmptyAttributes;
}

/**
 * Generate shader constants for material attributes
 * Creates GLSL arrays that can be indexed by particle type
 * Falls back to base attributes if a material is not defined
 */
export function generateMaterialShaderConstants(): string {
  // Create arrays for each attribute
  const frictions: number[] = [];
  const densities: number[] = [];

  // Fill arrays with material properties (indexed by particle type)
  for (let i = 0; i < 256; i++) {
    const material = MaterialDefinitions[i as ParticleType];
    const defaultMaterial = getDefaultBaseAttributes(i);

    frictions[i] = material?.friction ?? defaultMaterial.friction;
    densities[i] = material?.density ?? defaultMaterial.density;
  }

  return `
// Material friction values (indexed by particle type)
const float MATERIAL_FRICTIONS[256] = float[256](
  ${frictions.map(f => f.toFixed(2)).join(', ')}
);

// Material density values (indexed by particle type)
const float MATERIAL_DENSITIES[256] = float[256](
  ${densities.map(d => d.toFixed(1)).join(', ')}
);

// Helper to get material friction
float getMaterialFriction(float particleType) {
  int index = int(particleType);
  if (index >= 0 && index < 256) {
    return MATERIAL_FRICTIONS[index];
  }
  return 0.75; // Default solid friction
}

// Helper to get material density
float getMaterialDensity(float particleType) {
  int index = int(particleType);
  if (index >= 0 && index < 256) {
    return MATERIAL_DENSITIES[index];
  }
  return 1000.0; // Default density
}
`;
}
