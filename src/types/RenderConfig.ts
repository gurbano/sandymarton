/**
 * Configuration for the post-processing rendering pipeline
 * Each effect can be enabled/disabled and configured independently
 */

export enum RenderEffectType {
  EDGE_BLENDING = 'edge-blending',
  MATERIAL_VARIATION = 'material-variation',
  // Future effects:
  // BLOOM = 'bloom',
  // BACKGROUND = 'background',
}

export enum OverlayType {
  HEAT = 'heat',
  FORCE = 'force',
}

export interface Overlay {
  type: OverlayType;
  enabled: boolean;
  name: string;
  description: string;
}

export interface RenderEffect {
  type: RenderEffectType;
  enabled: boolean;
  name: string;
  description: string;
}

export interface EdgeBlendingSettings {
  blendStrength: number; // Strength of edge blending (0-1, default: 0.5)
}

export interface MaterialVariationSettings {
  noiseScale: number; // Scale of noise pattern (default: 4.0)
  noiseStrength: number; // Strength of variation (0-1, default: 0.15)
}

export interface RenderConfig {
  effects: RenderEffect[];
  overlays: Overlay[];
  edgeBlending: EdgeBlendingSettings;
  materialVariation: MaterialVariationSettings;
}

export const DEFAULT_RENDER_CONFIG: RenderConfig = {
  effects: [
    {
      type: RenderEffectType.EDGE_BLENDING,
      enabled: true,
      name: 'Edge Blending',
      description: 'Smooths material boundaries by blending pixels at edges',
    },
    {
      type: RenderEffectType.MATERIAL_VARIATION,
      enabled: true,
      name: 'Material Variation',
      description: 'Adds natural texture variation to materials using noise',
    },
  ],
  overlays: [
    {
      type: OverlayType.HEAT,
      enabled: false,
      name: 'Heat Overlay',
      description: 'Visualize temperature distribution',
    },
    {
      type: OverlayType.FORCE,
      enabled: false,
      name: 'Force Overlay',
      description: 'Visualize force vectors',
    },
  ],
  edgeBlending: {
    blendStrength: 1.0,
  },
  materialVariation: {
    noiseScale: 4.0,
    noiseStrength: 0.15,
  },
};
