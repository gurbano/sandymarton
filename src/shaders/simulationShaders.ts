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


export const simulationFragmentShader = `
  uniform sampler2D uCurrentState;  // Current simulation state
  uniform vec2 uTextureSize;         // Size of the simulation texture (e.g., 2048x2048)
  uniform float uDeltaTime;          // Time since last frame
  varying vec2 vUv;

  // Helper function to sample a neighbor pixel
  vec4 getPixel(vec2 offset) {
    vec2 pixelSize = 1.0 / uTextureSize;
    return texture2D(uCurrentState, vUv + offset * pixelSize);
  }

  void main() {
    // Sample current pixel
    vec4 currentPixel = texture2D(uCurrentState, vUv);

    // Extract particle data
    float particleType = currentPixel.r * 255.0;
    float velocityX = currentPixel.g;
    float velocityY = currentPixel.b;
    float data = currentPixel.a;

    // TODO: Implement particle physics simulation here
    // For now, just pass through the current state unchanged
    vec4 nextState = currentPixel;

    gl_FragColor = nextState;
  }
`;
