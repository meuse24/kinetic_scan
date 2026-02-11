import Phaser from 'phaser';
import { performanceMonitor } from './PerformanceMonitor';

const EXPLOSION_CORE_TEXTURE = 'explosion_core_particle';
const EXPLOSION_SPARK_TEXTURE = 'explosion_spark_particle';
const EXPLOSION_DEBRIS_TEXTURE = 'explosion_debris_particle';
const EXPLOSION_SMOKE_TEXTURE = 'explosion_smoke_particle';

type ExplosionStyle = 'auto' | 'cinematic' | 'competitive';
type ExplosionPresetKey = Exclude<ExplosionStyle, 'auto'>;

type ExplosionEmitterPreset = {
  coreLifespan: [number, number];
  coreSpeed: [number, number];
  sparkLifespan: [number, number];
  sparkSpeed: [number, number];
  debrisLifespan: [number, number];
  debrisSpeed: [number, number];
  debrisGravityY: number;
  smokeLifespan: [number, number];
  smokeSpeed: [number, number];
  smokeScale: [number, number];
  ufoDebrisLifespan: [number, number];
  ufoDebrisSpeed: [number, number];
  ufoDebrisGravityY: number;
};

type ExplosionBurstPreset = {
  asteroid: {
    core: number;
    spark: number;
    debris: number;
    smoke: number;
  };
  player: {
    core: number;
    spark: number;
    debris: number;
    smoke: number;
  };
  ufo: {
    core: number;
    spark: number;
    smoke: number;
    segmentScale: number;
    perSegmentScale: number;
  };
  emitter: ExplosionEmitterPreset;
};

const EXPLOSION_PRESETS: Record<ExplosionPresetKey, ExplosionBurstPreset> = {
  cinematic: {
    asteroid: { core: 8, spark: 15, debris: 11, smoke: 6 },
    player: { core: 56, spark: 94, debris: 70, smoke: 34 },
    ufo: { core: 30, spark: 24, smoke: 14, segmentScale: 1.12, perSegmentScale: 1.08 },
    emitter: {
      coreLifespan: [180, 360],
      coreSpeed: [90, 290],
      sparkLifespan: [260, 620],
      sparkSpeed: [240, 620],
      debrisLifespan: [620, 1220],
      debrisSpeed: [130, 360],
      debrisGravityY: 250,
      smokeLifespan: [820, 1700],
      smokeSpeed: [32, 125],
      smokeScale: [0.48, 1.95],
      ufoDebrisLifespan: [560, 1160],
      ufoDebrisSpeed: [180, 480],
      ufoDebrisGravityY: 170,
    },
  },
  competitive: {
    asteroid: { core: 4, spark: 7, debris: 5, smoke: 2 },
    player: { core: 24, spark: 40, debris: 28, smoke: 12 },
    ufo: { core: 14, spark: 11, smoke: 5, segmentScale: 0.9, perSegmentScale: 0.9 },
    emitter: {
      coreLifespan: [140, 260],
      coreSpeed: [65, 210],
      sparkLifespan: [180, 420],
      sparkSpeed: [190, 470],
      debrisLifespan: [420, 860],
      debrisSpeed: [90, 260],
      debrisGravityY: 200,
      smokeLifespan: [540, 980],
      smokeSpeed: [22, 90],
      smokeScale: [0.35, 1.3],
      ufoDebrisLifespan: [420, 860],
      ufoDebrisSpeed: [135, 360],
      ufoDebrisGravityY: 120,
    },
  },
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

function ensureExplosionTextures(scene: Phaser.Scene) {
  createCanvasTexture(scene, EXPLOSION_CORE_TEXTURE, 32, 32, (ctx, width, height) => {
    const cx = width * 0.5;
    const cy = height * 0.5;
    const core = ctx.createRadialGradient(cx, cy, 0.4, cx, cy, width * 0.5);
    core.addColorStop(0, 'rgba(255,255,255,1)');
    core.addColorStop(0.22, 'rgba(255,236,180,0.97)');
    core.addColorStop(0.55, 'rgba(255,164,84,0.66)');
    core.addColorStop(1, 'rgba(255,102,33,0)');
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(cx, cy, width * 0.5, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(255, 246, 221, 0.42)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, width * 0.29, 0, Math.PI * 2);
    ctx.stroke();
  });

  createCanvasTexture(scene, EXPLOSION_SPARK_TEXTURE, 24, 8, (ctx, width, height) => {
    const centerY = height * 0.5;
    const spark = ctx.createLinearGradient(0, centerY, width, centerY);
    spark.addColorStop(0, 'rgba(255,255,255,0)');
    spark.addColorStop(0.14, 'rgba(255,240,192,0.85)');
    spark.addColorStop(0.5, 'rgba(255,170,82,1)');
    spark.addColorStop(0.86, 'rgba(255,99,48,0.82)');
    spark.addColorStop(1, 'rgba(255,60,32,0)');
    ctx.fillStyle = spark;
    ctx.beginPath();
    ctx.moveTo(0, centerY);
    ctx.lineTo(width * 0.22, centerY - height * 0.42);
    ctx.lineTo(width * 0.94, centerY - height * 0.16);
    ctx.lineTo(width, centerY);
    ctx.lineTo(width * 0.94, centerY + height * 0.16);
    ctx.lineTo(width * 0.22, centerY + height * 0.42);
    ctx.closePath();
    ctx.fill();
  });

  createCanvasTexture(scene, EXPLOSION_DEBRIS_TEXTURE, 14, 14, (ctx, width, height) => {
    const points = [
      { x: width * 0.5, y: 1.6 },
      { x: width * 0.9, y: height * 0.32 },
      { x: width * 0.8, y: height * 0.86 },
      { x: width * 0.3, y: height * 0.92 },
      { x: 1.8, y: height * 0.6 },
      { x: width * 0.15, y: height * 0.2 },
    ];
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
    ctx.closePath();
    const chip = ctx.createLinearGradient(1.5, 1.5, width - 1.5, height - 1.5);
    chip.addColorStop(0, '#7d818a');
    chip.addColorStop(0.45, '#474b53');
    chip.addColorStop(1, '#171a20');
    ctx.fillStyle = chip;
    ctx.fill();
    ctx.strokeStyle = 'rgba(214, 218, 226, 0.7)';
    ctx.lineWidth = 0.8;
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255, 185, 122, 0.44)';
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(width * 0.28, height * 0.45);
    ctx.lineTo(width * 0.74, height * 0.57);
    ctx.stroke();
  });

  createCanvasTexture(scene, EXPLOSION_SMOKE_TEXTURE, 40, 40, (ctx, width, height) => {
    const cx = width * 0.5;
    const cy = height * 0.5;
    const haze = ctx.createRadialGradient(cx, cy, width * 0.12, cx, cy, width * 0.5);
    haze.addColorStop(0, 'rgba(58,64,74,0.66)');
    haze.addColorStop(0.58, 'rgba(38,43,50,0.42)');
    haze.addColorStop(1, 'rgba(24,28,35,0)');
    ctx.fillStyle = haze;
    ctx.beginPath();
    ctx.arc(cx, cy, width * 0.5, 0, Math.PI * 2);
    ctx.fill();

    for (let i = 0; i < 3; i++) {
      const ox = Phaser.Math.FloatBetween(-7, 7);
      const oy = Phaser.Math.FloatBetween(-7, 7);
      const radius = Phaser.Math.FloatBetween(5, 9);
      const cloud = ctx.createRadialGradient(
        cx + ox,
        cy + oy,
        radius * 0.2,
        cx + ox,
        cy + oy,
        radius,
      );
      cloud.addColorStop(0, 'rgba(88,93,102,0.35)');
      cloud.addColorStop(1, 'rgba(24,28,35,0)');
      ctx.fillStyle = cloud;
      ctx.beginPath();
      ctx.arc(cx + ox, cy + oy, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

export class ExplosionManager {
  private scene: Phaser.Scene;
  private coreEmitter: Phaser.GameObjects.Particles.ParticleEmitter;
  private sparkEmitter: Phaser.GameObjects.Particles.ParticleEmitter;
  private debrisEmitter: Phaser.GameObjects.Particles.ParticleEmitter;
  private smokeEmitter: Phaser.GameObjects.Particles.ParticleEmitter;
  private ufoDebrisEmitter: Phaser.GameObjects.Particles.ParticleEmitter;
  private stylePreference: ExplosionStyle = 'auto';
  private appliedPreset: ExplosionPresetKey | null = null;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    ensureExplosionTextures(scene);

    // Layer 1: short-lived additive fire core
    this.coreEmitter = this.scene.add.particles(0, 0, EXPLOSION_CORE_TEXTURE, {
      lifespan: { min: 160, max: 320 },
      speed: { min: 70, max: 240 },
      scale: { start: 0.95, end: 0 },
      alpha: { start: 1, end: 0 },
      angle: { min: 0, max: 360 },
      tint: [0xffffff, 0xfff1c0, 0xffb15a, 0xff5f2a],
      blendMode: 'ADD',
      emitting: false,
    });

    // Layer 2: fast sparks / streaks
    this.sparkEmitter = this.scene.add.particles(0, 0, EXPLOSION_SPARK_TEXTURE, {
      lifespan: { min: 220, max: 500 },
      speed: { min: 220, max: 560 },
      scale: { start: 1, end: 0.25 },
      alpha: { start: 0.95, end: 0 },
      angle: { min: 0, max: 360 },
      rotate: { min: 0, max: 360 },
      tint: [0xfff5cd, 0xffbc6b, 0xff7f3d, 0xff4b29],
      blendMode: 'ADD',
      emitting: false,
    });

    // Layer 3: slower debris chips
    this.debrisEmitter = this.scene.add.particles(0, 0, EXPLOSION_DEBRIS_TEXTURE, {
      lifespan: { min: 520, max: 980 },
      speed: { min: 110, max: 320 },
      scale: { start: 1, end: 0.3 },
      alpha: { start: 0.92, end: 0 },
      angle: { min: 0, max: 360 },
      rotate: { min: 0, max: 360 },
      gravityY: 220,
      tint: [0xcbd2dc, 0x8b929d, 0x666c76, 0x424852],
      blendMode: 'NORMAL',
      emitting: false,
    });

    // Layer 4: smoke, only when quality allows
    this.smokeEmitter = this.scene.add.particles(0, 0, EXPLOSION_SMOKE_TEXTURE, {
      lifespan: { min: 650, max: 1300 },
      speed: { min: 26, max: 110 },
      scale: { start: 0.45, end: 1.65 },
      alpha: { start: 0.42, end: 0 },
      angle: { min: 220, max: 320 },
      rotate: { min: -50, max: 50 },
      tint: [0xa4adb8, 0x7c858f, 0x616973, 0x4d545d],
      blendMode: 'NORMAL',
      emitting: false,
    });

    this.ufoDebrisEmitter = this.scene.add.particles(0, 0, 'ufo_shard', {
      lifespan: { min: 480, max: 980 },
      speed: { min: 160, max: 420 },
      scale: { start: 1.15, end: 0.15 },
      alpha: { start: 0.95, end: 0 },
      angle: { min: 0, max: 360 },
      rotate: { min: 0, max: 360 },
      gravityY: 140,
      tint: [0xdff8ff, 0xa7dcff, 0xf6b3e7, 0x7f8fb4],
      blendMode: 'NORMAL',
      emitting: false,
    });

    this.smokeEmitter.setDepth(98);
    this.debrisEmitter.setDepth(99);
    this.coreEmitter.setDepth(100);
    this.sparkEmitter.setDepth(101);
    this.ufoDebrisEmitter.setDepth(102);
  }

  public setExplosionStyle(style: ExplosionStyle) {
    if (this.stylePreference === style) return;
    this.stylePreference = style;
    this.appliedPreset = null;
  }

  private resolvePresetKey() {
    if (this.stylePreference === 'cinematic' || this.stylePreference === 'competitive') {
      return this.stylePreference;
    }
    if (performanceMonitor.reducedParticles || !performanceMonitor.smokeEnabled) {
      return 'competitive';
    }
    const budget = performanceMonitor.getFxBudgetScale(this.scene.game);
    return budget >= 0.9 ? 'cinematic' : 'competitive';
  }

  private applyPresetIfNeeded(key: ExplosionPresetKey) {
    if (this.appliedPreset === key) return;
    const preset = EXPLOSION_PRESETS[key].emitter;
    this.coreEmitter.lifespan = { min: preset.coreLifespan[0], max: preset.coreLifespan[1] };
    this.coreEmitter.speed = { min: preset.coreSpeed[0], max: preset.coreSpeed[1] };
    this.sparkEmitter.lifespan = { min: preset.sparkLifespan[0], max: preset.sparkLifespan[1] };
    this.sparkEmitter.speed = { min: preset.sparkSpeed[0], max: preset.sparkSpeed[1] };
    this.debrisEmitter.lifespan = {
      min: preset.debrisLifespan[0],
      max: preset.debrisLifespan[1],
    };
    this.debrisEmitter.speed = { min: preset.debrisSpeed[0], max: preset.debrisSpeed[1] };
    this.debrisEmitter.gravityY = preset.debrisGravityY;
    this.smokeEmitter.lifespan = { min: preset.smokeLifespan[0], max: preset.smokeLifespan[1] };
    this.smokeEmitter.speed = { min: preset.smokeSpeed[0], max: preset.smokeSpeed[1] };
    this.smokeEmitter.particleScaleX = {
      start: preset.smokeScale[0],
      end: preset.smokeScale[1],
    } as any;
    this.smokeEmitter.particleScaleY = {
      start: preset.smokeScale[0],
      end: preset.smokeScale[1],
    } as any;
    this.ufoDebrisEmitter.lifespan = {
      min: preset.ufoDebrisLifespan[0],
      max: preset.ufoDebrisLifespan[1],
    };
    this.ufoDebrisEmitter.speed = {
      min: preset.ufoDebrisSpeed[0],
      max: preset.ufoDebrisSpeed[1],
    };
    this.ufoDebrisEmitter.gravityY = preset.ufoDebrisGravityY;
    this.appliedPreset = key;
  }

  private emitCount(base: number, minRatio: number, floor: number = 1) {
    const min = Math.max(floor, Math.round(base * minRatio));
    return performanceMonitor.scaleFxCount(this.scene.game, base, min);
  }

  public triggerExplosion(x: number, y: number) {
    const presetKey = this.resolvePresetKey();
    this.applyPresetIfNeeded(presetKey);
    const preset = EXPLOSION_PRESETS[presetKey];
    const coreCount = this.emitCount(preset.asteroid.core, 0.25, 1);
    const sparkCount = this.emitCount(preset.asteroid.spark, 0.26, 2);
    const debrisCount = this.emitCount(preset.asteroid.debris, 0.3, 2);

    this.coreEmitter.emitParticleAt(x, y, coreCount);
    this.sparkEmitter.emitParticleAt(x, y, sparkCount);
    this.debrisEmitter.emitParticleAt(x, y, debrisCount);

    if (!performanceMonitor.reducedParticles && performanceMonitor.smokeEnabled) {
      const smokeCount = this.emitCount(preset.asteroid.smoke, 0.34, 1);
      this.smokeEmitter.emitParticleAt(x, y, smokeCount);
    }
  }

  public triggerPlayerDeathExplosion(x: number, y: number) {
    const presetKey = this.resolvePresetKey();
    this.applyPresetIfNeeded(presetKey);
    const preset = EXPLOSION_PRESETS[presetKey];
    const coreCount = this.emitCount(preset.player.core, 0.32, 8);
    const sparkCount = this.emitCount(preset.player.spark, 0.3, 12);
    const debrisCount = this.emitCount(preset.player.debris, 0.3, 10);

    this.coreEmitter.emitParticleAt(x, y, coreCount);
    this.sparkEmitter.emitParticleAt(x, y, sparkCount);
    this.debrisEmitter.emitParticleAt(x, y, debrisCount);

    if (!performanceMonitor.reducedParticles && performanceMonitor.smokeEnabled) {
      const smokeCount = this.emitCount(preset.player.smoke, 0.32, 6);
      this.smokeEmitter.emitParticleAt(x, y, smokeCount);
    }
  }

  public triggerUFODebrisRing(x: number, y: number, variant: 'scout' | 'boss') {
    const presetKey = this.resolvePresetKey();
    this.applyPresetIfNeeded(presetKey);
    const preset = EXPLOSION_PRESETS[presetKey];
    const reduced = performanceMonitor.reducedParticles;
    const fxBudget = performanceMonitor.getFxBudgetScale(this.scene.game);
    const ringRadius = variant === 'boss' ? 42 : 26;
    const baseSegments = variant === 'boss' ? (reduced ? 14 : 22) : reduced ? 10 : 16;
    const minSegments = variant === 'boss' ? 8 : 5;
    const segmentMax = Math.max(minSegments, Math.round(baseSegments * preset.ufo.segmentScale));
    const segments = Phaser.Math.Clamp(
      Math.round(baseSegments * fxBudget * preset.ufo.segmentScale),
      minSegments,
      segmentMax,
    );
    const basePerSegment = variant === 'boss' ? (reduced ? 2 : 3) : 1;
    const perSegment = Math.max(
      1,
      Math.round(basePerSegment * (0.65 + fxBudget * 0.35) * preset.ufo.perSegmentScale),
    );
    const baseCoreBurst = variant === 'boss' ? preset.ufo.core : Math.round(preset.ufo.core * 0.55);
    const baseSparkBurst =
      variant === 'boss' ? preset.ufo.spark : Math.round(preset.ufo.spark * 0.6);
    const coreBurst = this.emitCount(baseCoreBurst, 0.3, variant === 'boss' ? 4 : 2);
    const sparkBurst = this.emitCount(baseSparkBurst, 0.28, variant === 'boss' ? 3 : 2);

    for (let i = 0; i < segments; i++) {
      const angle = (i / segments) * 360;
      const rad = Phaser.Math.DegToRad(angle);
      const px = x + Math.cos(rad) * ringRadius;
      const py = y + Math.sin(rad) * ringRadius;
      this.ufoDebrisEmitter.emitParticleAt(px, py, perSegment);
    }

    this.coreEmitter.emitParticleAt(x, y, coreBurst);
    this.sparkEmitter.emitParticleAt(x, y, sparkBurst);
    this.ufoDebrisEmitter.emitParticleAt(x, y, coreBurst);

    if (!reduced && performanceMonitor.smokeEnabled) {
      const baseSmoke = variant === 'boss' ? preset.ufo.smoke : Math.round(preset.ufo.smoke * 0.5);
      const smokeBurst = this.emitCount(baseSmoke, 0.33, 2);
      this.smokeEmitter.emitParticleAt(x, y, smokeBurst);
    }
  }
}
