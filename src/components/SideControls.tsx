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
  faChevronDown,
  faFolderOpen,
  faFloppyDisk
} from '@fortawesome/free-solid-svg-icons';
import { ParticleType } from '../world/ParticleTypes';
import { ParticleTypeRanges } from '../world/ParticleTypeConstants';
import { WorldInitType } from '../world/WorldGeneration';
import { useState, useRef, useEffect } from 'react';
import { SimulationControls } from './SimulationControls';
import type { SimulationConfig } from '../types/SimulationConfig';
import { loadLevelIndex } from '../utils/LevelLoader';
import type { Level } from '../types/Level';

export type ToolMode = 'add' | 'remove' | 'fill';

interface SideControlsProps {
  particleTypes: { name: string; value: number }[];
  selectedParticle: ParticleType;
  onParticleSelect: (particle: ParticleType) => void;
  onResetWorld: () => void;
  simulationConfig: SimulationConfig;
  onSimulationConfigChange: (config: SimulationConfig) => void;
  worldInitType?: WorldInitType;
  onWorldInitTypeChange?: (initType: WorldInitType) => void;
  onLoadLevel: (levelId: string) => Promise<void>;
  onSaveLevel: (levelName: string, description?: string) => void;
  toolMode: ToolMode;
  onToolModeChange: (mode: ToolMode) => void;
  brushSize: number;
  onBrushSizeChange: (size: number) => void;
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

export function SideControls({
  particleTypes,
  selectedParticle,
  onParticleSelect,
  onResetWorld,
  simulationConfig,
  onSimulationConfigChange,
  worldInitType = WorldInitType.HOURGLASS,
  onWorldInitTypeChange,
  onLoadLevel,
  onSaveLevel,
  toolMode,
  onToolModeChange,
  brushSize,
  onBrushSizeChange,
}: SideControlsProps) {
  const [showDropdown, setShowDropdown] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [availableLevels, setAvailableLevels] = useState<Level[]>([]);
  const [selectedLevel, setSelectedLevel] = useState<string>('');
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveLevelName, setSaveLevelName] = useState('');
  const [saveLevelDescription, setSaveLevelDescription] = useState('');

  // Load available levels on mount
  useEffect(() => {
    loadLevelIndex()
      .then((index) => setAvailableLevels(index.levels))
      .catch((err) => console.error('Failed to load level index:', err));
  }, []);

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

  const handleLoadLevelClick = () => {
    if (selectedLevel) {
      onLoadLevel(selectedLevel);
    }
  };

  const handleSaveLevelClick = () => {
    if (saveLevelName.trim()) {
      onSaveLevel(saveLevelName.trim(), saveLevelDescription.trim() || undefined);
      setShowSaveDialog(false);
      setSaveLevelName('');
      setSaveLevelDescription('');
    }
  };

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

  // Prevent clicks on UI from propagating to canvas
  const handleMouseDown = (e: React.MouseEvent) => {
    e.stopPropagation();
  };

  return (
    <div className="top-bar" onMouseDown={handleMouseDown}>
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
                onClick={() => { onToolModeChange('add'); }}
              >
                <FontAwesomeIcon icon={faPlus} />
                <span>Add Material</span>
              </button>
              <button
                className={`mode-button ${toolMode === 'remove' ? 'active' : ''}`}
                onClick={() => { onToolModeChange('remove'); }}
              >
                <FontAwesomeIcon icon={faEraser} />
                <span>Remove/Erase</span>
              </button>
              <button
                className={`mode-button ${toolMode === 'fill' ? 'active' : ''}`}
                onClick={() => { onToolModeChange('fill'); }}
              >
                <FontAwesomeIcon icon={faFillDrip} />
                <span>Fill Area</span>
              </button>
            </div>

            <div className="dropdown-divider"></div>

            <div className="dropdown-section">
              <div className="dropdown-title">Brush Size</div>
              <div className="brush-size-options">
                <select
                  className="brush-size-select"
                  value={brushSize}
                  onChange={(e) => onBrushSizeChange(Number(e.target.value))}
                >
                  <option value="1">Small (1px)</option>
                  <option value="3">Medium (3px)</option>
                  <option value="5">Large (5px)</option>
                  <option value="10">XLarge (10px)</option>
                </select>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Current Selection Display */}
      <div className="current-selection">
        {toolMode === 'remove' ? (
          <FontAwesomeIcon icon={faEraser} />
        ) : (
          <FontAwesomeIcon icon={particleIcons[selectedParticleName] || faCubes} />
        )}
        <span>{toolMode === 'remove' ? 'Erase' : selectedParticleName}</span>
        <span className="brush-size-indicator">{brushSize}px</span>
      </div>

      <div className="divider"></div>

      {/* Simulation Pipeline Controls */}
      <SimulationControls
        config={simulationConfig}
        onConfigChange={onSimulationConfigChange}
      />

      <div className="divider"></div>

      {/* Level Controls */}
      <div className="simulation-controls">
        <label className="control-label">
          Level:
          <select
            value={selectedLevel}
            onChange={(e) => setSelectedLevel(e.target.value)}
            className="mode-select"
          >
            <option value="">-- Select Level --</option>
            {availableLevels.map((level) => (
              <option key={level.id} value={level.id}>
                {level.name}
              </option>
            ))}
          </select>
        </label>
        <button
          onClick={handleLoadLevelClick}
          className="icon-button"
          title="Load Level"
          disabled={!selectedLevel}
        >
          <FontAwesomeIcon icon={faFolderOpen} />
        </button>
        <button
          onClick={() => setShowSaveDialog(true)}
          className="icon-button"
          title="Save Level"
        >
          <FontAwesomeIcon icon={faFloppyDisk} />
        </button>
      </div>

      {showSaveDialog && (
        <div className="save-dialog-overlay" onClick={() => setShowSaveDialog(false)}>
          <div className="save-dialog" onClick={(e) => e.stopPropagation()}>
            <h3>Save Level</h3>
            <label>
              Name:
              <input
                type="text"
                value={saveLevelName}
                onChange={(e) => setSaveLevelName(e.target.value)}
                placeholder="My Level"
                autoFocus
              />
            </label>
            <label>
              Description (optional):
              <input
                type="text"
                value={saveLevelDescription}
                onChange={(e) => setSaveLevelDescription(e.target.value)}
                placeholder="A cool level"
              />
            </label>
            <div className="dialog-buttons">
              <button onClick={handleSaveLevelClick} disabled={!saveLevelName.trim()}>
                Save
              </button>
              <button onClick={() => setShowSaveDialog(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      <div className="divider"></div>

      {/* World Init Controls */}
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
      </div>
    </div>
  );
}
