# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Run Commands

- **Dev server:** `npm run dev` (Vite dev server with HMR)
- **Production build:** `npm run build` (runs `tsc && vite build`, outputs single-file HTML to `dist/`)
- **Preview build:** `npm run preview`
- **Lint:** `npm run lint` (ESLint with TypeScript and Prettier rules)
- **Type check only:** `npx tsc --noEmit`

## Project Overview

Retro arcade space shooter ("MEUSE24 Kinetic-Scan") built with **Phaser 3** and **TypeScript**, bundled with **Vite**. Production builds use `vite-plugin-singlefile` to produce a single self-contained HTML file with all assets inlined.

All game graphics are procedurally generated at runtime via Phaser's `Graphics.generateTexture()` — there are no external image assets. Audio is synthesized via the Web Audio API (no audio files).

## Architecture

### Entry Point & Config
- `src/main.ts` — Creates the `Phaser.Game` instance using config from `gameConfig.ts`. Registers a debounced (250 ms) handler on `resize` and `fullscreenchange` that recalculates dimensions and restarts non-gameplay scenes. During `MainScene`, resize is deferred to the next scene transition.
- `src/gameConfig.ts` — Phaser config with dynamic viewport: `GAME_WIDTH`/`GAME_HEIGHT` (mutable `let` exports) are computed from `window.innerWidth/innerHeight`. Desktop uses 1000 units on the short axis, mobile uses 600 (so objects appear larger on small screens). Uses `Phaser.Scale.FIT` to fill the screen without black bars. Exports `recalculateDimensions()` to recompute from current window size and `applyPendingResize(game)` to apply deferred resizes at scene transitions.

### Scene Flow
Scenes are Phaser's unit of game state. The game flows: **AttractScene** (title/menu) -> **MainScene** (gameplay) -> **GameOverScene** -> back to AttractScene. **PauseScene** and **HelpScene** overlay during gameplay. **BezelScene** runs as a persistent overlay providing a CRT monitor bezel frame.

- `src/AttractScene.ts` — Title screen with attract-mode demo, credit system, 1P/2P start buttons, high scores
- `src/MainScene.ts` — Core gameplay loop: player control, shooting, asteroid spawning, collisions, scoring, power-ups, UFO encounters, 2-player turn switching
- `src/GameOverScene.ts` — Game over screen with high score entry (keyboard, touch swipe/tap, mouse wheel)
- `src/PauseScene.ts` — Pause overlay
- `src/HelpScene.ts` — Controls/help overlay
- `src/BezelScene.ts` — Decorative CRT bezel frame with optional reflection effect

### Game Entities
- `src/Player.ts` — `Player` class (ship movement, input handling for keyboard/mouse/touch, heat system) and `Bullet` class. All textures generated procedurally.
- `src/EnemyManager.ts` — `Enemy` (asteroid) class and `EnemyManager` that handles spawning, fragmentation on destroy, and difficulty scaling
- `src/UFO.ts` — UFO enemy with two variants: `scout` (single-hit, sine-wave movement) and `boss` (multi-hit with segmented energy bar, phase-based attack patterns, dodge AI). Both drawn procedurally with animated tentacles, hull, and antenna

### Systems
- `src/PowerUp.ts` — `PowerUp` sprite class and `PowerUpType` enum (TRIPLE_SHOT, SLOW_MOTION, SHIELD, EMP_WAVE, GHOST_PHASE, WINGMAN_DRONES, BLACK_HOLE)
- `src/PowerUpDirector.ts` — Decides when/what power-ups spawn based on combo streaks, score thresholds, accuracy, and idle time
- `src/ExplosionManager.ts` — Particle emitter pools for asteroid and player death explosions
- `src/AudioManager.ts` — Web Audio API synthesizer for all game sounds (shoot, explode, power-up, UFO hum, etc.)
- `src/SoundManager.ts` — Global mute toggle singleton, persisted to localStorage
- `src/CreditManager.ts` — Arcade-style credit/coin system singleton
- `src/CRTPipeline.ts` — Custom WebGL post-processing shader (scanlines, chromatic aberration, curvature, vignette)

## Code Conventions

- TypeScript strict mode with `noUnusedLocals` and `noUnusedParameters`
- `@typescript-eslint/no-explicit-any` is disabled
- Unused function parameters use `_` prefix (enforced by `argsIgnorePattern: '^_'`)
- Prettier: single quotes, trailing commas, semicolons, 100 char print width, 2-space indent
- Singletons use module-level exported instances (e.g., `export const soundManager`, `export const creditManager`)

## Known Pitfalls

- **Phaser 3 overlap callback argument order**: In Phaser 3.90, `physics.add.overlap(group, sprite, callback)` does NOT guarantee `obj1` = group member and `obj2` = sprite. Always use identity checks: `const bullet = (obj1 === this.ufo ? obj2 : obj1) as Bullet;`
