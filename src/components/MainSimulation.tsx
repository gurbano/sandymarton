import { useEffect, useMemo, useRef } from 'react';
import {
  DataTexture,
  Mesh,
  NearestFilter,
  OrthographicCamera,
  PlaneGeometry,
  RGBAFormat,
  Scene,
  ShaderMaterial,
  Texture,
  UnsignedByteType,
  Vector2,
  WebGLRenderTarget,
} from 'three';
import { margolusFragmentShader, margolusVertexShader } from '../shaders/margolusShaders';
import { liquidSpreadFragmentShader, liquidSpreadVertexShader } from '../shaders/liquidSpreadShaders';
import { archimedesFragmentShader, archimedesVertexShader } from '../shaders/archimedesShaders';
import { useFrame, useThree } from '@react-three/fiber';
import type { SimulationConfig } from '../types/SimulationConfig';
import { SimulationStepType } from '../types/SimulationConfig';

interface MainSimulationProps {
  worldTexture: DataTexture;
  textureSize: number;
  onTextureUpdate: (texture: DataTexture) => void;
  enabled?: boolean;
  config: SimulationConfig;
  resetCount?: number;
  onFpsUpdate?: (fps: number) => void;
}

const generateRenderTarget = (size: number) =>
  new WebGLRenderTarget(size, size, {
    type: UnsignedByteType,
    format: RGBAFormat,
    minFilter: NearestFilter,
    magFilter: NearestFilter,
    depthBuffer: false,
    stencilBuffer: false,
  });

type SimulationResources = {
  scene: Scene;
  camera: OrthographicCamera;
  material: ShaderMaterial;
  geometry: PlaneGeometry;
  mesh: Mesh;
};

type ShaderConfig = {
  vertexShader: string;
  fragmentShader: string;
};

/**
 * Generic factory for creating simulation resources
 * Eliminates duplication across Margolus, LiquidSpread, and Archimedes
 */
const createSimulationResources = (
  size: number,
  initialTexture: Texture,
  shaderConfig: ShaderConfig
): SimulationResources => {
  const scene = new Scene();
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const geometry = new PlaneGeometry(2, 2);
  const material = new ShaderMaterial({
    uniforms: {
      uTextureSize: { value: new Vector2(size, size) },
      uCurrentState: { value: initialTexture },
      uIteration: { value: 0 },
      uRandomSeed: { value: Math.random() * 1000 },
      uFrictionAmplifier: { value: 1.0 },
    },
    vertexShader: shaderConfig.vertexShader,
    fragmentShader: shaderConfig.fragmentShader,
  });
  const mesh = new Mesh(geometry, material);
  scene.add(mesh);
  return { scene, camera, material, geometry, mesh };
};

/**
 * Main configurable simulation with modular pipeline
 * Steps can be enabled/disabled and configured independently
 */
function MainSimulation({
  worldTexture,
  textureSize,
  onTextureUpdate,
  enabled = true,
  config,
  resetCount = 0,
  onFpsUpdate,
}: MainSimulationProps) {
  const { gl } = useThree();

  // Render targets for ping-pong rendering
  const renderTargets = useMemo(() => {
    return [
      generateRenderTarget(textureSize),
      generateRenderTarget(textureSize),
      generateRenderTarget(textureSize),
      generateRenderTarget(textureSize),
    ];
  }, [textureSize]);

  const margolusSceneRef = useRef<SimulationResources | null>(null);
  const liquidSpreadSceneRef = useRef<SimulationResources | null>(null);
  const archimedesSceneRef = useRef<SimulationResources | null>(null);
  const margolusIterationRef = useRef(0);
  const liquidSpreadIterationRef = useRef(0);
  const archimedesIterationRef = useRef(0);
  const initializedRef = useRef(false);

  // FPS tracking with circular buffer to prevent memory leak
  const FPS_BUFFER_SIZE = 60; // Store last 60 frame times
  const frameTimesRef = useRef<Float32Array>(new Float32Array(FPS_BUFFER_SIZE));
  const frameTimeIndexRef = useRef(0);
  const frameTimeCountRef = useRef(0);
  const lastFpsUpdateRef = useRef(0);

  // Create simulation resources
  useEffect(() => {
    const margolusResources = createSimulationResources(textureSize, worldTexture, {
      vertexShader: margolusVertexShader,
      fragmentShader: margolusFragmentShader,
    });
    const liquidSpreadResources = createSimulationResources(textureSize, worldTexture, {
      vertexShader: liquidSpreadVertexShader,
      fragmentShader: liquidSpreadFragmentShader,
    });
    const archimedesResources = createSimulationResources(textureSize, worldTexture, {
      vertexShader: archimedesVertexShader,
      fragmentShader: archimedesFragmentShader,
    });

    margolusSceneRef.current = margolusResources;
    liquidSpreadSceneRef.current = liquidSpreadResources;
    archimedesSceneRef.current = archimedesResources;

    // Initialize render targets
    renderTargets.forEach((rt) => {
      gl.initRenderTarget(rt);
      gl.setRenderTarget(rt);
      gl.clear();
    });
    gl.setRenderTarget(null);

    margolusIterationRef.current = 0;
    liquidSpreadIterationRef.current = 0;
    archimedesIterationRef.current = 0;
    initializedRef.current = true;

    return () => {
      [margolusResources, liquidSpreadResources, archimedesResources].forEach((resources) => {
        resources.scene.remove(resources.mesh);
        resources.geometry.dispose();
        resources.material.dispose();
      });
      renderTargets.forEach((rt) => rt.dispose());
    };
  }, [textureSize, worldTexture, resetCount, gl, renderTargets]);

  // Run simulation pipeline each frame
  useFrame((state, delta) => {
    if (!enabled || !initializedRef.current) {
      return;
    }

    // Track FPS using circular buffer
    if (onFpsUpdate) {
      const now = state.clock.elapsedTime;

      // Add delta to circular buffer
      frameTimesRef.current[frameTimeIndexRef.current] = delta;
      frameTimeIndexRef.current = (frameTimeIndexRef.current + 1) % FPS_BUFFER_SIZE;
      frameTimeCountRef.current = Math.min(frameTimeCountRef.current + 1, FPS_BUFFER_SIZE);

      // Update FPS every 0.5 seconds
      if (now - lastFpsUpdateRef.current > 0.5) {
        const count = frameTimeCountRef.current;
        if (count > 0) {
          let sum = 0;
          for (let i = 0; i < count; i++) {
            sum += frameTimesRef.current[i];
          }
          const avgDelta = sum / count;
          const fps = Math.round(1 / avgDelta);
          onFpsUpdate(fps);
        }
        // Reset counters (but reuse the same buffer)
        frameTimeIndexRef.current = 0;
        frameTimeCountRef.current = 0;
        lastFpsUpdateRef.current = now;
      }
    }

    let currentSource: Texture = worldTexture;
    let rtIndex = 0;

    // Execute each enabled step in order
    for (const step of config.steps) {
      if (!step.enabled || step.passes <= 0) continue;

      let resources: SimulationResources | null = null;

      switch (step.type) {
        case SimulationStepType.MARGOLUS_CA:
          resources = margolusSceneRef.current;
          break;
        case SimulationStepType.LIQUID_SPREAD:
          resources = liquidSpreadSceneRef.current;
          break;
        case SimulationStepType.ARCHIMEDES:
          resources = archimedesSceneRef.current;
          break;
      }

      if (!resources) continue;

      // Run multiple passes of this step
      for (let i = 0; i < step.passes; i++) {
        const targetRT = renderTargets[rtIndex % renderTargets.length];

        // Update uniforms
        resources.material.uniforms.uCurrentState.value = currentSource;
        resources.material.uniforms.uTextureSize.value.set(textureSize, textureSize);
        resources.material.uniforms.uFrictionAmplifier.value = config.frictionAmplifier;
        resources.camera.position.z = 1;
        resources.camera.updateProjectionMatrix();

        // Update step-specific uniforms
        if (step.type === SimulationStepType.MARGOLUS_CA) {
          resources.material.uniforms.uIteration.value = margolusIterationRef.current % 4;
          // Use iteration as deterministic seed (same iteration + position = same random value)
          resources.material.uniforms.uRandomSeed.value = margolusIterationRef.current;
          margolusIterationRef.current++;
        } else if (step.type === SimulationStepType.LIQUID_SPREAD) {
          resources.material.uniforms.uIteration.value = liquidSpreadIterationRef.current % 2;
          // Use iteration as deterministic seed (same iteration + position = same random value)
          resources.material.uniforms.uRandomSeed.value = liquidSpreadIterationRef.current;
          liquidSpreadIterationRef.current++;
        } else if (step.type === SimulationStepType.ARCHIMEDES) {
          resources.material.uniforms.uIteration.value = archimedesIterationRef.current % 4;
          // Use iteration as deterministic seed (same iteration + position = same random value)
          resources.material.uniforms.uRandomSeed.value = archimedesIterationRef.current;
          archimedesIterationRef.current++;
        }

        // Render to target
        gl.setRenderTarget(targetRT);
        gl.render(resources.scene, resources.camera);
        gl.setRenderTarget(null);

        // Update source for next iteration
        currentSource = targetRT.texture;
        rtIndex++;
      }
    }

    // Read final result
    const finalRT = renderTargets[(rtIndex - 1) % renderTargets.length];
    const pixels = new Uint8Array(textureSize * textureSize * 4);
    gl.readRenderTargetPixels(finalRT, 0, 0, textureSize, textureSize, pixels);

    // Update the worldTexture data in-place
    const worldData = worldTexture.image.data as Uint8Array;
    worldData.set(pixels);
    worldTexture.needsUpdate = true;

    // Notify parent that texture was updated
    onTextureUpdate(worldTexture);
  });

  return null;
}

export default MainSimulation;
