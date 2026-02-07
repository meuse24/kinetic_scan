# MEUSE24 Kinetic-Scan

**MEUSE24 Kinetic-Scan** is a fast-paced, retro-style arcade space shooter built with Phaser 3 and TypeScript. Experience classic 8-bit aesthetic combined with modern gameplay mechanics and procedural generation.

![Build Status](https://img.shields.io/badge/build-passing-brightgreen)
![Version](https://img.shields.io/badge/version-0.0.0-blue)
![Platform](https://img.shields.io/badge/platform-Web-orange)

## 🚀 Features

### Core Gameplay
- **Retro Arcade Experience:** Inspired by classic vector shooters with a modern twist.
- **Procedural Asteroids:** Irregularly shaped hazards that shatter into smaller fragments upon destruction.
- **Combat & Heat System:** Manage your weapon's heat to avoid overheating while blasting through asteroid fields.
- **Juicy VFX:** Particle-based explosions, dynamic camera shake, and a CRT post-processing shader for that authentic arcade feel.

### Advanced Systems
- **Universal Input:** Play with Keyboard, Mouse, or Touch. 
- **Adaptive Layout:**
  - **Desktop:** Optimized 1000-unit base on the short axis, aspect-ratio-aware.
  - **Mobile:** 600-unit base so game objects appear larger on small screens.
  - **Dynamic Viewport:** Dimensions recalculate automatically on browser resize, device rotation, and fullscreen transitions. During gameplay, resize is deferred to the next scene transition to avoid disrupting play.
- **Synthetic Audio:** Pure Web Audio API generated sounds — no external assets required.
- **Power-up System:** 8 unique power-ups including EMP Waves, Black Holes, Triple Shot, and Homing Missiles.
- **Multiplayer:** Authentic turn-based 2-player mode.

## 🛠 Tech Stack
- **Engine:** [Phaser 3](https://phaser.io/)
- **Language:** TypeScript
- **Build Tool:** Vite
- **Deployment:** Single-file HTML builds (bundled JS/CSS/Assets)

## 🕹 Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) (Latest LTS recommended)

### Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/meuse24/kinetic_scan.git
   cd space-shooter
   ```
2. Install dependencies:
   ```bash
   npm install
   ```

### Development
Start the development server:
```bash
npm run dev
```

### Build
Generate a single-file production build in the `dist` folder:
```bash
npm run build
```

## 🎮 Controls
- **Desktop:** 
  - **Move:** Arrow keys or WASD
  - **Fire:** Space or Left-click
  - **Pause:** P or Esc
- **Mobile:**
  - **Move:** Drag anywhere (relative control)
  - **Fire:** Auto-fires while touching
  - **Touchpad:** Dedicated area below the screen for precise steering

## 📄 License
MIT License - Copyright (c) 2026 MEUSE24

---
*Built with ❤️ and Gemini CLI.*
