/**
 * useRigidBodyShaders - React hook for rigid body shader passes
 *
 * Handles:
 * - Rigid body mask texture generation (for Margolus/liquid shaders)
 * - Rigid body force injection into heat/force texture
 */

import { useEffect, useMemo, useCallback } from 'react';
import {
  WebGLRenderTarget,
  FloatType,
  RGBAFormat,
  UnsignedByteType,
  NearestFilter,
  DataTexture,
  ShaderMaterial,
  PlaneGeometry,
  Mesh,
  Scene,
  OrthographicCamera,
  Vector2,
  Texture,
  Color,
} from 'three';
import type { WebGLRenderer } from 'three';
import { getPhysicsManager } from './PhysicsManager';
import {
  rigidBodyToHeatVertexShader,
  rigidBodyToHeatFragmentShader,
} from '../shaders/rigidBodyToHeatShader';
import {
  rigidBodyMaskVertexShader,
  rigidBodyMaskFragmentShader,
} from '../shaders/rigidBodyMaskShader';
import { MAX_RIGID_BODIES } from '../types/PhysicsConfig';

interface UseRigidBodyShadersProps {
  gl: WebGLRenderer;
  textureSize: number;
  enabled: boolean;
}

interface RigidBodyShadersResult {
  /** Update data textures from PhysicsManager (call before using shaders) */
  updateDataTextures: () => void;
  /** Run rigid body mask generation pass */
  runMaskPass: () => void;
  /** Run rigid body force injection pass */
  runForcePass: (
    currentHeatSource: Texture,
    heatRenderTargets: WebGLRenderTarget[],
    heatRtIndex: number
  ) => { newSource: Texture; newRtIndex: number };
  /** Get the mask texture for use in other shaders */
  maskTexture: Texture;
  /** Check if there are any rigid bodies */
  hasRigidBodies: boolean;
}

type ShaderResources = {
  scene: Scene;
  camera: OrthographicCamera;
  material: ShaderMaterial;
  geometry: PlaneGeometry;
  mesh: Mesh;
};

function createShaderResources(
  vertexShader: string,
  fragmentShader: string
): ShaderResources {
  const scene = new Scene();
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const geometry = new PlaneGeometry(2, 2);
  const material = new ShaderMaterial({
    uniforms: {},
    vertexShader,
    fragmentShader,
  });
  const mesh = new Mesh(geometry, material);
  scene.add(mesh);
  return { scene, camera, material, geometry, mesh };
}

export function useRigidBodyShaders({
  gl,
  textureSize,
  enabled,
}: UseRigidBodyShadersProps): RigidBodyShadersResult {
  const physicsManager = getPhysicsManager();

  // Data textures for rigid body data (MAX_RIGID_BODIES x 1)
  const positionsTexture = useMemo(() => {
    const data = new Float32Array(MAX_RIGID_BODIES * 4);
    const tex = new DataTexture(data, MAX_RIGID_BODIES, 1, RGBAFormat, FloatType);
    tex.minFilter = NearestFilter;
    tex.magFilter = NearestFilter;
    return tex;
  }, []);

  const velocitiesTexture = useMemo(() => {
    const data = new Float32Array(MAX_RIGID_BODIES * 4);
    const tex = new DataTexture(data, MAX_RIGID_BODIES, 1, RGBAFormat, FloatType);
    tex.minFilter = NearestFilter;
    tex.magFilter = NearestFilter;
    return tex;
  }, []);

  const sizesTexture = useMemo(() => {
    const data = new Float32Array(MAX_RIGID_BODIES * 4);
    const tex = new DataTexture(data, MAX_RIGID_BODIES, 1, RGBAFormat, FloatType);
    tex.minFilter = NearestFilter;
    tex.magFilter = NearestFilter;
    return tex;
  }, []);

  const shapesTexture = useMemo(() => {
    const data = new Uint8Array(MAX_RIGID_BODIES * 4);
    const tex = new DataTexture(data, MAX_RIGID_BODIES, 1, RGBAFormat, UnsignedByteType);
    tex.minFilter = NearestFilter;
    tex.magFilter = NearestFilter;
    return tex;
  }, []);

  // Mask render target (same size as world)
  const maskRT = useMemo(
    () =>
      new WebGLRenderTarget(textureSize, textureSize, {
        format: RGBAFormat,
        type: UnsignedByteType,
        minFilter: NearestFilter,
        magFilter: NearestFilter,
        depthBuffer: false,
        stencilBuffer: false,
      }),
    [textureSize]
  );

  // Shader resources
  const maskResources = useMemo(
    () => createShaderResources(rigidBodyMaskVertexShader, rigidBodyMaskFragmentShader),
    []
  );

  const forceResources = useMemo(
    () => createShaderResources(rigidBodyToHeatVertexShader, rigidBodyToHeatFragmentShader),
    []
  );

  // Initialize mask shader uniforms
  useEffect(() => {
    const mat = maskResources.material;
    mat.uniforms.uRigidBodyPositions = { value: positionsTexture };
    mat.uniforms.uRigidBodySizes = { value: sizesTexture };
    mat.uniforms.uRigidBodyShapes = { value: shapesTexture };
    mat.uniforms.uRigidBodyCount = { value: 0 };
    mat.uniforms.uTextureSize = { value: new Vector2(textureSize, textureSize) };
  }, [maskResources, positionsTexture, sizesTexture, shapesTexture, textureSize]);

  // Initialize force shader uniforms
  useEffect(() => {
    const mat = forceResources.material;
    mat.uniforms.uHeatTexture = { value: null };
    mat.uniforms.uRigidBodyPositions = { value: positionsTexture };
    mat.uniforms.uRigidBodyVelocities = { value: velocitiesTexture };
    mat.uniforms.uRigidBodySizes = { value: sizesTexture };
    mat.uniforms.uRigidBodyShapes = { value: shapesTexture };
    mat.uniforms.uRigidBodyCount = { value: 0 };
    mat.uniforms.uWorldSize = { value: textureSize };
    mat.uniforms.uForceMultiplier = { value: 1.0 };
  }, [forceResources, positionsTexture, velocitiesTexture, sizesTexture, shapesTexture, textureSize]);

  /**
   * Update data textures from PhysicsManager buffers
   */
  const updateDataTextures = useCallback(() => {
    if (!enabled) return;

    const pm = physicsManager;
    const count = pm.rigidBodyCount;

    // Update positions texture
    const posData = positionsTexture.image.data as Float32Array;
    for (let i = 0; i < MAX_RIGID_BODIES; i++) {
      if (i < count) {
        posData[i * 4] = pm.rigidBodyPositions[i * 2];
        posData[i * 4 + 1] = pm.rigidBodyPositions[i * 2 + 1];
        posData[i * 4 + 2] = 0;
        posData[i * 4 + 3] = 1;
      } else {
        posData[i * 4] = 0;
        posData[i * 4 + 1] = 0;
        posData[i * 4 + 2] = 0;
        posData[i * 4 + 3] = 0;
      }
    }
    positionsTexture.needsUpdate = true;

    // Update velocities texture
    const velData = velocitiesTexture.image.data as Float32Array;
    for (let i = 0; i < MAX_RIGID_BODIES; i++) {
      if (i < count) {
        velData[i * 4] = pm.rigidBodyVelocities[i * 2];
        velData[i * 4 + 1] = pm.rigidBodyVelocities[i * 2 + 1];
        velData[i * 4 + 2] = 0;
        velData[i * 4 + 3] = 1;
      } else {
        velData[i * 4] = 0;
        velData[i * 4 + 1] = 0;
        velData[i * 4 + 2] = 0;
        velData[i * 4 + 3] = 0;
      }
    }
    velocitiesTexture.needsUpdate = true;

    // Update sizes texture
    const sizeData = sizesTexture.image.data as Float32Array;
    for (let i = 0; i < MAX_RIGID_BODIES; i++) {
      if (i < count) {
        sizeData[i * 4] = pm.rigidBodySizes[i * 2];
        sizeData[i * 4 + 1] = pm.rigidBodySizes[i * 2 + 1];
        sizeData[i * 4 + 2] = 0;
        sizeData[i * 4 + 3] = 1;
      } else {
        sizeData[i * 4] = 0;
        sizeData[i * 4 + 1] = 0;
        sizeData[i * 4 + 2] = 0;
        sizeData[i * 4 + 3] = 0;
      }
    }
    sizesTexture.needsUpdate = true;

    // Update shapes texture
    const shapeData = shapesTexture.image.data as Uint8Array;
    for (let i = 0; i < MAX_RIGID_BODIES; i++) {
      if (i < count) {
        shapeData[i * 4] = pm.rigidBodyShapes[i];
        shapeData[i * 4 + 1] = 0;
        shapeData[i * 4 + 2] = 0;
        shapeData[i * 4 + 3] = 255;
      } else {
        shapeData[i * 4] = 0;
        shapeData[i * 4 + 1] = 0;
        shapeData[i * 4 + 2] = 0;
        shapeData[i * 4 + 3] = 0;
      }
    }
    shapesTexture.needsUpdate = true;

    // Update uniform counts
    maskResources.material.uniforms.uRigidBodyCount.value = count;
    forceResources.material.uniforms.uRigidBodyCount.value = count;
  }, [
    enabled,
    physicsManager,
    positionsTexture,
    velocitiesTexture,
    sizesTexture,
    shapesTexture,
    maskResources,
    forceResources,
  ]);

  /**
   * Run mask generation pass
   */
  const runMaskPass = useCallback(() => {
    if (!enabled) return;

    // Save current clear color
    const prevClearColor = gl.getClearColor(new Color());
    const prevClearAlpha = gl.getClearAlpha();

    // Always clear the mask (important when rigid bodies are removed)
    gl.setRenderTarget(maskRT);
    gl.setClearColor(0x000000, 1);
    gl.clear();

    // Only render if there are rigid bodies
    if (physicsManager.rigidBodyCount > 0) {
      maskResources.camera.position.z = 1;
      maskResources.camera.updateProjectionMatrix();
      gl.render(maskResources.scene, maskResources.camera);
    }

    gl.setRenderTarget(null);

    // Restore previous clear color
    gl.setClearColor(prevClearColor, prevClearAlpha);
  }, [enabled, physicsManager, gl, maskRT, maskResources]);

  /**
   * Run force injection pass
   */
  const runForcePass = useCallback(
    (
      currentHeatSource: Texture,
      heatRenderTargets: WebGLRenderTarget[],
      heatRtIndex: number
    ): { newSource: Texture; newRtIndex: number } => {
      if (!enabled || physicsManager.rigidBodyCount === 0) {
        return { newSource: currentHeatSource, newRtIndex: heatRtIndex };
      }

      // Update heat texture uniform
      forceResources.material.uniforms.uHeatTexture.value = currentHeatSource;

      forceResources.camera.position.z = 1;
      forceResources.camera.updateProjectionMatrix();

      // Render to next heat RT
      const targetRT = heatRenderTargets[heatRtIndex % heatRenderTargets.length];
      gl.setRenderTarget(targetRT);
      gl.render(forceResources.scene, forceResources.camera);
      gl.setRenderTarget(null);

      return { newSource: targetRT.texture, newRtIndex: heatRtIndex + 1 };
    },
    [enabled, physicsManager, gl, forceResources]
  );

  // Cleanup
  useEffect(() => {
    return () => {
      positionsTexture.dispose();
      velocitiesTexture.dispose();
      sizesTexture.dispose();
      shapesTexture.dispose();
      maskRT.dispose();
      maskResources.geometry.dispose();
      maskResources.material.dispose();
      forceResources.geometry.dispose();
      forceResources.material.dispose();
    };
  }, [
    positionsTexture,
    velocitiesTexture,
    sizesTexture,
    shapesTexture,
    maskRT,
    maskResources,
    forceResources,
  ]);

  return {
    updateDataTextures,
    runMaskPass,
    runForcePass,
    maskTexture: maskRT.texture,
    hasRigidBodies: physicsManager.rigidBodyCount > 0,
  };
}
