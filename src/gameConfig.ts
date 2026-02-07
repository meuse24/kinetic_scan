import Phaser from 'phaser';
import AttractScene from './AttractScene';
import MainScene from './MainScene';
import GameOverScene from './GameOverScene';
import PauseScene from './PauseScene';
import CRTPipeline from './CRTPipeline';
import BezelScene from './BezelScene';
import HelpScene from './HelpScene';

export const IS_TOUCH = !window.matchMedia('(pointer: fine)').matches;

// Dynamic game dimensions based on screen aspect ratio.
// Mobile uses a smaller base (600) so game objects appear larger on small screens.
// Desktop uses 1000 as the base on the short axis.
const aspect = window.innerWidth / window.innerHeight;
const BASE_SIZE = IS_TOUCH ? 600 : 1000;

export const GAME_WIDTH = aspect >= 1 ? Math.round(BASE_SIZE * aspect) : BASE_SIZE;
export const GAME_HEIGHT = aspect >= 1 ? BASE_SIZE : Math.round(BASE_SIZE / aspect);

export const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.WEBGL,
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
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
