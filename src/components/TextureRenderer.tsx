import { useRef, useMemo } from 'react';
import { ShaderMaterial, Mesh, Texture } from 'three';

const vertexShader = `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = `
  uniform sampler2D uTexture;
  uniform vec2 uTextureSize;
  uniform vec2 uViewSize;
  uniform float uPixelSize;
  uniform vec2 uCenter;
  varying vec2 vUv;

  void main() {
    // Apply pixelation effect - snap to discrete pixel grid
    // This creates blocks where each block represents one texture pixel
    vec2 pixelatedUV = floor(vUv * uViewSize / uPixelSize) / (uViewSize / uPixelSize);

    // Calculate how many source pixels we're displaying
    // If pixelSize = 2, we show half the pixels (512x512 instead of 1024x1024)
    vec2 effectiveViewSize = uViewSize / uPixelSize;

    // Calculate the crop to center the view
    // cropScale determines what fraction of the texture to show
    vec2 cropScale = effectiveViewSize / uTextureSize;

    // Apply the center offset (in texture pixel coordinates)
    vec2 centerOffset = uCenter / uTextureSize;

    // cropOffset centers the view, adjusted by the user's pan offset
    vec2 cropOffset = (vec2(1.0) - cropScale) * 0.5 + centerOffset;

    // Map UV coordinates to the center portion of the texture
    vec2 croppedUV = cropOffset + pixelatedUV * cropScale;

    vec4 texColor = texture2D(uTexture, croppedUV);
    gl_FragColor = texColor;
  }
`;

interface TextureRendererProps {
  texture: Texture;
  pixelSize?: number;
  center?: { x: number; y: number };
}

function TextureRenderer({ texture, pixelSize = 16, center = { x: 0, y: 0 } }: TextureRendererProps) {
  const meshRef = useRef<Mesh>(null);

  const shaderMaterial = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: {
          uTexture: { value: texture },
          uTextureSize: { value: [2048, 2048] },
          uViewSize: { value: [1024, 1024] },
          uPixelSize: { value: pixelSize },
          uCenter: { value: [center.x, center.y] },
        },
        vertexShader,
        fragmentShader,
      }),
    [texture, pixelSize, center]
  );

  return (
    <mesh ref={meshRef}>
      <planeGeometry args={[2, 2]} />
      <primitive object={shaderMaterial} attach="material" />
    </mesh>
  );
}

export default TextureRenderer;
