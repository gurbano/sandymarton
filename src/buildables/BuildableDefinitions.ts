import {
  BuildableType,
  BuildableCategory,
} from './Buildables';
import type {
  BuildableDefinition,
  BuildableClickContext,
} from './Buildables';
import {
  GPU_BUILDABLE_TYPE,
  LIFETIME_PERMANENT,
  DEFAULT_HEAT_INTENSITY,
  DEFAULT_FORCE_INTENSITY,
  IMPULSE_DURATION,
} from './BuildablesConstants';
import { getBuildablesManager } from './BuildablesTextureManager';
import { ParticleType } from '../world/ParticleTypes';

/**
 * Registry of all available buildables
 * Add new buildables here to make them available in the UI
 */
export const BuildableDefinitions: BuildableDefinition[] = [
  // === SOURCES ===
  {
    type: BuildableType.MATERIAL_SOURCE,
    name: 'Material Source',
    description: 'Continuously emits particles of a selected material',
    category: BuildableCategory.SOURCES,
    icon: 'faucet',
    onPlace: (context: BuildableClickContext) => {
      const manager = getBuildablesManager();
      const slot = manager.addBuildable({
        type: GPU_BUILDABLE_TYPE.MATERIAL_SOURCE,
        x: context.worldX,
        y: context.worldY,
        subtype: context.selectedMaterial ?? ParticleType.SAND,
        radius: context.brushSize,
        lifetime: LIFETIME_PERMANENT,
        rate: 0.5, // 50% chance to spawn per frame per empty pixel in radius
      });
      if (slot !== null) {
        console.log('Material Source placed at', context.worldX, context.worldY, 'slot:', slot);
      }
    },
  },
  {
    type: BuildableType.MATERIAL_SINK,
    name: 'Material Sink',
    description: 'Absorbs and removes particles that touch it',
    category: BuildableCategory.SOURCES,
    icon: 'circle-down',
    onPlace: (context: BuildableClickContext) => {
      const manager = getBuildablesManager();
      const slot = manager.addBuildable({
        type: GPU_BUILDABLE_TYPE.MATERIAL_SINK,
        x: context.worldX,
        y: context.worldY,
        radius: context.brushSize,
        lifetime: LIFETIME_PERMANENT,
        rate: 0.3, // 30% chance to delete per frame per particle in radius
      });
      if (slot !== null) {
        console.log('Material Sink placed at', context.worldX, context.worldY, 'slot:', slot);
      }
    },
  },
  {
    type: BuildableType.HEAT_SOURCE,
    name: 'Heat Source',
    description: 'Emits heat to nearby particles and environment',
    category: BuildableCategory.SOURCES,
    icon: 'fire',
    onPlace: (context: BuildableClickContext) => {
      const manager = getBuildablesManager();
      const slot = manager.addBuildable({
        type: GPU_BUILDABLE_TYPE.HEAT_SOURCE,
        x: context.worldX,
        y: context.worldY,
        subtype: DEFAULT_HEAT_INTENSITY / 10, // Temperature intensity (scaled down, shader scales up)
        radius: context.brushSize * 2, // Heat has larger radius than brush
        lifetime: LIFETIME_PERMANENT,
        rate: 1.0, // Full heat application rate
      });
      if (slot !== null) {
        console.log('Heat Source placed at', context.worldX, context.worldY, 'slot:', slot);
      }
    },
  },
  {
    type: BuildableType.COLD_SOURCE,
    name: 'Cold Source',
    description: 'Absorbs heat from nearby particles and environment',
    category: BuildableCategory.SOURCES,
    icon: 'snowflake',
    onPlace: (context: BuildableClickContext) => {
      const manager = getBuildablesManager();
      const slot = manager.addBuildable({
        type: GPU_BUILDABLE_TYPE.COLD_SOURCE,
        x: context.worldX,
        y: context.worldY,
        subtype: DEFAULT_HEAT_INTENSITY / 10, // Cooling intensity (scaled down, shader scales up)
        radius: context.brushSize * 2, // Cold has larger radius than brush
        lifetime: LIFETIME_PERMANENT,
        rate: 1.0, // Full cooling rate
      });
      if (slot !== null) {
        console.log('Cold Source placed at', context.worldX, context.worldY, 'slot:', slot);
      }
    },
  },
  {
    type: BuildableType.FORCE_SOURCE,
    name: 'Force Impulse',
    description: 'Applies a brief upward force impulse to eject particles (dies after a few frames)',
    category: BuildableCategory.SOURCES,
    icon: 'burst',
    onPlace: (context: BuildableClickContext) => {
      const manager = getBuildablesManager();
      const slot = manager.addBuildable({
        type: GPU_BUILDABLE_TYPE.FORCE_SOURCE,
        x: context.worldX,
        y: context.worldY,
        subtype: DEFAULT_FORCE_INTENSITY / 10, // Force intensity (scaled down, shader scales up)
        radius: context.brushSize * 2, // Force has larger radius than brush
        lifetime: IMPULSE_DURATION, // Dies after a few frames
        rate: 1.0, // Full force application rate
      });
      if (slot !== null) {
        console.log('Force Impulse placed at', context.worldX, context.worldY, 'slot:', slot);
      }
    },
  },
];

/**
 * Get buildables grouped by category
 */
export function getBuildablesByCategory(): Map<BuildableCategory, BuildableDefinition[]> {
  const grouped = new Map<BuildableCategory, BuildableDefinition[]>();

  for (const buildable of BuildableDefinitions) {
    const existing = grouped.get(buildable.category) || [];
    existing.push(buildable);
    grouped.set(buildable.category, existing);
  }

  return grouped;
}

/**
 * Get a buildable definition by type
 */
export function getBuildableByType(type: BuildableType): BuildableDefinition | undefined {
  return BuildableDefinitions.find((b) => b.type === type);
}

/**
 * Get all categories that have buildables
 */
export function getActiveCategories(): BuildableCategory[] {
  const categories = new Set<BuildableCategory>();
  for (const buildable of BuildableDefinitions) {
    categories.add(buildable.category);
  }
  return Array.from(categories);
}
