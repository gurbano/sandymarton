import { Canvas } from '@react-three/fiber';
import { useState, useMemo, useCallback } from 'react';
import { Texture } from 'three';
import './App.css';
import TextureRenderer from './components/TextureRenderer';
import { SideControls } from './components/SideControls';
import { StatusBar } from './components/StatusBar';
import { useTextureControls } from './hooks/useTextureControls';
import { useParticleDrawing } from './hooks/useParticleDrawing';
import { WorldGeneration } from './world/WorldGeneration';
import { ParticleType } from './world/ParticleTypes';
import SimulationRenderer from './components/SimulationRenderer';

function Scene({ texture, pixelSize, center }: { texture: Texture; pixelSize: number; center: { x: number; y: number } }) {
  return <TextureRenderer texture={texture} pixelSize={pixelSize} center={center} />;
}

// Get all particle types except EMPTY and AIR
const particleTypes = Object.entries(ParticleType)
  .filter(([key, value]) => typeof value === 'number' && value > 0 && key !== 'AIR')
  .map(([key, value]) => ({ name: key, value: value as number }));

function App() {
  const { pixelSize, center, isDragging, setCenter } = useTextureControls({ canvasSize: 640 });

  // World generation instance
  const worldGen = useMemo(() => new WorldGeneration(2048, 2048), []);

  // State for the world texture
  const [worldTexture, setWorldTexture] = useState<Texture>(() => worldGen.initNewWorld({ grid: true }));

  // State for selected particle type
  const [selectedParticle, setSelectedParticle] = useState<ParticleType>(ParticleType.SAND);

  // Handle drawing particles and updating texture
  const handleDraw = useCallback(() => {
    // Update the existing texture by triggering a re-render
    setWorldTexture((prev) => {
      prev.needsUpdate = true;
      return prev;
    });
  }, []);

  // Use particle drawing hook
  useParticleDrawing({
    worldGen,
    selectedParticle,
    pixelSize,
    center,
    onDraw: handleDraw,
  });

  // Reset world handler
  const handleResetWorld = useCallback(() => {
    const newTexture = worldGen.initNewWorld({ grid: true });
    setWorldTexture(newTexture);
    setCenter({ x: 0, y: 0 });
  }, [worldGen]);

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
        {/* <SimulationRenderer
          initialState={initialState}
          textureSize={2048}
          onTextureUpdate={(newTexture) => {
            setWorldTexture(newTexture);
          }}
          enabled={true}
        /> */}
        <Scene texture={worldTexture} pixelSize={pixelSize} center={center} />
      </Canvas>

      {/* Overlay Controls */}
      <SideControls
        particleTypes={particleTypes}
        selectedParticle={selectedParticle}
        onParticleSelect={setSelectedParticle}
        onResetWorld={handleResetWorld}
      />

      {/* Overlay Status Bar */}
      <StatusBar pixelSize={pixelSize} center={center} selectedParticle={selectedParticle} />
    </div>
  );
}

export default App;
