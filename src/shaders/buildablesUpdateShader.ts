/**
 * Shader for updating buildables state (position, lifetime, cooldown)
 * This runs on the buildables textures in a ping-pong pattern
 */

import { BUILDABLES_GLSL_UTILS } from '../buildables/BuildablesConstants';

export const buildablesUpdateVertexShader = `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const buildablesUpdatePositionFragmentShader = `
precision highp float;

uniform sampler2D uPositionTexture;  // Current position texture
uniform sampler2D uDataTexture;      // Data texture (for checking if active)
uniform float uDeltaTime;            // Time step (usually 1.0 for frames)
uniform vec2 uWorldSize;             // World dimensions for wrapping

varying vec2 vUv;

${BUILDABLES_GLSL_UTILS}

void main() {
  vec4 position = texture2D(uPositionTexture, vUv);
  vec4 data = texture2D(uDataTexture, vUv);

  float type = unpackType(data.r);

  // Skip empty slots
  if (type == BUILDABLE_EMPTY) {
    gl_FragColor = position;
    return;
  }

  float x = position.r;
  float y = position.g;
  float vx = position.b;
  float vy = position.a;

  // Update position based on velocity
  x += vx * uDeltaTime;
  y += vy * uDeltaTime;

  // Wrap around world boundaries (optional - could also clamp or destroy)
  x = mod(x + uWorldSize.x, uWorldSize.x);
  y = mod(y + uWorldSize.y, uWorldSize.y);

  gl_FragColor = vec4(x, y, vx, vy);
}
`;

export const buildablesUpdateDataFragmentShader = `
precision highp float;

uniform sampler2D uDataTexture;      // Current data texture
uniform sampler2D uPositionTexture;  // Position texture (for reference)
uniform float uDeltaTime;            // Time step

varying vec2 vUv;

${BUILDABLES_GLSL_UTILS}

void main() {
  vec4 data = texture2D(uDataTexture, vUv);

  float packedTypeSubtype = data.r;
  float radius = data.g;
  float lifetime = data.b;
  float packedRateFlags = data.a;

  float type = unpackType(packedTypeSubtype);

  // Skip empty slots
  if (type == BUILDABLE_EMPTY) {
    gl_FragColor = data;
    return;
  }

  float subtype = unpackSubtype(packedTypeSubtype);
  float rate = unpackRate(packedRateFlags);
  float flagsAndPeriod = unpackCooldown(packedRateFlags);
  float flags = mod(flagsAndPeriod, 256.0);
  float period = floor(flagsAndPeriod / 256.0);

  // Check if active
  if (!hasFlag(flags, FLAG_ACTIVE)) {
    gl_FragColor = data;
    return;
  }

  // Update lifetime (if not permanent)
  if (lifetime > 0.0) {
    lifetime -= uDeltaTime;

    // Mark as empty if lifetime expired
    if (lifetime <= 0.0) {
      gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
      return;
    }
  }

  // Update radius if growing/shrinking
  if (hasFlag(flags, FLAG_GROWING)) {
    radius += 0.01 * uDeltaTime; // Slow growth
    radius = min(radius, 50.0);  // Cap radius
  } else if (hasFlag(flags, FLAG_SHRINKING)) {
    radius -= 0.01 * uDeltaTime;
    if (radius <= 0.0) {
      // Destroy buildable if radius hits zero
      gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
      return;
    }
  }

  // Repack and output
  float newPackedRateFlags = packRateAndCooldown(rate, flags + period * 256.0);
  gl_FragColor = vec4(packedTypeSubtype, radius, lifetime, newPackedRateFlags);
}
`;

/**
 * Shader uniforms interface
 */
export interface BuildablesUpdateUniforms {
  uPositionTexture: { value: THREE.Texture | null };
  uDataTexture: { value: THREE.Texture | null };
  uDeltaTime: { value: number };
  uWorldSize: { value: [number, number] };
}

import * as THREE from 'three';

/**
 * Create default uniforms for the buildables update shader
 */
export function createBuildablesUpdateUniforms(worldSize: number): BuildablesUpdateUniforms {
  return {
    uPositionTexture: { value: null },
    uDataTexture: { value: null },
    uDeltaTime: { value: 1.0 },
    uWorldSize: { value: [worldSize, worldSize] },
  };
}
