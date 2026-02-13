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

All game graphics are procedurally generated at runtime via Phaser's `Graphics.generateTexture()` — there are no external image assets.  
Audio is hybrid:
- gameplay SFX and diegetic effects are synthesized in `AudioManager` (Web Audio API),
- BGM loops are file-based (`src/song.mp3` for menu-like scenes and `gameloop.mp3` for active gameplay).

## Architecture

### Entry Point & Config

- `src/main.ts` — Creates the `Phaser.Game` instance using config from `gameConfig.ts`. Registers a debounced (250 ms) handler on `resize` and `fullscreenchange` that recalculates dimensions and restarts non-gameplay scenes. During `MainScene`, resize is deferred to the next scene transition.
- `src/gameConfig.ts` — Phaser config with dynamic viewport: `GAME_WIDTH`/`GAME_HEIGHT` (mutable `let` exports) are computed from `window.innerWidth/innerHeight`. Desktop uses 1000 units on the short axis, mobile uses 600 (so objects appear larger on small screens). Uses `Phaser.Scale.FIT` to fill the screen without black bars. Exports `recalculateDimensions()` to recompute from current window size and `applyPendingResize(game)` to apply deferred resizes at scene transitions. Build-time alias maps `phaser` to `phaser/dist/phaser-arcade-physics.min.js` to keep the engine chunk smaller while preserving Arcade Physics.
- `src/BootScene.ts` — Boot/title scene that now lazy-loads runtime gameplay scenes (`MainScene`, `PauseScene`, `HelpScene`, `GameOverScene`) on first start to reduce initial JS payload.

### Scene Flow

Scenes are Phaser's unit of game state. The game flows: **BootScene** (startup/lazy-loader) -> **AttractScene** (title/menu) -> **MainScene** (gameplay) -> **GameOverScene** -> back to AttractScene. **PauseScene** and **HelpScene** overlay during gameplay. **BezelScene** runs as a persistent overlay providing a CRT monitor bezel frame.

- `src/AttractScene.ts` — Title screen with attract-mode demo, credit system, 1P/2P start buttons, high scores, daily challenge button, live server stats block (`TOTAL USERS`, `COINS USED`), and occasional demo UFO shots
- `src/MainScene.ts` — Core gameplay loop: player control, shooting, asteroid spawning, collisions, scoring, power-ups, UFO encounters, scout-UFO astronaut rescue bursts (2-3 astronauts ejected on scout kill), 2-player turn switching, combo system, perk integration, swarm spawning, boss modifiers, score milestones, tutorial hints, daily challenge mode, mine-layer deploy input (`M` or double-click/double-tap with charges; each run starts with 2), debug bunker trigger (`B`)
- `src/GameOverScene.ts` — Game over screen with high score entry (keyboard, touch swipe/tap, mouse wheel), separate daily challenge leaderboard
- `src/PauseScene.ts` — Pause overlay with sound toggle and master/SFX/BGM volume sliders
- `src/HelpScene.ts` — Controls/help overlay with scrollable content, `BACK (ESC/H)`, and a dedicated click hit-area for reliable pointer input
- `src/BezelScene.ts` — Decorative CRT bezel frame with optional reflection effect

### Game Entities

- `src/Player.ts` — `Player` class (ship movement, input handling for keyboard/mouse/touch, heat system) and `Bullet` class. All textures generated procedurally.
- `src/EnemyManager.ts` — `Enemy` (asteroid) class and `EnemyManager` that handles spawning, fragmentation on destroy, and difficulty scaling
- `src/UFO.ts` — UFO enemy with two variants: `scout` (single-hit, sine-wave movement) and `boss` (multi-hit with segmented energy bar, phase-based attack patterns, dodge AI, boss modifiers: shielded/summoner/berserk/armored). Both drawn procedurally with animated tentacles, hull, and antenna
  - `src/entities/ufo/UFOCombatSystem.ts` — Manages UFO hit points, boss phases (1/2/3 based on HP ratio), damage calculation with modifiers (armored: 50% damage reduction, shielded: HP regeneration, berserk: speed boost), and display HP smoothing
  - `src/entities/ufo/UFOMovementSystem.ts` — Handles scout sine-wave movement and boss dodge AI with bullet evasion. Pure logic with no Phaser dependencies for testability (custom math helpers, EvasionThreats interface)

### Systems

- `src/PowerUp.ts` — `PowerUp` sprite class and `PowerUpType` enum (TRIPLE_SHOT, SLOW_MOTION, SHIELD, EMP_WAVE, GHOST_PHASE, WINGMAN_DRONES, CANNON_COOLING, BLACK_HOLE, SHIELD_BUNKER, MINE_LAYER)
- `src/PowerUpDirector.ts` — Decides when/what power-ups spawn based on combo streaks, score thresholds, accuracy, and idle time
- `src/ComboManager.ts` — Combo kill tracking with configurable timeout window, multiplier tiers, and score popup integration
- `src/PerkSystem.ts` — Rogue-lite perk registry (13 perks, including `MINE STOCK`) with stacking logic, state save/load, and modifier getters
- `src/PerkSelectScene.ts` — Post-boss overlay showing 3 random perk cards; keyboard (1/2/3) or click selection with 15s auto-timeout
- `src/StatsManager.ts` — Persistent lifetime stats (kills, deaths, boss kills, combo, level, playtime, total score) and 5 unlockable ship skins via localStorage
- `src/MainSceneTuning.ts` — Central tuning constants for transitions, early-level ramp, spawn protection, background decor, shield bunker timing/layout, swarm spawning, score milestones, and scout-UFO astronaut burst/glide behavior
- `src/ExplosionManager.ts` — Particle emitter pools for asteroid and player death explosions
- `src/AudioManager.ts` — Web Audio API synthesizer for all game sounds (shoot, explode, power-up, UFO hum, milestone sting, etc.)
- `src/MusicManager.ts` — BGM controller for scene-specific loops (`song.mp3` in menu-like scenes, `gameloop.mp3` during gameplay at reduced volume so SFX remain dominant)
- `src/SoundManager.ts` — Global mute/unmute toggle + per-channel volume (master/SFX/BGM) singleton, persisted to localStorage
- `src/CreditManager.ts` — Arcade-style credit/coin system singleton
- `src/RemoteStatsService.ts` — Client-side service for optional PHP stats API sync (lazy snapshots, pending-event queue, offline retry)
- `src/DebugSettings.ts` — Persisted debug-overlay toggle state used by scene settings menus
- `src/CRTPipeline.ts` — Custom WebGL post-processing shader (scanlines, chromatic aberration, curvature, vignette)

### Manager Architecture (Refactored 2026)

MainScene was originally a 5,287-line "God Class" handling all gameplay logic. A comprehensive refactoring extracted specialized managers using dependency injection and callback patterns:

- **`src/managers/CollisionManager.ts`** — Collision handler registration and coordination. Handles 15+ collision types (bullets vs enemies/UFO/bunkers, player vs enemies/powerups/projectiles/astronauts, mines vs threats). CRITICAL: Implements identity checks to work around Phaser 3.90 overlap callback argument-order bug (arguments can be swapped).

- **`src/systems/MainWorldEvents.ts`** — Wormhole, Elite Drone, Swarm, and astronaut world-event coordination. Scout UFO kills trigger `2-3` astronaut burst spawns that are updated/rescued individually via pooled sprites.

- **`src/managers/HUDManager.ts`** — HUD rendering and update logic (scores, lives, level, power-up bar, heat bar, mine charges, boss energy, combo, perks, active player markers). Implements change-detection optimization with cached state to minimize unnecessary text updates.

- **`src/managers/PowerUpManager.ts`** — Power-up timer management, activation/deactivation coordination. Delegates entity spawning (Drones, Black Hole, Shield Bunkers) to callbacks. State sync for 2-player mode. Handles instant power-ups (MINE_LAYER, EMP_WAVE) and timed effects (TRIPLE_SHOT, SHIELD, etc.).

- **`src/ui/UIComponentFactory.ts`** — Reusable UI component factory. Eliminates ~300 lines of duplicated volume slider code across AttractScene, GameOverScene, and PauseScene. Creates interactive sliders with drag, click-to-seek, and real-time value updates.

- **`src/scenes/ModalOverlay.ts`** — Base class for modal overlay scenes (Pause, Help, PerkSelect). Provides semi-transparent background, scene parallax, CRT pipeline setup, BezelScene management, and optional input blocking of underlying scene.

All managers are tested with Vitest (153 tests across 7 test suites). Manager callbacks delegate back to MainScene methods to keep entity-specific logic centralized while extracting coordination concerns.

## Optional Server API

- Endpoint: `public/api/stats.php` (copied to `dist/api/stats.php` by Vite public-copy step).
- Runtime data file: `public/api/data/stats.runtime.json` (server writable).
- Modes: `normal` and `daily`.
- Snapshot includes highscores, `coinsSpent`, `totalUsers` (all-time), `activeUsers` (rolling last 30), and `updatedAt`.
- Client fallback behavior:
  - game flow is never blocked if API is unavailable,
  - pending POST events are buffered in localStorage and retried automatically.

## Browser Translation Metadata

- `index.html` is intentionally English-first (`lang="en"`).
- To reduce Edge/Chromium translation prompts:
  - `translate="no"` is set on `<html>` and `<body>`,
  - `meta name="google" content="notranslate"` is present,
  - `Content-Language` is declared as `en,de` for deployment metadata context.

## Code Conventions

- TypeScript strict mode with `noUnusedLocals` and `noUnusedParameters`
- `@typescript-eslint/no-explicit-any` is disabled
- Unused function parameters use `_` prefix (enforced by `argsIgnorePattern: '^_'`)
- Prettier: single quotes, trailing commas, semicolons, 100 char print width, 2-space indent
- Singletons use module-level exported instances (e.g., `export const soundManager`, `export const creditManager`)

## Known Pitfalls

- **Phaser 3 overlap callback argument order**: In Phaser 3.90, `physics.add.overlap(group, sprite, callback)` does NOT guarantee `obj1` = group member and `obj2` = sprite. Always use identity checks: `const bullet = (obj1 === this.ufo ? obj2 : obj1) as Bullet;`
- **Overlay input conflicts**: When opening modal-like scenes (Help/Pause), the underlying scene can still contain interactive UI. If pointer clicks feel unreliable, ensure the return scene input is disabled while the overlay is active and restored on shutdown.
