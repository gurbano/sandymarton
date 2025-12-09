import { useState, useRef, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faGear, faChevronDown, faChevronRight } from '@fortawesome/free-solid-svg-icons';
import type { SimulationConfig, SimulationStep, AmbientHeatSettings } from '../types/SimulationConfig';
import { DEFAULT_AMBIENT_HEAT_SETTINGS, SimulationStepType } from '../types/SimulationConfig';

interface SimulationControlsProps {
  config: SimulationConfig;
  onConfigChange: (config: SimulationConfig) => void;
}

export function SimulationControls({ config, onConfigChange }: SimulationControlsProps) {
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [showAmbientSettings, setShowAmbientSettings] = useState(true);
  const [showEmissionSettings, setShowEmissionSettings] = useState(true);
  const [showDiffusionSettings, setShowDiffusionSettings] = useState(true);
  const [showDecaySettings, setShowDecaySettings] = useState(true);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleStepToggle = (index: number) => {
    const newSteps = [...config.steps];
    newSteps[index] = { ...newSteps[index], enabled: !newSteps[index].enabled };
    onConfigChange({ ...config, steps: newSteps });
  };

  const handlePassesChange = (index: number, passes: number) => {
    const newSteps = [...config.steps];
    newSteps[index] = { ...newSteps[index], passes: Math.max(0, passes) };
    onConfigChange({ ...config, steps: newSteps });
  };

  const handleFrictionAmplifierChange = (value: number) => {
    onConfigChange({ ...config, frictionAmplifier: value });
  };

  const ambientSettings: AmbientHeatSettings = config.ambientHeatSettings ?? DEFAULT_AMBIENT_HEAT_SETTINGS;

  const handleEquilibriumTemperatureChange = (celsiusValue: number) => {
    const kelvinValue = celsiusValue + 273.15;
    handleAmbientHeatSettingChange('equilibriumTemperature', kelvinValue);
  };

  const handleEquilibriumIntervalChange = (value: number) => {
    const interval = Math.max(1, Math.round(value));
    handleAmbientHeatSettingChange('equilibriumInterval', interval);
  };

  const equilibriumTargetCelsius = ambientSettings.equilibriumTemperature - 273.15;
  const equilibriumMaxDeltaCelsius = ambientSettings.equilibriumMaxDelta;
  const equilibriumInterval = Math.max(1, Math.round(ambientSettings.equilibriumInterval));

  const handleAmbientHeatSettingChange = (key: keyof AmbientHeatSettings, value: number) => {
    const current = config.ambientHeatSettings ?? { ...DEFAULT_AMBIENT_HEAT_SETTINGS };
    onConfigChange({
      ...config,
      ambientHeatSettings: {
        ...current,
        [key]: value,
      },
    });
  };

  // Get enabled steps count for display
  const enabledStepsCount = config.steps.filter(s => s.enabled).length;

  return (
    <div className="dropdown-container" ref={dropdownRef}>
      <button
        className={`icon-button tool-button ${showDropdown ? 'active' : ''}`}
        onClick={() => setShowDropdown(!showDropdown)}
        title="Simulation Pipeline"
      >
        <FontAwesomeIcon icon={faGear} />
        <span className="pipeline-badge">{enabledStepsCount}</span>
        <FontAwesomeIcon icon={faChevronDown} className="dropdown-arrow" />
      </button>

      {showDropdown && (
        <div className="dropdown-menu">
          <div className="dropdown-section">
            <div className="dropdown-title">Global Parameters</div>

            <div className="global-parameter">
              <label className="parameter-control">
                Friction Amplifier: {config.frictionAmplifier.toFixed(1)}x
                <input
                  type="range"
                  min="0"
                  max="10"
                  step="0.1"
                  value={config.frictionAmplifier}
                  onChange={(e) => handleFrictionAmplifierChange(parseFloat(e.target.value))}
                  className="passes-slider"
                />
              </label>
              <div className="parameter-description">
                Controls friction strength for solids and liquids
              </div>
            </div>

          </div>

          <div className="dropdown-section">
            <div className="dropdown-title">Simulation Pipeline</div>

            {config.steps.map((step: SimulationStep, index: number) => (
              <div key={step.type} className="pipeline-step">
                <label className="step-header">
                  <input
                    type="checkbox"
                    checked={step.enabled}
                    onChange={() => handleStepToggle(index)}
                  />
                  <span className="step-name">{step.name}</span>
                </label>

                {step.enabled && (
                  <div className="step-controls">
                    <label className="passes-control">
                      Passes: {step.passes}
                      <input
                        type="range"
                        min="0"
                        max="10"
                        step="1"
                        value={step.passes}
                        onChange={(e) => handlePassesChange(index, parseInt(e.target.value))}
                        className="passes-slider"
                      />
                    </label>

                    {step.type === SimulationStepType.HEAT_TRANSFER && (
                      <div className="ambient-step-settings">
                        <div className="settings-group collapsible">
                          <button
                            type="button"
                            className={`settings-group-toggle ${showAmbientSettings ? 'expanded' : ''}`}
                            onClick={() => setShowAmbientSettings(prev => !prev)}
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
                                    <div className="global-parameter">
                                      <label className="parameter-control">
                                        Emission Strength: {ambientSettings.emissionMultiplier.toFixed(1)}x
                                        <input
                                          type="range"
                                          min="0"
                                          max="5"
                                          step="0.1"
                                          value={ambientSettings.emissionMultiplier}
                                          onChange={(e) => handleAmbientHeatSettingChange('emissionMultiplier', parseFloat(e.target.value))}
                                          className="passes-slider"
                                        />
                                      </label>
                                      <div className="parameter-description">
                                        Controls how quickly particles feed heat into the ambient layer
                                      </div>
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
                                    <div className="global-parameter">
                                      <label className="parameter-control">
                                        Diffusion Strength: {ambientSettings.diffusionMultiplier.toFixed(2)}x
                                        <input
                                          type="range"
                                          min="0"
                                          max="2"
                                          step="0.05"
                                          value={ambientSettings.diffusionMultiplier}
                                          onChange={(e) => handleAmbientHeatSettingChange('diffusionMultiplier', parseFloat(e.target.value))}
                                          className="passes-slider"
                                        />
                                      </label>
                                      <div className="parameter-description">
                                        Adjusts how quickly ambient heat spreads through empty space
                                      </div>
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
                                    <div className="global-parameter">
                                      <label className="parameter-control">
                                        Decay Blend: {ambientSettings.equilibriumStrength.toFixed(2)}
                                        <input
                                          type="range"
                                          min="0"
                                          max="1"
                                          step="0.01"
                                          value={ambientSettings.equilibriumStrength}
                                          onChange={(e) => handleAmbientHeatSettingChange('equilibriumStrength', parseFloat(e.target.value))}
                                          className="passes-slider"
                                        />
                                      </label>
                                      <div className="parameter-description">
                                        Blend the ambient layer toward a baseline temperature (set to 0 to disable)
                                      </div>
                                    </div>

                                    <div className="global-parameter">
                                      <label className="parameter-control">
                                        Decay Target: {equilibriumTargetCelsius.toFixed(0)}°C
                                        <input
                                          type="range"
                                          min="-100"
                                          max="500"
                                          step="5"
                                          value={equilibriumTargetCelsius}
                                          onChange={(e) => handleEquilibriumTemperatureChange(parseFloat(e.target.value))}
                                          className="passes-slider"
                                        />
                                      </label>
                                      <div className="parameter-description">
                                        Temperature the ambient layer drifts toward when decay is active
                                      </div>
                                    </div>

                                    <div className="global-parameter">
                                      <label className="parameter-control">
                                        Max Decay Δ: {equilibriumMaxDeltaCelsius.toFixed(1)}°C
                                        <input
                                          type="range"
                                          min="0"
                                          max="200"
                                          step="0.5"
                                          value={equilibriumMaxDeltaCelsius}
                                          onChange={(e) => handleAmbientHeatSettingChange('equilibriumMaxDelta', parseFloat(e.target.value))}
                                          className="passes-slider"
                                        />
                                      </label>
                                      <div className="parameter-description">
                                        Limits how many degrees the ambient heat can change per update (0 removes the limit)
                                      </div>
                                    </div>

                                    <div className="global-parameter">
                                      <label className="parameter-control">
                                        Decay Interval: {equilibriumInterval}f
                                        <input
                                          type="range"
                                          min="1"
                                          max="120"
                                          step="1"
                                          value={equilibriumInterval}
                                          onChange={(e) => handleEquilibriumIntervalChange(parseFloat(e.target.value))}
                                          className="passes-slider"
                                        />
                                      </label>
                                      <div className="parameter-description">
                                        Apply the decay step only every N frames to slow the drift further
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
