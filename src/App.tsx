import { Canvas, useLoader } from '@react-three/fiber';
import { Suspense } from 'react';
import { TextureLoader } from 'three';
import './App.css';
import TextureRenderer from './components/TextureRenderer';
import { useCanvasSize } from './hooks/useCanvasSize';
import { useTextureControls } from './hooks/useTextureControls';

function Scene({ pixelSize, center }: { pixelSize: number; center: { x: number; y: number } }) {
  const texture = useLoader(TextureLoader, '/sample-texture.jpg');

  return <TextureRenderer texture={texture} pixelSize={pixelSize} center={center} />;
}

function App() {
  const canvasSize = useCanvasSize(0.9);
  const { pixelSize, center, isDragging } = useTextureControls({ canvasSize });

  return (
    <div className="app-container">
      <h1>
        React + Three.js - Texture Shader (Pixel Size: {pixelSize}, Center: {center.x.toFixed(1)}, {center.y.toFixed(1)})
      </h1>
      <div className="canvas-wrapper" style={{ cursor: isDragging ? 'grabbing' : 'grab' }}>
        {canvasSize > 0 && (
          <Canvas
            camera={{ position: [0, 0, 1], fov: 75 }}
            gl={{ preserveDrawingBuffer: true }}
            style={{ width: `${canvasSize}px`, height: `${canvasSize}px` }}
          >
            <Suspense fallback={null}>
              <Scene pixelSize={pixelSize} center={center} />
            </Suspense>
          </Canvas>
        )}
      </div>
    </div>
  );
}

export default App;
