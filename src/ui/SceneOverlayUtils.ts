import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../gameConfig';
import { performanceMonitor } from '../PerformanceMonitor';

interface FullscreenOverlayConfig {
  color?: number;
  alpha?: number;
  depth?: number;
  interactive?: boolean;
}

export function ensureBezelScene(scene: Phaser.Scene): void {
  if (!scene.scene.isActive('BezelScene')) {
    scene.scene.launch('BezelScene');
  }
  scene.scene.bringToTop('BezelScene');
}

export function applyCrtPipelineIfEnabled(scene: Phaser.Scene): void {
  if (
    performanceMonitor.crtEnabled &&
    scene.game.renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer
  ) {
    scene.cameras.main.setPostPipeline('CRTPipeline');
  }
}

export function createFullscreenOverlay(
  scene: Phaser.Scene,
  config: FullscreenOverlayConfig = {},
): Phaser.GameObjects.Rectangle {
  const overlay = scene.add.rectangle(
    GAME_WIDTH / 2,
    GAME_HEIGHT / 2,
    GAME_WIDTH,
    GAME_HEIGHT,
    config.color ?? 0x000000,
    config.alpha ?? 0.7,
  );
  if (typeof config.depth === 'number') overlay.setDepth(config.depth);
  if (config.interactive) {
    overlay.setInteractive();
  }
  return overlay;
}
