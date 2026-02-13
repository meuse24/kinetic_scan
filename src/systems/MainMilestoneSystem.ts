import Phaser from 'phaser';
import { GAME_HEIGHT } from '../gameConfig';
import { MILESTONE_TUNING } from '../MainSceneTuning';
import type { AudioManager } from '../AudioManager';

interface MainMilestoneSystemConfig {
  scene: Phaser.Scene;
  audio: AudioManager;
  milestoneText: Phaser.GameObjects.Text;
}

/**
 * Handles score-threshold milestone feedback (flash/shake/text) independently
 * from the main scene update logic.
 */
export class MainMilestoneSystem {
  private readonly scene: Phaser.Scene;
  private readonly audio: AudioManager;
  private readonly milestoneText: Phaser.GameObjects.Text;
  private milestoneIndex: number = 0;

  constructor(config: MainMilestoneSystemConfig) {
    this.scene = config.scene;
    this.audio = config.audio;
    this.milestoneText = config.milestoneText;
  }

  public reset(): void {
    this.milestoneIndex = 0;
    this.scene.tweens.killTweensOf(this.milestoneText);
    this.milestoneText.setVisible(false);
    this.milestoneText.setY(GAME_HEIGHT * 0.32);
  }

  public onScoreChanged(prevScore: number, newScore: number): void {
    const thresholds = MILESTONE_TUNING.thresholds;
    if (this.milestoneIndex >= thresholds.length) return;
    const next = thresholds[this.milestoneIndex];
    if (prevScore < next.score && newScore >= next.score) {
      this.trigger(this.milestoneIndex);
      this.milestoneIndex++;
    }
  }

  private trigger(index: number): void {
    const milestone = MILESTONE_TUNING.thresholds[index];
    const [r, g, b] = milestone.flashColor;
    this.scene.cameras.main.flash(MILESTONE_TUNING.flashDurationMs, r, g, b, false);
    this.scene.cameras.main.shake(
      MILESTONE_TUNING.shakeDurationMs,
      MILESTONE_TUNING.shakeIntensity,
    );
    this.audio.playMilestoneSting();

    this.milestoneText
      .setText(milestone.label)
      .setColor(milestone.color)
      .setScale(0.5)
      .setAlpha(1)
      .setVisible(true);

    this.scene.tweens.add({
      targets: this.milestoneText,
      scaleX: 1.2,
      scaleY: 1.2,
      duration: 280,
      ease: 'Back.easeOut',
      onComplete: () => {
        this.scene.tweens.add({
          targets: this.milestoneText,
          y: this.milestoneText.y - MILESTONE_TUNING.textRiseY,
          alpha: 0,
          scaleX: 0.9,
          scaleY: 0.9,
          duration: MILESTONE_TUNING.textDurationMs - 280,
          delay: 400,
          ease: 'Sine.easeIn',
          onComplete: () => {
            this.milestoneText.setVisible(false);
            this.milestoneText.setY(GAME_HEIGHT * 0.32);
          },
        });
      },
    });
  }
}
