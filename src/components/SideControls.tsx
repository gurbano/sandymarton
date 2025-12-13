import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core';
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
  faMagnifyingGlass,
  faPaintBrush,
  faEraser,
  faFillDrip,
  faChevronDown,
  faChevronRight,
  faFolderOpen,
  faFloppyDisk,
  faGear,
  faLayerGroup,
  faSnowflake,
  faIcicles,
  faOilCan,
  faWind,
  faTemperatureLow,
  faWandMagicSparkles,
  faBrush,
  faSun,
  faGem,
  faHammer,
  faFaucet,
  faCircleDown,
} from '@fortawesome/free-solid-svg-icons';
import { ParticleType } from '../world/ParticleTypes';
import { ParticleTypeRanges } from '../world/ParticleTypeConstants';
import { WorldInitType } from '../world/WorldGeneration';
import { useState, useEffect } from 'react';
import type { RenderConfig } from '../types/RenderConfig';
import { RenderEffectType } from '../types/RenderConfig';
import { loadLevelIndex } from '../utils/LevelLoader';
import type { Level } from '../types/Level';
import type { ToolMode } from '../hooks/useParticleDrawing';
import { BuildableType, BuildableDefinitions, getBuildablesByCategory } from '../buildables';
import type { SimulationConfig } from '../types/SimulationConfig';
const MIN_LEFT_WIDTH = 160;
const MAX_LEFT_WIDTH = 320;

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
  selectedBuildable: BuildableType;
  onBuildableSelect: (buildable: BuildableType) => void;
  simulationConfig: SimulationConfig;
  onSimulationConfigChange: (config: SimulationConfig) => void;
}

const particleIcons: Record<string, IconDefinition> = {
  STONE: faCubes,
  GLASS: faCubes,
  HEITE: faFire,
  SAND: faMountain,
  DIRT: faSeedling,
  GRAVEL: faCubes,
  BASALT: faMountain,
  OBSIDIAN: faGem,
  COPPER: faCubes,
  ITE: faSeedling,
  ICE: faSnowflake,
  OIL_SLUDGE: faOilCan,
  SLIME_CRYSTAL: faIcicles,
  ACID_CRYSTAL: faBiohazard,
  COOLANT_ICE: faSnowflake,
  NITROGEN_ICE: faIcicles,
  WATER: faDroplet,
  LAVA: faFire,
  SLIME: faFlask,
  ACID: faBiohazard,
  OIL: faOilCan,
  COOLANT: faTemperatureLow,
  LIQUID_NITROGEN: faTemperatureLow,
  STEAM: faCloud,
  SMOKE: faSmog,
  AIR: faWind,
  NITROGEN: faWind,
  OIL_VAPOR: faWind,
  SLIME_VAPOR: faCloud,
  ACID_VAPOR: faBiohazard,
  COOLANT_VAPOR: faWind,
};

const effectIcons: Record<RenderEffectType, IconDefinition> = {
  [RenderEffectType.EDGE_BLENDING]: faWandMagicSparkles,
  [RenderEffectType.MATERIAL_VARIATION]: faBrush,
  [RenderEffectType.GLOW]: faSun,
};

// Map buildable icons by name
const buildableIcons: Record<string, IconDefinition> = {
  faucet: faFaucet,
  'circle-down': faCircleDown,
  fire: faFire,
  snowflake: faSnowflake,
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
  selectedBuildable,
  onBuildableSelect,
  simulationConfig,
  onSimulationConfigChange,
}: SideControlsProps) {
  const [availableLevels, setAvailableLevels] = useState<Level[]>([]);
  const [selectedLevel, setSelectedLevel] = useState<string>('');
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saveLevelName, setSaveLevelName] = useState('');
  const [saveLevelDescription, setSaveLevelDescription] = useState('');
  const [leftToolbarWidth, setLeftToolbarWidth] = useState<number>(190);
  const [isResizingLeft, setIsResizingLeft] = useState(false);

  // Collapsible sections - Settings expanded by default, Levels collapsed
  const [showSettings, setShowSettings] = useState(true);
  const [showLevels, setShowLevels] = useState(false);
  const [showOverlayGroup, setShowOverlayGroup] = useState(true);
  const [showRendererEffectsGroup, setShowRendererEffectsGroup] = useState(false);
  const [showWorldTypeGroup, setShowWorldTypeGroup] = useState(false);
  const [showPhysicsGroup, setShowPhysicsGroup] = useState(false);

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

  const handleLeftResizeMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizingLeft(true);
  };

  useEffect(() => {
    if (!isResizingLeft) {
      return;
    }

    const handleMouseMove = (event: MouseEvent) => {
      const newWidth = Math.min(MAX_LEFT_WIDTH, Math.max(MIN_LEFT_WIDTH, event.clientX));
      setLeftToolbarWidth(newWidth);
    };

    const handleMouseUp = () => {
      setIsResizingLeft(false);
    };

    const body = document.body;
    const previousCursor = body.style.cursor;
    const previousUserSelect = body.style.userSelect;
    body.style.cursor = 'col-resize';
    body.style.userSelect = 'none';

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      body.style.cursor = previousCursor;
      body.style.userSelect = previousUserSelect;
    };
  }, [isResizingLeft]);

  // Show materials panel when Draw or Fill is active
  const shouldShowMaterials = toolMode === 'add' || toolMode === 'fill';
  // Show buildables panel when Build is active
  const shouldShowBuildables = toolMode === 'build';

  // Get buildables grouped by category
  const buildablesByCategory = getBuildablesByCategory();

  // Get selected buildable definition
  const selectedBuildableDef = BuildableDefinitions.find(b => b.type === selectedBuildable);

  const handleEffectToggle = (effectType: RenderEffectType) => {
    const updatedEffects = renderConfig.effects.map((effect) =>
      effect.type === effectType ? { ...effect, enabled: !effect.enabled } : effect,
    );

    onRenderConfigChange({ ...renderConfig, effects: updatedEffects });
  };

  const handleEdgeBlendChange = (value: number) => {
    onRenderConfigChange({
      ...renderConfig,
      edgeBlending: { ...renderConfig.edgeBlending, blendStrength: value },
    });
  };

  const handleNoiseScaleChange = (value: number) => {
    onRenderConfigChange({
      ...renderConfig,
      materialVariation: { ...renderConfig.materialVariation, noiseScale: value },
    });
  };

  const handleNoiseStrengthChange = (value: number) => {
    onRenderConfigChange({
      ...renderConfig,
      materialVariation: { ...renderConfig.materialVariation, noiseStrength: value },
    });
  };

  const handleGlowIntensityChange = (value: number) => {
    onRenderConfigChange({
      ...renderConfig,
      glow: { ...renderConfig.glow, intensity: value },
    });
  };

  const handleGlowRadiusChange = (value: number) => {
    onRenderConfigChange({
      ...renderConfig,
      glow: { ...renderConfig.glow, radius: value },
    });
  };

  // Physics config handlers
  const handlePhysicsEnabledToggle = () => {
    onSimulationConfigChange({
      ...simulationConfig,
      physics: { ...simulationConfig.physics, enabled: !simulationConfig.physics.enabled },
    });
  };

  const handlePhysicsGravityChange = (value: number) => {
    onSimulationConfigChange({
      ...simulationConfig,
      physics: { ...simulationConfig.physics, gravity: value },
    });
  };

  const handlePhysicsForceThresholdChange = (value: number) => {
    onSimulationConfigChange({
      ...simulationConfig,
      physics: { ...simulationConfig.physics, forceEjectionThreshold: value },
    });
  };

  const handlePhysicsSettleThresholdChange = (value: number) => {
    onSimulationConfigChange({
      ...simulationConfig,
      physics: { ...simulationConfig.physics, settleThreshold: value },
    });
  };

  const handlePhysicsParticleRadiusChange = (value: number) => {
    onSimulationConfigChange({
      ...simulationConfig,
      physics: { ...simulationConfig.physics, particleRadius: value },
    });
  };

  const handlePhysicsRestitutionChange = (value: number) => {
    onSimulationConfigChange({
      ...simulationConfig,
      physics: { ...simulationConfig.physics, particleRestitution: value },
    });
  };

  const handleRigidBodyForceMultiplierChange = (value: number) => {
    onSimulationConfigChange({
      ...simulationConfig,
      physics: { ...simulationConfig.physics, rigidBodyForceMultiplier: value },
    });
  };

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
      <div
        className="toolbar-left-container"
        style={{ width: `${leftToolbarWidth}px` }}
      >
        <div className="toolbar-left" onMouseDown={handleMouseDown}>
          {/* Tool Buttons */}
          <div className="toolbar-section">
          <button
            className={`toolbar-btn ${toolMode === 'inspect' ? 'active' : ''}`}
            onClick={() => onToolModeChange('inspect')}
            title="Inspect particles"
          >
            <FontAwesomeIcon icon={faMagnifyingGlass} />
            <span>Inspect</span>
          </button>
          <button
            className={`toolbar-btn ${toolMode === 'add' ? 'active' : ''}`}
            onClick={() => onToolModeChange('add')}
            title="Draw particles"
          >
            <FontAwesomeIcon icon={faPaintBrush} />
            <span>Draw</span>
          </button>
          <button
            className={`toolbar-btn ${toolMode === 'build' ? 'active' : ''}`}
            onClick={() => onToolModeChange('build')}
            title="Place buildables"
          >
            <FontAwesomeIcon icon={faHammer} />
            <span>Build</span>
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

        {/* Current Buildable - shown when Build active */}
        {shouldShowBuildables && selectedBuildableDef && (
          <div className="toolbar-section current-material-compact">
            <FontAwesomeIcon icon={buildableIcons[selectedBuildableDef.icon] || faHammer} />
            <span>{selectedBuildableDef.name}</span>
          </div>
        )}

        {/* Buildables - shown when Build active */}
        {shouldShowBuildables && (
          <div className="toolbar-section materials-section">
            {Array.from(buildablesByCategory.entries()).map(([category, buildables]) => (
              <div key={category} className="material-category-compact">
                <div className="category-label-compact">{category}</div>
                <div className="material-grid-3col">
                  {buildables.map((buildable) => (
                    <button
                      key={buildable.type}
                      className={`material-btn-compact ${selectedBuildable === buildable.type ? 'selected' : ''}`}
                      onClick={() => onBuildableSelect(buildable.type)}
                      title={buildable.description}
                    >
                      <FontAwesomeIcon icon={buildableIcons[buildable.icon] || faHammer} />
                      <span>{buildable.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        </div>
        <div
          className={`toolbar-resizer ${isResizingLeft ? 'active' : ''}`}
          onMouseDown={handleLeftResizeMouseDown}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize tool sidebar"
        />
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
              {/* Overlay Controls */}
              <div className="settings-group collapsible">
                <button
                  type="button"
                  className={`settings-group-toggle ${showOverlayGroup ? 'expanded' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowOverlayGroup(prev => !prev);
                  }}
                >
                  <FontAwesomeIcon icon={showOverlayGroup ? faChevronDown : faChevronRight} />
                  <span>Overlays</span>
                </button>
                {showOverlayGroup && (
                  <div className="settings-group-content">
                    <div className="overlay-buttons">
                      {renderConfig.overlays.map((overlay, index) => (
                        <button
                          key={overlay.type}
                          className={`overlay-btn ${overlay.enabled ? 'active' : ''}`}
                          onClick={() => handleOverlayToggle(index)}
                          title={overlay.name}
                          type="button"
                        >
                          <FontAwesomeIcon icon={overlay.type === 'heat' ? faFire : faCloud} />
                          <span>{overlay.name}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Renderer Effects */}
              <div className="settings-group collapsible">
                <button
                  type="button"
                  className={`settings-group-toggle ${showRendererEffectsGroup ? 'expanded' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowRendererEffectsGroup(prev => !prev);
                  }}
                >
                  <FontAwesomeIcon icon={showRendererEffectsGroup ? faChevronDown : faChevronRight} />
                  <span>Renderer Effects</span>
                </button>
                {showRendererEffectsGroup && (
                  <div className="settings-group-content">
                    <div className="effect-cards">
                      {renderConfig.effects.map((effect) => (
                        <div key={effect.type} className="effect-card">
                          <button
                            className={`effect-toggle ${effect.enabled ? 'active' : ''}`}
                            onClick={() => handleEffectToggle(effect.type)}
                            type="button"
                          >
                            <FontAwesomeIcon icon={effectIcons[effect.type]} />
                            <div className="effect-details">
                              <span className="effect-name">{effect.name}</span>
                              <span className="effect-description">{effect.description}</span>
                            </div>
                            <span className="effect-status">{effect.enabled ? 'On' : 'Off'}</span>
                          </button>

                          {effect.type === RenderEffectType.EDGE_BLENDING && (
                            <div className="effect-controls">
                              <label className="effect-control">
                                <div className="effect-control-header">
                                  <span>Blend Strength</span>
                                  <span className="effect-value">
                                    {renderConfig.edgeBlending.blendStrength.toFixed(2)}
                                  </span>
                                </div>
                                <input
                                  type="range"
                                  min="0"
                                  max="1"
                                  step="0.05"
                                  value={renderConfig.edgeBlending.blendStrength}
                                  onChange={(e) => handleEdgeBlendChange(parseFloat(e.target.value))}
                                  className="passes-slider"
                                  disabled={!effect.enabled}
                                />
                              </label>
                            </div>
                          )}

                          {effect.type === RenderEffectType.MATERIAL_VARIATION && (
                            <div className="effect-controls">
                              <label className="effect-control">
                                <div className="effect-control-header">
                                  <span>Noise Scale</span>
                                  <span className="effect-value">
                                    {renderConfig.materialVariation.noiseScale.toFixed(1)}
                                  </span>
                                </div>
                                <input
                                  type="range"
                                  min="1"
                                  max="10"
                                  step="0.5"
                                  value={renderConfig.materialVariation.noiseScale}
                                  onChange={(e) => handleNoiseScaleChange(parseFloat(e.target.value))}
                                  className="passes-slider"
                                  disabled={!effect.enabled}
                                />
                              </label>
                              <label className="effect-control">
                                <div className="effect-control-header">
                                  <span>Noise Strength</span>
                                  <span className="effect-value">
                                    {renderConfig.materialVariation.noiseStrength.toFixed(2)}
                                  </span>
                                </div>
                                <input
                                  type="range"
                                  min="0"
                                  max="1"
                                  step="0.05"
                                  value={renderConfig.materialVariation.noiseStrength}
                                  onChange={(e) =>
                                    handleNoiseStrengthChange(parseFloat(e.target.value))
                                  }
                                  className="passes-slider"
                                  disabled={!effect.enabled}
                                />
                              </label>
                            </div>
                          )}

                          {effect.type === RenderEffectType.GLOW && (
                            <div className="effect-controls">
                              <label className="effect-control">
                                <div className="effect-control-header">
                                  <span>Glow Intensity</span>
                                  <span className="effect-value">
                                    {renderConfig.glow.intensity.toFixed(2)}
                                  </span>
                                </div>
                                <input
                                  type="range"
                                  min="0"
                                  max="2"
                                  step="0.05"
                                  value={renderConfig.glow.intensity}
                                  onChange={(e) => handleGlowIntensityChange(parseFloat(e.target.value))}
                                  className="passes-slider"
                                  disabled={!effect.enabled}
                                />
                              </label>
                              <label className="effect-control">
                                <div className="effect-control-header">
                                  <span>Glow Radius</span>
                                  <span className="effect-value">
                                    {renderConfig.glow.radius.toFixed(1)}
                                  </span>
                                </div>
                                <input
                                  type="range"
                                  min="1"
                                  max="4"
                                  step="0.1"
                                  value={renderConfig.glow.radius}
                                  onChange={(e) => handleGlowRadiusChange(parseFloat(e.target.value))}
                                  className="passes-slider"
                                  disabled={!effect.enabled}
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

              {/* World Init Type */}
              <div className="settings-group collapsible">
                <button
                  type="button"
                  className={`settings-group-toggle ${showWorldTypeGroup ? 'expanded' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowWorldTypeGroup(prev => !prev);
                  }}
                >
                  <FontAwesomeIcon icon={showWorldTypeGroup ? faChevronDown : faChevronRight} />
                  <span>World Type</span>
                </button>
                {showWorldTypeGroup && (
                  <div className="settings-group-content">
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
                )}
              </div>

              {/* Physics Settings */}
              <div className="settings-group collapsible">
                <button
                  type="button"
                  className={`settings-group-toggle ${showPhysicsGroup ? 'expanded' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowPhysicsGroup(prev => !prev);
                  }}
                >
                  <FontAwesomeIcon icon={showPhysicsGroup ? faChevronDown : faChevronRight} />
                  <span>Physics</span>
                </button>
                {showPhysicsGroup && (
                  <div className="settings-group-content">
                    {/* Physics Enable Toggle */}
                    <div className="effect-card">
                      <button
                        className={`effect-toggle ${simulationConfig.physics.enabled ? 'active' : ''}`}
                        onClick={handlePhysicsEnabledToggle}
                        type="button"
                      >
                        <FontAwesomeIcon icon={faWind} />
                        <div className="effect-details">
                          <span className="effect-name">Physics Simulation</span>
                          <span className="effect-description">Rapier-based particles</span>
                        </div>
                        <span className="effect-status">{simulationConfig.physics.enabled ? 'On' : 'Off'}</span>
                      </button>

                      <div className="effect-controls">
                        <label className="effect-control">
                          <div className="effect-control-header">
                            <span>Gravity</span>
                            <span className="effect-value">{simulationConfig.physics.gravity.toFixed(0)}</span>
                          </div>
                          <input
                            type="range"
                            min="0"
                            max="500"
                            step="10"
                            value={simulationConfig.physics.gravity}
                            onChange={(e) => handlePhysicsGravityChange(parseFloat(e.target.value))}
                            className="passes-slider"
                            disabled={!simulationConfig.physics.enabled}
                          />
                        </label>
                        <label className="effect-control">
                          <div className="effect-control-header">
                            <span>Force Threshold</span>
                            <span className="effect-value">{simulationConfig.physics.forceEjectionThreshold.toFixed(2)}</span>
                          </div>
                          <input
                            type="range"
                            min="0.05"
                            max="1"
                            step="0.05"
                            value={simulationConfig.physics.forceEjectionThreshold}
                            onChange={(e) => handlePhysicsForceThresholdChange(parseFloat(e.target.value))}
                            className="passes-slider"
                            disabled={!simulationConfig.physics.enabled}
                          />
                        </label>
                        <label className="effect-control">
                          <div className="effect-control-header">
                            <span>Settle Velocity</span>
                            <span className="effect-value">{simulationConfig.physics.settleThreshold.toFixed(1)}</span>
                          </div>
                          <input
                            type="range"
                            min="0.5"
                            max="20"
                            step="0.5"
                            value={simulationConfig.physics.settleThreshold}
                            onChange={(e) => handlePhysicsSettleThresholdChange(parseFloat(e.target.value))}
                            className="passes-slider"
                            disabled={!simulationConfig.physics.enabled}
                          />
                        </label>
                        <label className="effect-control">
                          <div className="effect-control-header">
                            <span>Particle Radius</span>
                            <span className="effect-value">{simulationConfig.physics.particleRadius.toFixed(1)}</span>
                          </div>
                          <input
                            type="range"
                            min="0.3"
                            max="2"
                            step="0.1"
                            value={simulationConfig.physics.particleRadius}
                            onChange={(e) => handlePhysicsParticleRadiusChange(parseFloat(e.target.value))}
                            className="passes-slider"
                            disabled={!simulationConfig.physics.enabled}
                          />
                        </label>
                        <label className="effect-control">
                          <div className="effect-control-header">
                            <span>Bounciness</span>
                            <span className="effect-value">{simulationConfig.physics.particleRestitution.toFixed(2)}</span>
                          </div>
                          <input
                            type="range"
                            min="0"
                            max="1"
                            step="0.05"
                            value={simulationConfig.physics.particleRestitution}
                            onChange={(e) => handlePhysicsRestitutionChange(parseFloat(e.target.value))}
                            className="passes-slider"
                            disabled={!simulationConfig.physics.enabled}
                          />
                        </label>
                        <label className="effect-control">
                          <div className="effect-control-header">
                            <span>Rigid Body Force</span>
                            <span className="effect-value">{simulationConfig.physics.rigidBodyForceMultiplier.toFixed(1)}</span>
                          </div>
                          <input
                            type="range"
                            min="1"
                            max="50"
                            step="1"
                            value={simulationConfig.physics.rigidBodyForceMultiplier}
                            onChange={(e) => handleRigidBodyForceMultiplierChange(parseFloat(e.target.value))}
                            className="passes-slider"
                            disabled={!simulationConfig.physics.enabled}
                          />
                        </label>
                      </div>
                    </div>
                  </div>
                )}
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
