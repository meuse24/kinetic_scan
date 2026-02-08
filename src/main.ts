import Phaser from 'phaser';
import {
  config,
  recalculateDimensions,
  applyPendingResize,
  FORCE_CANVAS_CAPTURE,
} from './gameConfig';
import './style.css';

declare global {
  interface Window {
    render_game_to_text?: () => string;
    advanceTime?: (ms: number) => Promise<void>;
    __debug_gameplay?: {
      forceBossEncounter: () => {
        ok: boolean;
        reason?: string;
      };
      forceBossDefeat: () => {
        ok: boolean;
        reason?: string;
        level?: number;
        transitionActive?: boolean;
        transitionLabel?: string;
      };
      getMainState: () => Record<string, unknown>;
    };
  }
}

const game = new Phaser.Game(config);

let resizeTimeout: number | undefined;

function handleResize() {
  clearTimeout(resizeTimeout);
  resizeTimeout = window.setTimeout(() => {
    if (!recalculateDimensions()) return;

    // During gameplay or boot, defer resize to the next scene transition.
    // Scale.FIT keeps visuals acceptable in the meantime.
    if (game.scene.isActive('MainScene') || game.scene.isActive('BootScene')) return;

    applyPendingResize(game);

    // Stop overlay scenes
    if (game.scene.isActive('PauseScene')) game.scene.stop('PauseScene');
    if (game.scene.isActive('HelpScene')) game.scene.stop('HelpScene');

    // Restart the bezel
    if (game.scene.isActive('BezelScene')) {
      game.scene.stop('BezelScene');
      game.scene.start('BezelScene');
    }

    // Restart the active content scene
    const contentScenes = ['AttractScene', 'GameOverScene'] as const;
    for (const key of contentScenes) {
      if (game.scene.isActive(key)) {
        game.scene.stop(key);
        game.scene.start(key);
        break;
      }
    }
  }, 250);
}

game.scale.on(Phaser.Scale.Events.RESIZE, handleResize);
game.scale.on(Phaser.Scale.Events.ENTER_FULLSCREEN, handleResize);
game.scale.on(Phaser.Scale.Events.LEAVE_FULLSCREEN, handleResize);

if (typeof window.render_game_to_text !== 'function') {
  window.render_game_to_text = () => {
    const activeScenes = game.scene.getScenes(true).map((scene) => scene.scene.key);
    const payload: Record<string, unknown> = {
      mode: activeScenes.includes('MainScene') ? 'gameplay' : (activeScenes[0] ?? 'unknown'),
      activeScenes,
      coordinateSystem: { origin: 'top-left', xAxis: 'right', yAxis: 'down' },
      captureMode: FORCE_CANVAS_CAPTURE ? 'canvas' : 'default',
      fps: Math.round(game.loop.actualFps),
      viewport: { width: game.scale.width, height: game.scale.height },
    };

    const main = (game.scene.keys as Record<string, any>).MainScene;
    if (main?.scene?.isActive()) {
      const player = main.player;
      payload.player = player
        ? {
            x: Math.round(player.x),
            y: Math.round(player.y),
            heat: Number(player.getHeatNormalized?.()?.toFixed?.(2) ?? 0),
            overheated: Boolean(player.isOverheated?.()),
          }
        : null;
      payload.score = typeof main.score === 'number' ? main.score : 0;
      payload.lives = typeof main.lives === 'number' ? main.lives : 0;
      if (typeof main.getDifficultyState === 'function') {
        payload.difficulty = main.getDifficultyState();
      }
      const enemies = main.enemyManager?.enemies?.getChildren?.() ?? [];
      payload.enemies = enemies
        .filter((enemy: any) => enemy.active)
        .slice(0, 25)
        .map((enemy: any) => ({
          x: Math.round(enemy.x),
          y: Math.round(enemy.y),
          scale: enemy.scaleX,
        }));
      const bullets = main.bullets?.getChildren?.() ?? [];
      const activeBullets = bullets.filter((bullet: any) => bullet.active);
      payload.bulletStats = {
        active: activeBullets.length,
        cap:
          typeof main.getDynamicBulletCap === 'function'
            ? main.getDynamicBulletCap()
            : activeBullets.length,
      };
      payload.ufo = {
        active: Boolean(main.ufo?.active),
        x: typeof main.ufo?.x === 'number' ? Math.round(main.ufo.x) : null,
        y: typeof main.ufo?.y === 'number' ? Math.round(main.ufo.y) : null,
        variant: typeof main.ufo?.getVariant === 'function' ? main.ufo.getVariant() : null,
        health: typeof main.ufo?.getHealth === 'function' ? main.ufo.getHealth() : 0,
        maxHealth: typeof main.ufo?.getMaxHealth === 'function' ? main.ufo.getMaxHealth() : 0,
        bossPhase: typeof main.ufo?.getBossPhase === 'function' ? main.ufo.getBossPhase() : 0,
        shots:
          typeof main.ufo?.getActiveProjectileCount === 'function'
            ? main.ufo.getActiveProjectileCount()
            : 0,
      };
      if (typeof main.getCollisionPressureStats === 'function') {
        payload.collisionPressure = main.getCollisionPressureStats();
      }
      const powerUps = main.powerUpDirector?.getGroup?.()?.getChildren?.() ?? [];
      payload.powerUps = powerUps
        .filter((powerUp: any) => powerUp.active)
        .slice(0, 12)
        .map((powerUp: any) => ({
          x: Math.round(powerUp.x),
          y: Math.round(powerUp.y),
          type: powerUp.type,
        }));
      const shieldBunkers = main.shieldBunkers?.getChildren?.() ?? [];
      payload.shieldBunkers = shieldBunkers
        .filter((bunker: any) => bunker.active)
        .slice(0, 4)
        .map((bunker: any) => ({
          x: Math.round(bunker.x),
          y: Math.round(bunker.y),
        }));
    }

    const attract = (game.scene.keys as Record<string, any>).AttractScene;
    if (attract?.scene?.isActive() && typeof attract.getAmbientVisualState === 'function') {
      payload.attract = attract.getAmbientVisualState();
    }

    return JSON.stringify(payload);
  };
}

if (typeof window.advanceTime !== 'function') {
  window.advanceTime = (ms: number) =>
    new Promise((resolve) => {
      window.setTimeout(resolve, Math.max(0, ms));
    });
}

if (FORCE_CANVAS_CAPTURE) {
  window.__debug_gameplay = {
    forceBossEncounter: () => {
      const main = (game.scene.keys as Record<string, any>).MainScene;
      if (!main?.scene?.isActive?.()) {
        return { ok: false, reason: 'MainScene not active' };
      }
      main.levelBossPendingDefeat = true;
      if (main.ufo?.active && main.ufo.getVariant?.() !== 'boss') {
        main.ufo.deactivate?.();
      }
      main.ufoSpawnTimer = 1;
      main.updateHUD?.();
      return { ok: true };
    },
    forceBossDefeat: () => {
      const main = (game.scene.keys as Record<string, any>).MainScene;
      if (!main?.scene?.isActive?.()) {
        return { ok: false, reason: 'MainScene not active' };
      }
      if (!main.ufo?.active) {
        return { ok: false, reason: 'UFO not active' };
      }
      if (main.ufo.getVariant?.() !== 'boss') {
        return { ok: false, reason: 'UFO is not boss' };
      }
      main.ufo.hitPoints = 1;
      const bullet = main.bullets?.get?.(main.ufo.x, main.ufo.y);
      if (!bullet) {
        return { ok: false, reason: 'No pooled bullet available' };
      }
      bullet.setActive?.(true);
      bullet.setVisible?.(true);
      const body = bullet.body;
      if (body) {
        body.enable = true;
        if (typeof body.reset === 'function') {
          body.reset(main.ufo.x, main.ufo.y);
        }
      }
      main.handleBulletHitUFO?.(bullet, main.ufo);
      return {
        ok: true,
        level: main.level,
        transitionActive: Boolean(main.isLevelTransition),
        transitionLabel: main.levelTransitionCountdownLabel ?? '',
      };
    },
    getMainState: () => {
      const main = (game.scene.keys as Record<string, any>).MainScene;
      if (!main?.scene?.isActive?.()) {
        return { active: false };
      }
      return {
        active: true,
        level: main.level,
        progressionScore: main.progressionScore,
        nextLevelScore: main.nextLevelScore,
        bossPending: main.levelBossPendingDefeat,
        isLevelTransition: main.isLevelTransition,
        transitionLabel: main.levelTransitionCountdownLabel ?? '',
        physicsPaused: Boolean(main.physics?.world?.isPaused),
        enemiesActive: main.enemyManager?.enemies?.countActive?.(true) ?? 0,
        bulletsActive: main.bullets?.countActive?.(true) ?? 0,
        ufoActive: Boolean(main.ufo?.active),
        ufoVariant: main.ufo?.getVariant?.() ?? null,
        ufoHealth: main.ufo?.getHealth?.() ?? 0,
        ufoShots: main.ufo?.getActiveProjectileCount?.() ?? 0,
        spawnProtectionMs: main.spawnProtectionTimerMs ?? 0,
      };
    },
  };
} else if (window.__debug_gameplay) {
  delete window.__debug_gameplay;
}
