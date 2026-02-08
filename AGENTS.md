# Repository Guidelines

## Project Structure & Module Organization
- `src/` contains all game code (Phaser scenes, gameplay entities, and managers). Entry point is `src/main.ts`; runtime sizing/config lives in `src/gameConfig.ts`.
- Scene files follow `*Scene.ts` (for example `AttractScene.ts`, `MainScene.ts`, `PauseScene.ts`); shared systems generally use `*Manager.ts`.
- `public/` stores static web assets (`manifest.json`, icons) served directly by Vite.
- `dist/` is generated build output from Vite. Do not edit manually.
- Root config files: `vite.config.ts`, `eslint.config.js`, `.prettierrc`, and `tsconfig.json`.

## Build, Test, and Development Commands
- `npm install`: install dependencies.
- `npm run dev`: start the Vite dev server for local gameplay iteration.
- `npm run lint`: run ESLint (with Prettier enforcement) across the repo.
- `npm run build`: run TypeScript checks and produce a production bundle in `dist/`.
- `npm run preview`: serve the production build locally for final verification.

## Coding Style & Naming Conventions
- Language: TypeScript (`strict` mode enabled). Keep types explicit at module boundaries.
- Formatting is enforced by Prettier: 2-space indentation, single quotes, semicolons, trailing commas, 100-char print width.
- Use `PascalCase` for classes/types, `camelCase` for variables/functions, and `UPPER_SNAKE_CASE` for exported constants (for example `GAME_WIDTH`).
- Keep scene keys and class names aligned to avoid Phaser scene-registration bugs.
- Prefix intentionally unused parameters with `_` to satisfy lint rules.

## Testing Guidelines
- Playwright-based automation tests in `tests/` (run with `node tests/test_combo_system.js` against a running dev server).
- Minimum pre-PR checks: `npm run lint`, `npm run build`, then manual smoke testing in browser (`npm run dev`).
- Validate critical flows: attract -> play -> pause/help -> game over, plus resize/fullscreen behavior.
- Validate new systems: combo multiplier, perk selection after boss, swarm bonus, daily challenge leaderboard, milestone effects, volume sliders.
- If adding tests, prefer `src/**/*.test.ts` naming and add corresponding npm scripts in `package.json`.

## Commit & Pull Request Guidelines
- Match existing commit style: imperative, concise subjects (for example `Fix viewport scaling...`, `Add fullscreen listener...`).
- Keep commits focused on one change area.
- PRs should include: change summary, linked issue (if any), manual test steps, and screenshots/GIFs for UI/visual updates.
- Call out cross-device impact explicitly when touching input, scaling, or performance systems.
