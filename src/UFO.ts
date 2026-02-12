import Phaser from 'phaser';
import { AudioManager } from './AudioManager';
import { getDifficultyPreset } from './Difficulty';
import type { DifficultyPreset } from './Difficulty';
import { JUICE_TUNING } from './MainSceneTuning';
import { UFOCombatSystem } from './entities/ufo/UFOCombatSystem';
import { UFOMovementSystem } from './entities/ufo/UFOMovementSystem';

export type UFOVariant = 'scout' | 'boss';

type UFOOptions = {
  combatEnabled?: boolean;
};

type UFOSpawnConfig = {
  variant?: UFOVariant;
  level?: number;
};

function createCanvasTexture(
  scene: Phaser.Scene,
  key: string,
  width: number,
  height: number,
  draw: (ctx: CanvasRenderingContext2D, width: number, height: number) => void,
) {
  if (scene.textures.exists(key)) return;
  const texture = scene.textures.createCanvas(key, width, height);
  if (!texture) return;
  const ctx = texture.getContext();
  ctx.clearRect(0, 0, width, height);
  draw(ctx, width, height);
  texture.refresh();
}

function drawScoutHullTexture(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const cx = width * 0.5;
  const cy = height * 0.54;
  const w = width * 0.9;
  const h = height * 0.48;

  ctx.fillStyle = 'rgba(0,0,0,0.34)';
  ctx.beginPath();
  ctx.ellipse(cx, cy + h * 0.24, w * 0.48, h * 0.48, 0, 0, Math.PI * 2);
  ctx.fill();

  const hullGrad = ctx.createLinearGradient(
    cx - w * 0.35,
    cy - h * 0.5,
    cx + w * 0.4,
    cy + h * 0.42,
  );
  hullGrad.addColorStop(0, '#65758f');
  hullGrad.addColorStop(0.42, '#2f3d55');
  hullGrad.addColorStop(1, '#111823');
  ctx.fillStyle = hullGrad;
  ctx.beginPath();
  ctx.ellipse(cx, cy, w * 0.5, h * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(232,243,255,0.86)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(cx, cy, w * 0.5, h * 0.5, 0, 0, Math.PI * 2);
  ctx.stroke();

  const bandGrad = ctx.createLinearGradient(cx, cy - h * 0.28, cx, cy + h * 0.36);
  bandGrad.addColorStop(0, 'rgba(22, 36, 56, 0.12)');
  bandGrad.addColorStop(0.55, 'rgba(7, 11, 18, 0.52)');
  bandGrad.addColorStop(1, 'rgba(3, 5, 9, 0.72)');
  ctx.fillStyle = bandGrad;
  ctx.beginPath();
  ctx.ellipse(cx, cy + h * 0.06, w * 0.44, h * 0.28, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(130, 167, 210, 0.5)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.ellipse(cx, cy + h * 0.02, w * 0.42, h * 0.24, 0, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(194, 222, 255, 0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, w * 0.22, Math.PI * 0.2, Math.PI * 0.8);
  ctx.moveTo(cx - w * 0.2, cy + h * 0.08);
  ctx.lineTo(cx + w * 0.2, cy + h * 0.08);
  ctx.moveTo(cx - w * 0.27, cy - h * 0.03);
  ctx.lineTo(cx + w * 0.27, cy - h * 0.03);
  ctx.stroke();

  const lightCount = 7;
  for (let i = 0; i < lightCount; i++) {
    const t = i / (lightCount - 1);
    const lx = cx - w * 0.34 + t * w * 0.68;
    const ly = cy + h * 0.18 + Math.sin(t * Math.PI * 2) * 1.4;
    const lightGrad = ctx.createRadialGradient(lx, ly, 0.2, lx, ly, 2.6);
    lightGrad.addColorStop(0, i % 2 === 0 ? 'rgba(160,236,255,1)' : 'rgba(255,168,232,1)');
    lightGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = lightGrad;
    ctx.beginPath();
    ctx.arc(lx, ly, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  const topRim = ctx.createLinearGradient(
    cx - w * 0.45,
    cy - h * 0.36,
    cx + w * 0.45,
    cy - h * 0.22,
  );
  topRim.addColorStop(0, 'rgba(245,250,255,0.8)');
  topRim.addColorStop(0.5, 'rgba(199,223,255,0.22)');
  topRim.addColorStop(1, 'rgba(245,250,255,0.72)');
  ctx.strokeStyle = topRim;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(cx, cy - h * 0.03, w * 0.45, Math.PI * 1.12, Math.PI * 1.88);
  ctx.stroke();
}

function drawScoutDomeTexture(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const cx = width * 0.5;
  const cy = height * 0.62;
  const w = width * 0.78;
  const h = height * 0.62;

  ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
  ctx.beginPath();
  ctx.ellipse(cx, cy + h * 0.22, w * 0.48, h * 0.26, 0, 0, Math.PI * 2);
  ctx.fill();

  const domeGrad = ctx.createRadialGradient(
    cx - w * 0.18,
    cy - h * 0.22,
    h * 0.04,
    cx,
    cy,
    w * 0.56,
  );
  domeGrad.addColorStop(0, 'rgba(224,248,255,0.98)');
  domeGrad.addColorStop(0.45, 'rgba(127,225,255,0.74)');
  domeGrad.addColorStop(1, 'rgba(37,119,186,0.26)');
  ctx.fillStyle = domeGrad;
  ctx.beginPath();
  ctx.ellipse(cx, cy, w * 0.5, h * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(174,238,255,0.86)';
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.ellipse(cx, cy, w * 0.5, h * 0.5, 0, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(236,253,255,0.42)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx - w * 0.06, cy - h * 0.08, w * 0.2, Math.PI * 1.08, Math.PI * 1.78);
  ctx.stroke();
}

function drawBossHullTexture(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const cx = width * 0.5;
  const cy = height * 0.56;
  const w = width * 0.93;
  const h = height * 0.5;

  ctx.fillStyle = 'rgba(0,0,0,0.38)';
  ctx.beginPath();
  ctx.ellipse(cx, cy + h * 0.24, w * 0.5, h * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();

  const hullGrad = ctx.createLinearGradient(
    cx - w * 0.42,
    cy - h * 0.52,
    cx + w * 0.4,
    cy + h * 0.42,
  );
  hullGrad.addColorStop(0, '#7e437a');
  hullGrad.addColorStop(0.34, '#41234f');
  hullGrad.addColorStop(1, '#170d26');
  ctx.fillStyle = hullGrad;
  ctx.beginPath();
  ctx.ellipse(cx, cy, w * 0.5, h * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(255, 180, 243, 0.92)';
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.ellipse(cx, cy, w * 0.5, h * 0.5, 0, 0, Math.PI * 2);
  ctx.stroke();

  const armorBand = ctx.createLinearGradient(cx, cy - h * 0.18, cx, cy + h * 0.38);
  armorBand.addColorStop(0, 'rgba(26, 12, 35, 0.18)');
  armorBand.addColorStop(0.55, 'rgba(10, 5, 16, 0.6)');
  armorBand.addColorStop(1, 'rgba(5, 2, 11, 0.78)');
  ctx.fillStyle = armorBand;
  ctx.beginPath();
  ctx.ellipse(cx, cy + h * 0.08, w * 0.45, h * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(158, 230, 255, 0.7)';
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.ellipse(cx, cy + h * 0.02, w * 0.43, h * 0.26, 0, 0, Math.PI * 2);
  ctx.stroke();

  const segmentCount = 6;
  for (let i = 0; i < segmentCount; i++) {
    const t = i / (segmentCount - 1);
    const sx = cx - w * 0.33 + t * w * 0.66;
    ctx.strokeStyle = 'rgba(219, 237, 255, 0.28)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(sx, cy - h * 0.03);
    ctx.lineTo(sx + Math.sin(t * Math.PI) * 2.2, cy + h * 0.24);
    ctx.stroke();
  }

  const orbitLights = 11;
  for (let i = 0; i < orbitLights; i++) {
    const angle = (i / orbitLights) * Math.PI * 2;
    const lx = cx + Math.cos(angle) * (w * 0.38);
    const ly = cy + h * 0.08 + Math.sin(angle) * (h * 0.21);
    const lightGrad = ctx.createRadialGradient(lx, ly, 0.2, lx, ly, 3);
    lightGrad.addColorStop(0, i % 2 === 0 ? 'rgba(173,247,255,1)' : 'rgba(255,145,241,1)');
    lightGrad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = lightGrad;
    ctx.beginPath();
    ctx.arc(lx, ly, 2.8, 0, Math.PI * 2);
    ctx.fill();
  }

  const topRim = ctx.createLinearGradient(
    cx - w * 0.48,
    cy - h * 0.38,
    cx + w * 0.48,
    cy - h * 0.24,
  );
  topRim.addColorStop(0, 'rgba(255,229,248,0.86)');
  topRim.addColorStop(0.5, 'rgba(255,204,244,0.26)');
  topRim.addColorStop(1, 'rgba(255,229,248,0.78)');
  ctx.strokeStyle = topRim;
  ctx.lineWidth = 1.7;
  ctx.beginPath();
  ctx.arc(cx, cy - h * 0.03, w * 0.46, Math.PI * 1.1, Math.PI * 1.9);
  ctx.stroke();
}

function drawBossDomeTexture(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const cx = width * 0.5;
  const cy = height * 0.63;
  const w = width * 0.8;
  const h = height * 0.65;

  ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
  ctx.beginPath();
  ctx.ellipse(cx, cy + h * 0.22, w * 0.5, h * 0.24, 0, 0, Math.PI * 2);
  ctx.fill();

  const domeGrad = ctx.createRadialGradient(
    cx - w * 0.14,
    cy - h * 0.23,
    h * 0.03,
    cx,
    cy,
    w * 0.58,
  );
  domeGrad.addColorStop(0, 'rgba(255,236,255,0.98)');
  domeGrad.addColorStop(0.38, 'rgba(225,143,255,0.8)');
  domeGrad.addColorStop(1, 'rgba(104,59,179,0.3)');
  ctx.fillStyle = domeGrad;
  ctx.beginPath();
  ctx.ellipse(cx, cy, w * 0.5, h * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(255, 194, 245, 0.92)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.ellipse(cx, cy, w * 0.5, h * 0.5, 0, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(255, 235, 250, 0.38)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx - w * 0.04, cy - h * 0.08, w * 0.22, Math.PI * 1.05, Math.PI * 1.82);
  ctx.stroke();
}

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

  createCanvasTexture(scene, 'ufo_scout_hull', 136, 88, drawScoutHullTexture);
  createCanvasTexture(scene, 'ufo_scout_dome', 86, 52, drawScoutDomeTexture);
  createCanvasTexture(scene, 'ufo_boss_hull', 178, 104, drawBossHullTexture);
  createCanvasTexture(scene, 'ufo_boss_dome', 112, 62, drawBossDomeTexture);
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
  private hullSprite: Phaser.GameObjects.Image;
  private domeSprite: Phaser.GameObjects.Image;
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
  private lastBerserkScale: number = 1;
  private tentaclePhases: number[] = [0, 0.9, 1.8, 2.7, 3.6, 4.5];
  private visualRefreshAccumulatorMs: number = 0;
  private forceVisualRefresh: boolean = true;
  private bossHitsLabelCache: string = '';
  private bossHitsColorCache: string = '#ffffff';
  private reducedVisualDetail: boolean = false;

  // Refactored systems (Phase 6)
  private combatSystem: UFOCombatSystem;
  private movementSystem: UFOMovementSystem;

  constructor(scene: Phaser.Scene, audio: AudioManager, options: UFOOptions = {}) {
    ensureUFOTextures(scene);
    super(scene, -100, -100, 'ufo_hitbox');
    this.audioManager = audio;
    this.combatEnabled = Boolean(options.combatEnabled);

    // Initialize combat and movement systems
    this.combatSystem = new UFOCombatSystem({
      variant: this.variant,
      maxHitPoints: this.variant === 'boss' ? 6 : 1,
    });
    this.movementSystem = new UFOMovementSystem({
      variant: this.variant,
      startX: 0,
      startY: 0,
      movementSeed: 0,
      difficultyLevel: this.difficultyLevel,
      reducedVisualDetail: this.reducedVisualDetail,
    });

    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setCircle(24, 8, 8);
    this.setAlpha(0.001);

    this.hullSprite = scene.add.image(-999, -999, 'ufo_scout_hull').setVisible(false);
    this.domeSprite = scene.add
      .image(-999, -999, 'ufo_scout_dome')
      .setVisible(false)
      .setAlpha(0.95);
    this.visualGraphics = scene.add.graphics();
    this.hullSprite.setDepth(this.depth + 1);
    this.domeSprite.setDepth(this.depth + 1.2);
    this.visualGraphics.setDepth(this.depth + 2);
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
      this.hullSprite.destroy();
      this.domeSprite.destroy();
      this.visualGraphics.destroy();
      this.bossHitsText.destroy();
    });

    this.deactivate();
  }

  public override setDepth(value: number): this {
    super.setDepth(value);
    this.hullSprite.setDepth(value + 1);
    this.domeSprite.setDepth(value + 1.2);
    this.visualGraphics.setDepth(value + 2);
    this.bossHitsText.setDepth(value + 3);
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
    // Reset movement system with new reduced visual detail setting
    this.movementSystem.reset({
      variant: this.variant,
      startX: this.startX,
      startY: this.startY,
      movementSeed: this.movementSeed,
      difficultyLevel: this.difficultyLevel,
      reducedVisualDetail: reduced,
    });
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
    // Reset combat system with new modifier
    this.combatSystem.reset({
      variant: this.variant,
      maxHitPoints: this.maxHitPoints,
      modifier: mod,
    });
  }

  public getBossModifier(): BossModifier {
    return this.bossModifier;
  }

  public ensureCombatReady() {
    if (!this.active) this.setActive(true);
    if (!this.visible) this.setVisible(true);
    if (this.body && !this.body.enable) this.body.enable = true;
    if (!this.hullSprite.visible) this.hullSprite.setVisible(true);
    if (!this.domeSprite.visible) this.domeSprite.setVisible(true);
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
    this.bossHitsLabelCache = '';
    this.bossHitsColorCache = '#ffffff';
    this.bossModifier = 'none';
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
      this.hullSprite.setTexture('ufo_boss_hull');
      this.domeSprite.setTexture('ufo_boss_dome');
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
      this.hullSprite.setTexture('ufo_scout_hull');
      this.domeSprite.setTexture('ufo_scout_dome');
    }

    this.setScale(1);
    this.hullSprite.setVisible(true);
    this.domeSprite.setVisible(true);
    this.hullSprite.setAlpha(1);
    this.domeSprite.setAlpha(0.95);
    this.visualGraphics.setVisible(true);
    this.audioManager.startUFOSound();

    // Reset combat and movement systems
    this.combatSystem.reset({
      variant: this.variant,
      maxHitPoints: this.maxHitPoints,
      modifier: this.bossModifier,
    });
    this.movementSystem.reset({
      variant: this.variant,
      startX: this.startX,
      startY: this.startY,
      movementSeed: this.movementSeed,
      difficultyLevel: this.difficultyLevel,
      reducedVisualDetail: this.reducedVisualDetail,
    });
  }

  public applyBulletHit(damage: number = 1) {
    // Delegate to combat system
    const result = this.combatSystem.applyDamage(damage, this.active);

    // Sync local fields for rendering
    this.hitPoints = result.health;
    this.maxHitPoints = result.maxHealth;
    this.displayHitPoints = this.combatSystem.getDisplayHitPoints();
    this.bossPhase = this.combatSystem.getBossPhase();

    if (this.active) {
      this.hitFlashUntil = this.scene.time.now + 120;
      this.forceVisualRefresh = true;

      if (result.destroyed) {
        this.deactivate();
      } else {
        this.ensureCombatReady();
      }
    }

    return result;
  }

  preUpdate(time: number, delta: number) {
    super.preUpdate(time, delta);
    if (!this.active) return;

    this.timeAlive += delta * 0.001;

    // Update combat system (boss phase, HP smoothing, regen)
    this.combatSystem.update(delta);
    this.hitPoints = this.combatSystem.getHitPoints();
    this.displayHitPoints = this.combatSystem.getDisplayHitPoints();
    this.bossPhase = this.combatSystem.getBossPhase();

    // Update movement system
    if (this.variant === 'boss') {
      const movementState = this.movementSystem.updateBoss(
        this.x,
        this.y,
        this.timeAlive,
        delta,
        time,
        this.bossPhase,
        this.scene.scale.width,
        this.scene.scale.height,
        (this.evasionThreats as any) ?? undefined,
      );
      this.x = movementState.x;
      this.y = movementState.y;
      this.travelDir = movementState.travelDir;
      this.startY = movementState.startY;
      if (this.body) {
        this.body.velocity.x = movementState.velocityX;
        this.body.velocity.y = movementState.velocityY;
      }

      // Berserk: speed increases as HP decreases
      if (this.bossModifier === 'berserk' && this.body) {
        const berserkScale = this.combatSystem.getBerserkScale();
        const baseVx = this.body.velocity.x;
        if (Math.abs(baseVx) > 10) {
          const sign = baseVx > 0 ? 1 : -1;
          const absSpeed = Math.abs(baseVx) / (this.lastBerserkScale ?? 1);
          this.lastBerserkScale = berserkScale;
          this.body.velocity.x = sign * absSpeed * berserkScale;
        }
      }
    } else {
      const movementState = this.movementSystem.updateScout(
        this.x,
        this.y,
        this.timeAlive,
        this.scene.scale.width,
      );
      this.y = movementState.y;
      this.travelDir = movementState.travelDir;
      if (this.body) {
        this.body.velocity.x = movementState.velocityX;
        this.body.velocity.y = movementState.velocityY;
      }
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

    this.hullSprite.setVisible(false);
    this.domeSprite.setVisible(false);
    this.hullSprite.clearTint();
    this.domeSprite.clearTint();
    this.visualGraphics.clear();
    this.visualGraphics.setVisible(false);
    this.bossHitsText.setVisible(false);
    this.bossHitsLabelCache = '';
    this.bossHitsColorCache = '#ffffff';
    this.pendingBossVolleyAt = 0;
    this.bossTelegraphUntil = 0;
    this.visualRefreshAccumulatorMs = 0;
    this.forceVisualRefresh = true;
    this.clearProjectiles();
    this.audioManager.stopUFOSound();
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

  private syncHullLayers(time: number) {
    if (!this.hullSprite.visible || !this.domeSprite.visible) return;

    const bob = Math.sin(time * 0.003 + this.movementSeed) * 1.6;
    if (this.variant === 'boss') {
      const hpRatio = Phaser.Math.Clamp(this.hitPoints / Math.max(1, this.maxHitPoints), 0, 1);
      const phase = this.combatSystem.getBossPhase();
      const pulse = 0.5 + Math.sin(time * 0.005 + this.movementSeed) * 0.5;
      const berserkBoost =
        this.bossModifier === 'berserk'
          ? 1 + (1 - hpRatio) * (this.reducedVisualDetail ? 0.03 : 0.06)
          : 1;
      const baseScale = (1 + (phase - 1) * 0.045) * berserkBoost;
      const roll = Math.sin(time * 0.0018 + this.movementSeed) * 1.9;
      const hullY = this.y + 5 + bob;
      const domeY = this.y - 10 + bob * 0.6;
      this.hullSprite.setPosition(this.x, hullY);
      this.hullSprite.setScale(baseScale, baseScale * 0.98);
      this.hullSprite.setAngle(roll);
      this.domeSprite.setPosition(this.x, domeY);
      this.domeSprite.setScale(baseScale * (0.95 + pulse * 0.025));
      this.domeSprite.setAngle(roll * 0.42);

      if (time < this.hitFlashUntil) {
        this.hullSprite.setTintFill(0xffffff);
        this.domeSprite.setTintFill(0xffffff);
      } else {
        const damage = 1 - hpRatio;
        const hullR = Math.round(232 + damage * 23);
        const hullG = Math.round(210 - damage * 78);
        const hullB = Math.round(255 - damage * 30);
        const domeR = Math.round(255 - damage * 10);
        const domeG = Math.round(220 - damage * 62);
        const domeB = Math.round(255 - damage * 14);
        this.hullSprite.setTint((hullR << 16) | (hullG << 8) | hullB);
        this.domeSprite.setTint((domeR << 16) | (domeG << 8) | domeB);
      }
      return;
    }

    const roll = Math.sin(time * 0.0024 + this.movementSeed) * 1.3;
    this.hullSprite.setPosition(this.x, this.y + 3 + bob);
    this.hullSprite.setScale(1, 1);
    this.hullSprite.setAngle(roll);
    this.domeSprite.setPosition(this.x, this.y - 6 + bob * 0.52);
    this.domeSprite.setScale(1);
    this.domeSprite.setAngle(roll * 0.4);
    if (time < this.hitFlashUntil) {
      this.hullSprite.setTintFill(0xffffff);
      this.domeSprite.setTintFill(0xffffff);
    } else {
      this.hullSprite.setTint(0xf1f7ff);
      this.domeSprite.setTint(0xe1f7ff);
    }
  }

  private drawScoutBody(time: number) {
    this.syncHullLayers(time);
    if (this.bossHitsText.visible) {
      this.bossHitsText.setVisible(false);
    }
    const g = this.visualGraphics;
    const x = this.x;
    const y = this.y;
    const pulse = 0.5 + Math.sin(time * 0.008) * 0.5;
    const tentaclePulse = 0.6 + Math.sin(time * 0.01) * 0.4;

    g.clear();
    g.setDepth(this.depth + 2);

    const tentacleStep = this.reducedVisualDetail ? 2 : 1;
    for (let i = 0; i < this.tentaclePhases.length; i += tentacleStep) {
      const phase = this.tentaclePhases[i];
      const rootX = x - 34 + i * 14;
      const rootY = y + 17;
      const sway = Math.sin(time * 0.006 + phase) * 12 * tentaclePulse;
      const curl = Math.cos(time * 0.009 + phase) * 10;
      const tipY = rootY + 18 + Math.sin(time * 0.01 + phase) * 9;
      g.lineStyle(2, 0x6addff, 0.32 + pulse * 0.22);
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

    g.lineStyle(1.2, 0x6ef0ff, 0.52 + pulse * 0.18);
    g.strokeEllipse(x, y + 7, 112, 28);
    g.lineStyle(1, 0xb6d7ff, 0.3 + pulse * 0.16);
    g.strokeEllipse(x, y + 2, 98, 22);

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
      g.lineStyle(2.4, 0xffffff, 0.8);
      g.strokeEllipse(x, y + 3, 114, 40);
    }
  }

  private drawBossBody(time: number) {
    this.syncHullLayers(time);
    const g = this.visualGraphics;
    const x = this.x;
    const y = this.y;
    const pulse = 0.5 + Math.sin(time * 0.007 + this.movementSeed) * 0.5;
    const hpRatio = this.maxHitPoints > 0 ? this.hitPoints / this.maxHitPoints : 0;
    const displayRatio = this.maxHitPoints > 0 ? this.displayHitPoints / this.maxHitPoints : 0;
    const phase = this.combatSystem.getBossPhase();
    const tentacleCount = this.reducedVisualDetail ? 5 : 8;
    const hullAccent = phase === 3 ? 0xff4eb8 : phase === 2 ? 0xff73d8 : 0xff58cf;
    const energyAccent = phase === 3 ? 0xff91ff : phase === 2 ? 0x9df6ff : 0x5ee1ff;

    g.clear();
    g.setDepth(this.depth + 2);

    for (let i = 0; i < tentacleCount; i++) {
      const phase = i * 0.75 + this.movementSeed;
      const rootX = x - 52 + i * 15;
      const rootY = y + 24;
      const wave = Math.sin(time * 0.008 + phase) * 14;
      const tipY = rootY + 34 + Math.cos(time * 0.01 + phase) * 11;
      g.lineStyle(2.4, energyAccent, 0.35 + pulse * 0.28);
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

    g.lineStyle(2, energyAccent, 0.52 + pulse * 0.2);
    g.strokeEllipse(x, y + 8, 118, 28);
    g.lineStyle(1.4, hullAccent, 0.42 + pulse * 0.2);
    g.strokeEllipse(x, y + 2, 136, 34);
    g.lineStyle(1, 0xbbe6ff, 0.24 + pulse * 0.14);
    g.strokeEllipse(x, y - 8, 84, 26);

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
      const phase = this.combatSystem.getBossPhase();
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
    const phase = this.combatSystem.getBossPhase();

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
