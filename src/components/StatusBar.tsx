import { useState } from 'react';
import type { DataTexture } from 'three';
import { ParticleType } from '../world/ParticleTypes';
import { ParticleCounter } from './ParticleCounter';
import type { SimulationConfig, SimulationStep } from '../types/SimulationConfig';

interface StatusBarProps {
  pixelSize: number;
  center: { x: number; y: number };
  selectedParticle: ParticleType;
  fps: number;
  worldTexture: DataTexture;
  simulationConfig: SimulationConfig;
  onSimulationConfigChange: (config: SimulationConfig) => void;
}

export function StatusBar({
  pixelSize,
  center,
  selectedParticle,
  fps,
  worldTexture,
  simulationConfig,
  onSimulationConfigChange,
}: StatusBarProps) {
  const [showSimSettings, setShowSimSettings] = useState(false);

  const handleStepToggle = (index: number) => {
    const newSteps = [...simulationConfig.steps];
    newSteps[index] = { ...newSteps[index], enabled: !newSteps[index].enabled };
    onSimulationConfigChange({ ...simulationConfig, steps: newSteps });
  };

  const handlePassesChange = (index: number, passes: number) => {
    const newSteps = [...simulationConfig.steps];
    newSteps[index] = { ...newSteps[index], passes: Math.max(0, passes) };
    onSimulationConfigChange({ ...simulationConfig, steps: newSteps });
  };

  const handleFrictionAmplifierChange = (value: number) => {
    onSimulationConfigChange({ ...simulationConfig, frictionAmplifier: value });
  };

  const enabledStepsCount = simulationConfig.steps.filter(s => s.enabled).length;

  return (
    <div className="status-bar">
      {/* Left side - stats */}
      <div className="status-left">
        <span className="status-item">FPS: {fps}</span>
        <span className="status-divider">|</span>
        <ParticleCounter worldTexture={worldTexture} />
        <span className="status-divider">|</span>
        <span className="status-item">Zoom: {pixelSize}</span>
        <span className="status-divider">|</span>
        <span className="status-item">Pos: ({center.x.toFixed(0)}, {center.y.toFixed(0)})</span>
        <span className="status-divider">|</span>
        <span className="status-item">{ParticleType[selectedParticle]}</span>
      </div>

      {/* Right side - simulation settings */}
      <div className="status-right">
        <div
          className={`status-toggle ${showSimSettings ? 'active' : ''}`}
          onClick={() => setShowSimSettings(!showSimSettings)}
        >
          <span className="status-toggle-value">{enabledStepsCount}</span>
          <span className="status-toggle-label">steps active ▾</span>

          {showSimSettings && (
            <div className="status-tooltip status-tooltip-right">
              <div className="tooltip-header">Simulation Settings</div>

              {/* Global Parameters */}
              <div className="sim-setting-group">
                <div className="sim-setting-row">
                  <span className="sim-setting-label">Friction</span>
                  <span className="sim-setting-value">{simulationConfig.frictionAmplifier.toFixed(1)}x</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="10"
                  step="0.1"
                  value={simulationConfig.frictionAmplifier}
                  onChange={(e) => handleFrictionAmplifierChange(parseFloat(e.target.value))}
                  className="sim-slider"
                  onClick={(e) => e.stopPropagation()}
                />
              </div>

              <div className="tooltip-divider"></div>

              {/* Pipeline Steps */}
              {simulationConfig.steps.map((step: SimulationStep, index: number) => (
                <div key={step.type} className="sim-step">
                  <label className="sim-step-header" onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={step.enabled}
                      onChange={() => handleStepToggle(index)}
                    />
                    <span className="sim-step-name">{step.name}</span>
                  </label>

                  {step.enabled && (
                    <div className="sim-step-controls">
                      <span className="sim-setting-value">{step.passes} passes</span>
                      <input
                        type="range"
                        min="0"
                        max="10"
                        step="1"
                        value={step.passes}
                        onChange={(e) => handlePassesChange(index, parseInt(e.target.value))}
                        className="sim-slider"
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
