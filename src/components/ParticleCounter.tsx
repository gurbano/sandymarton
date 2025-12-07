import { useEffect, useState } from 'react';
import type { DataTexture } from 'three';
import { ParticleType } from '../world/ParticleTypes';
import './ParticleCounter.css';

interface ParticleCounterProps {
  worldTexture: DataTexture;
}

interface ParticleCounts {
  [key: string]: number;
}

export function ParticleCounter({ worldTexture }: ParticleCounterProps) {
  const [counts, setCounts] = useState<ParticleCounts>({});
  const [totalParticles, setTotalParticles] = useState(0);

  useEffect(() => {
    // Count particles periodically (not every frame for performance)
    const interval = setInterval(() => {
      const data = worldTexture.image.data;
      if (!data) return; // Skip if data is not available

      const particleCounts: ParticleCounts = {};
      let total = 0;

      // Get particle type names for display
      const typeNames = Object.entries(ParticleType)
        .filter(([_, value]) => typeof value === 'number')
        .reduce((acc, [key, value]) => {
          acc[value as number] = key;
          return acc;
        }, {} as Record<number, string>);

      // Count each pixel's particle type (stored in R channel)
      for (let i = 0; i < data.length; i += 4) {
        const particleType = data[i]; // Red channel contains particle type

        // Skip empty particles
        if (particleType === ParticleType.EMPTY) {
          continue;
        }

        const typeName = typeNames[particleType] || `UNKNOWN_${particleType}`;
        particleCounts[typeName] = (particleCounts[typeName] || 0) + 1;
        total++;
      }

      setCounts(particleCounts);
      setTotalParticles(total);
    }, 500); // Update every 500ms

    return () => clearInterval(interval);
  }, [worldTexture]);

  const sortedEntries = Object.entries(counts).sort((a, b) => b[1] - a[1]);

  return (
    <div className="particle-counter">
      <div className="particle-counter-header">Particle Count</div>
      <div className="particle-counter-total">Total: {totalParticles.toLocaleString()}</div>
      <div className="particle-counter-list">
        {sortedEntries.map(([type, count]) => (
          <div key={type} className="particle-counter-item">
            <span className="particle-counter-type">{type}</span>
            <span className="particle-counter-count">{count.toLocaleString()}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
