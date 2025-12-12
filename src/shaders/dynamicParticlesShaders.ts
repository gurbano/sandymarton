/**
 * Dynamic Particles Shaders
 *
 * Three shader passes for the dynamic particles system:
 * 1. Extract: Eject particles from world when force exceeds threshold
 * 2. Simulate: Apply physics (gravity, forces, drag) to dynamic particles
 * 3. Collision: Ray-march movement, handle collisions, reintegrate settled particles
 */

import { generateShaderConstants } from '../world/ParticleTypeConstants';
import { generateMaterialShaderConstants } from '../world/MaterialDefinitions';

/**
 * Standard vertex shader used by all dynamic particle passes
 */
export const dynamicVertexShader = `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/**
 * Shared helper functions for dynamic particle shaders
 */
const dynamicHelperFunctions = `
  ${generateShaderConstants()}
  ${generateMaterialShaderConstants()}

  // Flag constants
  const float FLAG_ACTIVE = 1.0;
  const float FLAG_JUST_SPAWNED = 2.0;
  const float FLAG_FROM_MOMENTUM = 4.0;

  // Check if a particle type is moveable (can become dynamic)
  bool isMoveable(float particleType) {
    // Solids (granular) and liquids can be ejected
    return (particleType >= SOLID_MIN && particleType <= SOLID_MAX) ||
           (particleType >= LIQUID_MIN && particleType <= LIQUID_MAX);
  }

  // Check if a particle type is static (for bouncing)
  bool isStatic(float particleType) {
    return particleType >= STATIC_MIN && particleType <= STATIC_MAX;
  }

  // Check if empty or gas (can pass through)
  bool isPassable(float particleType) {
    return (particleType >= EMPTY_MIN && particleType <= EMPTY_MAX) ||
           (particleType >= GAS_MIN && particleType <= GAS_MAX);
  }

  // Decode 16-bit temperature from particle texture (G=low, B=high)
  float decodeTemperature(vec4 particleData) {
    float tempLow = particleData.g * 255.0;
    float tempHigh = particleData.b * 255.0;
    return tempLow + tempHigh * 256.0;
  }

  // Encode 16-bit temperature to two bytes
  vec2 encodeTemperature(float temp) {
    float clamped = clamp(temp, 0.0, 65535.0);
    float tempLow = mod(clamped, 256.0);
    float tempHigh = floor(clamped / 256.0);
    return vec2(tempLow / 255.0, tempHigh / 255.0);
  }

  // Decode force from heat/force texture (B/A channels, 128 = neutral)
  // Encoding: encodedForce = (force * 127.0 + 128.0) / 255.0
  // Decoding: force = (encoded * 255.0 - 128.0) / 127.0, result in [-1, 1]
  vec2 decodeForce(vec4 heatForceData) {
    return (heatForceData.ba * 255.0 - 128.0) / 127.0;
  }

  // Convert slot index to UV coordinates in dynamic buffer
  vec2 slotToUV(int slot, float bufferSize) {
    float x = mod(float(slot), bufferSize);
    float y = floor(float(slot) / bufferSize);
    return vec2((x + 0.5) / bufferSize, (y + 0.5) / bufferSize);
  }

  // Convert UV to slot index
  int uvToSlot(vec2 uv, float bufferSize) {
    int x = int(uv.x * bufferSize);
    int y = int(uv.y * bufferSize);
    return y * int(bufferSize) + x;
  }

  // Check if flag is set
  bool hasFlag(float flags, float flag) {
    return mod(floor(flags / flag), 2.0) > 0.5;
  }

  // Simple pseudo-random based on position
  float random(vec2 st) {
    return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
  }

  // Check if a particle at worldCoord has at least one empty or gas neighbor
  // This prevents extracting particles that are completely enclosed
  bool hasEmptyOrGasNeighbor(vec2 worldCoord, vec2 textureSize, sampler2D worldTexture) {
    // Check 4 cardinal neighbors
    vec2 offsets[4];
    offsets[0] = vec2(-1.0, 0.0);  // left
    offsets[1] = vec2(1.0, 0.0);   // right
    offsets[2] = vec2(0.0, -1.0);  // down
    offsets[3] = vec2(0.0, 1.0);   // up

    for (int i = 0; i < 4; i++) {
      vec2 neighborCoord = worldCoord + offsets[i];

      // Bounds check
      if (neighborCoord.x < 0.0 || neighborCoord.x >= textureSize.x ||
          neighborCoord.y < 0.0 || neighborCoord.y >= textureSize.y) {
        // Out of bounds counts as "passable" (particle can escape)
        return true;
      }

      vec2 neighborUV = (neighborCoord + 0.5) / textureSize;
      vec4 neighbor = texture2D(worldTexture, neighborUV);
      float neighborType = neighbor.r * 255.0;

      if (isPassable(neighborType)) {
        return true;
      }
    }

    return false;
  }
`;

/**
 * Extract Shader - Runs over WORLD texture
 * Removes particles that were ACTUALLY captured by the Extract Buffer pass.
 *
 * IMPORTANT: This pass must run AFTER Extract Buffer and Extract Aux passes.
 * It reads the newly written dynamic buffers to verify a particle was captured
 * before removing it from the world. This prevents the mismatch where sparse
 * sampling in Extract Buffer misses a particle but Extract World removes it.
 */
export const dynamicExtractWorldFragmentShader = `
  precision highp float;

  uniform sampler2D uCurrentState;      // World texture
  uniform sampler2D uNewDynamicBuffer;  // Newly written dynamic buffer (after Extract Buffer)
  uniform sampler2D uNewDynamicAuxBuffer; // Newly written aux buffer (after Extract Aux)
  uniform vec2 uTextureSize;            // World size
  uniform float uDynamicBufferSize;     // Dynamic buffer dimension (32)
  uniform float uMaxDynamicParticles;   // Total slots (1024)
  uniform float uDynamicEnabled;

  varying vec2 vUv;

  ${dynamicHelperFunctions}

  void main() {
    vec4 particle = texture2D(uCurrentState, vUv);
    float particleType = particle.r * 255.0;

    // Early out if dynamic system disabled or not moveable
    if (uDynamicEnabled < 0.5 || !isMoveable(particleType)) {
      gl_FragColor = particle;
      return;
    }

    // Calculate world coordinate
    vec2 worldCoord = floor(vUv * uTextureSize);

    // Calculate which slot this position maps to
    int slot = int(mod(worldCoord.y * uTextureSize.x + worldCoord.x, uMaxDynamicParticles));
    vec2 slotUV = slotToUV(slot, uDynamicBufferSize);

    // Read the NEW dynamic buffer (written by Extract Buffer pass)
    vec4 newDynamic = texture2D(uNewDynamicBuffer, slotUV);
    vec4 newAux = texture2D(uNewDynamicAuxBuffer, slotUV);

    // Check if this slot contains a particle at THIS world position
    // AND was just spawned this frame (JUST_SPAWNED flag)
    vec2 capturedPos = newDynamic.rg;
    bool justSpawned = hasFlag(newAux.b, FLAG_JUST_SPAWNED);
    bool positionMatches = (floor(capturedPos.x) == worldCoord.x &&
                            floor(capturedPos.y) == worldCoord.y);

    if (justSpawned && positionMatches) {
      // This particle was actually captured - remove it from world
      gl_FragColor = vec4(EMPTY_TYPE / 255.0, particle.g, particle.b, particle.a);
    } else {
      // Not captured (sparse sampling missed it, or slot was busy) - keep in world
      gl_FragColor = particle;
    }
  }
`;

/**
 * Extract Shader - Runs over DYNAMIC BUFFER texture
 * Writes newly extracted particles to their slots
 */
export const dynamicExtractBufferFragmentShader = `
  precision highp float;

  uniform sampler2D uCurrentState;      // World texture (pre-extraction state)
  uniform sampler2D uHeatForceLayer;    // Heat/force texture
  uniform sampler2D uDynamicBuffer;     // Previous dynamic buffer
  uniform sampler2D uDynamicAuxBuffer;  // Previous aux buffer
  uniform vec2 uTextureSize;            // World size
  uniform float uDynamicBufferSize;     // Dynamic buffer dimension (32)
  uniform float uMaxDynamicParticles;
  uniform float uForceEjectionThreshold;
  uniform float uDynamicEnabled;
  uniform float uRandomSeed;
  uniform float uSpeedMultiplier;       // Speed multiplier (0.05-1.0)

  varying vec2 vUv;

  ${dynamicHelperFunctions}

  void main() {
    // Get current slot from UV
    int currentSlot = uvToSlot(vUv, uDynamicBufferSize);

    // Get existing particle data
    vec4 existingParticle = texture2D(uDynamicBuffer, vUv);
    vec4 existingAux = texture2D(uDynamicAuxBuffer, vUv);

    // If slot is already active, preserve it
    if (hasFlag(existingAux.b, FLAG_ACTIVE)) {
      gl_FragColor = existingParticle;
      return;
    }

    if (uDynamicEnabled < 0.5) {
      gl_FragColor = existingParticle;
      return;
    }

    // Optimization: For world width >= maxSlots (common case where width is 1024):
    // slot = (y * width + x) % maxSlots = x (when width is multiple of maxSlots)
    // So slot S simply corresponds to column X = S
    //
    // For other cases, we use modular arithmetic but keep it simple to avoid
    // float precision issues with large numbers.

    float worldWidth = uTextureSize.x;
    float slotF = float(currentSlot);

    // Check if width is a multiple of maxSlots (common case: 1024x1024 world, 1024 slots)
    bool widthIsMultipleOfSlots = mod(worldWidth, uMaxDynamicParticles) < 0.5;

    if (widthIsMultipleOfSlots && slotF < worldWidth) {
      // Simple case: slot S = column X = S, check all rows in this column
      // Performance optimization: rotating sparse sampling - check every 4th row
      // but with a different offset each frame so all rows are eventually checked
      float worldX = slotF;

      // Rotate which rows we check each frame (0-3 offset based on uRandomSeed)
      float frameOffset = mod(floor(uRandomSeed * 60.0), 4.0);

      for (float searchY = frameOffset; searchY < uTextureSize.y; searchY += 4.0) {
        vec2 worldCoord = vec2(worldX, searchY);
        vec2 worldUV = (worldCoord + 0.5) / uTextureSize;
        vec4 worldParticle = texture2D(uCurrentState, worldUV);
        float particleType = worldParticle.r * 255.0;

        if (!isMoveable(particleType)) continue;

        // Read force from heat layer
        vec4 heatForce = texture2D(uHeatForceLayer, worldUV);
        vec2 force = decodeForce(heatForce);
        float forceMag = length(force);

        // Extract particle only if force exceeds threshold
        if (forceMag >= uForceEjectionThreshold) {
          // Initial velocity from force direction - scale up for visible movement
          vec2 initialVel = normalize(force) * min(forceMag * 2.0 * uSpeedMultiplier, 4.0 * uSpeedMultiplier);
          gl_FragColor = vec4(worldCoord.x, worldCoord.y, initialVel.x, initialVel.y);
          return;
        }
      }
    } else {
      // General case: iterate through all positions and check which ones hash to this slot
      // This is slower but handles non-power-of-2 world sizes
      // Performance optimization: rotating sparse sampling (every 4th)
      float frameOffset = mod(floor(uRandomSeed * 60.0), 4.0);
      for (float searchY = frameOffset; searchY < uTextureSize.y; searchY += 4.0) {
        for (float searchX = frameOffset; searchX < uTextureSize.x; searchX += 4.0) {
          // Calculate slot for this position using integer math to avoid precision issues
          float linearIndex = searchY * worldWidth + searchX;
          float targetSlot = mod(linearIndex, uMaxDynamicParticles);

          if (abs(targetSlot - slotF) > 0.5) continue;

          vec2 worldCoord = vec2(searchX, searchY);
          vec2 worldUV = (worldCoord + 0.5) / uTextureSize;
          vec4 worldParticle = texture2D(uCurrentState, worldUV);
          float particleType = worldParticle.r * 255.0;

          if (!isMoveable(particleType)) continue;

          vec4 heatForce = texture2D(uHeatForceLayer, worldUV);
          vec2 force = decodeForce(heatForce);
          float forceMag = length(force);

          // Extract particle only if force exceeds threshold
          if (forceMag >= uForceEjectionThreshold) {
            // Initial velocity from force direction - scale up for visible movement
            vec2 initialVel = normalize(force) * min(forceMag * 2.0 * uSpeedMultiplier, 4.0 * uSpeedMultiplier);
            gl_FragColor = vec4(worldCoord.x, worldCoord.y, initialVel.x, initialVel.y);
            return;
          }
        }
      }
    }

    // No particle found for this slot
    gl_FragColor = existingParticle;
  }
`;

/**
 * Extract Shader - Auxiliary buffer update
 * Writes type/temperature/flags for newly extracted particles
 */
export const dynamicExtractAuxFragmentShader = `
  precision highp float;

  uniform sampler2D uCurrentState;      // World texture (pre-extraction state)
  uniform sampler2D uHeatForceLayer;
  uniform sampler2D uDynamicBuffer;     // Updated dynamic buffer (post-extract)
  uniform sampler2D uDynamicAuxBuffer;  // Previous aux buffer
  uniform vec2 uTextureSize;
  uniform float uDynamicBufferSize;
  uniform float uMaxDynamicParticles;
  uniform float uForceEjectionThreshold;
  uniform float uDynamicEnabled;

  varying vec2 vUv;

  ${dynamicHelperFunctions}

  void main() {
    vec4 existingAux = texture2D(uDynamicAuxBuffer, vUv);
    vec4 dynamicParticle = texture2D(uDynamicBuffer, vUv);

    // If already active, just clear justSpawned flag and increment lifetime
    if (hasFlag(existingAux.b, FLAG_ACTIVE)) {
      float newFlags = FLAG_ACTIVE; // Clear justSpawned
      if (hasFlag(existingAux.b, FLAG_FROM_MOMENTUM)) {
        newFlags += FLAG_FROM_MOMENTUM;
      }
      float newLifetime = existingAux.a + 1.0;
      gl_FragColor = vec4(existingAux.r, existingAux.g, newFlags, newLifetime);
      return;
    }

    if (uDynamicEnabled < 0.5) {
      gl_FragColor = existingAux;
      return;
    }

    // Check if this slot got a new particle (position changed from 0,0)
    vec2 pos = dynamicParticle.rg;
    if (pos.x == 0.0 && pos.y == 0.0 && dynamicParticle.b == 0.0 && dynamicParticle.a == 0.0) {
      // Still empty
      gl_FragColor = existingAux;
      return;
    }

    // New particle extracted - get its type and temperature from world
    vec2 worldUV = (pos + 0.5) / uTextureSize;
    vec4 worldParticle = texture2D(uCurrentState, worldUV);

    float particleType = worldParticle.r * 255.0;
    float temperature = decodeTemperature(worldParticle);
    float flags = FLAG_ACTIVE + FLAG_JUST_SPAWNED;
    float lifetime = 0.0;

    gl_FragColor = vec4(particleType, temperature, flags, lifetime);
  }
`;

/**
 * Simulate Shader - Physics update for dynamic particles
 * Applies gravity, force field influence, and air resistance
 */
export const dynamicSimulateFragmentShader = `
  precision highp float;

  uniform sampler2D uDynamicBuffer;
  uniform sampler2D uDynamicAuxBuffer;
  uniform sampler2D uHeatForceLayer;
  uniform vec2 uTextureSize;            // World size (for force sampling)
  uniform float uDynamicBufferSize;
  uniform float uDynamicGravity;
  uniform float uDynamicFriction;
  uniform float uDynamicEnabled;
  uniform float uSpeedMultiplier;       // Speed multiplier (0.05-1.0)

  varying vec2 vUv;

  ${dynamicHelperFunctions}

  void main() {
    vec4 particle = texture2D(uDynamicBuffer, vUv);
    vec4 aux = texture2D(uDynamicAuxBuffer, vUv);

    // Skip inactive particles
    if (uDynamicEnabled < 0.5 || !hasFlag(aux.b, FLAG_ACTIVE)) {
      gl_FragColor = particle;
      return;
    }

    vec2 pos = particle.rg;
    vec2 vel = particle.ba;

    // Sample force field at current position
    vec2 forceUV = (pos + 0.5) / uTextureSize;

    // Bounds check for force sampling
    if (forceUV.x >= 0.0 && forceUV.x <= 1.0 && forceUV.y >= 0.0 && forceUV.y <= 1.0) {
      vec4 heatForce = texture2D(uHeatForceLayer, forceUV);
      vec2 force = decodeForce(heatForce);
      vel += force * 0.5 * uSpeedMultiplier; // Force influence (strong push while in force field)
    }

    // Apply gravity (negative Y is down in world coords), scaled by speed multiplier
    vel.y -= uDynamicGravity * uSpeedMultiplier;

    // Apply air resistance/friction
    vel *= uDynamicFriction;

    // Update position based on velocity (simple integration)
    pos += vel;

    // Clamp position to world bounds and bounce off edges
    if (pos.x < 0.0) {
      pos.x = 0.0;
      vel.x = abs(vel.x) * 0.5; // Bounce right
    }
    if (pos.x >= uTextureSize.x - 1.0) {
      pos.x = uTextureSize.x - 1.0;
      vel.x = -abs(vel.x) * 0.5; // Bounce left
    }
    if (pos.y < 0.0) {
      pos.y = 0.0;
      vel.y = abs(vel.y) * 0.5; // Bounce up
    }
    if (pos.y >= uTextureSize.y - 1.0) {
      pos.y = uTextureSize.y - 1.0;
      vel.y = -abs(vel.y) * 0.5; // Bounce down
    }

    gl_FragColor = vec4(pos, vel);
  }
`;

/**
 * Collision Shader - Ray-march movement and handle collisions
 * Updates position, handles bouncing, and marks particles for reintegration
 */
export const dynamicCollisionFragmentShader = `
  precision highp float;

  uniform sampler2D uDynamicBuffer;
  uniform sampler2D uDynamicAuxBuffer;
  uniform sampler2D uCurrentState;      // World texture
  uniform vec2 uTextureSize;
  uniform float uDynamicBufferSize;
  uniform float uMaxTraversal;
  uniform float uVelocityThreshold;
  uniform float uBounceRestitution;
  uniform float uDynamicEnabled;
  uniform float uRandomSeed;

  varying vec2 vUv;

  ${dynamicHelperFunctions}

  // Estimate surface normal by sampling neighbors
  vec2 estimateNormal(vec2 pos) {
    vec2 pixelSize = 1.0 / uTextureSize;
    float left = texture2D(uCurrentState, (pos + vec2(-1.0, 0.0) + 0.5) / uTextureSize).r;
    float right = texture2D(uCurrentState, (pos + vec2(1.0, 0.0) + 0.5) / uTextureSize).r;
    float down = texture2D(uCurrentState, (pos + vec2(0.0, -1.0) + 0.5) / uTextureSize).r;
    float up = texture2D(uCurrentState, (pos + vec2(0.0, 1.0) + 0.5) / uTextureSize).r;

    // Higher values mean more solid
    float dx = (isPassable(right * 255.0) ? 0.0 : 1.0) - (isPassable(left * 255.0) ? 0.0 : 1.0);
    float dy = (isPassable(up * 255.0) ? 0.0 : 1.0) - (isPassable(down * 255.0) ? 0.0 : 1.0);

    vec2 normal = vec2(-dx, -dy);
    if (length(normal) < 0.01) {
      // Default to upward normal if can't determine
      return vec2(0.0, 1.0);
    }
    return normalize(normal);
  }

  void main() {
    vec4 particle = texture2D(uDynamicBuffer, vUv);
    vec4 aux = texture2D(uDynamicAuxBuffer, vUv);

    // Skip inactive particles
    if (uDynamicEnabled < 0.5 || !hasFlag(aux.b, FLAG_ACTIVE)) {
      gl_FragColor = particle;
      return;
    }

    vec2 pos = particle.rg;
    vec2 vel = particle.ba;
    float speed = length(vel);

    // Check if should settle (velocity below threshold)
    if (speed < uVelocityThreshold) {
      // Signal settle by zeroing velocity (reintegration pass will handle it)
      gl_FragColor = vec4(pos, 0.0, 0.0);
      return;
    }

    // Ray-march along velocity
    vec2 dir = speed > 0.001 ? normalize(vel) : vec2(0.0, -1.0);
    float maxDist = min(speed, uMaxTraversal);

    vec2 newPos = pos;
    vec2 newVel = vel;

    for (float t = 1.0; t <= 8.0; t += 1.0) { // Max 8 steps (hardcoded for GLSL)
      if (t > maxDist) break;

      vec2 checkPos = pos + dir * t;
      vec2 checkUV = (checkPos + 0.5) / uTextureSize;

      // Bounds check
      if (checkUV.x < 0.0 || checkUV.x > 1.0) {
        // Hit horizontal boundary - reflect X
        newVel.x = -newVel.x * uBounceRestitution;
        newVel.y *= uBounceRestitution;
        break;
      }
      if (checkUV.y < 0.0 || checkUV.y > 1.0) {
        // Hit vertical boundary - reflect Y
        newVel.y = -newVel.y * uBounceRestitution;
        newVel.x *= uBounceRestitution;
        break;
      }

      vec4 worldCell = texture2D(uCurrentState, checkUV);
      float cellType = worldCell.r * 255.0;

      if (!isPassable(cellType)) {
        // Hit something solid!
        if (isStatic(cellType)) {
          // Bounce off static surface
          vec2 normal = estimateNormal(checkPos);
          newVel = reflect(newVel, normal) * uBounceRestitution;
        } else {
          // Hit moveable particle - lose momentum (momentum transfer would spawn new dynamic)
          newVel *= 0.5;
        }
        break;
      }

      // No collision - can move here
      newPos = checkPos;
    }

    gl_FragColor = vec4(newPos, newVel);
  }
`;

/**
 * Reintegration Shader - Runs over WORLD texture
 * Writes settled dynamic particles back into the world
 */
export const dynamicReintegrateWorldFragmentShader = `
  precision highp float;

  uniform sampler2D uCurrentState;      // Current world texture
  uniform sampler2D uDynamicBuffer;
  uniform sampler2D uDynamicAuxBuffer;
  uniform vec2 uTextureSize;
  uniform float uDynamicBufferSize;
  uniform float uMaxDynamicParticles;
  uniform float uDynamicEnabled;
  uniform float uRandomSeed;            // For rotating sparse sampling
  uniform float uVelocityThreshold;     // Velocity threshold for settling

  varying vec2 vUv;

  ${dynamicHelperFunctions}

  void main() {
    vec4 worldParticle = texture2D(uCurrentState, vUv);

    if (uDynamicEnabled < 0.5) {
      gl_FragColor = worldParticle;
      return;
    }

    vec2 worldCoord = floor(vUv * uTextureSize);
    float worldType = worldParticle.r * 255.0;

    // Only reintegrate into empty cells
    if (!isPassable(worldType)) {
      gl_FragColor = worldParticle;
      return;
    }

    // Rotating sparse sampling: check 128 slots per frame with rotating offset
    // Over 8 frames, all 1024 slots are checked. Particles with zero velocity
    // stay in the dynamic buffer until their slot is checked and they reintegrate.
    float baseOffset = mod(floor(uRandomSeed * 60.0), 8.0); // 0-7 offset

    for (float i = 0.0; i < 128.0; i += 1.0) {
      float slotIndex = baseOffset + i * 8.0; // Check every 8th slot, offset by baseOffset
      if (slotIndex >= uMaxDynamicParticles) break;

      float slotY = floor(slotIndex / uDynamicBufferSize);
      float slotX = mod(slotIndex, uDynamicBufferSize);
      vec2 slotUV = vec2((slotX + 0.5) / uDynamicBufferSize, (slotY + 0.5) / uDynamicBufferSize);
      vec4 aux = texture2D(uDynamicAuxBuffer, slotUV);

      if (!hasFlag(aux.b, FLAG_ACTIVE)) continue;

      vec4 dynamic = texture2D(uDynamicBuffer, slotUV);
      vec2 dynamicPos = dynamic.rg;
      vec2 dynamicVel = dynamic.ba;

      // Check if this particle wants to settle at this world position
      // Use velocity threshold to match collision shader's settle detection
      if (floor(dynamicPos.x) == worldCoord.x &&
          floor(dynamicPos.y) == worldCoord.y &&
          length(dynamicVel) < uVelocityThreshold) {
        // Reintegrate this particle!
        float particleType = aux.r;
        float temperature = aux.g;
        vec2 encodedTemp = encodeTemperature(temperature);

        gl_FragColor = vec4(particleType / 255.0, encodedTemp.x, encodedTemp.y, 1.0);
        return;
      }
    }

    // No particle settling here this frame
    gl_FragColor = worldParticle;
  }
`;

/**
 * Reintegration Aux Shader - Clear settled particles from aux buffer
 */
export const dynamicReintegrateAuxFragmentShader = `
  precision highp float;

  uniform sampler2D uDynamicBuffer;
  uniform sampler2D uDynamicAuxBuffer;
  uniform sampler2D uCurrentState;      // World texture (post-reintegration)
  uniform vec2 uTextureSize;
  uniform float uDynamicBufferSize;
  uniform float uDynamicEnabled;
  uniform float uVelocityThreshold;     // Velocity threshold for settling

  varying vec2 vUv;

  ${dynamicHelperFunctions}

  void main() {
    vec4 aux = texture2D(uDynamicAuxBuffer, vUv);

    if (uDynamicEnabled < 0.5 || !hasFlag(aux.b, FLAG_ACTIVE)) {
      gl_FragColor = aux;
      return;
    }

    vec4 dynamic = texture2D(uDynamicBuffer, vUv);
    vec2 pos = dynamic.rg;
    vec2 vel = dynamic.ba;

    // Check if this particle has settled (velocity below threshold)
    if (length(vel) < uVelocityThreshold) {
      // Check if it was successfully placed in world
      vec2 worldUV = (floor(pos) + 0.5) / uTextureSize;
      vec4 worldParticle = texture2D(uCurrentState, worldUV);
      float worldType = worldParticle.r * 255.0;

      // If world cell now has our particle type, we've been reintegrated
      if (abs(worldType - aux.r) < 0.5) {
        // Clear this slot
        gl_FragColor = vec4(0.0, 0.0, 0.0, 0.0);
        return;
      }
    }

    // Still active
    gl_FragColor = aux;
  }
`;
