/**
 * Configuration for the post-processing rendering pipeline
 * Each effect can be enabled/disabled and configured independently
 */

export enum RenderEffectType {
  EDGE_BLENDING = 'edge-blending',
  MATERIAL_VARIATION = 'material-variation',
  GLOW = 'glow',
  // Future effects:
  // BLOOM = 'bloom',
  // BACKGROUND = 'background',
}

export enum OverlayType {
  HEAT = 'heat',
  AMBIENT_HEAT = 'ambient-heat',
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
  glow: GlowSettings;
}

export interface GlowSettings {
  intensity: number; // Multiplier for glow contribution (0-2, default: 0.6)
  radius: number; // Radius multiplier for neighbor sampling (1-4, default: 2.0)
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
    {
      type: RenderEffectType.GLOW,
      enabled: true,
      name: 'Material Glow',
      description: 'Adds a glow pass based on material emissive strengths',
    },
  ],
  overlays: [
    {
      type: OverlayType.HEAT,
      enabled: false,
      name: 'Particle Heat',
      description: 'Visualize particle temperatures',
    },
    {
      type: OverlayType.AMBIENT_HEAT,
      enabled: false,
      name: 'Ambient Heat',
      description: 'Visualize ambient heat layer',
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
  glow: {
    intensity: 0.7,
    radius: 2.6,
  },
};
