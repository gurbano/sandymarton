import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faRotateRight,
  faMountain,
  faSeedling,
  faCubes,
  faDroplet,
  faFire,
  faCloud,
  faSmog,
  faFlask,
  faBiohazard
} from '@fortawesome/free-solid-svg-icons';
import { ParticleType } from '../world/ParticleTypes';

interface SideControlsProps {
  particleTypes: { name: string; value: number }[];
  selectedParticle: ParticleType;
  onParticleSelect: (particle: ParticleType) => void;
  onResetWorld: () => void;
}

const particleIcons: Record<string, any> = {
  SAND: faMountain,
  DIRT: faSeedling,
  STONE: faCubes,
  WATER: faDroplet,
  LAVA: faFire,
  SLIME: faFlask,
  ACID: faBiohazard,
  STEAM: faCloud,
  SMOKE: faSmog,
};

export function SideControls({
  particleTypes,
  selectedParticle,
  onParticleSelect,
  onResetWorld,
}: SideControlsProps) {
  return (
    <div className="top-bar">
      <button onClick={onResetWorld} className="icon-button" title="Reset World">
        <FontAwesomeIcon icon={faRotateRight} />
      </button>

      <div className="divider"></div>

      {particleTypes.map(({ name, value }) => (
        <button
          key={value}
          className={`icon-button ${selectedParticle === value ? 'active' : ''}`}
          onClick={() => onParticleSelect(value)}
          title={name}
        >
          <FontAwesomeIcon icon={particleIcons[name] || faCubes} />
        </button>
      ))}
    </div>
  );
}
