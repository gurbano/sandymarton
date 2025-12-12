/**
 * GPU shader for player physics (read-only - doesn't modify world)
 *
 * This shader:
 * 1. Reads world state for collision detection
 * 2. Calculates new position based on input and physics
 * 3. Outputs player state to small feedback texture
 *
 * The player is rendered as a sprite overlay, not as particles.
 */

import { generateShaderConstants } from '../world/ParticleTypeConstants';
import { generateMaterialShaderConstants } from '../world/MaterialDefinitions';

export const playerUpdateVertexShader = `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/**
 * Fragment shader for player output pass
 * Reads world state and outputs player physics to a small texture
 * This is rendered to a 4x4 texture that gets read back to CPU
 */
export const playerOutputFragmentShader = `
  precision highp float;

  uniform sampler2D uCurrentState;
  uniform vec2 uTextureSize;
  uniform vec2 uOutputSize;  // Should be 4x4

  // Player state (from CPU)
  uniform float uPlayerEnabled;
  uniform vec2 uPlayerPosition;
  uniform vec2 uPlayerVelocity;
  uniform vec2 uPlayerInput;
  uniform float uPlayerJumping;
  uniform float uWalkPhase;  // 0-1, used for animated hitboxes

  // Player settings
  uniform float uPlayerSpeed;
  uniform float uPlayerJumpStrength;
  uniform float uPlayerGravity;
  uniform float uPlayerMass;
  uniform float uPlayerFriction;
  uniform float uPlayerAirResistance;
  uniform float uPushOutStrength;  // How strongly overlapping particles push player

  // Hitbox dimensions (simplified)
  uniform float uPlayerWidth;   // Base width
  uniform float uPlayerHeight;  // Total height
  uniform float uHeadRadius;    // Head circle radius
  uniform float uBodyWidth;     // Body width
  uniform float uBodyHeight;    // Body height
  uniform float uLegWidth;      // Leg width
  uniform float uLegHeight;     // Leg height
  uniform float uFootOffset;    // How far feet swing during walk

  varying vec2 vUv;

  ${generateShaderConstants()}
  ${generateMaterialShaderConstants()}

  // Check if a particle type blocks movement
  bool isBlocking(float particleType) {
    return particleType >= STATIC_MIN && particleType <= STATIC_MAX;
  }

  bool isSolidParticle(float particleType) {
    return particleType >= SOLID_MIN && particleType <= SOLID_MAX;
  }

  bool isLiquid(float particleType) {
    return particleType >= LIQUID_MIN && particleType <= LIQUID_MAX;
  }

  bool isGas(float particleType) {
    return particleType >= GAS_MIN && particleType <= GAS_MAX;
  }

  // Sample world at a position
  vec4 sampleWorld(vec2 pos) {
    if (pos.x < 0.0 || pos.x >= uTextureSize.x ||
        pos.y < 0.0 || pos.y >= uTextureSize.y) {
      return vec4(STATIC_MIN / 255.0, 0.0, 0.0, 1.0);  // Out of bounds = solid
    }
    vec2 uv = (pos + 0.5) / uTextureSize;
    return texture2D(uCurrentState, uv);
  }

  // Check collision for a rectangular hitbox
  // Returns: x=blocked, y=liquid density sum, z=damage flags, w=sample count
  vec4 checkRectCollision(vec2 center, float halfW, float halfH) {
    float blocked = 0.0;
    float liquidSum = 0.0;
    float damage = 0.0;
    float count = 0.0;

    // Sample corners and edges
    for (float dy = -1.0; dy <= 1.0; dy += 1.0) {
      for (float dx = -1.0; dx <= 1.0; dx += 1.0) {
        vec2 pos = center + vec2(dx * halfW, dy * halfH);
        vec4 pixel = sampleWorld(pos);
        float ptype = pixel.r * 255.0;

        if (isBlocking(ptype)) blocked = 1.0;
        if (isSolidParticle(ptype)) {
          float density = getMaterialDensity(ptype);
          if (density > uPlayerMass * 50.0) blocked = 1.0;
        }
        if (isLiquid(ptype)) {
          liquidSum += getMaterialDensity(ptype);
        }

        // Damage checks
        if (ptype == LAVA_TYPE) damage += 1.0;
        if (ptype == ACID_TYPE) damage += 4.0;
        if (ptype == LIQUID_NITROGEN_TYPE || ptype == COOLANT_TYPE) damage += 2.0;

        count += 1.0;
      }
    }

    return vec4(blocked, liquidSum, damage, count);
  }

  // Check collision for a circular hitbox (head)
  vec4 checkCircleCollision(vec2 center, float radius) {
    float blocked = 0.0;
    float liquidSum = 0.0;
    float damage = 0.0;
    float count = 0.0;

    // Sample in a cross pattern
    for (float i = 0.0; i < 8.0; i++) {
      float angle = i * 0.785398;  // PI/4
      vec2 pos = center + vec2(cos(angle), sin(angle)) * radius * 0.8;
      vec4 pixel = sampleWorld(pos);
      float ptype = pixel.r * 255.0;

      if (isBlocking(ptype)) blocked = 1.0;
      if (isSolidParticle(ptype)) {
        float density = getMaterialDensity(ptype);
        if (density > uPlayerMass * 50.0) blocked = 1.0;
      }
      if (isLiquid(ptype)) {
        liquidSum += getMaterialDensity(ptype);
      }

      if (ptype == LAVA_TYPE) damage += 1.0;
      if (ptype == ACID_TYPE) damage += 4.0;
      if (ptype == LIQUID_NITROGEN_TYPE || ptype == COOLANT_TYPE) damage += 2.0;

      count += 1.0;
    }

    return vec4(blocked, liquidSum, damage, count);
  }

  // Check full player collision using animated hitboxes
  vec4 checkPlayerCollision(vec2 playerPos) {
    float blocked = 0.0;
    float liquidSum = 0.0;
    float damage = 0.0;
    float count = 0.0;

    // Calculate animated foot positions
    float walkSin = sin(uWalkPhase * 6.28318);  // Full cycle
    float leftFootX = -uLegWidth * 0.5 + walkSin * uFootOffset;
    float rightFootX = uLegWidth * 0.5 - walkSin * uFootOffset;

    // Left foot hitbox (center at half leg height, bottom aligns with playerPos.y)
    vec2 leftFoot = playerPos + vec2(leftFootX, uLegHeight * 0.5);
    vec4 lf = checkRectCollision(leftFoot, uLegWidth * 0.4, uLegHeight * 0.5);
    blocked = max(blocked, lf.x);
    liquidSum += lf.y;
    damage += lf.z;
    count += lf.w;

    // Right foot hitbox (center at half leg height, bottom aligns with playerPos.y)
    vec2 rightFoot = playerPos + vec2(rightFootX, uLegHeight * 0.5);
    vec4 rf = checkRectCollision(rightFoot, uLegWidth * 0.4, uLegHeight * 0.5);
    blocked = max(blocked, rf.x);
    liquidSum += rf.y;
    damage += rf.z;
    count += rf.w;

    // Body hitbox (center above legs)
    float armSwing = abs(walkSin) * 3.0;  // Arms swing out when walking
    float bodyHalfW = uBodyWidth * 0.5 + armSwing;
    vec2 body = playerPos + vec2(0.0, uLegHeight + uBodyHeight * 0.5);
    vec4 b = checkRectCollision(body, bodyHalfW, uBodyHeight * 0.5);
    blocked = max(blocked, b.x);
    liquidSum += b.y;
    damage += b.z;
    count += b.w;

    // Head hitbox (circle)
    vec2 head = playerPos + vec2(0.0, uPlayerHeight - uHeadRadius);
    vec4 h = checkCircleCollision(head, uHeadRadius);
    blocked = max(blocked, h.x);
    liquidSum += h.y;
    damage += h.z;
    count += h.w;

    return vec4(blocked, liquidSum / max(count, 1.0), damage, count);
  }

  // Check if player is grounded (feet touching solid)
  float checkGrounded(vec2 playerPos) {
    float walkSin = sin(uWalkPhase * 6.28318);
    float leftFootX = -uLegWidth * 0.5 + walkSin * uFootOffset;
    float rightFootX = uLegWidth * 0.5 - walkSin * uFootOffset;

    // Check below each foot
    vec2 belowLeft = playerPos + vec2(leftFootX, -1.0);
    vec2 belowRight = playerPos + vec2(rightFootX, -1.0);

    if (belowLeft.y < 0.0 || belowRight.y < 0.0) return 1.0;  // World floor

    vec4 leftPixel = sampleWorld(belowLeft);
    vec4 rightPixel = sampleWorld(belowRight);

    float leftType = leftPixel.r * 255.0;
    float rightType = rightPixel.r * 255.0;

    bool leftSolid = isBlocking(leftType) || isSolidParticle(leftType);
    bool rightSolid = isBlocking(rightType) || isSolidParticle(rightType);

    return (leftSolid || rightSolid) ? 1.0 : 0.0;
  }

  // Calculate push-out displacement and fluid buoyancy from overlapping particles
  // Returns: xy = solid displacement (position offset), z = buoyancy force (velocity)
  vec3 calculatePushOutAndBuoyancy(vec2 playerPos) {
    vec2 solidDisplacement = vec2(0.0);
    float buoyancyForce = 0.0;

    if (uPushOutStrength <= 0.0) return vec3(0.0);

    vec2 forceSum = vec2(0.0);
    float solidCount = 0.0;
    float fluidDensitySum = 0.0;
    float fluidCount = 0.0;

    // Center of mass is roughly at the center of the body
    vec2 centerOfMass = playerPos + vec2(0.0, uLegHeight + uBodyHeight * 0.5);

    // Sample grid inside the player's bounding box
    float sampleStep = max(2.0, uPlayerHeight / 10.0);  // Adaptive step size
    float halfWidth = uPlayerWidth * 0.5;
    float height = uPlayerHeight;

    for (float y = 0.0; y < height; y += sampleStep) {
      for (float x = -halfWidth; x <= halfWidth; x += sampleStep) {
        vec2 samplePos = playerPos + vec2(x, y);
        vec4 pixel = sampleWorld(samplePos);
        float ptype = pixel.r * 255.0;

        // Check if this is a solid particle (static or movable solid)
        bool isSolid = isBlocking(ptype) || isSolidParticle(ptype);

        if (isSolid) {
          // Vector from particle to center of mass
          vec2 pushDir = centerOfMass - samplePos;
          float dist = length(pushDir);
          if (dist > 0.1) {
            pushDir = normalize(pushDir);
            // Weight by inverse distance (closer = stronger push)
            float weight = 1.0 / max(dist * 0.1, 0.1);
            forceSum += pushDir * weight;
            solidCount += 1.0;
          }
        }
        // Liquids and gases apply buoyancy based on density
        else if (isLiquid(ptype) || isGas(ptype)) {
          float density = getMaterialDensity(ptype);
          fluidDensitySum += density;
          fluidCount += 1.0;
        }
      }
    }

    // Also check a denser grid near the feet (most important for ground interaction)
    float footY = 1.0;  // Just above ground level
    for (float x = -halfWidth; x <= halfWidth; x += sampleStep * 0.5) {
      vec2 samplePos = playerPos + vec2(x, footY);
      vec4 pixel = sampleWorld(samplePos);
      float ptype = pixel.r * 255.0;

      bool isSolid = isBlocking(ptype) || isSolidParticle(ptype);
      if (isSolid) {
        vec2 pushDir = centerOfMass - samplePos;
        float dist = length(pushDir);
        if (dist > 0.1) {
          pushDir = normalize(pushDir);
          float weight = 20.0 / max(dist * 0.1, 0.1);  // Stronger weight for feet
          forceSum += pushDir * weight;
          solidCount += 1.0;
        }
      }
    }

    // Calculate solid displacement
    if (solidCount > 0.0) {
      float forceMagnitude = 0.01 * min(solidCount * 0.1, 5.0) * uPushOutStrength;
      solidDisplacement = normalize(forceSum) * forceMagnitude;
    }

    // Calculate buoyancy force from fluids
    // Buoyancy = (fluid density - player density) proportional force
    if (fluidCount > 0.0) {
      float avgFluidDensity = fluidDensitySum / fluidCount;
      // Player effective density ~1000 (similar to water)
      float playerDensity = uPlayerMass * 12.5;  // mass 80 -> density 1000
      float densityDiff = avgFluidDensity - playerDensity;
      // Normalize: water (1000) = neutral, oil (810) = sink, lava (3100) = float
      float normalizedBuoyancy = clamp(densityDiff / 1000.0, -0.5, 1.0);
      float submersion = min(fluidCount / 20.0, 1.0);
      // Scale to counteract reduced gravity (0.15) when in dense fluids
      buoyancyForce = normalizedBuoyancy * submersion * 0.2;
    }

    return vec3(solidDisplacement, buoyancyForce);
  }

  void main() {
    vec2 outputCoord = floor(vUv * uOutputSize);
    float pixelIndex = outputCoord.y * uOutputSize.x + outputCoord.x;

    if (uPlayerEnabled < 0.5) {
      gl_FragColor = vec4(0.0);
      return;
    }

    // Calculate physics
    float grounded = checkGrounded(uPlayerPosition);
    vec4 collisionData = checkPlayerCollision(uPlayerPosition);
    float blocked = collisionData.x;
    float liquidDensity = collisionData.y;
    float damageFlags = collisionData.z;

    // Calculate push-out displacement (solids) and buoyancy (fluids) from overlapping particles
    vec3 pushOutAndBuoyancy = calculatePushOutAndBuoyancy(uPlayerPosition);
    vec2 solidDisplacement = pushOutAndBuoyancy.xy;
    float fluidBuoyancy = pushOutAndBuoyancy.z;

    // Calculate new velocity
    vec2 newVelocity = uPlayerVelocity;

    // Apply fluid buoyancy force to velocity
    newVelocity.y += fluidBuoyancy;

    // Apply input
    float targetVx = uPlayerInput.x * uPlayerSpeed;
    float accel = grounded > 0.5 ? uPlayerFriction : (1.0 - uPlayerAirResistance);
    newVelocity.x += (targetVx - newVelocity.x) * accel;

    // Determine if in liquid (from collision check)
    float inLiquid = liquidDensity > 0.0 ? 1.0 : 0.0;

    // Jump (only when grounded on land)
    if (uPlayerJumping > 0.5 && grounded > 0.5 && inLiquid < 0.5) {
      newVelocity.y = uPlayerJumpStrength;
    }

    // Swimming controls when in liquid
    if (inLiquid > 0.5) {
      float maxSwimSpeed = uPlayerSpeed * 0.8;  // Cap swim speed

      // Swim vertically with up/down keys (W/S or arrows)
      float targetSwimY = uPlayerInput.y * maxSwimSpeed;
      // Also allow jump button for swim up
      if (uPlayerJumping > 0.5) {
        targetSwimY = max(targetSwimY, maxSwimSpeed);
      }

      // Smooth acceleration toward target (not instant)
      newVelocity.y += (targetSwimY - newVelocity.y) * 0.15;

      // Reduced gravity when swimming
      newVelocity.y -= uPlayerGravity * 0.3;

      // Clamp swim velocity
      newVelocity.y = clamp(newVelocity.y, -maxSwimSpeed, maxSwimSpeed);

      // Water resistance / drag (also slows horizontal)
      newVelocity *= 0.92;
    } else {
      // Normal gravity when not in liquid
      if (grounded < 0.5) {
        newVelocity.y -= uPlayerGravity;
      } else if (newVelocity.y < 0.0) {
        newVelocity.y = 0.0;
      }
    }

    // Calculate new position
    vec2 newPosition = uPlayerPosition + newVelocity;

    // Apply solid displacement directly (move player out of overlapping solid particles)
    newPosition += solidDisplacement * 10.0;  // Scale up since this is now direct displacement

    // Clamp to world bounds
    float margin = uPlayerWidth * 0.5;
    newPosition.x = clamp(newPosition.x, margin, uTextureSize.x - margin - 1.0);
    newPosition.y = clamp(newPosition.y, 0.0, uTextureSize.y - uPlayerHeight - 1.0);

    // Check collision at new position
    vec4 newCollision = checkPlayerCollision(newPosition);
    if (newCollision.x > 0.5) {
      // Try horizontal only
      vec2 horzPos = vec2(newPosition.x, uPlayerPosition.y);
      vec4 horzColl = checkPlayerCollision(horzPos);
      if (horzColl.x < 0.5) {
        newPosition = horzPos;
        newVelocity.y = 0.0;
      } else {
        // Try vertical only
        vec2 vertPos = vec2(uPlayerPosition.x, newPosition.y);
        vec4 vertColl = checkPlayerCollision(vertPos);
        if (vertColl.x < 0.5) {
          newPosition = vertPos;
          newVelocity.x = 0.0;
        } else {
          // Fully blocked
          newPosition = uPlayerPosition;
          newVelocity = vec2(0.0);
        }
      }
    }

    // Calculate walk phase update (advance when moving horizontally and grounded)
    float newWalkPhase = uWalkPhase;
    if (grounded > 0.5 && abs(newVelocity.x) > 0.5) {
      newWalkPhase = mod(uWalkPhase + abs(newVelocity.x) * 0.05, 1.0);
    } else if (grounded > 0.5) {
      // Gradually return to neutral stance
      newWalkPhase = mix(uWalkPhase, 0.0, 0.1);
    }

    // Output data based on pixel index
    // Pixel 0: Position
    if (pixelIndex < 1.0) {
      gl_FragColor = vec4(newPosition.x, newPosition.y, 0.0, 1.0);
    }
    // Pixel 1: Velocity
    else if (pixelIndex < 2.0) {
      gl_FragColor = vec4(newVelocity.x, newVelocity.y, 0.0, 1.0);
    }
    // Pixel 2: Status (grounded, liquid density, damage flags)
    else if (pixelIndex < 3.0) {
      gl_FragColor = vec4(grounded, liquidDensity / 10000.0, damageFlags / 255.0, 1.0);
    }
    // Pixel 3: Walk phase and misc
    else if (pixelIndex < 4.0) {
      gl_FragColor = vec4(newWalkPhase, inLiquid, 0.0, 1.0);
    }
    else {
      gl_FragColor = vec4(0.0);
    }
  }
`;

/**
 * Vertex shader for player sprite rendering
 */
export const playerSpriteVertexShader = `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/**
 * Fragment shader for player sprite rendering
 * Draws the player as simple shapes on top of the world
 */
export const playerSpriteFragmentShader = `
  precision highp float;

  uniform sampler2D uWorldTexture;  // The rendered world
  uniform vec2 uTextureSize;
  uniform vec2 uCanvasSize;

  // Player state
  uniform float uPlayerEnabled;
  uniform vec2 uPlayerPosition;
  uniform float uWalkPhase;
  uniform float uPlayerGrounded;
  uniform float uPlayerInLiquid;

  // Player dimensions
  uniform float uPlayerHeight;
  uniform float uHeadRadius;
  uniform float uBodyWidth;
  uniform float uBodyHeight;
  uniform float uLegWidth;
  uniform float uLegHeight;
  uniform float uFootOffset;

  // View transform (for pan/zoom)
  uniform vec2 uViewOffset;
  uniform float uPixelSize;

  // Colors
  uniform vec3 uHeadColor;
  uniform vec3 uBodyColor;
  uniform vec3 uLegColor;

  varying vec2 vUv;

  // SDF for rounded rectangle
  float sdRoundedBox(vec2 p, vec2 b, float r) {
    vec2 q = abs(p) - b + r;
    return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - r;
  }

  // SDF for circle
  float sdCircle(vec2 p, float r) {
    return length(p) - r;
  }

  void main() {
    // Start with the world texture
    vec4 worldColor = texture2D(uWorldTexture, vUv);

    if (uPlayerEnabled < 0.5) {
      gl_FragColor = worldColor;
      return;
    }

    // Convert screen coords to world coords
    vec2 screenPos = vUv * uCanvasSize;
    vec2 worldPos = (screenPos / uPixelSize) + uViewOffset;

    // Position relative to player (player pos is bottom-center)
    vec2 relPos = worldPos - uPlayerPosition;

    // Calculate animated positions
    float walkSin = sin(uWalkPhase * 6.28318);
    float leftFootX = -uLegWidth * 0.5 + walkSin * uFootOffset;
    float rightFootX = uLegWidth * 0.5 - walkSin * uFootOffset;
    float armSwing = abs(walkSin) * 3.0;

    // Check each body part (accumulate alpha for anti-aliasing)
    float playerAlpha = 0.0;
    vec3 playerColor = vec3(0.0);

    // Left leg (bottom aligns with playerPos.y)
    vec2 leftLegCenter = vec2(leftFootX, uLegHeight * 0.5);
    float leftLegDist = sdRoundedBox(relPos - leftLegCenter, vec2(uLegWidth * 0.3, uLegHeight * 0.5), 1.0);
    if (leftLegDist < 0.5) {
      float a = smoothstep(0.5, -0.5, leftLegDist);
      playerColor = mix(playerColor, uLegColor, a);
      playerAlpha = max(playerAlpha, a);
    }

    // Right leg (bottom aligns with playerPos.y)
    vec2 rightLegCenter = vec2(rightFootX, uLegHeight * 0.5);
    float rightLegDist = sdRoundedBox(relPos - rightLegCenter, vec2(uLegWidth * 0.3, uLegHeight * 0.5), 1.0);
    if (rightLegDist < 0.5) {
      float a = smoothstep(0.5, -0.5, rightLegDist);
      playerColor = mix(playerColor, uLegColor, a);
      playerAlpha = max(playerAlpha, a);
    }

    // Body (with arm swing)
    vec2 bodyCenter = vec2(0.0, uLegHeight + uBodyHeight * 0.5);
    float bodyHalfW = uBodyWidth * 0.5 + armSwing;
    float bodyDist = sdRoundedBox(relPos - bodyCenter, vec2(bodyHalfW, uBodyHeight * 0.5), 2.0);
    if (bodyDist < 0.5) {
      float a = smoothstep(0.5, -0.5, bodyDist);
      playerColor = mix(playerColor, uBodyColor, a);
      playerAlpha = max(playerAlpha, a);
    }

    // Head
    vec2 headCenter = vec2(0.0, uPlayerHeight - uHeadRadius);
    float headDist = sdCircle(relPos - headCenter, uHeadRadius);
    if (headDist < 0.5) {
      float a = smoothstep(0.5, -0.5, headDist);
      playerColor = mix(playerColor, uHeadColor, a);
      playerAlpha = max(playerAlpha, a);
    }

    // Blend player over world
    gl_FragColor = vec4(mix(worldColor.rgb, playerColor, playerAlpha), 1.0);
  }
`;

// Keep the old shader for backward compatibility during transition
export const playerUpdateFragmentShader = `
  precision highp float;
  uniform sampler2D uCurrentState;
  uniform vec2 uTextureSize;
  varying vec2 vUv;

  void main() {
    // Pass-through - player no longer modifies world texture
    gl_FragColor = texture2D(uCurrentState, vUv);
  }
`;
