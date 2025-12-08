/**
 * Overlay Shaders
 * Renders heat and force overlays on top of the base particle visualization
 * Currently placeholder implementations - actual visualization to be added later
 */

export const overlayVertexShader = `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/**
 * Heat Overlay Fragment Shader
 * Visualizes temperature distribution using a color gradient
 * Blue (cold) -> Red (hot)
 */
export const heatOverlayFragmentShader = `
  uniform sampler2D uBaseTexture;     // Base rendered color texture
  uniform sampler2D uHeatForceLayer;  // Heat/Force layer (R=temperature)
  uniform vec2 uTextureSize;
  uniform float uOverlayStrength;     // Blend strength (0-1)

  varying vec2 vUv;

  void main() {
    // Get base color
    vec4 baseColor = texture2D(uBaseTexture, vUv);

    // Pass-through for now - heat visualization to be implemented later
    // When implemented, will blend heat colors over base
    gl_FragColor = baseColor;
  }
`;

/**
 * Force Overlay Fragment Shader
 * Visualizes force vectors as directional indicators
 */
export const forceOverlayFragmentShader = `
  uniform sampler2D uBaseTexture;     // Base rendered color texture
  uniform sampler2D uHeatForceLayer;  // Heat/Force layer (G=forceX, B=forceY)
  uniform vec2 uTextureSize;
  uniform float uOverlayStrength;     // Blend strength (0-1)

  varying vec2 vUv;

  void main() {
    // Get base color
    vec4 baseColor = texture2D(uBaseTexture, vUv);

    // Pass-through for now - force visualization to be implemented later
    // When implemented, will draw force direction indicators
    gl_FragColor = baseColor;
  }
`;
