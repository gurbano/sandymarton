/**
 * Force Transfer Shader
 * Handles force propagation through materials
 *
 * Converts particle velocity into force and propagates it to neighbors.
 * Force is stored in the heat/force texture B/A channels (128 = neutral).
 */

export const forceTransferVertexShader = `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const forceTransferFragmentShader = `
  uniform sampler2D uCurrentState;    // Particle state texture (R=type, G=velX, B=velY, A=data)
  uniform sampler2D uHeatForceLayer;  // Heat/Force layer (R=tempLow, G=tempHigh, B=forceX, A=forceY)
  uniform vec2 uTextureSize;
  uniform float uIteration;
  uniform float uRandomSeed;

  varying vec2 vUv;

  // Material type ranges
  const float SOLID_MIN = 33.0;
  const float SOLID_MAX = 63.0;
  const float LIQUID_MIN = 64.0;
  const float LIQUID_MAX = 111.0;

  // Decode velocity from particle state (G/B channels, 128 = neutral)
  vec2 decodeVelocity(vec4 state) {
    return vec2(state.g, state.b) * 255.0 - 128.0;
  }

  // Encode force to 0-1 range (128 = neutral in 0-255 space)
  float encodeForce(float f) {
    return clamp((f * 127.0 + 128.0) / 255.0, 0.0, 1.0);
  }

  // Decode force from 0-1 range
  float decodeForce(float encoded) {
    return (encoded * 255.0 - 128.0) / 127.0;
  }

  bool isMoveable(float particleType) {
    return (particleType >= SOLID_MIN && particleType <= SOLID_MAX) ||
           (particleType >= LIQUID_MIN && particleType <= LIQUID_MAX);
  }

  void main() {
    vec2 pixel = 1.0 / uTextureSize;

    // Sample current particle
    vec4 state = texture2D(uCurrentState, vUv);
    vec4 heatForce = texture2D(uHeatForceLayer, vUv);

    float particleType = state.r * 255.0;

    // Start with existing force (with decay)
    float existingForceX = decodeForce(heatForce.b);
    float existingForceY = decodeForce(heatForce.a);
    vec2 force = vec2(existingForceX, existingForceY) * 0.8; // Decay existing force

    // If this is a moveable particle, convert its velocity to force
    if (isMoveable(particleType)) {
      vec2 velocity = decodeVelocity(state);

      // Add velocity-based force (normalized and scaled)
      float velMag = length(velocity);
      if (velMag > 0.5) {
        vec2 velForce = normalize(velocity) * min(velMag / 4.0, 1.0);
        force += velForce * 0.5;
      }
    }

    // Accumulate force from neighbors (force propagation)
    for (float dy = -1.0; dy <= 1.0; dy += 1.0) {
      for (float dx = -1.0; dx <= 1.0; dx += 1.0) {
        if (dx == 0.0 && dy == 0.0) continue;

        vec2 neighborUV = vUv + vec2(dx, dy) * pixel;
        if (neighborUV.x < 0.0 || neighborUV.x > 1.0 || neighborUV.y < 0.0 || neighborUV.y > 1.0) continue;

        vec4 neighborState = texture2D(uCurrentState, neighborUV);
        float neighborType = neighborState.r * 255.0;

        // Only transfer force from moveable particles
        if (isMoveable(neighborType)) {
          vec2 neighborVel = decodeVelocity(neighborState);
          float neighborVelMag = length(neighborVel);

          // Transfer force in the direction of velocity if moving toward this cell
          if (neighborVelMag > 1.0) {
            vec2 toThis = -vec2(dx, dy);
            float alignment = dot(normalize(neighborVel), normalize(toThis));

            if (alignment > 0.3) {
              // Neighbor is moving toward us - transfer some force
              force += normalize(neighborVel) * alignment * neighborVelMag * 0.1;
            }
          }
        }
      }
    }

    // Clamp force magnitude
    float forceMag = length(force);
    if (forceMag > 2.0) {
      force = normalize(force) * 2.0;
    }

    // Output: keep temperature (R,G), update force (B,A)
    gl_FragColor = vec4(
      heatForce.r,  // Temperature low byte
      heatForce.g,  // Temperature high byte
      encodeForce(force.x),
      encodeForce(force.y)
    );
  }
`;
