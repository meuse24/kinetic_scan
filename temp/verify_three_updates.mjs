import fs from 'fs';
import path from 'path';
import { chromium } from 'playwright';

const BASE_URL = process.env.GAME_URL || 'http://127.0.0.1:4173';
const OUT_DIR = path.resolve('output/web-game/three-followups-pass-1');
fs.mkdirSync(OUT_DIR, { recursive: true });

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function getState(page) {
  const raw = await page.evaluate(() => {
    if (typeof window.render_game_to_text === 'function') return window.render_game_to_text();
    return '{}';
  });
  return JSON.parse(raw);
}

async function waitForScene(page, sceneName, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const state = await getState(page);
    if (Array.isArray(state.activeScenes) && state.activeScenes.includes(sceneName)) return state;
    await sleep(180);
  }
  throw new Error(`Timeout waiting for ${sceneName}`);
}

async function waitForBossActive(page, timeoutMs = 20000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const state = await getState(page);
    if (state?.ufo?.active && state?.ufo?.variant === 'boss') return state;
    await sleep(150);
  }
  throw new Error('Timeout waiting for boss active');
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(`console: ${msg.text()}`);
  });

  try {
    await page.goto(`${BASE_URL}?capture=1`, { waitUntil: 'domcontentloaded' });
    await waitForScene(page, 'BootScene', 15000);
    await sleep(500);
    await page.screenshot({ path: path.join(OUT_DIR, '01-boot-hints-larger.png') });

    await page.keyboard.press('Space');
    await waitForScene(page, 'AttractScene', 18000);
    await sleep(300);
    await page.keyboard.press('o');
    await sleep(450);
    await page.screenshot({ path: path.join(OUT_DIR, '02-attract-settings-with-sliders.png') });
    await page.keyboard.press('o');

    await page.keyboard.press('i');
    await sleep(220);
    await page.keyboard.press('1');
    await waitForScene(page, 'MainScene', 12000);
    await sleep(900);

    const forceEncounter = await page.evaluate(() =>
      window.__debug_gameplay?.forceBossEncounter?.(),
    );
    await waitForBossActive(page, 24000);
    const forceDefeat = await page.evaluate(() => window.__debug_gameplay?.forceBossDefeat?.());

    const t0 = Date.now();
    let gate = null;
    while (Date.now() - t0 < 16000) {
      const state = await getState(page);
      const hasPerk =
        Array.isArray(state.activeScenes) && state.activeScenes.includes('PerkSelectScene');
      const transitionActive = Boolean(state?.difficulty?.transition?.active);
      if (hasPerk || transitionActive) {
        gate = { hasPerk, transitionActive, state, ms: Date.now() - t0 };
        break;
      }
      await sleep(120);
    }
    if (!gate) throw new Error('Timeout waiting for perk/transition gate');

    let lockCheck = null;
    if (gate.hasPerk) {
      const before = await getState(page);
      await page.keyboard.down('ArrowRight');
      await page.keyboard.down('Space');
      await sleep(700);
      await page.keyboard.up('Space');
      await page.keyboard.up('ArrowRight');
      const after = await getState(page);
      lockCheck = {
        dx: (after?.player?.x ?? 0) - (before?.player?.x ?? 0),
        bulletsBefore: before?.bulletStats?.active ?? null,
        bulletsAfter: after?.bulletStats?.active ?? null,
      };
      await page.screenshot({ path: path.join(OUT_DIR, '03-perk-overlay-lock.png') });

      await page.keyboard.press('1');
      await waitForScene(page, 'MainScene', 12000);
      await sleep(300);
    }

    await page.evaluate(() => {
      const phaserAny = window.Phaser;
      const game = phaserAny?.GAMES?.[0];
      const main = game?.scene?.keys?.MainScene;
      if (main?.scene?.isActive?.()) {
        main.endGame?.();
      }
    });
    await waitForScene(page, 'GameOverScene', 12000);
    await sleep(300);
    await page.keyboard.press('o');
    await sleep(400);
    await page.screenshot({ path: path.join(OUT_DIR, '04-gameover-settings-with-sliders.png') });

    const report = {
      forceEncounter,
      forceDefeat,
      overlayDelayMs: gate.ms,
      hasPerkOverlay: gate.hasPerk,
      transitionActiveAtGate: gate.transitionActive,
      lockCheck,
      errors,
    };

    fs.writeFileSync(path.join(OUT_DIR, 'report.json'), JSON.stringify(report, null, 2));
    fs.writeFileSync(path.join(OUT_DIR, 'errors.json'), JSON.stringify(errors, null, 2));
    console.log(JSON.stringify({ ok: true, outDir: OUT_DIR, report }, null, 2));
  } finally {
    await browser.close();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
