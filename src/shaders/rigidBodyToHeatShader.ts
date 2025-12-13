/**
 * Shader for applying force from moving rigid bodies to the heat/force texture
 * When rigid bodies move, they push force into nearby pixels in the force layer,
 * causing particles to be ejected via the force extraction system.
 *
 * Heat texture layout:
 * - RG: temperature (16-bit encoded) - preserved
 * - B: force X (128 = neutral, 0-255 encodes -1.0 to +1.0)
 * - A: force Y (128 = neutral, 0-255 encodes -1.0 to +1.0)
 */

import { MAX_RIGID_BODIES } from '../types/PhysicsConfig';

export const rigidBodyToHeatVertexShader = `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const rigidBodyToHeatFragmentShader = `
precision highp float;

uniform sampler2D uHeatTexture;          // Current heat layer (to preserve temperature)
uniform sampler2D uRigidBodyPositions;   // x, y positions (MAX_RIGID_BODIES x 1)
uniform sampler2D uRigidBodyVelocities;  // vx, vy velocities (MAX_RIGID_BODIES x 1)
uniform sampler2D uRigidBodySizes;       // width, height per body (MAX_RIGID_BODIES x 1)
uniform sampler2D uRigidBodyShapes;      // 0 = box, 1 = circle (MAX_RIGID_BODIES x 1)
uniform float uRigidBodyCount;           // Number of active rigid bodies
uniform float uWorldSize;                // World size for coordinate conversion
uniform float uForceMultiplier;          // Force strength multiplier (default: 1.0)

varying vec2 vUv;

const float MAX_RIGID_BODIES_F = ${MAX_RIGID_BODIES}.0;

// Check if point is inside a box (axis-aligned for now)
float boxOverlap(vec2 point, vec2 boxCenter, vec2 boxSize) {
  vec2 halfSize = boxSize * 0.5;
  vec2 d = abs(point - boxCenter) - halfSize;

  // If inside, return a value based on distance from edge (1.0 at center, 0.0 at edge)
  if (d.x < 0.0 && d.y < 0.0) {
    float distFromEdge = min(-d.x / halfSize.x, -d.y / halfSize.y);
    return clamp(distFromEdge, 0.0, 1.0);
  }
  return 0.0;
}

// Check if point is inside a circle
float circleOverlap(vec2 point, vec2 center, float radius) {
  float dist = length(point - center);
  if (dist < radius) {
    return 1.0 - dist / radius; // 1.0 at center, 0.0 at edge
  }
  return 0.0;
}

void main() {
  vec4 currentHeat = texture2D(uHeatTexture, vUv);

  // Preserve temperature from RG channels
  vec2 temperature = currentHeat.rg;

  // Decode current force from BA channels
  vec2 currentForce = (currentHeat.ba * 255.0 - 128.0) / 127.0;

  // Convert screen UV to Rapier world position (Y-up, 0 at bottom)
  // Screen coords: Y=0 at top, Rapier coords: Y=0 at bottom
  // vUv.y = 0 corresponds to screen Y=0 (top), which is Rapier Y=worldSize (top)
  vec2 screenPos = vUv * uWorldSize;
  vec2 worldPos = vec2(screenPos.x, uWorldSize - screenPos.y);

  // Accumulate force from rigid bodies
  vec2 forceDelta = vec2(0.0);

  for (float i = 0.0; i < MAX_RIGID_BODIES_F; i += 1.0) {
    if (i >= uRigidBodyCount) break;

    // Read rigid body data from 1D textures
    float texU = (i + 0.5) / MAX_RIGID_BODIES_F;

    vec4 posData = texture2D(uRigidBodyPositions, vec2(texU, 0.5));
    vec4 velData = texture2D(uRigidBodyVelocities, vec2(texU, 0.5));
    vec4 sizeData = texture2D(uRigidBodySizes, vec2(texU, 0.5));
    vec4 shapeData = texture2D(uRigidBodyShapes, vec2(texU, 0.5));

    vec2 bodyPos = posData.rg;
    // Flip velocity Y: Rapier Y-up to screen Y-down
    vec2 bodyVel = vec2(velData.r, -velData.g);
    vec2 bodySize = sizeData.rg;
    float shape = shapeData.r * 255.0; // 0 = box, 1 = circle

    // Calculate overlap
    float overlap = 0.0;
    if (shape < 0.5) {
      // Box
      overlap = boxOverlap(worldPos, bodyPos, bodySize);
    } else {
      // Circle (radius is half of width/height)
      float radius = bodySize.x * 0.5;
      overlap = circleOverlap(worldPos, bodyPos, radius);
    }

    // If overlapping and body has velocity, add force
    if (overlap > 0.0) {
      float speed = length(bodyVel);
      if (speed > 0.1) {
        vec2 forceDir = bodyVel / speed;
        // Force magnitude based on velocity and overlap
        float forceMag = speed * overlap * uForceMultiplier * 0.01;
        forceDelta += forceDir * forceMag;
      }
    }
  }

  // Add force delta to current force
  vec2 newForce = currentForce + forceDelta;

  // Clamp and encode force
  newForce = clamp(newForce, -1.0, 1.0);
  vec2 encodedForce = (newForce * 127.0 + 128.0) / 255.0;

  // Output: preserve temperature, update force
  gl_FragColor = vec4(temperature, encodedForce);
}
`;

/**
 * Shader uniforms interface
 */
export interface RigidBodyToHeatUniforms {
  uHeatTexture: { value: THREE.Texture | null };
  uRigidBodyPositions: { value: THREE.Texture | null };
  uRigidBodyVelocities: { value: THREE.Texture | null };
  uRigidBodySizes: { value: THREE.Texture | null };
  uRigidBodyShapes: { value: THREE.Texture | null };
  uRigidBodyCount: { value: number };
  uWorldSize: { value: number };
  uForceMultiplier: { value: number };
}

import * as THREE from 'three';

/**
 * Create default uniforms for the rigid body to heat shader
 */
export function createRigidBodyToHeatUniforms(worldSize: number): RigidBodyToHeatUniforms {
  return {
    uHeatTexture: { value: null },
    uRigidBodyPositions: { value: null },
    uRigidBodyVelocities: { value: null },
    uRigidBodySizes: { value: null },
    uRigidBodyShapes: { value: null },
    uRigidBodyCount: { value: 0 },
    uWorldSize: { value: worldSize },
    uForceMultiplier: { value: 1.0 },
  };
}
