/**
 * Configuration for the simulation pipeline
 * Each step can be enabled/disabled and configured with number of passes
 */

import type { DynamicParticlesConfig } from './DynamicParticlesConfig';
import { DEFAULT_DYNAMIC_PARTICLES_CONFIG } from './DynamicParticlesConfig';

export type { DynamicParticlesConfig };
export {
  DEFAULT_DYNAMIC_PARTICLES_CONFIG,
  DYNAMIC_BUFFER_SIZE,
  MAX_DYNAMIC_PARTICLES,
} from './DynamicParticlesConfig';

export enum SimulationStepType {
  PLAYER_UPDATE = 'player-update',
  DYNAMIC_EXTRACT = 'dynamic-extract',
  DYNAMIC_SIMULATE = 'dynamic-simulate',
  DYNAMIC_COLLISION = 'dynamic-collision',
  MARGOLUS_CA = 'margolus-ca',
  LIQUID_SPREAD = 'liquid-spread',
  ARCHIMEDES = 'archimedes',
  HEAT_TRANSFER = 'heat-transfer',
  PARTICLE_ONLY_HEAT = 'particle-only-heat',
  PHASE_TRANSITION = 'phase-transition',
  FORCE_TRANSFER = 'force-transfer',
}

export interface SimulationStep {
  type: SimulationStepType;
  enabled: boolean;
  passes: number;
  name: string;
  description: string;
}

export interface AmbientHeatSettings {
  emissionMultiplier: number;
  diffusionMultiplier: number;
  equilibriumStrength: number;
  equilibriumTemperature: number;
  equilibriumMaxDelta: number;
  equilibriumInterval: number;
  heatmapCouplingMultiplier: number;
}

export interface SimulationConfig {
  steps: SimulationStep[];
  frictionAmplifier: number; // Exponential friction power (0-10, default 1.3)
  ambientHeatSettings: AmbientHeatSettings;
  dynamicParticles: DynamicParticlesConfig;
}

export const DEFAULT_AMBIENT_HEAT_SETTINGS: AmbientHeatSettings = {
  emissionMultiplier: 0.3,
  diffusionMultiplier: 0.8,
  equilibriumStrength: 0.1,
  equilibriumTemperature: 298.0,
  equilibriumMaxDelta: 1,
  equilibriumInterval: 1,
  heatmapCouplingMultiplier: 2,
};

export const DEFAULT_SIMULATION_CONFIG: SimulationConfig = {
  frictionAmplifier: 1.3,
  ambientHeatSettings: { ...DEFAULT_AMBIENT_HEAT_SETTINGS },
  dynamicParticles: { ...DEFAULT_DYNAMIC_PARTICLES_CONFIG },
  steps: [
    {
      type: SimulationStepType.PLAYER_UPDATE,
      enabled: false, // Disabled by default, enable when player spawns
      passes: 10,
      name: 'Player Update',
      description: 'Player physics, collision, and particle displacement',
    },
    {
      type: SimulationStepType.DYNAMIC_EXTRACT,
      enabled: true, // Disabled by default
      passes: 10,
      name: 'Dynamic Extract',
      description: 'Eject particles from world into dynamic buffer when force exceeds threshold',
    },
    {
      type: SimulationStepType.DYNAMIC_SIMULATE,
      enabled: true,
      passes: 10,
      name: 'Dynamic Simulate',
      description: 'Physics update for dynamic particles (gravity, forces, drag)',
    },
    {
      type: SimulationStepType.DYNAMIC_COLLISION,
      enabled: true,
      passes: 10,
      name: 'Dynamic Collision',
      description: 'Ray-march movement, handle collisions, reintegrate settled particles',
    },
    {
      type: SimulationStepType.MARGOLUS_CA,
      enabled: true,
      passes: 8,
      name: 'Margolus CA',
      description: 'Cellular automata for realistic granular behavior (friction is per-material)',
    },
    {
      type: SimulationStepType.LIQUID_SPREAD,
      enabled: true,
      passes: 4,
      name: 'Liquid Spread',
      description: 'Fast liquid leveling and spreading',
    },
    {
      type: SimulationStepType.ARCHIMEDES,
      enabled: true,
      passes: 2,
      name: 'Archimedes',
      description: 'Buoyancy and fluid displacement',
    },
    {
      type: SimulationStepType.HEAT_TRANSFER,
      enabled: true,
      passes: 2,
      name: 'Ambient Heat Transfer',
      description: 'Temperature equilibrium via heat layer (slower)',
    },
    {
      type: SimulationStepType.PARTICLE_ONLY_HEAT,
      enabled: true,
      passes: 2,
      name: 'Particle Heat',
      description: 'Direct particle-to-particle heat diffusion (faster)',
    },
    {
      type: SimulationStepType.PHASE_TRANSITION,
      enabled: true,
      passes: 1,
      name: 'Phase Transition',
      description: 'Transform particles based on temperature (boiling, melting)',
    },
    {
      type: SimulationStepType.FORCE_TRANSFER,
      enabled: true,
      passes: 1,
      name: 'Force Transfer',
      description: 'Force propagation through materials',
    },
  ],
};
