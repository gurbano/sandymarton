# Simulation Pipeline

The physics pipeline is modular and runs a configurable series of GPU shader passes each frame. By default, six core passes execute sequentially, with an optional force propagation stage available for experiments.

## 1. Margolus Cellular Automata

### Overview

A 2x2 block-based cellular automaton that simulates granular physics. Runs 4 iterations per frame with alternating block parity to avoid grid artifacts.

### Algorithm

**Block Processing:**

```
Frame N (even):     Frame N+1 (odd):
┌──┬──┬──┬──┐      ┌──┬──┬──┬──┐
│ A│ B│ A│ B│      │  │ C│ D│  │
├──┼──┼──┼──┤      ├──┼──┼──┼──┤
│ C│ D│ C│ D│      │  │ C│ D│  │
├──┼──┼──┼──┤  →   ├──┼──┼──┼──┤
│ A│ B│ A│ B│      │  │ C│ D│  │
├──┼──┼──┼──┤      ├──┼──┼──┼──┤
│ C│ D│ C│ D│      │  │ C│ D│  │
└──┴──┴──┴──┘      └──┴──┴──┴──┘
```

### Transition Rules

For each 2×2 block:

```
┌────┬────┐
│ TL │ TR │
├────┼────┤
│ BL │ BR │
└────┴────┘
```

**Toppling Logic:**

1. Identify heavy (solid/liquid) and light (empty/gas) particles
2. Check if configuration is unstable (heavy over light)
3. Apply friction-based probability:
   ```glsl
   float toppleProbability = 1.0 - clamp(
       baseFriction * uFrictionAmplifier,
       0.0, 1.0
   );
   ```
4. Swap positions if random value < probability

**Material-Specific Friction:**

- **Sand**: 0.3 (flows easily)
- **Dirt**: 0.5 (moderate resistance)
- **Gravel**: 0.2 (very loose)
- **Stone**: 1.0 (immovable)

### 4-Iteration Cycle

Each frame runs an even/odd parity cycle. With the default configuration (`passes: 8`), the shader performs two full parity cycles per frame, eliminating directional bias and giving granular materials extra settling time.

## 2. Liquid Spread

### Overview

Specialized shader for horizontal liquid flow. Operates on individual particles rather than blocks.

### Algorithm

For each liquid particle:

1. **Check horizontal neighbors** (left, right)
2. **Identify empty spaces** below neighbors
3. **Select direction**:
   - Deterministic: Choose direction with more empty space
   - Add random variance for natural flow
4. **Probabilistic spread**:
   ```glsl
   float spreadProbability = 1.0 - (baseFriction * uFrictionAmplifier);
   if (random < spreadProbability) {
       swap(center, neighbor);
   }
   ```

### Material-Specific Behavior

**Water** (friction 0.1):

- Spreads rapidly
- Fills containers evenly
- High horizontal mobility

**Lava** (friction 0.4):

- Slower spread
- More viscous behavior
- Moderate horizontal mobility

**Slime** (friction 0.6):

- Very slow spread
- Sticky behavior
- Low horizontal mobility

**Acid** (friction 0.2):

- Fast spread
- Similar to water but slightly slower

### Edge Cases

- **Receiver particle must be empty**
- **Deterministic direction prevents oscillation**
- **Spread only happens if empty space exists below neighbor**

## 3. Archimedes Buoyancy

### Overview

Implements density-based floating and sinking. Lighter materials rise through heavier ones.

### Temperature-Aware Density

Base densities still come from `MaterialDefinitions`, but the shader now offsets them using each material's default temperature and an expansion coefficient:

```glsl
float computeEffectiveDensity(float particleType, float temp) {
   float base = getMaterialDensity(particleType);
   float delta = temp - getMaterialDefaultTemperature(particleType);
   float coeff = chooseCoeffForState(particleType); // higher for gases
   return clamp(base - delta * coeff, base * 0.2, base * 3.5);
}
```

**Expansion coefficients (defaults):**

- **Gases:** `1.4` – very responsive to heat so hot pockets rise quickly.
- **Liquids:** `0.55` – moderate expansion keeps convection noticeable without destabilizing pools.
- **Solids:** `0.18` – subtle effect prevents hot rocks from floating unrealistically.

### Algorithm

For each 2×2 block:

1. **Compute effective density** for every cell using temperature-adjusted values.
2. **Compare columns** (and individual cells) to detect heavier-over-lighter configurations.
3. **Swap if unstable**, with a small tolerance (`~0.25` for liquids, `~0.05` for gases) so slight gradients are enough to trigger convection.

### Behavior Examples

- **Steam over water:** Hot gas now rises faster because the coefficient boosts the density delta.
- **Heated lava columns:** Hotter lava pockets become slightly lighter than cooler neighbors and drift upward rather than sinking back down.
- **Same-material convection:** If water at the bottom warms up by ~6 K more than the top, it will rise even though the base densities match.
- **Cold slabs:** Cooling increases effective density, so chilled liquid sinks and prevents inverted layers from sticking around.

## 4. Ambient Heat Transfer

### Overview

Transfers energy between the heat/force layer texture and nearby particles. This pass models radiation, slow diffusion through air, and global temperature equalization.

### Highlights

- Reads particle emit/absorb properties from material tables.
- Deposits heat to the shared heat texture, which is later used by other passes and overlays.
- Default configuration runs `passes: 2` per frame.

## 5. Particle-Only Heat Diffusion

### Overview

Directly exchanges temperature between immediate particle neighbors without touching the ambient layer. This produces fast conduction through solids and liquids.

### Highlights

- Uses material conductivity to scale heat flow.
- Runs after ambient diffusion so newly emitted heat can immediately spread through dense materials.
- Default configuration runs `passes: 2`.

## 6. Phase Transition

### Overview

Converts particles to new types when their temperature crosses material-specific thresholds (melting, freezing, vaporization).

### Highlights

- Uses `meltingPoint` and `boilingPoint` from `MaterialDefinitions`.
- Example: lava cooling into stone or water boiling into steam.
- Default configuration runs `passes: 1`.

## Optional: Force Transfer

### Overview

Propagates external force vectors stored in the heat/force texture, paving the way for wind or scripted effects. Disabled by default but available for experimentation.

## Temperature & Heat Simulation

### Data Storage

- **Particle State Texture (`DataTexture`)** – Stores particle type in the R channel and 16-bit Kelvin temperature split across G (low byte) and B (high byte). The A channel is reserved for future metadata.
- **Heat/Force Layer (`DataTexture`)** – Holds ambient/environmental temperature in R/G (low/high bytes) and per-pixel force vectors in B/A. This texture is initialized from material defaults and shared with rendering overlays.

### GPU Textures in Flight

- **Particle ping-pong targets:** four `WebGLRenderTarget`s keep the particle state on the GPU while the simulation pipeline runs.
- **Heat ping-pong targets:** two `WebGLRenderTarget`s alternate writes for the ambient heat diffusion shader.
- **Base data textures:** the CPU-visible `worldTexture` and the persistent heat/force layer provide initial data and accept the final read-back for editing/drawing.

### Pass Interaction

1. **Ambient Heat Transfer** reads the latest particle state plus the previous heat layer, emits heat from hot particles into the environment, diffuses it through a 5×5 neighborhood, and gently relaxes toward room temperature before writing into the next heat render target.
2. **Particle-Only Heat Diffusion** operates purely on the particle state, exchanging energy with the four cardinal neighbors. Conductors equalize quickly; insulators move heat slowly.
3. **Phase Transitions** examines the updated particle temperatures and material thresholds to convert particles (e.g., water ⇄ steam, lava → stone).
4. **CPU Sync** occurs once per frame: the final particle render target is read back into the original `worldTexture` so painting tools and level saving see the latest temperatures.

### Material Metadata

- Thermal capacity and conductivity from `MaterialDefinitions` scale how much heat particles emit or absorb.
- Melting/boiling points plus explicit transition maps drive the shader logic for boiling, condensation, and solidification.

### Visualization Hooks

- Rendering overlays tap the live heat render target through a shared ref, enabling particle heat, ambient heat, or force vector visualization without extra GPU reads.

## Pipeline Configuration

### Default Settings

```typescript
{
   frictionAmplifier: 1.3,
   steps: [
      { type: 'margolus-ca', passes: 8, enabled: true },
      { type: 'liquid-spread', passes: 4, enabled: true },
      { type: 'archimedes', passes: 2, enabled: true },
      { type: 'heat-transfer', passes: 2, enabled: true },
      { type: 'particle-only-heat', passes: 2, enabled: true },
      { type: 'phase-transition', passes: 1, enabled: true },
      { type: 'force-transfer', passes: 1, enabled: false }
   ]
}
```

### Adjustable Parameters

**Friction Amplifier** (0.0 - 10.0):

- Multiplies base friction for all materials.
- Higher values = slower movement.
- Lower values = more fluid behavior.

**Pass Counts** (per step):

- Increase Margolus passes for smoother sand settling.
- Increase liquid spread for faster fluid leveling.
- Increase heat diffusion for quicker thermal equalization.

## Performance Characteristics

- **Margolus**: O(n/4) per iteration (processes 2×2 blocks).
- **Liquid Spread**: O(n) (evaluates every pixel).
- **Archimedes**: O(n) (vertical swaps per pixel).
- **Heat passes**: O(n) (local diffusion per pixel).
- **Phase Transition**: O(n) (single lookup per pixel).

For the default `WORLD_SIZE = 1024`, each full-frame update touches ~1.05M pixels per pass. Even with the extended pipeline, the GPU handles the work comfortably at 60 fps on mid-range hardware thanks to parallel fragment shaders.

## Known Limitations

1. **No diagonal movement** in Margolus (2×2 blocks only).
2. **Liquid spread** only handles horizontal flow; vertical pressure simulation is still simplified.
3. **No full fluid dynamics** (pressure fields, vortices).
4. **Material reactions** are limited (no chemical mixing aside from phase changes).
5. **Force transfer** is experimental and disabled by default.

## Future Improvements

- [ ] Diagonal flow for liquids.
- [ ] Pressure simulation.
- [ ] Material reactions (water + lava = stone).
- [ ] Advanced convection models using velocity fields.
- [ ] Gas dispersion improvements.
