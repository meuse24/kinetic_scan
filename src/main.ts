import Phaser from 'phaser';
import { config, recalculateDimensions, applyPendingResize } from './gameConfig';
import './style.css';

const game = new Phaser.Game(config);

let resizeTimeout: number | undefined;

function handleResize() {
  clearTimeout(resizeTimeout);
  resizeTimeout = window.setTimeout(() => {
    if (!recalculateDimensions()) return;

    // During gameplay, defer resize to the next scene transition.
    // Scale.FIT keeps visuals acceptable in the meantime.
    if (game.scene.isActive('MainScene')) return;

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
