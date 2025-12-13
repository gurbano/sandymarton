# Plan: Rigid Bodies as Buildables with Force Transfer

## Overview

Add rigid body buildables (boxes and circles) that interact with the particle simulation via force transfer. When rigid bodies move through the world, they write force vectors into the heat/force texture, causing nearby particles to be ejected through the existing force extraction system.

## Data Flow

```
User places "Rigid Box" buildable
    |
    v
BuildableDefinition.onPlace()
    |
    +---> BuildablesTextureManager.addBuildable() -> stores slot
    +---> PhysicsManager.spawnBoxFromBuildable() -> creates Rapier body

Each Frame:
    |
    v
Rapier physics step (rigid body moves)
    |
    v
NEW: rigidBodyToHeatShader
    - Reads rigid body positions/velocities from data texture
    - Writes force into heat/force texture B/A channels where body overlaps
    |
    v
forceExtractionShader reads force -> particles ejected
```

## Implementation Steps

### Step 1: Extend Buildable Types
**File:** `src/buildables/Buildables.ts`

- Add `RIGID_BOX` and `RIGID_CIRCLE` to `BuildableType` enum
- Add `PHYSICS` to `BuildableCategory` enum

**File:** `src/buildables/BuildablesConstants.ts`

- Add GPU type constants: `RIGID_BOX: 6`, `RIGID_CIRCLE: 7`

---

### Step 2: Add Rigid Body Tracking to BuildablesTextureManager
**File:** `src/buildables/BuildablesTextureManager.ts`

- Add `rigidBodyIds: Map<number, number>` to track slot -> Rapier body ID
- Add methods: `setRigidBodyId()`, `getRigidBodyId()`, `clearRigidBodyId()`
- Modify `removeBuildable()` to also remove the associated Rapier body

---

### Step 3: Extend PhysicsManager
**File:** `src/physics/PhysicsManager.ts`

- Add `rigidBodyVelocities: Float32Array` buffer (vx, vy per body)
- Update `updateRenderBuffers()` to populate velocity buffer
- Add `spawnBoxFromBuildable(slot, x, y, w, h)` and `spawnCircleFromBuildable(slot, x, y, r)`
- Add bidirectional mapping: `buildableSlotToRigidBody` / `rigidBodyToBuildableSlot`
- Add `removeRigidBodyBySlot(slot)`

---

### Step 4: Create Rigid Body to Heat Shader
**New file:** `src/shaders/rigidBodyToHeatShader.ts`

Shader that runs each frame to inject force from rigid bodies:

```glsl
// Uniforms
uniform sampler2D uHeatTexture;
uniform sampler2D uRigidBodyData;    // x, y, vx, vy per body
uniform sampler2D uRigidBodySizes;   // width, height, shape, _ per body
uniform float uRigidBodyCount;
uniform float uWorldSize;
uniform float uForceMultiplier;

// For each pixel:
// - Loop through rigid bodies
// - Calculate overlap with body shape
// - If overlapping, add force based on body velocity
// - Force direction = velocity direction
// - Force magnitude = velocity * overlap * multiplier
// - Accumulate and clamp force
// - Write to B/A channels
```

---

### Step 5: Integrate Shader into Pipeline
**File:** `src/physics/usePhysicsSimulation.ts`

- Create shader resources for `rigidBodyToHeatShader`
- Create `rigidBodyDataTexture` (Float32, MAX_RIGID_BODIES x 1)
- Add `runRigidBodyForcePass(heatSource, heatRTs, heatRtIndex)` function
- Return this function from the hook

**File:** `src/components/MainSimulation.tsx`

- After buildables-to-heat pass, before physics extraction:
```typescript
if (config.physics?.enabled && physicsManager.rigidBodyCount > 0) {
  const result = runRigidBodyForcePass(heatSource, heatRTs, heatRtIndex);
  heatSource = result.newSource;
  heatRtIndex = result.newIndex;
}
```

---

### Step 6: Add Buildable Definitions
**File:** `src/buildables/BuildableDefinitions.ts`

Add definitions for RIGID_BOX and RIGID_CIRCLE:

```typescript
{
  type: BuildableType.RIGID_BOX,
  name: 'Rigid Box',
  category: BuildableCategory.PHYSICS,
  onPlace: (context) => {
    // 1. Add to BuildablesTextureManager
    // 2. Spawn Rapier body via PhysicsManager
    // 3. Link slot to rigid body ID
  },
}
```

---

### Step 7: Create Rigid Body Mask Texture
**File:** `src/physics/usePhysicsSimulation.ts`

Create a mask texture that marks where rigid bodies are:

```typescript
// Create mask render target (same size as world)
const rigidBodyMaskRT = useMemo(() =>
  new WebGLRenderTarget(textureSize, textureSize, {
    format: RedFormat,
    type: UnsignedByteType,
    minFilter: NearestFilter,
    magFilter: NearestFilter,
  }), [textureSize]);

// Shader that renders rigid body shapes as white (1) on black (0)
const rigidBodyMaskShader = `
  uniform sampler2D uRigidBodyData;   // x, y per body
  uniform sampler2D uRigidBodySizes;  // width, height, shape per body
  uniform float uRigidBodyCount;
  uniform vec2 uTextureSize;

  void main() {
    vec2 pixelPos = floor(gl_FragCoord.xy);

    for (int i = 0; i < MAX_RIGID_BODIES; i++) {
      if (float(i) >= uRigidBodyCount) break;
      // Check if pixel overlaps rigid body shape
      // If yes, output 1.0 (masked)
    }
    gl_FragColor = vec4(0.0); // Not masked
  }
`;
```

---

### Step 8: Pass Mask to Margolus/Liquid Shaders
**File:** `src/shaders/margolusShaderUtils.ts`

Add uniform and modify `getCellState()`:

```glsl
uniform sampler2D uRigidBodyMask;  // NEW: 1 = rigid body present, 0 = empty

// In getCellState or block setup:
float maskValue = texture2D(uRigidBodyMask, sampleUV).r;
if (maskValue > 0.5) {
  return INTERNAL_STATIC;  // Treat as immovable
}
```

**File:** `src/components/MainSimulation.tsx`

Pass the mask texture to all Margolus and liquid spread passes:

```typescript
margolusShader.uniforms.uRigidBodyMask.value = rigidBodyMaskRT.texture;
liquidSpreadShader.uniforms.uRigidBodyMask.value = rigidBodyMaskRT.texture;
```

---

## Key Files to Modify

| File | Changes |
|------|---------|
| `src/buildables/Buildables.ts` | Add types and category |
| `src/buildables/BuildablesConstants.ts` | Add GPU constants |
| `src/buildables/BuildablesTextureManager.ts` | Add rigid body tracking |
| `src/buildables/BuildableDefinitions.ts` | Add buildable definitions |
| `src/physics/PhysicsManager.ts` | Add velocity buffer, slot mapping |
| `src/physics/usePhysicsSimulation.ts` | Add force shader pass, **mask texture** |
| `src/components/MainSimulation.tsx` | Call force pass, **pass mask to shaders** |
| `src/shaders/rigidBodyToHeatShader.ts` | **NEW** - force injection shader |
| `src/shaders/rigidBodyMaskShader.ts` | **NEW** - generates mask texture |
| `src/shaders/margolusShaderUtils.ts` | **Add mask uniform, check in getCellState** |

---

## Force Calculation in Shader

```glsl
for each rigid body:
  overlap = calculateOverlap(pixelPos, bodyPos, bodySize, bodyShape);
  if (overlap > 0.0):
    vel = bodyVelocity;
    speed = length(vel);
    if (speed > 0.01):
      forceDir = normalize(vel);
      forceMag = speed * overlap * uForceMultiplier;
      force += forceDir * forceMag;

// Encode: 128 = neutral, 0-255 = -1.0 to +1.0
encodedForce = (clamp(force, -1.0, 1.0) * 127.0 + 128.0) / 255.0;
```

---

## Data Flow Summary

```
Each Frame:
1. Rapier physics step (rigid bodies move)
2. Generate rigid body mask texture (rigidBodyMaskShader)
3. Run Margolus passes (mask makes particles avoid rigid bodies)
4. Run liquid spread passes (mask makes liquids avoid rigid bodies)
5. Run rigidBodyToHeatShader (rigid body velocity -> force texture)
6. Run force extraction (particles ejected by rigid body force)
```

---

## Notes

- **Y-axis**: Rapier uses Y-up, screen uses Y-down. Convert when spawning and in shader.
- **Collision**: Rigid bodies already collide with world via existing `rebuildWorldColliders()`.
- **Rendering**: PhysicsRenderer already renders rigid bodies - no changes needed.
- **Removal**: When buildable removed, also remove Rapier body.
- **Mask texture**: Regenerated each frame to reflect current rigid body positions.
