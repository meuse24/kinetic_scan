import Phaser from 'phaser';
import type { DifficultyPresetKey } from '../Difficulty';
import {
  EARLY_LEVEL_TUNING,
  LEVEL_BONUS_TUNING,
  LEVEL_PROGRESS_TUNING,
  type IntRange,
} from '../MainSceneTuning';

export interface LevelBonusPayout {
  completedLevel: number;
  asteroidKills: number;
  specialKills: number;
  asteroidPoints: number;
  specialPoints: number;
  totalPoints: number;
}

interface ResetOpeningStateParams {
  difficultyKey: DifficultyPresetKey;
  progressionScore: number;
  rollRange: (range: IntRange) => number;
  setRuntimeIntensity?: (intensity: number) => void;
}

interface UpdateOpeningBalanceParams {
  delta: number;
  difficultyKey: DifficultyPresetKey;
  isGameOver: boolean;
  progressionScore: number;
  nextLevelScore: number;
  setRuntimeIntensity: (intensity: number) => void;
}

interface UpdateGuaranteedSupportDropParams {
  delta: number;
  difficultyKey: DifficultyPresetKey;
  isGameOver: boolean;
  lives: number;
  progressionScore: number;
  nextLevelScore: number;
  onSupportDropTriggered: () => void;
}

interface ShouldTriggerBossEncounterParams {
  difficultyKey: DifficultyPresetKey;
  isGameOver: boolean;
  isSwitching: boolean;
  isLevelTransition: boolean;
  progressionScore: number;
  nextLevelScore: number;
}

/**
 * Owns level-flow state and progression rules:
 * - boss-gate progression
 * - early-level intensity ramp
 * - guaranteed support-drop timer
 * - per-level kill counters for bonus payout
 */
export class MainLevelFlowSystem {
  private levelBossPendingDefeat: boolean = false;
  private levelAsteroidKillCount: number = 0;
  private levelSpecialKillCount: number = 0;
  private levelStartScore: number = 0;
  private levelElapsedMs: number = 0;
  private earlySupportDropGranted: boolean = false;
  private earlySupportDropTimerMs: number = 0;

  public resetForRun(params: ResetOpeningStateParams): void {
    this.levelBossPendingDefeat = false;
    this.levelAsteroidKillCount = 0;
    this.levelSpecialKillCount = 0;
    this.resetOpeningState(params);
  }

  public resetOpeningState(params: ResetOpeningStateParams): void {
    this.levelStartScore = params.progressionScore;
    this.levelElapsedMs = 0;
    this.earlySupportDropGranted = false;
    this.earlySupportDropTimerMs = params.rollRange(
      EARLY_LEVEL_TUNING.guaranteedSupportDropDelayMs[params.difficultyKey],
    );
    if (params.setRuntimeIntensity) {
      params.setRuntimeIntensity(EARLY_LEVEL_TUNING.minIntensity[params.difficultyKey]);
    }
  }

  public updateOpeningBalance(params: UpdateOpeningBalanceParams): void {
    if (this.levelBossPendingDefeat || params.isGameOver) {
      params.setRuntimeIntensity(1);
      return;
    }
    this.levelElapsedMs += params.delta;
    const timeRamp = Phaser.Math.Clamp(
      this.levelElapsedMs / EARLY_LEVEL_TUNING.rampDurationMs[params.difficultyKey],
      0,
      1,
    );
    const scoreRamp = Phaser.Math.Clamp(
      this.getLevelProgressRatio(params.progressionScore, params.nextLevelScore) /
        EARLY_LEVEL_TUNING.scoreRampPortion,
      0,
      1,
    );
    const easedRamp = Phaser.Math.Easing.Cubic.Out(Math.max(timeRamp, scoreRamp));
    const minIntensity = EARLY_LEVEL_TUNING.minIntensity[params.difficultyKey];
    params.setRuntimeIntensity(Phaser.Math.Linear(minIntensity, 1, easedRamp));
  }

  public updateGuaranteedSupportDrop(params: UpdateGuaranteedSupportDropParams): void {
    if (this.earlySupportDropGranted || this.levelBossPendingDefeat || params.isGameOver) return;
    this.earlySupportDropTimerMs -= params.delta;
    const lowLifeUrgency = params.lives <= 1 && this.levelElapsedMs > 2400;
    const progressReady =
      this.getLevelProgressRatio(params.progressionScore, params.nextLevelScore) >= 0.32;
    if (this.earlySupportDropTimerMs > 0 && !lowLifeUrgency && !progressReady) return;
    this.markSupportDropTriggered();
    params.onSupportDropTriggered();
  }

  public shouldTriggerBossEncounter(params: ShouldTriggerBossEncounterParams): boolean {
    if (
      params.isGameOver ||
      params.isSwitching ||
      params.isLevelTransition ||
      this.levelBossPendingDefeat
    ) {
      return false;
    }
    if (params.progressionScore < params.nextLevelScore) return false;
    return this.getRemainingBossGateTimeMs(params.difficultyKey, params.isGameOver) <= 0;
  }

  public triggerBossEncounter(): boolean {
    if (this.levelBossPendingDefeat) return false;
    this.levelBossPendingDefeat = true;
    return true;
  }

  public clearBossPendingDefeat(): boolean {
    if (!this.levelBossPendingDefeat) return false;
    this.levelBossPendingDefeat = false;
    return true;
  }

  public getRemainingBossGateTimeMs(
    difficultyKey: DifficultyPresetKey,
    isGameOver: boolean,
  ): number {
    if (this.levelBossPendingDefeat || isGameOver) return 0;
    const minDurationMs = LEVEL_PROGRESS_TUNING.minLevelDurationMs[difficultyKey];
    return Math.max(0, minDurationMs - this.levelElapsedMs);
  }

  public getLevelProgressRatio(progressionScore: number, nextLevelScore: number): number {
    const requirement = Math.max(1, nextLevelScore - this.levelStartScore);
    const gained = Math.max(0, progressionScore - this.levelStartScore);
    return Phaser.Math.Clamp(gained / requirement, 0, 1);
  }

  public registerAsteroidKill(): void {
    this.levelAsteroidKillCount += 1;
  }

  public registerSpecialKill(): void {
    this.levelSpecialKillCount += 1;
  }

  public consumeLevelBonusPayout(completedLevel: number): LevelBonusPayout {
    const asteroidKills = this.levelAsteroidKillCount;
    const specialKills = this.levelSpecialKillCount;
    this.levelAsteroidKillCount = 0;
    this.levelSpecialKillCount = 0;
    const asteroidPoints = asteroidKills * LEVEL_BONUS_TUNING.asteroidKillPoints;
    const specialPoints = specialKills * LEVEL_BONUS_TUNING.specialKillPoints;
    return {
      completedLevel,
      asteroidKills,
      specialKills,
      asteroidPoints,
      specialPoints,
      totalPoints: asteroidPoints + specialPoints,
    };
  }

  public expediteSupportDropTimer(maxMs: number): void {
    this.earlySupportDropTimerMs = Math.min(this.earlySupportDropTimerMs, maxMs);
  }

  public markSupportDropTriggered(): void {
    this.earlySupportDropGranted = true;
  }

  public isBossPendingDefeat(): boolean {
    return this.levelBossPendingDefeat;
  }

  public getLevelElapsedMs(): number {
    return this.levelElapsedMs;
  }

  public getLevelStartScore(): number {
    return this.levelStartScore;
  }

  public isSupportDropGranted(): boolean {
    return this.earlySupportDropGranted;
  }

  public getSupportDropTimerMs(): number {
    return this.earlySupportDropTimerMs;
  }
}
