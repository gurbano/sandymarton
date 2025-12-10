/**
 * Shader for applying material sources and sinks to the world texture
 * - Material sources: spawn particles in empty spaces within radius
 * - Material sinks: delete particles within radius
 */

import { BUILDABLES_GLSL_UTILS, BUILDABLES_TEXTURE_WIDTH, BUILDABLES_TEXTURE_HEIGHT } from '../buildables/BuildablesConstants';
import { generateMaterialShaderConstants } from '../world/MaterialDefinitions';

// Maximum buildables to check per pixel per frame (performance trade-off)
const MAX_BUILDABLES_TO_CHECK = 1000;

export const buildablesToWorldVertexShader = `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const buildablesToWorldFragmentShader = `
precision highp float;

uniform sampler2D uCurrentState;          // Current world state
uniform sampler2D uBuildablesPosition;    // Buildables position texture
uniform sampler2D uBuildablesData;        // Buildables data texture
uniform vec2 uBuildablesSize;             // Buildables texture dimensions
uniform float uMaxBuildables;             // Max buildables to check
uniform float uWorldSize;                 // World size
uniform float uTime;                      // For randomization
uniform float uFrameCount;                // Frame counter for emission timing

varying vec2 vUv;

${BUILDABLES_GLSL_UTILS}

// Material properties (includes getMaterialDefaultTemperature)
${generateMaterialShaderConstants()}

// Simple hash function for pseudo-random emission
float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}

// Encode temperature to GB channels
vec2 encodeTemperature(float temp) {
  temp = clamp(temp, 0.0, 65535.0);
  float low = mod(temp, 256.0);
  float high = floor(temp / 256.0);
  return vec2(low / 255.0, high / 255.0);
}

void main() {
  vec4 currentWorld = texture2D(uCurrentState, vUv);

  float particleType = currentWorld.r * 255.0;
  bool isEmpty = particleType < 1.0; // EMPTY = 0

  // Current world position
  vec2 worldPos = vUv * uWorldSize;

  // Track if we should modify this pixel
  float newParticleType = particleType;
  float newTempLow = currentWorld.g;
  float newTempHigh = currentWorld.b;
  bool modified = false;

  // Iterate through buildables
  for (float i = 0.0; i < ${MAX_BUILDABLES_TO_CHECK}.0; i += 1.0) {
    if (i >= uMaxBuildables) break;

    // Convert to UV
    float y = floor(i / uBuildablesSize.x);
    float x = mod(i, uBuildablesSize.x);
    vec2 buildableUv = (vec2(x, y) + 0.5) / uBuildablesSize;

    vec4 bPos = texture2D(uBuildablesPosition, buildableUv);
    vec4 bData = texture2D(uBuildablesData, buildableUv);

    float type = unpackType(bData.r);

    // Skip if not material source or sink
    if (type != BUILDABLE_MATERIAL_SOURCE && type != BUILDABLE_MATERIAL_SINK) {
      continue;
    }

    float bx = bPos.r;
    float by = bPos.g;
    float radius = bData.g;
    float rate = unpackRate(bData.a);
    float materialType = unpackSubtype(bData.r);

    // Check distance
    float dx = worldPos.x - bx;
    float dy = worldPos.y - by;
    float distSq = dx * dx + dy * dy;
    float radiusSq = radius * radius;

    if (distSq <= radiusSq) {
      if (type == BUILDABLE_MATERIAL_SOURCE && isEmpty && !modified) {
        // Material source: spawn particle if empty
        // Use rate as probability of spawning (0-1)
        float spawnChance = rate * 0.1; // Scale down for reasonable emission
        float randVal = hash(worldPos + vec2(uTime, uFrameCount * 0.01));

        if (randVal < spawnChance) {
          newParticleType = materialType;
          // Set default temperature for material
          float defaultTemp = getMaterialDefaultTemperature(materialType);
          vec2 encodedTemp = encodeTemperature(defaultTemp);
          newTempLow = encodedTemp.x;
          newTempHigh = encodedTemp.y;
          modified = true;
        }
      } else if (type == BUILDABLE_MATERIAL_SINK && !isEmpty && !modified) {
        // Material sink: delete particles
        float deleteChance = rate * 0.2; // Probability of deletion
        float randVal = hash(worldPos + vec2(uTime * 1.5, uFrameCount * 0.02));

        if (randVal < deleteChance) {
          newParticleType = 0.0; // EMPTY
          newTempLow = 0.0;
          newTempHigh = 0.0;
          modified = true;
        }
      }
    }
  }

  // Output
  if (modified) {
    gl_FragColor = vec4(newParticleType / 255.0, newTempLow, newTempHigh, currentWorld.a);
  } else {
    gl_FragColor = currentWorld;
  }
}
`;

/**
 * Shader uniforms interface
 */
export interface BuildablesToWorldUniforms {
  uCurrentState: { value: THREE.Texture | null };
  uBuildablesPosition: { value: THREE.Texture | null };
  uBuildablesData: { value: THREE.Texture | null };
  uBuildablesSize: { value: [number, number] };
  uMaxBuildables: { value: number };
  uWorldSize: { value: number };
  uTime: { value: number };
  uFrameCount: { value: number };
}

import * as THREE from 'three';

/**
 * Create default uniforms for the buildables to world shader
 */
export function createBuildablesToWorldUniforms(worldSize: number): BuildablesToWorldUniforms {
  return {
    uCurrentState: { value: null },
    uBuildablesPosition: { value: null },
    uBuildablesData: { value: null },
    uBuildablesSize: { value: [BUILDABLES_TEXTURE_WIDTH, BUILDABLES_TEXTURE_HEIGHT] },
    uMaxBuildables: { value: 0 },
    uWorldSize: { value: worldSize },
    uTime: { value: 0 },
    uFrameCount: { value: 0 },
  };
}
