/**
 * Force Transfer Shader
 * Handles force propagation through materials
 * Currently a pass-through shader - logic to be implemented later
 */

export const forceTransferVertexShader = `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const forceTransferFragmentShader = `
  uniform sampler2D uCurrentState;    // Particle state texture (R=type, G=velX, B=velY, A=unused)
  uniform sampler2D uHeatForceLayer;  // Heat/Force layer (R=temperature, G=forceX, B=forceY, A=unused)
  uniform vec2 uTextureSize;
  uniform float uIteration;
  uniform float uRandomSeed;

  varying vec2 vUv;

  void main() {
    // Pass-through for now - just output the current state unchanged
    // Force transfer logic will be implemented later
    gl_FragColor = texture2D(uCurrentState, vUv);
  }
`;
