import { useState, useRef, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faGear, faChevronDown } from '@fortawesome/free-solid-svg-icons';
import type { SimulationConfig, SimulationStep, AmbientHeatSettings } from '../types/SimulationConfig';
import { DEFAULT_AMBIENT_HEAT_SETTINGS } from '../types/SimulationConfig';

interface SimulationControlsProps {
  config: SimulationConfig;
  onConfigChange: (config: SimulationConfig) => void;
}

export function SimulationControls({ config, onConfigChange }: SimulationControlsProps) {
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

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

            <div className="global-parameter">
              <label className="parameter-control">
                Ambient Coupling: {ambientSettings.emissionMultiplier.toFixed(1)}x
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
                Scales how aggressively particles push heat into the ambient layer
              </div>
            </div>

            <div className="global-parameter">
              <label className="parameter-control">
                Ambient Diffusion: {ambientSettings.diffusionMultiplier.toFixed(2)}x
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
