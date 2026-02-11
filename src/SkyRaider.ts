import { AudioManager } from './AudioManager';
import { getDifficultyPreset } from './Difficulty';
import type { DifficultyPreset } from './Difficulty';

export type SkyRaiderVariant = 'stalker' | 'lancer';
type SkyRaiderState = 'enter' | 'engage' | 'dive' | 'retreat';

const SKY_RAIDER_STALKER_TEXTURE = 'sky_raider_stalker';
const SKY_RAIDER_LANCER_TEXTURE = 'sky_raider_lancer';
const SKY_RAIDER_SHOT_TEXTURE = 'sky_raider_shot';

function colorToRgba(color: number, alpha: number) {
  const c = Phaser.Display.Color.IntegerToColor(color);
  return `rgba(${c.red}, ${c.green}, ${c.blue}, ${alpha})`;
}

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

function drawStalkerTexture(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const points = [
    { x: width * 0.5, y: 6 },
    { x: width * 0.88, y: height * 0.58 },
    { x: width * 0.72, y: height * 0.82 },
    { x: width * 0.5, y: height * 0.72 },
    { x: width * 0.28, y: height * 0.82 },
    { x: width * 0.12, y: height * 0.58 },
  ];
  const traceHull = (offsetX: number = 0, offsetY: number = 0) => {
    ctx.beginPath();
    ctx.moveTo(points[0].x + offsetX, points[0].y + offsetY);
    for (let i = 1; i < points.length; i++)
      ctx.lineTo(points[i].x + offsetX, points[i].y + offsetY);
    ctx.closePath();
  };

  traceHull(0.6, 1.6);
  ctx.fillStyle = 'rgba(0,0,0,0.36)';
  ctx.fill();

  traceHull();
  const hullGrad = ctx.createLinearGradient(width * 0.18, 8, width * 0.82, height * 0.86);
  hullGrad.addColorStop(0, '#6f7e95');
  hullGrad.addColorStop(0.45, '#2b3a50');
  hullGrad.addColorStop(1, '#101722');
  ctx.fillStyle = hullGrad;
  ctx.fill();
  ctx.strokeStyle = 'rgba(214,233,255,0.9)';
  ctx.lineWidth = 1.8;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(width * 0.5, 11);
  ctx.lineTo(width * 0.72, height * 0.56);
  ctx.lineTo(width * 0.62, height * 0.7);
  ctx.lineTo(width * 0.5, height * 0.63);
  ctx.lineTo(width * 0.38, height * 0.7);
  ctx.lineTo(width * 0.28, height * 0.56);
  ctx.closePath();
  const panelGrad = ctx.createLinearGradient(width * 0.5, 11, width * 0.5, height * 0.7);
  panelGrad.addColorStop(0, '#111b29');
  panelGrad.addColorStop(1, '#080d14');
  ctx.fillStyle = panelGrad;
  ctx.fill();
  ctx.strokeStyle = 'rgba(120, 160, 205, 0.45)';
  ctx.lineWidth = 1;
  ctx.stroke();

  const cockpitGlow = ctx.createRadialGradient(
    width * 0.5,
    height * 0.42,
    0.7,
    width * 0.5,
    height * 0.42,
    10,
  );
  cockpitGlow.addColorStop(0, 'rgba(236,249,255,1)');
  cockpitGlow.addColorStop(0.42, 'rgba(134,220,255,0.85)');
  cockpitGlow.addColorStop(1, 'rgba(30,119,201,0)');
  ctx.fillStyle = cockpitGlow;
  ctx.beginPath();
  ctx.moveTo(width * 0.5, height * 0.22);
  ctx.lineTo(width * 0.62, height * 0.5);
  ctx.lineTo(width * 0.38, height * 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(163, 235, 255, 0.9)';
  ctx.lineWidth = 1.1;
  ctx.stroke();

  ctx.strokeStyle = 'rgba(205,228,255,0.28)';
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(width * 0.32, height * 0.36);
  ctx.lineTo(width * 0.68, height * 0.36);
  ctx.moveTo(width * 0.28, height * 0.58);
  ctx.lineTo(width * 0.72, height * 0.58);
  ctx.moveTo(width * 0.5, 10);
  ctx.lineTo(width * 0.5, height * 0.72);
  ctx.stroke();

  for (const engineX of [width * 0.3, width * 0.7]) {
    const engineGlow = ctx.createRadialGradient(
      engineX,
      height * 0.63,
      0.6,
      engineX,
      height * 0.63,
      6.5,
    );
    engineGlow.addColorStop(0, 'rgba(201,248,255,1)');
    engineGlow.addColorStop(1, 'rgba(67,190,255,0)');
    ctx.fillStyle = engineGlow;
    ctx.beginPath();
    ctx.arc(engineX, height * 0.63, 5.8, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = colorToRgba(0x6af0ff, 0.85);
  ctx.beginPath();
  ctx.arc(width * 0.3, height * 0.63, 3.2, 0, Math.PI * 2);
  ctx.arc(width * 0.7, height * 0.63, 3.2, 0, Math.PI * 2);
  ctx.fill();
}

function drawLancerTexture(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const points = [
    { x: width * 0.5, y: 4 },
    { x: width * 0.92, y: height * 0.54 },
    { x: width * 0.76, y: height * 0.9 },
    { x: width * 0.5, y: height * 0.76 },
    { x: width * 0.24, y: height * 0.9 },
    { x: width * 0.08, y: height * 0.54 },
  ];
  const traceHull = (offsetX: number = 0, offsetY: number = 0) => {
    ctx.beginPath();
    ctx.moveTo(points[0].x + offsetX, points[0].y + offsetY);
    for (let i = 1; i < points.length; i++)
      ctx.lineTo(points[i].x + offsetX, points[i].y + offsetY);
    ctx.closePath();
  };

  traceHull(0.7, 1.7);
  ctx.fillStyle = 'rgba(0,0,0,0.4)';
  ctx.fill();

  traceHull();
  const hullGrad = ctx.createLinearGradient(width * 0.2, 6, width * 0.82, height * 0.9);
  hullGrad.addColorStop(0, '#8f6a95');
  hullGrad.addColorStop(0.45, '#482a58');
  hullGrad.addColorStop(1, '#170f24');
  ctx.fillStyle = hullGrad;
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 202, 248, 0.92)';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(width * 0.5, 10);
  ctx.lineTo(width * 0.74, height * 0.52);
  ctx.lineTo(width * 0.64, height * 0.73);
  ctx.lineTo(width * 0.5, height * 0.64);
  ctx.lineTo(width * 0.36, height * 0.73);
  ctx.lineTo(width * 0.26, height * 0.52);
  ctx.closePath();
  const centerPlate = ctx.createLinearGradient(width * 0.5, 10, width * 0.5, height * 0.74);
  centerPlate.addColorStop(0, '#220f31');
  centerPlate.addColorStop(1, '#0b0612');
  ctx.fillStyle = centerPlate;
  ctx.fill();
  ctx.strokeStyle = 'rgba(208, 164, 222, 0.42)';
  ctx.lineWidth = 1.1;
  ctx.stroke();

  const spearGlow = ctx.createRadialGradient(
    width * 0.5,
    height * 0.42,
    0.8,
    width * 0.5,
    height * 0.42,
    12,
  );
  spearGlow.addColorStop(0, 'rgba(255,246,209,1)');
  spearGlow.addColorStop(0.35, 'rgba(255,195,146,0.88)');
  spearGlow.addColorStop(1, 'rgba(255,130,170,0)');
  ctx.fillStyle = spearGlow;
  ctx.beginPath();
  ctx.moveTo(width * 0.5, height * 0.16);
  ctx.lineTo(width * 0.62, height * 0.52);
  ctx.lineTo(width * 0.38, height * 0.52);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 223, 179, 0.9)';
  ctx.lineWidth = 1.2;
  ctx.stroke();

  ctx.strokeStyle = 'rgba(255, 228, 246, 0.3)';
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(width * 0.5, 8);
  ctx.lineTo(width * 0.5, height * 0.76);
  ctx.moveTo(width * 0.28, height * 0.53);
  ctx.lineTo(width * 0.72, height * 0.53);
  ctx.moveTo(width * 0.26, height * 0.72);
  ctx.lineTo(width * 0.74, height * 0.72);
  ctx.stroke();

  for (const engineX of [width * 0.24, width * 0.76]) {
    const engineGlow = ctx.createRadialGradient(
      engineX,
      height * 0.6,
      0.5,
      engineX,
      height * 0.6,
      7,
    );
    engineGlow.addColorStop(0, 'rgba(255,223,245,1)');
    engineGlow.addColorStop(1, 'rgba(255,111,220,0)');
    ctx.fillStyle = engineGlow;
    ctx.beginPath();
    ctx.arc(engineX, height * 0.6, 6, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = colorToRgba(0xff9fd8, 0.84);
  ctx.beginPath();
  ctx.arc(width * 0.24, height * 0.6, 3.2, 0, Math.PI * 2);
  ctx.arc(width * 0.76, height * 0.6, 3.2, 0, Math.PI * 2);
  ctx.fill();
}

function drawSkyRaiderShotTexture(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const cx = width * 0.5;
  const cy = height * 0.5;
  const outer = ctx.createRadialGradient(cx, cy, 0.5, cx, cy, width * 0.5);
  outer.addColorStop(0, 'rgba(226,255,249,1)');
  outer.addColorStop(0.35, 'rgba(153,255,228,0.82)');
  outer.addColorStop(1, 'rgba(54,176,170,0)');
  ctx.fillStyle = outer;
  ctx.beginPath();
  ctx.arc(cx, cy, width * 0.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = 'rgba(224,255,246,0.92)';
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.arc(cx, cy, width * 0.35, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(188,255,236,0.65)';
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(cx - width * 0.18, cy);
  ctx.lineTo(cx + width * 0.18, cy);
  ctx.moveTo(cx, cy - width * 0.18);
  ctx.lineTo(cx, cy + width * 0.18);
  ctx.stroke();
}

function ensureSkyRaiderTextures(scene: Phaser.Scene) {
  createCanvasTexture(scene, SKY_RAIDER_STALKER_TEXTURE, 64, 64, drawStalkerTexture);
  createCanvasTexture(scene, SKY_RAIDER_LANCER_TEXTURE, 64, 64, drawLancerTexture);
  createCanvasTexture(scene, SKY_RAIDER_SHOT_TEXTURE, 16, 16, drawSkyRaiderShotTexture);
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
