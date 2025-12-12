/**
 * Shader for applying heat/cold/force from buildables to the heat layer
 * Iterates through all buildables and modifies heat and force in their radius
 *
 * Heat texture layout:
 * - RG: temperature (16-bit encoded)
 * - B: force X (128 = neutral)
 * - A: force Y (128 = neutral)
 */

import { BUILDABLES_GLSL_UTILS, BUILDABLES_TEXTURE_WIDTH, BUILDABLES_TEXTURE_HEIGHT } from '../buildables/BuildablesConstants';

// Maximum buildables to check per pixel per frame (performance trade-off)
const MAX_BUILDABLES_TO_CHECK = 1000;

export const buildablesToHeatVertexShader = `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const buildablesToHeatFragmentShader = `
precision highp float;

uniform sampler2D uHeatTexture;           // Current heat layer
uniform sampler2D uBuildablesPosition;    // Buildables position texture
uniform sampler2D uBuildablesData;        // Buildables data texture
uniform vec2 uBuildablesSize;             // Buildables texture dimensions
uniform float uMaxBuildables;             // Max buildables to check (optimization)
uniform float uWorldSize;                 // World size for coordinate conversion

varying vec2 vUv;

${BUILDABLES_GLSL_UTILS}

// Decode heat from RG channels (16-bit)
float decodeHeat(vec2 rg) {
  return rg.r * 255.0 + rg.g * 255.0 * 256.0;
}

// Encode heat to RG channels (16-bit)
vec2 encodeHeat(float heat) {
  heat = clamp(heat, 0.0, 65535.0);
  float low = mod(heat, 256.0);
  float high = floor(heat / 256.0);
  return vec2(low / 255.0, high / 255.0);
}

void main() {
  vec4 currentHeat = texture2D(uHeatTexture, vUv);

  // Decode current ambient temperature (stored in RG)
  float ambientTemp = decodeHeat(currentHeat.rg);

  // Force is NOT accumulated - it's freshly computed each frame
  // (unlike heat which accumulates over time)

  // Current world position (0 to worldSize-1)
  vec2 worldPos = vUv * uWorldSize;

  // Accumulate heat changes from all heat/cold sources
  float heatDelta = 0.0;
  // Accumulate force changes from all force sources
  vec2 forceDelta = vec2(0.0);

  // Iterate through buildables texture
  // Note: This is O(buildables) per pixel - could optimize with spatial hashing
  for (float i = 0.0; i < ${MAX_BUILDABLES_TO_CHECK}.0; i += 1.0) {
    if (i >= uMaxBuildables) break;

    // Convert linear index to UV coordinates in buildables texture
    float y = floor(i / uBuildablesSize.x);
    float x = mod(i, uBuildablesSize.x);
    vec2 buildableUv = (vec2(x, y) + 0.5) / uBuildablesSize;

    // Read buildable data
    vec4 bPos = texture2D(uBuildablesPosition, buildableUv);
    vec4 bData = texture2D(uBuildablesData, buildableUv);

    float type = unpackType(bData.r);

    // Skip if not a heat/cold/force source
    if (type != BUILDABLE_HEAT_SOURCE && type != BUILDABLE_COLD_SOURCE && type != BUILDABLE_FORCE_SOURCE) {
      continue;
    }

    float bx = bPos.r;
    float by = bPos.g;
    float radius = bData.g;
    float rate = unpackRate(bData.a);

    // Check if this pixel is within the buildable's radius
    float dx = worldPos.x - bx;
    float dy = worldPos.y - by;
    float distSq = dx * dx + dy * dy;
    float radiusSq = radius * radius;

    if (distSq <= radiusSq) {
      // Calculate falloff (stronger at center)
      float dist = sqrt(distSq);
      float falloff = 1.0 - dist / radius;
      falloff = falloff * falloff; // Quadratic falloff

      // Subtype contains the intensity (scaled)
      float intensity = unpackSubtype(bData.r) * 10.0; // Scale up

      if (type == BUILDABLE_HEAT_SOURCE) {
        heatDelta += intensity * rate * falloff;
      } else if (type == BUILDABLE_COLD_SOURCE) {
        heatDelta -= intensity * rate * falloff;
      } else if (type == BUILDABLE_FORCE_SOURCE) {
        // Force always points up (+Y), spreads left/right based on position relative to center
        // Coordinate system: gravity does vel.y -= g, so -Y is down, +Y is up
        float dirX = dist > 0.1 ? dx / dist : 0.0; // Horizontal spread based on position
        float dirY = 1.0; // Push up (+Y direction)
        vec2 direction = normalize(vec2(dirX, dirY));
        forceDelta += direction * intensity * rate * 2.0; // Constant force throughout radius
      }
    }
  }

  // Apply heat delta
  ambientTemp = clamp(ambientTemp + heatDelta, 0.0, 65535.0);

  // Force is computed fresh each frame (not accumulated) - encode directly
  vec2 newForce = clamp(forceDelta, -1.0, 1.0);
  vec2 encodedForce = (newForce * 127.0 + 128.0) / 255.0;

  // Re-encode and output
  vec2 encodedHeat = encodeHeat(ambientTemp);
  gl_FragColor = vec4(encodedHeat, encodedForce);
}
`;

/**
 * Shader uniforms interface
 */
export interface BuildablesToHeatUniforms {
  uHeatTexture: { value: THREE.Texture | null };
  uBuildablesPosition: { value: THREE.Texture | null };
  uBuildablesData: { value: THREE.Texture | null };
  uBuildablesSize: { value: [number, number] };
  uMaxBuildables: { value: number };
  uWorldSize: { value: number };
}

import * as THREE from 'three';

/**
 * Create default uniforms for the buildables to heat shader
 */
export function createBuildablesToHeatUniforms(worldSize: number): BuildablesToHeatUniforms {
  return {
    uHeatTexture: { value: null },
    uBuildablesPosition: { value: null },
    uBuildablesData: { value: null },
    uBuildablesSize: { value: [BUILDABLES_TEXTURE_WIDTH, BUILDABLES_TEXTURE_HEIGHT] },
    uMaxBuildables: { value: 0 },
    uWorldSize: { value: worldSize },
  };
}
