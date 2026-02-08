import Phaser from 'phaser';
import { COMBO_TUNING } from './MainSceneTuning';
import { GAME_WIDTH } from './gameConfig';

export interface ComboState {
  comboCount: number;
  multiplier: number;
  lastKillTime: number;
}

interface PopupEntry {
  text: Phaser.GameObjects.Text;
  tween: Phaser.Tweens.Tween | null;
}

function getComboTier(count: number): number {
  const thresholds = COMBO_TUNING.thresholds;
  for (let i = thresholds.length - 1; i >= 0; i--) {
    if (count >= thresholds[i].minKills) return i;
  }
  return 0;
}

export class ComboManager {
  private scene: Phaser.Scene;
  private comboCount: number = 0;
  private multiplier: number = 1;
  private lastKillTime: number = 0;
  private prevTier: number = 0;

  private popupPool: PopupEntry[] = [];
  private popupIndex: number = 0;

  private hudText: Phaser.GameObjects.Text | null = null;
  private lastHudLabel: string = '';
  private hudPulseTween: Phaser.Tweens.Tween | null = null;
  private hudFadeTween: Phaser.Tweens.Tween | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.initPopupPool();
  }

  private initPopupPool() {
    for (let i = 0; i < COMBO_TUNING.popupPoolSize; i++) {
      const text = this.scene.add
        .text(0, 0, '', {
          fontFamily: '"Press Start 2P"',
          fontSize: `${COMBO_TUNING.popupFontSize}px`,
          color: '#ffffff',
          stroke: '#000000',
          strokeThickness: 3,
        })
        .setOrigin(0.5)
        .setDepth(COMBO_TUNING.popupDepth)
        .setVisible(false);
      this.popupPool.push({ text, tween: null });
    }
  }

  registerKill(x: number, y: number, basePoints: number, time: number): number {
    this.comboCount++;
    this.lastKillTime = time;

    const tier = getComboTier(this.comboCount);
    const tierConfig = COMBO_TUNING.thresholds[tier];
    this.multiplier = tierConfig.multiplier;
    const multipliedPoints = basePoints * this.multiplier;

    if (tier > this.prevTier) {
      this.pulseHUD();
    }
    this.prevTier = tier;

    this.spawnPopup(x, y, multipliedPoints, tierConfig.color);
    return multipliedPoints;
  }

  spawnClusterPopup(cx: number, cy: number, totalPoints: number) {
    if (totalPoints <= 0) return;
    const tier = getComboTier(this.comboCount);
    const tierConfig = COMBO_TUNING.thresholds[tier];
    this.spawnPopup(cx, cy, totalPoints, tierConfig.color);
  }

  private spawnPopup(x: number, y: number, points: number, color: string) {
    const entry = this.popupPool[this.popupIndex];
    this.popupIndex = (this.popupIndex + 1) % this.popupPool.length;

    if (entry.tween) {
      entry.tween.stop();
      entry.tween = null;
    }

    const label = this.multiplier >= 2 ? `+${points} x${this.multiplier}` : `+${points}`;

    entry.text
      .setText(label)
      .setPosition(x, y)
      .setAlpha(1)
      .setScale(1)
      .setVisible(true)
      .setColor(color);

    const totalMs = COMBO_TUNING.popupDurationMs;
    const holdMs = Math.round(totalMs * COMBO_TUNING.popupHoldRatio);
    const fadeMs = totalMs - holdMs;

    entry.tween = this.scene.tweens.add({
      targets: entry.text,
      y: y - COMBO_TUNING.popupRiseY,
      duration: totalMs,
      ease: 'Sine.easeOut',
    });

    // Hold at full alpha, then fade out
    this.scene.tweens.add({
      targets: entry.text,
      alpha: 1,
      duration: holdMs,
      onComplete: () => {
        this.scene.tweens.add({
          targets: entry.text,
          alpha: 0,
          duration: fadeMs,
          ease: 'Sine.easeIn',
          onComplete: () => {
            entry.text.setVisible(false);
            entry.tween = null;
          },
        });
      },
    });
  }

  reset() {
    if (this.comboCount > 0 && this.multiplier >= 2) {
      this.fadeHUD();
    }
    this.comboCount = 0;
    this.multiplier = 1;
    this.lastKillTime = 0;
    this.prevTier = 0;
  }

  update(time: number) {
    if (this.comboCount > 0 && time - this.lastKillTime > COMBO_TUNING.timeWindowMs) {
      this.reset();
    }
  }

  getState(): ComboState {
    return {
      comboCount: this.comboCount,
      multiplier: this.multiplier,
      lastKillTime: this.lastKillTime,
    };
  }

  saveState(): ComboState {
    return this.getState();
  }

  loadState(state: ComboState) {
    this.comboCount = state.comboCount;
    this.multiplier = state.multiplier;
    this.lastKillTime = state.lastKillTime;
    this.prevTier = getComboTier(this.comboCount);
  }

  createHUD(y: number, isCompactHud: boolean) {
    const hudMarginX = isCompactHud ? 18 : 30;
    this.hudText = this.scene.add
      .text(GAME_WIDTH - hudMarginX, y, '', {
        fontFamily: '"Press Start 2P"',
        fontSize: isCompactHud ? '12px' : '14px',
        color: '#ffff00',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(1, 0)
      .setDepth(100)
      .setVisible(false);
    this.lastHudLabel = '';
  }

  updateHUD() {
    if (!this.hudText) return;
    if (this.multiplier < 2) {
      if (this.hudText.visible) {
        this.hudText.setVisible(false);
        this.lastHudLabel = '';
      }
      return;
    }
    const tier = getComboTier(this.comboCount);
    const tierConfig = COMBO_TUNING.thresholds[tier];
    const label = `COMBO x${this.multiplier} (${this.comboCount})`;
    if (label !== this.lastHudLabel) {
      this.hudText.setText(label).setColor(tierConfig.color).setVisible(true);
      this.lastHudLabel = label;
    }
  }

  private pulseHUD() {
    if (!this.hudText) return;
    this.hudPulseTween?.stop();
    this.hudText.setScale(1);
    this.hudPulseTween = this.scene.tweens.add({
      targets: this.hudText,
      scaleX: 1.3,
      scaleY: 1.3,
      duration: 100,
      yoyo: true,
      ease: 'Sine.easeOut',
      onComplete: () => {
        this.hudText?.setScale(1);
        this.hudPulseTween = null;
      },
    });
  }

  private fadeHUD() {
    if (!this.hudText || !this.hudText.visible) return;
    this.hudFadeTween?.stop();
    this.hudFadeTween = this.scene.tweens.add({
      targets: this.hudText,
      alpha: 0,
      duration: 400,
      ease: 'Sine.easeOut',
      onComplete: () => {
        this.hudText?.setVisible(false).setAlpha(1);
        this.hudFadeTween = null;
        this.lastHudLabel = '';
      },
    });
  }

  destroy() {
    for (const entry of this.popupPool) {
      entry.tween?.stop();
      entry.text.destroy();
    }
    this.popupPool.length = 0;
    this.hudPulseTween?.stop();
    this.hudFadeTween?.stop();
    this.hudText?.destroy();
    this.hudText = null;
  }
}
