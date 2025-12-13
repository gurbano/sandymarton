/**
 * Force Extraction Shader
 *
 * Single-pass shader that scans the world for particles affected by force
 * and outputs them to a small transfer texture for CPU readback.
 *
 * Output: 64x1 RGBA32F texture where each pixel contains:
 * - R: worldX position
 * - G: worldY position
 * - B: velocityX (from force direction)
 * - A: velocityY (from force direction)
 *
 * A position of (-1, -1) indicates no particle found in that slot.
 */

import { EXTRACTION_BUFFER_SIZE } from '../types/PhysicsConfig';

export const forceExtractionVertexShader = `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const forceExtractionFragmentShader = `
  precision highp float;

  uniform sampler2D uWorldTexture;
  uniform sampler2D uHeatForceTexture;
  uniform vec2 uTextureSize;
  uniform float uForceThreshold;
  uniform float uEjectionVelocityMultiplier;
  uniform float uTime;

  varying vec2 vUv;

  // Material type ranges
  const float SOLID_MIN = 33.0;
  const float SOLID_MAX = 63.0;
  const float LIQUID_MIN = 64.0;
  const float LIQUID_MAX = 111.0;

  // Decode force from heat/force texture (B/A channels, 128 = neutral)
  vec2 decodeForce(vec4 heatForce) {
    return (heatForce.ba * 255.0 - 128.0) / 127.0;
  }

  // Check if particle type can be ejected
  bool isMoveable(float particleType) {
    return (particleType >= SOLID_MIN && particleType <= SOLID_MAX) ||
           (particleType >= LIQUID_MIN && particleType <= LIQUID_MAX);
  }

  void main() {
    // Slot index from fragment position (0-255)
    float slot = floor(gl_FragCoord.x);
    float totalSlots = ${EXTRACTION_BUFFER_SIZE}.0;

    // Each slot scans a vertical stripe of the world
    float stripeWidth = uTextureSize.x / totalSlots;
    float startX = slot * stripeWidth;
    float endX = startX + stripeWidth;

    // Use slot number to offset Y start position - different slots scan different Y regions first
    // This ensures we get particles from all parts of the brush, not just the bottom
    float slotYOffset = mod(slot * 7.0, uTextureSize.y); // Prime multiplier for good distribution
    float frameOffset = mod(floor(uTime * 60.0), 2.0);

    // Scan this stripe for particles with high force, starting from varied Y positions
    for (float x = startX; x < endX; x += 1.0) {
      // Scan the full height starting from slotYOffset, wrapping around
      for (float i = 0.0; i < uTextureSize.y; i += 2.0) {
        float y = mod(slotYOffset + i + frameOffset, uTextureSize.y);
        vec2 worldCoord = vec2(x, y);
        vec2 worldUV = (worldCoord + 0.5) / uTextureSize;

        // Sample world particle
        vec4 worldParticle = texture2D(uWorldTexture, worldUV);
        float particleType = worldParticle.r * 255.0;

        // Skip non-moveable particles
        if (!isMoveable(particleType)) continue;

        // Sample force at this position
        vec4 heatForce = texture2D(uHeatForceTexture, worldUV);
        vec2 force = decodeForce(heatForce);
        float forceMag = length(force);

        // Check if force exceeds threshold
        if (forceMag >= uForceThreshold) {
          // Calculate initial velocity from force - no cap, let physics handle it
          vec2 vel = force * uEjectionVelocityMultiplier;

          // Output: position and velocity
          gl_FragColor = vec4(x, y, vel.x, vel.y);
          return;
        }
      }
    }

    // No particle found - output invalid marker
    gl_FragColor = vec4(-1.0, -1.0, 0.0, 0.0);
  }
`;
