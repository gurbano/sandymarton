# Sandymarton – Hybrid GPU + CPU Particle Sandbox

Sandymarton is a real-time particle environment that keeps the core cellular automaton on the GPU while a Rapier.js-powered physics system simulates ballistic particles and rigid bodies on the CPU. The renderer and solver share WebGL textures so high-density materials, temperature transport, and ejecta stay in sync across both execution paths.

---

## Live Demo

Evaluate the latest build at **[https://gurbano.github.io/sandymarton/](https://gurbano.github.io/sandymarton/)**.

---

![Sandymarton Demo](docs/images/screenshot-1.png)
![Sandymarton Features](docs/images/screenshot-2.png)

## Core Capabilities

- **Hybrid simulation pipeline** – Margolus cellular physics, heat transfer, and phase transitions run in GLSL while CPU-side Rapier bodies handle ballistic ejecta and rigid devices.
- **Material model** – More than twenty materials covering static, solid, liquid, and gas phases, each with tuned density, friction, and thermal properties.
- **Rendering pipeline** – Post-processed composition with edge blending, emissive glow, animated liquids, and texture-driven variation.
- **Level IO** – Levels are serialized as PNG textures, enabling deterministic save/load and simple sharing.
- **Interactive tooling** – Canvas painting tools, material palette, and inspector overlays for debugging the simulation state.
- **GPU player simulation** – Optional stick-figure avatar driven by a dedicated shader pass and rendered as an overlay sprite.
- **Rapier physics integration** – GPU extraction and reintegration stages keep CPU-simulated debris synchronized with the world texture, complete with collision meshes rebuilt from the grid.

## Getting Started

```bash
npm install
npm run dev
npm run build
```

The development server runs on Vite with hot module replacement. The production build outputs a static bundle suitable for GitHub Pages deployment.

## Runtime Controls

- **Pointer draw (left click + drag):** spawn the currently selected material.
- **Material selector:** cycle through particle types, including thermal materials.
- **Camera controls:** scroll to zoom, right-click drag to pan, and when the player is active the view smoothly recenters on them.
- **Player toggle (P or status bar button):** spawn/despawn the GPU-driven avatar and enable the associated simulation step.
- **Player settings:** adjust scale, movement speed, jump strength, gravity, and push-out force directly from the status bar tooltip when the player is active.
- **Swimming controls:** when submerged, use `W`/`S`, the arrow keys, or jump to climb or dive—buoyancy and drag cap the maximum swim speed for each fluid.
- **Physics ejecta:** toggle the Physics section to enable Rapier-driven particles, tune gravity, force thresholds, and restitution, and trigger ejections with Force Impulse buildables or scripted events.
- **Load / Save:** import PNG levels or export the current world state.
- **Rendering options:** toggle edge blending, temperature overlays, and post-process filters.

## Documentation

Additional technical detail is available in the [documentation index](docs/README.md):

- [Architecture Overview](docs/architecture.md)
- [Simulation Pipeline](docs/simulation.md)
- [Rendering System](docs/rendering.md)
- [Level System](docs/levels.md)
- [CPU Physics System](docs/physics-cpu.md)

## Technology Stack

- **React 19** with **TypeScript**
- **Three.js** and **React Three Fiber** for scene management
- **WebGL** with custom **GLSL** shader programs
- **Vite** for tooling and bundling

## License

Distributed under the MIT License. See `LICENSE` for details.

## Acknowledgements

References concepts from prior GPU-based cellular automata research and classic falling-sand simulations.
