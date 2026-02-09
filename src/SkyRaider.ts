import { AudioManager } from './AudioManager';
import { getDifficultyPreset } from './Difficulty';
import type { DifficultyPreset } from './Difficulty';

export type SkyRaiderVariant = 'stalker' | 'lancer';
type SkyRaiderState = 'enter' | 'engage' | 'dive' | 'retreat';

const SKY_RAIDER_STALKER_TEXTURE = 'sky_raider_stalker';
const SKY_RAIDER_LANCER_TEXTURE = 'sky_raider_lancer';
const SKY_RAIDER_SHOT_TEXTURE = 'sky_raider_shot';

function ensureSkyRaiderTextures(scene: Phaser.Scene) {
  if (!scene.textures.exists(SKY_RAIDER_STALKER_TEXTURE)) {
    const g = scene.make.graphics({ x: 0, y: 0 });
    g.fillStyle(0x11253b, 0.96);
    g.lineStyle(2, 0x79dcff, 1);
    g.beginPath();
    g.moveTo(32, 6);
    g.lineTo(54, 40);
    g.lineTo(44, 52);
    g.lineTo(32, 46);
    g.lineTo(20, 52);
    g.lineTo(10, 40);
    g.closePath();
    g.fillPath();
    g.strokePath();
    g.fillStyle(0x89f7ff, 0.85);
    g.fillTriangle(32, 14, 39, 31, 25, 31);
    g.fillStyle(0x6af0ff, 0.7);
    g.fillCircle(19, 40, 4);
    g.fillCircle(45, 40, 4);
    g.generateTexture(SKY_RAIDER_STALKER_TEXTURE, 64, 64);
    g.destroy();
  }

  if (!scene.textures.exists(SKY_RAIDER_LANCER_TEXTURE)) {
    const g = scene.make.graphics({ x: 0, y: 0 });
    g.fillStyle(0x2d123d, 0.96);
    g.lineStyle(2, 0xff9df5, 1);
    g.beginPath();
    g.moveTo(32, 4);
    g.lineTo(58, 36);
    g.lineTo(48, 58);
    g.lineTo(32, 50);
    g.lineTo(16, 58);
    g.lineTo(6, 36);
    g.closePath();
    g.fillPath();
    g.strokePath();
    g.fillStyle(0xfff2a6, 0.85);
    g.fillTriangle(32, 12, 40, 31, 24, 31);
    g.fillStyle(0xff9fd8, 0.78);
    g.fillCircle(15, 38, 4);
    g.fillCircle(49, 38, 4);
    g.generateTexture(SKY_RAIDER_LANCER_TEXTURE, 64, 64);
    g.destroy();
  }

  if (!scene.textures.exists(SKY_RAIDER_SHOT_TEXTURE)) {
    const g = scene.make.graphics({ x: 0, y: 0 });
    g.fillStyle(0x7cffe1, 0.35);
    g.fillCircle(8, 8, 8);
    g.fillStyle(0xb2fff1, 0.92);
    g.fillCircle(8, 8, 4);
    g.lineStyle(1, 0xffffff, 0.95);
    g.strokeCircle(8, 8, 6);
    g.generateTexture(SKY_RAIDER_SHOT_TEXTURE, 16, 16);
    g.destroy();
  }
}

export class SkyRaiderShot extends Phaser.Physics.Arcade.Sprite {
  private variant: SkyRaiderVariant = 'stalker';

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, SKY_RAIDER_SHOT_TEXTURE);
  }

  public fire(
    x: number,
    y: number,
    velocityX: number,
    velocityY: number,
    variant: SkyRaiderVariant,
  ) {
    this.variant = variant;
    this.enableBody(true, x, y, true, true);
    this.setActive(true);
    this.setVisible(true);
    this.setScale(variant === 'lancer' ? 1.2 : 1);
    this.clearTint();
    if (variant === 'lancer') this.setTint(0xffd8ff);
    this.setVelocity(velocityX, velocityY);
    this.setRotation(Math.atan2(velocityY, velocityX) + Math.PI / 2);
  }

  preUpdate(time: number, delta: number) {
    super.preUpdate(time, delta);
    if (!this.active) return;
    this.rotation += delta * (this.variant === 'lancer' ? 0.02 : 0.013);
    const width = this.scene.scale.width;
    const height = this.scene.scale.height;
    const pad = 130;
    if (this.x < -pad || this.x > width + pad || this.y < -pad || this.y > height + pad) {
      this.disableBody(true, true);
    }
  }
}

type SkyRaiderSpawnConfig = {
  variant: SkyRaiderVariant;
  level: number;
  preset: DifficultyPreset;
  target: Phaser.Physics.Arcade.Sprite | null;
};

export class SkyRaider extends Phaser.Physics.Arcade.Sprite {
  private audioManager: AudioManager;
  private projectilePool: Phaser.Physics.Arcade.Group;
  private variant: SkyRaiderVariant = 'stalker';
  private behaviorState: SkyRaiderState = 'enter';
  private combatTarget: Phaser.Physics.Arcade.Sprite | null = null;
  private level: number = 1;
  private preset: DifficultyPreset = getDifficultyPreset('normal');
  private speedScale: number = 1;
  private aggressionScale: number = 1;
  private projectileScale: number = 1;
  private hitPoints: number = 1;
  private maxHitPoints: number = 1;
  private enterTargetY: number = 120;
  private retreatAt: number = 0;
  private nextShotAt: number = 0;
  private nextManeuverAt: number = 0;
  private diveEndAt: number = 0;
  private movementSeed: number = 0;
  private strafeDir: 1 | -1 = 1;
  private retreatLateralDir: 1 | -1 = 1;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    audio: AudioManager,
    projectiles: Phaser.Physics.Arcade.Group,
  ) {
    ensureSkyRaiderTextures(scene);
    super(scene, x, y, SKY_RAIDER_STALKER_TEXTURE);
    this.audioManager = audio;
    this.projectilePool = projectiles;

    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setDepth(56);
    this.setBodySize(40, 24, true);
    this.disableBody(true, true);
  }

  public setCombatTarget(target: Phaser.Physics.Arcade.Sprite | null) {
    this.combatTarget = target;
  }

  public getVariant(): SkyRaiderVariant {
    return this.variant;
  }

  public getHealth() {
    return this.hitPoints;
  }

  public getMaxHealth() {
    return this.maxHitPoints;
  }

  public spawn(config: SkyRaiderSpawnConfig) {
    const width = this.scene.scale.width;
    const height = this.scene.scale.height;
    this.variant = config.variant;
    this.level = Math.max(1, Math.floor(config.level));
    this.preset = config.preset;
    this.combatTarget = config.target;
    this.behaviorState = 'enter';
    this.movementSeed = Phaser.Math.FloatBetween(0, Math.PI * 2);
    this.strafeDir = Phaser.Math.Between(0, 1) === 0 ? -1 : 1;
    this.retreatLateralDir = this.strafeDir;
    this.diveEndAt = 0;

    const levelScale = Phaser.Math.Clamp(1 + (this.level - 1) * 0.05, 1, 1.9);
    this.speedScale = levelScale * this.preset.enemySpeedScale;
    this.aggressionScale = levelScale * this.preset.enemySpawnScale;
    this.projectileScale = Phaser.Math.Clamp(
      (1 + (this.level - 1) * 0.04) * this.preset.bossProjectileSpeedScale,
      0.9,
      2.2,
    );

    const spawnX = Phaser.Math.Between(70, width - 70);
    this.enableBody(true, spawnX, -86, true, true);
    this.setActive(true);
    this.setVisible(true);

    if (this.variant === 'lancer') {
      this.setTexture(SKY_RAIDER_LANCER_TEXTURE);
      this.setBodySize(46, 26, true);
      this.maxHitPoints = Phaser.Math.Clamp(2 + Math.floor((this.level - 1) / 6), 2, 5);
      this.enterTargetY = Phaser.Math.Between(88, Math.round(height * 0.28));
    } else {
      this.setTexture(SKY_RAIDER_STALKER_TEXTURE);
      this.setBodySize(40, 24, true);
      this.maxHitPoints = Phaser.Math.Clamp(1 + Math.floor((this.level - 1) / 7), 1, 3);
      this.enterTargetY = Phaser.Math.Between(104, Math.round(height * 0.35));
    }
    this.hitPoints = this.maxHitPoints;

    const lifetimeBase = this.variant === 'lancer' ? 7600 : 9200;
    const lifetimePenalty =
      (this.level - 1) * 125 * Phaser.Math.Clamp(this.preset.enemySpawnScale, 0.8, 1.3);
    const lifetime = Phaser.Math.Clamp(lifetimeBase - lifetimePenalty, 5000, 9800);
    this.retreatAt =
      this.scene.time.now +
      Phaser.Math.Between(Math.round(lifetime * 0.86), Math.round(lifetime * 1.12));

    const firstShotDelay =
      this.variant === 'lancer' ? Phaser.Math.Between(640, 980) : Phaser.Math.Between(860, 1320);
    this.nextShotAt =
      this.scene.time.now +
      Math.round(firstShotDelay / Phaser.Math.Clamp(this.aggressionScale, 0.9, 2.2));
    this.nextManeuverAt = this.scene.time.now + Phaser.Math.Between(520, 980);
    this.setVelocity(0, 120 * this.speedScale);
    this.setRotation(Math.PI);
    this.clearTint();
  }

  public applyBulletHit(damage: number = 1) {
    if (!this.active) {
      return {
        destroyed: false,
        variant: this.variant,
        health: this.hitPoints,
        maxHealth: this.maxHitPoints,
      };
    }
    this.hitPoints = Math.max(0, this.hitPoints - damage);
    if (this.hitPoints <= 0) {
      const variant = this.variant;
      this.deactivate();
      return { destroyed: true, variant, health: 0, maxHealth: this.maxHitPoints };
    }
    this.setTint(0xffffff);
    this.scene.time.delayedCall(55, () => {
      if (this.active) this.clearTint();
    });
    return {
      destroyed: false,
      variant: this.variant,
      health: this.hitPoints,
      maxHealth: this.maxHitPoints,
    };
  }

  public deactivate() {
    if (this.body) this.disableBody(true, true);
    else this.setActive(false).setVisible(false);
  }

  private getBody() {
    return this.body as Phaser.Physics.Arcade.Body | null;
  }

  private enterRetreat() {
    if (!this.active || this.behaviorState === 'retreat') return;
    const width = this.scene.scale.width;
    this.behaviorState = 'retreat';
    this.retreatLateralDir = this.x < width * 0.5 ? -1 : 1;
    this.nextShotAt = Number.MAX_SAFE_INTEGER;
    const exitSpeedY = (this.variant === 'lancer' ? 300 : 240) * this.speedScale;
    this.setVelocity(this.retreatLateralDir * 120 * this.speedScale, -exitSpeedY);
  }

  private updateEnter(time: number) {
    const body = this.getBody();
    if (!body) return;
    const enterSpeed = (this.variant === 'lancer' ? 165 : 140) * this.speedScale;
    const sway = Math.sin(time * 0.0023 + this.movementSeed) * 46;
    body.velocity.x = Phaser.Math.Linear(body.velocity.x, sway, 0.12);
    body.velocity.y = Phaser.Math.Linear(body.velocity.y, enterSpeed, 0.2);
    if (this.y >= this.enterTargetY) {
      this.behaviorState = 'engage';
      this.nextManeuverAt = time + Phaser.Math.Between(520, 980);
    }
  }

  private updateStalkerEngage(time: number) {
    const body = this.getBody();
    if (!body) return;
    const targetX = this.combatTarget?.x ?? this.scene.scale.width * 0.5;
    const dx = targetX - this.x;
    const trackSpeed =
      Phaser.Math.Clamp(dx * 1.35, -220, 220) * Phaser.Math.Clamp(this.aggressionScale, 0.9, 2.1);
    const weave = Math.sin(time * 0.003 + this.movementSeed) * 58;
    const driftY = Math.sin(time * 0.004 + this.movementSeed * 1.8) * 34;
    body.velocity.x = Phaser.Math.Linear(body.velocity.x, trackSpeed + weave, 0.13);
    body.velocity.y = Phaser.Math.Linear(body.velocity.y, driftY, 0.14);
  }

  private updateLancerEngage(time: number) {
    const body = this.getBody();
    if (!body) return;
    if (time >= this.nextManeuverAt) {
      const target = this.combatTarget;
      const diveChance = Phaser.Math.Clamp(0.2 + (this.level - 1) * 0.035, 0.2, 0.6);
      if (target && Phaser.Math.FloatBetween(0, 1) < diveChance) {
        this.behaviorState = 'dive';
        this.diveEndAt = time + Phaser.Math.Between(780, 1180);
        return;
      }
      this.strafeDir = target
        ? target.x >= this.x
          ? 1
          : -1
        : Phaser.Math.Between(0, 1) === 0
          ? -1
          : 1;
      const minStep = Math.round(780 / Phaser.Math.Clamp(this.aggressionScale, 0.8, 2));
      const maxStep = Math.round(1450 / Phaser.Math.Clamp(this.aggressionScale, 0.8, 2));
      this.nextManeuverAt = time + Phaser.Math.Between(minStep, Math.max(minStep + 120, maxStep));
    }

    const patrolSpeed = 190 * this.speedScale;
    const waveX = Math.sin(time * 0.0028 + this.movementSeed) * 38;
    const waveY = Math.sin(time * 0.0045 + this.movementSeed * 1.3) * 22;
    body.velocity.x = Phaser.Math.Linear(
      body.velocity.x,
      this.strafeDir * patrolSpeed + waveX,
      0.1,
    );
    body.velocity.y = Phaser.Math.Linear(body.velocity.y, waveY, 0.12);
  }

  private updateDive(time: number) {
    const body = this.getBody();
    if (!body) return;
    const target = this.combatTarget;
    const aimX = target?.x ?? this.x;
    const aimY = target?.y ?? this.scene.scale.height * 0.8;
    const angle = Phaser.Math.Angle.Between(this.x, this.y, aimX, aimY);
    const diveSpeed = 360 * this.speedScale * Phaser.Math.Clamp(this.aggressionScale, 0.9, 2.3);
    body.velocity.x = Math.cos(angle) * diveSpeed * 0.82;
    body.velocity.y = Math.abs(Math.sin(angle)) * diveSpeed + 180;
    if (this.y >= this.scene.scale.height * 0.78 || time >= this.diveEndAt) {
      this.enterRetreat();
    }
  }

  private updateRetreat() {
    const body = this.getBody();
    if (!body) return;
    const targetVY = -(this.variant === 'lancer' ? 305 : 245) * this.speedScale;
    const targetVX = this.retreatLateralDir * 130 * this.speedScale;
    body.velocity.x = Phaser.Math.Linear(body.velocity.x, targetVX, 0.06);
    body.velocity.y = Phaser.Math.Linear(body.velocity.y, targetVY, 0.08);
  }

  private fireShot(spread: number, speedMultiplier: number = 1) {
    const target = this.combatTarget;
    if (!target?.active) return;
    const targetBody = target.body as Phaser.Physics.Arcade.Body | null;
    if (!targetBody) return;

    const shot = this.projectilePool.get(this.x, this.y) as SkyRaiderShot | null;
    if (!shot) return;

    const leadTime = this.variant === 'lancer' ? 0.3 : 0.22;
    const tx = target.x + targetBody.velocity.x * leadTime;
    const ty = target.y + targetBody.velocity.y * leadTime;
    const aimAngle =
      Phaser.Math.Angle.Between(this.x, this.y, tx, ty) + Phaser.Math.FloatBetween(-spread, spread);
    const speed = (this.variant === 'lancer' ? 460 : 380) * this.projectileScale * speedMultiplier;
    shot.fire(this.x, this.y, Math.cos(aimAngle) * speed, Math.sin(aimAngle) * speed, this.variant);

    const pan = Phaser.Math.Clamp((this.x / Math.max(1, this.scene.scale.width)) * 2 - 1, -1, 1);
    this.audioManager.playUFOShoot('scout', pan);
  }

  private tryShoot(time: number) {
    if (!this.active || this.behaviorState === 'retreat') return;
    if (!this.combatTarget?.active) return;
    if (time < this.nextShotAt) return;

    const baseInterval = this.variant === 'lancer' ? 900 : 1140;
    const intervalScale = Phaser.Math.Clamp(1 / this.aggressionScale, 0.5, 1.4);
    const nextMin = Math.round(baseInterval * 0.84 * intervalScale);
    const nextMax = Math.round(baseInterval * 1.26 * intervalScale);
    this.nextShotAt = time + Phaser.Math.Between(nextMin, Math.max(nextMin + 120, nextMax));

    this.fireShot(this.variant === 'lancer' ? 0.07 : 0.11);
    if (this.variant === 'lancer' && this.behaviorState === 'dive') {
      this.scene.time.delayedCall(90, () => {
        if (!this.active || this.behaviorState !== 'dive') return;
        this.fireShot(0.06, 1.06);
      });
    }
  }

  preUpdate(time: number, delta: number) {
    super.preUpdate(time, delta);
    if (!this.active) return;

    if (time >= this.retreatAt) {
      this.enterRetreat();
    }

    if (this.behaviorState === 'enter') this.updateEnter(time);
    else if (this.behaviorState === 'engage') {
      if (this.variant === 'stalker') this.updateStalkerEngage(time);
      else this.updateLancerEngage(time);
    } else if (this.behaviorState === 'dive') this.updateDive(time);
    else this.updateRetreat();

    this.tryShoot(time);

    const body = this.getBody();
    if (body) {
      this.rotation = Phaser.Math.Angle.RotateTo(
        this.rotation,
        Math.PI + Phaser.Math.Clamp(body.velocity.x * 0.0018, -0.42, 0.42),
        0.06,
      );
    }

    const width = this.scene.scale.width;
    const height = this.scene.scale.height;
    const pad = 150;
    if (this.x < -pad || this.x > width + pad || this.y < -pad || this.y > height + pad) {
      this.deactivate();
    }
  }
}

export class SkyRaiderManager {
  private scene: Phaser.Scene;
  private audioManager: AudioManager;
  private raiders: Phaser.Physics.Arcade.Group;
  private projectiles: Phaser.Physics.Arcade.Group;
  private spawnTimerMs: number = 0;
  private difficultyLevel: number = 1;
  private preset: DifficultyPreset = getDifficultyPreset('normal');
  private runtimeIntensity: number = 1;
  private combatTarget: Phaser.Physics.Arcade.Sprite | null = null;

  constructor(scene: Phaser.Scene, audio: AudioManager) {
    ensureSkyRaiderTextures(scene);
    this.scene = scene;
    this.audioManager = audio;
    this.raiders = this.scene.physics.add.group({
      runChildUpdate: true,
      maxSize: 8,
    });
    this.projectiles = this.scene.physics.add.group({
      classType: SkyRaiderShot,
      runChildUpdate: true,
      maxSize: 56,
    });
    this.spawnTimerMs = this.computeNextSpawnDelay();
  }

  private hasGroupChildren(group: Phaser.Physics.Arcade.Group | null | undefined) {
    const anyGroup = group as any;
    return Boolean(anyGroup?.children && typeof anyGroup.children.size === 'number');
  }

  public setDifficultyLevel(level: number) {
    this.difficultyLevel = Math.max(1, Math.floor(level));
  }

  public setDifficultyPreset(preset: DifficultyPreset) {
    this.preset = preset;
  }

  public setRuntimeIntensity(intensity: number) {
    this.runtimeIntensity = Phaser.Math.Clamp(intensity, 0.6, 1.25);
  }

  public setCombatTarget(target: Phaser.Physics.Arcade.Sprite | null) {
    this.combatTarget = target;
  }

  public resetSpawnController(initialDelayMs?: number) {
    this.spawnTimerMs =
      initialDelayMs !== undefined
        ? Math.max(0, Math.round(initialDelayMs))
        : this.computeNextSpawnDelay();
  }

  public getRaiders() {
    return this.raiders;
  }

  public getProjectiles() {
    return this.projectiles;
  }

  public getActiveRaiderCount() {
    if (!this.hasGroupChildren(this.raiders)) return 0;
    return this.raiders.countActive(true);
  }

  public getActiveProjectileCount() {
    if (!this.hasGroupChildren(this.projectiles)) return 0;
    return this.projectiles.countActive(true);
  }

  public deactivateAll() {
    if (this.hasGroupChildren(this.raiders)) {
      const raiders = this.raiders.getChildren() as unknown as SkyRaider[];
      for (const raider of raiders) {
        if (raider.active) raider.deactivate();
      }
    }
    if (this.hasGroupChildren(this.projectiles)) {
      const shots = this.projectiles.getChildren() as SkyRaiderShot[];
      for (const shot of shots) {
        if (shot.active) shot.disableBody(true, true);
      }
    }
  }

  public destroy() {
    this.deactivateAll();
    if (this.hasGroupChildren(this.raiders)) {
      this.raiders.clear(true, true);
    }
    if (this.hasGroupChildren(this.projectiles)) {
      this.projectiles.clear(true, true);
    }
  }

  private getActiveCap() {
    let cap = this.difficultyLevel >= 7 ? 2 : 1;
    if (this.preset.key === 'hard' && this.difficultyLevel >= 11) cap = 3;
    return cap;
  }

  private pickVariant(): SkyRaiderVariant {
    const levelChance = Phaser.Math.Clamp(0.08 + (this.difficultyLevel - 1) * 0.05, 0.08, 0.6);
    const presetBonus = Phaser.Math.Clamp((this.preset.enemySpawnScale - 1) * 0.35, -0.12, 0.22);
    const lancerChance = Phaser.Math.Clamp(levelChance + presetBonus, 0.1, 0.7);
    return Phaser.Math.FloatBetween(0, 1) < lancerChance ? 'lancer' : 'stalker';
  }

  private getOrCreateRaider() {
    if (!this.hasGroupChildren(this.raiders)) return null;
    let raider = this.raiders.getFirstDead(false) as SkyRaider | null;
    if (raider) return raider;
    if (this.raiders.getLength() >= 8) return null;
    raider = new SkyRaider(this.scene, -120, -120, this.audioManager, this.projectiles);
    this.raiders.add(raider, true);
    return raider;
  }

  private spawnRaider() {
    const raider = this.getOrCreateRaider();
    if (!raider) return false;
    raider.spawn({
      variant: this.pickVariant(),
      level: this.difficultyLevel,
      preset: this.preset,
      target: this.combatTarget,
    });
    return true;
  }

  private computeNextSpawnDelay() {
    const levelRamp = (this.difficultyLevel - 1) * 520;
    const rateScale = Phaser.Math.Clamp(1 / this.preset.enemySpawnScale, 0.72, 1.3);
    const minBase = Math.max(6800, Math.round((15800 - levelRamp) * rateScale));
    const maxBase = Math.max(minBase + 3600, Math.round((25200 - levelRamp) * rateScale));
    const openingScale = Phaser.Math.Linear(1.35, 1, this.runtimeIntensity);
    return Math.round(Phaser.Math.Between(minBase, maxBase) * openingScale);
  }

  public update(_time: number, delta: number) {
    if (!this.hasGroupChildren(this.raiders) || !this.hasGroupChildren(this.projectiles)) return;
    const activeRaiders = this.raiders.getChildren() as unknown as SkyRaider[];
    for (const raider of activeRaiders) {
      if (!raider.active) continue;
      raider.setCombatTarget(this.combatTarget);
    }

    this.spawnTimerMs -= delta;
    if (this.spawnTimerMs > 0) return;

    const activeCount = this.raiders.countActive(true);
    if (activeCount >= this.getActiveCap()) {
      this.spawnTimerMs = Phaser.Math.Between(850, 1350);
      return;
    }

    const spawned = this.spawnRaider();
    this.spawnTimerMs = spawned ? this.computeNextSpawnDelay() : 700;
  }
}
