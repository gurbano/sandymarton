import { Canvas } from '@react-three/fiber';
import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import type { RefObject } from 'react';
import { DataTexture, Texture } from 'three';
import './App.css';
import TextureRenderer from './components/TextureRenderer';
import MainSimulation from './components/MainSimulation';
import { SideControls } from './components/SideControls';
import { StatusBar } from './components/StatusBar';
import { useTextureControls } from './hooks/useTextureControls';
import { useParticleDrawing } from './hooks/useParticleDrawing';
import type { InspectData } from './hooks/useParticleDrawing';
import { WorldGeneration, WorldInitType } from './world/WorldGeneration';
import { ParticleType } from './world/ParticleTypes';
import { DEFAULT_SIMULATION_CONFIG } from './types/SimulationConfig';
import type { SimulationConfig } from './types/SimulationConfig';
import { DEFAULT_RENDER_CONFIG } from './types/RenderConfig';
import type { RenderConfig } from './types/RenderConfig';
import { WORLD_SIZE } from './constants/worldConstants';
import { loadLevel } from './utils/LevelLoader';
import { saveLevel } from './utils/LevelSaver';

type BackgroundPaletteColor = [number, number, number];

interface BackgroundParams {
  palette: BackgroundPaletteColor[];
  seed: number;
  noiseOffsets: [number, number, number, number];
}

const BACKGROUND_PALETTES: BackgroundPaletteColor[][] = [
  [
    [18, 22, 28],
    [32, 38, 46],
    [45, 52, 60],
    [28, 33, 40],
  ],
  [
    [20, 18, 24],
    [38, 32, 42],
    [60, 45, 58],
    [30, 26, 34],
  ],
  [
    [16, 21, 25],
    [30, 37, 42],
    [48, 56, 62],
    [26, 29, 34],
  ],
  [
    [14, 18, 24],
    [31, 36, 44],
    [52, 58, 66],
    [24, 27, 33],
  ],
  [
    [22, 20, 28],
    [44, 36, 48],
    [62, 48, 58],
    [32, 27, 36],
  ],
];

const createBackgroundParams = (): BackgroundParams => {
  const palette = BACKGROUND_PALETTES[Math.floor(Math.random() * BACKGROUND_PALETTES.length)] ?? BACKGROUND_PALETTES[0];
  return {
    palette,
    seed: Math.random() * 1000,
    noiseOffsets: [Math.random() * 1000, Math.random() * 1000, Math.random() * 1000, Math.random() * 1000],
  };
};


function Scene({
  textureRef,
  heatTextureRef,
  pixelSize,
  center,
  renderConfig,
  backgroundPalette,
  backgroundSeed,
  backgroundNoiseOffsets,
}: {
  textureRef: RefObject<Texture | null>;
  heatTextureRef: RefObject<Texture | null>;
  pixelSize: number;
  center: { x: number; y: number };
  renderConfig: RenderConfig;
  backgroundPalette: BackgroundPaletteColor[];
  backgroundSeed: number;
  backgroundNoiseOffsets: [number, number, number, number];
}) {
  return (
    <TextureRenderer
      textureRef={textureRef}
      heatTextureRef={heatTextureRef}
      pixelSize={pixelSize}
      center={center}
      renderConfig={renderConfig}
      backgroundPalette={backgroundPalette}
      backgroundSeed={backgroundSeed}
      backgroundNoiseOffsets={backgroundNoiseOffsets}
    />
  );
}

// Get all particle types except EMPTY and AIR
const particleTypes = Object.entries(ParticleType)
  .filter(([key, value]) => typeof value === 'number' && value > 0 && key !== 'AIR')
  .map(([key, value]) => ({ name: key, value: value as number }));

function App() {
  const { pixelSize, center, isDragging, setCenter } = useTextureControls({ canvasSize: 640 });

  // World generation instance
  const worldGen = useMemo(() => new WorldGeneration(WORLD_SIZE, WORLD_SIZE), []);

  // World initialization type
  const [worldInitType, setWorldInitType] = useState<WorldInitType>(WorldInitType.PLATFORMS);

  // State for the world texture
  const [worldTexture, setWorldTexture] = useState<DataTexture>(() => worldGen.initNewWorld({ initType: worldInitType }));

  // Reset counter to force remount of simulation
  const [resetCount, setResetCount] = useState(0);

  // State to control simulation
  const [simulationEnabled, setSimulationEnabled] = useState(true);

  // State for selected particle type
  const [selectedParticle, setSelectedParticle] = useState<ParticleType>(ParticleType.SAND);

  // Tool mode state (inspect, add, remove, fill)
  const [toolMode, setToolMode] = useState<'inspect' | 'add' | 'remove' | 'fill'>('add');
  const [userToolMode, setUserToolMode] = useState<'inspect' | 'add' | 'remove' | 'fill'>('add');
  const shiftPressedRef = useRef(false);
  const userToolModeRef = useRef<'inspect' | 'add' | 'remove' | 'fill'>('add');

  // Brush size state
  const [brushSize, setBrushSize] = useState<number>(3);

  useEffect(() => {
    userToolModeRef.current = userToolMode;
  }, [userToolMode]);


  // Simulation configuration
  const [simulationConfig, setSimulationConfig] = useState<SimulationConfig>(DEFAULT_SIMULATION_CONFIG);

  // Render configuration (post-processing effects and overlays)
  const [renderConfig, setRenderConfig] = useState<RenderConfig>(DEFAULT_RENDER_CONFIG);

  // FPS tracking
  const [fps, setFps] = useState<number>(0);

  const [backgroundParams, setBackgroundParams] = useState<BackgroundParams>(() => createBackgroundParams());

  const refreshBackgroundParams = useCallback(() => {
    setBackgroundParams(createBackgroundParams());
  }, []);

  // Ref to share heat RT texture between MainSimulation and TextureRenderer (avoids GPU read-back)
  const heatRTRef = useRef<Texture | null>(null);
  // Ref for ambient heat texture (used for inspection, set once by MainSimulation)
  const ambientHeatTextureRef = useRef<DataTexture | null>(null);
  // Ref for world texture (avoids prop drilling and re-renders)
  const worldTextureRef = useRef<DataTexture>(worldTexture);

  // Keep ref in sync with state (state only changes on reset)
  useEffect(() => {
    worldTextureRef.current = worldTexture;
  }, [worldTexture]);

  // Handle drawing particles and updating texture
  const handleDraw = useCallback((texture: DataTexture) => {
    // Texture is already updated in-place, just trigger a re-render
    texture.needsUpdate = true;
  }, []);

  // Brush cursor ref - direct DOM manipulation for performance (no React re-renders)
  const brushCursorRef = useRef<HTMLDivElement>(null);

  // Inspect tooltip ref - direct DOM manipulation for performance
  const inspectTooltipRef = useRef<HTMLDivElement>(null);

  const hideInspectTooltip = useCallback(() => {
    const tooltip = inspectTooltipRef.current;
    if (tooltip) {
      tooltip.style.display = 'none';
    }
  }, []);

  const handleToolModeChange = useCallback((mode: 'inspect' | 'add' | 'remove' | 'fill') => {
    setUserToolMode(mode);
    userToolModeRef.current = mode;

    if (!shiftPressedRef.current || mode === 'inspect') {
      setToolMode(mode);
      if (mode !== 'inspect') {
        hideInspectTooltip();
      }
    } else {
      setToolMode('inspect');
    }
  }, [hideInspectTooltip]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.code === 'ShiftLeft' && !event.repeat && !shiftPressedRef.current) {
        shiftPressedRef.current = true;
        setToolMode(prev => (prev === 'inspect' ? prev : 'inspect'));
      }
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      if (event.code === 'ShiftLeft') {
        shiftPressedRef.current = false;
        const targetMode = userToolModeRef.current;
        setToolMode(targetMode);
        if (targetMode !== 'inspect') {
          hideInspectTooltip();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [hideInspectTooltip]);

  useEffect(() => {
    if (toolMode !== 'inspect') {
      hideInspectTooltip();
    }
  }, [toolMode, hideInspectTooltip]);

  // Update brush cursor directly via DOM (bypasses React rendering)
  const handleMouseMove = useCallback((pos: { x: number; y: number } | null) => {
    const cursor = brushCursorRef.current;
    if (!cursor) return;

    if (pos) {
      cursor.style.display = 'block';
      cursor.style.left = `${pos.x}px`;
      cursor.style.top = `${pos.y}px`;
    } else {
      cursor.style.display = 'none';
    }

    // Also update inspect tooltip position
    const tooltip = inspectTooltipRef.current;
    if (tooltip) {
      if (pos) {
        tooltip.style.left = `${pos.x + 15}px`;
        tooltip.style.top = `${pos.y + 15}px`;
      }
    }
  }, []);

  // Update inspect tooltip content via DOM
  const handleInspectData = useCallback((data: InspectData | null) => {
    const tooltip = inspectTooltipRef.current;
    if (!tooltip) return;

    if (!data) {
      tooltip.style.display = 'none';
      return;
    }

    tooltip.style.display = 'block';

    const compositionSegments = data.composition
      .map(c => `<div class="inspect-bar-segment" style="width: ${c.percentage}%; background: rgb(${c.color.join(',')});" title="${c.type}: ${c.percentage.toFixed(1)}%"></div>`)
      .join('');

    const compositionBar = data.composition.length > 0
      ? `<div class="inspect-bar">${compositionSegments}</div>`
      : '';

    const compositionList = data.composition.length > 1
      ? `<div class="inspect-composition">${data.composition
        .map(c => `<div class="inspect-comp-row"><span class="inspect-comp-color" style="background: rgb(${c.color.join(',')});"></span><span class="inspect-comp-name">${c.type}</span><span class="inspect-comp-pct">${c.percentage.toFixed(1)}%</span></div>`)
        .join('')}</div>`
      : '';

    const infoRows = [
      { label: 'Brush', value: `${data.brushSize}px`, show: true },
      { label: 'Particles', value: data.totalParticles.toLocaleString(), show: data.totalParticles > 0 },
      {
        label: 'Avg Particle',
        value: data.avgParticleTemp !== null ? `${data.avgParticleTemp.toFixed(1)}°C` : '',
        show: data.avgParticleTemp !== null,
      },
      {
        label: 'Avg Ambient',
        value: data.avgAmbientTemp !== null ? `${data.avgAmbientTemp.toFixed(1)}°C` : '',
        show: data.avgAmbientTemp !== null,
      },
    ];

    const infoRowsHtml = infoRows
      .filter(row => row.show)
      .map(row => `<div class="inspect-row"><span>${row.label}:</span><span>${row.value}</span></div>`)
      .join('');

    const detailsSection = infoRowsHtml ? `<div class="inspect-details">${infoRowsHtml}</div>` : '';
    const headerLabel = data.mainComponent || 'Empty Cell';

    tooltip.innerHTML = `
      <div class="inspect-header">${headerLabel}</div>
      ${compositionBar}
      ${detailsSection}
      ${compositionList}
    `;
  }, []);

  // Use particle drawing hook
  useParticleDrawing({
    worldGen,
    selectedParticle,
    pixelSize,
    center,
    onDraw: handleDraw,
    worldTexture: worldTexture,
    heatTextureRef: ambientHeatTextureRef,
    toolMode,
    brushSize,
    onMouseMove: handleMouseMove,
    onInspectData: handleInspectData,
  });

  // Reset world handler
  const handleResetWorld = useCallback(() => {
    // Pause the simulation first
    setSimulationEnabled(false);
    // Create new texture with current init type
    const newTexture = worldGen.initNewWorld({ initType: worldInitType });
    setWorldTexture(newTexture);
    refreshBackgroundParams();
    setCenter({ x: 0, y: 0 });
    setResetCount(prev => prev + 1);
    setSimulationEnabled(true);
  }, [worldGen, setCenter, worldInitType, refreshBackgroundParams]);

  // Load level handler
  const handleLoadLevel = useCallback(async (levelId: string) => {
    try {
      setSimulationEnabled(false);
      const { particleTexture } = await loadLevel(levelId);
      const newTexture = worldGen.initFromTexture(particleTexture);
      setWorldTexture(newTexture);
      refreshBackgroundParams();
      setCenter({ x: 0, y: 0 });
      setResetCount(prev => prev + 1);
      setSimulationEnabled(true);
    } catch (error) {
      console.error('Failed to load level:', error);
      alert(`Failed to load level: ${error}`);
    }
  }, [worldGen, setCenter]);

  // Save level handler
  const handleSaveLevel = useCallback((levelName: string, description?: string) => {
    try {
      saveLevel(worldTexture, levelName, description);
    } catch (error) {
      console.error('Failed to save level:', error);
      alert(`Failed to save level: ${error}`);
    }
  }, [worldTexture]);

  return (
    <div className="app-container">
      {/* Fullscreen Canvas */}
      <Canvas
        id={'main-canvas'}
        orthographic
        camera={{ position: [0, 0, 1], zoom: 1, near: 0.1, far: 1000, left: -1, right: 1, top: 1, bottom: -1 }}
        gl={{ preserveDrawingBuffer: true }}
        style={{ cursor: isDragging ? 'grabbing' : 'grab', height: '1024px', width: '1024px' }}
      >
        <MainSimulation
          worldTexture={worldTexture}
          textureSize={WORLD_SIZE}
          onHeatTextureReady={(tex) => { ambientHeatTextureRef.current = tex; }}
          heatRTRef={heatRTRef}
          enabled={simulationEnabled}
          config={simulationConfig}
          resetCount={resetCount}
          onFpsUpdate={setFps}
          shouldCaptureHeatLayer={toolMode === 'inspect'}
        />
        <Scene
          textureRef={worldTextureRef}
          heatTextureRef={heatRTRef}
          pixelSize={pixelSize}
          center={center}
          renderConfig={renderConfig}
          backgroundPalette={backgroundParams.palette}
          backgroundSeed={backgroundParams.seed}
          backgroundNoiseOffsets={backgroundParams.noiseOffsets}
        />
      </Canvas>

      {/* Overlay Controls */}
      <SideControls
        particleTypes={particleTypes}
        selectedParticle={selectedParticle}
        onParticleSelect={setSelectedParticle}
        onResetWorld={handleResetWorld}
        renderConfig={renderConfig}
        onRenderConfigChange={setRenderConfig}
        worldInitType={worldInitType}
        onWorldInitTypeChange={setWorldInitType}
        onLoadLevel={handleLoadLevel}
        onSaveLevel={handleSaveLevel}
  toolMode={toolMode}
  onToolModeChange={handleToolModeChange}
        brushSize={brushSize}
        onBrushSizeChange={setBrushSize}
      />

      {/* Brush Cursor - ref-based for performance */}
      <div
        ref={brushCursorRef}
        className="brush-cursor"
        style={{
          display: 'none',
          width: brushSize * pixelSize * 2,
          height: brushSize * pixelSize * 2,
        }}
      />

      {/* Inspect Tooltip - ref-based for performance */}
      <div
        ref={inspectTooltipRef}
        className="inspect-tooltip"
        style={{ display: 'none' }}
      />

      {/* Overlay Status Bar */}
      <StatusBar
        pixelSize={pixelSize}
        center={center}
        selectedParticle={selectedParticle}
        fps={fps}
        worldTexture={worldTexture}
        simulationConfig={simulationConfig}
        onSimulationConfigChange={setSimulationConfig}
      />
    </div>
  );
}

export default App;
