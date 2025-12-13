# Sandymarton Documentation

This directory contains detailed technical documentation for Sandymarton.

## Contents

- **[Architecture Overview](architecture.md)** - High-level system design and component structure
- **[Simulation Pipeline](simulation.md)** - Detailed explanation of physics simulation stages
- **[Rendering System](rendering.md)** - Post-processing effects and visual rendering
- **[Level System](levels.md)** - Level loading, saving, and texture format
- **[Material Reference](materials.md)** - Full list of particle materials and properties
- **[CPU Physics System](physics-cpu.md)** - Rapier.js pipeline for extraction, simulation, and reintegration

## Project Structure

```
src/
├── components/          # React components
│   ├── MainSimulation.tsx       # Hybrid simulation orchestrator
│   ├── PostProcessRenderer.tsx  # Post-processing pipeline
│   ├── TextureRenderer.tsx      # Final rendering and physics overlay
│   ├── SideControls.tsx         # UI controls
│   └── ParticleCounter.tsx      # Statistics display
├── physics/             # CPU physics integration (Rapier)
│   ├── PhysicsManager.ts        # Singleton managing Rapier world
│   ├── usePhysicsSimulation.ts  # Extraction/removal/reintegration loop
│   ├── PhysicsRenderer.ts       # Debris + collider visualization
│   └── CollisionGridBuilder.ts  # World texture → collider conversion
├── shaders/            # GLSL shaders
│   ├── margolusShaders.ts       # Margolus CA transitions
│   ├── liquidSpreadShaders.ts   # Liquid flow mechanics
│   ├── archimedesShaders.ts     # Buoyancy system
│   ├── postProcessShaders.ts    # Visual effects
│   ├── rendererShader.ts        # Final rendering shader
│   └── margolusShaderUtils.ts   # Shared utilities
├── world/              # World generation and materials
│   ├── WorldGeneration.ts       # Texture initialization
│   ├── ParticleTypes.ts         # Particle type definitions
│   └── MaterialDefinitions.ts   # Material properties
├── utils/              # Utility functions
│   ├── LevelLoader.ts           # Level loading from PNG
│   └── LevelSaver.ts            # Level saving to PNG
├── types/              # TypeScript type definitions
│   ├── SimulationConfig.ts      # Simulation configuration
│   ├── RenderConfig.ts          # Rendering configuration
│   └── Level.ts                 # Level metadata
├── hooks/              # React hooks
│  ├── useParticleDrawing.ts    # Interactive drawing
│  ├── useTextureControls.ts    # Pan and zoom with inertia and bounds
│  └── usePlayerInput.ts        # Keyboard capture for player shader
```

## Tech Stack Details

### Frontend

- **React 19** - UI framework with concurrent rendering
- **TypeScript** - Static typing and enhanced IDE support
- **React Three Fiber** - React reconciler for Three.js
- **Three.js** - WebGL abstraction and rendering engine

### Rendering

- **WebGL 2.0** - GPU-accelerated graphics
- **GLSL ES 3.0** - Fragment shaders for simulation and rendering
- **DataTexture** - GPU texture storage for particle state

### Build Tools

- **Vite** - Fast development server and optimized production builds
- **ESLint** - Code linting
- **Prettier** - Code formatting

## Data Format

### Particle State Texture (RGBA)

Each pixel in the state texture represents one particle:

- **R channel**: Particle type ID (0-255)
- **G channel**: Temperature low byte (Kelvin encoding)
- **B channel**: Temperature high byte
- **A channel**: Reserved / auxiliary data (default 255)

### Material Types

- **Empty** (0): Void space
- **Static** (16-32): Immovable materials (stone, etc.)
- **Solid** (33-63): Granular materials (sand, dirt, gravel)
- **Liquid** (64-111): Flowing liquids (water, lava, slime, acid)
- **Gas** (112-159): Gaseous materials (steam, smoke, poison)

## Performance Characteristics

- **World Size**: 1024×1024 particles (≈1.05M)
- **Target FPS**: 60 fps
- **GPU Memory**: ~4 MB per state texture (ping-pong + heat layer ≈ 16 MB total)
- **Simulation Passes per Frame** (defaults):
  - GPU: Buildables → World / Heat, Margolus (8×), Liquid spread (4×), Archimedes (2×), Particle heat (2×), Phase transition (1×), Ambient heat diffusion (2×)
  - CPU Physics: Extraction (GPU), Rapier step (~1×), Removal/Reintegration (GPU) for up to 64 particles per frame when physics is enabled
- **Render Resolution**: Independent of world size (adjustable pixel scale)
