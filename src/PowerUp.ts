import Phaser from 'phaser';

export const PowerUpType = {
  TRIPLE_SHOT: 'TRIPLE_SHOT',
  SLOW_MOTION: 'SLOW_MOTION',
  SHIELD: 'SHIELD',
  EMP_WAVE: 'EMP_WAVE',
  GHOST_PHASE: 'GHOST_PHASE',
  WINGMAN_DRONES: 'WINGMAN_DRONES',
  BLACK_HOLE: 'BLACK_HOLE',
} as const;

export type PowerUpType = (typeof PowerUpType)[keyof typeof PowerUpType];

export class PowerUp extends Phaser.Physics.Arcade.Sprite {
  public type: PowerUpType;
  private label: Phaser.GameObjects.Text;
  private labelOffsetY: number = 26;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, 'powerup_SHIELD');
    this.type = PowerUpType.SHIELD;
    this.generateTextures(scene);
    this.label = scene.add
      .text(x, y, '', {
        fontFamily: '"Press Start 2P"',
        fontSize: '14px',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 2,
      })
      .setOrigin(0.5)
      .setVisible(false)
      .setDepth(120);
    this.on('destroy', () => this.label.destroy());
  }

  private generateTextures(scene: Phaser.Scene) {
    const types = [
      { type: PowerUpType.SHIELD, color: 0x00ffff, points: 32 },
      { type: PowerUpType.TRIPLE_SHOT, color: 0xff00ff, points: 3 },
      { type: PowerUpType.SLOW_MOTION, color: 0xffff00, points: 4 },
      { type: PowerUpType.EMP_WAVE, color: 0x0000ff, points: 8 },
      { type: PowerUpType.GHOST_PHASE, color: 0xffffff, points: 0 }, // Special handling
      { type: PowerUpType.WINGMAN_DRONES, color: 0x00ff00, points: 2 }, // Line/Bar
      { type: PowerUpType.BLACK_HOLE, color: 0xaa00ff, points: 12 },
    ];

    types.forEach((p) => {
      const key = `powerup_${p.type}`;
      if (!scene.textures.exists(key)) {
        const graphics = scene.make.graphics({ x: 0, y: 0 });
        graphics.lineStyle(2, 0xffffff, 1);
        graphics.fillStyle(p.color, 0.5);

        if (p.type === PowerUpType.SHIELD || p.type === PowerUpType.BLACK_HOLE) {
          graphics.strokeCircle(16, 16, 14);
          graphics.fillCircle(16, 16, 14);
        } else if (p.type === PowerUpType.GHOST_PHASE) {
          // Draw a ghostly skull-ish or hollow shape
          graphics.strokeRect(4, 4, 24, 24);
          graphics.strokeCircle(16, 16, 8);
        } else {
          graphics.beginPath();
          const sides = p.points;
          const radius = 14;
          for (let i = 0; i < sides; i++) {
            const angle = (i / sides) * Math.PI * 2;
            const px = 16 + Math.cos(angle) * radius;
            const py = 16 + Math.sin(angle) * radius;
            if (i === 0) graphics.moveTo(px, py);
            else graphics.lineTo(px, py);
          }
          graphics.closePath();
          graphics.fillPath();
          graphics.strokePath();
        }

        graphics.generateTexture(key, 32, 32);
        graphics.destroy();
      }
    });
  }

  public spawn(x: number, y: number, type: PowerUpType) {
    this.type = type;
    this.setTexture(`powerup_${type}`);
    this.enableBody(true, x, y, true, true);
    this.setAngularVelocity(100);
    this.setVelocity(Phaser.Math.Between(-50, 50), 100);
    this.label.setText(this.getAbbreviation(type));
    this.label.setPosition(x, y - this.labelOffsetY);
    this.label.setVisible(true);
  }

  public deactivate() {
    this.disableBody(true, true);
    this.label.setVisible(false);
  }

  private getAbbreviation(type: PowerUpType) {
    switch (type) {
      case PowerUpType.TRIPLE_SHOT:
        return 'TRI';
      case PowerUpType.SLOW_MOTION:
        return 'SLO';
      case PowerUpType.SHIELD:
        return 'SHD';
      case PowerUpType.EMP_WAVE:
        return 'EMP';
      case PowerUpType.GHOST_PHASE:
        return 'GST';
      case PowerUpType.WINGMAN_DRONES:
        return 'DRN';
      case PowerUpType.BLACK_HOLE:
        return 'BLK';
      default:
        return 'PWR';
    }
  }

  preUpdate(time: number, delta: number) {
    super.preUpdate(time, delta);
    this.label.setPosition(this.x, this.y - this.labelOffsetY);
    if (!this.active) {
      this.label.setVisible(false);
      return;
    }
    // Check all bounds to prevent accumulation
    if (this.y > 1100 || this.x < -100 || this.x > 1100) {
      this.deactivate();
    }
  }
}
