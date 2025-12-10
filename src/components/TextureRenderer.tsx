import { useRef, useMemo, useEffect, useState } from 'react';
import type { RefObject } from 'react';
import {
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
  Vector2,
  Vector3,
} from 'three';
import { vertexShader, fragmentShader } from '../shaders/rendererShader';
import { baseColorVertexShader, baseColorFragmentShader } from '../shaders/baseColorShader';
import { useThree, useFrame } from '@react-three/fiber';
import PostProcessRenderer from './PostProcessRenderer';
import type { RenderConfig } from '../types/RenderConfig';
import { WORLD_SIZE } from '../constants/worldConstants';

const MAX_BACKGROUND_COLORS = 6;

interface TextureRendererProps {
  /** Ref to world state texture (avoids prop-based re-renders) */
  textureRef: RefObject<Texture | null>;
  /** Ref to heat RT texture (shared from MainSimulation, avoids GPU read-back) */
  heatTextureRef: RefObject<Texture | null>;
  pixelSize?: number;
  center?: { x: number; y: number };
  renderConfig?: RenderConfig; // Optional post-processing config
  backgroundTexture?: Texture | null;
  backgroundPalette?: [number, number, number][];
  backgroundSeed?: number;
  backgroundNoiseOffsets?: [number, number, number, number];
}

function TextureRenderer({
  textureRef,
  heatTextureRef,
  pixelSize = 16,
  center = { x: 0, y: 0 },
  renderConfig,
  backgroundTexture = null,
  backgroundPalette,
  backgroundSeed = 0,
  backgroundNoiseOffsets = [0, 0, 0, 0],
}: TextureRendererProps) {
  const meshRef = useRef<Mesh>(null);
  const { size, gl } = useThree();
  const [canvasSize, setCanvasSize] = useState([size.width, size.height]);
  const [postProcessedTexture, setPostProcessedTexture] = useState<Texture | null>(null);

  useEffect(() => {
    setCanvasSize([size.width, size.height]);
  }, [size.width, size.height]);

  // Base color rendering resources (only created if renderConfig is provided)
  // Created once, textures updated in useFrame
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
        uStateTexture: { value: null }, // Will be set in useFrame
      },
      vertexShader: baseColorVertexShader,
      fragmentShader: baseColorFragmentShader,
    });
    const mesh = new Mesh(geometry, material);
    scene.add(mesh);

    return { renderTarget, scene, camera, material, geometry, mesh };
  }, [renderConfig]);

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

  // Shader material created once, uniforms updated in useFrame
  const shaderMaterial = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: {
          uTexture: { value: null },
          uStateTexture: { value: null },
          uTextureSize: { value: [WORLD_SIZE, WORLD_SIZE] },
          uCanvasSize: { value: canvasSize },
          uPixelSize: { value: pixelSize },
          uCenter: { value: [center.x, center.y] },
          uIsColorTexture: { value: false },
          uBackgroundTexture: { value: null },
          uHasBackground: { value: backgroundTexture ? 1 : 0 },
          uBackgroundPalette: {
            value: Array.from({ length: MAX_BACKGROUND_COLORS }, () => new Vector3(0, 0, 0)),
          },
          uBackgroundPaletteSize: { value: 0 },
          uBackgroundSeed: { value: 0 },
          uBackgroundNoiseOffsets: {
            value: [new Vector2(0, 0), new Vector2(0, 0)],
          },
          uTime: { value: 0 },
        },
        vertexShader,
        fragmentShader,
        transparent: true,
      }),
    []
  );

  // Update all uniforms each frame (reads from refs, no React re-renders needed)
  useFrame((state) => {
    const texture = textureRef.current;
    if (!texture) return;

    // Update time uniform for liquid animation
    shaderMaterial.uniforms.uTime.value = state.clock.elapsedTime;

    // Update texture uniforms from refs each frame
    const displayTexture = postProcessedTexture || texture;
    const isColorTexture = postProcessedTexture !== null;

    shaderMaterial.uniforms.uTexture.value = displayTexture;
    shaderMaterial.uniforms.uStateTexture.value = texture;
    shaderMaterial.uniforms.uIsColorTexture.value = isColorTexture;
    shaderMaterial.uniforms.uBackgroundTexture.value = backgroundTexture ?? displayTexture;

    // Render base colors if resources exist
    if (baseColorResources) {
      baseColorResources.material.uniforms.uStateTexture.value = texture;
      gl.setRenderTarget(baseColorResources.renderTarget);
      gl.render(baseColorResources.scene, baseColorResources.camera);
      gl.setRenderTarget(null);
    }
  });

  // Update non-texture uniforms when props change
  useEffect(() => {
    shaderMaterial.uniforms.uCanvasSize.value = canvasSize;
    shaderMaterial.uniforms.uPixelSize.value = pixelSize;
    shaderMaterial.uniforms.uCenter.value = [center.x, center.y];
    shaderMaterial.uniforms.uHasBackground.value = backgroundTexture ? 1 : 0;

    const palette = backgroundPalette ?? [];
    const paletteUniform = shaderMaterial.uniforms.uBackgroundPalette
      .value as Vector3[];
    const paletteSize = Math.min(palette.length, MAX_BACKGROUND_COLORS);
    for (let i = 0; i < MAX_BACKGROUND_COLORS; i += 1) {
      if (i < paletteSize) {
        const [r, g, b] = palette[i];
        paletteUniform[i].set(r / 255, g / 255, b / 255);
      } else {
        paletteUniform[i].set(0, 0, 0);
      }
    }
    shaderMaterial.uniforms.uBackgroundPaletteSize.value = paletteSize;
    shaderMaterial.uniforms.uBackgroundSeed.value = backgroundSeed;
    const noiseUniform = shaderMaterial.uniforms.uBackgroundNoiseOffsets
      .value as Vector2[];
    noiseUniform[0].set(backgroundNoiseOffsets[0], backgroundNoiseOffsets[1]);
    noiseUniform[1].set(backgroundNoiseOffsets[2], backgroundNoiseOffsets[3]);
    shaderMaterial.needsUpdate = true;
  }, [
    shaderMaterial,
    canvasSize,
    pixelSize,
    center,
    backgroundTexture,
    backgroundPalette,
    backgroundSeed,
    backgroundNoiseOffsets,
  ]);

  const handlePostProcessComplete = (finalTexture: Texture) => {
    setPostProcessedTexture(finalTexture);
  };

  return (
    <>
      {renderConfig && baseColorResources && (
        <PostProcessRenderer
          colorTexture={baseColorResources.renderTarget.texture}
          stateTextureRef={textureRef}
          heatTextureRef={heatTextureRef}
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
