# Rigid Bodies as Buildables - Implementation Summary

## Overview

Added rigid body buildables (boxes and circles) that interact with the particle simulation via force transfer. When rigid bodies move through the world, they write force vectors into the heat/force texture, causing nearby particles to be ejected through the existing force extraction system.

## Files Modified

### src/buildables/Buildables.ts
- Added `RIGID_BOX` and `RIGID_CIRCLE` to `BuildableType` enum
- Added `PHYSICS` to `BuildableCategory` enum

### src/buildables/BuildablesConstants.ts
- Added GPU type constants: `RIGID_BOX: 6`, `RIGID_CIRCLE: 7`
- Added GLSL constants for shader use

### src/buildables/BuildablesTextureManager.ts
- Added `rigidBodyIds: Map<number, number>` to track slot -> Rapier body ID
- Added methods: `setRigidBodyId()`, `getRigidBodyId()`, `clearRigidBodyId()`, `hasRigidBody()`
- Modified `removeBuildable()` to return associated rigid body ID
- Modified `removeBuildablesInRadius()` to return rigid body IDs
- Modified `clear()` to return rigid body IDs for cleanup

### src/buildables/BuildableDefinitions.ts
- Added `RIGID_BOX` buildable definition with physics integration
- Added `RIGID_CIRCLE` buildable definition with physics integration
- Both convert screen coords to Rapier coords (Y-flip) when spawning

### src/physics/PhysicsManager.ts
- Added `rigidBodyVelocities: Float32Array` buffer (vx, vy per body)
- Added `rigidBodyShapes: Uint8Array` buffer (0 = box, 1 = circle)
- Added bidirectional mapping: `buildableSlotToRigidBody` / `rigidBodyToBuildableSlot`
- Added `spawnBoxFromBuildable(slot, x, y, w, h)` method
- Added `spawnCircleFromBuildable(slot, x, y, r)` method
- Added `removeRigidBodyBySlot(slot)` method
- Added `getRigidBodyIdForSlot(slot)` and `getBuildableSlotForRigidBody(id)` methods
- Updated `updateRenderBuffers()` to populate velocity and shape buffers
- Updated `clear()` to clean up slot mappings

### src/shaders/margolusShaderUtils.ts
- Added `uRigidBodyMask` uniform declaration
- Added `isRigidBodyAt(vec2 pixelCoord)` helper function
- Added rigid body mask check in `margolusBlockSetup` - blocks overlapping rigid bodies are treated as static

### src/components/MainSimulation.tsx
- Imported and initialized `useRigidBodyShaders` hook
- Added `uRigidBodyMask` uniform to Margolus and liquid spread shaders
- Added rigid body data texture updates each frame
- Added mask pass generation before Margolus passes
- Added force injection pass after buildablesToHeat pass
- Pass mask texture to shaders each frame

## New Files Created

### src/shaders/rigidBodyToHeatShader.ts
Force injection shader that:
- Reads rigid body positions/velocities from data textures
- For pixels overlapping rigid bodies, adds force based on body velocity
- Preserves existing temperature in RG channels
- Writes force to BA channels (128 = neutral)

### src/shaders/rigidBodyMaskShader.ts
Mask generation shader that:
- Outputs 1.0 (red channel) for pixels inside rigid bodies
- Outputs 0.0 for pixels outside
- Supports both box and circle shapes
- Used by Margolus/liquid shaders to treat rigid body areas as immovable

### src/physics/useRigidBodyShaders.ts
React hook that manages:
- Data textures for positions, velocities, sizes, shapes (MAX_RIGID_BODIES x 1)
- Mask render target (world size)
- `updateDataTextures()` - syncs PhysicsManager buffers to GPU
- `runMaskPass()` - generates mask texture
- `runForcePass()` - injects force into heat texture
- Returns `maskTexture` and `hasRigidBodies` for use in main simulation

## Data Flow

```
User places "Rigid Box" buildable
    ↓
BuildableDefinition.onPlace()
    ├── BuildablesTextureManager.addBuildable() → stores slot
    └── PhysicsManager.spawnBoxFromBuildable() → creates Rapier body

Each Frame:
    ↓
1. Rapier physics step (rigid body moves)
2. updateDataTextures() - sync positions/velocities to GPU
3. runMaskPass() - generate mask texture
4. Margolus/liquid shaders check mask → skip masked blocks
5. runForcePass() - rigid body velocity → force texture BA channels
6. Force extraction shader reads force → particles ejected
```

## Coordinate Systems

- **Screen/World Texture**: Y=0 at top, increases downward
- **Rapier Physics**: Y=0 at bottom, increases upward
- **Conversion**: `rapierY = WORLD_SIZE - screenY`

## Key Constants

- `MAX_RIGID_BODIES`: 64 (from PhysicsConfig.ts)
- `GPU_BUILDABLE_TYPE.RIGID_BOX`: 6
- `GPU_BUILDABLE_TYPE.RIGID_CIRCLE`: 7
- Shape encoding: 0 = box, 1 = circle
