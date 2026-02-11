import Phaser from 'phaser';
import { getDifficultyPreset } from './Difficulty';
import type { DifficultyPreset } from './Difficulty';
import { PowerUp, PowerUpType } from './PowerUp';

const SHIELD_BUNKER_REROLL_PERCENT = 45;
const MAX_ACTIVE_POWER_UPS = 15;
const MAX_DROPS_PER_ENEMY = 3;

type EnemyDropTier = 'asteroid' | 'skyRaider' | 'ufoScout' | 'ufoBoss';
type EnemyDropProfile = {
  guaranteedDrops: number;
  firstDropChance: number;
  secondDropChance: number;
  thirdDropChance: number;
  spreadRadius: number;
};

const ENEMY_DROP_PROFILES: Record<EnemyDropTier, EnemyDropProfile> = {
  asteroid: {
    guaranteedDrops: 0,
    firstDropChance: 0.22,
    secondDropChance: 0.06,
    thirdDropChance: 0.02,
    spreadRadius: 34,
  },
  skyRaider: {
    guaranteedDrops: 1,
    firstDropChance: 1,
    secondDropChance: 0.32,
    thirdDropChance: 0.12,
    spreadRadius: 42,
  },
  ufoScout: {
    guaranteedDrops: 1,
    firstDropChance: 1,
    secondDropChance: 0.5,
    thirdDropChance: 0.22,
    spreadRadius: 50,
  },
  ufoBoss: {
    guaranteedDrops: 2,
    firstDropChance: 1,
    secondDropChance: 1,
    thirdDropChance: 0.68,
    spreadRadius: 62,
  },
};

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
    PowerUpType.SHIELD_BUNKER,
    PowerUpType.SHIELD_BUNKER,
    PowerUpType.MINE_LAYER,
  ];

  // Combo logic for asteroid chain kills (bonus drop chance)
  private comboCount: number = 0;
  private lastKillTime: number = 0;
  private comboThreshold: number = 5;
  private comboTimeLimit: number = 3000;

  private difficultyLevel: number = 1;
  private spawnRollChance: number = 1;
  private preset: DifficultyPreset = getDifficultyPreset('normal');

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.powerUps = scene.physics.add.group({
      classType: PowerUp,
      maxSize: MAX_ACTIVE_POWER_UPS,
    });
    this.setDifficultyLevel(1);
  }

  public getGroup() {
    return this.powerUps;
  }

  public resetDamageFreeTime() {
    // Intentionally left as a no-op: drops are now kill-event based only.
  }

  public resetForLevelStart(_score: number) {
    this.comboCount = 0;
    this.lastKillTime = 0;
    this.deactivateAllPowerUps();
  }

  public reset() {
    this.comboCount = 0;
    this.lastKillTime = 0;
    this.deactivateAllPowerUps();
  }

  private deactivateAllPowerUps() {
    const children = this.powerUps.getChildren() as PowerUp[];
    for (const powerUp of children) {
      if (!powerUp) continue;
      powerUp.deactivate();
    }
  }

  public setDifficultyLevel(level: number) {
    this.difficultyLevel = Math.max(1, Math.floor(level));
    const ramp = this.difficultyLevel - 1;
    this.comboThreshold = Phaser.Math.Clamp(5 + Math.floor(ramp / 2), 5, 10);
    const dropScale = this.preset.powerUpDropScale;
    this.spawnRollChance = Phaser.Math.Clamp((1 - ramp * 0.045) * dropScale, 0.4, 1);
  }

  public setDifficultyPreset(preset: DifficultyPreset) {
    this.preset = preset;
    this.setDifficultyLevel(this.difficultyLevel);
  }

  public onAsteroidDestroyed(x: number, y: number) {
    const now = this.scene.time.now;
    if (now - this.lastKillTime < this.comboTimeLimit) this.comboCount++;
    else this.comboCount = 1;
    this.lastKillTime = now;

    const comboBonus = this.comboCount >= this.comboThreshold;
    if (comboBonus) {
      this.comboCount = 0;
    }

    this.spawnDropsFromEnemyKill(x, y, 'asteroid', comboBonus);
  }

  public onSkyRaiderDestroyed(x: number, y: number) {
    this.spawnDropsFromEnemyKill(x, y, 'skyRaider');
  }

  public onUfoDestroyed(x: number, y: number, variant: 'scout' | 'boss') {
    this.spawnDropsFromEnemyKill(x, y, variant === 'boss' ? 'ufoBoss' : 'ufoScout');
  }

  public update(_score: number, _delta: number) {
    // No timed/score-based drops: pickups only come from destroyed enemies.
  }

  public spawnGuaranteedSupportDrop(_preferredX?: number, _y: number = -50): PowerUpType | null {
    // Disabled by design to keep drop sources limited to enemy-destruction events.
    return null;
  }

  private spawnDropsFromEnemyKill(
    x: number,
    y: number,
    tier: EnemyDropTier,
    comboBonus: boolean = false,
  ) {
    const profile = ENEMY_DROP_PROFILES[tier];
    let dropCount = this.rollDropCount(profile);
    if (comboBonus) {
      dropCount = Math.min(MAX_DROPS_PER_ENEMY, dropCount + 1);
    }
    if (dropCount <= 0) return 0;

    const width = this.scene.scale.width;
    const height = this.scene.scale.height;
    const margin = Math.round(width * 0.08);
    const maxY = Math.round(height * 0.84);
    let spawned = 0;

    for (let i = 0; i < dropCount; i++) {
      if (this.powerUps.countActive(true) >= MAX_ACTIVE_POWER_UPS) break;
      const jitterX = Phaser.Math.Between(-profile.spreadRadius, profile.spreadRadius);
      const jitterY = Phaser.Math.Between(
        -Math.round(profile.spreadRadius * 0.45),
        Math.round(profile.spreadRadius * 0.35),
      );
      const dropX = Phaser.Math.Clamp(Math.round(x + jitterX), margin, width - margin);
      const dropY = Phaser.Math.Clamp(Math.round(y + jitterY), -50, maxY);
      if (this.spawnPowerUp(dropX, dropY)) {
        spawned++;
      }
    }

    return spawned;
  }

  private rollDropCount(profile: EnemyDropProfile) {
    const chanceScale = Phaser.Math.Clamp(this.spawnRollChance, 0.4, 1.05);
    let drops = profile.guaranteedDrops;
    if (
      drops < 1 &&
      Phaser.Math.FloatBetween(0, 1) <=
        Phaser.Math.Clamp(profile.firstDropChance * chanceScale, 0, 1)
    ) {
      drops = 1;
    }
    if (
      drops < 2 &&
      Phaser.Math.FloatBetween(0, 1) <=
        Phaser.Math.Clamp(profile.secondDropChance * chanceScale, 0, 1)
    ) {
      drops = 2;
    }
    if (
      drops < 3 &&
      Phaser.Math.FloatBetween(0, 1) <=
        Phaser.Math.Clamp(profile.thirdDropChance * chanceScale, 0, 1)
    ) {
      drops = 3;
    }
    return Phaser.Math.Clamp(drops, 0, MAX_DROPS_PER_ENEMY);
  }

  private spawnPowerUp(x: number, y: number) {
    if (this.powerUps.countActive(true) >= MAX_ACTIVE_POWER_UPS) return false;

    const spawnPool = this.getSpawnPool();
    let type = Phaser.Utils.Array.GetRandom(spawnPool);
    if (
      type === PowerUpType.SHIELD_BUNKER &&
      Phaser.Math.Between(0, 99) < SHIELD_BUNKER_REROLL_PERCENT
    ) {
      const fallbackPool = spawnPool.filter((entry) => entry !== PowerUpType.SHIELD_BUNKER);
      if (fallbackPool.length > 0) {
        type = Phaser.Utils.Array.GetRandom(fallbackPool);
      }
    }

    const powerUp = this.powerUps.get(x, y) as PowerUp;
    if (!powerUp) return false;
    powerUp.spawn(x, y, type);
    return true;
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
        PowerUpType.SHIELD_BUNKER,
        PowerUpType.SHIELD_BUNKER,
        PowerUpType.MINE_LAYER,
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
        PowerUpType.SHIELD_BUNKER,
        PowerUpType.SHIELD_BUNKER,
        PowerUpType.MINE_LAYER,
      ];
    }
    return this.randomSpawnPool;
  }
}
