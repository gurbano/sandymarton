import { useEffect, useMemo, useRef } from 'react';
import type { RefObject } from 'react';
import {
  Color,
  DataTexture,
  FloatType,
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
import { archimedesFragmentShader, archimedesVertexShader } from '../shaders/archimedesShaders';
import {
  ambientHeatTransferFragmentShader,
  ambientHeatTransferVertexShader,
} from '../shaders/ambientHeatTransferShaders';
import {
  particleOnlyHeatFragmentShader,
  particleOnlyHeatVertexShader,
} from '../shaders/particleOnlyHeatShaders';
import {
  forceTransferFragmentShader,
  forceTransferVertexShader,
} from '../shaders/forceTransferShaders';
import {
  phaseTransitionFragmentShader,
  phaseTransitionVertexShader,
} from '../shaders/phaseTransitionShaders';
import {
  buildablesToHeatFragmentShader,
  buildablesToHeatVertexShader,
} from '../shaders/buildablesToHeatShader';
import {
  buildablesToWorldFragmentShader,
  buildablesToWorldVertexShader,
} from '../shaders/buildablesToWorldShader';
import {
  playerUpdateVertexShader,
  playerOutputFragmentShader,
} from '../shaders/playerUpdateShaders';
import { useFrame, useThree } from '@react-three/fiber';
import { usePhysicsSimulation } from '../physics';
import { useRigidBodyShaders } from '../physics/useRigidBodyShaders';
import type { SimulationConfig } from '../types/SimulationConfig';
import { SimulationStepType, DEFAULT_AMBIENT_HEAT_SETTINGS } from '../types/SimulationConfig';
import { MaterialDefinitions, getDefaultBaseAttributes } from '../world/MaterialDefinitions';
import { ParticleType } from '../world/ParticleTypes';
import {
  getBuildablesManager,
  BUILDABLES_TEXTURE_WIDTH,
  BUILDABLES_TEXTURE_HEIGHT,
} from '../buildables';
import { getPlayerManager, PLAYER_OUTPUT_SIZE } from '../player';

interface MainSimulationProps {
  worldTexture: DataTexture;
  textureSize: number;
  /** @deprecated No longer needed - texture is updated in-place */
  onTextureUpdate?: (texture: DataTexture) => void;
  onHeatTextureReady?: (texture: DataTexture) => void;
  /** Ref to share heat RT texture directly with rendering (avoids GPU read-back) */
  heatRTRef?: RefObject<Texture | null>;
  enabled?: boolean;
  config: SimulationConfig;
  resetCount?: number;
  onFpsUpdate?: (fps: number) => void;
  /** Callback for physics particle count updates */
  onPhysicsParticleCountUpdate?: (count: number) => void;
  shouldCaptureHeatLayer?: boolean;
  /** Force overlay enabled - triggers collision rebuild for visualization */
  forceOverlayEnabled?: boolean;
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

type ShaderConfig = {
  vertexShader: string;
  fragmentShader: string;
};

/**
 * Generic factory for creating simulation resources
 * Eliminates duplication across Margolus, LiquidSpread, and Archimedes
 */
const createSimulationResources = (
  size: number,
  initialTexture: Texture,
  shaderConfig: ShaderConfig
): SimulationResources => {
  const scene = new Scene();
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const geometry = new PlaneGeometry(2, 2);
  const material = new ShaderMaterial({
    uniforms: {
      uTextureSize: { value: new Vector2(size, size) },
      uCurrentState: { value: initialTexture },
      uIteration: { value: 0 },
      uRandomSeed: { value: Math.random() * 1000 },
      uFrictionAmplifier: { value: 1.0 },
    },
    vertexShader: shaderConfig.vertexShader,
    fragmentShader: shaderConfig.fragmentShader,
  });
  const mesh = new Mesh(geometry, material);
  scene.add(mesh);
  return { scene, camera, material, geometry, mesh };
};

/**
 * Main configurable simulation with modular pipeline
 * Steps can be enabled/disabled and configured independently
 */
function MainSimulation({
  worldTexture,
  textureSize,
  onHeatTextureReady,
  heatRTRef,
  enabled = true,
  config,
  resetCount = 0,
  onFpsUpdate,
  onPhysicsParticleCountUpdate,
  shouldCaptureHeatLayer = false,
  forceOverlayEnabled = false,
}: MainSimulationProps) {
  const { gl } = useThree();

  // Render targets for ping-pong rendering (particle state)
  const renderTargets = useMemo(() => {
    return [
      generateRenderTarget(textureSize),
      generateRenderTarget(textureSize),
      generateRenderTarget(textureSize),
      generateRenderTarget(textureSize),
    ];
  }, [textureSize]);

  // Dedicated render targets for heat layer ping-pong
  const heatRenderTargets = useMemo(() => {
    return [generateRenderTarget(textureSize), generateRenderTarget(textureSize)];
  }, [textureSize]);

  // Small render target for player output (4x4) - needs FloatType to store position values
  const playerOutputRT = useMemo(() => {
    return new WebGLRenderTarget(PLAYER_OUTPUT_SIZE, PLAYER_OUTPUT_SIZE, {
      type: FloatType,
      format: RGBAFormat,
      minFilter: NearestFilter,
      magFilter: NearestFilter,
      depthBuffer: false,
      stencilBuffer: false,
    });
  }, []);

  const margolusSceneRef = useRef<SimulationResources | null>(null);
  const liquidSpreadSceneRef = useRef<SimulationResources | null>(null);
  const archimedesSceneRef = useRef<SimulationResources | null>(null);
  const heatTransferSceneRef = useRef<SimulationResources | null>(null);
  const particleOnlyHeatSceneRef = useRef<SimulationResources | null>(null);
  const phaseTransitionSceneRef = useRef<SimulationResources | null>(null);
  const forceTransferSceneRef = useRef<SimulationResources | null>(null);
  const buildablesToHeatSceneRef = useRef<SimulationResources | null>(null);
  const buildablesToWorldSceneRef = useRef<SimulationResources | null>(null);
  const playerOutputSceneRef = useRef<SimulationResources | null>(null);
  const margolusIterationRef = useRef(0);
  const liquidSpreadIterationRef = useRef(0);
  const archimedesIterationRef = useRef(0);
  const heatTransferIterationRef = useRef(0);
  const forceTransferIterationRef = useRef(0);
  const shouldCaptureHeatLayerRef = useRef(shouldCaptureHeatLayer);

  useEffect(() => {
    shouldCaptureHeatLayerRef.current = shouldCaptureHeatLayer;
  }, [shouldCaptureHeatLayer]);
  const initializedRef = useRef(false);

  // Heat/Force layer texture - stores tempLow (R), tempHigh (G), forceX (B), forceY (A)
  const heatForceLayerRef = useRef<DataTexture | null>(null);

  // Track current heat RT index for ping-pong rendering
  const currentHeatRTIndexRef = useRef(0);

  // FPS tracking with circular buffer to prevent memory leak
  const FPS_BUFFER_SIZE = 60; // Store last 60 frame times
  const frameTimesRef = useRef<Float32Array>(new Float32Array(FPS_BUFFER_SIZE));
  const frameTimeIndexRef = useRef(0);
  const frameTimeCountRef = useRef(0);
  const lastFpsUpdateRef = useRef(0);

  // Rapier physics system
  const { runPhysicsStep } = usePhysicsSimulation({
    gl,
    worldTexture,
    textureSize,
    heatForceTexture: heatForceLayerRef.current,
    enabled: config.physics?.enabled,
    config: config.physics,
    onParticleCountUpdate: onPhysicsParticleCountUpdate,
    forceOverlayEnabled,
  });

  // Rigid body shader passes (mask generation and force injection)
  const rigidBodyShaders = useRigidBodyShaders({
    gl,
    textureSize,
    enabled: config.physics?.enabled ?? false,
    forceMultiplier: config.physics?.rigidBodyForceMultiplier ?? 10.0,
  });

  // Create simulation resources
  useEffect(() => {
    // Create heat/force layer texture
    // Format: R=temp_low, G=temp_high (16-bit Kelvin), B=forceX, A=forceY
    const heatForceData = new Uint8Array(textureSize * textureSize * 4);
    const worldData = worldTexture.image.data as Uint8Array;

    // Initialize temperatures based on particle types from world texture
    for (let i = 0; i < textureSize * textureSize; i++) {
      const particleType = worldData[i * 4]; // R channel = particle type

      // Get default temperature for this particle type
      const material = MaterialDefinitions[particleType as ParticleType];
      const defaultAttrs = getDefaultBaseAttributes(particleType);
      const temperature = material?.defaultTemperature ?? defaultAttrs.defaultTemperature;

      // Encode 16-bit temperature into two bytes
      const tempLow = temperature & 0xFF;
      const tempHigh = (temperature >> 8) & 0xFF;

      heatForceData[i * 4] = tempLow;      // Temperature low byte
      heatForceData[i * 4 + 1] = tempHigh; // Temperature high byte
      heatForceData[i * 4 + 2] = 128;      // Force X (128 = neutral, no force)
      heatForceData[i * 4 + 3] = 128;      // Force Y (128 = neutral, no force)
    }
    const heatForceTexture = new DataTexture(
      heatForceData,
      textureSize,
      textureSize,
      RGBAFormat,
      UnsignedByteType
    );
    heatForceTexture.minFilter = NearestFilter;
    heatForceTexture.magFilter = NearestFilter;
    heatForceTexture.needsUpdate = true;
    heatForceLayerRef.current = heatForceTexture;

    // Notify parent that heat texture is ready
    onHeatTextureReady?.(heatForceTexture);

    const margolusResources = createSimulationResources(textureSize, worldTexture, {
      vertexShader: margolusVertexShader,
      fragmentShader: margolusFragmentShader,
    });
    margolusResources.material.uniforms.uHeatForceLayer = { value: heatForceTexture };
    margolusResources.material.uniforms.uRigidBodyMask = { value: null }; // Set each frame

    const liquidSpreadResources = createSimulationResources(textureSize, worldTexture, {
      vertexShader: liquidSpreadVertexShader,
      fragmentShader: liquidSpreadFragmentShader,
    });
    liquidSpreadResources.material.uniforms.uHeatForceLayer = { value: heatForceTexture };
    liquidSpreadResources.material.uniforms.uRigidBodyMask = { value: null }; // Set each frame

    const archimedesResources = createSimulationResources(textureSize, worldTexture, {
      vertexShader: archimedesVertexShader,
      fragmentShader: archimedesFragmentShader,
    });
    // Add heat texture for temperature-based convection
    archimedesResources.material.uniforms.uHeatForceLayer = { value: heatForceTexture };

    // Create ambient heat transfer resources (updates heat layer from particle emission + diffusion)
    const heatTransferResources = createSimulationResources(textureSize, worldTexture, {
      vertexShader: ambientHeatTransferVertexShader,
      fragmentShader: ambientHeatTransferFragmentShader,
    });
    heatTransferResources.material.uniforms.uHeatForceLayer = { value: heatForceTexture };
  heatTransferResources.material.uniforms.uEmissionMultiplier = { value: DEFAULT_AMBIENT_HEAT_SETTINGS.emissionMultiplier };
  heatTransferResources.material.uniforms.uDiffusionMultiplier = { value: DEFAULT_AMBIENT_HEAT_SETTINGS.diffusionMultiplier };
  heatTransferResources.material.uniforms.uEquilibriumStrength = { value: DEFAULT_AMBIENT_HEAT_SETTINGS.equilibriumStrength };
  heatTransferResources.material.uniforms.uEquilibriumTemperature = { value: DEFAULT_AMBIENT_HEAT_SETTINGS.equilibriumTemperature };
  heatTransferResources.material.uniforms.uEquilibriumMaxDelta = { value: DEFAULT_AMBIENT_HEAT_SETTINGS.equilibriumMaxDelta };
  heatTransferResources.material.uniforms.uEquilibriumEnabled = { value: 1 };

    // Create particle-only heat transfer resources (direct particle-to-particle heat diffusion, no heat layer)
    const particleOnlyHeatResources = createSimulationResources(textureSize, worldTexture, {
      vertexShader: particleOnlyHeatVertexShader,
      fragmentShader: particleOnlyHeatFragmentShader,
    });
    particleOnlyHeatResources.material.uniforms.uHeatForceLayer = { value: heatForceTexture };
    particleOnlyHeatResources.material.uniforms.uEmissionMultiplier = {
      value: DEFAULT_AMBIENT_HEAT_SETTINGS.emissionMultiplier,
    };
    particleOnlyHeatResources.material.uniforms.uHeatmapCouplingMultiplier = {
      value: DEFAULT_AMBIENT_HEAT_SETTINGS.heatmapCouplingMultiplier,
    };

    // Create phase transition resources (transforms particles based on temperature)
    const phaseTransitionResources = createSimulationResources(textureSize, worldTexture, {
      vertexShader: phaseTransitionVertexShader,
      fragmentShader: phaseTransitionFragmentShader,
    });

    const forceTransferResources = createSimulationResources(textureSize, worldTexture, {
      vertexShader: forceTransferVertexShader,
      fragmentShader: forceTransferFragmentShader,
    });
    forceTransferResources.material.uniforms.uHeatForceLayer = { value: heatForceTexture };

    // Create buildables to heat resources (applies heat/cold from buildables to heat layer)
    const buildablesManager = getBuildablesManager();
    const buildablesToHeatResources = createSimulationResources(textureSize, worldTexture, {
      vertexShader: buildablesToHeatVertexShader,
      fragmentShader: buildablesToHeatFragmentShader,
    });
    buildablesToHeatResources.material.uniforms.uHeatTexture = { value: heatForceTexture };
    buildablesToHeatResources.material.uniforms.uBuildablesPosition = { value: buildablesManager.positionTexture };
    buildablesToHeatResources.material.uniforms.uBuildablesData = { value: buildablesManager.dataTexture };
    buildablesToHeatResources.material.uniforms.uBuildablesSize = { value: new Vector2(BUILDABLES_TEXTURE_WIDTH, BUILDABLES_TEXTURE_HEIGHT) };
    buildablesToHeatResources.material.uniforms.uMaxBuildables = { value: 0 };
    buildablesToHeatResources.material.uniforms.uWorldSize = { value: textureSize };

    // Create buildables to world resources (spawns/absorbs particles from material sources/sinks)
    const buildablesToWorldResources = createSimulationResources(textureSize, worldTexture, {
      vertexShader: buildablesToWorldVertexShader,
      fragmentShader: buildablesToWorldFragmentShader,
    });
    buildablesToWorldResources.material.uniforms.uBuildablesPosition = { value: buildablesManager.positionTexture };
    buildablesToWorldResources.material.uniforms.uBuildablesData = { value: buildablesManager.dataTexture };
    buildablesToWorldResources.material.uniforms.uBuildablesSize = { value: new Vector2(BUILDABLES_TEXTURE_WIDTH, BUILDABLES_TEXTURE_HEIGHT) };
    buildablesToWorldResources.material.uniforms.uMaxBuildables = { value: 0 };
    buildablesToWorldResources.material.uniforms.uWorldSize = { value: textureSize };
    buildablesToWorldResources.material.uniforms.uTime = { value: 0 };
    buildablesToWorldResources.material.uniforms.uFrameCount = { value: 0 };

    // Create player output resources (renders to small 4x4 texture for CPU readback)
    // Player no longer modifies world texture - only calculates physics
    const playerManager = getPlayerManager();
    const playerDims = playerManager.getDimensions();
    const playerOutputResources = createSimulationResources(PLAYER_OUTPUT_SIZE, worldTexture, {
      vertexShader: playerUpdateVertexShader,
      fragmentShader: playerOutputFragmentShader,
    });
    playerOutputResources.material.uniforms.uOutputSize = { value: new Vector2(PLAYER_OUTPUT_SIZE, PLAYER_OUTPUT_SIZE) };
    playerOutputResources.material.uniforms.uPlayerEnabled = { value: 0.0 };
    playerOutputResources.material.uniforms.uPlayerPosition = { value: new Vector2(512, 100) };
    playerOutputResources.material.uniforms.uPlayerVelocity = { value: new Vector2(0, 0) };
    playerOutputResources.material.uniforms.uPlayerInput = { value: new Vector2(0, 0) };
    playerOutputResources.material.uniforms.uPlayerJumping = { value: 0.0 };
    playerOutputResources.material.uniforms.uWalkPhase = { value: 0.0 };
    playerOutputResources.material.uniforms.uPlayerSpeed = { value: 4.0 };
    playerOutputResources.material.uniforms.uPlayerJumpStrength = { value: 8.0 };
    playerOutputResources.material.uniforms.uPlayerGravity = { value: 0.25 };
    playerOutputResources.material.uniforms.uPlayerMass = { value: 50.0 };
    playerOutputResources.material.uniforms.uPlayerFriction = { value: 0.7 };
    playerOutputResources.material.uniforms.uPlayerAirResistance = { value: 0.02 };
    playerOutputResources.material.uniforms.uPushOutStrength = { value: 1.0 };
    // Hitbox dimensions
    playerOutputResources.material.uniforms.uPlayerWidth = { value: playerDims.width };
    playerOutputResources.material.uniforms.uPlayerHeight = { value: playerDims.height };
    playerOutputResources.material.uniforms.uHeadRadius = { value: playerDims.headRadius };
    playerOutputResources.material.uniforms.uBodyWidth = { value: playerDims.bodyWidth };
    playerOutputResources.material.uniforms.uBodyHeight = { value: playerDims.bodyHeight };
    playerOutputResources.material.uniforms.uLegWidth = { value: playerDims.legWidth };
    playerOutputResources.material.uniforms.uLegHeight = { value: playerDims.legHeight };
    playerOutputResources.material.uniforms.uFootOffset = { value: playerDims.footOffset };

    margolusSceneRef.current = margolusResources;
    liquidSpreadSceneRef.current = liquidSpreadResources;
    archimedesSceneRef.current = archimedesResources;
    heatTransferSceneRef.current = heatTransferResources;
    particleOnlyHeatSceneRef.current = particleOnlyHeatResources;
    phaseTransitionSceneRef.current = phaseTransitionResources;
    forceTransferSceneRef.current = forceTransferResources;
    buildablesToHeatSceneRef.current = buildablesToHeatResources;
    buildablesToWorldSceneRef.current = buildablesToWorldResources;
    playerOutputSceneRef.current = playerOutputResources;

    // Initialize render targets
    renderTargets.forEach((rt) => {
      gl.initRenderTarget(rt);
      gl.setRenderTarget(rt);
      gl.clear();
    });
    // Initialize heat render targets with neutral force values (128/255 for BA channels)
    // gl.clear() uses clearColor which defaults to 0, but force 0 decodes as -1 (strong left/down)
    // We need BA channels to be 128/255 ≈ 0.502 for neutral force (decodes to ~0)
    const prevClearColor = gl.getClearColor(new Color());
    const prevClearAlpha = gl.getClearAlpha();
    gl.setClearColor(new Color(0, 0, 128 / 255), 128 / 255); // R=0, G=0, B=128/255, A=128/255
    heatRenderTargets.forEach((rt) => {
      gl.initRenderTarget(rt);
      gl.setRenderTarget(rt);
      gl.clear();
    });
    // Restore previous clear color
    gl.setClearColor(prevClearColor, prevClearAlpha);
    gl.setRenderTarget(null);

    margolusIterationRef.current = 0;
    liquidSpreadIterationRef.current = 0;
    archimedesIterationRef.current = 0;
    heatTransferIterationRef.current = 0;
    forceTransferIterationRef.current = 0;
    initializedRef.current = true;

    return () => {
      [
        margolusResources,
        liquidSpreadResources,
        archimedesResources,
        heatTransferResources,
        particleOnlyHeatResources,
        phaseTransitionResources,
        forceTransferResources,
        buildablesToHeatResources,
        buildablesToWorldResources,
        playerOutputResources,
      ].forEach((resources) => {
        resources.scene.remove(resources.mesh);
        resources.geometry.dispose();
        resources.material.dispose();
      });
      renderTargets.forEach((rt) => rt.dispose());
      heatRenderTargets.forEach((rt) => rt.dispose());
      playerOutputRT.dispose();
      heatForceTexture.dispose();
    };
  }, [textureSize, worldTexture, resetCount, gl, renderTargets, heatRenderTargets]);

  // Run simulation pipeline each frame
  useFrame((state, delta) => {
    if (!enabled || !initializedRef.current) {
      return;
    }

    // Track FPS using circular buffer
    if (onFpsUpdate) {
      const now = state.clock.elapsedTime;

      // Add delta to circular buffer
      frameTimesRef.current[frameTimeIndexRef.current] = delta;
      frameTimeIndexRef.current = (frameTimeIndexRef.current + 1) % FPS_BUFFER_SIZE;
      frameTimeCountRef.current = Math.min(frameTimeCountRef.current + 1, FPS_BUFFER_SIZE);

      // Update FPS every 0.5 seconds
      if (now - lastFpsUpdateRef.current > 0.5) {
        const count = frameTimeCountRef.current;
        if (count > 0) {
          let sum = 0;
          for (let i = 0; i < count; i++) {
            sum += frameTimesRef.current[i];
          }
          const avgDelta = sum / count;
          const fps = Math.round(1 / avgDelta);
          onFpsUpdate(fps);
        }
        // Reset counters (but reuse the same buffer)
        frameTimeIndexRef.current = 0;
        frameTimeCountRef.current = 0;
        lastFpsUpdateRef.current = now;
      }
    }

    let currentSource: Texture = worldTexture;
    let rtIndex = 0;

    // Update and sync buildables textures to GPU
    const buildablesManager = getBuildablesManager();
    buildablesManager.update(); // Decrement lifetimes, remove expired buildables
    buildablesManager.syncToGPU();
    const buildableCount = buildablesManager.count;

    // Update rigid body data textures from PhysicsManager and generate mask
    if (config.physics?.enabled) {
      rigidBodyShaders.updateDataTextures();
      rigidBodyShaders.runMaskPass();
    }

    // Update mask texture uniform for shaders that need it
    if (margolusSceneRef.current) {
      margolusSceneRef.current.material.uniforms.uRigidBodyMask.value = rigidBodyShaders.maskTexture;
    }
    if (liquidSpreadSceneRef.current) {
      liquidSpreadSceneRef.current.material.uniforms.uRigidBodyMask.value = rigidBodyShaders.maskTexture;
    }

    // Process material sources/sinks (spawn/delete particles)
    if (buildableCount > 0 && buildablesToWorldSceneRef.current) {
      const buildablesToWorld = buildablesToWorldSceneRef.current;
      const targetRT = renderTargets[rtIndex % renderTargets.length];

      // Update uniforms
      buildablesToWorld.material.uniforms.uCurrentState.value = currentSource;
      buildablesToWorld.material.uniforms.uBuildablesPosition.value = buildablesManager.positionTexture;
      buildablesToWorld.material.uniforms.uBuildablesData.value = buildablesManager.dataTexture;
      buildablesToWorld.material.uniforms.uMaxBuildables.value = buildableCount;
      buildablesToWorld.material.uniforms.uTime.value = state.clock.elapsedTime;
      buildablesToWorld.camera.position.z = 1;
      buildablesToWorld.camera.updateProjectionMatrix();

      // Render
      gl.setRenderTarget(targetRT);
      gl.render(buildablesToWorld.scene, buildablesToWorld.camera);
      gl.setRenderTarget(null);

      currentSource = targetRT.texture;
      rtIndex++;
    }

    // Process heat/cold/force buildables (apply to heat layer) - MUST run before dynamic extract
    // NOTE: Always run this pass even with 0 buildables to clear force values from previous frames
    if (buildablesToHeatSceneRef.current && heatForceLayerRef.current) {
      const buildablesToHeat = buildablesToHeatSceneRef.current;

      // Get current heat source
      const heatSource: Texture = currentHeatRTIndexRef.current > 0
        ? heatRenderTargets[(currentHeatRTIndexRef.current - 1) % heatRenderTargets.length].texture
        : heatForceLayerRef.current;
      const targetRT = heatRenderTargets[currentHeatRTIndexRef.current % heatRenderTargets.length];

      // Update uniforms
      buildablesToHeat.material.uniforms.uHeatTexture.value = heatSource;
      buildablesToHeat.material.uniforms.uBuildablesPosition.value = buildablesManager.positionTexture;
      buildablesToHeat.material.uniforms.uBuildablesData.value = buildablesManager.dataTexture;
      buildablesToHeat.material.uniforms.uMaxBuildables.value = buildableCount;
      buildablesToHeat.material.uniforms.uTextureSize?.value?.set?.(textureSize, textureSize);
      buildablesToHeat.camera.position.z = 1;
      buildablesToHeat.camera.updateProjectionMatrix();

      // Render
      gl.setRenderTarget(targetRT);
      gl.render(buildablesToHeat.scene, buildablesToHeat.camera);
      gl.setRenderTarget(null);

      currentHeatRTIndexRef.current++;
    }

    // Inject force from rigid body velocities into heat/force texture
    if (config.physics?.enabled && rigidBodyShaders.hasRigidBodies && heatForceLayerRef.current) {
      const heatSource: Texture = currentHeatRTIndexRef.current > 0
        ? heatRenderTargets[(currentHeatRTIndexRef.current - 1) % heatRenderTargets.length].texture
        : heatForceLayerRef.current;

      const result = rigidBodyShaders.runForcePass(
        heatSource,
        heatRenderTargets,
        currentHeatRTIndexRef.current
      );

      currentHeatRTIndexRef.current = result.newRtIndex;
    }

    // Execute player physics (read-only - doesn't modify world texture)
    // Player is rendered as a sprite overlay, not as particles
    const playerStep = config.steps.find((s) => s.type === SimulationStepType.PLAYER_UPDATE);
    const playerManager = getPlayerManager();
    if (playerStep?.enabled && playerManager.enabled && playerOutputSceneRef.current) {
      const playerOutput = playerOutputSceneRef.current;
      const playerState = playerManager.currentState;
      const playerSettings = playerManager.currentSettings;
      const playerDims = playerManager.getDimensions();

      // Update uniforms for physics calculation
      playerOutput.material.uniforms.uCurrentState.value = currentSource;
      playerOutput.material.uniforms.uTextureSize.value.set(textureSize, textureSize);
      playerOutput.material.uniforms.uPlayerEnabled.value = 1.0;
      playerOutput.material.uniforms.uPlayerPosition.value.set(playerState.x, playerState.y);
      playerOutput.material.uniforms.uPlayerVelocity.value.set(playerState.velocityX, playerState.velocityY);
      playerOutput.material.uniforms.uPlayerInput.value.set(playerState.inputX, playerState.inputY);
      playerOutput.material.uniforms.uPlayerJumping.value = playerState.jumping ? 1.0 : 0.0;
      playerOutput.material.uniforms.uWalkPhase.value = playerState.walkPhase;
      playerOutput.material.uniforms.uPlayerSpeed.value = playerSettings.speed;
      playerOutput.material.uniforms.uPlayerJumpStrength.value = playerSettings.jumpStrength;
      playerOutput.material.uniforms.uPlayerGravity.value = playerSettings.gravity;
      playerOutput.material.uniforms.uPlayerMass.value = playerSettings.mass;
      playerOutput.material.uniforms.uPlayerFriction.value = playerSettings.friction;
      playerOutput.material.uniforms.uPlayerAirResistance.value = playerSettings.airResistance;
      playerOutput.material.uniforms.uPushOutStrength.value = playerSettings.pushOutStrength;
      // Hitbox dimensions
      playerOutput.material.uniforms.uPlayerWidth.value = playerDims.width;
      playerOutput.material.uniforms.uPlayerHeight.value = playerDims.height;
      playerOutput.material.uniforms.uHeadRadius.value = playerDims.headRadius;
      playerOutput.material.uniforms.uBodyWidth.value = playerDims.bodyWidth;
      playerOutput.material.uniforms.uBodyHeight.value = playerDims.bodyHeight;
      playerOutput.material.uniforms.uLegWidth.value = playerDims.legWidth;
      playerOutput.material.uniforms.uLegHeight.value = playerDims.legHeight;
      playerOutput.material.uniforms.uFootOffset.value = playerDims.footOffset;
      playerOutput.camera.position.z = 1;
      playerOutput.camera.updateProjectionMatrix();

      // Render to player output texture (4x4)
      gl.setRenderTarget(playerOutputRT);
      gl.render(playerOutput.scene, playerOutput.camera);
      gl.setRenderTarget(null);

      // Read back player physics output
      const outputPixels = new Float32Array(PLAYER_OUTPUT_SIZE * PLAYER_OUTPUT_SIZE * 4);
      gl.readRenderTargetPixels(playerOutputRT, 0, 0, PLAYER_OUTPUT_SIZE, PLAYER_OUTPUT_SIZE, outputPixels);

      // Update player state from GPU output
      playerManager.readOutputFromGPU(outputPixels);
    }

    // Execute Rapier physics system (uses force from buildables applied in buildablesToHeat)
    if (config.physics?.enabled) {
      // Get the current heat texture (with buildable force applied)
      const currentHeatTexture: Texture = currentHeatRTIndexRef.current > 0
        ? heatRenderTargets[(currentHeatRTIndexRef.current - 1) % heatRenderTargets.length].texture
        : heatForceLayerRef.current!;

      const result = runPhysicsStep(currentSource, renderTargets, rtIndex, state.clock.elapsedTime, currentHeatTexture);
      currentSource = result.newSource;
      rtIndex = result.newRtIndex;
    }

    // Execute particle state steps (non-heat/force steps)
    for (const step of config.steps) {
      if (!step.enabled || step.passes <= 0) continue;

      // Skip heat/force transfer - handled separately below
      // Skip player update - handled above
      if (
        step.type === SimulationStepType.HEAT_TRANSFER ||
        step.type === SimulationStepType.PARTICLE_ONLY_HEAT ||
        step.type === SimulationStepType.FORCE_TRANSFER ||
        step.type === SimulationStepType.PLAYER_UPDATE
      ) {
        continue;
      }

      let resources: SimulationResources | null = null;

      switch (step.type) {
        case SimulationStepType.MARGOLUS_CA:
          resources = margolusSceneRef.current;
          break;
        case SimulationStepType.LIQUID_SPREAD:
          resources = liquidSpreadSceneRef.current;
          break;
        case SimulationStepType.ARCHIMEDES:
          resources = archimedesSceneRef.current;
          break;
      }

      if (!resources) continue;

      // Run multiple passes of this step
      for (let i = 0; i < step.passes; i++) {
        const targetRT = renderTargets[rtIndex % renderTargets.length];

        // Update uniforms
        resources.material.uniforms.uCurrentState.value = currentSource;
        resources.material.uniforms.uTextureSize.value.set(textureSize, textureSize);
        resources.material.uniforms.uFrictionAmplifier.value = config.frictionAmplifier;
        resources.camera.position.z = 1;
        resources.camera.updateProjectionMatrix();

        // Update step-specific uniforms
        if (step.type === SimulationStepType.MARGOLUS_CA) {
          resources.material.uniforms.uIteration.value = margolusIterationRef.current % 4;
          resources.material.uniforms.uRandomSeed.value = margolusIterationRef.current;
          margolusIterationRef.current++;
        } else if (step.type === SimulationStepType.LIQUID_SPREAD) {
          resources.material.uniforms.uIteration.value = liquidSpreadIterationRef.current % 2;
          resources.material.uniforms.uRandomSeed.value = liquidSpreadIterationRef.current;
          liquidSpreadIterationRef.current++;
        } else if (step.type === SimulationStepType.ARCHIMEDES) {
          resources.material.uniforms.uIteration.value = archimedesIterationRef.current % 4;
          resources.material.uniforms.uRandomSeed.value = archimedesIterationRef.current;
          archimedesIterationRef.current++;
        }

        // Render to target
        gl.setRenderTarget(targetRT);
        gl.render(resources.scene, resources.camera);
        gl.setRenderTarget(null);

        // Update source for next iteration
        currentSource = targetRT.texture;
        rtIndex++;
      }
    }

    // Execute particle-only heat transfer BEFORE read-back (chain with main simulation)
    // This avoids two separate GPU read-backs per frame
    const particleOnlyHeatStep = config.steps.find(
      (s) => s.type === SimulationStepType.PARTICLE_ONLY_HEAT
    );
    if (particleOnlyHeatStep?.enabled && particleOnlyHeatStep.passes > 0) {
      const heatResources = particleOnlyHeatSceneRef.current;
      if (heatResources) {
        // Continue from wherever particle simulation left off (currentSource)
        for (let i = 0; i < particleOnlyHeatStep.passes; i++) {
          const targetRT = renderTargets[rtIndex % renderTargets.length];

          // Update uniforms - only needs particle state texture
          const ambientSettings = config.ambientHeatSettings ?? DEFAULT_AMBIENT_HEAT_SETTINGS;
          const latestHeatTexture = currentHeatRTIndexRef.current > 0
            ? heatRenderTargets[(currentHeatRTIndexRef.current - 1) % heatRenderTargets.length].texture
            : heatForceLayerRef.current;

          heatResources.material.uniforms.uCurrentState.value = currentSource;
          heatResources.material.uniforms.uTextureSize.value.set(textureSize, textureSize);
          if (latestHeatTexture) {
            heatResources.material.uniforms.uHeatForceLayer.value = latestHeatTexture;
          }
          heatResources.material.uniforms.uEmissionMultiplier.value = ambientSettings.emissionMultiplier;
          heatResources.material.uniforms.uHeatmapCouplingMultiplier.value =
            ambientSettings.heatmapCouplingMultiplier;
          heatResources.camera.position.z = 1;
          heatResources.camera.updateProjectionMatrix();

          // Render heat transfer to target
          gl.setRenderTarget(targetRT);
          gl.render(heatResources.scene, heatResources.camera);
          gl.setRenderTarget(null);

          // Update source for next pass
          currentSource = targetRT.texture;
          rtIndex++;
        }
      }
    }

    // Execute phase transitions (transforms particles based on temperature)
    // Runs after heat transfer so particles have updated temperatures
    const phaseTransitionStep = config.steps.find(
      (s) => s.type === SimulationStepType.PHASE_TRANSITION
    );
    if (phaseTransitionStep?.enabled && phaseTransitionStep.passes > 0) {
      const phaseResources = phaseTransitionSceneRef.current;
      if (phaseResources) {
        for (let i = 0; i < phaseTransitionStep.passes; i++) {
          const targetRT = renderTargets[rtIndex % renderTargets.length];

          // Update uniforms - only needs particle state texture
          phaseResources.material.uniforms.uCurrentState.value = currentSource;
          phaseResources.material.uniforms.uTextureSize.value.set(textureSize, textureSize);
          phaseResources.camera.position.z = 1;
          phaseResources.camera.updateProjectionMatrix();

          // Render phase transition to target
          gl.setRenderTarget(targetRT);
          gl.render(phaseResources.scene, phaseResources.camera);
          gl.setRenderTarget(null);

          // Update source for next pass
          currentSource = targetRT.texture;
          rtIndex++;
        }
      }
    }

    // Single GPU read-back at the end of all processing (particle sim + heat transfer + phase transition)
    if (rtIndex > 0) {
      const finalRT = renderTargets[(rtIndex - 1) % renderTargets.length];
      const pixels = new Uint8Array(textureSize * textureSize * 4);
      gl.readRenderTargetPixels(finalRT, 0, 0, textureSize, textureSize, pixels);

      // Update the worldTexture data in-place
      const worldData = worldTexture.image.data as Uint8Array;
      worldData.set(pixels);
      worldTexture.needsUpdate = true;
    }

    // Execute ambient heat transfer (updates heat layer from particle temperatures)
    const ambientHeatStep = config.steps.find(
      (s) => s.type === SimulationStepType.HEAT_TRANSFER
    );
    if (ambientHeatStep?.enabled && ambientHeatStep.passes > 0 && heatForceLayerRef.current) {
      const heatResources = heatTransferSceneRef.current;
      if (heatResources) {
        // Start from current heat RT (or DataTexture if first frame)
        let heatSource: Texture = currentHeatRTIndexRef.current > 0
          ? heatRenderTargets[(currentHeatRTIndexRef.current - 1) % heatRenderTargets.length].texture
          : heatForceLayerRef.current;
        let heatRtIndex = currentHeatRTIndexRef.current;

  const ambientSettings = config.ambientHeatSettings ?? DEFAULT_AMBIENT_HEAT_SETTINGS;
  heatTransferIterationRef.current += 1;
  const interval = Math.max(1, Math.floor(ambientSettings.equilibriumInterval ?? 1));
  const applyEquilibrium = ambientSettings.equilibriumStrength > 0 && (interval <= 1 || (heatTransferIterationRef.current % interval === 0));

  heatResources.material.uniforms.uEmissionMultiplier.value = ambientSettings.emissionMultiplier;
  heatResources.material.uniforms.uDiffusionMultiplier.value = ambientSettings.diffusionMultiplier;
  heatResources.material.uniforms.uEquilibriumStrength.value = ambientSettings.equilibriumStrength;
  heatResources.material.uniforms.uEquilibriumTemperature.value = ambientSettings.equilibriumTemperature;
  heatResources.material.uniforms.uEquilibriumMaxDelta.value = ambientSettings.equilibriumMaxDelta;
  heatResources.material.uniforms.uEquilibriumEnabled.value = applyEquilibrium ? 1 : 0;

        for (let i = 0; i < ambientHeatStep.passes; i++) {
          const targetRT = heatRenderTargets[heatRtIndex % heatRenderTargets.length];

          // Update uniforms
          heatResources.material.uniforms.uCurrentState.value = worldTexture;
          heatResources.material.uniforms.uHeatForceLayer.value = heatSource;
          heatResources.material.uniforms.uTextureSize.value.set(textureSize, textureSize);
          heatResources.camera.position.z = 1;
          heatResources.camera.updateProjectionMatrix();

          // Render to heat target
          gl.setRenderTarget(targetRT);
          gl.render(heatResources.scene, heatResources.camera);
          gl.setRenderTarget(null);

          // Update source for next pass
          heatSource = targetRT.texture;
          heatRtIndex++;
        }

        // Update the current heat RT index for next frame
        currentHeatRTIndexRef.current = heatRtIndex;

        if (heatRtIndex > 0) {
          const finalHeatRT = heatRenderTargets[(heatRtIndex - 1) % heatRenderTargets.length];

          if (shouldCaptureHeatLayerRef.current) {
            // Refresh CPU-side ambient heat texture for tooling/inspection when requested
            const ambientTexture = heatForceLayerRef.current;
            const ambientImage = ambientTexture.image as { data?: Uint8Array } | undefined;
            const ambientPixels = ambientImage?.data;
            if (ambientPixels instanceof Uint8Array) {
              gl.readRenderTargetPixels(finalHeatRT, 0, 0, textureSize, textureSize, ambientPixels);
              ambientTexture.needsUpdate = true;
            }
          }

          if (heatRTRef) {
            // Use type assertion to write to ref (RefObject is readonly by design but we need to write)
            (heatRTRef as { current: Texture | null }).current = finalHeatRT.texture;
          }
        }
      }
    } else if (heatRTRef && heatForceLayerRef.current) {
      // If ambient heat is disabled, still share the initial heat texture
      (heatRTRef as { current: Texture | null }).current = heatForceLayerRef.current;
    }
  });

  return null;
}

export default MainSimulation;
