/**
 * Material definitions for all particle types
 * Uses base attributes with overrides for specific materials
 */

import { ParticleType } from './ParticleTypes';
import type { MaterialAttributes } from './ParticleTypes';
import { ParticleTypeRanges } from './ParticleTypeConstants';

import { celsiusToKelvin } from './ParticleTypes';

// Base material attributes for each category
const BaseEmptyAttributes: MaterialAttributes = {
  density: 0,
  viscosity: 0,
  meltingPoint: 0,
  boilingPoint: 0,
  color: [0, 0, 0, 0],
  hardness: 0,
  friction: 0,
  defaultTemperature: celsiusToKelvin(25), // Room temperature
  thermalCapacity: 0.0, // Empty space - heat passes through instantly
  thermalConductivity: 0.0, // Empty - no conduction
};

const BaseStaticAttributes: MaterialAttributes = {
  density: 2500,
  viscosity: 0,
  meltingPoint: 1500,
  boilingPoint: 3000,
  color: [128, 128, 128, 255],
  hardness: 9,
  friction: 1.0, // Static particles don't move
  defaultTemperature: celsiusToKelvin(25), // 25°C = 298K
  thermalCapacity: 0.8, // High capacity = particle loses less temp when emitting
  thermalConductivity: 0.3, // Stone is a moderate insulator
};

const BaseSolidAttributes: MaterialAttributes = {
  density: 2000,
  viscosity: 0,
  meltingPoint: 1500,
  boilingPoint: 3000,
  color: [128, 128, 128, 255],
  hardness: 8,
  friction: 0.75, // Default friction for solids
  defaultTemperature: celsiusToKelvin(25), // 25°C = 298K
  thermalCapacity: 0.5, // Medium thermal capacity for solids
  thermalConductivity: 0.5, // Medium conductivity
};

const BaseLiquidAttributes: MaterialAttributes = {
  density: 1000,
  viscosity: 100,
  meltingPoint: 0,
  boilingPoint: 100,
  color: [64, 164, 223, 180],
  hardness: 2,
  friction: 0.1, // Low friction for liquids
  defaultTemperature: celsiusToKelvin(20), // 20°C = 293K
  thermalCapacity: 0.7, // Liquids have high thermal capacity
  thermalConductivity: 0.6, // Liquids conduct reasonably well
};

const BaseGasAttributes: MaterialAttributes = {
  density: 1,
  viscosity: 10,
  meltingPoint: -273,
  boilingPoint: -273,
  color: [200, 200, 255, 100],
  hardness: 0,
  friction: 0.05, // Very low friction for gases
  defaultTemperature: celsiusToKelvin(100), // 100°C = 373K (hot gas)
  thermalCapacity: 0.2, // Gases have low thermal capacity - heat quickly
  thermalConductivity: 0.1, // Gases are poor conductors (insulators)
};

export const MaterialDefinitions: Partial<Record<ParticleType, MaterialAttributes>> = {
  [ParticleType.EMPTY]: BaseEmptyAttributes,

  // Static particles
  [ParticleType.STONE]: BaseStaticAttributes,

  // Solid movable particles
  // Solid particles
[ParticleType.SAND]: {
  ...BaseSolidAttributes,
  density: 1600,             // OK
  meltingPoint: 1700,        // Silica sand melts ~1700°C
  boilingPoint: 2230,
  color: [255, 200, 100, 255],
  hardness: 4,
  friction: 0.1,             // Very fluid - flows easily
},

[ParticleType.DIRT]: {
  ...BaseSolidAttributes,
  density: 1300,             // Slightly denser than dry dirt
  meltingPoint: 800,
  boilingPoint: 1500,
  color: [139, 90, 43, 255],
  hardness: 2,
  friction: 0.5,             // Medium friction - exact middle
},

[ParticleType.GRAVEL]: {
  ...BaseSolidAttributes,
  density: 1800,             // OK
  meltingPoint: 1400,
  boilingPoint: 2500,
  color: [100, 100, 100, 255],
  hardness: 6,
  friction: 0.9,             // Very high friction - rocks interlock
},

// Liquid particles
[ParticleType.WATER]: {
  ...BaseLiquidAttributes,
  viscosity: 5,              // Lower to match real free flow
  color: [0, 0, 223, 180],
  hardness: 1,
  friction: 0.02,            // Very low friction
  thermalCapacity: 1.0,      // Water has highest thermal capacity - very slow to heat/cool
},

[ParticleType.LAVA]: {
  ...BaseLiquidAttributes,
  density: 3100,             // Basaltic lava ~3000 kg/m3
  viscosity: 2000,           // Lava is extremely viscous
  meltingPoint: -273,
  boilingPoint: 2000,
  color: [255, 0, 0, 255],
  hardness: 1,
  friction: 0.2,             // Slow flowing but still liquid
  defaultTemperature: celsiusToKelvin(1000), // 1000°C = 1273K (molten rock)
  thermalCapacity: 0.90,     // Very high capacity - lava loses only 5% of emitted heat
  thermalConductivity: 0.2,  // Moderate conductivity - transfers heat but not too fast
},

[ParticleType.SLIME]: {
  ...BaseLiquidAttributes,
  density: 1100,
  viscosity: 800,            // Extra oozy
  meltingPoint: -50,
  boilingPoint: 150,
  color: [100, 255, 100, 200],
  hardness: 1,
  friction: 0.4,             // OK
},

[ParticleType.ACID]: {
  ...BaseLiquidAttributes,
  density: 1200,
  viscosity: 10,             // Close to water
  meltingPoint: -20,
  boilingPoint: 110,
  color: [150, 255, 50, 220],
  hardness: 1,
  friction: 0.03,            // Low friction
},

// Gas particles
[ParticleType.STEAM]: {
  ...BaseGasAttributes,
  density: 0.6,              // Lighter than air
  viscosity: 1,
  color: [200, 200, 255, 100],
  friction: 0.01,
},

[ParticleType.SMOKE]: {
  ...BaseGasAttributes,
  density: 0.9,              // Slightly lighter than air
  viscosity: 5,
  color: [80, 80, 80, 150],
  friction: 0.02,
},

[ParticleType.AIR]: {
  ...BaseGasAttributes,
  density: 1.0,              // Air baseline
  viscosity: 2,
  color: [200, 220, 255, 50],
  friction: 0.01,
  defaultTemperature: celsiusToKelvin(25), // Room temperature
  thermalConductivity: 0.02, // Air is a good insulator
},

// === NEW INSULATOR/CONDUCTOR MATERIALS ===

// Static insulators
[ParticleType.GLASS]: {
  ...BaseStaticAttributes,
  density: 2500,
  meltingPoint: 1400,
  boilingPoint: 2230,
  color: [200, 230, 255, 150],
  hardness: 6,
  thermalCapacity: 0.7,      // Medium-high capacity
  thermalConductivity: 0.05, // Very low - excellent insulator
},

[ParticleType.HEITE]: {
  ...BaseStaticAttributes,
  density: 3000,
  meltingPoint: 3000,
  boilingPoint: 5000,
  color: [255, 100, 50, 255],
  hardness: 8,
  defaultTemperature: celsiusToKelvin(500), // Starts hot
  thermalCapacity: 1.0,      // Never loses temp (infinite heat source)
  thermalConductivity: 0.8,  // High conductivity - transfers heat to surroundings
},

// Solid conductors/insulators
[ParticleType.COPPER]: {
  ...BaseSolidAttributes,
  density: 8960,             // Copper is dense
  meltingPoint: 1085,
  boilingPoint: 2562,
  color: [184, 115, 51, 255],
  hardness: 3,
  friction: 0.3,
  thermalCapacity: 0.4,      // Medium capacity
  thermalConductivity: 1.0,  // Perfect conductor - fastest heat transfer
},

[ParticleType.ITE]: {
  ...BaseSolidAttributes,
  density: 200,              // Very light (like wool)
  meltingPoint: 200,
  boilingPoint: 400,
  color: [255, 250, 220, 255],
  hardness: 1,
  friction: 0.8,             // Fluffy, high friction
  thermalCapacity: 0.3,      // Low capacity - heats/cools when touched
  thermalConductivity: 0.02, // Excellent insulator
},

// Liquid thermal materials
[ParticleType.OIL]: {
  ...BaseLiquidAttributes,
  density: 900,              // Lighter than water
  viscosity: 50,
  meltingPoint: -30,
  boilingPoint: 300,
  color: [40, 30, 20, 200],
  hardness: 1,
  friction: 0.05,
  thermalCapacity: 0.6,
  thermalConductivity: 0.1,  // Poor conductor - insulating liquid
},

[ParticleType.COOLANT]: {
  ...BaseLiquidAttributes,
  density: 1100,
  viscosity: 20,
  meltingPoint: -50,
  boilingPoint: 150,
  color: [100, 200, 255, 200],
  hardness: 1,
  friction: 0.03,
  defaultTemperature: celsiusToKelvin(-20), // Starts cold
  thermalCapacity: 0.3,      // Heats up quickly (absorbs heat)
  thermalConductivity: 0.95, // Excellent conductor - absorbs heat fast
},

// Gas thermal materials
[ParticleType.NITROGEN]: {
  ...BaseGasAttributes,
  density: 0.8,              // Slightly lighter than air
  viscosity: 1,
  color: [150, 200, 255, 80],
  friction: 0.01,
  defaultTemperature: celsiusToKelvin(-100), // Very cold
  thermalCapacity: 0.1,      // Very low - heats up easily
  thermalConductivity: 0.8,  // Good conductor for a gas - absorbs heat
},

};

/**
 * Get default base attributes for a particle type based on its category
 */
export function getDefaultBaseAttributes(particleType: number): MaterialAttributes {
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
  const defaultTemperatures: number[] = [];
  const thermalCapacities: number[] = [];
  const thermalConductivities: number[] = [];

  // Fill arrays with material properties (indexed by particle type)
  for (let i = 0; i < 256; i++) {
    const material = MaterialDefinitions[i as ParticleType];
    const defaultMaterial = getDefaultBaseAttributes(i);

    frictions[i] = material?.friction ?? defaultMaterial.friction;
    densities[i] = material?.density ?? defaultMaterial.density;
    defaultTemperatures[i] = material?.defaultTemperature ?? defaultMaterial.defaultTemperature;
    thermalCapacities[i] = material?.thermalCapacity ?? defaultMaterial.thermalCapacity;
    thermalConductivities[i] = material?.thermalConductivity ?? defaultMaterial.thermalConductivity;
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

// Material default temperatures in Kelvin (indexed by particle type)
const float MATERIAL_DEFAULT_TEMPS[256] = float[256](
  ${defaultTemperatures.map(t => t.toFixed(0) + '.0').join(', ')}
);

// Material thermal capacity (0.0-1.0): higher = particle loses LESS temp when emitting heat
// 0.95 means particle loses only 5% of heat it emits (like lava)
const float MATERIAL_THERMAL_CAPACITIES[256] = float[256](
  ${thermalCapacities.map(c => c.toFixed(2)).join(', ')}
);

// Material thermal conductivity (0.0-1.0): rate of heat transfer
// 0.0 = perfect insulator, 1.0 = perfect conductor
const float MATERIAL_THERMAL_CONDUCTIVITIES[256] = float[256](
  ${thermalConductivities.map(c => c.toFixed(2)).join(', ')}
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

// Helper to get material default temperature in Kelvin
float getMaterialDefaultTemperature(float particleType) {
  int index = int(particleType);
  if (index >= 0 && index < 256) {
    return MATERIAL_DEFAULT_TEMPS[index];
  }
  return 298.0; // Default room temperature (25°C)
}

// Helper to get material thermal capacity (0.0-1.0)
// Higher = particle loses less temp when emitting heat
float getMaterialThermalCapacity(float particleType) {
  int index = int(particleType);
  if (index >= 0 && index < 256) {
    return MATERIAL_THERMAL_CAPACITIES[index];
  }
  return 0.5; // Default medium thermal capacity
}

// Helper to get material thermal conductivity (0.0-1.0)
// Higher = faster heat transfer (conductors), Lower = slower (insulators)
float getMaterialThermalConductivity(float particleType) {
  int index = int(particleType);
  if (index >= 0 && index < 256) {
    return MATERIAL_THERMAL_CONDUCTIVITIES[index];
  }
  return 0.5; // Default medium conductivity
}
`;
}
