import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from './gameConfig';
import { performanceMonitor } from './PerformanceMonitor';

export default class BezelScene extends Phaser.Scene {
  private frameGraphics!: Phaser.GameObjects.Graphics;
  private reflectionRT: Phaser.GameObjects.RenderTexture | null = null;
  private reflectionMaskGraphics!: Phaser.GameObjects.Graphics;
  private reflectionMask: Phaser.Display.Masks.GeometryMask | null = null;
  private useReflection: boolean = false;
  private bezelThickness: number = 32;

  constructor() {
    super('BezelScene');
  }

  create() {
    this.frameGraphics = this.add.graphics();
    this.frameGraphics.setDepth(1000);
    this.reflectionMaskGraphics = this.add.graphics();
    this.reflectionMaskGraphics.setVisible(false);

    this.useReflection = this.game.device.os.desktop && this.game.renderer.type === Phaser.WEBGL;

    if (this.useReflection) {
      this.reflectionRT = this.add.renderTexture(0, 0, GAME_WIDTH, GAME_HEIGHT);
      this.reflectionRT.setOrigin(0, 0);
      this.reflectionRT.setAlpha(0.22);
      this.reflectionRT.setTint(0x888888);
      this.reflectionRT.initPostPipeline(true);
      this.reflectionRT.preFX?.addBlur(2, 8, 8, 1.5, 0x000000, 6);
      this.reflectionRT.setDepth(1001);
    }

    this.drawFrame();

    this.events.once('shutdown', () => {
      this.reflectionRT?.clear();
    });

    this.scene.bringToTop('BezelScene');
  }

  update() {
    if (!this.useReflection || !this.reflectionRT) return;

    // Performance monitor disabled reflection — tear down the RenderTexture
    if (!performanceMonitor.reflectionEnabled) {
      this.reflectionRT.clear();
      this.reflectionRT.destroy();
      this.reflectionRT = null;
      this.useReflection = false;
      return;
    }

    const mainScene = this.scene.get('MainScene');
    if (!mainScene || !mainScene.scene.isActive()) {
      this.reflectionRT.clear();
      return;
    }
    this.reflectionRT.clear();
    this.reflectionRT.draw(mainScene.children.list);
  }

  private drawFrame() {
    const g = this.frameGraphics;
    g.clear();

    this.bezelThickness = Math.max(4, Math.round(GAME_WIDTH * 0.004));

    // Main Bezel around entire game area
    g.lineStyle(this.bezelThickness, 0xffffff, 1);
    g.strokeRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    this.updateReflectionMask();
  }

  private updateReflectionMask() {
    if (!this.reflectionRT) return;
    const border = this.bezelThickness;
    const g = this.reflectionMaskGraphics;
    g.clear();
    g.fillStyle(0xffffff, 1);
    g.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    g.setBlendMode(Phaser.BlendModes.ERASE);
    g.fillRect(border, border, GAME_WIDTH - border * 2, GAME_HEIGHT - border * 2);
    g.setBlendMode(Phaser.BlendModes.NORMAL);

    if (!this.reflectionMask) {
      this.reflectionMask = g.createGeometryMask();
      this.reflectionRT.setMask(this.reflectionMask);
    }
  }
}
