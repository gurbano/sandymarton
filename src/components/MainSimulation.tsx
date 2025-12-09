import { useEffect, useMemo, useRef } from 'react';
import type { RefObject } from 'react';
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
import { useFrame, useThree } from '@react-three/fiber';
import type { SimulationConfig } from '../types/SimulationConfig';
import { SimulationStepType } from '../types/SimulationConfig';
import { MaterialDefinitions, getDefaultBaseAttributes } from '../world/MaterialDefinitions';
import { ParticleType } from '../world/ParticleTypes';

interface MainSimulationProps {
  worldTexture: DataTexture;
  textureSize: number;
  onTextureUpdate: (texture: DataTexture) => void;
  onHeatTextureReady?: (texture: DataTexture) => void;
  /** Ref to share heat RT texture directly with rendering (avoids GPU read-back) */
  heatRTRef?: RefObject<Texture | null>;
  enabled?: boolean;
  config: SimulationConfig;
  resetCount?: number;
  onFpsUpdate?: (fps: number) => void;
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
  onTextureUpdate,
  onHeatTextureReady,
  heatRTRef,
  enabled = true,
  config,
  resetCount = 0,
  onFpsUpdate,
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

  const margolusSceneRef = useRef<SimulationResources | null>(null);
  const liquidSpreadSceneRef = useRef<SimulationResources | null>(null);
  const archimedesSceneRef = useRef<SimulationResources | null>(null);
  const heatTransferSceneRef = useRef<SimulationResources | null>(null);
  const particleOnlyHeatSceneRef = useRef<SimulationResources | null>(null);
  const phaseTransitionSceneRef = useRef<SimulationResources | null>(null);
  const forceTransferSceneRef = useRef<SimulationResources | null>(null);
  const margolusIterationRef = useRef(0);
  const liquidSpreadIterationRef = useRef(0);
  const archimedesIterationRef = useRef(0);
  const heatTransferIterationRef = useRef(0);
  const forceTransferIterationRef = useRef(0);
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

    const liquidSpreadResources = createSimulationResources(textureSize, worldTexture, {
      vertexShader: liquidSpreadVertexShader,
      fragmentShader: liquidSpreadFragmentShader,
    });
    liquidSpreadResources.material.uniforms.uHeatForceLayer = { value: heatForceTexture };

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

    // Create particle-only heat transfer resources (direct particle-to-particle heat diffusion, no heat layer)
    const particleOnlyHeatResources = createSimulationResources(textureSize, worldTexture, {
      vertexShader: particleOnlyHeatVertexShader,
      fragmentShader: particleOnlyHeatFragmentShader,
    });

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

    margolusSceneRef.current = margolusResources;
    liquidSpreadSceneRef.current = liquidSpreadResources;
    archimedesSceneRef.current = archimedesResources;
    heatTransferSceneRef.current = heatTransferResources;
    particleOnlyHeatSceneRef.current = particleOnlyHeatResources;
    phaseTransitionSceneRef.current = phaseTransitionResources;
    forceTransferSceneRef.current = forceTransferResources;

    // Initialize render targets
    renderTargets.forEach((rt) => {
      gl.initRenderTarget(rt);
      gl.setRenderTarget(rt);
      gl.clear();
    });
    // Initialize heat render targets
    heatRenderTargets.forEach((rt) => {
      gl.initRenderTarget(rt);
      gl.setRenderTarget(rt);
      gl.clear();
    });
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
      ].forEach((resources) => {
        resources.scene.remove(resources.mesh);
        resources.geometry.dispose();
        resources.material.dispose();
      });
      renderTargets.forEach((rt) => rt.dispose());
      heatRenderTargets.forEach((rt) => rt.dispose());
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

    // Execute particle state steps (non-heat/force steps)
    for (const step of config.steps) {
      if (!step.enabled || step.passes <= 0) continue;

      // Skip heat/force transfer - handled separately below
      if (
        step.type === SimulationStepType.HEAT_TRANSFER ||
        step.type === SimulationStepType.PARTICLE_ONLY_HEAT ||
        step.type === SimulationStepType.FORCE_TRANSFER
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
          heatResources.material.uniforms.uCurrentState.value = currentSource;
          heatResources.material.uniforms.uTextureSize.value.set(textureSize, textureSize);
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

        // Share heat RT texture via ref (no GPU read-back needed!)
        if (heatRTRef && heatRtIndex > 0) {
          const finalHeatRT = heatRenderTargets[(heatRtIndex - 1) % heatRenderTargets.length];
          // Use type assertion to write to ref (RefObject is readonly by design but we need to write)
          (heatRTRef as { current: Texture | null }).current = finalHeatRT.texture;
        }
      }
    } else if (heatRTRef && heatForceLayerRef.current) {
      // If ambient heat is disabled, still share the initial heat texture
      (heatRTRef as { current: Texture | null }).current = heatForceLayerRef.current;
    }

    // Notify parent that texture was updated
    onTextureUpdate(worldTexture);
  });

  return null;
}

export default MainSimulation;
