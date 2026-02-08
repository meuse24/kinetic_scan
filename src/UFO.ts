import Phaser from 'phaser';
import { AudioManager } from './AudioManager';
import { getDifficultyPreset } from './Difficulty';
import type { DifficultyPreset } from './Difficulty';
import { JUICE_TUNING } from './MainSceneTuning';

export type UFOVariant = 'scout' | 'boss';

type UFOOptions = {
  combatEnabled?: boolean;
};

type UFOSpawnConfig = {
  variant?: UFOVariant;
  level?: number;
};

function ensureUFOTextures(scene: Phaser.Scene) {
  if (!scene.textures.exists('ufo_hitbox')) {
    const g = scene.make.graphics({ x: 0, y: 0 });
    g.fillStyle(0xffffff, 1);
    g.fillCircle(32, 32, 24);
    g.generateTexture('ufo_hitbox', 64, 64);
    g.destroy();
  }

  if (!scene.textures.exists('ufo_plasma')) {
    const g = scene.make.graphics({ x: 0, y: 0 });
    g.fillStyle(0x7a25ff, 0.35);
    g.fillCircle(9, 9, 9);
    g.fillStyle(0x4ad9ff, 0.8);
    g.fillCircle(9, 9, 5);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(9, 9, 2);
    g.lineStyle(1, 0x8df8ff, 0.95);
    g.strokeCircle(9, 9, 7);
    g.generateTexture('ufo_plasma', 18, 18);
    g.destroy();
  }
}

export class UFOProjectile extends Phaser.Physics.Arcade.Sprite {
  private shotVariant: UFOVariant = 'scout';

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, 'ufo_plasma');
  }

  public fire(x: number, y: number, angle: number, speed: number, variant: UFOVariant) {
    this.shotVariant = variant;
    this.enableBody(true, x, y, true, true);
    this.setActive(true);
    this.setVisible(true);
    this.setScale(variant === 'boss' ? 1.25 : 1);
    this.clearTint();
    if (variant === 'boss') {
      this.setTint(0xff7dff);
    }
    this.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
    this.setRotation(angle + Math.PI / 2);
  }

  preUpdate(time: number, delta: number) {
    super.preUpdate(time, delta);
    if (!this.active) return;
    const spin = this.shotVariant === 'boss' ? 0.02 : 0.012;
    this.rotation += delta * spin;

    const w = this.scene.scale.width;
    const h = this.scene.scale.height;
    const pad = 140;
    if (this.x < -pad || this.x > w + pad || this.y < -pad || this.y > h + pad) {
      this.disableBody(true, true);
    }
  }
}

export type BossModifier = 'none' | 'shielded' | 'summoner' | 'berserk' | 'armored';

export class UFO extends Phaser.Physics.Arcade.Sprite {
  private startX: number = 0;
  private startY: number = 0;
  private timeAlive: number = 0;
  private movementSeed: number = 0;
  private retreatAt: number = 0;
  private audioManager: AudioManager;
  private visualGraphics: Phaser.GameObjects.Graphics;
  private bossHitsText: Phaser.GameObjects.Text;
  private combatEnabled: boolean = false;
  private combatTarget: Phaser.Physics.Arcade.Sprite | null = null;
  private projectiles: Phaser.Physics.Arcade.Group | null = null;
  private nextShotAt: number = 0;
  private pendingBossVolleyAt: number = 0;
  private bossTelegraphUntil: number = 0;
  private shootFlashUntil: number = 0;
  private hitFlashUntil: number = 0;
  private travelDir: number = 1;
  private variant: UFOVariant = 'scout';
  private evasionThreats: Phaser.Physics.Arcade.Group | null = null;
  private difficultyLevel: number = 1;
  private preset: DifficultyPreset = getDifficultyPreset('normal');
  private maxHitPoints: number = 1;
  private hitPoints: number = 1;
  private displayHitPoints: number = 1;
  private bossPhase: 1 | 2 | 3 = 1;
  private shotPatternIndex: number = 0;
  private bossModifier: BossModifier = 'none';
  private regenAccumulatorMs: number = 0;
  private lastBerserkScale: number = 1;
  private tentaclePhases: number[] = [0, 0.9, 1.8, 2.7, 3.6, 4.5];
  private visualRefreshAccumulatorMs: number = 0;
  private forceVisualRefresh: boolean = true;
  private dodgeRefreshMs: number = 0;
  private cachedDodgeOffset: number = 0;
  private bossHitsLabelCache: string = '';
  private bossHitsColorCache: string = '#ffffff';
  private reducedVisualDetail: boolean = false;

  constructor(scene: Phaser.Scene, audio: AudioManager, options: UFOOptions = {}) {
    ensureUFOTextures(scene);
    super(scene, -100, -100, 'ufo_hitbox');
    this.audioManager = audio;
    this.combatEnabled = Boolean(options.combatEnabled);

    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setCircle(24, 8, 8);
    this.setAlpha(0.001);

    this.visualGraphics = scene.add.graphics();
    this.visualGraphics.setDepth(this.depth + 1);
    this.bossHitsText = scene.add
      .text(-999, -999, '', {
        fontFamily: '"Press Start 2P"',
        fontSize: '10px',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 2,
      })
      .setOrigin(0, 0.5)
      .setDepth(this.depth + 2)
      .setVisible(false);

    if (this.combatEnabled) {
      this.projectiles = scene.physics.add.group({
        classType: UFOProjectile,
        runChildUpdate: true,
        maxSize: 32,
      });
    }

    this.once(Phaser.GameObjects.Events.DESTROY, () => {
      this.visualGraphics.destroy();
      this.bossHitsText.destroy();
    });

    this.deactivate();
  }

  public override setDepth(value: number): this {
    super.setDepth(value);
    this.visualGraphics.setDepth(value + 1);
    this.bossHitsText.setDepth(value + 2);
    return this;
  }

  public setDifficultyLevel(level: number) {
    this.difficultyLevel = Math.max(1, Math.floor(level));
  }

  public setDifficultyPreset(preset: DifficultyPreset) {
    this.preset = preset;
  }

  public setCombatTarget(target: Phaser.Physics.Arcade.Sprite | null) {
    this.combatTarget = target;
  }

  public setEvasionThreatGroup(threats: Phaser.Physics.Arcade.Group | null) {
    this.evasionThreats = threats;
  }

  public setReducedVisualDetail(reduced: boolean) {
    if (this.reducedVisualDetail === reduced) return;
    this.reducedVisualDetail = reduced;
    this.forceVisualRefresh = true;
    this.dodgeRefreshMs = 0;
  }

  public getProjectiles() {
    return this.projectiles;
  }

  public getActiveProjectileCount() {
    return this.projectiles?.countActive(true) ?? 0;
  }

  public getVariant(): UFOVariant {
    return this.variant;
  }

  public getHealth() {
    return this.hitPoints;
  }

  public getMaxHealth() {
    return this.maxHitPoints;
  }

  public getBossPhase() {
    return this.variant === 'boss' ? this.bossPhase : 0;
  }

  public setBossModifier(mod: BossModifier) {
    this.bossModifier = mod;
    this.regenAccumulatorMs = 0;
  }

  public getBossModifier(): BossModifier {
    return this.bossModifier;
  }

  public ensureCombatReady() {
    if (!this.active) this.setActive(true);
    if (!this.visible) this.setVisible(true);
    if (this.body && !this.body.enable) this.body.enable = true;
    if (!this.visualGraphics.visible) this.visualGraphics.setVisible(true);
    this.forceVisualRefresh = true;
  }

  public spawn(config: UFOSpawnConfig = {}) {
    const width = this.scene.scale.width;
    const height = this.scene.scale.height;
    const level = Math.max(1, Math.floor(config.level ?? this.difficultyLevel));
    this.difficultyLevel = level;
    this.variant = config.variant ?? 'scout';
    const side = Phaser.Math.Between(0, 1);
    const x = side === 0 ? -90 : width + 90;
    const dir = side === 0 ? 1 : -1;
    const yMin = this.variant === 'boss' ? 120 : 95;
    const yMax = this.variant === 'boss' ? Math.round(height * 0.52) : Math.round(height * 0.4);
    const y = Phaser.Math.Between(yMin, yMax);
    this.startX = Phaser.Math.Clamp(width * 0.5 + Phaser.Math.Between(-160, 160), 150, width - 150);
    this.startY = y;
    this.timeAlive = 0;
    this.travelDir = dir;
    this.movementSeed = Phaser.Math.FloatBetween(0, Math.PI * 2);
    this.shotPatternIndex = 0;
    this.bossPhase = 1;
    this.hitFlashUntil = 0;
    this.shootFlashUntil = 0;
    this.pendingBossVolleyAt = 0;
    this.bossTelegraphUntil = 0;
    this.displayHitPoints = 1;
    this.visualRefreshAccumulatorMs = 0;
    this.forceVisualRefresh = true;
    this.dodgeRefreshMs = 0;
    this.cachedDodgeOffset = 0;
    this.bossHitsLabelCache = '';
    this.bossHitsColorCache = '#ffffff';
    this.bossModifier = 'none';
    this.regenAccumulatorMs = 0;
    this.lastBerserkScale = 1;

    if (this.variant === 'boss') {
      const baseHealth = 6 + Math.floor(level * 1.15);
      this.maxHitPoints = Phaser.Math.Clamp(
        Math.round(baseHealth * this.preset.bossHealthScale),
        5,
        24,
      );
      if (!Number.isFinite(this.maxHitPoints) || this.maxHitPoints < 2) {
        this.maxHitPoints = 6;
      }
      this.hitPoints = this.maxHitPoints;
      this.displayHitPoints = this.maxHitPoints;
      // Boss silhouette is much wider than the 64x64 hitbox sprite, so use a custom
      // rectangular body to match visible hull and make visual hits register reliably.
      this.setBodySize(132, 60, true);
      this.enableBody(true, x, y, true, true);
      this.setVelocity(dir * (90 + level * 5) * this.preset.bossAggressionScale, 0);
      this.nextShotAt = this.scene.time.now + Phaser.Math.Between(900, 1700);
      this.retreatAt = this.scene.time.now + Phaser.Math.Between(18000, 24000);
      this.bossHitsText.setVisible(true);
    } else {
      this.maxHitPoints = 1;
      this.hitPoints = 1;
      this.displayHitPoints = 1;
      this.setCircle(24, 8, 8);
      this.enableBody(true, x, y, true, true);
      this.setVelocity(dir * (130 + level * 8) * this.preset.enemySpeedScale, 0);
      this.nextShotAt = this.scene.time.now + Phaser.Math.Between(900, 2000);
      this.retreatAt = this.scene.time.now + Phaser.Math.Between(11000, 16000);
      this.bossHitsText.setVisible(false);
    }

    this.setScale(1);
    this.visualGraphics.setVisible(true);
    this.audioManager.startUFOSound();
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
    if (this.variant === 'boss') {
      if (!Number.isFinite(this.maxHitPoints) || this.maxHitPoints < 2) {
        this.maxHitPoints = 6;
      }
      if (!Number.isFinite(this.hitPoints) || this.hitPoints < 1) {
        this.hitPoints = this.maxHitPoints;
        this.displayHitPoints = this.maxHitPoints;
      }
    }
    const effectiveDamage = this.bossModifier === 'armored' ? damage * 0.5 : damage;
    const prevHitPoints = this.hitPoints;
    this.hitPoints = Math.max(0, prevHitPoints - effectiveDamage);
    this.displayHitPoints = prevHitPoints;
    this.hitFlashUntil = this.scene.time.now + 120;
    this.forceVisualRefresh = true;
    if (this.hitPoints <= 0) {
      const variant = this.variant;
      this.deactivate();
      return { destroyed: true, variant, health: 0, maxHealth: this.maxHitPoints };
    }
    this.ensureCombatReady();
    return {
      destroyed: false,
      variant: this.variant,
      health: this.hitPoints,
      maxHealth: this.maxHitPoints,
    };
  }

  preUpdate(time: number, delta: number) {
    super.preUpdate(time, delta);
    if (!this.active) return;

    this.timeAlive += delta * 0.001;
    if (this.variant === 'boss') {
      this.bossPhase = this.resolveBossPhase();
      const lerpToLiveHealth = Phaser.Math.Clamp(delta * 0.012, 0.12, 0.28);
      this.displayHitPoints = Phaser.Math.Linear(
        this.displayHitPoints,
        this.hitPoints,
        lerpToLiveHealth,
      );
      if (Math.abs(this.displayHitPoints - this.hitPoints) < 0.02) {
        this.displayHitPoints = this.hitPoints;
      }
      // Shielded: slow HP regen (0.2 HP/sec)
      if (this.bossModifier === 'shielded' && this.hitPoints < this.maxHitPoints) {
        this.regenAccumulatorMs += delta;
        if (this.regenAccumulatorMs >= 1000) {
          this.regenAccumulatorMs -= 1000;
          this.hitPoints = Math.min(this.maxHitPoints, this.hitPoints + 0.2);
          this.forceVisualRefresh = true;
        }
      }
      // Berserk: speed increases as HP decreases
      if (this.bossModifier === 'berserk' && this.body) {
        const hpRatio = this.hitPoints / Math.max(1, this.maxHitPoints);
        const berserkScale = 1 + (1 - hpRatio) * 0.6;
        const baseVx = this.body.velocity.x;
        if (Math.abs(baseVx) > 10) {
          const sign = baseVx > 0 ? 1 : -1;
          const absSpeed = Math.abs(baseVx) / (this.lastBerserkScale ?? 1);
          this.lastBerserkScale = berserkScale;
          this.body.velocity.x = sign * absSpeed * berserkScale;
        }
      }
      this.updateBossMovement(time, delta);
    } else {
      this.updateScoutMovement();
    }

    if (time >= this.retreatAt && this.body) {
      const speed =
        this.variant === 'boss' ? 145 + this.difficultyLevel * 7 : 155 + this.difficultyLevel * 9;
      const retreatScale =
        this.variant === 'boss' ? this.preset.bossAggressionScale : this.preset.enemySpeedScale;
      this.body.velocity.x = this.travelDir * speed * retreatScale;
      this.body.velocity.y =
        (this.variant === 'boss' ? -26 : 0) + Math.sin(this.timeAlive * 2.2) * 18;
    }

    const visualIntervalMs = this.reducedVisualDetail
      ? this.variant === 'boss'
        ? 48
        : 36
      : this.variant === 'boss'
        ? 34
        : 26;
    this.visualRefreshAccumulatorMs += delta;
    if (this.forceVisualRefresh || this.visualRefreshAccumulatorMs >= visualIntervalMs) {
      this.visualRefreshAccumulatorMs = 0;
      this.forceVisualRefresh = false;
      this.drawAnimatedBody(time);
    }
    this.tryShoot(time);

    const width = this.scene.scale.width;
    const height = this.scene.scale.height;
    const pad = this.variant === 'boss' ? 180 : 140;
    if (this.x > width + pad || this.x < -pad || this.y < -pad || this.y > height + pad) {
      this.deactivate();
    }
  }

  public deactivate() {
    if (this.body) this.disableBody(true, true);
    else this.setActive(false).setVisible(false);

    this.visualGraphics.clear();
    this.visualGraphics.setVisible(false);
    this.bossHitsText.setVisible(false);
    this.bossHitsLabelCache = '';
    this.bossHitsColorCache = '#ffffff';
    this.pendingBossVolleyAt = 0;
    this.bossTelegraphUntil = 0;
    this.visualRefreshAccumulatorMs = 0;
    this.forceVisualRefresh = true;
    this.dodgeRefreshMs = 0;
    this.cachedDodgeOffset = 0;
    this.clearProjectiles();
    this.audioManager.stopUFOSound();
  }

  private updateScoutMovement() {
    const bob = Math.sin(this.timeAlive * 2.3) * 34 + Math.cos(this.timeAlive * 0.9) * 9;
    this.y = this.startY + bob;
  }

  private resolveBossPhase(): 1 | 2 | 3 {
    if (this.maxHitPoints <= 0) return 1;
    const ratio = this.hitPoints / this.maxHitPoints;
    if (ratio <= 0.25 || this.timeAlive >= 12) return 3;
    if (ratio <= 0.5 || this.timeAlive >= 6) return 2;
    return 1;
  }

  private updateBossMovement(time: number, delta: number) {
    const width = this.scene.scale.width;
    const phase = this.resolveBossPhase();
    const phaseAggression = 1 + (phase - 1) * 0.22;
    const amplitudeX = (85 + this.difficultyLevel * 3) * phaseAggression;
    this.dodgeRefreshMs -= delta;
    if (this.dodgeRefreshMs <= 0) {
      this.cachedDodgeOffset = this.computeBossDodgeOffset(phase);
      this.dodgeRefreshMs = phase === 3 ? 52 : phase === 2 ? 64 : 78;
    }
    const dodgeOffset = this.cachedDodgeOffset;
    const targetX = Phaser.Math.Clamp(
      this.startX + Math.sin(this.timeAlive * 1.35 + this.movementSeed) * amplitudeX + dodgeOffset,
      125,
      width - 125,
    );
    this.x = Phaser.Math.Linear(this.x, targetX, 0.085 + (phase - 1) * 0.015);

    const yWave =
      Math.sin(this.timeAlive * (1.95 + (phase - 1) * 0.2) + this.movementSeed * 0.5) * 52 +
      Math.cos(this.timeAlive * 0.85 + this.movementSeed) * 14;
    this.y = this.startY + yWave;

    if (this.body) {
      this.body.velocity.x = 0;
      this.body.velocity.y = 0;
    }

    if (this.x < 140) this.travelDir = 1;
    else if (this.x > width - 140) this.travelDir = -1;

    if (Math.floor(time / 2400) % 2 === 0) {
      this.startY = Phaser.Math.Clamp(
        this.startY + Math.sin(time * 0.0007 + this.movementSeed) * (0.65 + (phase - 1) * 0.35),
        120,
        this.scene.scale.height * 0.55,
      );
    }
  }

  private computeBossDodgeOffset(phase: 1 | 2 | 3) {
    if (!this.evasionThreats) return 0;
    const bulletChildren = this.evasionThreats.getChildren() as Phaser.Physics.Arcade.Sprite[];
    let dodgeAccumulator = 0;
    let considered = 0;
    const maxDistanceSq = 290 * 290;
    const maxSamples = this.reducedVisualDetail ? 8 : 14;

    for (const bullet of bulletChildren) {
      if (!bullet.active) continue;
      const body = bullet.body as Phaser.Physics.Arcade.Body | undefined;
      if (!body || body.velocity.y >= 0) continue;
      const dx = bullet.x - this.x;
      const dy = bullet.y - this.y;
      if (dy < -210 || dy > 230) continue;
      const distSq = dx * dx + dy * dy;
      if (distSq > maxDistanceSq) continue;
      const pressure = 1 - distSq / maxDistanceSq;
      dodgeAccumulator += (dx < 0 ? 1 : -1) * pressure;
      considered += 1;
      if (considered >= maxSamples) break;
    }

    if (considered === 0) return 0;
    const baseDodge = 20 + (phase - 1) * 9 + this.difficultyLevel * 1.4;
    const scaled = (dodgeAccumulator / considered) * baseDodge;
    return Phaser.Math.Clamp(scaled, -72, 72);
  }

  private clearProjectiles() {
    if (!this.projectiles) return;
    const children = (this.projectiles as any).children;
    if (!children || typeof children.each !== 'function') return;
    children.each((shot: any) => {
      if (shot?.active && typeof shot.disableBody === 'function') {
        shot.disableBody(true, true);
      }
      return null;
    });
  }

  private drawAnimatedBody(time: number) {
    if (!this.visualGraphics.visible) return;
    if (this.variant === 'boss') {
      this.drawBossBody(time);
    } else {
      this.drawScoutBody(time);
    }
  }

  private drawScoutBody(time: number) {
    if (this.bossHitsText.visible) {
      this.bossHitsText.setVisible(false);
    }
    const g = this.visualGraphics;
    const x = this.x;
    const y = this.y;
    const pulse = 0.5 + Math.sin(time * 0.008) * 0.5;
    const tentaclePulse = 0.6 + Math.sin(time * 0.01) * 0.4;

    g.clear();
    g.setDepth(this.depth + 1);

    const tentacleStep = this.reducedVisualDetail ? 2 : 1;
    for (let i = 0; i < this.tentaclePhases.length; i += tentacleStep) {
      const phase = this.tentaclePhases[i];
      const rootX = x - 34 + i * 14;
      const rootY = y + 14;
      const sway = Math.sin(time * 0.006 + phase) * 12 * tentaclePulse;
      const curl = Math.cos(time * 0.009 + phase) * 10;
      const tipY = rootY + 20 + Math.sin(time * 0.01 + phase) * 9;
      g.lineStyle(2, 0x5dd2ff, 0.45 + pulse * 0.3);
      g.beginPath();
      g.moveTo(rootX, rootY);
      for (let s = 1; s <= 6; s++) {
        const t = s / 6;
        const curveX = rootX + sway * t + Math.sin(t * Math.PI) * curl * 0.6;
        const curveY = rootY + t * (tipY - rootY);
        g.lineTo(curveX, curveY);
      }
      g.strokePath();
      g.fillStyle(0xb9f8ff, 0.8);
      g.fillCircle(rootX + sway + curl * 0.35, tipY, 1.6);
    }

    g.fillStyle(0x13081f, 0.82);
    g.lineStyle(2, 0xff8ef7, 0.95);
    g.fillEllipse(x, y + 3, 108, 36);
    g.strokeEllipse(x, y + 3, 108, 36);
    g.lineStyle(1, 0x6df1ff, 0.55);
    g.strokeEllipse(x, y + 6, 86, 20);

    g.fillStyle(0x4ad9ff, 0.24 + pulse * 0.16);
    g.lineStyle(2, 0x83ebff, 0.95);
    g.fillEllipse(x, y - 6, 48, 24);
    g.strokeEllipse(x, y - 6, 48, 24);

    const lightCount = this.reducedVisualDetail ? 5 : 8;
    for (let i = 0; i < lightCount; i++) {
      const t = i / lightCount;
      const lx = x - 42 + t * 84;
      const ly = y + 6 + Math.sin(time * 0.01 + i * 0.8) * 2;
      const alpha = 0.35 + (Math.sin(time * 0.013 + i) + 1) * 0.32;
      const color = i % 2 === 0 ? 0x55d5ff : 0xff86dc;
      g.fillStyle(color, alpha);
      g.fillCircle(lx, ly, 2.2);
    }

    this.drawAntennaSet(g, x, y - 16, 2, 14, time, 0x79f6ff);
    this.drawCannonGlow(g, time, [x], y + 17, 0xffd96b);

    if (time < this.hitFlashUntil) {
      g.lineStyle(2, 0xffffff, 0.85);
      g.strokeEllipse(x, y + 3, 114, 40);
    }
  }

  private drawBossBody(time: number) {
    const g = this.visualGraphics;
    const x = this.x;
    const y = this.y;
    const pulse = 0.5 + Math.sin(time * 0.007 + this.movementSeed) * 0.5;
    const hpRatio = this.maxHitPoints > 0 ? this.hitPoints / this.maxHitPoints : 0;
    const displayRatio = this.maxHitPoints > 0 ? this.displayHitPoints / this.maxHitPoints : 0;
    const phase = this.resolveBossPhase();
    const tentacleCount = this.reducedVisualDetail ? 5 : 8;
    const hullAccent = phase === 3 ? 0xff4eb8 : phase === 2 ? 0xff73d8 : 0xff58cf;
    const energyAccent = phase === 3 ? 0xff91ff : phase === 2 ? 0x9df6ff : 0x5ee1ff;

    g.clear();
    g.setDepth(this.depth + 1);

    for (let i = 0; i < tentacleCount; i++) {
      const phase = i * 0.75 + this.movementSeed;
      const rootX = x - 52 + i * 15;
      const rootY = y + 21;
      const wave = Math.sin(time * 0.008 + phase) * 14;
      const tipY = rootY + 34 + Math.cos(time * 0.01 + phase) * 11;
      g.lineStyle(2.4, energyAccent, 0.45 + pulse * 0.35);
      g.beginPath();
      g.moveTo(rootX, rootY);
      for (let s = 1; s <= 8; s++) {
        const t = s / 8;
        const sx = rootX + wave * t + Math.sin(t * Math.PI * 1.5 + phase) * 6.5;
        const sy = rootY + (tipY - rootY) * t;
        g.lineTo(sx, sy);
      }
      g.strokePath();
      g.fillStyle(0xb5f8ff, 0.75);
      g.fillCircle(rootX + wave * 0.8, tipY, 2.2);
    }

    g.fillStyle(0x1d0b2e, 0.88);
    g.lineStyle(3, hullAccent, 0.98);
    g.fillEllipse(x, y + 5, 146, 48);
    g.strokeEllipse(x, y + 5, 146, 48);

    g.lineStyle(2, energyAccent, 0.6);
    g.strokeEllipse(x, y + 8, 118, 28);
    g.strokeEllipse(x, y + 1, 132, 36);

    g.fillStyle(0x66e8ff, 0.3 + pulse * 0.14);
    g.lineStyle(2, 0x9cf7ff, 0.95);
    g.fillEllipse(x, y - 10, 74, 34);
    g.strokeEllipse(x, y - 10, 74, 34);

    this.drawAntennaSet(g, x - 8, y - 24, 2, 12, time, 0x9dfdff);
    this.drawAntennaSet(g, x + 18, y - 21, 2, 10, time + 240, 0xff99ef);

    const orbitLightCount = this.reducedVisualDetail ? 7 : 12;
    for (let i = 0; i < orbitLightCount; i++) {
      const angle = (i / orbitLightCount) * Math.PI * 2 + time * 0.002;
      const rx = x + Math.cos(angle) * 58;
      const ry = y + 8 + Math.sin(angle) * 14;
      const alpha = 0.25 + (Math.sin(time * 0.011 + i) + 1) * 0.24;
      g.fillStyle(i % 2 === 0 ? energyAccent : hullAccent, alpha);
      g.fillCircle(rx, ry, 2.5);
    }

    const hpLerp = Phaser.Math.Clamp(hpRatio, 0, 1);
    const hpR = Math.round(255 * (1 - hpLerp) + 102 * hpLerp);
    const hpG = Math.round(56 * (1 - hpLerp) + 255 * hpLerp);
    const hpB = Math.round(56 * (1 - hpLerp) + 204 * hpLerp);
    const hpStroke = (hpR << 16) | (hpG << 8) | hpB;
    const barX = x - 56;
    const barY = y - 40;
    const barWidth = 112;
    const barHeight = 8;
    const displayWidth = barWidth * Phaser.Math.Clamp(displayRatio, 0, 1);
    const liveWidth = barWidth * Phaser.Math.Clamp(hpRatio, 0, 1);

    g.fillStyle(0x05070e, 0.72);
    g.fillRect(barX - 1, barY - 1, barWidth + 2, barHeight + 2);
    g.lineStyle(2, time < this.hitFlashUntil ? 0xffffff : hpStroke, 0.96);
    g.strokeRect(barX, barY, barWidth, barHeight);

    if (displayWidth > liveWidth + 0.5) {
      g.fillStyle(0xff4d7d, 0.58);
      g.fillRect(barX + liveWidth, barY + 1, displayWidth - liveWidth, barHeight - 2);
    }
    const segmentCount = Phaser.Math.Clamp(Math.round(this.maxHitPoints), 5, 24);
    const liveEnergy = Phaser.Math.Clamp(Math.floor(this.hitPoints + 0.0001), 0, segmentCount);
    const shownEnergy = Phaser.Math.Clamp(
      Math.ceil(this.displayHitPoints - 0.0001),
      liveEnergy,
      segmentCount,
    );
    const gap = 1;
    const innerWidth = barWidth - 2;
    const segmentWidth = Math.max(
      1,
      Math.floor((innerWidth - gap * (segmentCount - 1)) / segmentCount),
    );
    const usedWidth = segmentWidth * segmentCount + gap * (segmentCount - 1);
    const segmentHeight = barHeight - 2;
    const startX = barX + 1 + Math.floor((innerWidth - usedWidth) / 2);
    const startY = barY + 1;

    if (shownEnergy > liveEnergy) {
      g.fillStyle(0xff4d7d, 0.68);
      for (let i = liveEnergy; i < shownEnergy; i++) {
        const sx = startX + i * (segmentWidth + gap);
        g.fillRect(sx, startY, segmentWidth, segmentHeight);
      }
    }

    g.fillStyle(hpStroke, 0.92);
    for (let i = 0; i < liveEnergy; i++) {
      const sx = startX + i * (segmentWidth + gap);
      g.fillRect(sx, startY, segmentWidth, segmentHeight);
    }

    const textX = Phaser.Math.Clamp(barX + barWidth + 8, 8, this.scene.scale.width - 130);
    const textY = barY + barHeight * 0.5;
    this.bossHitsText.setPosition(textX, textY);
    const hitsLabel = `${liveEnergy}`;
    if (hitsLabel !== this.bossHitsLabelCache) {
      this.bossHitsText.setText(hitsLabel);
      this.bossHitsLabelCache = hitsLabel;
    }
    const hitsColor = time < this.hitFlashUntil ? '#ffefef' : '#ffffff';
    if (hitsColor !== this.bossHitsColorCache) {
      this.bossHitsText.setColor(hitsColor);
      this.bossHitsColorCache = hitsColor;
    }
    this.bossHitsText.setVisible(true);

    this.drawCannonGlow(g, time, [x - 22, x + 22], y + 22, phase === 3 ? 0xff7f7f : 0xffb2ff);
    this.drawBossTelegraph(g, time, phase);

    if (time < this.hitFlashUntil) {
      g.lineStyle(3, 0xffffff, 0.92);
      g.strokeEllipse(x, y + 5, 154, 54);
    }
  }

  private drawAntennaSet(
    g: Phaser.GameObjects.Graphics,
    centerX: number,
    baseY: number,
    count: number,
    spacing: number,
    time: number,
    color: number,
  ) {
    for (let i = 0; i < count; i++) {
      const local = i - (count - 1) / 2;
      const baseX = centerX + local * spacing;
      const sway = Math.sin(time * 0.01 + i * 0.9 + this.movementSeed) * 7 * this.travelDir;
      const tipX = baseX + sway;
      const tipY = baseY - 16 - Math.cos(time * 0.008 + i) * 4;
      g.lineStyle(2, color, 0.96);
      g.beginPath();
      g.moveTo(baseX, baseY);
      for (let s = 1; s <= 5; s++) {
        const t = s / 5;
        const segX = baseX + sway * t + Math.sin(t * Math.PI) * sway * 0.2;
        const segY = baseY + t * (tipY - baseY);
        g.lineTo(segX, segY);
      }
      g.strokePath();
      g.fillStyle(0xd8ffff, 0.95);
      g.fillCircle(tipX, tipY, 2.5);
    }
  }

  private drawCannonGlow(
    g: Phaser.GameObjects.Graphics,
    time: number,
    muzzleXs: number[],
    muzzleY: number,
    color: number,
  ) {
    if (time < this.shootFlashUntil) {
      for (const muzzleX of muzzleXs) {
        g.lineStyle(2, color, 0.92);
        g.strokeCircle(muzzleX, muzzleY, 7);
        g.fillStyle(0xfff3cf, 0.85);
        g.fillCircle(muzzleX, muzzleY, 3.6);
      }
      return;
    }
    for (const muzzleX of muzzleXs) {
      g.lineStyle(1, color, 0.56);
      g.strokeCircle(muzzleX, muzzleY, 4.2);
    }
  }

  private getBossTelegraphLeadMs(phase: 1 | 2 | 3) {
    const difficultyScale = JUICE_TUNING.bossTelegraphLeadScale[this.preset.key];
    if (this.reducedVisualDetail) {
      const base = phase === 3 ? 84 : phase === 2 ? 98 : 112;
      return Math.round(base * difficultyScale);
    }
    const base = phase === 3 ? 104 : phase === 2 ? 122 : 138;
    return Math.round(base * difficultyScale);
  }

  private scheduleBossTelegraph(time: number, phase: 1 | 2 | 3) {
    const leadMs = this.getBossTelegraphLeadMs(phase);
    this.pendingBossVolleyAt = time + leadMs;
    this.bossTelegraphUntil = this.pendingBossVolleyAt;
    this.forceVisualRefresh = true;
  }

  private drawBossTelegraph(g: Phaser.GameObjects.Graphics, time: number, phase: 1 | 2 | 3) {
    if (time >= this.bossTelegraphUntil) return;
    const leadMs = this.getBossTelegraphLeadMs(phase);
    const remaining = Phaser.Math.Clamp(
      (this.bossTelegraphUntil - time) / Math.max(1, leadMs),
      0,
      1,
    );
    const pulse = 0.5 + Math.sin(time * 0.055) * 0.5;
    const color = phase === 3 ? 0xff6de0 : phase === 2 ? 0xffab66 : 0x8cf8ff;
    const baseRadius = phase === 3 ? 54 : phase === 2 ? 50 : 46;
    const radius = baseRadius + (1 - remaining) * (phase === 3 ? 24 : 20);
    const diffAlpha = JUICE_TUNING.bossTelegraphAlphaScale[this.preset.key];
    const alpha = Phaser.Math.Clamp(
      (0.16 + pulse * 0.24 + (1 - remaining) * 0.34) * diffAlpha,
      0,
      0.92,
    );
    const y = this.y + 20;

    g.lineStyle(3, color, alpha);
    g.strokeCircle(this.x, y, radius);
    g.lineStyle(2, color, alpha * 0.75);
    g.strokeCircle(this.x, y, radius * 0.72);
  }

  private tryShoot(time: number) {
    if (!this.combatEnabled || !this.projectiles || !this.combatTarget) return;
    if (!this.combatTarget.active || !this.combatTarget.body) return;
    if (this.variant === 'boss') {
      if (this.pendingBossVolleyAt > 0) {
        if (time < this.pendingBossVolleyAt) return;
        this.pendingBossVolleyAt = 0;
        this.bossTelegraphUntil = 0;
        this.fireBossVolley(time);
        return;
      }
      if (time < this.nextShotAt) return;
      const phase = this.resolveBossPhase();
      const activeCap = phase === 3 ? 16 : phase === 2 ? 13 : 10;
      if (this.projectiles.countActive(true) >= activeCap) {
        this.nextShotAt = time + Phaser.Math.Between(1100, 1700);
        return;
      }
      const skipChance = phase === 3 ? 26 : phase === 2 ? 34 : 42;
      if (Phaser.Math.Between(0, 99) < skipChance) {
        this.nextShotAt = time + Phaser.Math.Between(900, 1450);
        return;
      }
      this.scheduleBossTelegraph(time, phase);
      return;
    }
    if (time < this.nextShotAt) return;
    this.fireScoutShot(time);
  }

  private fireScoutShot(time: number) {
    if (!this.combatTarget?.body || !this.projectiles) return;
    if (Phaser.Math.Between(0, 99) < 35) {
      this.nextShotAt = time + Phaser.Math.Between(650, 1200);
      return;
    }
    if (this.projectiles.countActive(true) >= 10) {
      this.nextShotAt = time + Phaser.Math.Between(900, 1500);
      return;
    }

    const target = this.combatTarget;
    const targetBody = target.body as Phaser.Physics.Arcade.Body;
    const muzzleX = this.x;
    const muzzleY = this.y + 18;
    const predictionTime = Phaser.Math.Clamp(
      Phaser.Math.Distance.Between(muzzleX, muzzleY, target.x, target.y) / 1250,
      0,
      0.35,
    );
    const predictedX = target.x + targetBody.velocity.x * predictionTime;
    const predictedY = target.y + targetBody.velocity.y * predictionTime;
    const angle =
      Phaser.Math.Angle.Between(muzzleX, muzzleY, predictedX, predictedY) +
      Phaser.Math.FloatBetween(-0.12, 0.12);
    const speed = Phaser.Math.Between(230, 330) + this.difficultyLevel * 4;

    this.fireProjectile(muzzleX, muzzleY, angle, speed, 'scout');
    this.shootFlashUntil = time + 140;
    this.forceVisualRefresh = true;
    this.nextShotAt = time + Phaser.Math.Between(1200, 2300);
  }

  private fireBossVolley(time: number) {
    if (!this.combatTarget?.body || !this.projectiles) return;
    const phase = this.resolveBossPhase();

    const target = this.combatTarget;
    const targetBody = target.body as Phaser.Physics.Arcade.Body;
    const leftMuzzleX = this.x - 22;
    const rightMuzzleX = this.x + 22;
    const muzzleY = this.y + 24;
    const centerX = this.x;

    const predictionTime = Phaser.Math.Clamp(
      Phaser.Math.Distance.Between(centerX, muzzleY, target.x, target.y) / 1150,
      0,
      0.45,
    );
    const predictedX = target.x + targetBody.velocity.x * predictionTime;
    const predictedY = target.y + targetBody.velocity.y * predictionTime;
    const baseAngle = Phaser.Math.Angle.Between(centerX, muzzleY, predictedX, predictedY);
    const phaseSpeedScale = 1 + (phase - 1) * 0.18;
    const baseSpeed =
      (Phaser.Math.Between(260, 330) + this.difficultyLevel * 10) *
      this.preset.bossProjectileSpeedScale *
      phaseSpeedScale;
    const pattern = this.shotPatternIndex % (phase === 1 ? 3 : phase === 2 ? 4 : 5);
    this.shotPatternIndex++;

    if (phase === 1 && pattern === 0) {
      const offsets = [-0.22, 0, 0.22];
      for (let i = 0; i < offsets.length; i++) {
        const muzzleX = i % 2 === 0 ? leftMuzzleX : rightMuzzleX;
        this.fireProjectile(muzzleX, muzzleY, baseAngle + offsets[i], baseSpeed, 'boss');
      }
    } else if (phase === 1 && pattern === 1) {
      const offsets = [-0.32, 0, 0.32];
      for (const offset of offsets) {
        this.fireProjectile(centerX, muzzleY, baseAngle + offset, baseSpeed - 20, 'boss');
      }
    } else if (phase === 1) {
      this.fireProjectile(leftMuzzleX, muzzleY, baseAngle - 0.1, baseSpeed + 24, 'boss');
      this.fireProjectile(rightMuzzleX, muzzleY, baseAngle + 0.1, baseSpeed + 24, 'boss');
      this.fireProjectile(centerX, muzzleY, baseAngle, baseSpeed + 32, 'boss');
    } else if (phase === 2 && pattern === 0) {
      const sweep = Math.sin(time * 0.008 + this.shotPatternIndex * 0.5) * 0.42;
      const offsets = [-0.4, -0.16, 0.16, 0.4];
      for (const offset of offsets) {
        this.fireProjectile(centerX, muzzleY, baseAngle + sweep + offset, baseSpeed - 12, 'boss');
      }
    } else if (phase === 2 && pattern === 1) {
      const spin = (this.shotPatternIndex * 0.38) % (Math.PI * 2);
      for (let i = 0; i < 4; i++) {
        const angle = spin + (i / 4) * Math.PI * 2;
        this.fireProjectile(centerX, muzzleY, angle, baseSpeed - 46, 'boss');
      }
      this.fireProjectile(centerX, muzzleY, baseAngle, baseSpeed + 10, 'boss');
    } else if (phase === 2) {
      this.fireProjectile(leftMuzzleX, muzzleY, baseAngle - 0.18, baseSpeed + 18, 'boss');
      this.fireProjectile(rightMuzzleX, muzzleY, baseAngle + 0.18, baseSpeed + 18, 'boss');
      this.fireProjectile(centerX, muzzleY, baseAngle, baseSpeed + 30, 'boss');
    } else if (pattern === 0 || pattern === 3) {
      const arc = [-0.54, -0.32, -0.12, 0.12, 0.32, 0.54];
      for (const offset of arc) {
        this.fireProjectile(centerX, muzzleY, baseAngle + offset, baseSpeed + 4, 'boss');
      }
    } else if (pattern === 1) {
      const spin = this.shotPatternIndex * 0.45;
      for (let i = 0; i < 6; i++) {
        const angle = spin + (i / 6) * Math.PI * 2;
        this.fireProjectile(centerX, muzzleY, angle, baseSpeed - 28, 'boss');
      }
    } else if (pattern === 2) {
      this.fireProjectile(leftMuzzleX, muzzleY, baseAngle - 0.22, baseSpeed + 18, 'boss');
      this.fireProjectile(rightMuzzleX, muzzleY, baseAngle + 0.22, baseSpeed + 18, 'boss');
      this.fireProjectile(centerX, muzzleY, baseAngle, baseSpeed + 24, 'boss');
      this.fireProjectile(centerX, muzzleY, baseAngle + Math.PI * 0.92, baseSpeed - 118, 'boss');
    } else {
      const lattice = [-0.32, 0, 0.32];
      for (const offset of lattice) {
        this.fireProjectile(leftMuzzleX, muzzleY, baseAngle + offset, baseSpeed + 8, 'boss');
        this.fireProjectile(rightMuzzleX, muzzleY, baseAngle - offset, baseSpeed + 8, 'boss');
      }
    }

    this.shootFlashUntil = time + 220;
    this.forceVisualRefresh = true;
    const minCooldown = phase === 3 ? 620 : phase === 2 ? 800 : 980;
    const maxCooldown = phase === 3 ? 980 : phase === 2 ? 1200 : 1450;
    const levelFactor = Phaser.Math.Clamp(1 - this.difficultyLevel * 0.01, 0.75, 1);
    const presetFactor = Phaser.Math.Clamp(
      1 / (0.72 + this.preset.bossAggressionScale * 0.28),
      0.9,
      1.1,
    );
    const cooldown = Phaser.Math.Between(minCooldown, maxCooldown) * levelFactor * presetFactor;
    const cooldownFloor = phase === 3 ? 520 : phase === 2 ? 640 : 760;
    this.nextShotAt = time + Phaser.Math.Clamp(cooldown, cooldownFloor, 1900);
    const pan = Phaser.Math.Clamp((this.x / this.scene.scale.width) * 2 - 1, -0.9, 0.9);
    this.audioManager.playUFOShoot('boss', pan);
  }

  private fireProjectile(
    muzzleX: number,
    muzzleY: number,
    angle: number,
    speed: number,
    variant: UFOVariant,
  ) {
    if (!this.projectiles) return;
    const shot = this.projectiles.get(muzzleX, muzzleY) as UFOProjectile | null;
    if (!shot) return;
    shot.fire(muzzleX, muzzleY, angle, speed, variant);
    if (variant === 'scout') {
      const pan = Phaser.Math.Clamp((muzzleX / this.scene.scale.width) * 2 - 1, -0.95, 0.95);
      this.audioManager.playUFOShoot('scout', pan);
    }
  }
}
