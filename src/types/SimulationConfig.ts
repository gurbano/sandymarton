/**
 * Configuration for the simulation pipeline
 * Each step can be enabled/disabled and configured with number of passes
 */

export enum SimulationStepType {
  MARGOLUS_CA = 'margolus-ca',
  LIQUID_SPREAD = 'liquid-spread',
  ARCHIMEDES = 'archimedes',
  HEAT_TRANSFER = 'heat-transfer',
  FORCE_TRANSFER = 'force-transfer',
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
  frictionAmplifier: number; // Exponential friction power (0-10, default 1.3)
}

export const DEFAULT_SIMULATION_CONFIG: SimulationConfig = {
  frictionAmplifier: 1.3,
  steps: [
    {
      type: SimulationStepType.MARGOLUS_CA,
      enabled: true,
      passes: 10,
      name: 'Margolus CA',
      description: 'Cellular automata for realistic granular behavior (friction is per-material)',
    },
    {
      type: SimulationStepType.LIQUID_SPREAD,
      enabled: true,
      passes: 10,
      name: 'Liquid Spread',
      description: 'Fast liquid leveling and spreading',
    },
    {
      type: SimulationStepType.ARCHIMEDES,
      enabled: true,
      passes: 10,
      name: 'Archimedes',
      description: 'Buoyancy and fluid displacement',
    },
    {
      type: SimulationStepType.HEAT_TRANSFER,
      enabled: true,
      passes: 6,
      name: 'Heat Transfer',
      description: 'Temperature equilibrium and diffusion',
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
