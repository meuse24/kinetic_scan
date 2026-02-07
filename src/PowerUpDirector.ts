import Phaser from 'phaser';
import { getDifficultyPreset } from './Difficulty';
import type { DifficultyPreset } from './Difficulty';
import { PowerUp, PowerUpType } from './PowerUp';

export class PowerUpDirector {
  private scene: Phaser.Scene;
  private powerUps: Phaser.Physics.Arcade.Group;
  private readonly randomSpawnPool: PowerUpType[] = [
    PowerUpType.TRIPLE_SHOT,
    PowerUpType.TRIPLE_SHOT,
    PowerUpType.SLOW_MOTION,
    PowerUpType.SLOW_MOTION,
    PowerUpType.SHIELD,
    PowerUpType.SHIELD,
    PowerUpType.EMP_WAVE,
    PowerUpType.GHOST_PHASE,
    PowerUpType.BLACK_HOLE,
    PowerUpType.WINGMAN_DRONES,
    PowerUpType.CANNON_COOLING,
    PowerUpType.CANNON_COOLING,
  ];

  // Combo Logic
  private comboCount: number = 0;
  private lastKillTime: number = 0;
  private comboThreshold: number = 5;
  private comboTimeLimit: number = 3000;

  // Stats for Smart Trigger
  private misses: number = 0;
  private nearMisses: number = 0;
  private damageFreeTime: number = 0;
  private totalShots: number = 0;
  private hits: number = 0;

  // Score Logic
  private lastScoreThreshold: number = 0;
  private scoreInterval: number = 2500;

  // Time Logic
  private lastPowerUpTime: number = 0;
  private idleSpawnTime: number = 60000;
  private difficultyLevel: number = 1;
  private spawnRollChance: number = 1;
  private preset: DifficultyPreset = getDifficultyPreset('normal');

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.powerUps = scene.physics.add.group({
      classType: PowerUp,
      maxSize: 10,
    });
    this.lastPowerUpTime = scene.time.now;
    this.setDifficultyLevel(1);
  }

  public getGroup() {
    return this.powerUps;
  }

  public trackShot() {
    this.totalShots++;
  }
  public trackHit() {
    this.hits++;
  }
  public trackMiss() {
    this.misses++;
  }
  public trackNearMiss() {
    this.nearMisses++;
    if (this.nearMisses >= 3) {
      this.spawnPowerUp(this.scene.scale.width / 2, -50, PowerUpType.EMP_WAVE);
      this.nearMisses = 0;
    }
  }

  public resetDamageFreeTime() {
    this.damageFreeTime = 0;
  }

  public reset() {
    this.comboCount = 0;
    this.lastKillTime = 0;
    this.misses = 0;
    this.nearMisses = 0;
    this.damageFreeTime = 0;
    this.totalShots = 0;
    this.hits = 0;
    this.lastScoreThreshold = 0;
    this.lastPowerUpTime = this.scene.time.now;
    this.powerUps.clear(true, true);
  }

  public setDifficultyLevel(level: number) {
    this.difficultyLevel = Math.max(1, Math.floor(level));
    const ramp = this.difficultyLevel - 1;
    this.comboThreshold = Phaser.Math.Clamp(5 + Math.floor(ramp / 2), 5, 10);
    const dropScale = this.preset.powerUpDropScale;
    this.scoreInterval = Math.round((2500 + ramp * 340) / dropScale);
    this.idleSpawnTime = Math.round((60000 + ramp * 3200) / dropScale);
    this.spawnRollChance = Phaser.Math.Clamp((1 - ramp * 0.075) * dropScale, 0.3, 1);
  }

  public setDifficultyPreset(preset: DifficultyPreset) {
    this.preset = preset;
    this.setDifficultyLevel(this.difficultyLevel);
  }

  public onAsteroidDestroyed(x: number, y: number) {
    this.trackHit();
    const now = this.scene.time.now;
    if (now - this.lastKillTime < this.comboTimeLimit) this.comboCount++;
    else this.comboCount = 1;
    this.lastKillTime = now;

    if (this.comboCount >= this.comboThreshold) {
      this.spawnPowerUp(x, y);
      this.comboCount = 0;
    }
  }

  public update(score: number, delta: number) {
    const now = this.scene.time.now;
    this.damageFreeTime += delta;

    const w = this.scene.scale.width;
    const margin = Math.round(w * 0.1);

    // Smart Trigger: high accuracy yields support power-ups (more cooling than drones)
    const accuracy = this.hits / Math.max(1, this.totalShots);
    const supportStride = Phaser.Math.Clamp(
      Math.round((20 + (this.difficultyLevel - 1) * 6) / this.preset.powerUpDropScale),
      16,
      66,
    );
    if (accuracy > 0.82 && this.hits % supportStride === 0 && this.hits > 0) {
      const supportType =
        Phaser.Math.Between(0, 99) < 35 ? PowerUpType.WINGMAN_DRONES : PowerUpType.CANNON_COOLING;
      this.spawnPowerUp(Phaser.Math.Between(margin, w - margin), -50, supportType);
    }

    // Ghost Phase if taking too much heat (conceptual damage-free time check)
    if (this.damageFreeTime > 30000) {
      // 30s without damage
      // Maybe reward something else or spawn a Black Hole for challenge
    }

    if (score >= this.lastScoreThreshold + this.scoreInterval) {
      this.lastScoreThreshold = score;
      this.spawnPowerUp(Phaser.Math.Between(margin, w - margin), -50);
    }

    if (now - this.lastPowerUpTime > this.idleSpawnTime) {
      this.spawnPowerUp(Phaser.Math.Between(margin, w - margin), -50);
    }
  }

  private spawnPowerUp(x: number, y: number, forcedType?: PowerUpType) {
    if (!forcedType && Phaser.Math.FloatBetween(0, 1) > this.spawnRollChance) {
      this.lastPowerUpTime = this.scene.time.now;
      return;
    }
    const type = forcedType || Phaser.Utils.Array.GetRandom(this.getSpawnPool());
    const powerUp = this.powerUps.get(x, y) as PowerUp;
    if (powerUp) {
      powerUp.spawn(x, y, type);
      this.lastPowerUpTime = this.scene.time.now;
    }
  }

  private getSpawnPool() {
    if (this.difficultyLevel >= 7) {
      return [
        PowerUpType.TRIPLE_SHOT,
        PowerUpType.TRIPLE_SHOT,
        PowerUpType.SLOW_MOTION,
        PowerUpType.EMP_WAVE,
        PowerUpType.GHOST_PHASE,
        PowerUpType.BLACK_HOLE,
        PowerUpType.WINGMAN_DRONES,
        PowerUpType.CANNON_COOLING,
      ];
    }
    if (this.difficultyLevel >= 4) {
      return [
        PowerUpType.TRIPLE_SHOT,
        PowerUpType.TRIPLE_SHOT,
        PowerUpType.SLOW_MOTION,
        PowerUpType.SHIELD,
        PowerUpType.EMP_WAVE,
        PowerUpType.GHOST_PHASE,
        PowerUpType.BLACK_HOLE,
        PowerUpType.WINGMAN_DRONES,
        PowerUpType.CANNON_COOLING,
      ];
    }
    return this.randomSpawnPool;
  }
}
