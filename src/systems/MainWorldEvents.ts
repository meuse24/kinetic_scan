import Phaser from 'phaser';
import type { Bullet, Player } from '../Player';
import { Enemy, EnemyManager } from '../EnemyManager';
import { performanceMonitor } from '../PerformanceMonitor';
import {
  ASTRONAUT_TUNING,
  ELITE_DRONE_TUNING,
  SWARM_TUNING,
  WORMHOLE_TUNING,
  pickEliteDroneSpawnDelayRange,
  type AstronautDeactivateReason,
  type EliteDroneDeactivateReason,
} from '../MainSceneTuning';

const ASTRONAUT_WAVE_TEXTURE_KEYS = [
  'rescue_astronaut_wave_0',
  'rescue_astronaut_wave_1',
  'rescue_astronaut_wave_2',
  'rescue_astronaut_wave_3',
] as const;

const ASTRONAUT_HOSE_NOZZLES = [
  [
    { x: 5.5, y: 29.5 },
    { x: 9, y: 35.6 },
  ],
  [
    { x: 6.8, y: 29.8 },
    { x: 8.6, y: 35.5 },
  ],
  [
    { x: 9, y: 30.1 },
    { x: 7.8, y: 35.4 },
  ],
  [
    { x: 7.7, y: 29.9 },
    { x: 8.3, y: 35.3 },
  ],
] as const;

type WormholeState = {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  ttlMs: number;
};

type AstronautState = {
  label: Phaser.GameObjects.Text;
  phase: number;
  baseVx: number;
  baseVy: number;
  waveFrameTimer: number;
  waveFrameIndex: number;
  waveDirection: 1 | -1;
  bubbleTimer: number;
};

interface MainWorldEventsConfig {
  scene: Phaser.Scene;
  enemyManager: EnemyManager;
  bullets: Phaser.Physics.Arcade.Group;
  player: Player;
  getLevel: () => number;
  isFlowBlocked: () => boolean;
  isGameOver: () => boolean;
}

/**
 * Coordinates periodic world events (wormhole, elite drone, swarm spawns)
 * and keeps their runtime state outside MainScene.
 */
export class MainWorldEvents {
  private readonly scene: Phaser.Scene;
  private readonly enemyManager: EnemyManager;
  private readonly bullets: Phaser.Physics.Arcade.Group;
  private readonly player: Player;
  private readonly getLevel: () => number;
  private readonly isFlowBlocked: () => boolean;
  private readonly isGameOver: () => boolean;

  private wormhole: WormholeState | null = null;
  private wormholeGraphics: Phaser.GameObjects.Graphics;
  private wormholeSpawnTimer: number = 0;
  private wormholeForceAccumulatorMs: number = 0;
  private wormholeVisualAccumulatorMs: number = 0;

  private eliteDrone: Phaser.Physics.Arcade.Sprite;
  private eliteDroneLabel: Phaser.GameObjects.Text;
  private eliteDroneSpawnTimer: number = 0;
  private eliteDroneLifetimeMs: number = 0;

  private astronautGroup: Phaser.Physics.Arcade.Group;
  private astronautBubbleEmitter: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  private astronautStates: Map<Phaser.Physics.Arcade.Sprite, AstronautState> = new Map();
  private isDestroyed: boolean = false;

  private swarmSpawnTimerMs: number = 0;
  private swarmKills: Map<number, number> = new Map();

  constructor(config: MainWorldEventsConfig) {
    this.scene = config.scene;
    this.enemyManager = config.enemyManager;
    this.bullets = config.bullets;
    this.player = config.player;
    this.getLevel = config.getLevel;
    this.isFlowBlocked = config.isFlowBlocked;
    this.isGameOver = config.isGameOver;

    this.wormholeGraphics = this.scene.add.graphics().setDepth(35);
    this.wormholeGraphics.setVisible(false);

    this.eliteDrone = this.scene.physics.add.sprite(-160, -160, 'elite_drone');
    this.eliteDrone.setActive(false);
    this.eliteDrone.setVisible(false);
    this.eliteDrone.setDepth(112);
    this.eliteDrone.setScale(1);
    this.eliteDrone.setCollideWorldBounds(false);
    this.eliteDrone.setCircle(14, 2, 2);
    const body = this.eliteDrone.body as Phaser.Physics.Arcade.Body | null;
    if (body) {
      body.allowGravity = false;
      body.moves = true;
      body.setMaxVelocity(360, 360);
    }

    this.eliteDroneLabel = this.scene.add
      .text(0, 0, 'ELITE', {
        fontFamily: '"Press Start 2P"',
        fontSize: '12px',
        color: '#afffd2',
        stroke: '#001a10',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(113)
      .setVisible(false);

    this.astronautGroup = this.scene.physics.add.group({
      maxSize: 10,
    });
    if (this.scene.textures.exists('astronaut_air_bubble')) {
      this.astronautBubbleEmitter = this.scene.add.particles(0, 0, 'astronaut_air_bubble', {
        lifespan: { min: 420, max: 940 },
        speedY: { min: -54, max: -16 },
        speedX: { min: -20, max: 18 },
        scale: { start: 0.32, end: 0.04 },
        alpha: { start: 0.86, end: 0 },
        quantity: 1,
        emitting: false,
      });
      this.astronautBubbleEmitter.setDepth(112);
    }

    this.resetTimers();
  }

  public destroy(): void {
    if (this.isDestroyed) return;
    this.clear('reset');
    this.wormholeGraphics.destroy();
    this.eliteDroneLabel.destroy();
    this.eliteDrone.destroy();
    this.astronautBubbleEmitter?.destroy();
    this.astronautBubbleEmitter = null;
    this.astronautGroup.destroy(true, true);
    this.astronautStates.clear();
    this.swarmKills.clear();
    this.isDestroyed = true;
  }

  public update(delta: number): void {
    if (this.isDestroyed) return;
    this.updateWormhole(delta);
    this.updateEliteDrone(delta);
    this.updateAstronaut(delta);
    this.updateSwarmSpawner(delta);
  }

  public clear(reason: EliteDroneDeactivateReason = 'reset'): void {
    if (this.isDestroyed) return;
    this.deactivateWormhole();
    this.deactivateEliteDrone(reason);
    this.deactivateAllAstronauts(reason === 'reset' ? 'reset' : 'expired');
  }

  public resetTimers(): void {
    if (this.isDestroyed) return;
    this.setWormholeSpawnTimer('initial');
    this.wormholeForceAccumulatorMs = 0;
    this.wormholeVisualAccumulatorMs = 0;
    this.eliteDroneSpawnTimer = this.rollRange(ELITE_DRONE_TUNING.initialSpawnDelayMs);
    this.eliteDroneLifetimeMs = 0;
    this.deactivateAllAstronauts('reset');
    this.swarmSpawnTimerMs =
      this.getLevel() >= SWARM_TUNING.minLevel
        ? this.rollRange(SWARM_TUNING.initialDelayMs)
        : 999999;
    this.swarmKills.clear();
  }

  public getEliteDrone(): Phaser.Physics.Arcade.Sprite {
    return this.eliteDrone;
  }

  public getAstronautGroup(): Phaser.Physics.Arcade.Group {
    return this.astronautGroup;
  }

  public isEliteDroneActive(): boolean {
    return Boolean(this.eliteDrone?.active);
  }

  public isAstronautActive(): boolean {
    return this.getAstronautActiveCount() > 0;
  }

  public getAstronautActiveCount(): number {
    if (this.isDestroyed) return 0;
    try {
      return this.astronautGroup.countActive(true);
    } catch {
      return this.astronautStates.size;
    }
  }

  public isWormholeActive(): boolean {
    return Boolean(this.wormhole?.active);
  }

  public deactivateEliteDrone(reason: EliteDroneDeactivateReason): void {
    if (this.isDestroyed) return;
    if (!this.eliteDrone) return;
    if (this.eliteDrone.active) {
      this.eliteDrone.disableBody(true, true);
      this.eliteDrone.setActive(false);
      this.eliteDrone.setVisible(false);
    }
    this.eliteDroneLabel.setVisible(false);
    this.eliteDroneLifetimeMs = 0;
    this.setEliteDroneSpawnTimer(reason);
  }

  public deactivateAstronaut(
    astronaut: Phaser.Physics.Arcade.Sprite,
    _reason: AstronautDeactivateReason,
  ): void {
    const state = this.astronautStates.get(astronaut);
    if (state) {
      state.label.destroy();
      this.astronautStates.delete(astronaut);
    }
    if (astronaut.active) {
      try {
        astronaut.disableBody(true, true);
      } catch {
        // Ignore teardown races during scene shutdown.
      }
      astronaut.setActive(false);
      astronaut.setVisible(false);
      astronaut.setTexture(ASTRONAUT_WAVE_TEXTURE_KEYS[0]);
      astronaut.setRotation(0);
    }
  }

  public spawnAstronautBurstFromScout(sourceX: number, sourceY: number): void {
    if (this.isDestroyed) return;
    if (this.isGameOver() || this.isFlowBlocked()) return;

    const burstCount = this.rollRange(ASTRONAUT_TUNING.scoutBurstCount);
    for (let i = 0; i < burstCount; i++) {
      this.spawnAstronautFromScout(sourceX, sourceY, i, burstCount);
    }
  }

  public spawnAstronautFromEnemyShip(sourceX: number, sourceY: number): void {
    if (this.isDestroyed) return;
    if (this.isGameOver() || this.isFlowBlocked()) return;
    this.spawnAstronautFromScout(sourceX, sourceY, 0, 1);
  }

  public registerSwarmKill(enemy: Enemy): number | null {
    if (enemy.swarmId === 0) return null;
    const swarmId = enemy.swarmId;
    const total = enemy.swarmTotal;
    const kills = (this.swarmKills.get(swarmId) ?? 0) + 1;
    this.swarmKills.set(swarmId, kills);

    if (kills < total) return null;

    this.swarmKills.delete(swarmId);
    return SWARM_TUNING.bonusPerAsteroid * total * SWARM_TUNING.fullSwarmBonusMultiplier;
  }

  private deactivateAllAstronauts(reason: AstronautDeactivateReason): void {
    const astronauts = Array.from(this.astronautStates.keys());
    for (const astronaut of astronauts) {
      this.deactivateAstronaut(astronaut, reason);
    }

    const groupAny = this.astronautGroup as any;
    const hasStableChildren =
      groupAny &&
      typeof groupAny.getChildren === 'function' &&
      groupAny.children &&
      Array.isArray(groupAny.children.entries);
    if (!hasStableChildren) {
      this.astronautStates.clear();
      return;
    }

    try {
      const groupAstronauts = this.astronautGroup.getChildren() as Phaser.Physics.Arcade.Sprite[];
      for (const astronaut of groupAstronauts) {
        if (this.astronautStates.has(astronaut)) continue;
        this.deactivateAstronaut(astronaut, reason);
      }
    } catch {
      // Ignore teardown races during scene shutdown.
    }

    this.astronautStates.clear();
  }

  private rollRange(range: readonly [number, number]): number {
    return Phaser.Math.Between(range[0], range[1]);
  }

  private setWormholeSpawnTimer(mode: 'initial' | 'respawn'): void {
    const range =
      mode === 'initial' ? WORMHOLE_TUNING.initialSpawnDelayMs : WORMHOLE_TUNING.respawnDelayMs;
    this.wormholeSpawnTimer = this.rollRange(range);
  }

  private setEliteDroneSpawnTimer(reason: EliteDroneDeactivateReason): void {
    this.eliteDroneSpawnTimer = this.rollRange(pickEliteDroneSpawnDelayRange(reason));
  }

  private updateSwarmSpawner(delta: number): void {
    if (this.getLevel() < SWARM_TUNING.minLevel || this.isFlowBlocked()) return;
    this.swarmSpawnTimerMs -= delta;
    if (this.swarmSpawnTimerMs > 0) return;
    this.swarmSpawnTimerMs = this.rollRange(SWARM_TUNING.spawnIntervalMs);

    const count = Phaser.Math.Between(SWARM_TUNING.countRange[0], SWARM_TUNING.countRange[1]);
    const swarmId = this.enemyManager.spawnSwarm(
      count,
      SWARM_TUNING.scale,
      SWARM_TUNING.speed,
      SWARM_TUNING.spacingX,
      SWARM_TUNING.spacingY,
    );
    if (swarmId > 0) {
      this.swarmKills.set(swarmId, 0);
    }
  }

  private spawnWormhole(): void {
    if (this.wormhole?.active || this.isGameOver()) return;
    const width = this.scene.scale.width;
    const height = this.scene.scale.height;
    const vx = this.rollRange(WORMHOLE_TUNING.velocityX) || 35;
    const vy = this.rollRange(WORMHOLE_TUNING.velocityY);
    this.wormhole = {
      active: true,
      x: Phaser.Math.Between(130, width - 130),
      y: Phaser.Math.Between(110, Math.round(height * 0.58)),
      vx,
      vy,
      ttlMs: this.rollRange(WORMHOLE_TUNING.ttlMs),
    };
    this.wormholeGraphics.setVisible(true);
    this.wormholeVisualAccumulatorMs = performanceMonitor.reducedParticles ? 48 : 28;
    this.wormholeForceAccumulatorMs = 0;
    this.setWormholeSpawnTimer('respawn');
  }

  private deactivateWormhole(): void {
    if (!this.wormhole) return;
    this.wormhole.active = false;
    this.wormholeGraphics.clear();
    this.wormholeGraphics.setVisible(false);
    this.wormholeVisualAccumulatorMs = 0;
    this.wormholeForceAccumulatorMs = 0;
  }

  private updateWormhole(delta: number): void {
    if (!this.wormhole?.active) {
      this.wormholeSpawnTimer -= delta;
      if (this.wormholeSpawnTimer <= 0) {
        this.spawnWormhole();
      }
      return;
    }

    this.wormhole.ttlMs -= delta;
    if (this.wormhole.ttlMs <= 0) {
      this.deactivateWormhole();
      return;
    }

    const width = this.scene.scale.width;
    const height = this.scene.scale.height;
    const pad = WORMHOLE_TUNING.motionPadding;
    this.wormhole.x += (this.wormhole.vx * delta) / 1000;
    this.wormhole.y += (this.wormhole.vy * delta) / 1000;

    if (this.wormhole.x < pad || this.wormhole.x > width - pad) {
      this.wormhole.vx *= -1;
      this.wormhole.x = Phaser.Math.Clamp(this.wormhole.x, pad, width - pad);
    }
    if (this.wormhole.y < pad || this.wormhole.y > height * WORMHOLE_TUNING.maxYRatio) {
      this.wormhole.vy *= -1;
      this.wormhole.y = Phaser.Math.Clamp(this.wormhole.y, pad, height * WORMHOLE_TUNING.maxYRatio);
    }

    this.wormholeVisualAccumulatorMs += delta;
    const wormholeVisualInterval = performanceMonitor.reducedParticles ? 48 : 28;
    if (this.wormholeVisualAccumulatorMs >= wormholeVisualInterval) {
      this.wormholeVisualAccumulatorMs = 0;
      const t = this.scene.time.now * 0.004;
      const radiusOuter =
        WORMHOLE_TUNING.outerRadiusBase + Math.sin(t * 1.8) * WORMHOLE_TUNING.outerRadiusWave;
      const radiusInner =
        WORMHOLE_TUNING.innerRadiusBase + Math.cos(t * 2.6) * WORMHOLE_TUNING.innerRadiusWave;
      this.wormholeGraphics
        .clear()
        .lineStyle(3, 0x9f52ff, 0.85)
        .strokeCircle(this.wormhole.x, this.wormhole.y, radiusOuter)
        .lineStyle(2, 0x57f6ff, 0.88)
        .strokeCircle(this.wormhole.x, this.wormhole.y, radiusInner);
      for (let i = 0; i < 3; i++) {
        const angle = t + i * ((Math.PI * 2) / 3);
        const orbitRadius = 26 + i * 6;
        const ox = Math.cos(angle) * orbitRadius;
        const oy = Math.sin(angle) * orbitRadius;
        this.wormholeGraphics.fillStyle(0xc8f2ff, 0.7);
        this.wormholeGraphics.fillCircle(this.wormhole.x + ox, this.wormhole.y + oy, 2);
      }
    }

    this.wormholeForceAccumulatorMs += delta;
    if (this.wormholeForceAccumulatorMs < WORMHOLE_TUNING.forceIntervalMs) return;

    const forceScale = this.wormholeForceAccumulatorMs / (1000 / 60);
    this.wormholeForceAccumulatorMs = 0;
    const wx = this.wormhole.x;
    const wy = this.wormhole.y;
    const radius = WORMHOLE_TUNING.pullRadius;
    const radiusSq = radius * radius;

    const enemies = this.enemyManager.enemies.getChildren() as Enemy[];
    for (const enemy of enemies) {
      if (!enemy.active || !enemy.body) continue;
      const dx = wx - enemy.x;
      const dy = wy - enemy.y;
      const distSq = dx * dx + dy * dy;
      if (distSq <= 36 || distSq > radiusSq) continue;
      const invDist = 1 / Math.sqrt(distSq);
      const pull = (1 - distSq / radiusSq) * WORMHOLE_TUNING.enemyPullStrength * forceScale;
      enemy.body.velocity.x += dx * invDist * pull;
      enemy.body.velocity.y += dy * invDist * pull;
    }

    const bullets = this.bullets.getChildren() as Bullet[];
    for (const bullet of bullets) {
      if (!bullet.active || !bullet.body) continue;
      const dx = wx - bullet.x;
      const dy = wy - bullet.y;
      const distSq = dx * dx + dy * dy;
      if (distSq <= 16 || distSq > radiusSq) continue;
      const invDist = 1 / Math.sqrt(distSq);
      const bend = (1 - distSq / radiusSq) * WORMHOLE_TUNING.bulletBendStrength * forceScale;
      bullet.body.velocity.x += dx * invDist * bend;
      bullet.body.velocity.y += dy * invDist * bend;
      const speed = bullet.body.velocity.length();
      if (speed > WORMHOLE_TUNING.bulletMaxSpeed) {
        const scale = WORMHOLE_TUNING.bulletMaxSpeed / speed;
        bullet.body.velocity.x *= scale;
        bullet.body.velocity.y *= scale;
      }
    }
  }

  private spawnEliteDrone(): void {
    if (this.eliteDrone.active || this.isGameOver()) return;
    const spawnLeft = Phaser.Math.Between(0, 1) === 0;
    const x = spawnLeft
      ? Phaser.Math.Between(86, 180)
      : Phaser.Math.Between(this.scene.scale.width - 180, this.scene.scale.width - 86);
    const y = Phaser.Math.Between(92, Math.round(this.scene.scale.height * 0.46));
    this.eliteDrone.enableBody(true, x, y, true, true);
    this.eliteDrone.setActive(true);
    this.eliteDrone.setVisible(true);
    this.eliteDrone.setAlpha(1);
    this.eliteDrone.setTint(0xa7ffd8);
    this.eliteDroneLifetimeMs = this.rollRange(ELITE_DRONE_TUNING.lifetimeMs);
    this.eliteDroneLabel.setVisible(true);
    this.eliteDroneSpawnTimer = this.rollRange(ELITE_DRONE_TUNING.postSpawnDelayMs);
    this.scene.cameras.main.flash(70, 120, 255, 120, false);
  }

  private spawnAstronautFromScout(
    sourceX: number,
    sourceY: number,
    index: number,
    total: number,
  ): void {
    const astronaut = this.astronautGroup.get(
      sourceX,
      sourceY,
      'rescue_astronaut',
    ) as Phaser.Physics.Arcade.Sprite | null;
    if (!astronaut) return;

    const spreadOffset = total > 1 ? index / (total - 1) - 0.5 : 0;
    const spawnX = sourceX + spreadOffset * ASTRONAUT_TUNING.scoutSpawnSpreadX;
    const spawnY =
      sourceY +
      Phaser.Math.FloatBetween(
        -ASTRONAUT_TUNING.scoutSpawnSpreadY,
        ASTRONAUT_TUNING.scoutSpawnSpreadY,
      );

    astronaut.enableBody(true, spawnX, spawnY, true, true);
    astronaut.setActive(true);
    astronaut.setVisible(true);
    astronaut.setDepth(111);
    astronaut.setScale(1);
    astronaut.setCollideWorldBounds(false);
    astronaut.setAlpha(1);
    astronaut.setTint(0xffffff);
    const initialWaveFrame = Phaser.Math.Between(0, ASTRONAUT_WAVE_TEXTURE_KEYS.length - 1);
    astronaut.setTexture(ASTRONAUT_WAVE_TEXTURE_KEYS[initialWaveFrame]);
    astronaut.setCircle(10, 12, 8);
    const astronautBody = astronaut.body as Phaser.Physics.Arcade.Body | null;
    if (astronautBody) {
      astronautBody.allowGravity = false;
      astronautBody.moves = true;
      astronautBody.setMaxVelocity(220, 220);
    }

    const label = this.scene.add
      .text(spawnX, spawnY - 34, 'Rescue Me!', {
        fontFamily: '"Press Start 2P"',
        fontSize: '12px',
        color: '#e4f6ff',
        stroke: '#001421',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(113)
      .setVisible(true);

    const state: AstronautState = {
      label,
      phase: Phaser.Math.FloatBetween(0, Math.PI * 2),
      baseVx:
        spreadOffset * ASTRONAUT_TUNING.scoutEjectSpeedX +
        Phaser.Math.FloatBetween(
          ASTRONAUT_TUNING.horizontalDriftRange[0],
          ASTRONAUT_TUNING.horizontalDriftRange[1],
        ),
      baseVy: this.rollRange(ASTRONAUT_TUNING.glideDownSpeedRange),
      waveFrameTimer: this.rollRange(ASTRONAUT_TUNING.waveFrameIntervalMs),
      waveFrameIndex: initialWaveFrame,
      waveDirection: Phaser.Math.Between(0, 1) === 0 ? 1 : -1,
      bubbleTimer: this.rollRange(ASTRONAUT_TUNING.bubbleEmitIntervalMs),
    };

    this.astronautStates.set(astronaut, state);
  }

  private advanceAstronautWaveFrame(state: AstronautState): void {
    state.waveFrameIndex += state.waveDirection;
    if (state.waveFrameIndex >= ASTRONAUT_WAVE_TEXTURE_KEYS.length - 1) {
      state.waveFrameIndex = ASTRONAUT_WAVE_TEXTURE_KEYS.length - 1;
      state.waveDirection = -1;
      return;
    }
    if (state.waveFrameIndex <= 0) {
      state.waveFrameIndex = 0;
      state.waveDirection = 1;
    }
  }

  private applyAstronautWaveTexture(
    astronaut: Phaser.Physics.Arcade.Sprite,
    waveFrameIndex: number,
  ): void {
    const textureKey =
      ASTRONAUT_WAVE_TEXTURE_KEYS[waveFrameIndex] ?? ASTRONAUT_WAVE_TEXTURE_KEYS[0];
    astronaut.setTexture(textureKey);
  }

  private getAstronautWorldOffset(
    astronaut: Phaser.Physics.Arcade.Sprite,
    localX: number,
    localY: number,
  ): { x: number; y: number } {
    const offsetX = (localX - astronaut.width * astronaut.originX) * astronaut.scaleX;
    const offsetY = (localY - astronaut.height * astronaut.originY) * astronaut.scaleY;
    const cos = Math.cos(astronaut.rotation);
    const sin = Math.sin(astronaut.rotation);
    return {
      x: astronaut.x + offsetX * cos - offsetY * sin,
      y: astronaut.y + offsetX * sin + offsetY * cos,
    };
  }

  private emitAstronautBubbles(
    astronaut: Phaser.Physics.Arcade.Sprite,
    state: AstronautState,
  ): void {
    if (!this.astronautBubbleEmitter) return;
    const nozzles = ASTRONAUT_HOSE_NOZZLES[state.waveFrameIndex] ?? ASTRONAUT_HOSE_NOZZLES[0];

    const primary = this.getAstronautWorldOffset(astronaut, nozzles[0].x, nozzles[0].y);
    this.astronautBubbleEmitter.emitParticleAt(primary.x, primary.y, Phaser.Math.Between(1, 2));

    if (Phaser.Math.Between(0, 100) <= 78) {
      const secondary = this.getAstronautWorldOffset(astronaut, nozzles[1].x, nozzles[1].y);
      this.astronautBubbleEmitter.emitParticleAt(secondary.x, secondary.y, 1);
    }
  }

  private updateEliteDrone(delta: number): void {
    if (!this.eliteDrone?.active) {
      this.eliteDroneSpawnTimer -= delta;
      if (this.eliteDroneSpawnTimer <= 0) {
        this.spawnEliteDrone();
      }
      return;
    }

    this.eliteDroneLifetimeMs -= delta;
    if (this.eliteDroneLifetimeMs <= 0) {
      this.deactivateEliteDrone('expired');
      return;
    }

    const body = this.eliteDrone.body as Phaser.Physics.Arcade.Body | null;
    if (!body) return;
    const dx = this.eliteDrone.x - this.player.x;
    const dy = this.eliteDrone.y - this.player.y;
    const dist = Math.max(20, Math.hypot(dx, dy));
    const awayX = dx / dist;
    const awayY = dy / dist;
    const baseSpeed =
      ELITE_DRONE_TUNING.speedBase +
      Math.min(
        ELITE_DRONE_TUNING.speedBonusCap,
        this.getLevel() * ELITE_DRONE_TUNING.speedPerLevel,
      );
    const wave = this.scene.time.now * 0.0036;
    let vx = awayX * baseSpeed + Math.cos(wave) * 62;
    let vy = awayY * baseSpeed + Math.sin(wave * 1.15) * 52 - 36;

    if (this.eliteDrone.x < 76) vx += 85;
    if (this.eliteDrone.x > this.scene.scale.width - 76) vx -= 85;
    if (this.eliteDrone.y < 72) vy += 72;
    if (this.eliteDrone.y > this.scene.scale.height * 0.82) vy -= 96;

    body.setVelocity(vx, vy);
    this.eliteDrone.rotation += (delta / 1000) * 3.2;
    this.eliteDroneLabel.setPosition(this.eliteDrone.x, this.eliteDrone.y - 24);
    this.eliteDroneLabel.setAlpha(0.55 + Math.sin(this.scene.time.now * 0.01) * 0.3);

    const outBounds = ELITE_DRONE_TUNING.outOfBoundsPadding;
    if (
      this.eliteDrone.x < -outBounds ||
      this.eliteDrone.x > this.scene.scale.width + outBounds ||
      this.eliteDrone.y < -outBounds ||
      this.eliteDrone.y > this.scene.scale.height + outBounds
    ) {
      this.deactivateEliteDrone('expired');
    }
  }

  private updateAstronaut(delta: number): void {
    if (this.astronautStates.size === 0) return;

    const width = this.scene.scale.width;
    const height = this.scene.scale.height;
    const bottomRetireY = height - ASTRONAUT_TUNING.despawnNearBottomPadding;
    const sidePad = 72;
    const outBounds = ASTRONAUT_TUNING.outOfBoundsPadding;
    const now = this.scene.time.now;

    for (const [astronaut, state] of this.astronautStates) {
      if (!astronaut.active) {
        this.deactivateAstronaut(astronaut, 'expired');
        continue;
      }

      const body = astronaut.body as Phaser.Physics.Arcade.Body | null;
      if (!body) {
        this.deactivateAstronaut(astronaut, 'expired');
        continue;
      }

      state.waveFrameTimer -= delta;
      if (state.waveFrameTimer <= 0) {
        this.advanceAstronautWaveFrame(state);
        this.applyAstronautWaveTexture(astronaut, state.waveFrameIndex);
        state.waveFrameTimer = this.rollRange(ASTRONAUT_TUNING.waveFrameIntervalMs);
      }
      state.bubbleTimer -= delta;
      if (state.bubbleTimer <= 0) {
        this.emitAstronautBubbles(astronaut, state);
        state.bubbleTimer = this.rollRange(ASTRONAUT_TUNING.bubbleEmitIntervalMs);
      }

      if (astronaut.x < sidePad) state.baseVx = Math.abs(state.baseVx) + 4;
      if (astronaut.x > width - sidePad) state.baseVx = -Math.abs(state.baseVx) - 4;

      const bob = Math.sin(now * ASTRONAUT_TUNING.bobSpeed + state.phase);
      const wobble = Math.cos(now * (ASTRONAUT_TUNING.bobSpeed * 0.82) + state.phase * 1.4);
      const dx = astronaut.x - this.player.x;
      const dy = astronaut.y - this.player.y;
      const dist = Math.max(30, Math.hypot(dx, dy));
      const avoidX = (dx / dist) * ASTRONAUT_TUNING.avoidPlayerStrength;
      const vx = state.baseVx + wobble * ASTRONAUT_TUNING.driftSpeedX + avoidX;
      const vy = Math.max(
        ASTRONAUT_TUNING.minDownwardSpeed,
        state.baseVy + bob * ASTRONAUT_TUNING.bobAmplitude * 0.28,
      );
      body.setVelocity(vx, vy);

      const waveLean =
        Math.sin(now * ASTRONAUT_TUNING.waveLeanSpeed + state.phase * 1.16) *
        ASTRONAUT_TUNING.waveLeanAmplitude;
      astronaut.rotation = wobble * 0.08 + waveLean;
      state.label.setPosition(astronaut.x, astronaut.y - 34);
      state.label.setAlpha(0.64 + (Math.sin(now * 0.012 + state.phase) * 0.5 + 0.5) * 0.32);

      if (astronaut.y >= bottomRetireY) {
        this.deactivateAstronaut(astronaut, 'expired');
        continue;
      }

      if (astronaut.x < -outBounds || astronaut.x > width + outBounds || astronaut.y < -outBounds) {
        this.deactivateAstronaut(astronaut, 'expired');
      }
    }
  }
}
