# Sandy2 - GPU-Accelerated Particle Simulation

A real-time particle simulation using Margolus cellular automata running entirely on the GPU via WebGL shaders. Built with React, Three.js, and TypeScript.

## Features

- **GPU-Accelerated Physics**: All simulation runs on GPU using GLSL fragment shaders
- **Margolus Cellular Automata**: Realistic granular behavior with material-specific friction
- **Multiple Materials**: Sand, water, stone, oil, lava, steam with unique physical properties
- **Liquid Spread System**: Specialized shader for realistic liquid flow dynamics
- **Archimedes Buoyancy**: Floating and layering based on material density
- **Advanced Rendering Pipeline**:
  - Edge blending for smooth material boundaries
  - Material variation using FBM noise for natural texture
  - Modular post-processing effects
- **Interactive Drawing**: Paint particles directly onto the simulation canvas
- **Optimized Performance**: Resolved state tracking to skip settled particles

## Technical Architecture

### Simulation Pipeline

The simulation runs in multiple passes each frame:

1. **Margolus CA** (4 iterations): Core physics for granular materials
   - 2x2 block-based cellular automata
   - Friction-based toppling with randomized transitions
   - Material-specific friction coefficients
   - Resolved state optimization for settled particles

2. **Liquid Spread**: Horizontal liquid flow
   - Probabilistic spreading based on material friction
   - Deterministic direction selection with variance

3. **Archimedes**: Buoyancy and density layering
   - Material-specific density values
   - Swap mechanics for floating/sinking

### Rendering Pipeline

Post-processing effects applied in sequence:
- **Edge Blending**: 3x3 neighborhood averaging at material boundaries
- **Material Variation**: FBM noise-based texture variation

## Getting Started

### Prerequisites

- Node.js (v18+)
- npm or pnpm

### Installation

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

### Development

```bash
# Run linter
npm run lint

# Auto-fix linting issues
npm run lint:fix

# Format code with Prettier
npm run format

# Check formatting
npm run format:check
```

## Controls

- **Left Click + Drag**: Draw particles
- **Material Selector**: Choose particle type (Sand, Water, Stone, Oil, Lava, Steam, Empty)
- **Friction Amplifier**: Global friction multiplier (0-10, default: 1.0)
- **Zoom**: Adjust pixel size for zoom effect
- **Clear World**: Reset simulation
- **Toggle Effects**: Enable/disable edge blending and material variation
- **Adjust Effect Settings**: Fine-tune blending strength and noise parameters

## Project Structure

```
src/
├── components/          # React components
│   ├── MainSimulation.tsx       # Main simulation orchestrator
│   ├── PostProcessRenderer.tsx  # Post-processing pipeline
│   └── Controls.tsx             # UI controls
├── shaders/            # GLSL shaders
│   ├── margolusShaders.ts       # Margolus CA transitions
│   ├── liquidSpreadShaders.ts   # Liquid flow mechanics
│   ├── archimedesShaders.ts     # Buoyancy system
│   ├── postProcessShaders.ts    # Visual effects
│   └── margolusShaderUtils.ts   # Shared utilities
├── world/              # World generation and materials
│   ├── WorldGeneration.ts       # Texture initialization
│   ├── ParticleTypes.ts         # Particle type definitions
│   └── MaterialDefinitions.ts   # Material properties
├── types/              # TypeScript type definitions
└── hooks/              # React hooks
```

## Key Algorithms

### Margolus Cellular Automata

Uses a 2x2 block-based approach with 4-iteration cycle to avoid grid artifacts. Each block processes local transitions based on particle states and material properties.

### Friction-Based Toppling

Particles resist toppling based on material-specific friction:
```glsl
toppleProbability = 1.0 - clamp(baseFriction * uFrictionAmplifier, 0.0, 1.0)
```

### Resolved State Optimization

Uses alpha channel to track settled particles:
- 1.0 = resolved (all empty or static)
- 0.0 = unresolved (contains movable particles)

Blocks with all resolved particles skip transition checks for better performance.

## Tech Stack

- **React 19** - UI framework
- **TypeScript** - Type safety
- **Three.js** - WebGL rendering
- **React Three Fiber** - React bindings for Three.js
- **Vite** - Build tool and dev server
- **GLSL** - GPU shader programming

## Known Issues

- Click-through UI (planned fix)
- Materials might benefit from exponential rather than linear friction curves

## Roadmap

- [ ] Gas behavior improvements
- [ ] Materials interaction (mixing)
- [ ] Dynamic particles (spawners, etc.)
- [ ] Temperature, force, and pressure overlays
- [ ] Additional rendering effects:
  - [ ] Bloom
  - [ ] Custom background
  - [ ] Particle overlay effects

## License

MIT

## Credits

Built with inspiration from GPU-based cellular automata and falling sand simulations.
