# Rendering System

The rendering pipeline transforms particle state data into a visually appealing display through multiple post-processing passes.

## Pipeline Overview

```
State Texture (RGBA: type, vx, vy, data)
    ↓
Base Color Shader
    ↓
Color Texture (RGB colors)
    ↓
Edge Blending (optional)
    ↓
Material Variation (optional)
    ↓
Final Rendering + Liquid Animation
    ↓
Display Canvas
```

## Base Color Shader

### Purpose
Converts particle type IDs to base RGB colors.

### Implementation
```glsl
vec4 getParticleColor(float particleType) {
  if (particleType >= 0.0 && particleType < 1.0) {
    return vec4(0.0, 0.0, 0.0, 0.0); // Empty
  }
  if (particleType >= 17.0 && particleType < 18.0) {
    return vec4(0.4, 0.4, 0.4, 1.0); // Stone
  }
  // ... more materials
}
```

Auto-generated from `ParticleColors` definition.

### Color Palette

| Material | RGB | Hex |
|----------|-----|-----|
| Empty | (0, 0, 0) | #000000 |
| Stone | (102, 102, 102) | #666666 |
| Sand | (194, 178, 128) | #C2B280 |
| Dirt | (139, 90, 43) | #8B5A2B |
| Gravel | (169, 169, 169) | #A9A9A9 |
| Water | (64, 164, 223) | #40A4DF |
| Lava | (255, 69, 0) | #FF4500 |
| Slime | (127, 255, 0) | #7FFF00 |
| Acid | (173, 255, 47) | #ADFF2F |

## Post-Processing Effects

### 1. Edge Blending

**Purpose:** Smooths boundaries between different materials.

**Algorithm:**
```glsl
// Sample 3×3 neighborhood
vec4 center = texture(uColorTexture, uv);
vec4 neighbors[8]; // TL, T, TR, L, R, BL, B, BR

// Check if at material boundary
bool isEdge = any(neighbors != center);

if (isEdge) {
  // Average with neighbors
  vec4 blended = mix(center, avgNeighbors, uBlendStrength);
  return blended;
}
```

**Parameters:**
- `blendStrength` (0.0 - 1.0): Blend intensity
  - 0.0 = No blending
  - 0.5 = Subtle smoothing (default)
  - 1.0 = Maximum smoothing

**Effect:**
- Reduces pixelation at material boundaries
- Creates softer, more organic appearance
- Most visible at zoomed-in views

### 2. Material Variation

**Purpose:** Adds natural texture variation using fractal noise.

**Algorithm:**
```glsl
// FBM (Fractal Brownian Motion) noise
float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  float frequency = 1.0;

  for (int i = 0; i < 4; i++) {
    value += amplitude * noise(p * frequency);
    amplitude *= 0.5;
    frequency *= 2.0;
  }

  return value;
}

// Apply to color
float variation = fbm(worldCoord * uNoiseScale);
vec3 color = baseColor * (1.0 + variation * uNoiseStrength);
```

**Parameters:**
- `noiseScale` (0.5 - 10.0): Detail level
  - Low = Large patterns
  - High = Fine detail
  - Default: 4.0
- `noiseStrength` (0.0 - 1.0): Effect intensity
  - 0.0 = Uniform color
  - 0.15 = Subtle variation (default)
  - 1.0 = Strong variation

**Effect:**
- Breaks up flat color regions
- Simulates natural material texture
- Adds visual interest without changing simulation

## Liquid Animation

**Purpose:** Adds dynamic, flowing appearance to liquids.

**Algorithm:**
```glsl
if (particleType >= 64.0 && particleType < 112.0) {
  // Dual-layer smooth noise
  vec2 noiseCoord1 = worldCoord * 0.05 + vec2(uTime * 0.3, uTime * 0.2);
  float n1 = smoothNoise(noiseCoord1);

  vec2 noiseCoord2 = worldCoord * 0.08 - vec2(uTime * 0.2, uTime * 0.25);
  float n2 = smoothNoise(noiseCoord2);

  float combined = (n1 + n2) * 0.5;

  // Brightness variation (±8%)
  float brightness = 0.92 + combined * 0.16;
  color.rgb *= brightness;

  // Subtle color shift
  float colorShift = (combined - 0.5) * 0.04;
  color.rgb += vec3(colorShift);
}
```

**Features:**
- Two noise layers moving in different directions
- Time-based animation for flowing effect
- Subtle enough to not distract from simulation
- Applied after post-processing

**Performance:**
- Runs on final display shader
- No extra render passes needed
- Negligible performance impact

## Final Renderer

### Coordinate Mapping

```glsl
// Canvas pixel → Particle coordinate
vec2 pixelCoord = vUv * uCanvasSize;
vec2 particleCoord = floor(pixelCoord / uPixelSize);

// Apply pan/zoom
vec2 viewCenter = vec2(particlesInView) / 2.0;
vec2 worldParticleCoord = particleCoord - viewCenter + uCenter;

// Convert to texture UV [0, 1]
vec2 texUV = (worldParticleCoord + WORLD_SIZE/2) / uTextureSize;
```

### Zoom System

**Pixel Size Parameter:**
- 1.0 = Each particle is 1×1 screen pixel
- 2.0 = Each particle is 2×2 screen pixels (zoomed in)
- 0.5 = Each particle is 0.5×0.5 screen pixels (zoomed out)

**Pan System:**
- `uCenter` = World coordinates of view center
- Updated by drag interactions
- Clamped to world boundaries

### Out-of-Bounds Rendering

```glsl
if (texUV.x < 0.0 || texUV.x > 1.0 ||
    texUV.y < 0.0 || texUV.y > 1.0) {
  // Dark checkered pattern
  float gridSize = 32.0;
  float grid = mod(
    floor(worldCoord.x / gridSize) +
    floor(worldCoord.y / gridSize),
    2.0
  );
  vec3 gridColor = mix(
    vec3(0.05, 0.05, 0.08),
    vec3(0.08, 0.08, 0.12),
    grid
  );
  return vec4(gridColor, 1.0);
}
```

## Render Configuration

### Default Settings
```typescript
{
  effects: [
    { type: 'edge-blending', enabled: true },
    { type: 'material-variation', enabled: true }
  ],
  edgeBlending: {
    blendStrength: 0.5
  },
  materialVariation: {
    noiseScale: 4.0,
    noiseStrength: 0.15
  }
}
```

### Performance Impact

| Effect | GPU Cost | Visual Impact |
|--------|----------|---------------|
| Base Colors | Low | Required |
| Edge Blending | Medium | High at zoom |
| Material Variation | Medium | Medium overall |
| Liquid Animation | Low | High for liquids |

**Optimization Tips:**
- Disable effects on low-end GPUs
- Reduce noise quality for better performance
- Use lower blend strength for faster rendering

## Visual Quality Comparison

### Without Post-Processing
- Flat colors
- Sharp pixel boundaries
- Static appearance
- Fast rendering

### With Post-Processing
- Textured materials
- Smooth transitions
- Animated liquids
- Slightly slower rendering

## Future Enhancements

- [ ] **Bloom** - Glow effect for lava, acid
- [ ] **Particle Overlays** - Sparkles, steam wisps
- [ ] **Custom Backgrounds** - Gradients, images
- [ ] **Lighting** - Simple ambient/directional lighting
- [ ] **Shadows** - Soft shadows for depth
