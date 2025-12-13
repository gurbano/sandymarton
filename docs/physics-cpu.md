# CPU Physics System (Rapier.js)

This document describes the Rapier.js-based physics system that handles dynamic particles and rigid bodies. The system runs particle physics on the CPU while using GPU shaders for extraction and reintegration with the world texture.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           Frame Pipeline                                 │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  1. EXTRACTION (GPU)                                                     │
│     forceExtractionShader scans world for particles with force > threshold│
│     Output: 64x1 RGBA32F texture → CPU readback                          │
│                                                                          │
│  2. SPAWN (CPU)                                                          │
│     Parse extracted positions, read type/temp from worldTexture          │
│     PhysicsManager.spawnParticle() creates Rapier rigid bodies           │
│                                                                          │
│  3. REMOVAL (GPU)                                                        │
│     particleRemovalShader clears extracted positions from world          │
│     Input: 64x1 removal positions texture                                │
│                                                                          │
│  4. PHYSICS STEP (CPU)                                                   │
│     PhysicsManager.step() → RAPIER.World.step()                          │
│     Check velocity < settleThreshold → queue for reintegration           │
│     Update render buffers (positions, types)                             │
│                                                                          │
│  5. COLLISION REBUILD (CPU, periodic)                                    │
│     If dirty regions > 10 && time > rebuildInterval                      │
│     buildCollisionGrid() → static Rapier colliders                       │
│                                                                          │
│  6. REINTEGRATION (GPU)                                                  │
│     particleReintegrationShader places settled particles in world        │
│     Input: 64x1 reintegration data texture                               │
│                                                                          │
│  7. RENDERING (GPU)                                                      │
│     PhysicsRenderer draws point sprites for particles                    │
│     Instanced meshes for rigid bodies                                    │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Files

| File | Purpose |
|------|---------|
| `src/physics/PhysicsManager.ts` | Singleton managing Rapier world, particles, rigid bodies |
| `src/physics/usePhysicsSimulation.ts` | React hook orchestrating the frame pipeline |
| `src/physics/PhysicsRenderer.ts` | Three.js point sprites and instanced meshes |
| `src/physics/CollisionGridBuilder.ts` | World texture → collision geometry |
| `src/types/PhysicsConfig.ts` | Configuration types and defaults |
| `src/shaders/forceExtractionShader.ts` | GPU extraction pass |
| `src/shaders/particleRemovalShader.ts` | GPU removal pass |
| `src/shaders/particleReintegrationShader.ts` | GPU reintegration pass |

---

## PhysicsManager (Singleton)

### Purpose
Manages the Rapier physics world, spawns/removes particles and rigid bodies, tracks render buffers.

### Key Properties

```typescript
// Rapier world
private world: RAPIER.World | null;
private initialized: boolean;

// Particles (Map<id, PhysicsParticle>)
private particles: Map<number, PhysicsParticle>;
private nextParticleId: number;

// Rigid bodies (Map<id, RigidBodyObject>)
private rigidBodies: Map<number, RigidBodyObject>;
private nextRigidBodyId: number;

// World collision geometry (static colliders from world texture)
private worldColliders: RAPIER.Collider[];
private lastCollisionRebuild: number;
private dirtyRegions: Set<string>;

// Render buffers (Float32Array/Uint8Array for GPU upload)
public particlePositions: Float32Array;  // [x0, y0, x1, y1, ...] size = MAX_PHYSICS_PARTICLES * 2
public particleTypes: Uint8Array;        // [type0, type1, ...] size = MAX_PHYSICS_PARTICLES
public particleCount: number;

public rigidBodyPositions: Float32Array; // [x0, y0, x1, y1, ...] size = MAX_RIGID_BODIES * 2
public rigidBodyRotations: Float32Array; // [rot0, rot1, ...] size = MAX_RIGID_BODIES
public rigidBodySizes: Float32Array;     // [w0, h0, w1, h1, ...] size = MAX_RIGID_BODIES * 2
public rigidBodyCount: number;

// Settled particles waiting for reintegration
public settledParticles: SettledParticle[];
```

### Key Methods

```typescript
// Initialization
async init(): Promise<void>
  - Calls RAPIER.init() (loads WASM)
  - Creates RAPIER.World with gravity { x: 0, y: -config.gravity }

// Particle Management
spawnParticle(x, y, vx, vy, type, temperature): number | null
  - Creates RigidBodyDesc.dynamic() with position, linvel, damping, CCD
  - Creates ColliderDesc.ball(particleRadius) with restitution, friction
  - Returns particle ID or null if at MAX_PHYSICS_PARTICLES

removeParticle(id): void
  - Removes rigid body from world, deletes from Map

// Rigid Body Management
spawnBox(x, y, width, height, angle?): number | null
  - Creates RigidBodyDesc.dynamic() with rotation
  - Creates ColliderDesc.cuboid(width/2, height/2)

spawnCircle(x, y, radius): number | null
  - Creates RigidBodyDesc.dynamic()
  - Creates ColliderDesc.ball(radius)

removeRigidBody(id): void

// Collision Geometry
markDirty(x, y): void
  - Adds cell to dirtyRegions Set

shouldRebuildColliders(now): boolean
  - Returns true if dirtyRegions.size > 10 AND time > collisionRebuildInterval

rebuildWorldColliders(worldData, width, height): void
  - Removes all old worldColliders
  - Calls buildCollisionGrid() to get solid cells
  - Creates static ColliderDesc.cuboid for each cell
  - Clears dirtyRegions

// Simulation Step
step(): void
  - Calls world.step() (Rapier physics tick)
  - Loops particles, checks velocity < settleThreshold
  - Moves settled particles to settledParticles array
  - Removes settled from world
  - Calls updateRenderBuffers()

updateRenderBuffers(): void  (private)
  - Iterates particles, writes positions/types to Float32Array/Uint8Array
  - Iterates rigid bodies, writes positions/rotations/sizes

getSettledParticles(maxCount): SettledParticle[]
  - Splices up to maxCount from settledParticles array
  - Returns array of { x, y, type, temperature }

// Cleanup
clear(): void  - Removes all particles and rigid bodies
dispose(): void - Full cleanup including world colliders
reset(): void - Clear + reset config to defaults
```

### Interfaces

```typescript
interface PhysicsParticle {
  body: RAPIER.RigidBody;
  type: number;        // Material type ID (0-255)
  temperature: number; // Kelvin
}

interface RigidBodyObject {
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
  width: number;
  height: number;
  shape: 'box' | 'circle';
}

interface SettledParticle {
  x: number;          // Floor'd world position
  y: number;
  type: number;
  temperature: number;
}
```

---

## usePhysicsSimulation (React Hook)

### Purpose
Orchestrates the per-frame physics pipeline, manages GPU resources for extraction/removal/reintegration.

### Props

```typescript
interface UsePhysicsSimulationProps {
  gl: WebGLRenderer;
  worldTexture: DataTexture;
  textureSize: number;
  heatForceTexture: Texture | null;  // Heat/force layer (B/A channels = force)
  enabled: boolean;
  config?: Partial<PhysicsConfig>;
  onParticleCountUpdate?: (count: number) => void;
}
```

### Return Value

```typescript
interface PhysicsSimulationResult {
  runPhysicsStep: (currentSource, renderTargets, rtIndex, elapsedTime) => { newSource, newRtIndex };
  isReady: boolean;
  particleCount: number;
  rigidBodyCount: number;
  spawnBox: (x, y, width, height, angle?) => number | null;
  spawnCircle: (x, y, radius) => number | null;
  clear: () => void;
}
```

### GPU Resources

```typescript
// Extraction render target (64x1 RGBA32F)
extractionRT: WebGLRenderTarget

// Removal data texture (64x1 RGBA32F) - positions to clear
removalTexture: DataTexture

// Reintegration data texture (64x1 RGBA32F) - particles to place
reintegrationTexture: DataTexture

// Pixel buffer for extraction readback
extractionPixels: Float32Array(64 * 4)

// Shader resources (scene, camera, material, mesh)
extractionResources: SimulationResources
removalResources: SimulationResources
reintegrationResources: SimulationResources
```

### Main Loop: runPhysicsStep()

```typescript
function runPhysicsStep(currentWorldSource, renderTargets, rtIndex, elapsedTime) {
  if (!enabled || !initialized) return { newSource: currentWorldSource, newRtIndex: rtIndex };

  // 1. EXTRACTION - GPU pass to find particles with force
  const extracted = runExtraction(currentSource, elapsedTime);
  // extracted = [{ x, y, vx, vy }, ...]

  // 2. SPAWN - Read types from worldTexture, create physics particles
  if (extracted.length > 0) {
    for (const p of extracted) {
      const idx = (Math.floor(p.y) * textureSize + Math.floor(p.x)) * 4;
      const type = worldData[idx];
      const tempLow = worldData[idx + 1];
      const tempHigh = worldData[idx + 2];
      const temperature = tempLow + tempHigh * 256;
      physicsManager.spawnParticle(p.x, p.y, p.vx, p.vy, type, temperature);
    }

    // 3. REMOVAL - GPU pass to clear extracted from world
    const result = runRemoval(currentSource, extracted, renderTargets, currentRtIndex);
    currentSource = result.newSource;
    currentRtIndex = result.newRtIndex;
  }

  // 4. PHYSICS STEP - Rapier simulation
  physicsManager.step();

  // 5. COLLISION REBUILD - Periodic, if dirty
  if (physicsManager.shouldRebuildColliders(now)) {
    physicsManager.rebuildWorldColliders(worldData, textureSize, textureSize);
  }

  // 6. REINTEGRATION - GPU pass to place settled particles
  const settled = physicsManager.getSettledParticles(maxReintegrationsPerFrame);
  if (settled.length > 0) {
    const result = runReintegration(currentSource, settled, renderTargets, currentRtIndex);
    currentSource = result.newSource;
    currentRtIndex = result.newRtIndex;
  }

  // 7. Particle count callback (every 500ms)
  if (onParticleCountUpdate && now - lastUpdate > 500) {
    onParticleCountUpdate(physicsManager.activeParticleCount);
  }

  return { newSource: currentSource, newRtIndex: currentRtIndex };
}
```

---

## GPU Shaders

### forceExtractionShader

**Input:**
- `uWorldTexture` - World state texture (R = particle type)
- `uHeatForceTexture` - Heat/force layer (B/A = force x/y, 128 = neutral)
- `uTextureSize` - World dimensions
- `uForceThreshold` - Ejection threshold (0-1)
- `uEjectionVelocityMultiplier` - Velocity scaling
- `uTime` - Used for rotating Y offset

**Output:** 64x1 RGBA32F
- R = worldX (or -1 if no particle)
- G = worldY (or -1 if no particle)
- B = velocityX
- A = velocityY

**Logic:**
```glsl
slot = floor(gl_FragCoord.x);  // 0-63
stripeWidth = textureSize.x / 64.0;
startX = slot * stripeWidth;

// Rotating Y offset for full coverage over 4 frames
frameOffset = mod(floor(uTime * 60.0), 4.0);

// Scan stripe
for (x = startX; x < startX + stripeWidth; x++) {
  for (y = frameOffset; y < textureSize.y; y += 4.0) {
    type = worldTexture[x, y].r * 255
    if (!isMoveable(type)) continue;  // Only solids 33-63 and liquids 64-111

    force = decodeForce(heatForceTexture[x, y]);  // (B*255-128)/127, (A*255-128)/127
    if (length(force) >= threshold) {
      vel = normalize(force) * min(forceMag * multiplier, 8.0);
      gl_FragColor = vec4(x, y, vel.x, vel.y);
      return;
    }
  }
}
gl_FragColor = vec4(-1, -1, 0, 0);  // No particle found
```

### particleRemovalShader

**Input:**
- `uCurrentState` - Current world texture
- `uRemovalTexture` - 64x1 positions to remove (R=x, G=y)
- `uRemovalCount` - Number of valid entries

**Output:** Modified world texture (cleared positions)

**Logic:**
```glsl
worldCoord = floor(vUv * textureSize);

for (i = 0; i < 64; i++) {
  if (i >= uRemovalCount) break;
  removalPos = removalTexture[i].rg;
  if (removalPos.x < 0) continue;

  if (floor(removalPos) == worldCoord) {
    gl_FragColor = vec4(0, particle.g, particle.b, particle.a);  // Clear to empty, keep temp
    return;
  }
}
gl_FragColor = particle;  // No change
```

### particleReintegrationShader

**Input:**
- `uCurrentState` - Current world texture
- `uReintegrationTexture` - 64x1 particles (R=x, G=y, B=type, A=temp)
- `uReintegrationCount` - Number of valid entries

**Output:** Modified world texture (placed particles)

**Logic:**
```glsl
currentType = current.r * 255.0;
if (currentType > 0.5) {
  gl_FragColor = current;  // Cell not empty, skip
  return;
}

for (i = 0; i < 64; i++) {
  if (i >= uReintegrationCount) break;
  particleData = reintegrationTexture[i];
  pos = particleData.rg;
  type = particleData.b;
  temp = particleData.a;

  if (floor(pos) == worldCoord) {
    encodedTemp = encodeTemperature(temp);  // Split into G, B channels
    gl_FragColor = vec4(type/255, encodedTemp.x, encodedTemp.y, 1.0);
    return;
  }
}
gl_FragColor = current;
```

---

## CollisionGridBuilder

### Purpose
Converts world texture to static collision geometry for Rapier.

### Functions

```typescript
buildCollisionGrid(worldData: Uint8Array, width: number, height: number, cellSize: number): CollisionCell[]
```

- Divides world into cells of `cellSize` pixels (default 8)
- Samples 5 points per cell (corners + center)
- Cell is solid if >= 3 samples are static material (type 16-32)
- Returns array of `{ x, y }` cell positions

```typescript
buildHeightmap(worldData, width, height): Float32Array
```

- Alternative: single height value per column
- Scans top-to-bottom, records first solid

### Material Ranges

```typescript
STATIC_MIN = 16   // Stone, glass, etc.
STATIC_MAX = 32   // Static materials become collision
SOLID_MIN = 33    // Moveable solids (sand, dirt)
SOLID_MAX = 63
LIQUID_MIN = 64   // Liquids (water, lava)
LIQUID_MAX = 111
```

---

## PhysicsRenderer

### Purpose
Renders physics particles as point sprites, rigid bodies as instanced meshes.

### Components

```typescript
// Particle rendering
particleGeometry: BufferGeometry
particlePositions: BufferAttribute(Float32Array, 3)  // x, y, z
particleColors: BufferAttribute(Float32Array, 3)     // r, g, b
particleMaterial: PointsMaterial({ size: 2, vertexColors: true })
particlePoints: Points

// Rigid body rendering - boxes
boxGeometry: PlaneGeometry(1, 1)
boxMaterial: MeshBasicMaterial({ color: 0x8b4513 })
boxMesh: InstancedMesh(boxGeometry, boxMaterial, MAX_RIGID_BODIES)

// Rigid body rendering - circles
circleGeometry: CircleGeometry(1, 16)
circleMaterial: MeshBasicMaterial({ color: 0x654321 })
circleMesh: InstancedMesh(circleGeometry, circleMaterial, MAX_RIGID_BODIES)
```

### Update Method

```typescript
update(physicsManager: PhysicsManager): void {
  // Update particle positions and colors
  for (i = 0; i < physicsManager.particleCount; i++) {
    positions[i*3] = physicsManager.particlePositions[i*2] + 0.5;
    positions[i*3+1] = physicsManager.particlePositions[i*2+1] + 0.5;
    positions[i*3+2] = 0;

    color = getParticleColor(physicsManager.particleTypes[i]);
    colors[i*3] = color.r;
    colors[i*3+1] = color.g;
    colors[i*3+2] = color.b;
  }
  particleGeometry.setDrawRange(0, count);

  // Update rigid body instance matrices
  for (i = 0; i < physicsManager.rigidBodyCount; i++) {
    tempMatrix.compose(
      tempPosition.set(x, y, 0),
      tempQuaternion.setFromAxisAngle(zAxis, rotation),
      tempScale.set(width, height, 1)
    );

    if (isCircle) circleMesh.setMatrixAt(i, tempMatrix);
    else boxMesh.setMatrixAt(i, tempMatrix);
  }
}
```

---

## Configuration

### PhysicsConfig

```typescript
interface PhysicsConfig {
  enabled: boolean;                    // Default: true
  gravity: number;                     // Default: 9.8 (pixels/frame²)
  particleDamping: number;             // Default: 0.1 (air resistance)
  particleRadius: number;              // Default: 0.5 (collision radius)
  particleRestitution: number;         // Default: 0.3 (bounciness)
  particleFriction: number;            // Default: 0.5
  forceEjectionThreshold: number;      // Default: 0.3 (normalized 0-1)
  settleThreshold: number;             // Default: 0.5 (velocity)
  maxExtractionsPerFrame: number;      // Default: 64
  maxReintegrationsPerFrame: number;   // Default: 64
  collisionRebuildInterval: number;    // Default: 500 (ms)
  collisionCellSize: number;           // Default: 8 (pixels)
  ejectionVelocityMultiplier: number;  // Default: 3.0
}
```

### RigidBodyConfig

```typescript
interface RigidBodyConfig {
  density: number;        // Default: 2.0
  restitution: number;    // Default: 0.3
  friction: number;       // Default: 0.6
  linearDamping: number;  // Default: 0.1
  angularDamping: number; // Default: 0.1
}
```

### Constants

```typescript
MAX_PHYSICS_PARTICLES = 5000
MAX_RIGID_BODIES = 100
EXTRACTION_BUFFER_SIZE = 64  // Particles per frame
```

---

## Force Encoding (Heat/Force Texture)

The heat/force texture uses RGBA channels:
- **R**: Temperature low byte
- **G**: Temperature high byte (16-bit Kelvin = R + G*256)
- **B**: Force X (128 = neutral, 0 = -1.0, 255 = +1.0)
- **A**: Force Y (128 = neutral, 0 = -1.0, 255 = +1.0)

**Decoding force in shader:**
```glsl
vec2 decodeForce(vec4 heatForce) {
  return (heatForce.ba * 255.0 - 128.0) / 127.0;
}
```

---

## Integration with MainSimulation

In `MainSimulation.tsx`, the hook is called in useFrame:

```typescript
// In component body
const { runPhysicsStep } = usePhysicsSimulation({
  gl,
  worldTexture,
  textureSize,
  heatForceTexture: heatForceLayerRef.current,
  enabled: config.physics?.enabled,
  config: config.physics,
  onParticleCountUpdate: onPhysicsParticleCountUpdate,
});

// In useFrame callback
if (config.physics?.enabled) {
  const result = runPhysicsStep(currentSource, renderTargets, rtIndex, state.clock.elapsedTime);
  currentSource = result.newSource;
  rtIndex = result.newRtIndex;
}
```

---

## Performance Notes

- **Extraction**: 64 particles max per frame (GPU bound by readback)
- **Reintegration**: 64 particles max per frame
- **Collision rebuild**: Throttled to every 500ms minimum, only when dirty
- **Physics step**: Rapier runs at frame rate (typically 60Hz)
- **Render buffers**: Pre-allocated Float32Array, no allocation per frame

---

## TODO / Known Issues

1. PhysicsRenderer is created but not actually rendered in the scene (needs integration)
2. Collision grid doesn't merge adjacent cells (could reduce collider count)
3. No particle-to-particle collision (only particle-to-world)
4. Temperature not preserved perfectly through extraction/reintegration cycle
5. Rigid bodies don't interact with cellular automaton (they float above)
