/**
 * Configuration for the simulation pipeline
 * Each step can be enabled/disabled and configured with number of passes
 */

export enum SimulationStepType {
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
}

export interface SimulationConfig {
  steps: SimulationStep[];
  frictionAmplifier: number; // Exponential friction power (0-10, default 1.3)
  ambientHeatSettings: AmbientHeatSettings;
}

export const DEFAULT_AMBIENT_HEAT_SETTINGS: AmbientHeatSettings = {
  emissionMultiplier: 1,
  diffusionMultiplier: 0.1,
  equilibriumStrength: 0.01,
  equilibriumTemperature: 298.0,
  equilibriumMaxDelta: 1,
  equilibriumInterval: 1,
};

export const DEFAULT_SIMULATION_CONFIG: SimulationConfig = {
  frictionAmplifier: 1.3,
  ambientHeatSettings: { ...DEFAULT_AMBIENT_HEAT_SETTINGS },
  steps: [
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
      enabled: false,
      passes: 1,
      name: 'Force Transfer',
      description: 'Force propagation through materials',
    },
  ],
};
