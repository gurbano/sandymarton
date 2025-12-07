# Simulation Pipeline

The physics simulation consists of three main passes, executed sequentially each frame.

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

Each frame runs 4 Margolus iterations:
- Iteration 0: Even parity
- Iteration 1: Odd parity
- Iteration 2: Even parity
- Iteration 3: Odd parity

This eliminates directional bias and creates smoother movement.

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

### Density Values

```typescript
Empty:  0.0  // Void
Gas:    0.3  // Steam, smoke
Liquid: 1.0  // Water, lava, slime, acid
Solid:  2.0  // Sand, dirt, gravel
Static: 3.0  // Stone (immovable)
```

### Algorithm

For each particle:

1. **Check particle below**
2. **Compare densities**
3. **Swap if unstable** (heavy over light):
   ```glsl
   if (densityTop > densityBottom) {
       swap(top, bottom);
   }
   ```

### Behavior Examples

- **Steam rises through water**: Gas (0.3) < Liquid (1.0)
- **Sand sinks in water**: Solid (2.0) > Liquid (1.0)
- **Water floats on empty**: Liquid (1.0) > Empty (0.0)
- **Stone never moves**: Static (3.0) is immovable

## Pipeline Configuration

### Default Settings
```typescript
{
  margolusIterations: 4,
  frictionAmplifier: 1.0,
  liquidSpreadEnabled: true,
  archimedesEnabled: true
}
```

### Adjustable Parameters

**Friction Amplifier** (0.0 - 10.0):
- Multiplies base friction for all materials
- Higher values = slower movement
- Lower values = more fluid behavior

**Iteration Count** (1 - 8):
- More iterations = smoother physics
- Fewer iterations = faster but choppier
- Default: 4 (good balance)

## Performance Characteristics

- **Margolus**: O(n/4) per iteration (processes blocks)
- **Liquid Spread**: O(n) (processes all particles)
- **Archimedes**: O(n) (processes all particles)

**Total per frame**: 4 × (n/4) + n + n ≈ 3n operations

For 2048×2048 world: ~12.6M operations per frame at 60 fps = **756M ops/sec**

## Known Limitations

1. **No diagonal movement** in Margolus (2×2 blocks only)
2. **Liquid spread** only handles horizontal flow
3. **No fluid dynamics** (pressure, flow velocity)
4. **Material interactions** are simple (no mixing, reactions)
5. **Temperature** not simulated

## Future Improvements

- [ ] Diagonal flow for liquids
- [ ] Pressure simulation
- [ ] Material reactions (water + lava = stone)
- [ ] Temperature gradients
- [ ] Gas dispersion
