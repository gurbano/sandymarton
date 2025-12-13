/**
 * Shader for generating a mask texture showing where rigid bodies are
 * Used by Margolus and liquid spread shaders to treat rigid body pixels as STATIC
 *
 * Output: Single-channel texture where 1.0 = rigid body present, 0.0 = empty
 */

import { MAX_RIGID_BODIES } from '../types/PhysicsConfig';

export const rigidBodyMaskVertexShader = `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const rigidBodyMaskFragmentShader = `
precision highp float;

uniform sampler2D uRigidBodyPositions;   // x, y positions (MAX_RIGID_BODIES x 1)
uniform sampler2D uRigidBodySizes;       // width, height per body (MAX_RIGID_BODIES x 1)
uniform sampler2D uRigidBodyShapes;      // 0 = box, 1 = circle (MAX_RIGID_BODIES x 1)
uniform float uRigidBodyCount;           // Number of active rigid bodies
uniform vec2 uTextureSize;               // World texture size

varying vec2 vUv;

const float MAX_RIGID_BODIES_F = ${MAX_RIGID_BODIES}.0;

// Check if point is inside a box (axis-aligned)
bool pointInBox(vec2 point, vec2 boxCenter, vec2 boxSize) {
  vec2 halfSize = boxSize * 0.5;
  vec2 d = abs(point - boxCenter);
  return d.x < halfSize.x && d.y < halfSize.y;
}

// Check if point is inside a circle
bool pointInCircle(vec2 point, vec2 center, float radius) {
  return length(point - center) < radius;
}

void main() {
  // World position in Rapier coordinates (Y-up, matching PhysicsManager)
  // vUv.y = 0 at bottom in texture coords, which aligns with Rapier's Y-up
  vec2 worldPos = vUv * uTextureSize;

  // Check if any rigid body covers this pixel
  for (float i = 0.0; i < MAX_RIGID_BODIES_F; i += 1.0) {
    if (i >= uRigidBodyCount) break;

    // Read rigid body data from 1D textures
    float texU = (i + 0.5) / MAX_RIGID_BODIES_F;

    vec4 posData = texture2D(uRigidBodyPositions, vec2(texU, 0.5));
    vec4 sizeData = texture2D(uRigidBodySizes, vec2(texU, 0.5));
    vec4 shapeData = texture2D(uRigidBodyShapes, vec2(texU, 0.5));

    vec2 bodyPos = posData.rg;
    vec2 bodySize = sizeData.rg;
    float shape = shapeData.r * 255.0; // 0 = box, 1 = circle

    bool inside = false;
    if (shape < 0.5) {
      // Box
      inside = pointInBox(worldPos, bodyPos, bodySize);
    } else {
      // Circle (radius is half of width)
      float radius = bodySize.x * 0.5;
      inside = pointInCircle(worldPos, bodyPos, radius);
    }

    if (inside) {
      gl_FragColor = vec4(1.0, 0.0, 0.0, 1.0); // Masked
      return;
    }
  }

  // Not masked
  gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0);
}
`;

/**
 * Shader uniforms interface
 */
export interface RigidBodyMaskUniforms {
  uRigidBodyPositions: { value: THREE.Texture | null };
  uRigidBodySizes: { value: THREE.Texture | null };
  uRigidBodyShapes: { value: THREE.Texture | null };
  uRigidBodyCount: { value: number };
  uTextureSize: { value: THREE.Vector2 };
}

import * as THREE from 'three';

/**
 * Create default uniforms for the rigid body mask shader
 */
export function createRigidBodyMaskUniforms(textureSize: number): RigidBodyMaskUniforms {
  return {
    uRigidBodyPositions: { value: null },
    uRigidBodySizes: { value: null },
    uRigidBodyShapes: { value: null },
    uRigidBodyCount: { value: 0 },
    uTextureSize: { value: new THREE.Vector2(textureSize, textureSize) },
  };
}
