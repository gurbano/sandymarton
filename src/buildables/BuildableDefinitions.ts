import {
  BuildableType,
  BuildableCategory,
} from './Buildables';
import type {
  BuildableDefinition,
  BuildableClickContext,
} from './Buildables';

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
      // TODO: Implement material source placement
      console.log('Material Source placed at', context.worldX, context.worldY);
    },
  },
  {
    type: BuildableType.MATERIAL_SINK,
    name: 'Material Sink',
    description: 'Absorbs and removes particles that touch it',
    category: BuildableCategory.SOURCES,
    icon: 'circle-down',
    onPlace: (context: BuildableClickContext) => {
      // TODO: Implement material sink placement
      console.log('Material Sink placed at', context.worldX, context.worldY);
    },
  },
  {
    type: BuildableType.HEAT_SOURCE,
    name: 'Heat Source',
    description: 'Emits heat to nearby particles and environment',
    category: BuildableCategory.SOURCES,
    icon: 'fire',
    onPlace: (context: BuildableClickContext) => {
      // TODO: Implement heat source placement
      console.log('Heat Source placed at', context.worldX, context.worldY);
    },
  },
  {
    type: BuildableType.COLD_SOURCE,
    name: 'Cold Source',
    description: 'Absorbs heat from nearby particles and environment',
    category: BuildableCategory.SOURCES,
    icon: 'snowflake',
    onPlace: (context: BuildableClickContext) => {
      // TODO: Implement cold source placement
      console.log('Cold Source placed at', context.worldX, context.worldY);
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
