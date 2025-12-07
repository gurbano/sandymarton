/**
 * Configuration for the simulation pipeline
 * Each step can be enabled/disabled and configured with number of passes
 */

export enum SimulationStepType {
  MARGOLUS_CA = 'margolus-ca',
  LIQUID_SPREAD = 'liquid-spread',
  ARCHIMEDES = 'archimedes',
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
  frictionAmplifier: number; // Global multiplier for friction effect (0-10, default 1)
}

export const DEFAULT_SIMULATION_CONFIG: SimulationConfig = {
  frictionAmplifier: 1.0,
  steps: [
    {
      type: SimulationStepType.MARGOLUS_CA,
      enabled: true,
      passes: 4,
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
      passes: 4,
      name: 'Archimedes',
      description: 'Buoyancy and fluid displacement',
    },
  ],
};
