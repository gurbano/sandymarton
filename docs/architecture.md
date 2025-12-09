# Architecture Overview

Sandy2 is built on a modular, GPU-first architecture that maximizes parallelization and minimizes CPU-GPU data transfer.

## Core Principles

1. **GPU-First**: Simulation and rendering logic primarily run on the GPU via GLSL shaders
2. **Double Buffering**: Ping-pong texture swapping for state updates
3. **Modular Pipeline**: Each simulation pass is independent and composable
4. **Minimal CPU Processing**: Particle state stays on the GPU except for lightweight analytics (e.g., particle counting)

## System Components

### Simulation Layer

**MainSimulation.tsx**
- Orchestrates the simulation pipeline
- Manages texture ping-ponging
- Controls frame rate and update loop

**Shader Passes**
1. Margolus CA (8 iterations default) - Granular physics and settling
2. Liquid Spread (4 passes) - Horizontal liquid flow
3. Archimedes (2 passes) - Buoyancy and density layering
4. Ambient Heat Transfer (2 passes) - Heat layer diffusion and emission
5. Particle Heat Diffusion (2 passes) - Direct conduction between particles
6. Phase Transitions (1 pass) - Material changes based on temperature
7. Force Transfer (optional) - Experimental external force propagation

Each pass:
- Reads from input texture
- Applies transformations via fragment shader
- Writes to output texture
- Swaps buffers for next pass

### Rendering Layer

**PostProcessRenderer.tsx**
- Converts particle state to visual colors
- Applies post-processing effects:
  - Edge blending for smooth boundaries
  - Material variation for natural texture

**TextureRenderer.tsx**
- Final display rendering
- Liquid animation with time-based noise
- Camera controls (pan, zoom)
- Pixel-perfect rendering

### UI Layer

**SideControls.tsx**
- Material selection
- Tool modes (draw, erase, fill)
- Simulation configuration
- Level management
- Rendering effect toggles

**ParticleCounter.tsx**
- Real-time particle statistics refreshed periodically
- CPU reads the GPU-owned state texture (Uint8Array) for aggregation
- Optimized counting loop avoids per-frame overhead

## Data Flow

```
User Input
    ↓
React State Updates
    ↓
Shader Uniforms Updated
    ↓
GPU Simulation Pipeline
    ├─ Margolus CA (4×)
    ├─ Liquid Spread
    └─ Archimedes
    ↓
Post-Processing Pipeline
    ├─ Base Colors
    ├─ Edge Blending
    └─ Material Variation
    ↓
Final Rendering
    ├─ Liquid Animation
    └─ Display to Canvas
```

## Texture Management

### State Textures
- Format: RGBA8 (Uint8Array)
- Size: 1024×1024 pixels (configurable)
- Storage: GPU-only (DataTexture)
- Updates: Every frame via render-to-texture

### Heat / Force Textures
- Format: RGBA8
- Channels: TempLow, TempHigh, ForceX, ForceY
- Purpose: Shared ambient temperature and force storage between passes
- Lifecycle: Created once, ping-ponged each frame

### Color Textures
- Format: RGBA8
- Size: Same as state texture
- Purpose: Intermediate post-processing results
- Lifecycle: Created on-demand, cached

### Render Targets
- WebGLRenderTarget for off-screen rendering
- NearestFilter for pixel-perfect sampling
- No depth/stencil buffers (2D simulation)

## Performance Optimizations

1. **Minimal State Transfer**: Particle state stays on GPU
2. **Shader Compilation Caching**: Materials created once, reused
3. **Conditional Rendering**: Post-processing only when effects enabled
4. **Efficient Texture Formats**: RGBA8 instead of float textures
5. **Request Animation Frame**: Synchronizes with display refresh
6. **Effect Disabling**: Individual passes can be toggled off

## Memory Layout

```
GPU Memory:
├── State Texture A     (~16 MB)
├── State Texture B     (~16 MB)
├── Color Texture       (~16 MB, optional)
├── Post-Process RT     (~16 MB, optional)
└── Shader Programs     (~1 MB)

Total: ~50-65 MB
```

## Threading Model

- **Main Thread**: React rendering, UI updates, WebGL commands
- **GPU Thread**: Parallel shader execution (thousands of cores)
- **No Web Workers**: Not needed due to GPU parallelization

## Browser Compatibility

**Minimum Requirements:**
- WebGL 2.0 support
- Fragment shader texture reads
- Render-to-texture capability
- GLSL ES 3.0

**Tested On:**
- Chrome 100+
- Firefox 100+
- Safari 15.4+
- Edge 100+
