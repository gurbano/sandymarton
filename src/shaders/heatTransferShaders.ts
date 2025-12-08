/**
 * Heat Transfer Shader
 * Handles temperature diffusion between particles
 * Currently a pass-through shader - logic to be implemented later
 */

export const heatTransferVertexShader = `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const heatTransferFragmentShader = `
  uniform sampler2D uCurrentState;    // Particle state texture (R=type, G=velX, B=velY, A=unused)
  uniform sampler2D uHeatForceLayer;  // Heat/Force layer (R=temperature, G=forceX, B=forceY, A=unused)
  uniform vec2 uTextureSize;
  uniform float uIteration;
  uniform float uRandomSeed;

  varying vec2 vUv;

  void main() {
    // Pass-through for now - just output the current state unchanged
    // Heat transfer logic will be implemented later
    gl_FragColor = texture2D(uCurrentState, vUv);
  }
`;
