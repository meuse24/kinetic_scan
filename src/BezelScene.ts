import Phaser from 'phaser';
import { GAME_SIZE, VIRTUAL_HEIGHT } from './gameConfig';

type PlayArea = {
  x: number;
  y: number;
  width: number;
  height: number;
  scale: number;
};

export default class BezelScene extends Phaser.Scene {
  private frameGraphics!: Phaser.GameObjects.Graphics;
  private reflectionRT: Phaser.GameObjects.RenderTexture | null = null;
  private reflectionMaskGraphics!: Phaser.GameObjects.Graphics;
  private reflectionMask: Phaser.Display.Masks.GeometryMask | null = null;
  private useReflection: boolean = false;
  private playArea: PlayArea = { x: 0, y: 0, width: GAME_SIZE, height: VIRTUAL_HEIGHT, scale: 1 };
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
      this.reflectionRT = this.add.renderTexture(0, 0, GAME_SIZE, GAME_SIZE);
      this.reflectionRT.setOrigin(0, 0);
      this.reflectionRT.setAlpha(0.22);
      this.reflectionRT.setTint(0x888888);
      this.reflectionRT.initPostPipeline(true);
      this.reflectionRT.preFX?.addBlur(2, 8, 8, 1.5, 0x000000, 6);
      this.reflectionRT.setDepth(1001);
    }

    this.refreshLayout();
    this.scale.on('resize', this.refreshLayout, this);
    this.events.once('shutdown', () => {
      this.scale.off('resize', this.refreshLayout, this);
      this.reflectionRT?.clear();
    });

    this.scene.bringToTop('BezelScene');
  }

  update() {
    if (!this.useReflection || !this.reflectionRT) return;
    const mainScene = this.scene.get('MainScene');
    if (!mainScene || !mainScene.scene.isActive()) {
      this.reflectionRT.clear();
      return;
    }
    this.reflectionRT.clear();
    // Only draw the playfield part (0-1000) into the reflection
    this.reflectionRT.draw(mainScene.children.list);
  }

  private refreshLayout() {
    const screenWidth = this.scale.width;
    const screenHeight = this.scale.height;
    const scale = Math.min(screenWidth / GAME_SIZE, screenHeight / VIRTUAL_HEIGHT);
    const width = GAME_SIZE * scale;
    const height = VIRTUAL_HEIGHT * scale;
    const x = (screenWidth - width) / 2;
    const y = (screenHeight - height) / 2;

    this.playArea = { x, y, width, height, scale };
    this.bezelThickness = Math.max(4, Math.round(width * 0.004));
    this.drawFrame();

    if (this.reflectionRT) {
      this.reflectionRT.setPosition(x, y);
      this.reflectionRT.setScale(scale);
      this.updateReflectionMask();
    }
  }

  private drawFrame() {
    const { x, y, width, scale } = this.playArea;
    const playHeight = GAME_SIZE * scale;
    const g = this.frameGraphics;
    g.clear();

    // Main Bezel (Playfield)
    g.lineStyle(this.bezelThickness, 0xffffff, 1);
    g.strokeRect(x, y, width, playHeight);

    // Touchpad Bezel (Bottom area) - Only draw if we have extra height
    if (VIRTUAL_HEIGHT > GAME_SIZE) {
      const touchpadHeight = (VIRTUAL_HEIGHT - GAME_SIZE) * scale;
      const touchpadY = y + playHeight + 5;
      g.lineStyle(Math.max(2, this.bezelThickness / 2), 0x00ffff, 0.3);
      g.strokeRect(x, touchpadY, width, touchpadHeight - 5);

      // Subtle "Touchpad" label
      if (width > 150) {
        g.fillStyle(0x00ffff, 0.1);
        g.fillRect(x + 2, touchpadY + 2, width - 4, touchpadHeight - 9);
      }
    }
  }

  private updateReflectionMask() {
    if (!this.reflectionRT) return;
    const { x, y, width, scale } = this.playArea;
    const playHeight = GAME_SIZE * scale;
    const border = this.bezelThickness;
    const g = this.reflectionMaskGraphics;
    g.clear();
    g.fillStyle(0xffffff, 1);
    g.fillRect(x, y, width, playHeight);
    g.setBlendMode(Phaser.BlendModes.ERASE);
    g.fillRect(x + border, y + border, width - border * 2, playHeight - border * 2);
    g.setBlendMode(Phaser.BlendModes.NORMAL);

    if (!this.reflectionMask) {
      this.reflectionMask = g.createGeometryMask();
      this.reflectionRT.setMask(this.reflectionMask);
    }
  }
}

