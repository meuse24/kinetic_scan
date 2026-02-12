/**
 * HUDManager
 *
 * Manages all HUD rendering and updates:
 * - Score/Lives text (1P/2P modes)
 * - Level/Difficulty display
 * - Mine charges display
 * - Perk display
 * - Power-up progress bar
 * - Heat bar
 * - Active player marker (2P mode)
 *
 * Extracted from MainScene (lines 839-938, 1268-1290, 1653-1662)
 * Reduces MainScene by ~150 lines
 */

import type Phaser from 'phaser';

/**
 * Clamp a value between min and max
 */
function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export interface HUDManagerConfig {
  gameWidth: number;
}

export interface HUDComponents {
  p1ScoreText: Phaser.GameObjects.Text;
  p2ScoreText?: Phaser.GameObjects.Text;
  p1LivesText: Phaser.GameObjects.Text;
  p2LivesText?: Phaser.GameObjects.Text;
  levelText: Phaser.GameObjects.Text;
  mineChargesText: Phaser.GameObjects.Text;
  perkText: Phaser.GameObjects.Text;
  powerUpBar: Phaser.GameObjects.Graphics;
  heatBar: Phaser.GameObjects.Graphics;
  activeMarkerLeft?: Phaser.GameObjects.Text;
  activeMarkerRight?: Phaser.GameObjects.Text;
}

export interface HUDState {
  // Score & Lives
  p1Score: number;
  p2Score: number;
  p1Lives: number;
  p2Lives: number;

  // Level progression
  level: number;
  mineCharges: number;
  playerCount: 1 | 2;
  activePlayerIndex: 0 | 1;
  levelBossPendingDefeat: boolean;
  nextLevelScore: number;
  progressionScore: number;
  remainingBossGateTimeMs: number;
  difficultyLabel: string;

  // Perks
  eliteLifePerkCount: number;
  eliteCoolingPerkLevel: number;
  eliteMagnetPerkLevel: number;

  // Power-up bar
  powerUpTimer: number;
  powerUpBarMaxDuration: number;
  time: number; // scene.time.now for animations

  // Heat bar
  playerHeat: number; // normalized 0-1
  playerActive: boolean;
  playerOverheated: boolean;
  heatBarAnchor: { x: number; y: number };
}

/**
 * HUDManager handles all HUD rendering and updates
 */
export class HUDManager {
  private scene: Phaser.Scene;
  private components: HUDComponents;
  private gameWidth: number;

  // Cache for change detection
  private lastP1ScoreLabel = '';
  private lastP2ScoreLabel = '';
  private lastP1LivesLabel = '';
  private lastP2LivesLabel = '';
  private lastLevelLabel = '';
  private lastMineChargesLabel = '';
  private lastPerkLabel = '';
  private lastActiveMarkerIndex = -1;

  // Active marker animation
  private activeMarkerTween?: Phaser.Tweens.Tween;

  constructor(scene: Phaser.Scene, components: HUDComponents, config: HUDManagerConfig) {
    this.scene = scene;
    this.components = components;
    this.gameWidth = config.gameWidth;
  }

  /**
   * Update all HUD elements based on current state
   */
  update(state: HUDState): void {
    this.updateScoresAndLives(state);
    this.updateLevelDisplay(state);
    this.updateMineCharges(state);
    this.updatePerkDisplay(state);
    this.updatePowerUpBar(state);
    this.updateHeatBar(state);

    if (state.playerCount === 2) {
      this.updateActiveMarker(state);
    }
  }

  /**
   * Cleanup animations and reset state
   */
  cleanup(): void {
    if (this.activeMarkerTween) {
      this.activeMarkerTween.stop();
      this.activeMarkerTween = undefined;
    }
    this.lastActiveMarkerIndex = -1;
  }

  /**
   * Update score and lives displays (1P or 2P mode)
   */
  private updateScoresAndLives(state: HUDState): void {
    if (state.playerCount === 2) {
      // 2P mode: show both players' scores and lives
      const p1ScoreLabel = `P1 SCORE: ${state.p1Score}`;
      if (p1ScoreLabel !== this.lastP1ScoreLabel) {
        this.components.p1ScoreText.setText(p1ScoreLabel);
        this.lastP1ScoreLabel = p1ScoreLabel;
      }

      const p2ScoreLabel = `P2 SCORE: ${state.p2Score}`;
      if (p2ScoreLabel !== this.lastP2ScoreLabel) {
        this.components.p2ScoreText?.setText(p2ScoreLabel);
        this.lastP2ScoreLabel = p2ScoreLabel;
      }

      const p1LivesLabel = `P1 LIVES: ${state.p1Lives}`;
      if (p1LivesLabel !== this.lastP1LivesLabel) {
        this.components.p1LivesText.setText(p1LivesLabel);
        this.lastP1LivesLabel = p1LivesLabel;
      }

      const p2LivesLabel = `P2 LIVES: ${state.p2Lives}`;
      if (p2LivesLabel !== this.lastP2LivesLabel) {
        this.components.p2LivesText?.setText(p2LivesLabel);
        this.lastP2LivesLabel = p2LivesLabel;
      }
    } else {
      // 1P mode: show single player score and lives
      const p1ScoreLabel = `SCORE: ${state.p1Score}`;
      if (p1ScoreLabel !== this.lastP1ScoreLabel) {
        this.components.p1ScoreText.setText(p1ScoreLabel);
        this.lastP1ScoreLabel = p1ScoreLabel;
      }

      const p1LivesLabel = `LIVES: ${state.p1Lives}`;
      if (p1LivesLabel !== this.lastP1LivesLabel) {
        this.components.p1LivesText.setText(p1LivesLabel);
        this.lastP1LivesLabel = p1LivesLabel;
      }
    }
  }

  /**
   * Update level/difficulty/progress display
   */
  private updateLevelDisplay(state: HUDState): void {
    let nextLevelLabel = '';

    if (state.levelBossPendingDefeat) {
      nextLevelLabel = `${state.difficultyLabel}  LEVEL ${state.level}  BOSS FIGHT`;
    } else {
      const scoreRemaining = Math.max(0, state.nextLevelScore - state.progressionScore);
      const timeRemainingSec = Math.ceil(state.remainingBossGateTimeMs / 1000);

      if (timeRemainingSec > 0) {
        nextLevelLabel = `${state.difficultyLabel}  LEVEL ${state.level}  SURVIVE ${scoreRemaining}  T-${timeRemainingSec}s`;
      } else {
        nextLevelLabel = `${state.difficultyLabel}  LEVEL ${state.level}  SURVIVE ${scoreRemaining}`;
      }
    }

    if (nextLevelLabel !== this.lastLevelLabel) {
      this.components.levelText.setText(nextLevelLabel);
      this.lastLevelLabel = nextLevelLabel;
    }
  }

  /**
   * Update mine charges display
   */
  private updateMineCharges(state: HUDState): void {
    const mineChargesLabel = `MINES: ${state.mineCharges}`;
    if (mineChargesLabel !== this.lastMineChargesLabel) {
      this.components.mineChargesText.setText(mineChargesLabel);
      this.lastMineChargesLabel = mineChargesLabel;
    }
  }

  /**
   * Update perk display (shows stacked perk levels)
   */
  private updatePerkDisplay(state: HUDState): void {
    const perkLabel = `PERKS L+${state.eliteLifePerkCount} C+${state.eliteCoolingPerkLevel} M+${state.eliteMagnetPerkLevel}`;
    if (perkLabel !== this.lastPerkLabel) {
      this.components.perkText.setText(perkLabel);
      this.lastPerkLabel = perkLabel;
    }
  }

  /**
   * Update power-up progress bar
   * Extracted from MainScene:839-850
   */
  private updatePowerUpBar(state: HUDState): void {
    this.components.powerUpBar.clear();

    const width = 200;
    const progress = clamp(state.powerUpTimer / Math.max(1, state.powerUpBarMaxDuration), 0, 1);

    this.components.powerUpBar.fillStyle(0x00ffff, 0.8);
    this.components.powerUpBar.fillRect(this.gameWidth / 2 - width / 2, 80, width * progress, 10);

    // Blinking border effect
    if (Math.sin(state.time * 0.01) > 0) {
      this.components.powerUpBar.lineStyle(2, 0xffffff, 1);
      this.components.powerUpBar.strokeRect(this.gameWidth / 2 - width / 2, 80, width, 10);
    }
  }

  /**
   * Update heat bar (shows player weapon heat)
   * Extracted from MainScene:852-876
   */
  private updateHeatBar(state: HUDState): void {
    this.components.heatBar.clear();

    if (!state.playerActive) return;
    if (state.playerHeat <= 0) return;

    const width = 50;
    const height = 4;
    const anchor = state.heatBarAnchor;
    const x = anchor.x - width / 2;
    const y = anchor.y;

    // Background
    this.components.heatBar.fillStyle(0x000000, 0.6);
    this.components.heatBar.fillRect(x - 1, y - 1, width + 2, height + 2);

    // Heat fill (blinking red when overheated)
    if (state.playerOverheated) {
      const blinkOn = Math.floor(state.time / 150) % 2 === 0;
      if (!blinkOn) return;
      this.components.heatBar.fillStyle(0xff3333, 0.95);
    } else {
      // Gradient from yellow-green (cool) to red (hot)
      const t = clamp(state.playerHeat, 0, 1);
      const r = Math.round(255 * t);
      const g = Math.round(255 - 204 * t);
      const b = Math.round(102 - 51 * t);
      this.components.heatBar.fillStyle((r << 16) | (g << 8) | b, 0.9);
    }

    this.components.heatBar.fillRect(x, y, width * state.playerHeat, height);
  }

  /**
   * Update active player marker (2P mode only)
   * Extracted from MainScene:1268-1290
   */
  private updateActiveMarker(state: HUDState): void {
    if (!this.components.activeMarkerLeft || !this.components.activeMarkerRight) return;
    if (this.lastActiveMarkerIndex === state.activePlayerIndex) return;

    const activeLeft = state.activePlayerIndex === 0;

    // Show both markers with different opacity
    this.components.activeMarkerLeft.setVisible(true);
    this.components.activeMarkerRight.setVisible(true);
    this.components.activeMarkerLeft.setAlpha(activeLeft ? 1 : 0.2);
    this.components.activeMarkerRight.setAlpha(activeLeft ? 0.2 : 1);

    // Stop previous tween
    if (this.activeMarkerTween) {
      this.activeMarkerTween.stop();
      this.activeMarkerTween = undefined;
    }

    // Pulsing animation on active marker
    const target = activeLeft
      ? this.components.activeMarkerLeft
      : this.components.activeMarkerRight;
    this.activeMarkerTween = this.scene.tweens.add({
      targets: target,
      alpha: 0.2,
      duration: 400,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    this.lastActiveMarkerIndex = state.activePlayerIndex;
  }
}
