import { ParticleType } from '../world/ParticleTypes';

interface StatusBarProps {
  pixelSize: number;
  center: { x: number; y: number };
  selectedParticle: ParticleType;
  fps: number;
  averageTemperature: number | null;
  averageParticleTemperature: number | null;
}

export function StatusBar({ pixelSize, center, selectedParticle, fps, averageTemperature, averageParticleTemperature }: StatusBarProps) {
  const heatTempDisplay = averageTemperature !== null
    ? `${averageTemperature.toFixed(1)}°C`
    : '--';
  const particleTempDisplay = averageParticleTemperature !== null
    ? `${averageParticleTemperature.toFixed(1)}°C`
    : '--';

  return (
    <div className="status-bar">
      FPS: {fps} | Zoom: {pixelSize} | Center: ({center.x.toFixed(0)}, {center.y.toFixed(0)}) | {ParticleType[selectedParticle]} | Heat: {heatTempDisplay} | Particle: {particleTempDisplay}
    </div>
  );
}
