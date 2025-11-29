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
import { WorldGeneration } from '../world/WorldGeneration';

interface SimulationRendererProps {
  initialState: Texture;
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
 * SimulationRenderer handles the GPU-based particle simulation using ping-pong rendering
 * It maintains two render targets and swaps between them each frame
 */
function SimulationRenderer({ initialState, textureSize, onTextureUpdate, enabled = false }: SimulationRendererProps) {
  const { gl } = useThree();

  const rtA = useMemo(() => generateRenderTarget(textureSize), [textureSize]);
  const rtB = useMemo(() => generateRenderTarget(textureSize), [textureSize]);
  const ping = useRef(true);

  const simSceneRef = useRef<SimulationResources | null>(null);

  useEffect(() => {
    const resources = createSimulationResources(textureSize, rtA.texture);
    simSceneRef.current = resources;

    return () => {
      resources.scene.remove(resources.mesh);
      resources.geometry.dispose();
      resources.material.dispose();
    };
  }, [textureSize, rtA.texture]);

  useEffect(() => {
    const simScene = simSceneRef.current;
    if (!simScene) {
      return;
    }

    // Initialize rtA with the provided initial state
    gl.initRenderTarget(rtA);
    gl.initRenderTarget(rtB);

    gl.setRenderTarget(rtA);
    gl.clear();
    gl.copyTextureToTexture(initialState, rtA.texture);
    gl.setRenderTarget(null);

    simScene.material.uniforms.uCurrentState.value = rtA.texture;
    console.log('Initialized simulation with initial state', rtA.texture, initialState);
    // onTextureUpdate(rtA.texture as DataTexture);
    onTextureUpdate(new WorldGeneration(2048, 2048).initNewWorld({ grid: true }) as DataTexture);

    ping.current = true;
  }, [simSceneRef.current]);

  useEffect(() => {
    return () => {
      rtA.dispose();
      rtB.dispose();
    };
  }, [rtA, rtB]);
  useFrame((_, delta) => {
    const simScene = simSceneRef.current;
    if (!enabled || !simScene || enabled) {
      return;
    }

    const currentRT = ping.current ? rtA : rtB;
    const nextRT = ping.current ? rtB : rtA;

    simScene.material.uniforms.uDeltaTime.value = delta;
    simScene.material.uniforms.uCurrentState.value = currentRT.texture;
    simScene.material.uniforms.uTextureSize.value.set(textureSize, textureSize);

    simScene.camera.position.z = 1;
    simScene.camera.updateProjectionMatrix();

    gl.setRenderTarget(nextRT);
    gl.render(simScene.scene, simScene.camera);
    gl.setRenderTarget(null);

    onTextureUpdate(nextRT.texture as DataTexture);
    ping.current = !ping.current;
  }, 1);

  return null;
}

export default SimulationRenderer;
