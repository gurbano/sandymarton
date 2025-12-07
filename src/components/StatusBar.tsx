import { ParticleType } from '../world/ParticleTypes';

interface StatusBarProps {
  pixelSize: number;
  center: { x: number; y: number };
  selectedParticle: ParticleType;
  fps: number;
}

export function StatusBar({ pixelSize, center, selectedParticle, fps }: StatusBarProps) {
  return (
    <div className="status-bar">
      Sand Simulation | FPS: {fps} | Pixel Size: {pixelSize} | Center: ({center.x.toFixed(1)}, {center.y.toFixed(1)}) | Selected: {ParticleType[selectedParticle]}
    </div>
  );
}
