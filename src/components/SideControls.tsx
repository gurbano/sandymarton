import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faRotateRight,
  faMountain,
  faSeedling,
  faCubes,
  faDroplet,
  faFire,
  faCloud,
  faSmog,
  faFlask,
  faBiohazard,
  faPlus,
  faEraser,
  faFillDrip,
  faChevronDown
} from '@fortawesome/free-solid-svg-icons';
import { ParticleType } from '../world/ParticleTypes';
import { ParticleTypeRanges } from '../world/ParticleTypeConstants';
import { WorldInitType } from '../world/WorldGeneration';
import { useState, useRef, useEffect } from 'react';

interface SideControlsProps {
  particleTypes: { name: string; value: number }[];
  selectedParticle: ParticleType;
  onParticleSelect: (particle: ParticleType) => void;
  onResetWorld: () => void;
  simulationMode?: 'gpu' | 'margolus' | 'margolus-gpu' | 'hybrid';
  onSimulationModeChange?: (mode: 'gpu' | 'margolus' | 'margolus-gpu' | 'hybrid') => void;
  toppleProbability?: number;
  onToppleProbabilityChange?: (prob: number) => void;
  worldInitType?: WorldInitType;
  onWorldInitTypeChange?: (initType: WorldInitType) => void;
}

const particleIcons: Record<string, any> = {
  SAND: faMountain,
  DIRT: faSeedling,
  STONE: faCubes,
  GRAVEL: faCubes,
  WATER: faDroplet,
  LAVA: faFire,
  SLIME: faFlask,
  ACID: faBiohazard,
  STEAM: faCloud,
  SMOKE: faSmog,
};

type ToolMode = 'add' | 'remove' | 'fill';

export function SideControls({
  particleTypes,
  selectedParticle,
  onParticleSelect,
  onResetWorld,
  simulationMode = 'margolus-gpu',
  onSimulationModeChange,
  toppleProbability = 0.75,
  onToppleProbabilityChange,
  worldInitType = WorldInitType.HOURGLASS,
  onWorldInitTypeChange,
}: SideControlsProps) {
  const [toolMode, setToolMode] = useState<ToolMode>('add');
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

  const getToolIcon = () => {
    switch (toolMode) {
      case 'add': return faPlus;
      case 'remove': return faEraser;
      case 'fill': return faFillDrip;
    }
  };

  const getToolLabel = () => {
    switch (toolMode) {
      case 'add': return 'Add';
      case 'remove': return 'Remove';
      case 'fill': return 'Fill';
    }
  };

  const selectedParticleName = particleTypes.find(p => p.value === selectedParticle)?.name || 'SAND';

  // Categorize particles by type
  const categorizeParticles = () => {
    const categories = {
      static: [] as typeof particleTypes,
      solid: [] as typeof particleTypes,
      liquid: [] as typeof particleTypes,
      gas: [] as typeof particleTypes,
    };

    particleTypes.forEach(particle => {
      if (particle.value >= ParticleTypeRanges.STATIC_MIN && particle.value <= ParticleTypeRanges.STATIC_MAX) {
        categories.static.push(particle);
      } else if (particle.value >= ParticleTypeRanges.SOLID_MIN && particle.value <= ParticleTypeRanges.SOLID_MAX) {
        categories.solid.push(particle);
      } else if (particle.value >= ParticleTypeRanges.LIQUID_MIN && particle.value <= ParticleTypeRanges.LIQUID_MAX) {
        categories.liquid.push(particle);
      } else if (particle.value >= ParticleTypeRanges.GAS_MIN && particle.value <= ParticleTypeRanges.GAS_MAX) {
        categories.gas.push(particle);
      }
    });

    return categories;
  };

  const particleCategories = categorizeParticles();

  return (
    <div className="top-bar">
      <button onClick={onResetWorld} className="icon-button" title="Reset World">
        <FontAwesomeIcon icon={faRotateRight} />
      </button>

      <div className="divider"></div>

      {/* Tool Mode Dropdown */}
      <div className="dropdown-container" ref={dropdownRef}>
        <button
          className={`icon-button tool-button ${showDropdown ? 'active' : ''}`}
          onClick={() => setShowDropdown(!showDropdown)}
          title={getToolLabel()}
        >
          <FontAwesomeIcon icon={getToolIcon()} />
          <FontAwesomeIcon icon={faChevronDown} className="dropdown-arrow" />
        </button>

        {showDropdown && (
          <div className="dropdown-menu">
            <div className="dropdown-section">
              <div className="dropdown-title">{getToolLabel()}</div>

              {toolMode === 'add' && (
                <div className="particle-categories">
                  {particleCategories.static.length > 0 && (
                    <div className="particle-category">
                      <div className="category-label">Static</div>
                      <div className="particle-grid">
                        {particleCategories.static.map(({ name, value }) => (
                          <button
                            key={value}
                            className={`particle-button ${selectedParticle === value ? 'selected' : ''}`}
                            onClick={() => {
                              onParticleSelect(value);
                              setShowDropdown(false);
                            }}
                            title={name}
                          >
                            <FontAwesomeIcon icon={particleIcons[name] || faCubes} />
                            <span className="particle-name">{name}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {particleCategories.solid.length > 0 && (
                    <div className="particle-category">
                      <div className="category-label">Solids</div>
                      <div className="particle-grid">
                        {particleCategories.solid.map(({ name, value }) => (
                          <button
                            key={value}
                            className={`particle-button ${selectedParticle === value ? 'selected' : ''}`}
                            onClick={() => {
                              onParticleSelect(value);
                              setShowDropdown(false);
                            }}
                            title={name}
                          >
                            <FontAwesomeIcon icon={particleIcons[name] || faCubes} />
                            <span className="particle-name">{name}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {particleCategories.liquid.length > 0 && (
                    <div className="particle-category">
                      <div className="category-label">Liquids</div>
                      <div className="particle-grid">
                        {particleCategories.liquid.map(({ name, value }) => (
                          <button
                            key={value}
                            className={`particle-button ${selectedParticle === value ? 'selected' : ''}`}
                            onClick={() => {
                              onParticleSelect(value);
                              setShowDropdown(false);
                            }}
                            title={name}
                          >
                            <FontAwesomeIcon icon={particleIcons[name] || faCubes} />
                            <span className="particle-name">{name}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}

                  {particleCategories.gas.length > 0 && (
                    <div className="particle-category">
                      <div className="category-label">Gases</div>
                      <div className="particle-grid">
                        {particleCategories.gas.map(({ name, value }) => (
                          <button
                            key={value}
                            className={`particle-button ${selectedParticle === value ? 'selected' : ''}`}
                            onClick={() => {
                              onParticleSelect(value);
                              setShowDropdown(false);
                            }}
                            title={name}
                          >
                            <FontAwesomeIcon icon={particleIcons[name] || faCubes} />
                            <span className="particle-name">{name}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {toolMode === 'remove' && (
                <div className="brush-size-options">
                  <div className="option-row">
                    <span>Brush Size:</span>
                    <select className="brush-size-select">
                      <option value="1">Small (1px)</option>
                      <option value="3">Medium (3px)</option>
                      <option value="5">Large (5px)</option>
                      <option value="10">XLarge (10px)</option>
                    </select>
                  </div>
                </div>
              )}

              {toolMode === 'fill' && (
                <div className="particle-grid">
                  {particleTypes.map(({ name, value }) => (
                    <button
                      key={value}
                      className={`particle-button ${selectedParticle === value ? 'selected' : ''}`}
                      onClick={() => {
                        onParticleSelect(value);
                        setShowDropdown(false);
                      }}
                      title={name}
                    >
                      <FontAwesomeIcon icon={particleIcons[name] || faCubes} />
                      <span className="particle-name">{name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="dropdown-divider"></div>

            <div className="dropdown-section">
              <div className="dropdown-title">Tool Mode</div>
              <button
                className={`mode-button ${toolMode === 'add' ? 'active' : ''}`}
                onClick={() => { setToolMode('add'); }}
              >
                <FontAwesomeIcon icon={faPlus} />
                <span>Add Material</span>
              </button>
              <button
                className={`mode-button ${toolMode === 'remove' ? 'active' : ''}`}
                onClick={() => { setToolMode('remove'); }}
              >
                <FontAwesomeIcon icon={faEraser} />
                <span>Remove/Erase</span>
              </button>
              <button
                className={`mode-button ${toolMode === 'fill' ? 'active' : ''}`}
                onClick={() => { setToolMode('fill'); }}
              >
                <FontAwesomeIcon icon={faFillDrip} />
                <span>Fill Area</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Current Selection Display */}
      <div className="current-selection">
        <FontAwesomeIcon icon={particleIcons[selectedParticleName] || faCubes} />
        <span>{selectedParticleName}</span>
      </div>

      <div className="divider"></div>

      {/* Simulation Mode Controls */}
      <div className="simulation-controls">
        <label className="control-label">
          World:
          <select
            value={worldInitType}
            onChange={(e) => onWorldInitTypeChange?.(e.target.value as WorldInitType)}
            className="mode-select"
          >
            <option value={WorldInitType.HOURGLASS}>Hourglass</option>
            <option value={WorldInitType.PLATFORMS}>Platforms</option>
            <option value={WorldInitType.AXIS}>Axis</option>
            <option value={WorldInitType.EMPTY}>Empty</option>
          </select>
        </label>

        <label className="control-label">
          Mode:
          <select
            value={simulationMode}
            onChange={(e) => onSimulationModeChange?.(e.target.value as 'gpu' | 'margolus' | 'margolus-gpu' | 'hybrid')}
            className="mode-select"
          >
            <option value="margolus-gpu">Margolus CA (GPU)</option>
            <option value="margolus">Margolus CA (CPU)</option>
            <option value="gpu">GPU Physics</option>
            <option value="hybrid">Hybrid (GPU + Margolus)</option>
          </select>
        </label>

        {(simulationMode === 'margolus' || simulationMode === 'margolus-gpu' || simulationMode === 'hybrid') && (
          <label className="control-label">
            Friction (p={toppleProbability.toFixed(2)}):
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={toppleProbability}
              onChange={(e) => onToppleProbabilityChange?.(parseFloat(e.target.value))}
              className="probability-slider"
            />
          </label>
        )}
      </div>
    </div>
  );
}
