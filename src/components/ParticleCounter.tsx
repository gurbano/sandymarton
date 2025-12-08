import { useEffect, useState, useMemo, useRef } from 'react';
import type { DataTexture } from 'three';
import { ParticleType } from '../world/ParticleTypes';

interface ParticleCounterProps {
  worldTexture: DataTexture;
}

interface ParticleCounts {
  [key: string]: number;
}

// Pre-compute type name lookup table (indexed by particle type value)
const TYPE_NAMES: string[] = (() => {
  const names: string[] = new Array(256).fill('');
  Object.entries(ParticleType)
    .filter(([_, value]) => typeof value === 'number')
    .forEach(([key, value]) => {
      names[value as number] = key;
    });
  return names;
})();

export function ParticleCounter({ worldTexture }: ParticleCounterProps) {
  const [counts, setCounts] = useState<ParticleCounts>({});
  const [totalParticles, setTotalParticles] = useState(0);
  const [isOpen, setIsOpen] = useState(false);

  // Pre-allocate count array to avoid object property lookups in hot loop
  const countArrayRef = useRef(new Uint32Array(256));

  // Memoize the known particle types for building the result
  const knownParticleTypes = useMemo(() => {
    return Object.entries(ParticleType)
      .filter(([_, value]) => typeof value === 'number')
      .map(([key, value]) => ({ name: key, value: value as number }));
  }, []);

  useEffect(() => {
    // Count particles periodically (not every frame for performance)
    const interval = setInterval(() => {
      const data = worldTexture.image.data as Uint8Array;
      if (!data) return;

      // Reset count array (faster than creating new object each time)
      const countArray = countArrayRef.current;
      countArray.fill(0);

      // Optimized counting loop:
      // - Use typed array for counts (faster than object property access)
      // - Skip every 4 bytes directly (RGBA stride)
      // - No string operations in hot loop
      const len = data.length;
      for (let i = 0; i < len; i += 4) {
        countArray[data[i]]++; // data[i] is the R channel (particle type)
      }

      // Build result object from count array (only for non-zero, non-empty types)
      const particleCounts: ParticleCounts = {};
      let total = 0;

      for (const { name, value } of knownParticleTypes) {
        const count = countArray[value];
        if (count > 0 && value !== ParticleType.EMPTY) {
          particleCounts[name] = count;
          total += count;
        }
      }

      // Also check for unknown types
      for (let i = 0; i < 256; i++) {
        if (countArray[i] > 0 && i !== ParticleType.EMPTY && !TYPE_NAMES[i]) {
          particleCounts[`UNKNOWN_${i}`] = countArray[i];
          total += countArray[i];
        }
      }

      setCounts(particleCounts);
      setTotalParticles(total);
    }, 500);

    return () => clearInterval(interval);
  }, [worldTexture, knownParticleTypes]);

  const sortedEntries = Object.entries(counts).sort((a, b) => b[1] - a[1]);

  return (
    <div
      className={`particle-counter-inline ${isOpen ? 'active' : ''}`}
      onClick={() => setIsOpen(!isOpen)}
    >
      <span className="particle-count-value">{totalParticles.toLocaleString()}</span>
      <span className="particle-count-label">particles ▾</span>

      {isOpen && sortedEntries.length > 0 && (
        <div className="particle-counter-tooltip">
          <div className="tooltip-header">Breakdown</div>
          {sortedEntries.map(([type, count]) => (
            <div key={type} className="tooltip-row">
              <span className="tooltip-type">{type}</span>
              <span className="tooltip-count">{count.toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
