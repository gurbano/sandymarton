/**
 * Particle Removal Shader
 *
 * Removes extracted particles from the world texture.
 * Takes a list of positions to clear (set to empty type).
 *
 * This runs as a single pass after extraction readback,
 * clearing particles that were successfully transferred to physics.
 */

import { EXTRACTION_BUFFER_SIZE } from '../types/PhysicsConfig';

export const particleRemovalVertexShader = `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const particleRemovalFragmentShader = `
  precision highp float;

  uniform sampler2D uCurrentState;
  uniform sampler2D uRemovalTexture;  // 64x1 texture with positions to remove
  uniform vec2 uTextureSize;
  uniform float uRemovalCount;        // Number of valid removal positions

  varying vec2 vUv;

  const float EMPTY_TYPE = 0.0;

  void main() {
    vec4 particle = texture2D(uCurrentState, vUv);
    vec2 worldCoord = floor(vUv * uTextureSize);

    // Check if this position should be cleared
    for (float i = 0.0; i < ${EXTRACTION_BUFFER_SIZE}.0; i += 1.0) {
      if (i >= uRemovalCount) break;

      // Read removal position from texture
      vec2 removalUV = vec2((i + 0.5) / ${EXTRACTION_BUFFER_SIZE}.0, 0.5);
      vec4 removalData = texture2D(uRemovalTexture, removalUV);
      vec2 removalPos = removalData.rg;

      // Skip invalid positions (marker is -1, -1)
      if (removalPos.x < 0.0) continue;

      // Check if this is the position to remove
      if (floor(removalPos.x) == worldCoord.x && floor(removalPos.y) == worldCoord.y) {
        // Clear to empty, preserve temperature
        gl_FragColor = vec4(EMPTY_TYPE / 255.0, particle.g, particle.b, particle.a);
        return;
      }
    }

    // No removal - keep original
    gl_FragColor = particle;
  }
`;
