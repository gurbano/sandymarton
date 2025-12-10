/**
 * Buildable types - things that can be placed in the world
 * beyond simple particle drawing (sources, props, special objects)
 */
export enum BuildableType {
  // Sources - emit particles/energy
  MATERIAL_SOURCE = 'material_source',
  MATERIAL_SINK = 'material_sink',
  HEAT_SOURCE = 'heat_source',
  COLD_SOURCE = 'cold_source',

  // Future: gravity wells, props, etc.
  // GRAVITY_WELL = 'gravity_well',
  // BLACK_HOLE = 'black_hole',
  // TREE = 'tree',
}

export enum BuildableCategory {
  SOURCES = 'Sources',
  GRAVITY = 'Gravity',
  PROPS = 'Props',
}

export interface BuildableClickContext {
  /** World X coordinate where clicked */
  worldX: number;
  /** World Y coordinate where clicked */
  worldY: number;
  /** Current brush size */
  brushSize: number;
  /** The world texture to modify */
  worldTexture: THREE.DataTexture;
  /** Reference to heat layer texture (DataTexture for CPU access) */
  heatTextureRef: React.RefObject<THREE.DataTexture | null>;
}

export interface BuildableDefinition {
  /** Unique identifier */
  type: BuildableType;
  /** Display name in UI */
  name: string;
  /** Description for tooltip/help */
  description: string;
  /** Category for grouping in UI */
  category: BuildableCategory;
  /** FontAwesome icon name (without 'fa' prefix) */
  icon: string;
  /** Callback executed when buildable is placed */
  onPlace: (context: BuildableClickContext) => void;
}

// Re-export for convenience
import * as THREE from 'three';
import type React from 'react';
