/**
 * Simulation shaders for particle physics
 * These shaders run the particle simulation on the GPU
 */

export const simulationVertexShader = `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;


// Simple movement shader - just move particles 1 pixel at a time
export const simulationFragmentShader = `
  uniform sampler2D uCurrentState;
  uniform vec2 uTextureSize;
  uniform float uDeltaTime;
  varying vec2 vUv;

  // Particle type ranges
  const float EMPTY_MAX = 16.0;
  const float STATIC_MIN = 16.0;
  const float STATIC_MAX = 32.0;
  const float SOLID_MIN = 33.0;
  const float SOLID_MAX = 63.0;
  const float LIQUID_MIN = 64.0;
  const float LIQUID_MAX = 111.0;
  const float GAS_MIN = 112.0;
  const float GAS_MAX = 159.0;

  // Gravity constant
  const float GRAVITY = 58.0;

  vec4 getPixel(vec2 offset) {
    vec2 pixelSize = 1.0 / uTextureSize;
    vec2 sampleUV = vUv + offset * pixelSize;

    if (sampleUV.x < 0.0 || sampleUV.x > 1.0 || sampleUV.y < 0.0 || sampleUV.y > 1.0) {
      return vec4(0.0, 0.0, 0.0, 0.0);
    }

    return texture2D(uCurrentState, sampleUV);
  }

  float decodeVelocity(float encoded) {
    return (encoded * 255.0) - 128.0;
  }

  float encodeVelocity(float velocity) {
    return clamp((velocity + 128.0) / 255.0, 0.0, 1.0);
  }

  bool isEmpty(float pType) {
    return pType < EMPTY_MAX;
  }

  bool isStatic(float pType) {
    return pType >= STATIC_MIN && pType < STATIC_MAX;
  }

  bool isSolid(float pType) {
    return pType >= SOLID_MIN && pType < SOLID_MAX;
  }

  bool isLiquid(float pType) {
    return pType >= LIQUID_MIN && pType < LIQUID_MAX;
  }

  bool isGas(float pType) {
    return pType >= GAS_MIN && pType < GAS_MAX;
  }

  void main() {
    vec4 currentPixel = texture2D(uCurrentState, vUv);
    float currentType = currentPixel.r * 255.0;
    vec4 nextState = currentPixel;

    // SIMPLE APPROACH: Move 1 pixel at a time
    // Empty pixels check if they should receive from above
    // Particles apply gravity and check if they move

    if (isEmpty(currentType)) {
      // Check pixel directly above
      vec4 abovePixel = getPixel(vec2(0.0, 1.0));
      float aboveType = abovePixel.r * 255.0;

      if (!isEmpty(aboveType) && !isStatic(aboveType) && (isSolid(aboveType) || isLiquid(aboveType))) {
        // Apply gravity to particle above
        float aboveVelY = decodeVelocity(abovePixel.b);
        aboveVelY -= GRAVITY * uDeltaTime;
        aboveVelY = clamp(aboveVelY, -10.0, 10.0);

        // If velocity is strong enough, particle wants to move down
        if (aboveVelY < -0.5) {
          // Take the particle
          nextState = abovePixel;
          nextState.b = encodeVelocity(aboveVelY);
        } else {
          nextState = vec4(0.0, 0.5, 0.5, 0.0);
        }
      } else {
        // Check diagonals
        vec2 diagonals[2];
        diagonals[0] = vec2(-1.0, 1.0); // Above-left
        diagonals[1] = vec2(1.0, 1.0);  // Above-right

        bool foundDiagonal = false;
        for (int i = 0; i < 2 && !foundDiagonal; i++) {
          vec4 diagPixel = getPixel(diagonals[i]);
          float diagType = diagPixel.r * 255.0;

          if (!isEmpty(diagType) && !isStatic(diagType) && (isSolid(diagType) || isLiquid(diagType))) {
            float diagVelY = decodeVelocity(diagPixel.b);
            diagVelY -= GRAVITY * uDeltaTime;
            diagVelY = clamp(diagVelY, -10.0, 10.0);

            if (diagVelY < -0.5) {
              // Check if particle above diagonal is blocked below
              vec4 belowDiag = getPixel(diagonals[i] + vec2(0.0, -1.0));
              if (!isEmpty(belowDiag.r * 255.0)) {
                // Blocked, so it moves diagonally here
                nextState = diagPixel;
                nextState.b = encodeVelocity(diagVelY * 0.8); // Slow down a bit
                foundDiagonal = true;
              }
            }
          }
        }

        if (!foundDiagonal) {
          nextState = vec4(0.0, 0.5, 0.5, 0.0);
        }
      }
    }
    // Particle - check if moving away
    else if (!isEmpty(currentType) && !isStatic(currentType)) {
      float currentVelY = decodeVelocity(currentPixel.b);

      // Apply gravity
      if (isSolid(currentType) || isLiquid(currentType)) {
        currentVelY -= GRAVITY * uDeltaTime;
      } else if (isGas(currentType)) {
        currentVelY += GRAVITY * uDeltaTime;
      }

      currentVelY = clamp(currentVelY, -10.0, 10.0);

      // Check if moving
      if ((isSolid(currentType) || isLiquid(currentType)) && currentVelY < -0.5) {
        // Check below
        vec4 belowPixel = getPixel(vec2(0.0, -1.0));

        if (isEmpty(belowPixel.r * 255.0)) {
          // Moving down - clear this pixel
          nextState = vec4(0.0, 0.5, 0.5, 0.0);
        } else {
          // Blocked straight down - try diagonals
          vec4 downLeft = getPixel(vec2(-1.0, -1.0));
          vec4 downRight = getPixel(vec2(1.0, -1.0));

          if (isEmpty(downLeft.r * 255.0) || isEmpty(downRight.r * 255.0)) {
            // Can move diagonally - clear
            nextState = vec4(0.0, 0.5, 0.5, 0.0);
          } else {
            // Stuck - reset velocity
            nextState.r = currentPixel.r;
            nextState.g = currentPixel.g;
            nextState.b = encodeVelocity(0.0);
            nextState.a = currentPixel.a;
          }
        }
      } else {
        // Not moving yet - keep with updated velocity
        nextState.r = currentPixel.r;
        nextState.g = currentPixel.g;
        nextState.b = encodeVelocity(currentVelY);
        nextState.a = currentPixel.a;
      }
    }

    gl_FragColor = nextState;
  }
`;
