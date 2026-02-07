import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from './gameConfig';
import { AudioManager } from './AudioManager';

export class UFO extends Phaser.Physics.Arcade.Sprite {
  private startY: number = 0;
  private timeAlive: number = 0;
  private audioManager: AudioManager;

  constructor(scene: Phaser.Scene, audio: AudioManager) {
    // Generate UFO texture if not exists
    if (!scene.textures.exists('ufo_wireframe')) {
      const graphics = scene.make.graphics({ x: 0, y: 0 });
      graphics.lineStyle(2, 0xffffff, 1);
      graphics.fillStyle(0xffd54a, 0.6);

      // Draw a glowing hexagon body
      const points = [];
      const radius = 25;
      for (let i = 0; i < 6; i++) {
        const angle = (i * Math.PI) / 3;
        points.push(
          new Phaser.Math.Vector2(32 + Math.cos(angle) * radius, 32 + Math.sin(angle) * radius),
        );
      }
      graphics.beginPath();
      graphics.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < points.length; i++) graphics.lineTo(points[i].x, points[i].y);
      graphics.closePath();
      graphics.fillPath();
      graphics.strokePath();

      // Add two antennas on top
      graphics.lineStyle(2, 0x66ccff, 0.9);
      const topY = 32 - radius + 4;
      const antennaOffsets = [-10, 10];
      antennaOffsets.forEach((offset) => {
        const startX = 32 + offset;
        graphics.beginPath();
        graphics.moveTo(startX, topY);
        graphics.lineTo(startX, topY - 12);
        graphics.strokePath();
        graphics.fillStyle(0x66ccff, 0.8);
        graphics.fillCircle(startX, topY - 14, 3);
      });

      // Add a center light line
      graphics.lineStyle(1, 0x00ffff, 0.8);
      graphics.strokeLineShape(new Phaser.Geom.Line(10, 32, 54, 32));

      // Add landing skids
      graphics.lineStyle(2, 0xffffff, 0.7);
      const skidY = 32 + radius - 4;
      graphics.strokeLineShape(new Phaser.Geom.Line(14, skidY, 26, skidY));
      graphics.strokeLineShape(new Phaser.Geom.Line(38, skidY, 50, skidY));
      graphics.lineStyle(2, 0xffffff, 0.7);
      graphics.strokeLineShape(new Phaser.Geom.Line(20, skidY, 16, skidY + 6));
      graphics.strokeLineShape(new Phaser.Geom.Line(44, skidY, 48, skidY + 6));

      graphics.generateTexture('ufo_wireframe', 64, 64);
      graphics.destroy();
    }

    super(scene, -100, -100, 'ufo_wireframe');
    this.audioManager = audio;
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setCircle(25, 7, 7);
    this.deactivate(); // Start inactive so the timer can run
  }

  public spawn() {
    const side = Phaser.Math.Between(0, 1); // 0 = left, 1 = right
    const x = side === 0 ? -50 : GAME_WIDTH + 50;
    const y = Phaser.Math.Between(100, Math.round(GAME_HEIGHT * 0.4));
    const speed = side === 0 ? 100 : -100;

    this.enableBody(true, x, y, true, true);
    this.setVelocityX(speed);
    this.startY = y;
    this.timeAlive = 0;

    this.audioManager.startUFOSound();
  }

  preUpdate(time: number, delta: number) {
    super.preUpdate(time, delta);
    if (!this.active) return;

    this.timeAlive += delta * 0.002;
    // Sinusoidal floating movement
    this.y = this.startY + Math.sin(this.timeAlive) * 50;

    // Check bounds
    if (
      (this.x > GAME_WIDTH + 100 && this.body!.velocity.x > 0) ||
      (this.x < -100 && this.body!.velocity.x < 0)
    ) {
      this.deactivate();
    }
  }

  public deactivate() {
    if (this.body) {
      this.disableBody(true, true);
    } else {
      this.setActive(false);
      this.setVisible(false);
    }
    this.audioManager.stopUFOSound();
  }
}
