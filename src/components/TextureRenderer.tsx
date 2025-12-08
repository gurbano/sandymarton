import { useRef, useMemo, useEffect, useState } from 'react';
import {
  DataTexture,
  ShaderMaterial,
  Mesh,
  Texture,
  WebGLRenderTarget,
  NearestFilter,
  RGBAFormat,
  UnsignedByteType,
  Scene,
  OrthographicCamera,
  PlaneGeometry,
} from 'three';
import { vertexShader, fragmentShader } from '../shaders/rendererShader';
import { baseColorVertexShader, baseColorFragmentShader } from '../shaders/baseColorShader';
import { useThree, useFrame } from '@react-three/fiber';
import PostProcessRenderer from './PostProcessRenderer';
import type { RenderConfig } from '../types/RenderConfig';
import { WORLD_SIZE } from '../constants/worldConstants';

interface TextureRendererProps {
  texture: Texture;
  heatTexture: DataTexture | null; // Heat/force layer texture
  pixelSize?: number;
  center?: { x: number; y: number };
  renderConfig?: RenderConfig; // Optional post-processing config
}

function TextureRenderer({
  texture,
  heatTexture,
  pixelSize = 16,
  center = { x: 0, y: 0 },
  renderConfig,
}: TextureRendererProps) {
  const meshRef = useRef<Mesh>(null);
  const { size, gl } = useThree();
  const [canvasSize, setCanvasSize] = useState([size.width, size.height]);
  const [postProcessedTexture, setPostProcessedTexture] = useState<Texture | null>(null);

  useEffect(() => {
    setCanvasSize([size.width, size.height]);
  }, [size.width, size.height]);

  // Base color rendering resources (only created if renderConfig is provided)
  const baseColorResources = useMemo(() => {
    if (!renderConfig) return null;

    const textureSize = WORLD_SIZE;
    const renderTarget = new WebGLRenderTarget(textureSize, textureSize, {
      type: UnsignedByteType,
      format: RGBAFormat,
      minFilter: NearestFilter,
      magFilter: NearestFilter,
      depthBuffer: false,
      stencilBuffer: false,
    });

    const scene = new Scene();
    const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const geometry = new PlaneGeometry(2, 2);
    const material = new ShaderMaterial({
      uniforms: {
        uStateTexture: { value: texture },
      },
      vertexShader: baseColorVertexShader,
      fragmentShader: baseColorFragmentShader,
    });
    const mesh = new Mesh(geometry, material);
    scene.add(mesh);

    return { renderTarget, scene, camera, material, geometry, mesh };
  }, [renderConfig, texture]);

  // Cleanup base color resources
  useEffect(() => {
    if (!baseColorResources) return;

    return () => {
      baseColorResources.renderTarget.dispose();
      baseColorResources.scene.remove(baseColorResources.mesh);
      baseColorResources.geometry.dispose();
      baseColorResources.material.dispose();
    };
  }, [baseColorResources]);

  const shaderMaterial = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: {
          uTexture: { value: texture },
          uStateTexture: { value: texture }, // Always points to the state texture
          uTextureSize: { value: [WORLD_SIZE, WORLD_SIZE] },
          uCanvasSize: { value: canvasSize },
          uPixelSize: { value: pixelSize },
          uCenter: { value: [center.x, center.y] },
          uIsColorTexture: { value: false },
          uTime: { value: 0 },
        },
        vertexShader,
        fragmentShader,
        transparent: true,
      }),
    []
  );

  // Update time and render base colors each frame
  useFrame((state) => {
    // Update time uniform for liquid animation
    shaderMaterial.uniforms.uTime.value = state.clock.elapsedTime;

    if (!baseColorResources) return;

    // Update state texture
    baseColorResources.material.uniforms.uStateTexture.value = texture;

    // Render to base color render target
    gl.setRenderTarget(baseColorResources.renderTarget);
    gl.render(baseColorResources.scene, baseColorResources.camera);
    gl.setRenderTarget(null);
  });

  // Update uniforms when props change
  useEffect(() => {
    // Use post-processed texture if available, otherwise use the raw state texture
    const displayTexture = postProcessedTexture || texture;
    const isColorTexture = postProcessedTexture !== null;

    shaderMaterial.uniforms.uTexture.value = displayTexture;
    shaderMaterial.uniforms.uStateTexture.value = texture; // Always use state texture for particle type
    shaderMaterial.uniforms.uIsColorTexture.value = isColorTexture;
    shaderMaterial.uniforms.uCanvasSize.value = canvasSize;
    shaderMaterial.uniforms.uPixelSize.value = pixelSize;
    shaderMaterial.uniforms.uCenter.value = [center.x, center.y];
    shaderMaterial.needsUpdate = true;
  }, [shaderMaterial, texture, postProcessedTexture, canvasSize, pixelSize, center]);

  const handlePostProcessComplete = (finalTexture: Texture) => {
    setPostProcessedTexture(finalTexture);
  };

  return (
    <>
      {renderConfig && baseColorResources && (
        <PostProcessRenderer
          colorTexture={baseColorResources.renderTarget.texture}
          stateTexture={texture}
          heatTexture={heatTexture}
          textureSize={WORLD_SIZE}
          config={renderConfig}
          onRenderComplete={handlePostProcessComplete}
        />
      )}
      <mesh ref={meshRef}>
        <planeGeometry args={[2, 2]} />
        <primitive object={shaderMaterial} attach="material" />
      </mesh>
    </>
  );
}

export default TextureRenderer;
