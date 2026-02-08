import Phaser from 'phaser';
import { performanceMonitor } from './PerformanceMonitor';

export class ExplosionManager {
  private scene: Phaser.Scene;
  private asteroidEmitter: Phaser.GameObjects.Particles.ParticleEmitter;
  private playerEmitter: Phaser.GameObjects.Particles.ParticleEmitter;
  private ufoDebrisEmitter: Phaser.GameObjects.Particles.ParticleEmitter;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;

    // Emitter for Asteroids
    this.asteroidEmitter = this.scene.add.particles(0, 0, 'particle_flare', {
      lifespan: { min: 300, max: 500 },
      speed: { min: 150, max: 400 },
      scale: { start: 1.5, end: 0 },
      alpha: { start: 1, end: 0 },
      angle: { min: 0, max: 360 },
      tint: [0xffffff, 0xffff00, 0xff8800, 0xff0000],
      blendMode: 'ADD',
      emitting: false,
    });

    // Dedicated Emitter for Player Death (Massive burst)
    this.playerEmitter = this.scene.add.particles(0, 0, 'particle_flare', {
      lifespan: { min: 1000, max: 2000 },
      speed: { min: 200, max: 600 },
      scale: { start: 3, end: 0 },
      alpha: { start: 1, end: 0 },
      angle: { min: 0, max: 360 },
      tint: [0xffffff, 0xffff00, 0xff8800, 0xff0000],
      blendMode: 'ADD',
      emitting: false,
    });

    this.ufoDebrisEmitter = this.scene.add.particles(0, 0, 'ufo_shard', {
      lifespan: { min: 480, max: 980 },
      speed: { min: 160, max: 420 },
      scale: { start: 1.15, end: 0.15 },
      alpha: { start: 0.95, end: 0 },
      angle: { min: 0, max: 360 },
      rotate: { min: 0, max: 360 },
      tint: [0x8af6ff, 0xff8ddf, 0xd3f7ff, 0x7ca6ff],
      blendMode: 'ADD',
      emitting: false,
    });

    this.asteroidEmitter.setDepth(100);
    this.playerEmitter.setDepth(101);
    this.ufoDebrisEmitter.setDepth(102);
  }

  public triggerExplosion(x: number, y: number) {
    const baseCount = performanceMonitor.reducedParticles ? 10 : 30;
    const minCount = performanceMonitor.reducedParticles ? 5 : 8;
    const emitCount = performanceMonitor.scaleFxCount(this.scene.game, baseCount, minCount);
    this.asteroidEmitter.emitParticleAt(x, y, emitCount);
  }

  public triggerPlayerDeathExplosion(x: number, y: number) {
    const baseCount = performanceMonitor.reducedParticles ? 60 : 200;
    const minCount = performanceMonitor.reducedParticles ? 30 : 80;
    const emitCount = performanceMonitor.scaleFxCount(this.scene.game, baseCount, minCount);
    this.playerEmitter.emitParticleAt(x, y, emitCount);
  }

  public triggerUFODebrisRing(x: number, y: number, variant: 'scout' | 'boss') {
    const reduced = performanceMonitor.reducedParticles;
    const fxBudget = performanceMonitor.getFxBudgetScale(this.scene.game);
    const ringRadius = variant === 'boss' ? 42 : 26;
    const baseSegments = variant === 'boss' ? (reduced ? 14 : 22) : reduced ? 10 : 16;
    const minSegments = variant === 'boss' ? 8 : 5;
    const segments = Phaser.Math.Clamp(
      Math.round(baseSegments * fxBudget),
      minSegments,
      baseSegments,
    );
    const basePerSegment = variant === 'boss' ? (reduced ? 2 : 3) : 1;
    const perSegment = Math.max(1, Math.round(basePerSegment * (0.65 + fxBudget * 0.35)));
    const baseCoreBurst = variant === 'boss' ? (reduced ? 16 : 28) : reduced ? 8 : 14;
    const coreBurst = performanceMonitor.scaleFxCount(
      this.scene.game,
      baseCoreBurst,
      reduced ? 4 : 6,
    );

    for (let i = 0; i < segments; i++) {
      const angle = (i / segments) * 360;
      const rad = Phaser.Math.DegToRad(angle);
      const px = x + Math.cos(rad) * ringRadius;
      const py = y + Math.sin(rad) * ringRadius;
      this.ufoDebrisEmitter.emitParticleAt(px, py, perSegment);
    }

    this.ufoDebrisEmitter.emitParticleAt(x, y, coreBurst);
  }
}
