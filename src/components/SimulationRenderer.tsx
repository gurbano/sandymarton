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
import { useFrame, useThree } from '@react-three/fiber';

interface SimulationRendererProps {
  worldTexture: DataTexture;
  textureSize: number;
  onTextureUpdate: (texture: DataTexture) => void;
  enabled?: boolean;

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

const createSimulationResources = (size: number, initialTexture: Texture): SimulationResources => {
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

/**
 * SimulationRenderer handles the GPU-based particle simulation
 * It reads the worldTexture (which may have been modified by particle drawing),
 * runs the simulation shader, and outputs a new texture each frame
 */
function SimulationRenderer({ resetCount, worldTexture, textureSize, onTextureUpdate, enabled = false }: SimulationRendererProps) {
  const { gl } = useThree();

  // Single render target for output
  const outputRT = useMemo(() => generateRenderTarget(textureSize), [textureSize]);

  const simSceneRef = useRef<SimulationResources | null>(null);

  // Create simulation resources
  useEffect(() => {
    const resources = createSimulationResources(textureSize, worldTexture);
    simSceneRef.current = resources;

    return () => {
      resources.scene.remove(resources.mesh);
      resources.geometry.dispose();
      resources.material.dispose();
    };
  }, [textureSize, worldTexture, resetCount]);

  // Initialize render target once
  useEffect(() => {
    gl.initRenderTarget(outputRT);

    return () => {
      outputRT.dispose();
    };
  }, [gl, outputRT]);

  // Ping-pong render targets for iterative simulation
  const pingRT = useMemo(() => generateRenderTarget(textureSize), [textureSize]);
  const pongRT = useMemo(() => generateRenderTarget(textureSize), [textureSize]);

  useEffect(() => {
    gl.initRenderTarget(pingRT);
    gl.initRenderTarget(pongRT);

    return () => {
      pingRT.dispose();
      pongRT.dispose();
    };
  }, [gl, pingRT, pongRT]);

  // Run simulation each frame
  useFrame((_, delta) => {
    const simScene = simSceneRef.current;
    if (!enabled || !simScene) {
      return;
    }

    // Run multiple iterations per frame for faster settling
    const ITERATIONS_PER_FRAME = 2;

    // Start with the current world texture
    simScene.material.uniforms.uCurrentState.value = worldTexture;
    simScene.material.uniforms.uTextureSize.value.set(textureSize, textureSize);
    simScene.camera.position.z = 1;
    simScene.camera.updateProjectionMatrix();

    // Divide delta time across iterations
    const iterationDelta = delta / ITERATIONS_PER_FRAME;
    simScene.material.uniforms.uDeltaTime.value = iterationDelta;

    // Ping-pong between render targets
    for (let i = 0; i < ITERATIONS_PER_FRAME; i++) {
      const sourceRT = i === 0 ? null : (i % 2 === 0 ? pongRT : pingRT);
      const targetRT = i % 2 === 0 ? pingRT : pongRT;

      // Update source texture
      if (sourceRT) {
        simScene.material.uniforms.uCurrentState.value = sourceRT.texture;
      }

      // Render to target
      gl.setRenderTarget(targetRT);
      gl.render(simScene.scene, simScene.camera);
      gl.setRenderTarget(null);
    }

    // Read final result from the last target used
    const finalRT = (ITERATIONS_PER_FRAME - 1) % 2 === 0 ? pingRT : pongRT;
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

export default SimulationRenderer;
