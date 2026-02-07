# Space Shooter (Phaser 3)

Arcade-style space shooter built with Phaser 3 + TypeScript.  
Fight asteroid waves, collect power-ups, and clear levels by defeating a mandatory boss UFO at the end of each level.

## Highlights

- Phaser 3 game loop with Arcade Physics and responsive viewport scaling.
- Difficulty presets: `EASY`, `NORMAL`, `HARD` (affects enemies, drops, UFO pressure, and level curve).
- Two UFO variants:
  - `Scout`: light pressure, occasional aimed shots, single-hit destroy.
  - `Boss`: procedural animated silhouette with tentacles, 3-phase escalation (attack patterns intensify as health drops), dodge AI that reads incoming bullet trajectories, multi-hit energy bar with segmented display and hit-count label.
- Level progression with transition overlay between levels (`LEVEL N`, `3, 2, 1, GO!`).
- Mandatory boss phase at level end before level can advance.
- Dynamic bullet-pressure controls:
  - adaptive bullet cap,
  - collision-hit coalescing for mass scenes.
- Enhanced ship visuals and power-up readability (thruster + effect overlays).

## Power-Ups

- `TRI` (Triple Shot): 3-way spread.
- `SLO` (Slow Motion): slows world pacing.
- `SHD` (Shield): absorbs one hit.
- `EMP` (EMP Wave): heavy crowd-clear utility.
- `GST` (Ghost Phase): temporary intangibility.
- `DRN` (Wingman Drones): support fire.
- `CLG` (Cannon Cooling): no heat build-up; thruster flame shifts to icy white.
- `BLK` (Black Hole): gravity-like control effect.

## Controls

### In-game

- Move: `Arrow Keys` or pointer/touch drag.
- Fire: hold `Space` or pointer.
- Pause: UI button / scene controls.
- Help: `H`.

### Attract / Game Over

- Insert coin: `I`.
- Start game: `1`, `2`, `Enter`, `Space`.
- Change difficulty: `A/D` or `Left/Right`.

## Development

```bash
npm install
npm run dev
```

Build/lint:

```bash
npm run lint
npm run build
```

Preview production build:

```bash
npm run preview
```

## Capture / Automation Notes

For headless capture stability, renderer can be forced to canvas:

- `?renderer=canvas`
- `?capture=1`

Automation helpers are exposed on `window`:

- `render_game_to_text()`
- `advanceTime(ms)`

## Project Structure

- `src/main.ts`: entry + automation hooks.
- `src/gameConfig.ts`: renderer/scaling configuration.
- `src/MainScene.ts`: core gameplay loop (player, enemies, level/boss flow, overlays).
- `src/UFO.ts`: scout/boss UFO logic, procedural visuals (animated tentacles, hull, energy bar), projectile volleys.
- `src/Player.ts`: player movement/fire/heat + visual indicators.
- `src/EnemyManager.ts`: asteroid spawning/splitting/difficulty scaling.
- `src/PowerUpDirector.ts`: drop logic and support triggers.
- `src/GameOverScene.ts`, `src/AttractScene.ts`, `src/HelpScene.ts`: meta flow.

## Manual Smoke Test Checklist

- Attract -> Start -> Gameplay -> Pause/Help -> Game Over.
- Difficulty switch persists and affects pacing.
- Level transition overlay appears (`3, 2, 1, GO!`).
- Boss appears at level end and requires multiple hits.
- Boss energy bar is shown directly on the boss UFO and decreases on hits (segmented bar + "TREFFER N" label).
- Boss hit-flash and damage-drain animation visible on each hit.
- Scout/Boss destruction uses full explosion and cleanup without freeze states.
