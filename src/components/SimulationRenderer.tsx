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
function SimulationRenderer({ worldTexture, textureSize, onTextureUpdate, enabled = false }: SimulationRendererProps) {
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
  }, [textureSize, worldTexture]);

  // Initialize render target once
  useEffect(() => {
    gl.initRenderTarget(outputRT);

    return () => {
      outputRT.dispose();
    };
  }, [gl, outputRT]);

  // Run simulation each frame
  useFrame((_, delta) => {
    const simScene = simSceneRef.current;
    if (!enabled || !simScene) {
      return;
    }

    // Use the current worldTexture as input (may have particles drawn on it)
    simScene.material.uniforms.uDeltaTime.value = delta;
    simScene.material.uniforms.uCurrentState.value = worldTexture;
    simScene.material.uniforms.uTextureSize.value.set(textureSize, textureSize);

    simScene.camera.position.z = 1;
    simScene.camera.updateProjectionMatrix();

    // Render simulation to output target
    gl.setRenderTarget(outputRT);
    gl.render(simScene.scene, simScene.camera);
    gl.setRenderTarget(null);

    // Read back the result and update worldTexture
    const pixels = new Uint8Array(textureSize * textureSize * 4);
    gl.readRenderTargetPixels(outputRT, 0, 0, textureSize, textureSize, pixels);

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
