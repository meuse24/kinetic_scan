import Phaser from 'phaser';
import { PowerUpType } from './types/PowerUpType';

// Re-export for backward compatibility
export { PowerUpType };

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

  private colorToRgba(color: number, alpha: number) {
    const c = Phaser.Display.Color.IntegerToColor(color);
    return `rgba(${c.red}, ${c.green}, ${c.blue}, ${alpha})`;
  }

  private drawMetalBadgeBase(ctx: CanvasRenderingContext2D, accent: number) {
    const size = 32;
    const center = size * 0.5;
    const accentBright = this.colorToRgba(accent, 0.85);
    const accentMid = this.colorToRgba(accent, 0.4);

    const ringGrad = ctx.createLinearGradient(5, 3, 28, 29);
    ringGrad.addColorStop(0, '#8d99ad');
    ringGrad.addColorStop(0.48, '#3b4555');
    ringGrad.addColorStop(1, '#1a212b');
    ctx.beginPath();
    ctx.moveTo(center, 2.5);
    ctx.lineTo(27.2, 7);
    ctx.lineTo(29.5, 16);
    ctx.lineTo(27.2, 25);
    ctx.lineTo(center, 29.5);
    ctx.lineTo(4.8, 25);
    ctx.lineTo(2.5, 16);
    ctx.lineTo(4.8, 7);
    ctx.closePath();
    ctx.fillStyle = ringGrad;
    ctx.fill();

    ctx.strokeStyle = 'rgba(233,242,255,0.9)';
    ctx.lineWidth = 1.2;
    ctx.stroke();

    const innerGrad = ctx.createLinearGradient(7, 6, 26, 27);
    innerGrad.addColorStop(0, '#161d27');
    innerGrad.addColorStop(1, '#070b11');
    ctx.beginPath();
    ctx.moveTo(center, 6);
    ctx.lineTo(24, 9.5);
    ctx.lineTo(25.6, 16);
    ctx.lineTo(24, 22.5);
    ctx.lineTo(center, 26);
    ctx.lineTo(8, 22.5);
    ctx.lineTo(6.4, 16);
    ctx.lineTo(8, 9.5);
    ctx.closePath();
    ctx.fillStyle = innerGrad;
    ctx.fill();
    ctx.strokeStyle = 'rgba(114, 144, 180, 0.5)';
    ctx.lineWidth = 0.9;
    ctx.stroke();

    ctx.strokeStyle = accentMid;
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(9, 10);
    ctx.lineTo(23, 10);
    ctx.moveTo(8.4, 16);
    ctx.lineTo(23.6, 16);
    ctx.moveTo(9, 22);
    ctx.lineTo(23, 22);
    ctx.stroke();

    const glow = ctx.createRadialGradient(center, 7.5, 0.4, center, 7.5, 8);
    glow.addColorStop(0, this.colorToRgba(accent, 0.7));
    glow.addColorStop(1, this.colorToRgba(accent, 0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(center, 7.5, 8, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = accentBright;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(center, 16, 10.3, Math.PI * 0.08, Math.PI * 1.92);
    ctx.stroke();
  }

  private drawPowerUpGlyph(
    ctx: CanvasRenderingContext2D,
    type: PowerUpType,
    accent: number,
    accentGlow: number,
  ) {
    ctx.save();
    ctx.translate(16, 16);
    ctx.strokeStyle = this.colorToRgba(accentGlow, 0.96);
    ctx.fillStyle = this.colorToRgba(accentGlow, 0.85);
    ctx.lineWidth = 1.8;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    if (type === PowerUpType.SHIELD) {
      ctx.beginPath();
      ctx.arc(0, 0, 7.8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, -7);
      ctx.lineTo(0, 6.3);
      ctx.moveTo(-5, 0);
      ctx.lineTo(5, 0);
      ctx.stroke();
    } else if (type === PowerUpType.TRIPLE_SHOT) {
      for (const offset of [-4.8, 0, 4.8]) {
        ctx.beginPath();
        ctx.moveTo(offset - 1.6, -3.5);
        ctx.lineTo(offset + 1.6, -3.5);
        ctx.lineTo(offset, 4.2);
        ctx.closePath();
        ctx.fill();
      }
    } else if (type === PowerUpType.SLOW_MOTION) {
      ctx.beginPath();
      ctx.arc(0, 0, 7.2, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, -4.2);
      ctx.moveTo(0, 0);
      ctx.lineTo(3.4, 1.8);
      ctx.stroke();
    } else if (type === PowerUpType.EMP_WAVE) {
      ctx.beginPath();
      ctx.arc(0, 0, 2.1, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, 0, 5.4, Math.PI * 0.2, Math.PI * 1.8);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, 8, Math.PI * 0.24, Math.PI * 1.76);
      ctx.stroke();
    } else if (type === PowerUpType.GHOST_PHASE) {
      ctx.beginPath();
      ctx.moveTo(-6.5, -4);
      ctx.lineTo(6.5, -4);
      ctx.lineTo(6.5, 4.5);
      ctx.lineTo(2.5, 2.8);
      ctx.lineTo(0, 5.5);
      ctx.lineTo(-2.5, 2.8);
      ctx.lineTo(-6.5, 4.5);
      ctx.closePath();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(-2.3, -0.7, 0.9, 0, Math.PI * 2);
      ctx.arc(2.3, -0.7, 0.9, 0, Math.PI * 2);
      ctx.fill();
    } else if (type === PowerUpType.WINGMAN_DRONES) {
      const drawDrone = (x: number) => {
        ctx.beginPath();
        ctx.moveTo(x, -4.2);
        ctx.lineTo(x + 3.3, 0);
        ctx.lineTo(x, 4.2);
        ctx.lineTo(x - 3.3, 0);
        ctx.closePath();
        ctx.stroke();
      };
      drawDrone(-4.8);
      drawDrone(4.8);
      ctx.beginPath();
      ctx.moveTo(-1, 0);
      ctx.lineTo(1, 0);
      ctx.stroke();
    } else if (type === PowerUpType.CANNON_COOLING) {
      ctx.beginPath();
      ctx.arc(0, 0, 7.5, 0, Math.PI * 2);
      ctx.stroke();
      for (const angle of [0, Math.PI * 0.25, Math.PI * 0.5, Math.PI * 0.75]) {
        const dx = Math.cos(angle) * 5.2;
        const dy = Math.sin(angle) * 5.2;
        ctx.beginPath();
        ctx.moveTo(-dx, -dy);
        ctx.lineTo(dx, dy);
        ctx.stroke();
      }
    } else if (type === PowerUpType.BLACK_HOLE) {
      const swirl = ctx.createRadialGradient(0, 0, 0.2, 0, 0, 7.6);
      swirl.addColorStop(0, this.colorToRgba(accentGlow, 1));
      swirl.addColorStop(0.45, this.colorToRgba(accent, 0.6));
      swirl.addColorStop(1, this.colorToRgba(0x000000, 0.9));
      ctx.fillStyle = swirl;
      ctx.beginPath();
      ctx.arc(0, 0, 7.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = this.colorToRgba(accentGlow, 0.75);
      ctx.beginPath();
      ctx.arc(0, 0, 8.4, Math.PI * 0.12, Math.PI * 1.88);
      ctx.stroke();
    } else if (type === PowerUpType.SHIELD_BUNKER) {
      ctx.fillStyle = this.colorToRgba(accentGlow, 0.9);
      ctx.strokeStyle = this.colorToRgba(accentGlow, 0.95);
      ctx.lineWidth = 1.4;
      const x = -7.5;
      const y = -4.5;
      const w = 15;
      const h = 9;
      const r = 2.2;
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.lineTo(x + w - r, y);
      ctx.quadraticCurveTo(x + w, y, x + w, y + r);
      ctx.lineTo(x + w, y + h - r);
      ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      ctx.lineTo(x + r, y + h);
      ctx.quadraticCurveTo(x, y + h, x, y + h - r);
      ctx.lineTo(x, y + r);
      ctx.quadraticCurveTo(x, y, x + r, y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = 'rgba(11, 14, 20, 0.95)';
      ctx.fillRect(-4.8, -1.2, 2.3, 5.7);
      ctx.fillRect(-1.1, -1.2, 2.3, 5.7);
      ctx.fillRect(2.6, -1.2, 2.3, 5.7);
    } else if (type === PowerUpType.MINE_LAYER) {
      ctx.strokeStyle = this.colorToRgba(accentGlow, 0.94);
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(0, 0, 6.8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = this.colorToRgba(accentGlow, 0.86);
      ctx.beginPath();
      ctx.arc(0, 0, 3.2, 0, Math.PI * 2);
      ctx.fill();
      for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * Math.PI * 2;
        const ix = Math.cos(angle) * 6.8;
        const iy = Math.sin(angle) * 6.8;
        const ox = Math.cos(angle) * 9.4;
        const oy = Math.sin(angle) * 9.4;
        ctx.beginPath();
        ctx.moveTo(ix, iy);
        ctx.lineTo(ox, oy);
        ctx.stroke();
      }
    }

    ctx.restore();
  }

  private generateTextures(scene: Phaser.Scene) {
    const types = [
      { type: PowerUpType.SHIELD, accent: 0x45daff, glow: 0xcbf4ff },
      { type: PowerUpType.TRIPLE_SHOT, accent: 0xff62d9, glow: 0xffd3f2 },
      { type: PowerUpType.SLOW_MOTION, accent: 0xffd26d, glow: 0xfff3c7 },
      { type: PowerUpType.EMP_WAVE, accent: 0x7ab5ff, glow: 0xd8e9ff },
      { type: PowerUpType.GHOST_PHASE, accent: 0xcfd8e8, glow: 0xf5f8ff },
      { type: PowerUpType.WINGMAN_DRONES, accent: 0x7dffca, glow: 0xddfff2 },
      { type: PowerUpType.CANNON_COOLING, accent: 0x8ad9ff, glow: 0xe7f8ff },
      { type: PowerUpType.BLACK_HOLE, accent: 0xbd7cff, glow: 0xf0d9ff },
      { type: PowerUpType.SHIELD_BUNKER, accent: 0x82ffb2, glow: 0xe3ffe7 },
      { type: PowerUpType.MINE_LAYER, accent: 0xffb06a, glow: 0xfff0d6 },
    ];

    types.forEach((p) => {
      const key = `powerup_${p.type}`;
      if (!scene.textures.exists(key)) {
        const texture = scene.textures.createCanvas(key, 32, 32);
        if (!texture) return;
        const ctx = texture.getContext();
        ctx.clearRect(0, 0, 32, 32);
        this.drawMetalBadgeBase(ctx, p.accent);
        this.drawPowerUpGlyph(ctx, p.type, p.accent, p.glow);
        texture.refresh();
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
      case PowerUpType.CANNON_COOLING:
        return 'CLG';
      case PowerUpType.BLACK_HOLE:
        return 'BLK';
      case PowerUpType.SHIELD_BUNKER:
        return 'BNK';
      case PowerUpType.MINE_LAYER:
        return 'MNE';
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
    const w = this.scene.scale.width;
    const h = this.scene.scale.height;
    const pad = 100;
    if (this.y > h + pad || this.x < -pad || this.x > w + pad) {
      this.deactivate();
    }
  }
}
