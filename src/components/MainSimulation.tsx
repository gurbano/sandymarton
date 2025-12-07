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
import { simulationFragmentShader, simulationVertexShader } from '../shaders/simulationShaders';
import { margolusFragmentShader, margolusVertexShader } from '../shaders/margolusShaders';
import { liquidSpreadFragmentShader, liquidSpreadVertexShader } from '../shaders/liquidSpreadShaders';
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

const createGPUResources = (size: number, initialTexture: Texture): SimulationResources => {
  const scene = new Scene();
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const geometry = new PlaneGeometry(2, 2);
  const material = new ShaderMaterial({
    uniforms: {
      uTextureSize: { value: new Vector2(size, size) },
      uDeltaTime: { value: 0 },
      uCurrentState: { value: initialTexture },
      uGravity: { value: -0.98 },
      uFrictionAmplifier: { value: 1.0 },
    },
    vertexShader: simulationVertexShader,
    fragmentShader: simulationFragmentShader,
  });
  const mesh = new Mesh(geometry, material);
  scene.add(mesh);
  return { scene, camera, material, geometry, mesh };
};

const createMargolusResources = (size: number, initialTexture: Texture): SimulationResources => {
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
    vertexShader: margolusVertexShader,
    fragmentShader: margolusFragmentShader,
  });
  const mesh = new Mesh(geometry, material);
  scene.add(mesh);
  return { scene, camera, material, geometry, mesh };
};

const createLiquidSpreadResources = (size: number, initialTexture: Texture): SimulationResources => {
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
    vertexShader: liquidSpreadVertexShader,
    fragmentShader: liquidSpreadFragmentShader,
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

  const gpuSceneRef = useRef<SimulationResources | null>(null);
  const margolusSceneRef = useRef<SimulationResources | null>(null);
  const liquidSpreadSceneRef = useRef<SimulationResources | null>(null);
  const margolusIterationRef = useRef(0);
  const liquidSpreadIterationRef = useRef(0);
  const initializedRef = useRef(false);

  // Create simulation resources
  useEffect(() => {
    const gpuResources = createGPUResources(textureSize, worldTexture);
    const margolusResources = createMargolusResources(textureSize, worldTexture);
    const liquidSpreadResources = createLiquidSpreadResources(textureSize, worldTexture);

    gpuSceneRef.current = gpuResources;
    margolusSceneRef.current = margolusResources;
    liquidSpreadSceneRef.current = liquidSpreadResources;

    // Initialize render targets
    renderTargets.forEach((rt) => {
      gl.initRenderTarget(rt);
      gl.setRenderTarget(rt);
      gl.clear();
    });
    gl.setRenderTarget(null);

    margolusIterationRef.current = 0;
    liquidSpreadIterationRef.current = 0;
    initializedRef.current = true;

    return () => {
      [gpuResources, margolusResources, liquidSpreadResources].forEach((resources) => {
        resources.scene.remove(resources.mesh);
        resources.geometry.dispose();
        resources.material.dispose();
      });
      renderTargets.forEach((rt) => rt.dispose());
    };
  }, [textureSize, worldTexture, resetCount, gl, renderTargets]);

  // Run simulation pipeline each frame
  useFrame((_, delta) => {
    if (!enabled || !initializedRef.current) {
      return;
    }

    let currentSource: Texture = worldTexture;
    let rtIndex = 0;

    // Execute each enabled step in order
    for (const step of config.steps) {
      if (!step.enabled || step.passes <= 0) continue;

      let resources: SimulationResources | null = null;

      switch (step.type) {
        case SimulationStepType.GPU_PHYSICS:
          resources = gpuSceneRef.current;
          if (resources) {
            const iterationDelta = delta / step.passes;
            resources.material.uniforms.uDeltaTime.value = iterationDelta;
          }
          break;
        case SimulationStepType.MARGOLUS_CA:
          resources = margolusSceneRef.current;
          break;
        case SimulationStepType.LIQUID_SPREAD:
          resources = liquidSpreadSceneRef.current;
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
          resources.material.uniforms.uRandomSeed.value = Math.random() * 1000;
          margolusIterationRef.current++;
        } else if (step.type === SimulationStepType.LIQUID_SPREAD) {
          resources.material.uniforms.uIteration.value = liquidSpreadIterationRef.current % 2;
          resources.material.uniforms.uRandomSeed.value = Math.random() * 1000;
          liquidSpreadIterationRef.current++;
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
