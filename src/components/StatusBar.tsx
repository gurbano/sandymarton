import { useState, useCallback } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChevronDown, faChevronRight } from '@fortawesome/free-solid-svg-icons';
import type { WheelEvent as ReactWheelEvent } from 'react';
import type { DataTexture } from 'three';
import { ParticleType } from '../world/ParticleTypes';
import { ParticleCounter } from './ParticleCounter';
import type { SimulationConfig, SimulationStep, AmbientHeatSettings } from '../types/SimulationConfig';
import { DEFAULT_AMBIENT_HEAT_SETTINGS } from '../types/SimulationConfig';
import type { PlayerSettings } from '../types/PlayerConfig';

interface StatusBarProps {
  pixelSize: number;
  center: { x: number; y: number };
  selectedParticle: ParticleType;
  fps: number;
  dynamicParticleCount?: number;
  worldTexture: DataTexture;
  simulationConfig: SimulationConfig;
  onSimulationConfigChange: (config: SimulationConfig) => void;
  playerEnabled?: boolean;
  onTogglePlayer?: () => void;
  playerSettings?: PlayerSettings;
  onPlayerSettingsChange?: (settings: Partial<PlayerSettings>) => void;
}

export function StatusBar({
  pixelSize,
  center,
  selectedParticle,
  fps,
  dynamicParticleCount = 0,
  worldTexture,
  simulationConfig,
  onSimulationConfigChange,
  playerEnabled = false,
  onTogglePlayer,
  playerSettings,
  onPlayerSettingsChange,
}: StatusBarProps) {
  const [showSimSettings, setShowSimSettings] = useState(false);
  const [showPlayerSettings, setShowPlayerSettings] = useState(false);
  const [showAmbientSettings, setShowAmbientSettings] = useState(true);
  const [showEmissionSettings, setShowEmissionSettings] = useState(true);
  const [showDiffusionSettings, setShowDiffusionSettings] = useState(true);
  const [showDecaySettings, setShowDecaySettings] = useState(true);
  const [showParticleHeatSettings, setShowParticleHeatSettings] = useState(true);
  const handleSettingsWheel = useCallback((event: ReactWheelEvent<HTMLDivElement>) => {
    event.stopPropagation();
    const container = event.currentTarget;
    container.scrollTop += event.deltaY;
    event.preventDefault();
  }, []);

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

  const handleAmbientHeatChange = (key: keyof AmbientHeatSettings, value: number) => {
    const current = simulationConfig.ambientHeatSettings ?? { ...DEFAULT_AMBIENT_HEAT_SETTINGS };
    onSimulationConfigChange({
      ...simulationConfig,
      ambientHeatSettings: {
        ...current,
        [key]: value,
      },
    });
  };

  const handleEquilibriumTemperatureChange = (celsiusValue: number) => {
    const kelvinValue = celsiusValue + 273.15;
    handleAmbientHeatChange('equilibriumTemperature', kelvinValue);
  };

  const handleEquilibriumIntervalChange = (value: number) => {
    const interval = Math.max(1, Math.round(value));
    handleAmbientHeatChange('equilibriumInterval', interval);
  };

  const handlePlayerSettingChange = (key: keyof PlayerSettings, value: number) => {
    if (onPlayerSettingsChange) {
      onPlayerSettingsChange({ [key]: value });
    }
  };

  const enabledStepsCount = simulationConfig.steps.filter(s => s.enabled).length;
  const ambientSettings = simulationConfig.ambientHeatSettings ?? DEFAULT_AMBIENT_HEAT_SETTINGS;
  const equilibriumTargetCelsius = ambientSettings.equilibriumTemperature - 273.15;
  const equilibriumMaxDeltaCelsius = ambientSettings.equilibriumMaxDelta;
  const equilibriumInterval = Math.max(1, Math.round(ambientSettings.equilibriumInterval));
  const heatmapCoupling = ambientSettings.heatmapCouplingMultiplier;

  return (
    <div className="status-bar">
      {/* Left side - stats */}
      <div className="status-left">
        <span className="status-item">FPS: {fps}</span>
        <span className="status-divider">|</span>
        <ParticleCounter worldTexture={worldTexture} />
        <span className="status-divider">|</span>
        <span className="status-item" title="Active dynamic particles">Dyn: {dynamicParticleCount}</span>
        <span className="status-divider">|</span>
        <span className="status-item">Zoom: {pixelSize}</span>
        <span className="status-divider">|</span>
        <span className="status-item">Pos: ({center.x.toFixed(0)}, {center.y.toFixed(0)})</span>
        <span className="status-divider">|</span>
        <span className="status-item">{ParticleType[selectedParticle]}</span>
        <span className="status-divider">|</span>
        <button
          type="button"
          className={`status-player-btn ${playerEnabled ? 'active' : ''}`}
          onClick={onTogglePlayer}
          title="Toggle player (P)"
        >
          {playerEnabled ? '🏃 Player ON' : '👤 Player OFF'}
        </button>
        {playerEnabled && playerSettings && (
          <div
            className={`status-toggle ${showPlayerSettings ? 'active' : ''}`}
            onClick={() => setShowPlayerSettings(!showPlayerSettings)}
          >
            <span className="status-toggle-label">⚙️</span>

            {showPlayerSettings && (
              <div
                className="status-tooltip"
                onWheelCapture={handleSettingsWheel}
                onWheel={handleSettingsWheel}
              >
                <div className="tooltip-header">Player Settings</div>

                <div className="sim-setting-group">
                  <div className="sim-setting-row">
                    <span className="sim-setting-label">Scale</span>
                    <span className="sim-setting-value">{playerSettings.scale.toFixed(1)}x</span>
                  </div>
                  <input
                    type="range"
                    min="0.3"
                    max="3.0"
                    step="0.1"
                    value={playerSettings.scale}
                    onChange={(e) => handlePlayerSettingChange('scale', parseFloat(e.target.value))}
                    className="sim-slider"
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>

                <div className="sim-setting-group">
                  <div className="sim-setting-row">
                    <span className="sim-setting-label">Push-Out Force</span>
                    <span className="sim-setting-value">{playerSettings.pushOutStrength.toFixed(1)}</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="10"
                    step="0.1"
                    value={playerSettings.pushOutStrength}
                    onChange={(e) => handlePlayerSettingChange('pushOutStrength', parseFloat(e.target.value))}
                    className="sim-slider"
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>

                <div className="tooltip-divider"></div>

                <div className="sim-setting-group">
                  <div className="sim-setting-row">
                    <span className="sim-setting-label">Speed</span>
                    <span className="sim-setting-value">{playerSettings.speed.toFixed(1)}</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="20"
                    step="0.5"
                    value={playerSettings.speed}
                    onChange={(e) => handlePlayerSettingChange('speed', parseFloat(e.target.value))}
                    className="sim-slider"
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>

                <div className="sim-setting-group">
                  <div className="sim-setting-row">
                    <span className="sim-setting-label">Jump Strength</span>
                    <span className="sim-setting-value">{playerSettings.jumpStrength.toFixed(1)}</span>
                  </div>
                  <input
                    type="range"
                    min="2"
                    max="30"
                    step="0.5"
                    value={playerSettings.jumpStrength}
                    onChange={(e) => handlePlayerSettingChange('jumpStrength', parseFloat(e.target.value))}
                    className="sim-slider"
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>

                <div className="sim-setting-group">
                  <div className="sim-setting-row">
                    <span className="sim-setting-label">Gravity</span>
                    <span className="sim-setting-value">{playerSettings.gravity.toFixed(2)}</span>
                  </div>
                  <input
                    type="range"
                    min="0.05"
                    max="1.0"
                    step="0.05"
                    value={playerSettings.gravity}
                    onChange={(e) => handlePlayerSettingChange('gravity', parseFloat(e.target.value))}
                    className="sim-slider"
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
              </div>
            )}
          </div>
        )}
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
            <div
              className="status-tooltip status-tooltip-right"
              onWheelCapture={handleSettingsWheel}
              onWheel={handleSettingsWheel}
            >
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

              <div className="settings-group collapsible">
                <button
                  type="button"
                  className={`settings-group-toggle ${showParticleHeatSettings ? 'expanded' : ''}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    setShowParticleHeatSettings(prev => !prev);
                  }}
                >
                  <FontAwesomeIcon icon={showParticleHeatSettings ? faChevronDown : faChevronRight} />
                  <span>Particle Heat Coupling</span>
                </button>
                {showParticleHeatSettings && (
                  <div className="settings-group-content">
                    <div className="sim-setting-group">
                      <div className="sim-setting-row">
                        <span className="sim-setting-label">Coupling Strength</span>
                        <span className="sim-setting-value">{heatmapCoupling.toFixed(2)}x</span>
                      </div>
                      <input
                        type="range"
                        min="0"
                        max="3"
                        step="0.05"
                        value={heatmapCoupling}
                        onChange={(e) => handleAmbientHeatChange('heatmapCouplingMultiplier', parseFloat(e.target.value))}
                        className="sim-slider"
                        onClick={(e) => e.stopPropagation()}
                      />
                    </div>
                  </div>
                )}
              </div>

              <div className="tooltip-divider"></div>

              <div className="settings-group collapsible">
                <button
                  type="button"
                  className={`settings-group-toggle ${showAmbientSettings ? 'expanded' : ''}`}
                  onClick={(event) => {
                    event.stopPropagation();
                    setShowAmbientSettings(prev => !prev);
                  }}
                >
                  <FontAwesomeIcon icon={showAmbientSettings ? faChevronDown : faChevronRight} />
                  <span>Ambient Heat Transfer</span>
                </button>
                {showAmbientSettings && (
                  <div className="settings-group-content">
                    <div className="settings-group collapsible">
                      <button
                        type="button"
                        className={`settings-group-toggle ${showEmissionSettings ? 'expanded' : ''}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          setShowEmissionSettings(prev => !prev);
                        }}
                      >
                        <FontAwesomeIcon icon={showEmissionSettings ? faChevronDown : faChevronRight} />
                        <span>Emission</span>
                      </button>
                      {showEmissionSettings && (
                        <div className="settings-group-content">
                          <div className="sim-setting-group">
                            <div className="sim-setting-row">
                              <span className="sim-setting-label">Emission Strength</span>
                              <span className="sim-setting-value">{ambientSettings.emissionMultiplier.toFixed(1)}x</span>
                            </div>
                            <input
                              type="range"
                              min="0"
                              max="5"
                              step="0.1"
                              value={ambientSettings.emissionMultiplier}
                              onChange={(e) => handleAmbientHeatChange('emissionMultiplier', parseFloat(e.target.value))}
                              className="sim-slider"
                              onClick={(e) => e.stopPropagation()}
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="settings-group collapsible">
                      <button
                        type="button"
                        className={`settings-group-toggle ${showDiffusionSettings ? 'expanded' : ''}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          setShowDiffusionSettings(prev => !prev);
                        }}
                      >
                        <FontAwesomeIcon icon={showDiffusionSettings ? faChevronDown : faChevronRight} />
                        <span>Diffusion</span>
                      </button>
                      {showDiffusionSettings && (
                        <div className="settings-group-content">
                          <div className="sim-setting-group">
                            <div className="sim-setting-row">
                              <span className="sim-setting-label">Diffusion Strength</span>
                              <span className="sim-setting-value">{ambientSettings.diffusionMultiplier.toFixed(2)}x</span>
                            </div>
                            <input
                              type="range"
                              min="0"
                              max="2"
                              step="0.05"
                              value={ambientSettings.diffusionMultiplier}
                              onChange={(e) => handleAmbientHeatChange('diffusionMultiplier', parseFloat(e.target.value))}
                              className="sim-slider"
                              onClick={(e) => e.stopPropagation()}
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    <div className="settings-group collapsible">
                      <button
                        type="button"
                        className={`settings-group-toggle ${showDecaySettings ? 'expanded' : ''}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          setShowDecaySettings(prev => !prev);
                        }}
                      >
                        <FontAwesomeIcon icon={showDecaySettings ? faChevronDown : faChevronRight} />
                        <span>Decay</span>
                      </button>
                      {showDecaySettings && (
                        <div className="settings-group-content">
                          <div className="sim-setting-group">
                            <div className="sim-setting-row">
                              <span className="sim-setting-label">Decay Blend</span>
                              <span className="sim-setting-value">{ambientSettings.equilibriumStrength.toFixed(2)}</span>
                            </div>
                            <input
                              type="range"
                              min="0"
                              max="1"
                              step="0.01"
                              value={ambientSettings.equilibriumStrength}
                              onChange={(e) => handleAmbientHeatChange('equilibriumStrength', parseFloat(e.target.value))}
                              className="sim-slider"
                              onClick={(e) => e.stopPropagation()}
                            />
                          </div>

                          <div className="sim-setting-group">
                            <div className="sim-setting-row">
                              <span className="sim-setting-label">Decay Target</span>
                              <span className="sim-setting-value">{equilibriumTargetCelsius.toFixed(0)}°C</span>
                            </div>
                            <input
                              type="range"
                              min="-100"
                              max="500"
                              step="5"
                              value={equilibriumTargetCelsius}
                              onChange={(e) => handleEquilibriumTemperatureChange(parseFloat(e.target.value))}
                              className="sim-slider"
                              onClick={(e) => e.stopPropagation()}
                            />
                          </div>

                          <div className="sim-setting-group">
                            <div className="sim-setting-row">
                              <span className="sim-setting-label">Max Decay Δ</span>
                              <span className="sim-setting-value">{equilibriumMaxDeltaCelsius.toFixed(1)}°C</span>
                            </div>
                            <input
                              type="range"
                              min="0"
                              max="200"
                              step="0.5"
                              value={equilibriumMaxDeltaCelsius}
                              onChange={(e) => handleAmbientHeatChange('equilibriumMaxDelta', parseFloat(e.target.value))}
                              className="sim-slider"
                              onClick={(e) => e.stopPropagation()}
                            />
                          </div>

                          <div className="sim-setting-group">
                            <div className="sim-setting-row">
                              <span className="sim-setting-label">Decay Interval</span>
                              <span className="sim-setting-value">{equilibriumInterval}f</span>
                            </div>
                            <input
                              type="range"
                              min="1"
                              max="120"
                              step="1"
                              value={equilibriumInterval}
                              onChange={(e) => handleEquilibriumIntervalChange(parseFloat(e.target.value))}
                              className="sim-slider"
                              onClick={(e) => e.stopPropagation()}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
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
