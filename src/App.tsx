import { Canvas } from '@react-three/fiber';
import { useState, useMemo, useCallback } from 'react';
import { DataTexture, Texture } from 'three';
import './App.css';
import TextureRenderer from './components/TextureRenderer';
import MainSimulation from './components/MainSimulation';
import { SideControls } from './components/SideControls';
import { StatusBar } from './components/StatusBar';
import { useTextureControls } from './hooks/useTextureControls';
import { useParticleDrawing } from './hooks/useParticleDrawing';
import { WorldGeneration, WorldInitType } from './world/WorldGeneration';
import { ParticleType } from './world/ParticleTypes';
import { DEFAULT_SIMULATION_CONFIG } from './types/SimulationConfig';
import type { SimulationConfig } from './types/SimulationConfig';
import { DEFAULT_RENDER_CONFIG } from './types/RenderConfig';
import type { RenderConfig } from './types/RenderConfig';
import { WORLD_SIZE } from './constants/worldConstants';

function Scene({
  texture,
  pixelSize,
  center,
  renderConfig,
}: {
  texture: Texture;
  pixelSize: number;
  center: { x: number; y: number };
  renderConfig: RenderConfig;
}) {
  return <TextureRenderer texture={texture} pixelSize={pixelSize} center={center} renderConfig={renderConfig} />;
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

  // Simulation configuration
  const [simulationConfig, setSimulationConfig] = useState<SimulationConfig>(DEFAULT_SIMULATION_CONFIG);

  // Render configuration (post-processing effects)
  const [renderConfig, setRenderConfig] = useState<RenderConfig>(DEFAULT_RENDER_CONFIG);

  // FPS tracking
  const [fps, setFps] = useState<number>(0);

  // Handle drawing particles and updating texture
  const handleDraw = useCallback((texture: DataTexture) => {
    // Texture is already updated in-place, just trigger a re-render
    texture.needsUpdate = true;
  }, []);

  // Use particle drawing hook
  useParticleDrawing({
    worldGen,
    selectedParticle,
    pixelSize,
    center,
    onDraw: handleDraw,
    worldTexture: worldTexture,
  });

  // Reset world handler
  const handleResetWorld = useCallback(() => {
    // Pause the simulation first
    setSimulationEnabled(false);
    // Create new texture with current init type
    const newTexture = worldGen.initNewWorld({ initType: worldInitType });
    setWorldTexture(newTexture);
    setCenter({ x: 0, y: 0 });
    setResetCount(prev => prev + 1);
    setSimulationEnabled(true);
  }, [worldGen, setCenter, worldInitType]);

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
          onTextureUpdate={(newTexture) => {
            setWorldTexture(newTexture);
          }}
          enabled={simulationEnabled}
          config={simulationConfig}
          resetCount={resetCount}
          onFpsUpdate={setFps}
        />
        <Scene texture={worldTexture} pixelSize={pixelSize} center={center} renderConfig={renderConfig} />
      </Canvas>

      {/* Overlay Controls */}
      <SideControls
        particleTypes={particleTypes}
        selectedParticle={selectedParticle}
        onParticleSelect={setSelectedParticle}
        onResetWorld={handleResetWorld}
        simulationConfig={simulationConfig}
        onSimulationConfigChange={setSimulationConfig}
        worldInitType={worldInitType}
        onWorldInitTypeChange={setWorldInitType}
      />

      {/* Overlay Status Bar */}
      <StatusBar pixelSize={pixelSize} center={center} selectedParticle={selectedParticle} fps={fps} />
    </div>
  );
}

export default App;
