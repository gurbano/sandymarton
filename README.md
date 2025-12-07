# Sandy2 - GPU-Accelerated Particle Simulation

A real-time particle simulation using Margolus cellular automata running entirely on the GPU via WebGL shaders.

---

## 🎮 **[Try the Live Demo →](https://gurbano.github.io/sandymarton/)**

---

![Sandy2 Demo](docs/images/screenshot-1.png)
![Sandy2 Features](docs/images/screenshot-2.png)

> *Screenshots coming soon*

## ✨ Features

- **GPU-Accelerated Physics** - Entire simulation runs on GPU using GLSL shaders
- **Multiple Materials** - Sand, water, stone, dirt, gravel, liquids (water, lava, slime, acid), and more
- **Realistic Dynamics** - Material-specific friction, buoyancy, and liquid flow
- **Advanced Rendering** - Edge blending, material variation, animated liquids
- **Level System** - Load and save custom levels as PNG textures
- **Interactive Drawing** - Paint particles directly onto the canvas

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Build for production
npm run build
```

## 🎯 Controls

- **Left Click + Drag** - Draw particles
- **Material Selector** - Choose particle type
- **Load/Save Levels** - Import and export custom worlds
- **Rendering Effects** - Toggle edge blending and material variation

## 📚 Documentation

For detailed technical information, see the [documentation](docs/README.md):
- [Architecture Overview](docs/architecture.md)
- [Simulation Pipeline](docs/simulation.md)
- [Rendering System](docs/rendering.md)
- [Level System](docs/levels.md)

## 🛠️ Tech Stack

- **React 19** + **TypeScript**
- **Three.js** + **React Three Fiber**
- **WebGL** + **GLSL Shaders**
- **Vite**

## 📝 License

MIT

## 🙏 Credits

Built with inspiration from GPU-based cellular automata and falling sand simulations.
