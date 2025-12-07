import { useRef, useMemo, useEffect, useState } from 'react';
import { ShaderMaterial, Mesh, Texture } from 'three';
import { vertexShader, fragmentShader } from '../shaders/rendererShader';
import { useThree } from '@react-three/fiber';

interface TextureRendererProps {
  texture: Texture;
  pixelSize?: number;
  center?: { x: number; y: number };
}

function TextureRenderer({ texture, pixelSize = 16, center = { x: 0, y: 0 } }: TextureRendererProps) {
  const meshRef = useRef<Mesh>(null);
  const { size } = useThree();
  const [canvasSize, setCanvasSize] = useState([size.width, size.height]);
  useEffect(() => {
    setCanvasSize([size.width, size.height]);
  }, [size.width, size.height]);

  const shaderMaterial = useMemo(
    () =>
      new ShaderMaterial({
        uniforms: {
          uTexture: { value: texture },
          uTextureSize: { value: [2048, 2048] },
          uCanvasSize: { value: canvasSize },
          uPixelSize: { value: pixelSize },
          uCenter: { value: [center.x, center.y] },
        },
        vertexShader,
        fragmentShader,
        transparent: true,
      }),
    []
  );

  // Update uniforms when props change
  useEffect(() => {
    console.error('Updating texture renderer uniforms', texture.source.data);
    shaderMaterial.uniforms.uTexture.value = texture;
    shaderMaterial.uniforms.uCanvasSize.value = canvasSize;
    shaderMaterial.uniforms.uPixelSize.value = pixelSize;
    shaderMaterial.uniforms.uCenter.value = [center.x, center.y];
    shaderMaterial.needsUpdate = true;
  }, [shaderMaterial, texture, canvasSize, pixelSize, center]);

  return (
    <mesh ref={meshRef}>
      <planeGeometry args={[2, 2]} />
      <primitive object={shaderMaterial} attach="material" />
    </mesh>
  );
}

export default TextureRenderer;
