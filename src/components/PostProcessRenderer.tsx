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
import { useFrame, useThree } from '@react-three/fiber';
import type { RenderConfig } from '../types/RenderConfig';
import { RenderEffectType, OverlayType } from '../types/RenderConfig';
import {
  postProcessVertexShader,
  edgeBlendingFragmentShader,
  materialVariationFragmentShader,
} from '../shaders/postProcessShaders';
import {
  overlayVertexShader,
  heatOverlayFragmentShader,
  forceOverlayFragmentShader,
} from '../shaders/overlayShaders';

interface PostProcessRendererProps {
  colorTexture: Texture; // Base color texture
  stateTexture: Texture; // Simulation state texture (for material type lookup)
  heatTexture: DataTexture | null; // Heat/force layer texture
  textureSize: number;
  config: RenderConfig;
  onRenderComplete: (texture: Texture) => void;
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

type EffectResources = {
  scene: Scene;
  camera: OrthographicCamera;
  material: ShaderMaterial;
  geometry: PlaneGeometry;
  mesh: Mesh;
};

const createEdgeBlendingResources = (
  size: number,
  colorTexture: Texture,
  stateTexture: Texture
): EffectResources => {
  const scene = new Scene();
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const geometry = new PlaneGeometry(2, 2);
  const material = new ShaderMaterial({
    uniforms: {
      uColorTexture: { value: colorTexture },
      uStateTexture: { value: stateTexture },
      uTextureSize: { value: new Vector2(size, size) },
      uBlendStrength: { value: 0.5 },
    },
    vertexShader: postProcessVertexShader,
    fragmentShader: edgeBlendingFragmentShader,
  });
  const mesh = new Mesh(geometry, material);
  scene.add(mesh);
  return { scene, camera, material, geometry, mesh };
};

const createMaterialVariationResources = (
  size: number,
  colorTexture: Texture,
  stateTexture: Texture
): EffectResources => {
  const scene = new Scene();
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const geometry = new PlaneGeometry(2, 2);
  const material = new ShaderMaterial({
    uniforms: {
      uColorTexture: { value: colorTexture },
      uStateTexture: { value: stateTexture },
      uTextureSize: { value: new Vector2(size, size) },
      uNoiseScale: { value: 4.0 },
      uNoiseStrength: { value: 0.15 },
    },
    vertexShader: postProcessVertexShader,
    fragmentShader: materialVariationFragmentShader,
  });
  const mesh = new Mesh(geometry, material);
  scene.add(mesh);
  return { scene, camera, material, geometry, mesh };
};

const createHeatOverlayResources = (
  size: number,
  colorTexture: Texture,
  heatTexture: Texture | null
): EffectResources => {
  const scene = new Scene();
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const geometry = new PlaneGeometry(2, 2);
  const material = new ShaderMaterial({
    uniforms: {
      uBaseTexture: { value: colorTexture },
      uHeatForceLayer: { value: heatTexture },
      uTextureSize: { value: new Vector2(size, size) },
      uOverlayStrength: { value: 0.7 },
    },
    vertexShader: overlayVertexShader,
    fragmentShader: heatOverlayFragmentShader,
  });
  const mesh = new Mesh(geometry, material);
  scene.add(mesh);
  return { scene, camera, material, geometry, mesh };
};

const createForceOverlayResources = (
  size: number,
  colorTexture: Texture,
  heatTexture: Texture | null
): EffectResources => {
  const scene = new Scene();
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const geometry = new PlaneGeometry(2, 2);
  const material = new ShaderMaterial({
    uniforms: {
      uBaseTexture: { value: colorTexture },
      uHeatForceLayer: { value: heatTexture },
      uTextureSize: { value: new Vector2(size, size) },
      uOverlayStrength: { value: 0.7 },
    },
    vertexShader: overlayVertexShader,
    fragmentShader: forceOverlayFragmentShader,
  });
  const mesh = new Mesh(geometry, material);
  scene.add(mesh);
  return { scene, camera, material, geometry, mesh };
};

/**
 * Post-processing renderer with modular effect pipeline
 * Applies visual effects after simulation
 */
function PostProcessRenderer({
  colorTexture,
  stateTexture,
  heatTexture,
  textureSize,
  config,
  onRenderComplete,
}: PostProcessRendererProps) {
  const { gl } = useThree();

  // Render targets for ping-pong rendering
  const renderTargets = useMemo(() => {
    return [generateRenderTarget(textureSize), generateRenderTarget(textureSize)];
  }, [textureSize]);

  const edgeBlendingRef = useRef<EffectResources | null>(null);
  const materialVariationRef = useRef<EffectResources | null>(null);
  const heatOverlayRef = useRef<EffectResources | null>(null);
  const forceOverlayRef = useRef<EffectResources | null>(null);
  const initializedRef = useRef(false);

  // Create effect resources
  useEffect(() => {
    const edgeBlending = createEdgeBlendingResources(textureSize, colorTexture, stateTexture);
    const materialVariation = createMaterialVariationResources(
      textureSize,
      colorTexture,
      stateTexture
    );
    const heatOverlay = createHeatOverlayResources(textureSize, colorTexture, heatTexture);
    const forceOverlay = createForceOverlayResources(textureSize, colorTexture, heatTexture);

    edgeBlendingRef.current = edgeBlending;
    materialVariationRef.current = materialVariation;
    heatOverlayRef.current = heatOverlay;
    forceOverlayRef.current = forceOverlay;

    // Initialize render targets
    renderTargets.forEach((rt) => {
      gl.initRenderTarget(rt);
      gl.setRenderTarget(rt);
      gl.clear();
    });
    gl.setRenderTarget(null);

    initializedRef.current = true;

    return () => {
      [edgeBlending, materialVariation, heatOverlay, forceOverlay].forEach((resources) => {
        resources.scene.remove(resources.mesh);
        resources.geometry.dispose();
        resources.material.dispose();
      });
      renderTargets.forEach((rt) => rt.dispose());
    };
  }, [textureSize, colorTexture, stateTexture, heatTexture, gl, renderTargets]);

  // Run post-processing pipeline each frame
  useFrame(() => {
    if (!initializedRef.current) {
      return;
    }

    let currentSource: Texture = colorTexture;
    let rtIndex = 0;

    // Execute each enabled effect in order
    for (const effect of config.effects) {
      if (!effect.enabled) continue;

      let resources: EffectResources | null = null;

      switch (effect.type) {
        case RenderEffectType.EDGE_BLENDING:
          resources = edgeBlendingRef.current;
          if (resources) {
            // Update config-specific uniforms
            resources.material.uniforms.uBlendStrength.value = config.edgeBlending.blendStrength;
          }
          break;
        case RenderEffectType.MATERIAL_VARIATION:
          resources = materialVariationRef.current;
          if (resources) {
            // Update config-specific uniforms
            resources.material.uniforms.uNoiseScale.value = config.materialVariation.noiseScale;
            resources.material.uniforms.uNoiseStrength.value =
              config.materialVariation.noiseStrength;
          }
          break;
      }

      if (!resources) continue;

      const targetRT = renderTargets[rtIndex % renderTargets.length];

      // Update common uniforms
      resources.material.uniforms.uColorTexture.value = currentSource;
      resources.material.uniforms.uStateTexture.value = stateTexture;
      resources.material.uniforms.uTextureSize.value.set(textureSize, textureSize);
      resources.camera.position.z = 1;
      resources.camera.updateProjectionMatrix();

      // Render effect
      gl.setRenderTarget(targetRT);
      gl.render(resources.scene, resources.camera);
      gl.setRenderTarget(null);

      // Update source for next effect
      currentSource = targetRT.texture;
      rtIndex++;
    }

    // Execute overlays on top of effects (if heatTexture is available)
    if (heatTexture) {
      for (const overlay of config.overlays) {
        if (!overlay.enabled) continue;

        let resources: EffectResources | null = null;

        switch (overlay.type) {
          case OverlayType.HEAT:
            resources = heatOverlayRef.current;
            break;
          case OverlayType.FORCE:
            resources = forceOverlayRef.current;
            break;
        }

        if (!resources) continue;

        const targetRT = renderTargets[rtIndex % renderTargets.length];

        // Update overlay uniforms
        resources.material.uniforms.uBaseTexture.value = currentSource;
        resources.material.uniforms.uHeatForceLayer.value = heatTexture;
        resources.material.uniforms.uTextureSize.value.set(textureSize, textureSize);
        resources.material.uniforms.uOverlayStrength.value = 0.7;
        resources.camera.position.z = 1;
        resources.camera.updateProjectionMatrix();

        // Render overlay
        gl.setRenderTarget(targetRT);
        gl.render(resources.scene, resources.camera);
        gl.setRenderTarget(null);

        // Update source for next overlay
        currentSource = targetRT.texture;
        rtIndex++;
      }
    }

    // If no effects or overlays were applied, just pass through the original
    const finalTexture = rtIndex > 0 ? currentSource : colorTexture;

    // Notify parent with final rendered texture
    onRenderComplete(finalTexture);
  });

  return null;
}

export default PostProcessRenderer;
