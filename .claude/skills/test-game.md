---
description: Run automated Playwright tests against the live game
user_invocable: true
---

# Live Game Testing with Playwright

## Prerequisites
- Dev server must be running: `npm run dev` (defaults to http://localhost:5173)
- Playwright browsers installed: `npx playwright install chromium`

## How to Run

1. **Start the dev server** (if not already running):
   ```bash
   npm run dev &
   ```
   Wait a few seconds for Vite to be ready.

2. **Run the combo system tests**:
   ```bash
   node tests/test_combo_system.js
   ```
   Optionally override the URL: `GAME_URL=http://localhost:3000 node tests/test_combo_system.js`

3. **Check results**:
   - PASS/FAIL printed to stdout for each assertion
   - Screenshots saved to `tests/screenshots/` at key moments
   - Exit code 0 = all passed, 1 = failures

## Test Scenarios (test_combo_system.js)
1. **Boot → Attract → Gameplay**: Navigates through scenes, verifies initial state (score=0, lives=3, combo=0)
2. **Kill asteroids → combo**: Shoots in bursts, checks score increases and combo state
3. **Combo timeout**: Stops shooting for 3.5s, verifies combo resets (timeWindowMs=2500)
4. **Player death resets combo**: Waits for asteroid collision, checks combo resets
5. **No console errors**: Asserts zero pageerror/console.error events

## Writing New Tests
Use the reusable client at `tests/web_game_playwright_client.js`:
```js
import { launchGame, getGameState, sendInputBurst, waitForScene, screenshot } from './web_game_playwright_client.js';

const { browser, page, consoleErrors } = await launchGame('http://localhost:5173');
await waitForScene(page, 'MainScene', 15000);
const state = await getGameState(page);
await screenshot(page, 'my_test');
await browser.close();
```

### Key APIs
- `launchGame(url)` — headless Chromium with `?capture=1`, returns `{ browser, page, consoleErrors }`
- `getGameState(page)` — calls `window.render_game_to_text()`, returns parsed JSON
- `sendInputBurst(page, actions)` — sequential keyboard actions with inter-action delays
- `waitForScene(page, sceneName, timeoutMs)` — polls until scene is active
- `screenshot(page, name)` — saves to `tests/screenshots/<name>.png`

### Game State Shape (during MainScene)
```json
{
  "mode": "gameplay",
  "activeScenes": ["MainScene", "BezelScene"],
  "score": 150,
  "lives": 3,
  "combo": { "count": 4, "multiplier": 2 },
  "enemies": [{ "x": 500, "y": 200, "scale": 1 }],
  "player": { "x": 500, "y": 700, "heat": 0.3, "overheated": false },
  "ufo": { "active": false },
  "bulletStats": { "active": 2, "cap": 8 }
}
```

### Input Actions Format
```js
[
  { type: 'keydown', key: 'ArrowLeft' },
  { type: 'wait', ms: 200 },
  { type: 'keyup', key: 'ArrowLeft' },
  { type: 'keypress', key: 'Space' },  // press + release
]
```

### Game Controls
- `I` — insert coin (credit)
- `1` — start 1P game
- Arrow keys — move
- Space — shoot
- `P` / `Escape` — pause
- `B` — debug: spawn shield bunkers
