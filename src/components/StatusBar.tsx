import { ParticleType } from '../world/ParticleTypes';

interface StatusBarProps {
  pixelSize: number;
  center: { x: number; y: number };
  selectedParticle: ParticleType;
}

export function StatusBar({ pixelSize, center, selectedParticle }: StatusBarProps) {
  return (
    <div className="status-bar">
      Sand Simulation | Pixel Size: {pixelSize} | Center: ({center.x.toFixed(1)}, {center.y.toFixed(1)}) | Selected: {ParticleType[selectedParticle]}
    </div>
  );
}
