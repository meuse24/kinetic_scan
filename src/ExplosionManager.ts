import Phaser from 'phaser';
import { performanceMonitor } from './PerformanceMonitor';

export class ExplosionManager {
  private scene: Phaser.Scene;
  private asteroidEmitter: Phaser.GameObjects.Particles.ParticleEmitter;
  private playerEmitter: Phaser.GameObjects.Particles.ParticleEmitter;

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

    this.asteroidEmitter.setDepth(100);
    this.playerEmitter.setDepth(101);
  }

  public triggerExplosion(x: number, y: number) {
    this.asteroidEmitter.emitParticleAt(x, y, performanceMonitor.reducedParticles ? 10 : 30);
  }

  public triggerPlayerDeathExplosion(x: number, y: number) {
    this.playerEmitter.emitParticleAt(x, y, performanceMonitor.reducedParticles ? 60 : 200);
  }
}
