import Phaser from 'phaser';
import { PowerUp, PowerUpType } from './PowerUp';

export class PowerUpDirector {
  private scene: Phaser.Scene;
  private powerUps: Phaser.Physics.Arcade.Group;

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

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.powerUps = scene.physics.add.group({
      classType: PowerUp,
      maxSize: 10,
    });
    this.lastPowerUpTime = scene.time.now;
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

    // Smart Trigger: Drones for high accuracy
    const accuracy = this.hits / Math.max(1, this.totalShots);
    if (accuracy > 0.8 && this.hits % 20 === 0 && this.hits > 0) {
      this.spawnPowerUp(Phaser.Math.Between(100, 900), -50, PowerUpType.WINGMAN_DRONES);
    }

    // Ghost Phase if taking too much heat (conceptual damage-free time check)
    if (this.damageFreeTime > 30000) {
      // 30s without damage
      // Maybe reward something else or spawn a Black Hole for challenge
    }

    if (score >= this.lastScoreThreshold + this.scoreInterval) {
      this.lastScoreThreshold = score;
      this.spawnPowerUp(Phaser.Math.Between(100, 900), -50);
    }

    if (now - this.lastPowerUpTime > this.idleSpawnTime) {
      this.spawnPowerUp(Phaser.Math.Between(100, 900), -50);
    }
  }

  private spawnPowerUp(x: number, y: number, forcedType?: PowerUpType) {
    const type = forcedType || Phaser.Utils.Array.GetRandom(Object.values(PowerUpType));
    const powerUp = this.powerUps.get(x, y) as PowerUp;
    if (powerUp) {
      powerUp.spawn(x, y, type);
      this.lastPowerUpTime = this.scene.time.now;
    }
  }
}
