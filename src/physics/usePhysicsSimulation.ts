/**
 * usePhysicsSimulation - React hook for integrating Rapier physics with the simulation
 *
 * Handles:
 * - Physics world initialization
 * - Particle extraction from world texture via GPU
 * - Physics stepping
 * - Particle reintegration back to world texture
 * - Collision geometry sync
 */

import { useEffect, useRef, useMemo, useCallback } from 'react';
import {
  WebGLRenderTarget,
  FloatType,
  RGBAFormat,
  NearestFilter,
  DataTexture,
  ShaderMaterial,
  PlaneGeometry,
  Mesh,
  Scene,
  OrthographicCamera,
  Vector2,
  Texture,
} from 'three';
import type { WebGLRenderer } from 'three';
import { getPhysicsManager, type SettledParticle } from './PhysicsManager';
import {
  forceExtractionVertexShader,
  forceExtractionFragmentShader,
} from '../shaders/forceExtractionShader';
import {
  particleRemovalVertexShader,
  particleRemovalFragmentShader,
} from '../shaders/particleRemovalShader';
import {
  particleReintegrationVertexShader,
  particleReintegrationFragmentShader,
} from '../shaders/particleReintegrationShader';
import {
  EXTRACTION_BUFFER_SIZE,
  type PhysicsConfig,
  DEFAULT_PHYSICS_CONFIG,
} from '../types/PhysicsConfig';

interface UsePhysicsSimulationProps {
  gl: WebGLRenderer;
  worldTexture: DataTexture;
  textureSize: number;
  heatForceTexture: Texture | null;
  enabled: boolean;
  config?: Partial<PhysicsConfig>;
  onParticleCountUpdate?: (count: number) => void;
  /** Force overlay enabled - triggers more frequent collision rebuilds for visualization */
  forceOverlayEnabled?: boolean;
}

interface PhysicsSimulationResult {
  /** Call this each frame to run physics extraction, stepping, and reintegration */
  runPhysicsStep: (
    currentWorldSource: Texture,
    renderTargets: WebGLRenderTarget[],
    rtIndex: number,
    elapsedTime: number,
    currentHeatTexture: Texture
  ) => { newSource: Texture; newRtIndex: number };
  /** Check if physics is initialized and ready */
  isReady: boolean;
  /** Get current active particle count */
  particleCount: number;
  /** Get current rigid body count */
  rigidBodyCount: number;
  /** Spawn a box rigid body */
  spawnBox: (x: number, y: number, width: number, height: number, angle?: number) => number | null;
  /** Spawn a circle rigid body */
  spawnCircle: (x: number, y: number, radius: number) => number | null;
  /** Clear all physics objects */
  clear: () => void;
}

type SimulationResources = {
  scene: Scene;
  camera: OrthographicCamera;
  material: ShaderMaterial;
  geometry: PlaneGeometry;
  mesh: Mesh;
};

/**
 * Create simulation resources for a shader pass
 */
function createShaderResources(
  vertexShader: string,
  fragmentShader: string
): SimulationResources {
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

export function usePhysicsSimulation({
  gl,
  worldTexture,
  textureSize,
  heatForceTexture,
  enabled,
  config = {},
  onParticleCountUpdate,
  forceOverlayEnabled = false,
}: UsePhysicsSimulationProps): PhysicsSimulationResult {
  const physicsManager = getPhysicsManager();
  const initializedRef = useRef(false);
  const lastCollisionRebuildRef = useRef(0);
  const lastCountUpdateRef = useRef(0);

  // Merge config with defaults
  const fullConfig = useMemo(
    () => ({ ...DEFAULT_PHYSICS_CONFIG, ...config }),
    [config]
  );

  // Extraction render target (64x1)
  const extractionRT = useMemo(
    () =>
      new WebGLRenderTarget(EXTRACTION_BUFFER_SIZE, 1, {
        type: FloatType,
        format: RGBAFormat,
        minFilter: NearestFilter,
        magFilter: NearestFilter,
        depthBuffer: false,
        stencilBuffer: false,
      }),
    []
  );

  // Removal data texture (64x1) - stores positions to remove
  const removalTexture = useMemo(() => {
    const data = new Float32Array(EXTRACTION_BUFFER_SIZE * 4);
    const tex = new DataTexture(
      data,
      EXTRACTION_BUFFER_SIZE,
      1,
      RGBAFormat,
      FloatType
    );
    tex.minFilter = NearestFilter;
    tex.magFilter = NearestFilter;
    return tex;
  }, []);

  // Reintegration data texture (64x1) - stores particles to add
  const reintegrationTexture = useMemo(() => {
    const data = new Float32Array(EXTRACTION_BUFFER_SIZE * 4);
    const tex = new DataTexture(
      data,
      EXTRACTION_BUFFER_SIZE,
      1,
      RGBAFormat,
      FloatType
    );
    tex.minFilter = NearestFilter;
    tex.magFilter = NearestFilter;
    return tex;
  }, []);

  // Pixel buffer for extraction readback
  const extractionPixels = useMemo(
    () => new Float32Array(EXTRACTION_BUFFER_SIZE * 4),
    []
  );

  // Shader resources
  const extractionResources = useMemo(
    () =>
      createShaderResources(
        forceExtractionVertexShader,
        forceExtractionFragmentShader
      ),
    []
  );

  const removalResources = useMemo(
    () =>
      createShaderResources(
        particleRemovalVertexShader,
        particleRemovalFragmentShader
      ),
    []
  );

  const reintegrationResources = useMemo(
    () =>
      createShaderResources(
        particleReintegrationVertexShader,
        particleReintegrationFragmentShader
      ),
    []
  );

  // Initialize extraction shader uniforms
  useEffect(() => {
    const mat = extractionResources.material;
    mat.uniforms.uWorldTexture = { value: worldTexture };
    mat.uniforms.uHeatForceTexture = { value: heatForceTexture };
    mat.uniforms.uTextureSize = { value: new Vector2(textureSize, textureSize) };
    mat.uniforms.uForceThreshold = { value: fullConfig.forceEjectionThreshold };
    mat.uniforms.uEjectionVelocityMultiplier = {
      value: fullConfig.ejectionVelocityMultiplier,
    };
    mat.uniforms.uTime = { value: 0 };
  }, [
    extractionResources,
    worldTexture,
    heatForceTexture,
    textureSize,
    fullConfig,
  ]);

  // Initialize removal shader uniforms
  useEffect(() => {
    const mat = removalResources.material;
    mat.uniforms.uCurrentState = { value: worldTexture };
    mat.uniforms.uRemovalTexture = { value: removalTexture };
    mat.uniforms.uTextureSize = { value: new Vector2(textureSize, textureSize) };
    mat.uniforms.uRemovalCount = { value: 0 };
  }, [removalResources, worldTexture, removalTexture, textureSize]);

  // Initialize reintegration shader uniforms
  useEffect(() => {
    const mat = reintegrationResources.material;
    mat.uniforms.uCurrentState = { value: worldTexture };
    mat.uniforms.uReintegrationTexture = { value: reintegrationTexture };
    mat.uniforms.uTextureSize = { value: new Vector2(textureSize, textureSize) };
    mat.uniforms.uReintegrationCount = { value: 0 };
  }, [reintegrationResources, worldTexture, reintegrationTexture, textureSize]);

  // Initialize Rapier physics
  useEffect(() => {
    if (!enabled) return;

    const init = async () => {
      try {
        await physicsManager.init();
        physicsManager.setConfig(fullConfig);
        physicsManager.createBoundaryWalls(textureSize, textureSize);
        initializedRef.current = true;
        console.log('[usePhysicsSimulation] Physics initialized');
      } catch (error) {
        console.error('[usePhysicsSimulation] Failed to initialize physics:', error);
      }
    };

    init();

    return () => {
      // Don't dispose on unmount - PhysicsManager is a singleton
    };
  }, [enabled, physicsManager, fullConfig, textureSize]);

  // Update config when it changes
  useEffect(() => {
    if (initializedRef.current) {
      physicsManager.setConfig(fullConfig);
    }
  }, [physicsManager, fullConfig]);

  /**
   * Run extraction pass - find particles affected by force
   */
  const runExtraction = useCallback(
    (currentSource: Texture, elapsedTime: number, currentHeatTexture: Texture): Array<{ x: number; y: number; vx: number; vy: number }> => {
      if (!currentHeatTexture) return [];

      // Update uniforms - use the current heat texture (which has buildable force applied)
      const mat = extractionResources.material;
      mat.uniforms.uWorldTexture.value = currentSource;
      mat.uniforms.uHeatForceTexture.value = currentHeatTexture;
      mat.uniforms.uTime.value = elapsedTime;
      mat.uniforms.uForceThreshold.value = fullConfig.forceEjectionThreshold;

      extractionResources.camera.position.z = 1;
      extractionResources.camera.updateProjectionMatrix();

      // Render extraction pass
      gl.setRenderTarget(extractionRT);
      gl.render(extractionResources.scene, extractionResources.camera);

      // Read back results
      gl.readRenderTargetPixels(
        extractionRT,
        0,
        0,
        EXTRACTION_BUFFER_SIZE,
        1,
        extractionPixels
      );

      gl.setRenderTarget(null);

      // Parse extracted particles
      const extracted: Array<{ x: number; y: number; vx: number; vy: number }> = [];
      for (let i = 0; i < EXTRACTION_BUFFER_SIZE; i++) {
        const x = extractionPixels[i * 4];
        const y = extractionPixels[i * 4 + 1];
        const vx = extractionPixels[i * 4 + 2];
        const vy = extractionPixels[i * 4 + 3];

        // Valid if x >= 0 (invalid marker is -1)
        if (x >= 0) {
          extracted.push({ x, y, vx, vy });
        }
      }

      return extracted;
    },
    [gl, extractionResources, extractionRT, extractionPixels, fullConfig]
  );

  /**
   * Run removal pass - clear extracted particles from world
   */
  const runRemoval = useCallback(
    (
      currentSource: Texture,
      extracted: Array<{ x: number; y: number }>,
      renderTargets: WebGLRenderTarget[],
      rtIndex: number
    ): { newSource: Texture; newRtIndex: number } => {
      if (extracted.length === 0) {
        return { newSource: currentSource, newRtIndex: rtIndex };
      }

      // Update removal texture with positions
      const removalData = removalTexture.image.data as Float32Array;
      for (let i = 0; i < EXTRACTION_BUFFER_SIZE; i++) {
        if (i < extracted.length) {
          removalData[i * 4] = extracted[i].x;
          removalData[i * 4 + 1] = extracted[i].y;
          removalData[i * 4 + 2] = 0;
          removalData[i * 4 + 3] = 0;
        } else {
          removalData[i * 4] = -1; // Invalid marker
          removalData[i * 4 + 1] = -1;
          removalData[i * 4 + 2] = 0;
          removalData[i * 4 + 3] = 0;
        }
      }
      removalTexture.needsUpdate = true;

      // Update uniforms
      const mat = removalResources.material;
      mat.uniforms.uCurrentState.value = currentSource;
      mat.uniforms.uRemovalCount.value = extracted.length;

      removalResources.camera.position.z = 1;
      removalResources.camera.updateProjectionMatrix();

      // Render to next RT
      const targetRT = renderTargets[rtIndex % renderTargets.length];
      gl.setRenderTarget(targetRT);
      gl.render(removalResources.scene, removalResources.camera);
      gl.setRenderTarget(null);

      return { newSource: targetRT.texture, newRtIndex: rtIndex + 1 };
    },
    [gl, removalResources, removalTexture]
  );

  /**
   * Run reintegration pass - place settled particles in world
   */
  const runReintegration = useCallback(
    (
      currentSource: Texture,
      settled: SettledParticle[],
      renderTargets: WebGLRenderTarget[],
      rtIndex: number
    ): { newSource: Texture; newRtIndex: number } => {
      if (settled.length === 0) {
        return { newSource: currentSource, newRtIndex: rtIndex };
      }

      // Update reintegration texture
      const reintegrationData = reintegrationTexture.image.data as Float32Array;
      for (let i = 0; i < EXTRACTION_BUFFER_SIZE; i++) {
        if (i < settled.length) {
          // Convert from Rapier coords (Y=0 at bottom) to screen coords (Y=0 at top)
          const screenY = textureSize - settled[i].y;
          reintegrationData[i * 4] = settled[i].x;
          reintegrationData[i * 4 + 1] = screenY;
          reintegrationData[i * 4 + 2] = settled[i].type;
          reintegrationData[i * 4 + 3] = settled[i].temperature;
        } else {
          reintegrationData[i * 4] = -1; // Invalid marker
          reintegrationData[i * 4 + 1] = -1;
          reintegrationData[i * 4 + 2] = 0;
          reintegrationData[i * 4 + 3] = 0;
        }
      }
      reintegrationTexture.needsUpdate = true;

      // Update uniforms
      const mat = reintegrationResources.material;
      mat.uniforms.uCurrentState.value = currentSource;
      mat.uniforms.uReintegrationCount.value = settled.length;

      reintegrationResources.camera.position.z = 1;
      reintegrationResources.camera.updateProjectionMatrix();

      // Render to next RT
      const targetRT = renderTargets[rtIndex % renderTargets.length];
      gl.setRenderTarget(targetRT);
      gl.render(reintegrationResources.scene, reintegrationResources.camera);
      gl.setRenderTarget(null);

      return { newSource: targetRT.texture, newRtIndex: rtIndex + 1 };
    },
    [gl, reintegrationResources, reintegrationTexture, textureSize]
  );

  /**
   * Main physics step function - called each frame
   */
  const runPhysicsStep = useCallback(
    (
      currentWorldSource: Texture,
      renderTargets: WebGLRenderTarget[],
      rtIndex: number,
      elapsedTime: number,
      currentHeatTexture: Texture
    ): { newSource: Texture; newRtIndex: number } => {
      if (!enabled || !initializedRef.current) {
        return { newSource: currentWorldSource, newRtIndex: rtIndex };
      }

      let currentSource = currentWorldSource;
      let currentRtIndex = rtIndex;

      // 1. Extract particles affected by force (using current heat texture with buildable force)
      const extracted = runExtraction(currentSource, elapsedTime, currentHeatTexture);

      // 2. Get particle types and spawn in physics
      if (extracted.length > 0) {
        const worldData = worldTexture.image.data as Uint8Array;

        for (const p of extracted) {
          const idx = (Math.floor(p.y) * textureSize + Math.floor(p.x)) * 4;
          const type = worldData[idx];
          const tempLow = worldData[idx + 1];
          const tempHigh = worldData[idx + 2];
          const temperature = tempLow + tempHigh * 256;

          // Add 5% random variation to velocity
          const variation = 0.95 + Math.random() * 0.1; // 0.95 to 1.05
          const angleVariation = (Math.random() - 0.5) * 0.1; // Small angle deviation
          const cos = Math.cos(angleVariation);
          const sin = Math.sin(angleVariation);
          const vx = (p.vx * cos - p.vy * sin) * variation;
          const vy = (p.vx * sin + p.vy * cos) * variation;

          // Convert from screen coords (Y=0 at top) to Rapier coords (Y=0 at bottom)
          const rapierY = textureSize - p.y;
          // Flip velocity Y: screen coords have Y-down, Rapier has Y-up
          const rapierVY = -vy;
          physicsManager.spawnParticle(p.x, rapierY, vx, rapierVY, type, temperature);
        }

        // 3. Remove extracted particles from world
        const result = runRemoval(currentSource, extracted, renderTargets, currentRtIndex);
        currentSource = result.newSource;
        currentRtIndex = result.newRtIndex;
      }

      // 4. Step physics simulation
      physicsManager.step();

      // 5. Rebuild collision grid if needed
      const now = performance.now();
      if (physicsManager.shouldRebuildColliders(now, forceOverlayEnabled)) {
        const worldData = worldTexture.image.data as Uint8Array;
        physicsManager.rebuildWorldColliders(worldData, textureSize, textureSize);
        lastCollisionRebuildRef.current = now;
      }

      // 6. Reintegrate settled particles
      const settled = physicsManager.getSettledParticles(fullConfig.maxReintegrationsPerFrame);
      if (settled.length > 0) {
        const result = runReintegration(currentSource, settled, renderTargets, currentRtIndex);
        currentSource = result.newSource;
        currentRtIndex = result.newRtIndex;
      }

      // 7. Update particle count periodically
      if (onParticleCountUpdate && now - lastCountUpdateRef.current > 500) {
        onParticleCountUpdate(physicsManager.activeParticleCount);
        lastCountUpdateRef.current = now;
      }

      return { newSource: currentSource, newRtIndex: currentRtIndex };
    },
    [
      enabled,
      physicsManager,
      worldTexture,
      textureSize,
      fullConfig,
      runExtraction,
      runRemoval,
      runReintegration,
      onParticleCountUpdate,
    ]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      extractionRT.dispose();
      removalTexture.dispose();
      reintegrationTexture.dispose();
      extractionResources.geometry.dispose();
      extractionResources.material.dispose();
      removalResources.geometry.dispose();
      removalResources.material.dispose();
      reintegrationResources.geometry.dispose();
      reintegrationResources.material.dispose();
    };
  }, [
    extractionRT,
    removalTexture,
    reintegrationTexture,
    extractionResources,
    removalResources,
    reintegrationResources,
  ]);

  return {
    runPhysicsStep,
    isReady: initializedRef.current,
    particleCount: physicsManager.particleCount,
    rigidBodyCount: physicsManager.rigidBodyCount,
    spawnBox: (x, y, width, height, angle) =>
      physicsManager.spawnBox(x, y, width, height, angle),
    spawnCircle: (x, y, radius) => physicsManager.spawnCircle(x, y, radius),
    clear: () => physicsManager.clear(),
  };
}
