import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCREENSHOT_DIR = path.join(__dirname, 'screenshots');

/**
 * Launch a headless Chromium browser and navigate to the game URL with ?capture=1.
 * @param {string} url - Base URL of the dev server (e.g. http://localhost:5173)
 * @returns {{ browser: import('playwright').Browser, page: import('playwright').Page, consoleErrors: string[] }}
 */
export async function launchGame(url) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  const consoleErrors = [];
  page.on('pageerror', (err) => consoleErrors.push(err.message));
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  const captureUrl = url.includes('?') ? `${url}&capture=1` : `${url}?capture=1`;
  await page.goto(captureUrl, { waitUntil: 'domcontentloaded' });

  return { browser, page, consoleErrors };
}

/**
 * Get the current game state by calling window.render_game_to_text().
 * @param {import('playwright').Page} page
 * @returns {Promise<object>}
 */
export async function getGameState(page) {
  const raw = await page.evaluate(() => {
    if (typeof window.render_game_to_text === 'function') {
      return window.render_game_to_text();
    }
    return '{}';
  });
  return JSON.parse(raw);
}

/**
 * Send a burst of keyboard/mouse actions sequentially.
 * Actions: { type: 'keydown'|'keyup'|'keypress'|'wait', key?: string, ms?: number }
 * - keydown: holds key down
 * - keyup: releases key
 * - keypress: keydown + small delay + keyup
 * - wait: pause for ms milliseconds
 * @param {import('playwright').Page} page
 * @param {Array<{type: string, key?: string, ms?: number}>} actions
 */
export async function sendInputBurst(page, actions) {
  for (const action of actions) {
    switch (action.type) {
      case 'keydown':
        await page.keyboard.down(action.key);
        break;
      case 'keyup':
        await page.keyboard.up(action.key);
        break;
      case 'keypress':
        await page.keyboard.press(action.key);
        await sleep(30);
        break;
      case 'wait':
        await sleep(action.ms ?? 50);
        break;
      default:
        break;
    }
    // Small inter-action delay for realism
    if (action.type !== 'wait') await sleep(15);
  }
}

/**
 * Poll getGameState until the given scene appears in activeScenes.
 * @param {import('playwright').Page} page
 * @param {string} sceneName
 * @param {number} timeoutMs
 * @returns {Promise<object>} - The game state when the scene was found
 */
export async function waitForScene(page, sceneName, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const state = await getGameState(page);
    if (state.activeScenes && state.activeScenes.includes(sceneName)) {
      return state;
    }
    await sleep(250);
  }
  throw new Error(`Timeout waiting for scene "${sceneName}" after ${timeoutMs}ms`);
}

/**
 * Take a screenshot and save it to tests/screenshots/<name>.png.
 * @param {import('playwright').Page} page
 * @param {string} name
 */
export async function screenshot(page, name) {
  const filePath = path.join(SCREENSHOT_DIR, `${name}.png`);
  await page.screenshot({ path: filePath });
  console.log(`  Screenshot saved: ${filePath}`);
}

/**
 * Return collected console errors.
 * @param {string[]} consoleErrors
 * @returns {string[]}
 */
export function getConsoleErrors(consoleErrors) {
  return [...consoleErrors];
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
