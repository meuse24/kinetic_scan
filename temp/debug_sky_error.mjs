import { chromium } from 'playwright';

async function pressBurst(page, key, times, holdMs = 40, gapMs = 40) {
  for (let i = 0; i < times; i++) {
    await page.keyboard.down(key);
    await page.waitForTimeout(holdMs);
    await page.keyboard.up(key);
    await page.waitForTimeout(gapMs);
  }
}

async function main() {
  const browser = await chromium.launch({
    headless: true,
    args: ['--use-gl=angle', '--use-angle=swiftshader'],
  });
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });

  let hadError = false;
  page.on('pageerror', (err) => {
    hadError = true;
    console.log('PAGEERROR_MESSAGE:', String(err));
    console.log('PAGEERROR_STACK:', err.stack || '<no stack>');
  });
  page.on('console', (msg) => {
    if (msg.type() === 'error') {
      console.log('CONSOLE_ERROR:', msg.text());
    }
  });

  await page.goto('http://127.0.0.1:5173/?capture=1', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(900);

  await page.keyboard.press('Enter');
  await page.waitForTimeout(500);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(1200);

  for (let i = 0; i < 40; i++) {
    await pressBurst(page, i % 2 === 0 ? 'ArrowLeft' : 'ArrowRight', 2);
    await pressBurst(page, 'Space', 2, 18, 24);
    await page.waitForTimeout(220);
    const state = await page.evaluate(() => {
      try {
        if (typeof window.render_game_to_text === 'function') return window.render_game_to_text();
      } catch (e) {
        return JSON.stringify({ renderError: String(e) });
      }
      return '{}';
    });
    console.log('STATE', i, state.slice(0, 220));
    if (hadError) break;
  }

  await page.screenshot({ path: 'output/web-game/sky-raider-debug-error-last.png' });
  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
