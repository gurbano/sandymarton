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
  faPaintBrush,
  faEraser,
  faFillDrip,
  faChevronDown,
  faChevronRight,
  faFolderOpen,
  faFloppyDisk,
  faGear,
  faLayerGroup,
} from '@fortawesome/free-solid-svg-icons';
import { ParticleType } from '../world/ParticleTypes';
import { ParticleTypeRanges } from '../world/ParticleTypeConstants';
import { WorldInitType } from '../world/WorldGeneration';
import { useState, useEffect } from 'react';
import type { RenderConfig } from '../types/RenderConfig';
import { loadLevelIndex } from '../utils/LevelLoader';
import type { Level } from '../types/Level';

export type ToolMode = 'add' | 'remove' | 'fill';

interface SideControlsProps {
  particleTypes: { name: string; value: number }[];
  selectedParticle: ParticleType;
  onParticleSelect: (particle: ParticleType) => void;
  onResetWorld: () => void;
  renderConfig: RenderConfig;
  onRenderConfigChange: (config: RenderConfig) => void;
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
  renderConfig,
  onRenderConfigChange,
  worldInitType = WorldInitType.HOURGLASS,
  onWorldInitTypeChange,
  onLoadLevel,
  onSaveLevel,
  toolMode,
  onToolModeChange,
  brushSize,
  onBrushSizeChange,
}: SideControlsProps) {
  const [availableLevels, setAvailableLevels] = useState<Level[]>([]);
  const [selectedLevel, setSelectedLevel] = useState<string>('');
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveLevelName, setSaveLevelName] = useState('');
  const [saveLevelDescription, setSaveLevelDescription] = useState('');

  // Collapsible sections - Settings expanded by default, Levels collapsed
  const [showSettings, setShowSettings] = useState(true);
  const [showLevels, setShowLevels] = useState(false);

  // Load available levels on mount
  useEffect(() => {
    loadLevelIndex()
      .then((index) => setAvailableLevels(index.levels))
      .catch((err) => console.error('Failed to load level index:', err));
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

  const handleOverlayToggle = (index: number) => {
    const newOverlays = [...renderConfig.overlays];
    newOverlays[index] = { ...newOverlays[index], enabled: !newOverlays[index].enabled };
    onRenderConfigChange({ ...renderConfig, overlays: newOverlays });
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

  // Show materials panel when Draw or Fill is active
  const shouldShowMaterials = toolMode === 'add' || toolMode === 'fill';

  // Render material grid (3 items per row)
  const renderMaterialGrid = (materials: typeof particleTypes) => (
    <div className="material-grid-3col">
      {materials.map(({ name, value }) => (
        <button
          key={value}
          className={`material-btn-compact ${selectedParticle === value ? 'selected' : ''}`}
          onClick={() => onParticleSelect(value)}
          title={name}
        >
          <FontAwesomeIcon icon={particleIcons[name] || faCubes} />
          <span>{name}</span>
        </button>
      ))}
    </div>
  );

  return (
    <>
      {/* LEFT TOOLBAR - Tools & Materials */}
      <div className="toolbar-left" onMouseDown={handleMouseDown}>
        {/* Tool Buttons */}
        <div className="toolbar-section">
          <button
            className={`toolbar-btn ${toolMode === 'add' ? 'active' : ''}`}
            onClick={() => onToolModeChange('add')}
            title="Draw particles"
          >
            <FontAwesomeIcon icon={faPaintBrush} />
            <span>Draw</span>
          </button>
          <button
            className={`toolbar-btn ${toolMode === 'remove' ? 'active' : ''}`}
            onClick={() => onToolModeChange('remove')}
            title="Erase particles"
          >
            <FontAwesomeIcon icon={faEraser} />
            <span>Erase</span>
          </button>
          <button
            className={`toolbar-btn ${toolMode === 'fill' ? 'active' : ''}`}
            onClick={() => onToolModeChange('fill')}
            title="Fill area"
          >
            <FontAwesomeIcon icon={faFillDrip} />
            <span>Fill</span>
          </button>
        </div>

        {/* Brush Size */}
        <div className="toolbar-section">
          <div className="brush-control-compact">
            <span className="brush-label">{brushSize}px</span>
            <input
              type="range"
              min="1"
              max="20"
              value={brushSize}
              onChange={(e) => onBrushSizeChange(Number(e.target.value))}
              className="brush-slider-vertical"
            />
          </div>
        </div>

        {/* Current Material */}
        {shouldShowMaterials && (
          <div className="toolbar-section current-material-compact">
            <FontAwesomeIcon icon={particleIcons[selectedParticleName] || faCubes} />
            <span>{selectedParticleName}</span>
          </div>
        )}

        {/* Materials - shown when Draw/Fill active */}
        {shouldShowMaterials && (
          <div className="toolbar-section materials-section">
            {particleCategories.static.length > 0 && (
              <div className="material-category-compact">
                <div className="category-label-compact">Static</div>
                {renderMaterialGrid(particleCategories.static)}
              </div>
            )}

            {particleCategories.solid.length > 0 && (
              <div className="material-category-compact">
                <div className="category-label-compact">Solids</div>
                {renderMaterialGrid(particleCategories.solid)}
              </div>
            )}

            {particleCategories.liquid.length > 0 && (
              <div className="material-category-compact">
                <div className="category-label-compact">Liquids</div>
                {renderMaterialGrid(particleCategories.liquid)}
              </div>
            )}

            {particleCategories.gas.length > 0 && (
              <div className="material-category-compact">
                <div className="category-label-compact">Gases</div>
                {renderMaterialGrid(particleCategories.gas)}
              </div>
            )}
          </div>
        )}
      </div>

      {/* RIGHT SIDEBAR - Settings & Levels */}
      <div className="sidebar-right" onMouseDown={handleMouseDown}>
        {/* Settings Section - Expanded by default */}
        <div className="sidebar-section">
          <div
            className="section-header"
            onClick={() => setShowSettings(!showSettings)}
          >
            <FontAwesomeIcon icon={showSettings ? faChevronDown : faChevronRight} />
            <FontAwesomeIcon icon={faGear} className="section-icon" />
            <span>Settings</span>
          </div>

          {showSettings && (
            <div className="settings-panel">
              {/* Overlay Controls */}
              <div className="settings-group">
                <div className="settings-group-label">Overlays</div>
                <div className="overlay-buttons">
                  {renderConfig.overlays.map((overlay, index) => (
                    <button
                      key={overlay.type}
                      className={`overlay-btn ${overlay.enabled ? 'active' : ''}`}
                      onClick={() => handleOverlayToggle(index)}
                      title={overlay.name}
                    >
                      <FontAwesomeIcon icon={overlay.type === 'heat' ? faFire : faCloud} />
                      <span>{overlay.name}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* World Init Type */}
              <div className="settings-group">
                <div className="settings-group-label">World Type</div>
                <select
                  value={worldInitType}
                  onChange={(e) => onWorldInitTypeChange?.(e.target.value as WorldInitType)}
                  className="settings-select"
                >
                  <option value={WorldInitType.HOURGLASS}>Hourglass</option>
                  <option value={WorldInitType.PLATFORMS}>Platforms</option>
                  <option value={WorldInitType.AXIS}>Axis</option>
                  <option value={WorldInitType.EMPTY}>Empty</option>
                </select>
              </div>

              {/* Reset Button */}
              <button onClick={onResetWorld} className="reset-btn">
                <FontAwesomeIcon icon={faRotateRight} />
                <span>Reset World</span>
              </button>
            </div>
          )}
        </div>

        <div className="sidebar-divider"></div>

        {/* Levels Section - Collapsed by default */}
        <div className="sidebar-section">
          <div
            className="section-header"
            onClick={() => setShowLevels(!showLevels)}
          >
            <FontAwesomeIcon icon={showLevels ? faChevronDown : faChevronRight} />
            <FontAwesomeIcon icon={faLayerGroup} className="section-icon" />
            <span>Levels</span>
          </div>

          {showLevels && (
            <div className="levels-panel">
              <select
                value={selectedLevel}
                onChange={(e) => setSelectedLevel(e.target.value)}
                className="settings-select"
              >
                <option value="">Select level...</option>
                {availableLevels.map((level) => (
                  <option key={level.id} value={level.id}>
                    {level.name}
                  </option>
                ))}
              </select>

              <div className="level-buttons">
                <button
                  onClick={handleLoadLevelClick}
                  className="level-btn"
                  disabled={!selectedLevel}
                >
                  <FontAwesomeIcon icon={faFolderOpen} />
                  <span>Load</span>
                </button>
                <button
                  onClick={() => setShowSaveDialog(true)}
                  className="level-btn"
                >
                  <FontAwesomeIcon icon={faFloppyDisk} />
                  <span>Save</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Save Dialog */}
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
    </>
  );
}
