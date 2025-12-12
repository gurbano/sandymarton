# Dynamic Particles System

Dynamic particles are ejected from the world grid when force exceeds a threshold, follow ballistic trajectories, and settle back into the world when velocity drops.

## Overview

The dynamic particles system provides physics-based particle ejection and movement outside the grid-based cellular automata simulation. This enables realistic force-based particle scattering from explosions, player impacts, or other force sources.

## Configuration

Configuration is defined in `src/types/DynamicParticlesConfig.ts`:

| Parameter | Default | Description |
|-----------|---------|-------------|
| `enabled` | `false` | Enable/disable the system |
| `maxSpawnsPerFrame` | `32` | Cap on new dynamic particles per frame |
| `maxTraversal` | `4` | Max pixels a particle can travel per frame |
| `velocityThreshold` | `0.5` | Velocity below which particle settles back |
| `forceEjectionThreshold` | `50` | Force magnitude required to eject |
| `gravity` | `0.1` | Downward acceleration per frame |
| `friction` | `0.98` | Air resistance multiplier per frame |
| `bounceRestitution` | `0.6` | Energy retention on bounce (0-1) |
| `momentumTransferChance` | `0.3` | Chance to make hit particle dynamic |

## Buffer Layout

### Position Buffer (32x32 RGBA32F)
Each texel represents one potential dynamic particle:
- R: position.x (world coordinates)
- G: position.y (world coordinates)
- B: velocity.x
- A: velocity.y

### Auxiliary Buffer (32x32 RGBA32F)
Stores particle identity for world restoration:
- R: particle type (material ID)
- G: temperature (Kelvin as float)
- B: flags (bit 0=active, bit 1=justSpawned, bit 2=fromMomentum)
- A: lifetime (frames since ejection)

## Pipeline Passes

The system uses three GPU passes per frame:

### 1. Extract Pass (`DYNAMIC_EXTRACT`)
Scans the world texture for particles with force above threshold:
- Checks if particle is moveable (granular or liquid)
- Assigns slot deterministically: `slot = (y * width + x) % 1024`
- Removes particle from world (writes EMPTY)
- Writes position/velocity to dynamic buffer
- Writes type/temperature/flags to aux buffer

### 2. Simulate Pass (`DYNAMIC_SIMULATE`)
Physics update for all active dynamic particles:
- Samples force field at current position
- Applies gravity
- Applies air friction
- Updates velocity

### 3. Collision Pass (`DYNAMIC_COLLISION`)
Movement and collision detection:
- Ray-marches along velocity vector
- Checks for collisions with world particles
- Bounces off static particles
- Transfers momentum to moveable particles
- Settles particles when velocity drops below threshold

### 4. Reintegration
Separate passes write settled particles back to world:
- Restores original particle type
- Restores original temperature
- Clears active flag in aux buffer

## Rendering

Dynamic particles are rendered via an overlay shader in `TextureRenderer`:

```
World State → Base Colors → Dynamic Overlay → Post Effects → Final Output
```

The overlay shader iterates through all 1024 buffer slots, checking for active particles at each fragment position. Active particles render with their material color on top of the world.

## File Structure

| File | Purpose |
|------|---------|
| `src/types/DynamicParticlesConfig.ts` | Configuration interface and defaults |
| `src/particles/DynamicParticlesManager.ts` | Singleton manager, owns DataTextures |
| `src/shaders/dynamicParticlesShaders.ts` | Extract, simulate, collision shaders |
| `src/shaders/dynamicParticlesOverlayShader.ts` | Rendering overlay shader |

## Design Decisions

### Atomic Counting Problem
WebGL2 lacks atomic operations for texture writes. Multiple shader invocations reading the same counter would cause race conditions. Solution: deterministic position-based slot assignment avoids atomics entirely.

### Buffer Size
32x32 = 1024 max particles. With typical active count of 10-50, slot collision rate is ~5% which is acceptable for visual effects.

### Temperature Preservation
RGBA32F format allows storing temperature as float directly (Kelvin range 0-65535), avoiding precision loss from 8-bit encoding.

### Spawn Cap
Hard limit of 32 spawns per frame prevents runaway cascade from chain reactions.

## Performance

- Three extra passes per frame
- Each pass is simple (32x32 or world-size with early-out)
- Expected overhead: <1ms on mid-range GPU
- Overlay shader iterates 1024 slots per fragment (could be optimized with acceleration texture if needed)

## Usage

Enable via simulation config:
```typescript
simulationConfig.dynamicParticles.enabled = true;
```

Enable the three pipeline steps:
```typescript
// In SimulationConfig.steps:
{ type: SimulationStepType.DYNAMIC_EXTRACT, enabled: true, passes: 1 }
{ type: SimulationStepType.DYNAMIC_SIMULATE, enabled: true, passes: 1 }
{ type: SimulationStepType.DYNAMIC_COLLISION, enabled: true, passes: 1 }
```

---

## Implementation Details (Technical Reference)

This section documents the actual implementation for future maintenance.

### Force Layer Integration

Force is stored in the **heat/force layer texture** (BA channels), shared with temperature (RG channels).

**Encoding** (in `buildablesToHeatShader.ts:130`):
```glsl
vec2 encodedForce = (newForce * 127.0 + 128.0) / 255.0;
```
- Neutral force = 128 (maps to ~0)
- Range: [-1, 1] maps to [1, 255]

**Decoding** (in `dynamicParticlesShaders.ts:73-74`):
```glsl
vec2 decodeForce(vec4 heatForceData) {
  return (heatForceData.ba * 255.0 - 128.0) / 127.0;
}
```

**Critical**: The `buildablesToHeat` pass must run every frame even with 0 buildables to reset force to neutral. See `MainSimulation.tsx:678-680`.

### Force Source (Impulse Buildable)

Force sources are impulse-based buildables that die after a few frames:
- Defined in `BuildableDefinitions.ts:111-132`
- Lifetime: `IMPULSE_DURATION = 3` frames (in `BuildablesConstants.ts:34`)
- Direction: Always upward (+Y) with horizontal spread based on position relative to center
- No falloff - constant force throughout radius

**Buildable lifetime update** happens in `BuildablesTextureManager.ts:257-281`:
```typescript
update(): void {
  // Decrements lifetime, removes when <= 0
}
```
Called from `MainSimulation.tsx:651` before each frame.

### Multi-Pass Pipeline

The dynamic particles system uses **6 separate shader passes** in this order (see `MainSimulation.tsx`):

1. **Extract Buffer** (~line 800): Scans world, finds particles to eject, writes to position buffer
2. **Extract Aux** (~line 820): Writes particle type/temperature to aux buffer
3. **Extract World** (~line 840): Removes extracted particles from world texture
4. **Simulate** (~line 860): Physics update (gravity, force field, friction)
5. **Collision** (~line 880): Ray-march movement, bounce off obstacles
6. **Reintegrate World** (~line 900): Write settled particles back to world
7. **Reintegrate Aux** (~line 925): Clear aux buffer slots for settled particles

### Sparse Sampling

Due to the 32x32 buffer limit and world size (1024x1024), passes use **rotating sparse sampling**:

**Extraction** (in `dynamicParticlesShaders.ts:258-260`):
```glsl
float frameOffset = mod(floor(uRandomSeed * 60.0), 4.0);
for (float searchY = frameOffset; searchY < uTextureSize.y; searchY += 4.0) {
```
- Checks every 4th row, with offset rotating each frame
- Over 4 frames, all rows are checked

**Reintegration** (in `dynamicParticlesShaders.ts:613-616`):
```glsl
float baseOffset = mod(floor(uRandomSeed * 60.0), 8.0);
for (float i = 0.0; i < 128.0; i += 1.0) {
  float slotIndex = baseOffset + i * 8.0;
```
- Checks 128 of 1024 slots per frame
- Over 8 frames, all slots are checked

### Key Shader Uniforms

| Uniform | Description | Set in |
|---------|-------------|--------|
| `uSpeedMultiplier` | Scales velocity and physics | `MainSimulation.tsx` |
| `uVelocityThreshold` | Speed below which particle settles | `MainSimulation.tsx:885, 911, 934` |
| `uForceEjectionThreshold` | Force magnitude to trigger extraction | `MainSimulation.tsx:857` |
| `uDynamicGravity` | Downward acceleration | `MainSimulation.tsx:870` |
| `uDynamicFriction` | Air resistance (0.98 = 2% loss/frame) | `MainSimulation.tsx:871` |

### Overlay Rendering

The overlay shader (`dynamicParticlesOverlayShader.ts:89-109`) iterates through **all 1024 slots** per pixel to find active particles:

```glsl
for (float slotY = 0.0; slotY < uDynamicBufferSize; slotY += 1.0) {
  for (float slotX = 0.0; slotX < uDynamicBufferSize; slotX += 1.0) {
    // Check if particle at this fragment position
  }
}
```

This is O(1024) per pixel - expensive but guarantees finding moved particles. An optimized version using an occupancy texture exists but is not currently used.

### Known Issues & Solutions

| Issue | Cause | Solution |
|-------|-------|----------|
| Particles extracted without force | `decodeForce` was wrong: `(ba - 0.5) * 2.0 * 255.0` | Fixed to `(ba * 255.0 - 128.0) / 127.0` |
| Force persists after source removed | `buildablesToHeat` pass skipped when `buildableCount == 0` | Always run the pass (resets to neutral) |
| Particles reintegrate too early | Velocity threshold 0.5 too high | Lowered to 0.05 |
| Initial velocity too small | `forceMag * 0.02` was barely visible | Increased to `forceMag * 2.0` |

### Configuration Tuning

Current defaults in `DynamicParticlesConfig.ts`:
```typescript
velocityThreshold: 0.5,      // When to settle (lower = longer flight)
forceEjectionThreshold: 0.3, // Force needed (lower = easier ejection)
gravity: 0.01,               // Very light gravity
friction: 1.0,               // No air resistance currently
speedMultiplier: 1.5,        // Scales all velocities
```

### Data Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Per-Frame Pipeline                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ┌──────────────┐     ┌───────────────┐     ┌──────────────────┐   │
│  │ Buildables   │────▶│ buildablesToHeat │────▶│ Heat/Force Layer │   │
│  │ (force src)  │     │    shader        │     │ (BA = force)     │   │
│  └──────────────┘     └───────────────┘     └────────┬─────────┘   │
│                                                       │              │
│                                                       ▼              │
│  ┌──────────────┐     ┌───────────────┐     ┌──────────────────┐   │
│  │ World Texture│────▶│ Extract Buffer │────▶│ Dynamic Buffer   │   │
│  │              │     │    shader       │     │ (pos + vel)      │   │
│  └──────────────┘     └───────────────┘     └────────┬─────────┘   │
│         │                                             │              │
│         │             ┌───────────────┐               │              │
│         └────────────▶│ Extract World  │◀─────────────┘              │
│                       │ (remove ejected)│                            │
│                       └───────────────┘                             │
│                                                                      │
│  ┌──────────────┐     ┌───────────────┐                             │
│  │ Dynamic Buf  │────▶│   Simulate     │────▶ Updated velocity       │
│  │ + Force Layer│     │ (gravity,force)│                             │
│  └──────────────┘     └───────────────┘                             │
│                                                                      │
│  ┌──────────────┐     ┌───────────────┐                             │
│  │ Dynamic Buf  │────▶│   Collision    │────▶ Updated position       │
│  │ + World      │     │ (ray-march)    │      + bounce/settle        │
│  └──────────────┘     └───────────────┘                             │
│                                                                      │
│  ┌──────────────┐     ┌───────────────┐     ┌──────────────────┐   │
│  │ Settled      │────▶│ Reintegrate    │────▶│ World Texture    │   │
│  │ particles    │     │ World + Aux    │     │ (restored)       │   │
│  └──────────────┘     └───────────────┘     └──────────────────┘   │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### Future Improvements

1. **Occupancy texture optimization**: Pre-compute which world pixels have dynamic particles to avoid O(1024) overlay loop
2. **Momentum transfer**: Currently disabled - hitting moveable particles just loses momentum
3. **Multiple force sources**: Stack forces from multiple sources (currently works but untested)
4. **Visual effects**: Trail rendering, particle glow for high-velocity particles
