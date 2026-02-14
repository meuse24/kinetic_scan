import Phaser from 'phaser';
import { ADRENALINE_TUNING } from '../MainSceneTuning';

export interface AdrenalineConfig {
  scene: Phaser.Scene;
  getPlayer: () => Phaser.Physics.Arcade.Sprite | null;
  getEnemies: () => Phaser.Physics.Arcade.Group;
  getUFO: () => Phaser.Physics.Arcade.Sprite | null;
  getUFOProjectiles: () => Phaser.Physics.Arcade.Group | null;
  getSkyRaiders: () => Phaser.Physics.Arcade.Group;
  getSkyRaiderProjectiles: () => Phaser.Physics.Arcade.Group;
  isGhostActive: () => boolean;
  isShieldActive: () => boolean;
  isPlayerDead: () => boolean;
  isFlowBlocked: () => boolean;
  getPlayerBodyRadius: () => number;
}

export interface AdrenalineCallbacks {
  onGrazeTick: (grazeX: number, grazeY: number) => void;
  onMeterReady: () => void;
  onMatrixActivated: () => void;
  onMatrixDeactivated: () => void;
}

const T = ADRENALINE_TUNING;

export class AdrenalineSystem {
  private config: AdrenalineConfig;
  private callbacks: AdrenalineCallbacks;

  private meter: number = 0;
  private matrixActive: boolean = false;
  private matrixTimeLeftMs: number = 0;
  private lastGrazeAtMs: number = -99999;
  private lastGrazeTickSoundAtMs: number = -99999;
  private wasReady: boolean = false;

  private grazeCooldowns: Map<any, number> = new Map();
  private cooldownPruneAccMs: number = 0;

  private hudGraphics: Phaser.GameObjects.Graphics;

  constructor(config: AdrenalineConfig, callbacks: AdrenalineCallbacks) {
    this.config = config;
    this.callbacks = callbacks;
    this.hudGraphics = config.scene.add.graphics().setDepth(121);
  }

  update(delta: number, time: number): void {
    if (this.matrixActive) {
      this.updateMatrix(delta);
    } else {
      this.detectGrazes(time);
      this.decayMeter(delta, time);
    }

    this.pruneGrazeCooldowns(delta, time);
    this.drawHUD(time);
  }

  tryActivate(): boolean {
    if (this.matrixActive) return false;
    if (this.meter < T.activationThreshold) return false;
    if (this.config.isGhostActive() || this.config.isShieldActive()) return false;
    if (this.config.isPlayerDead() || this.config.isFlowBlocked()) return false;

    this.matrixActive = true;
    this.matrixTimeLeftMs = T.matrixDurationMs;
    this.callbacks.onMatrixActivated();
    return true;
  }

  isPierceActive(): boolean {
    return this.matrixActive && T.pierceEnabled;
  }

  getScoreMultiplier(): number {
    return this.matrixActive ? T.matrixScoreMultiplier : 1;
  }

  getPlayerSpeedMultiplier(): number {
    return this.matrixActive ? T.matrixPlayerSpeedMultiplier : 1;
  }

  isMatrixActive(): boolean {
    return this.matrixActive;
  }

  getMeterNormalized(): number {
    return Phaser.Math.Clamp(this.meter / T.meterMax, 0, 1);
  }

  getMatrixPhysicsTimeScale(): number {
    return T.matrixPhysicsTimeScale;
  }

  reset(): void {
    const wasActive = this.matrixActive;
    this.meter = 0;
    this.matrixActive = false;
    this.matrixTimeLeftMs = 0;
    this.wasReady = false;
    this.grazeCooldowns.clear();
    if (wasActive) {
      this.callbacks.onMatrixDeactivated();
    }
  }

  saveMeter(): number {
    return this.meter;
  }

  loadMeter(value: number): void {
    this.meter = Phaser.Math.Clamp(value, 0, T.meterMax);
    this.wasReady = this.meter >= T.activationThreshold;
  }

  destroy(): void {
    this.hudGraphics.destroy();
    this.grazeCooldowns.clear();
  }

  // ── Matrix update ──

  private updateMatrix(delta: number): void {
    this.matrixTimeLeftMs -= delta;
    const progress = 1 - Phaser.Math.Clamp(this.matrixTimeLeftMs / T.matrixDurationMs, 0, 1);
    this.meter = T.meterMax * (1 - progress);

    if (this.matrixTimeLeftMs <= 0) {
      this.matrixActive = false;
      this.matrixTimeLeftMs = 0;
      this.meter = 0;
      this.wasReady = false;
      this.callbacks.onMatrixDeactivated();
    }
  }

  // ── Graze detection ──

  private detectGrazes(time: number): void {
    if (this.config.isGhostActive()) return;
    if (this.config.isShieldActive()) return;
    if (this.config.isPlayerDead()) return;
    if (this.config.isFlowBlocked()) return;

    const player = this.config.getPlayer();
    if (!player || !player.active) return;

    const px = player.x;
    const py = player.y;
    const bodyRadius = this.config.getPlayerBodyRadius();
    const innerR = bodyRadius + T.grazeInnerRadius;
    const outerR = bodyRadius + T.grazeOuterRadius;
    const innerSq = innerR * innerR;
    const outerSq = outerR * outerR;
    const closeBonusR = bodyRadius + T.meterCloseBonusRadius;
    const closeBonusSq = closeBonusR * closeBonusR;

    let checksRemaining = T.maxEntityChecksPerFrame;
    let anyGraze = false;
    let grazeX = px;
    let grazeY = py;

    const checkEntity = (entity: any) => {
      if (checksRemaining <= 0) return;
      if (!entity || !entity.active) return;
      checksRemaining--;

      if (this.grazeCooldowns.has(entity) && time < this.grazeCooldowns.get(entity)!) return;

      const dx = entity.x - px;
      const dy = entity.y - py;
      const distSq = dx * dx + dy * dy;

      if (distSq >= innerSq && distSq <= outerSq) {
        let fill = T.meterPerGraze;
        if (distSq <= closeBonusSq) {
          fill += T.meterCloseBonus;
        }
        this.meter = Math.min(T.meterMax, this.meter + fill);
        this.lastGrazeAtMs = time;
        this.grazeCooldowns.set(entity, time + T.grazeCooldownMs);
        anyGraze = true;
        grazeX = entity.x;
        grazeY = entity.y;
      }
    };

    // Check enemies (asteroids)
    const enemies = this.config.getEnemies();
    const enemyChildren = enemies.getChildren();
    for (let i = 0; i < enemyChildren.length && checksRemaining > 0; i++) {
      checkEntity(enemyChildren[i]);
    }

    // Check UFO body
    const ufo = this.config.getUFO();
    if (ufo && checksRemaining > 0) {
      checkEntity(ufo);
    }

    // Check UFO projectiles
    const ufoProj = this.config.getUFOProjectiles();
    if (ufoProj) {
      const ufoProjectileChildren = ufoProj.getChildren();
      for (let i = 0; i < ufoProjectileChildren.length && checksRemaining > 0; i++) {
        checkEntity(ufoProjectileChildren[i]);
      }
    }

    // Check SkyRaiders
    const raiders = this.config.getSkyRaiders();
    const raiderChildren = raiders.getChildren();
    for (let i = 0; i < raiderChildren.length && checksRemaining > 0; i++) {
      checkEntity(raiderChildren[i]);
    }

    // Check SkyRaider projectiles
    const raiderProj = this.config.getSkyRaiderProjectiles();
    const raiderProjChildren = raiderProj.getChildren();
    for (let i = 0; i < raiderProjChildren.length && checksRemaining > 0; i++) {
      checkEntity(raiderProjChildren[i]);
    }

    if (anyGraze) {
      if (time - this.lastGrazeTickSoundAtMs >= T.grazeTickRateLimitMs) {
        this.lastGrazeTickSoundAtMs = time;
        this.callbacks.onGrazeTick(grazeX, grazeY);
      }

      const isReady = this.meter >= T.activationThreshold;
      if (isReady && !this.wasReady) {
        this.callbacks.onMeterReady();
      }
      this.wasReady = isReady;
    }
  }

  // ── Meter decay ──

  private decayMeter(delta: number, time: number): void {
    if (this.meter <= 0) return;
    if (time - this.lastGrazeAtMs < T.meterDecayGraceMs) return;

    this.meter = Math.max(0, this.meter - T.meterDecayPerSec * (delta / 1000));
    if (this.meter < T.activationThreshold) {
      this.wasReady = false;
    }
  }

  // ── Cooldown pruning ──

  private pruneGrazeCooldowns(delta: number, time: number): void {
    this.cooldownPruneAccMs += delta;
    if (this.cooldownPruneAccMs < T.grazeCooldownPruneMs) return;
    this.cooldownPruneAccMs = 0;

    for (const [entity, expiry] of this.grazeCooldowns) {
      if (time >= expiry || !entity?.active) {
        this.grazeCooldowns.delete(entity);
      }
    }
  }

  // ── HUD bar ──

  private drawHUD(time: number): void {
    this.hudGraphics.clear();

    const player = this.config.getPlayer();
    if (!player || !player.active) return;
    if (this.config.isPlayerDead()) return;

    const fill = this.getMeterNormalized();
    if (fill <= 0 && !this.matrixActive) return;

    const barX = player.x - T.hudBarWidth / 2;
    const barY = player.y + 40 + T.hudBarYOffset;

    // Background
    this.hudGraphics.fillStyle(0x1a0a2e, 0.6);
    this.hudGraphics.fillRect(barX, barY, T.hudBarWidth, T.hudBarHeight);

    // Fill bar
    const fillWidth = T.hudBarWidth * fill;
    const isReady = fill >= T.hudGlowPulseThreshold;
    const baseColor = this.matrixActive ? 0xcc66ff : 0x9933cc;
    this.hudGraphics.fillStyle(baseColor, 0.9);
    this.hudGraphics.fillRect(barX, barY, fillWidth, T.hudBarHeight);

    // Glow pulse when ready or active
    if (isReady || this.matrixActive) {
      const pulse = 0.3 + Math.sin(time * 0.012) * 0.3;
      this.hudGraphics.lineStyle(2, 0xcc66ff, pulse);
      this.hudGraphics.strokeRect(barX - 1, barY - 1, T.hudBarWidth + 2, T.hudBarHeight + 2);
    }

    // Border
    this.hudGraphics.lineStyle(1, 0x6622aa, 0.7);
    this.hudGraphics.strokeRect(barX, barY, T.hudBarWidth, T.hudBarHeight);
  }
}
