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

window.addEventListener('resize', handleResize);
document.addEventListener('fullscreenchange', handleResize);
document.addEventListener('webkitfullscreenchange', handleResize);

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

    const main = game.scene.getScene('MainScene') as any;
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
