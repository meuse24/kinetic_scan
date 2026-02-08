import Phaser from 'phaser';
import BootScene from './BootScene';
import AttractScene from './AttractScene';
import CRTPipeline from './CRTPipeline';
import BezelScene from './BezelScene';

export const IS_TOUCH = !window.matchMedia('(pointer: fine)').matches;
const SEARCH_PARAMS = new URLSearchParams(window.location.search);

// Capture mode can force Canvas to avoid headless WebGL screenshot issues.
export const FORCE_CANVAS_CAPTURE =
  SEARCH_PARAMS.get('renderer') === 'canvas' ||
  SEARCH_PARAMS.get('capture') === '1' ||
  SEARCH_PARAMS.has('capture');

const RENDERER_TYPE = FORCE_CANVAS_CAPTURE ? Phaser.CANVAS : Phaser.WEBGL;

// Dynamic game dimensions based on screen aspect ratio.
// Mobile uses a smaller base (600) so game objects appear larger on small screens.
// Desktop uses 1000 as the base on the short axis.
const BASE_SIZE = IS_TOUCH ? 600 : 1000;

function computeDimensions() {
  const aspect = window.innerWidth / window.innerHeight;
  return {
    width: aspect >= 1 ? Math.round(BASE_SIZE * aspect) : BASE_SIZE,
    height: aspect >= 1 ? BASE_SIZE : Math.round(BASE_SIZE / aspect),
  };
}

const initial = computeDimensions();
export let GAME_WIDTH = initial.width;
export let GAME_HEIGHT = initial.height;

let _resizePending = false;

/** Recompute GAME_WIDTH/GAME_HEIGHT from current window size. Returns true if values changed. */
export function recalculateDimensions(): boolean {
  const { width, height } = computeDimensions();
  if (width === GAME_WIDTH && height === GAME_HEIGHT) return false;
  GAME_WIDTH = width;
  GAME_HEIGHT = height;
  _resizePending = true;
  return true;
}

/** If a resize is pending, apply it to the game's scale manager and clear the flag. Returns true if applied. */
export function applyPendingResize(game: Phaser.Game): boolean {
  if (!_resizePending) return false;
  _resizePending = false;
  game.scale.setGameSize(GAME_WIDTH, GAME_HEIGHT);
  game.scale.displaySize.setAspectRatio(GAME_WIDTH / GAME_HEIGHT);
  game.scale.refresh();
  return true;
}

export const config: Phaser.Types.Core.GameConfig = {
  type: RENDERER_TYPE,
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
  ...(FORCE_CANVAS_CAPTURE ? {} : { pipeline: { CRTPipeline: CRTPipeline } as any }),
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    expandParent: false,
    fullscreenTarget: document.documentElement,
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 0 },
      debug: false,
    },
  },
  scene: [BootScene, AttractScene, BezelScene],
};
