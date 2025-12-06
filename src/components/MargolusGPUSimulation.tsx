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
import { useFrame, useThree } from '@react-three/fiber';

interface MargolusGPUSimulationProps {
  worldTexture: DataTexture;
  textureSize: number;
  onTextureUpdate: (texture: DataTexture) => void;
  enabled?: boolean;
  toppleProbability?: number;
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

const createSimulationResources = (size: number, initialTexture: Texture, toppleProbability: number): SimulationResources => {
  const scene = new Scene();
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const geometry = new PlaneGeometry(2, 2);
  const material = new ShaderMaterial({
    uniforms: {
      uTextureSize: { value: new Vector2(size, size) },
      uCurrentState: { value: initialTexture },
      uIteration: { value: 0 },
      uToppleProbability: { value: toppleProbability },
      uRandomSeed: { value: Math.random() * 1000 },
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
      uRandomSeed: { value: Math.random() * 1000 },
    },
    vertexShader: liquidSpreadVertexShader,
    fragmentShader: liquidSpreadFragmentShader,
  });
  const mesh = new Mesh(geometry, material);
  scene.add(mesh);
  return { scene, camera, material, geometry, mesh };
};

/**
 * GPU-accelerated Margolus Cellular Automata simulation
 * Much faster than CPU version, implements the same algorithm on the GPU
 */
function MargolusGPUSimulation({
  worldTexture,
  textureSize,
  onTextureUpdate,
  enabled = true,
  toppleProbability = 0.75,
  resetCount = 0,
}: MargolusGPUSimulationProps) {
  const { gl } = useThree();

  // Ping-pong render targets for iterative simulation
  const pingRT = useMemo(() => generateRenderTarget(textureSize), [textureSize]);
  const pongRT = useMemo(() => generateRenderTarget(textureSize), [textureSize]);
  const liquidRT = useMemo(() => generateRenderTarget(textureSize), [textureSize]);

  const simSceneRef = useRef<SimulationResources | null>(null);
  const liquidSceneRef = useRef<SimulationResources | null>(null);
  const iterationRef = useRef(0);
  const initializedRef = useRef(false);

  // Create simulation resources and initialize render targets
  useEffect(() => {
    // Create new simulation resources
    const resources = createSimulationResources(textureSize, worldTexture, toppleProbability);
    const liquidResources = createLiquidSpreadResources(textureSize, worldTexture);
    simSceneRef.current = resources;
    liquidSceneRef.current = liquidResources;

    // Initialize render targets
    gl.initRenderTarget(pingRT);
    gl.initRenderTarget(pongRT);
    gl.initRenderTarget(liquidRT);

    // Clear render targets
    gl.setRenderTarget(pingRT);
    gl.clear();
    gl.setRenderTarget(pongRT);
    gl.clear();
    gl.setRenderTarget(liquidRT);
    gl.clear();
    gl.setRenderTarget(null);

    // Copy initial world texture to pingRT
    resources.material.uniforms.uCurrentState.value = worldTexture;
    resources.material.uniforms.uIteration.value = 0;
    resources.material.uniforms.uRandomSeed.value = Math.random() * 1000;
    gl.setRenderTarget(pingRT);
    gl.render(resources.scene, resources.camera);
    gl.setRenderTarget(null);

    // Reset iteration counter
    iterationRef.current = 0;
    initializedRef.current = true;

    return () => {
      resources.scene.remove(resources.mesh);
      resources.geometry.dispose();
      resources.material.dispose();
      liquidResources.scene.remove(liquidResources.mesh);
      liquidResources.geometry.dispose();
      liquidResources.material.dispose();
      pingRT.dispose();
      pongRT.dispose();
      liquidRT.dispose();
    };
  }, [textureSize, worldTexture, toppleProbability, resetCount, gl, pingRT, pongRT, liquidRT]);

  // Update topple probability when it changes
  useEffect(() => {
    if (simSceneRef.current) {
      simSceneRef.current.material.uniforms.uToppleProbability.value = toppleProbability;
    }
  }, [toppleProbability]);

  // Run simulation each frame
  useFrame(() => {
    const simScene = simSceneRef.current;
    const liquidScene = liquidSceneRef.current;
    if (!enabled || !simScene || !liquidScene || !initializedRef.current) {
      return;
    }

    // Run multiple Margolus steps per frame
    const STEPS_PER_FRAME = 4;

    // Start with the current world texture (picks up user drawing automatically)
    simScene.material.uniforms.uCurrentState.value = worldTexture;
    simScene.material.uniforms.uTextureSize.value.set(textureSize, textureSize);
    simScene.camera.position.z = 1;
    simScene.camera.updateProjectionMatrix();

    for (let i = 0; i < STEPS_PER_FRAME; i++) {
      // First iteration uses worldTexture, subsequent iterations use ping-pong buffers
      const sourceRT = i === 0 ? null : (i % 2 === 0 ? pongRT : pingRT);
      const targetRT = i % 2 === 0 ? pingRT : pongRT;

      // Update iteration and random seed
      simScene.material.uniforms.uIteration.value = iterationRef.current % 4;
      simScene.material.uniforms.uRandomSeed.value = Math.random() * 1000;

      // Update source texture for iterations after the first
      if (sourceRT) {
        simScene.material.uniforms.uCurrentState.value = sourceRT.texture;
      }

      // Render to target
      gl.setRenderTarget(targetRT);
      gl.render(simScene.scene, simScene.camera);
      gl.setRenderTarget(null);

      // Increment iteration counter
      iterationRef.current = (iterationRef.current + 1) % 4;
    }

    // After Margolus CA, run multiple liquid spread passes for faster spreading
    const margolusResultRT = (STEPS_PER_FRAME - 1) % 2 === 0 ? pingRT : pongRT;
    const LIQUID_SPREAD_PASSES = 3; // Run 3 liquid spread iterations per frame

    liquidScene.material.uniforms.uTextureSize.value.set(textureSize, textureSize);
    liquidScene.camera.position.z = 1;
    liquidScene.camera.updateProjectionMatrix();

    for (let i = 0; i < LIQUID_SPREAD_PASSES; i++) {
      // First pass uses Margolus result, subsequent passes alternate between liquidRT and pingRT
      const sourceRT = i === 0 ? margolusResultRT : (i % 2 === 1 ? liquidRT : pingRT);
      const targetRT = i % 2 === 0 ? liquidRT : pingRT;

      liquidScene.material.uniforms.uCurrentState.value = sourceRT.texture;
      liquidScene.material.uniforms.uRandomSeed.value = Math.random() * 1000;

      gl.setRenderTarget(targetRT);
      gl.render(liquidScene.scene, liquidScene.camera);
      gl.setRenderTarget(null);
    }

    // Read final result from the last target used (after 3 passes: i=2, targetRT = pingRT)
    const finalLiquidRT = (LIQUID_SPREAD_PASSES - 1) % 2 === 0 ? liquidRT : pingRT;
    const pixels = new Uint8Array(textureSize * textureSize * 4);
    gl.readRenderTargetPixels(finalLiquidRT, 0, 0, textureSize, textureSize, pixels);

    // Update the worldTexture data in-place
    const worldData = worldTexture.image.data as Uint8Array;
    worldData.set(pixels);
    worldTexture.needsUpdate = true;

    // Notify parent that texture was updated
    onTextureUpdate(worldTexture);
  });

  return null;
}

export default MargolusGPUSimulation;
