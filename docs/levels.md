# Level System

Sandy2 includes a level system for loading and saving custom particle worlds using PNG textures.

## Overview

Levels are stored as:

- **JSON metadata**: Level name, description, texture paths
- **PNG texture**: Particle state data (types, velocities)

Each level resides in its own folder under `public/levels/`.

## Directory Structure

```
public/levels/
├── index.json          # List of all available levels
├── empty/
│   ├── level.json      # Empty level metadata
│   └── particles.png   # Empty level texture
└── sandbox/
    ├── level.json      # Sandbox level metadata
    └── particles.png   # Sandbox level texture
```

## File Formats

### index.json

Lists all available levels for the UI dropdown.

```json
{
  "levels": [
    {
      "id": "empty",
      "name": "Empty World",
      "description": "A blank canvas to start creating",
      "textures": {
        "particles": "particles.png"
      }
    },
    {
      "id": "sandbox",
      "name": "Sandbox",
      "description": "A simple sandbox level with some materials",
      "textures": {
        "particles": "particles.png"
      }
    }
  ]
}
```

### level.json

Metadata for a specific level.

```json
{
  "id": "sandbox",
  "name": "Sandbox",
  "description": "A simple sandbox level with some materials",
  "textures": {
    "particles": "particles.png"
  }
}
```

**Fields:**

- `id`: Unique identifier (used in folder name)
- `name`: Display name in UI
- `description`: Optional description
- `textures.particles`: Filename of particle texture PNG

### particles.png

PNG image storing particle state data.

**Format:**

- Size: 1024×1024 pixels (matches `WORLD_SIZE`)
- Color Mode: RGBA (8-bit per channel)
- Compression: PNG (lossless)

**Channel Mapping:**

- **R**: Particle type (0-255)
- **G**: Velocity X (0-255, maps to -128 to +127)
- **B**: Velocity Y (0-255, maps to -128 to +127)
- **A**: Unused (set to 255)

**File Size:** ~10-15 KB (with PNG compression)

## Loading Levels

### User Flow

1. User selects level from dropdown
2. Click "Load" button
3. Level loads and simulation resets

### Implementation

```typescript
// Load level index
const index = await loadLevelIndex();

// Load specific level
const { metadata, particleTexture } = await loadLevel('sandbox');

// Initialize world from texture
const newTexture = worldGen.initFromTexture(particleTexture);
setWorldTexture(newTexture);
```

### Loading Process

1. **Fetch level metadata** from `levels/{id}/level.json`
2. **Fetch PNG texture** from `levels/{id}/particles.png`
3. **Load PNG to Image element**
4. **Draw to canvas** (with `imageSmoothingEnabled: false`)
5. **Extract pixel data** as Uint8Array
6. **Create DataTexture** for GPU
7. **Initialize world** with texture data

**Critical:** Image smoothing must be disabled to prevent interpolation of particle type values.

```typescript
ctx.imageSmoothingEnabled = false; // Prevent color interpolation
```

## Saving Levels

### User Flow

1. Create custom world by drawing particles
2. Click "Save" button
3. Enter level name and description
4. Downloads JSON and PNG files

### Implementation

```typescript
// Save current world
saveLevel(worldTexture, 'My Level', 'A cool custom level');

// Downloads:
// - my-level_level.json
// - my-level_particles.png
```

### Saving Process

1. **Read texture data** from GPU (via `gl.readPixels`)
2. **Create canvas** with texture size
3. **Write pixel data** to canvas
4. **Export as PNG** blob
5. **Create JSON metadata**
6. **Trigger downloads** for both files

**Output Files:**

- `{id}_level.json` - Metadata
- `{id}_particles.png` - Texture

## Creating Custom Levels

### Programmatic Generation

Use the level generation script:

```bash
node scripts/generateLevelTextures.mjs
```

**Example:**

```javascript
// Create canvas
const canvas = createCanvas(WORLD_SIZE, WORLD_SIZE);
const ctx = canvas.getContext('2d');
const imageData = ctx.createImageData(WORLD_SIZE, WORLD_SIZE);

// Set pixel
const setPixel = (x, y, type) => {
  const offset = (y * WORLD_SIZE + x) * 4;
  imageData.data[offset] = type; // Particle type
  imageData.data[offset + 1] = 128; // Velocity X (0)
  imageData.data[offset + 2] = 128; // Velocity Y (0)
  imageData.data[offset + 3] = 255; // Alpha
};

// Draw structures
fillRect(100, 100, 50, 50, SAND_TYPE);
fillRect(200, 200, 100, 10, STONE_TYPE);

// Save PNG
const buffer = canvas.toBuffer('image/png');
writeFileSync('public/levels/custom/particles.png', buffer);
```

### Manual Creation

1. Create level folder: `public/levels/{id}/`
2. Create `level.json` with metadata
3. Create `particles.png`:
   - Use image editor (GIMP, Photoshop)

- Set size to 1024×1024 (or match your configured `WORLD_SIZE`)
- Use exact RGB values for particle types
- Save as PNG (no compression artifacts)

4. Add to `index.json`

## Particle Type Values

When creating PNG textures, use these exact R channel values:

| Type | R Value | Material                   |
| ---- | ------- | -------------------------- |
| 0    | 0       | Empty                      |
| 17   | 17      | Stone                      |
| 18   | 18      | Glass                      |
| 19   | 19      | Heite (hot static emitter) |
| 35   | 35      | Sand                       |
| 37   | 37      | Dirt                       |
| 39   | 39      | Gravel                     |
| 40   | 40      | Copper                     |
| 41   | 41      | Ite (insulator)            |
| 42   | 42      | Ice                        |
| 43   | 43      | Oil Sludge                 |
| 44   | 44      | Slime Crystal              |
| 45   | 45      | Acid Crystal               |
| 46   | 46      | Coolant Ice                |
| 47   | 47      | Nitrogen Ice               |
| 65   | 65      | Water                      |
| 80   | 80      | Lava                       |
| 96   | 96      | Slime                      |
| 97   | 97      | Acid                       |
| 98   | 98      | Oil                        |
| 99   | 99      | Coolant                    |
| 100  | 100     | Liquid Nitrogen            |
| 113  | 113     | Steam                      |
| 128  | 128     | Smoke                      |
| 144  | 144     | Air                        |
| 145  | 145     | Nitrogen                   |
| 146  | 146     | Oil Vapor                  |
| 147  | 147     | Slime Vapor                |
| 148  | 148     | Acid Vapor                 |
| 149  | 149     | Coolant Vapor              |

**G and B channels:** Set to 128 (zero velocity)
**A channel:** Set to 255 (opaque)

## Example Levels

### Empty Level

Completely blank world - all particles set to type 0 (Empty).

**Use Case:** Starting from scratch

### Sandbox Level

Pre-built playground with:

- 4 liquid pools at top (water, lava, slime, acid)
- Open-top pools allowing particles to fall in
- 3 platforms with different granular materials (sand, dirt, gravel)
- Scattered decorative structures
- Stone border around world edge

**Use Case:** Experimenting with material interactions

## Advanced Features

### Future Enhancements

- [ ] **Multiple textures per level**
  - Temperature overlay
  - Pressure overlay
  - Force fields

- [ ] **Level metadata extensions**
  - Initial camera position
  - Simulation settings
  - Custom color palettes

- [ ] **Level sharing**
  - Export as single file
  - Import from URL
  - Level browser/gallery

- [ ] **Animated levels**
  - Particle spawners
  - Moving platforms
  - Timed events

## Technical Notes

### PNG vs Raw Formats

**Why PNG?**

- Lossless compression (20 KB vs 16 MB raw)
- Human-readable in image editors
- Easy to version control
- Browser-native loading

**Alternatives considered:**

- Raw binary: Too large, no browser support
- JPEG: Lossy compression breaks particle types
- WebP: Not fully compatible with all browsers

### Coordinate System

- Origin (0, 0) at **bottom-left**
- X increases **right**
- Y increases **up**

This matches the WebGL coordinate system.

### Loading Performance

- **Fetch time**: 50-100ms (network)
- **PNG decode**: 100-200ms (browser)
- **Canvas processing**: 50-100ms (CPU)
- **GPU upload**: 10-20ms

**Total:** 200-400ms per level load
