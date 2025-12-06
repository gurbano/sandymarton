/**
 * Configuration for the simulation pipeline
 * Each step can be enabled/disabled and configured with number of passes
 */

export enum SimulationStepType {
  GPU_PHYSICS = 'gpu-physics',
  MARGOLUS_CA = 'margolus-ca',
  LIQUID_SPREAD = 'liquid-spread',
}

export interface SimulationStep {
  type: SimulationStepType;
  enabled: boolean;
  passes: number;
  name: string;
  description: string;
}

export interface SimulationConfig {
  steps: SimulationStep[];
}

export const DEFAULT_SIMULATION_CONFIG: SimulationConfig = {
  steps: [
    {
      type: SimulationStepType.GPU_PHYSICS,
      enabled: true,
      passes: 2,
      name: 'GPU Physics',
      description: 'Velocity-based particle physics with gravity',
    },
    {
      type: SimulationStepType.MARGOLUS_CA,
      enabled: true,
      passes: 2,
      name: 'Margolus CA',
      description: 'Cellular automata for realistic granular behavior (friction is per-material)',
    },
    {
      type: SimulationStepType.LIQUID_SPREAD,
      enabled: true,
      passes: 3,
      name: 'Liquid Spread',
      description: 'Fast liquid leveling and spreading',
    },
  ],
};
