import Phaser from 'phaser';
import AttractScene from './AttractScene';
import MainScene from './MainScene';
import GameOverScene from './GameOverScene';
import PauseScene from './PauseScene';
import CRTPipeline from './CRTPipeline';
import BezelScene from './BezelScene';
import HelpScene from './HelpScene';

export const GAME_SIZE = 1000;
// Touch-Geräte erhalten ein erweitertes Touchpad (1333), Desktops bleiben bei 1000.
export const IS_TOUCH = !window.matchMedia('(pointer: fine)').matches;
export const VIRTUAL_HEIGHT = IS_TOUCH ? 1333 : 1000;

export const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.WEBGL,
  width: GAME_SIZE,
  height: VIRTUAL_HEIGHT,
  parent: 'app',
  backgroundColor: '#000000',
  render: {
    powerPreference: 'high-performance',
    antialias: false,
    pixelArt: true,
    roundPixels: true,
  },
  pipeline: { CRTPipeline: CRTPipeline } as any,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 0 },
      debug: false,
    },
  },
  scene: [AttractScene, MainScene, GameOverScene, PauseScene, BezelScene, HelpScene],
};
