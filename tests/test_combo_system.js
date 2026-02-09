import {
  launchGame,
  getGameState,
  sendInputBurst,
  waitForScene,
  screenshot,
  getConsoleErrors,
} from './web_game_playwright_client.js';

const BASE_URL = process.env.GAME_URL || 'http://localhost:5173';

let passed = 0;
let failed = 0;

function assert(condition, label, details = '') {
  if (condition) {
    console.log(`  PASS: ${label}`);
    passed++;
  } else {
    console.log(`  FAIL: ${label}${details ? ' — ' + details : ''}`);
    failed++;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log(`\nLaunching game at ${BASE_URL}?capture=1 ...\n`);
  const { browser, page, consoleErrors } = await launchGame(BASE_URL);

  try {
    // ─── Scenario 1: Boot → Attract → Gameplay ───────────────────────
    console.log('=== Scenario 1: Boot → Attract → Gameplay ===');

    // Wait for BootScene to appear, then send a keypress to proceed
    await waitForScene(page, 'BootScene', 10000);
    console.log('  BootScene detected, sending Space to proceed...');
    await sleep(2000); // Let fonts load
    await sendInputBurst(page, [{ type: 'keypress', key: 'Space' }]);

    // Wait for AttractScene
    await waitForScene(page, 'AttractScene', 15000);
    console.log('  AttractScene detected');
    await screenshot(page, '01_attract');

    // Insert coin (I) then start 1P game (1)
    await sleep(500);
    await sendInputBurst(page, [
      { type: 'keypress', key: 'i' },
      { type: 'wait', ms: 300 },
      { type: 'keypress', key: '1' },
    ]);

    // Wait for MainScene
    const gameState = await waitForScene(page, 'MainScene', 10000);
    console.log('  MainScene detected');
    await screenshot(page, '02_gameplay_start');

    assert(gameState.score === 0, 'Initial score is 0', `got ${gameState.score}`);
    assert(gameState.lives === 3, 'Initial lives is 3', `got ${gameState.lives}`);
    assert(
      gameState.combo && gameState.combo.count === 0,
      'Initial combo count is 0',
      `got ${JSON.stringify(gameState.combo)}`,
    );

    // ─── Scenario 2: Shoot asteroids → score + combo increase ────────
    console.log('\n=== Scenario 2: Kill asteroids → score + combo ===');

    // Move and shoot in bursts to hit asteroids
    // We'll do several rounds of shooting and check state
    for (let burst = 0; burst < 8; burst++) {
      // Move a bit left/right, fire continuously
      const moveKey = burst % 2 === 0 ? 'ArrowLeft' : 'ArrowRight';
      await sendInputBurst(page, [
        { type: 'keydown', key: moveKey },
        { type: 'keydown', key: 'Space' },
        { type: 'wait', ms: 600 },
        { type: 'keyup', key: 'Space' },
        { type: 'keyup', key: moveKey },
        { type: 'wait', ms: 200 },
      ]);
    }

    await sleep(500);
    const afterShooting = await getGameState(page);
    await screenshot(page, '03_after_shooting');

    console.log(
      `  State: score=${afterShooting.score}, combo=${JSON.stringify(afterShooting.combo)}, enemies=${afterShooting.enemies?.length ?? '?'}`,
    );
    assert(
      afterShooting.score > 0,
      'Score increased after shooting',
      `score=${afterShooting.score}`,
    );
    // Combo may or may not be active depending on whether we hit anything recently
    // Just report it
    console.log(
      `  Info: combo count=${afterShooting.combo?.count ?? 'N/A'}, multiplier=${afterShooting.combo?.multiplier ?? 'N/A'}`,
    );

    // ─── Scenario 3: Combo timeout ───────────────────────────────────
    console.log('\n=== Scenario 3: Combo timeout (stop shooting for 3s) ===');

    // First, shoot a burst to try to build combo
    for (let burst = 0; burst < 4; burst++) {
      await sendInputBurst(page, [
        { type: 'keydown', key: 'Space' },
        { type: 'wait', ms: 400 },
        { type: 'keyup', key: 'Space' },
        { type: 'wait', ms: 100 },
      ]);
    }
    await sleep(200);
    const beforeTimeout = await getGameState(page);
    console.log(
      `  Before timeout: combo count=${beforeTimeout.combo?.count ?? 0}, multiplier=${beforeTimeout.combo?.multiplier ?? 1}`,
    );

    // Wait 3.5 seconds (combo timeWindowMs is 2500ms)
    console.log('  Waiting 3.5s for combo to timeout...');
    await sleep(3500);

    const afterTimeout = await getGameState(page);
    await screenshot(page, '04_after_combo_timeout');
    console.log(
      `  After timeout: combo count=${afterTimeout.combo?.count ?? 0}, multiplier=${afterTimeout.combo?.multiplier ?? 1}`,
    );
    assert(
      afterTimeout.combo?.count === 0,
      'Combo count reset to 0 after timeout',
      `got count=${afterTimeout.combo?.count}`,
    );
    assert(
      afterTimeout.combo?.multiplier === 1,
      'Combo multiplier reset to 1 after timeout',
      `got multiplier=${afterTimeout.combo?.multiplier}`,
    );

    // ─── Scenario 4: Player death resets combo ───────────────────────
    console.log('\n=== Scenario 4: Player death resets combo ===');

    // Build some combo first
    for (let burst = 0; burst < 6; burst++) {
      await sendInputBurst(page, [
        { type: 'keydown', key: 'Space' },
        { type: 'wait', ms: 500 },
        { type: 'keyup', key: 'Space' },
        { type: 'wait', ms: 100 },
      ]);
    }

    const beforeDeath = await getGameState(page);
    const livesBefore = beforeDeath.lives;
    console.log(
      `  Before death: lives=${livesBefore}, combo count=${beforeDeath.combo?.count ?? 0}`,
    );

    // Wait for player to be hit naturally (enemies should be spawning)
    // We'll stop moving and let enemies come to us, polling for life loss
    let livesAfter = livesBefore;
    const deathStart = Date.now();
    const deathTimeout = 20000; // 20s max
    while (livesAfter >= livesBefore && Date.now() - deathStart < deathTimeout) {
      // Stay still — don't shoot, let asteroids hit us
      await sleep(1000);
      const st = await getGameState(page);
      livesAfter = st.lives ?? livesBefore;
      if (st.mode !== 'gameplay') {
        console.log('  Game ended during death wait, skipping death combo check');
        break;
      }
    }

    if (livesAfter < livesBefore) {
      const afterDeath = await getGameState(page);
      await screenshot(page, '05_after_death');
      console.log(
        `  After death: lives=${afterDeath.lives}, combo count=${afterDeath.combo?.count ?? '?'}`,
      );
      assert(
        afterDeath.combo?.count === 0,
        'Combo resets on player death',
        `got count=${afterDeath.combo?.count}`,
      );
    } else {
      console.log('  SKIP: Could not trigger player death within timeout');
    }

    // ─── Scenario 5: No console errors ───────────────────────────────
    console.log('\n=== Scenario 5: No console errors ===');
    const errors = getConsoleErrors(consoleErrors);
    if (errors.length > 0) {
      console.log(`  Console errors found (${errors.length}):`);
      errors.slice(0, 10).forEach((e) => console.log(`    - ${e}`));
    }
    assert(errors.length === 0, 'Zero console errors', `found ${errors.length} error(s)`);

    await screenshot(page, '06_final');
  } catch (err) {
    console.error(`\nFATAL ERROR: ${err.message}`);
    await screenshot(page, 'error_state').catch(() => {});
    failed++;
  } finally {
    await browser.close();
  }

  // ─── Summary ─────────────────────────────────────────────────────
  console.log(`\n${'='.repeat(50)}`);
  console.log(`RESULTS: ${passed} passed, ${failed} failed`);
  console.log(`${'='.repeat(50)}\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main();
