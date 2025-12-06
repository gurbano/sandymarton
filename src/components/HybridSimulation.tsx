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
import { useFrame, useThree } from '@react-three/fiber';

interface HybridSimulationProps {
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
    },
    vertexShader: simulationVertexShader,
    fragmentShader: simulationFragmentShader,
  });
  const mesh = new Mesh(geometry, material);
  scene.add(mesh);
  return { scene, camera, material, geometry, mesh };
};

const createMargolusResources = (size: number, initialTexture: Texture, toppleProbability: number): SimulationResources => {
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

/**
 * Hybrid simulation combining GPU physics and Margolus CA
 * First runs GPU physics pass, then Margolus CA pass
 */
function HybridSimulation({
  worldTexture,
  textureSize,
  onTextureUpdate,
  enabled = true,
  toppleProbability = 0.75,
  resetCount = 0,
}: HybridSimulationProps) {
  const { gl } = useThree();

  // Render targets for ping-pong
  const rt1 = useMemo(() => generateRenderTarget(textureSize), [textureSize]);
  const rt2 = useMemo(() => generateRenderTarget(textureSize), [textureSize]);
  const rt3 = useMemo(() => generateRenderTarget(textureSize), [textureSize]);

  const gpuSceneRef = useRef<SimulationResources | null>(null);
  const margolusSceneRef = useRef<SimulationResources | null>(null);
  const iterationRef = useRef(0);
  const initializedRef = useRef(false);

  // Create simulation resources
  useEffect(() => {
    const gpuResources = createGPUResources(textureSize, worldTexture);
    const margolusResources = createMargolusResources(textureSize, worldTexture, toppleProbability);

    gpuSceneRef.current = gpuResources;
    margolusSceneRef.current = margolusResources;

    // Initialize render targets
    gl.initRenderTarget(rt1);
    gl.initRenderTarget(rt2);
    gl.initRenderTarget(rt3);

    // Clear render targets
    gl.setRenderTarget(rt1);
    gl.clear();
    gl.setRenderTarget(rt2);
    gl.clear();
    gl.setRenderTarget(rt3);
    gl.clear();
    gl.setRenderTarget(null);

    // Reset iteration counter
    iterationRef.current = 0;
    initializedRef.current = true;

    return () => {
      gpuResources.scene.remove(gpuResources.mesh);
      gpuResources.geometry.dispose();
      gpuResources.material.dispose();

      margolusResources.scene.remove(margolusResources.mesh);
      margolusResources.geometry.dispose();
      margolusResources.material.dispose();

      rt1.dispose();
      rt2.dispose();
      rt3.dispose();
    };
  }, [textureSize, worldTexture, toppleProbability, resetCount, gl, rt1, rt2, rt3]);

  // Update topple probability when it changes
  useEffect(() => {
    if (margolusSceneRef.current) {
      margolusSceneRef.current.material.uniforms.uToppleProbability.value = toppleProbability;
    }
  }, [toppleProbability]);

  // Run hybrid simulation each frame
  useFrame((_, delta) => {
    const gpuScene = gpuSceneRef.current;
    const margolusScene = margolusSceneRef.current;

    if (!enabled || !gpuScene || !margolusScene || !initializedRef.current) {
      return;
    }

    // PASS 1: GPU Physics (2 iterations)
    gpuScene.material.uniforms.uCurrentState.value = worldTexture;
    gpuScene.material.uniforms.uTextureSize.value.set(textureSize, textureSize);
    gpuScene.camera.position.z = 1;
    gpuScene.camera.updateProjectionMatrix();

    const GPU_ITERATIONS = 2;
    const iterationDelta = delta / GPU_ITERATIONS;
    gpuScene.material.uniforms.uDeltaTime.value = iterationDelta;

    for (let i = 0; i < GPU_ITERATIONS; i++) {
      const sourceRT = i === 0 ? null : (i % 2 === 0 ? rt2 : rt1);
      const targetRT = i % 2 === 0 ? rt1 : rt2;

      if (sourceRT) {
        gpuScene.material.uniforms.uCurrentState.value = sourceRT.texture;
      }

      gl.setRenderTarget(targetRT);
      gl.render(gpuScene.scene, gpuScene.camera);
      gl.setRenderTarget(null);
    }

    // GPU result is in rt1 after 2 iterations (since i=0 writes to rt1, i=1 writes to rt2)
    // After GPU_ITERATIONS=2: last iteration i=1, targetRT = rt2
    const gpuResultRT = rt2;

    // PASS 2: Margolus CA (2 iterations using rt1 and rt3)
    margolusScene.material.uniforms.uTextureSize.value.set(textureSize, textureSize);
    margolusScene.camera.position.z = 1;
    margolusScene.camera.updateProjectionMatrix();

    const MARGOLUS_STEPS = 2;

    for (let i = 0; i < MARGOLUS_STEPS; i++) {
      // Use rt1 and rt3 for Margolus ping-pong (avoiding rt2 which has GPU result)
      const sourceRT = i === 0 ? gpuResultRT : (i % 2 === 0 ? rt3 : rt1);
      const targetRT = i % 2 === 0 ? rt1 : rt3;

      // Update iteration and random seed
      margolusScene.material.uniforms.uIteration.value = iterationRef.current % 4;
      margolusScene.material.uniforms.uRandomSeed.value = Math.random() * 1000;
      margolusScene.material.uniforms.uCurrentState.value = sourceRT.texture;

      gl.setRenderTarget(targetRT);
      gl.render(margolusScene.scene, margolusScene.camera);
      gl.setRenderTarget(null);

      iterationRef.current = (iterationRef.current + 1) % 4;
    }

    // Read final result (after 2 Margolus steps: i=0 writes to rt1, i=1 writes to rt3)
    const finalRT = rt3;
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

export default HybridSimulation;
