import Phaser from 'phaser';
import type { PowerUpType } from '../types/PowerUpType';
import { PowerUpType as PowerUpTypeValues } from '../types/PowerUpType';

interface NoticeStyle {
  label: string;
  color: string;
}

interface NoticeEntry {
  text: Phaser.GameObjects.Text;
  tween: Phaser.Tweens.Tween | null;
}

interface MainPowerUpNoticeSystemConfig {
  scene: Phaser.Scene;
  getAnchor: () => { x: number; y: number } | null;
}

const POWER_UP_NOTICE_STYLES: Record<PowerUpType, NoticeStyle> = {
  [PowerUpTypeValues.TRIPLE_SHOT]: { label: 'TRIPLE SHOT', color: '#ff9fe3' },
  [PowerUpTypeValues.SLOW_MOTION]: { label: 'SLOW MOTION', color: '#8fd7ff' },
  [PowerUpTypeValues.SHIELD]: { label: 'SHIELD ACTIVATED', color: '#7dfbff' },
  [PowerUpTypeValues.EMP_WAVE]: { label: 'EMP WAVE', color: '#b8c7ff' },
  [PowerUpTypeValues.GHOST_PHASE]: { label: 'SHIP GHOSTED', color: '#d0b7ff' },
  [PowerUpTypeValues.WINGMAN_DRONES]: { label: 'DRONES ONLINE', color: '#9fffc5' },
  [PowerUpTypeValues.CANNON_COOLING]: { label: 'CANNON COOLING', color: '#d9ffff' },
  [PowerUpTypeValues.BLACK_HOLE]: { label: 'BLACK HOLE FIELD', color: '#cf98ff' },
  [PowerUpTypeValues.SHIELD_BUNKER]: { label: 'BUNKERS DEPLOYED', color: '#8effcf' },
  [PowerUpTypeValues.MINE_LAYER]: { label: 'MINE STOCK +1', color: '#ffd487' },
};

/**
 * Floating short-lived power-up/status notices near the player ship.
 */
export class MainPowerUpNoticeSystem {
  private readonly scene: Phaser.Scene;
  private readonly getAnchor: () => { x: number; y: number } | null;
  private readonly pool: NoticeEntry[] = [];
  private poolIndex: number = 0;

  constructor(config: MainPowerUpNoticeSystemConfig) {
    this.scene = config.scene;
    this.getAnchor = config.getAnchor;
    this.initPool();
  }

  public show(type: PowerUpType): void {
    const style = POWER_UP_NOTICE_STYLES[type];
    this.showNotice(style.label, style.color);
  }

  public showCustom(label: string, color: string = '#ff8c66'): void {
    this.showNotice(label, color);
  }

  public destroy(): void {
    for (const entry of this.pool) {
      entry.tween?.stop();
      entry.text.destroy();
    }
    this.pool.length = 0;
  }

  private showNotice(label: string, color: string): void {
    const anchor = this.getAnchor();
    if (!anchor) return;

    const entry = this.pool[this.poolIndex];
    this.poolIndex = (this.poolIndex + 1) % this.pool.length;

    entry.tween?.stop();
    entry.tween = null;

    const startX = anchor.x + Phaser.Math.Between(-24, 24);
    const startY = anchor.y - 52;
    const riseY = startY - Phaser.Math.Between(70, 92);

    entry.text
      .setText(label)
      .setColor(color)
      .setPosition(startX, startY)
      .setAlpha(1)
      .setScale(1.02)
      .setVisible(true);

    entry.tween = this.scene.tweens.add({
      targets: entry.text,
      y: riseY,
      alpha: 0,
      scaleX: 1.24,
      scaleY: 1.24,
      duration: 1320,
      ease: 'Sine.easeOut',
      onComplete: () => {
        entry.text.setVisible(false);
        entry.tween = null;
      },
    });
  }

  private initPool(): void {
    const style: Phaser.Types.GameObjects.Text.TextStyle = {
      fontFamily: '"Press Start 2P"',
      fontSize: '16px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 4,
    };

    for (let i = 0; i < 8; i++) {
      const text = this.scene.add
        .text(0, 0, '', style)
        .setOrigin(0.5)
        .setDepth(142)
        .setVisible(false);
      this.pool.push({ text, tween: null });
    }
  }
}
