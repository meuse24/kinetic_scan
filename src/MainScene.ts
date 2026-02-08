import Phaser from 'phaser';
import { Player, Bullet } from './Player';
import { EnemyManager, Enemy } from './EnemyManager';
import { ExplosionManager } from './ExplosionManager';
import { AudioManager } from './AudioManager';
import { UFO, UFOProjectile } from './UFO';
import type { UFOVariant } from './UFO';
import { PowerUpDirector } from './PowerUpDirector';
import { PowerUp, PowerUpType } from './PowerUp';
import {
  getCurrentDifficultyKey,
  getDifficultyPreset,
  resolveDifficultyKey,
  setCurrentDifficultyKey,
} from './Difficulty';
import type { DifficultyPreset, DifficultyPresetKey } from './Difficulty';
import { GAME_WIDTH, GAME_HEIGHT, applyPendingResize } from './gameConfig';
import { performanceMonitor } from './PerformanceMonitor';
import { musicManager } from './MusicManager';
import {
  ELITE_DRONE_TUNING,
  LEVEL_TRANSITION_TUNING,
  WORMHOLE_TUNING,
  pickEliteDroneSpawnDelayRange,
  type EliteDroneDeactivateReason,
  type IntRange,
} from './MainSceneTuning';

interface PlayerState {
  score: number;
  lives: number;
  activePowerUps: Map<PowerUpType, number>;
  powerUpTimer: number;
  eliteLifePerkCount: number;
  eliteCoolingPerkLevel: number;
  eliteMagnetPerkLevel: number;
}

type ElitePerkType = 'bonus_life' | 'cooling' | 'magnet';

interface WormholeState {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  ttlMs: number;
}

type MainSceneData = {
  players?: number;
  difficulty?: DifficultyPresetKey;
};

interface PendingEnemyHit {
  x: number;
  y: number;
  points: number;
  source: 'bullet' | 'emp';
}

type CollisionSourceMix = 'none' | 'bullet' | 'emp' | 'mixed';

interface CollisionPressureMetrics {
  queuedTotal: number;
  queuedBulletTotal: number;
  queuedEmpTotal: number;
  flushedTotal: number;
  coalescedFlushes: number;
  directFlushes: number;
  explosionEmitsTotal: number;
  sfxBurstsTotal: number;
  clusterDropsTotal: number;
  pendingQueuePeak: number;
  lastFlushHits: number;
  lastFlushClusters: number;
  lastFlushExplosionEmits: number;
  lastFlushSfxBursts: number;
  lastFlushClusterDrops: number;
  lastFlushCoalesced: boolean;
  lastFlushSourceMix: CollisionSourceMix;
}

export default class MainScene extends Phaser.Scene {
  private player!: Player;
  private bullets!: Phaser.Physics.Arcade.Group;
  public enemyManager!: EnemyManager;
  private explosionManager!: ExplosionManager;
  public audio!: AudioManager;
  private ufo!: UFO;
  private powerUpDirector!: PowerUpDirector;

  private score: number = 0;
  private lives: number = 3;
  private difficultyKey: DifficultyPresetKey = getCurrentDifficultyKey();
  private difficultyPreset: DifficultyPreset = getDifficultyPreset();
  private level: number = 1;
  private progressionScore: number = 0;
  private nextLevelScore: number = 2500;
  private levelBossPendingDefeat: boolean = false;
  private playerStates: PlayerState[] = [];
  private activePlayerIndex: number = 0;
  private playerCount: number = 1;
  private isSwitching: boolean = false;
  private isLevelTransition: boolean = false;
  private switchOverlay!: Phaser.GameObjects.Container;
  private switchText!: Phaser.GameObjects.Text;
  private switchPrompt!: Phaser.GameObjects.Text;
  private switchTimer?: Phaser.Time.TimerEvent;
  private levelTransitionOverlay!: Phaser.GameObjects.Container;
  private levelTransitionTitle!: Phaser.GameObjects.Text;
  private levelTransitionCountdown!: Phaser.GameObjects.Text;
  private levelTransitionPrompt!: Phaser.GameObjects.Text;
  private levelTransitionEvents: Phaser.Time.TimerEvent[] = [];
  private levelTransitionCountdownLabel: string = '';
  private awaitingTurnInput: boolean = false;
  private turnKeyHandler?: (event: KeyboardEvent) => void;
  private turnPointerHandler?: () => void;
  private onBlur?: () => void;
  private onVisibilityChange?: () => void;

  private useHighEndVFX: boolean = false;
  private slowMoOverlay!: Phaser.GameObjects.Rectangle;
  private slowMoActive: boolean = false;
  private gpuName: string = '';

  private powerUpTimer: number = 0; // UFO Magnetic
  private ufoSpawnTimer: number = 0;
  private activePowerUps: Map<PowerUpType, number> = new Map();
  private isGameOver: boolean = false;

  private drones: Phaser.GameObjects.Group | null = null;
  private blackHole: {
    x: number;
    y: number;
    active: boolean;
    graphics: Phaser.GameObjects.Graphics;
  } | null = null;
  private wormhole: WormholeState | null = null;
  private wormholeGraphics!: Phaser.GameObjects.Graphics;
  private wormholeSpawnTimer: number = 0;
  private wormholeForceAccumulatorMs: number = 0;
  private eliteDrone!: Phaser.Physics.Arcade.Sprite;
  private eliteDroneLabel!: Phaser.GameObjects.Text;
  private eliteDroneSpawnTimer: number = 0;
  private eliteDroneLifetimeMs: number = 0;
  private empGraphics!: Phaser.GameObjects.Graphics;

  private p1ScoreText!: Phaser.GameObjects.Text;
  private p2ScoreText?: Phaser.GameObjects.Text;
  private p1LivesText!: Phaser.GameObjects.Text;
  private p2LivesText?: Phaser.GameObjects.Text;
  private activeMarkerLeft?: Phaser.GameObjects.Text;
  private activeMarkerRight?: Phaser.GameObjects.Text;
  private activeMarkerTween?: Phaser.Tweens.Tween;
  private lastActiveMarkerIndex: number = -1;
  private debugRefreshMs: number = 0;
  private lastDebugLine: string = '';
  private powerUpTextRefreshMs: number = 0;
  private lastPowerUpList: string = '';
  private powerUpBarRefreshMs: number = 0;
  private heatBarRefreshMs: number = 0;
  private lastP1ScoreLabel: string = '';
  private lastP2ScoreLabel: string = '';
  private lastP1LivesLabel: string = '';
  private lastP2LivesLabel: string = '';
  private lastLevelLabel: string = '';
  private blackHoleForceAccumulatorMs: number = 0;
  private pendingEnemyHits: PendingEnemyHit[] = [];
  private hitClusterScratch: Map<number, { sumX: number; sumY: number; count: number }> = new Map();
  private collisionPressureMetrics: CollisionPressureMetrics = {
    queuedTotal: 0,
    queuedBulletTotal: 0,
    queuedEmpTotal: 0,
    flushedTotal: 0,
    coalescedFlushes: 0,
    directFlushes: 0,
    explosionEmitsTotal: 0,
    sfxBurstsTotal: 0,
    clusterDropsTotal: 0,
    pendingQueuePeak: 0,
    lastFlushHits: 0,
    lastFlushClusters: 0,
    lastFlushExplosionEmits: 0,
    lastFlushSfxBursts: 0,
    lastFlushClusterDrops: 0,
    lastFlushCoalesced: false,
    lastFlushSourceMix: 'none',
  };
  private dynamicBulletCap: number = 100;
  private bulletCapRefreshMs: number = 0;
  private debugText!: Phaser.GameObjects.Text;
  private powerUpBar!: Phaser.GameObjects.Graphics;
  private powerUpListText!: Phaser.GameObjects.Text;
  private perkText!: Phaser.GameObjects.Text;
  private heatBar!: Phaser.GameObjects.Graphics;
  private levelText!: Phaser.GameObjects.Text;
  private lastPerkLabel: string = '';
  private passiveCoolingMultiplier: number = 1;
  private magneticDurationMultiplier: number = 1;
  private smokeEmitter: Phaser.GameObjects.Particles.ParticleEmitter | null = null;

  constructor() {
    super('MainScene');
  }

  init(data: MainSceneData) {
    this.playerCount = data?.players === 2 ? 2 : 1;
    this.difficultyKey = resolveDifficultyKey(data?.difficulty ?? null);
    setCurrentDifficultyKey(this.difficultyKey);
    this.difficultyPreset = getDifficultyPreset(this.difficultyKey);
    this.activePlayerIndex = 0;
    this.level = 1;
    this.progressionScore = 0;
    this.nextLevelScore = this.getNextLevelScore(1);
    this.levelBossPendingDefeat = false;
    this.powerUpBarRefreshMs = 0;
    this.heatBarRefreshMs = 0;
    this.lastP1ScoreLabel = '';
    this.lastP2ScoreLabel = '';
    this.lastP1LivesLabel = '';
    this.lastP2LivesLabel = '';
    this.lastLevelLabel = '';
    this.lastPerkLabel = '';
    this.passiveCoolingMultiplier = 1;
    this.magneticDurationMultiplier = 1;
    this.playerStates = [];
    for (let i = 0; i < this.playerCount; i++) {
      this.playerStates.push({
        score: 0,
        lives: 3,
        activePowerUps: new Map(),
        powerUpTimer: 0,
        eliteLifePerkCount: 0,
        eliteCoolingPerkLevel: 0,
        eliteMagnetPerkLevel: 0,
      });
    }
  }

  preload() {
    const pGraphics = this.make.graphics({ x: 0, y: 0 });
    pGraphics.fillStyle(0xffffff, 1);
    pGraphics.fillCircle(4, 4, 4);
    pGraphics.generateTexture('particle_flare', 8, 8);
    pGraphics.destroy();
  }

  create() {
    if (applyPendingResize(this.game)) {
      if (this.scene.isActive('BezelScene')) {
        this.scene.stop('BezelScene');
      }
    }

    this.audio = new AudioManager(this);
    musicManager.stop();
    this.isGameOver = false;
    this.isSwitching = false;
    this.isLevelTransition = false;
    this.levelTransitionCountdownLabel = '';
    const startingState = this.playerStates[this.activePlayerIndex] ?? {
      score: 0,
      lives: 3,
      activePowerUps: new Map(),
      powerUpTimer: 0,
      eliteLifePerkCount: 0,
      eliteCoolingPerkLevel: 0,
      eliteMagnetPerkLevel: 0,
    };
    this.score = startingState.score;
    this.lives = startingState.lives;
    this.powerUpTimer = startingState.powerUpTimer;
    this.activePowerUps = new Map(startingState.activePowerUps);
    if (!this.scene.isActive('BezelScene')) {
      this.scene.launch('BezelScene');
    }
    this.scene.bringToTop('BezelScene');
    this.createGraphics();
    this.createStarfield();
    this.input.addPointer(2);
    this.bullets = this.physics.add.group({
      classType: Bullet,
      runChildUpdate: true,
      maxSize: 100,
    });
    this.player = new Player(this, GAME_WIDTH / 2, GAME_HEIGHT - 100, this.bullets);
    this.player.updateBounds(GAME_WIDTH, GAME_HEIGHT);
    this.enemyManager = new EnemyManager(this);
    this.explosionManager = new ExplosionManager(this);
    this.ufo = new UFO(this, this.audio, { combatEnabled: true });
    this.ufo.setCombatTarget(this.player);
    this.ufo.setEvasionThreatGroup(this.bullets);
    this.ufo.setReducedVisualDetail(performanceMonitor.reducedParticles);
    this.powerUpDirector = new PowerUpDirector(this);
    this.applyDifficultyProfile(true);

    this.useHighEndVFX =
      this.sys.game.device.os.desktop && this.game.renderer.type === Phaser.WEBGL;
    performanceMonitor.init(this.game);
    this.useHighEndVFX = this.useHighEndVFX && performanceMonitor.smokeEnabled;
    this.resetCollisionPressureMetrics();
    this.dynamicBulletCap = performanceMonitor.reducedParticles ? 56 : 96;
    this.bulletCapRefreshMs = 0;
    if (this.game.renderer.type === Phaser.WEBGL) {
      const gl = (this.game.renderer as Phaser.Renderer.WebGL.WebGLRenderer).gl;
      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
      if (debugInfo) {
        this.gpuName = gl
          .getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
          .replace(/Direct3D.*/, '')
          .replace(/vs_.*ps_.*/, '')
          .trim();
      }
    }

    this.slowMoOverlay = this.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x0000ff, 0)
      .setDepth(5);
    this.wormholeGraphics = this.add.graphics().setDepth(35);
    this.wormholeGraphics.setVisible(false);
    this.empGraphics = this.add.graphics().setDepth(10);
    this.createEliteDroneEntity();
    this.resetWorldEventTimers();
    this.createHUD();
    this.createTurnOverlay();
    this.createLevelTransitionOverlay();
    this.powerUpBar = this.add.graphics();
    this.heatBar = this.add.graphics().setDepth(120);
    this.createSmokeEmitter();
    this.applyPassivePerksFromActiveState();
    this.updateHUD();
    this.applyActivePowerUpEffects(true);
    this.ufoSpawnTimer = this.computeNextUFOSpawnDelay();

    this.physics.add.overlap(
      this.bullets,
      this.enemyManager.enemies,
      this.handleBulletHitEnemy,
      undefined,
      this,
    );
    this.physics.add.overlap(this.bullets, this.ufo, this.handleBulletHitUFO, undefined, this);
    this.physics.add.overlap(
      this.player,
      this.enemyManager.enemies,
      this.handlePlayerHitEnemy,
      undefined,
      this,
    );
    this.physics.add.overlap(
      this.player,
      this.powerUpDirector.getGroup(),
      this.handlePlayerHitPowerUp,
      undefined,
      this,
    );
    this.physics.add.overlap(
      this.player,
      this.eliteDrone,
      this.handlePlayerRescueEliteDrone,
      undefined,
      this,
    );
    this.physics.add.overlap(
      this.bullets,
      this.eliteDrone,
      this.handleBulletHitEliteDrone,
      undefined,
      this,
    );
    const ufoProjectiles = this.ufo.getProjectiles();
    if (ufoProjectiles) {
      this.physics.add.overlap(
        this.player,
        ufoProjectiles,
        this.handlePlayerHitUFOProjectile,
        undefined,
        this,
      );
    }

    // Apply CRT Shader Pipeline
    if (
      performanceMonitor.crtEnabled &&
      this.game.renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer
    ) {
      this.cameras.main.setPostPipeline('CRTPipeline');
    }

    // Cleanup on scene shutdown

    this.events.once('shutdown', () => {
      this.finishLevelTransitionCountdown(false);
      this.ufo.deactivate();
      this.removeDrones();
      this.removeBlackHole();
      this.clearWorldEvents('reset');
      this.pendingEnemyHits.length = 0;
      this.powerUpBar.destroy();
      this.heatBar.destroy();
      this.smokeEmitter?.destroy();
      this.wormholeGraphics.destroy();
      this.eliteDroneLabel.destroy();
      this.eliteDrone.destroy();
      this.perkText.destroy();
      this.empGraphics.destroy();
      this.slowMoOverlay.destroy();
      this.switchTimer?.remove(false);
      this.switchOverlay?.destroy();
      this.levelTransitionOverlay?.destroy();
      this.activeMarkerTween?.stop();
      if (this.turnKeyHandler) this.input.keyboard?.off('keydown', this.turnKeyHandler);
      if (this.turnPointerHandler) this.input.off('pointerdown', this.turnPointerHandler);
      if (this.onBlur) this.game.events.off('blur', this.onBlur);
      if (this.onVisibilityChange)
        document.removeEventListener('visibilitychange', this.onVisibilityChange);
    });
  }

  update(time: number, delta: number) {
    if (this.isSwitching || this.isLevelTransition) {
      this.ufo.setCombatTarget(null);
      return;
    }
    this.ufo.setCombatTarget(this.player.active ? this.player : null);
    this.updateDynamicBulletCap(delta);
    this.player.update(time, delta);
    this.enemyManager.update(time, delta);
    this.updateWormhole(delta);
    this.updateEliteDrone(delta);
    this.flushPendingEnemyHits();
    this.powerUpDirector.update(this.progressionScore, delta);

    const flagChanged = performanceMonitor.update(this.game);
    if (flagChanged) {
      if (!performanceMonitor.smokeEnabled && this.smokeEmitter) {
        this.smokeEmitter.destroy();
        this.smokeEmitter = null;
      }
      if (
        !performanceMonitor.crtEnabled &&
        this.game.renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer
      ) {
        this.cameras.main.removePostPipeline('CRTPipeline');
      }
      this.ufo.setReducedVisualDetail(performanceMonitor.reducedParticles);
      this.useHighEndVFX = performanceMonitor.smokeEnabled && this.useHighEndVFX;
    }

    this.debugRefreshMs -= delta;
    if (this.debugRefreshMs <= 0) {
      let renderer = 'UNKNOWN';
      if (this.game.renderer.type === Phaser.WEBGL) renderer = 'WEBGL';
      else if (this.game.renderer.type === Phaser.CANVAS) renderer = 'CANVAS';
      else if (this.game.renderer.type === (Phaser as any).WEBGPU) renderer = 'WEBGPU';
      const bulletActive = this.bullets.countActive(true);
      const nextDebugLine = `${renderer}${this.gpuName ? ` | ${this.gpuName}` : ''} | ${Math.round(this.game.loop.actualFps)} FPS | L ${this.level} ${this.difficultyPreset.label} | ${performanceMonitor.getQualityLabel()} | B ${bulletActive}/${this.dynamicBulletCap}`;
      if (nextDebugLine !== this.lastDebugLine) {
        this.debugText.setText(nextDebugLine);
        this.lastDebugLine = nextDebugLine;
      }
      this.debugRefreshMs = 200;
    }

    if (!this.ufo.active) {
      this.ufoSpawnTimer -= delta;
      if (this.ufoSpawnTimer <= 0) {
        if (this.levelBossPendingDefeat) {
          this.ufo.spawn({ variant: 'boss', level: this.level });
          this.ufoSpawnTimer = Phaser.Math.Between(1700, 2500);
        } else {
          const variant = this.pickUFOVariantForLevel();
          this.ufo.spawn({ variant, level: this.level });
          this.ufoSpawnTimer = this.computeNextUFOSpawnDelay(variant);
        }
      }
    }

    if (this.powerUpTimer > 0) {
      this.powerUpTimer -= delta;
      this.powerUpBarRefreshMs -= delta;
      if (this.powerUpBarRefreshMs <= 0 || this.powerUpTimer <= 0) {
        this.updatePowerUpUI();
        this.powerUpBarRefreshMs = 34;
      }
      if (this.powerUpTimer <= 0) {
        this.player.setMagnetic(false);
        this.powerUpBar.clear();
        this.powerUpBarRefreshMs = 0;
      }
      if (this.playerStates[this.activePlayerIndex]) {
        this.playerStates[this.activePlayerIndex].powerUpTimer = this.powerUpTimer;
      }
    }

    this.updateActivePowerUps(delta);
    this.updateDrones();
    this.updateBlackHole(delta);
    this.updateBossEnergyUI();
    this.heatBarRefreshMs -= delta;
    if (this.heatBarRefreshMs <= 0) {
      this.updateHeatBar();
      this.heatBarRefreshMs = 34;
    }
  }

  private updatePowerUpUI() {
    this.powerUpBar.clear();
    const width = 200;
    const barMaxDuration = this.getScaledMagneticDuration(7000);
    const progress = Phaser.Math.Clamp(this.powerUpTimer / Math.max(1, barMaxDuration), 0, 1);
    this.powerUpBar.fillStyle(0x00ffff, 0.8);
    this.powerUpBar.fillRect(GAME_WIDTH / 2 - width / 2, 80, width * progress, 10);
    if (Math.sin(this.time.now * 0.01) > 0) {
      this.powerUpBar.lineStyle(2, 0xffffff, 1);
      this.powerUpBar.strokeRect(GAME_WIDTH / 2 - width / 2, 80, width, 10);
    }
  }

  private updateHeatBar() {
    this.heatBar.clear();
    if (!this.player.active) return;
    const heat = this.player.getHeatNormalized();
    if (heat <= 0) return;
    const width = 50;
    const height = 4;
    const anchor = this.player.getHeatBarAnchor();
    const x = anchor.x - width / 2;
    const y = anchor.y;
    this.heatBar.fillStyle(0x000000, 0.6);
    this.heatBar.fillRect(x - 1, y - 1, width + 2, height + 2);
    if (this.player.isOverheated()) {
      const blinkOn = Math.floor(this.time.now / 150) % 2 === 0;
      if (!blinkOn) return;
      this.heatBar.fillStyle(0xff3333, 0.95);
    } else {
      const t = Phaser.Math.Clamp(heat, 0, 1);
      const r = Math.round(255 * t);
      const g = Math.round(255 - 204 * t);
      const b = Math.round(102 - 51 * t);
      this.heatBar.fillStyle((r << 16) | (g << 8) | b, 0.9);
    }
    this.heatBar.fillRect(x, y, width * heat, height);
  }

  private updateHUD() {
    if (this.playerCount === 2) {
      const p1ScoreLabel = `P1 SCORE: ${this.playerStates[0].score}`;
      if (p1ScoreLabel !== this.lastP1ScoreLabel) {
        this.p1ScoreText.setText(p1ScoreLabel);
        this.lastP1ScoreLabel = p1ScoreLabel;
      }
      const p2ScoreLabel = `P2 SCORE: ${this.playerStates[1].score}`;
      if (p2ScoreLabel !== this.lastP2ScoreLabel) {
        this.p2ScoreText?.setText(p2ScoreLabel);
        this.lastP2ScoreLabel = p2ScoreLabel;
      }
      const p1LivesLabel = `P1 LIVES: ${this.playerStates[0].lives}`;
      if (p1LivesLabel !== this.lastP1LivesLabel) {
        this.p1LivesText.setText(p1LivesLabel);
        this.lastP1LivesLabel = p1LivesLabel;
      }
      const p2LivesLabel = `P2 LIVES: ${this.playerStates[1].lives}`;
      if (p2LivesLabel !== this.lastP2LivesLabel) {
        this.p2LivesText?.setText(p2LivesLabel);
        this.lastP2LivesLabel = p2LivesLabel;
      }
      this.updateActiveMarker();
    } else {
      const p1ScoreLabel = `SCORE: ${this.score}`;
      if (p1ScoreLabel !== this.lastP1ScoreLabel) {
        this.p1ScoreText.setText(p1ScoreLabel);
        this.lastP1ScoreLabel = p1ScoreLabel;
      }
      const p1LivesLabel = `LIVES: ${this.lives}`;
      if (p1LivesLabel !== this.lastP1LivesLabel) {
        this.p1LivesText.setText(p1LivesLabel);
        this.lastP1LivesLabel = p1LivesLabel;
      }
    }
    let nextLevelLabel = '';
    if (this.levelBossPendingDefeat) {
      nextLevelLabel = `${this.difficultyPreset.label}  LEVEL ${this.level}  BOSS FIGHT`;
    } else {
      nextLevelLabel = `${this.difficultyPreset.label}  LEVEL ${this.level}  NEXT ${Math.max(0, this.nextLevelScore - this.progressionScore)}`;
    }
    if (nextLevelLabel !== this.lastLevelLabel) {
      this.levelText.setText(nextLevelLabel);
      this.lastLevelLabel = nextLevelLabel;
    }

    this.updatePerkHUD();
    this.updateBossEnergyUI();
  }

  private updateBossEnergyUI() {
    // Boss energy is rendered directly on the boss UFO.
  }

  private addScore(points: number) {
    this.score += points;
    this.progressionScore += points;
    if (this.playerStates[this.activePlayerIndex]) {
      this.playerStates[this.activePlayerIndex].score = this.score;
    }
    this.checkLevelProgression();
    this.updateHUD();
  }

  private checkLevelProgression() {
    if (
      this.isGameOver ||
      this.isSwitching ||
      this.isLevelTransition ||
      this.levelBossPendingDefeat
    ) {
      return;
    }
    if (this.progressionScore < this.nextLevelScore) return;
    this.triggerLevelBossEncounter();
  }

  private triggerLevelBossEncounter() {
    if (this.levelBossPendingDefeat || this.isGameOver) return;
    this.levelBossPendingDefeat = true;
    if (this.ufo.active && this.ufo.getVariant() !== 'boss') {
      this.ufo.deactivate();
    }
    this.ufoSpawnTimer = Phaser.Math.Between(320, 620);
    this.cameras.main.flash(180, 255, 96, 128, false);
    this.cameras.main.shake(220, 0.005);
    this.updateHUD();
  }

  private completeLevelAfterBossDefeat() {
    if (!this.levelBossPendingDefeat || this.isGameOver) return;
    this.levelBossPendingDefeat = false;
    this.level += 1;
    this.nextLevelScore = this.progressionScore + this.getNextLevelScore(this.level);
    this.applyDifficultyProfile();
    this.startLevelTransitionCountdown(LEVEL_TRANSITION_TUNING.bossDefeatCelebrationDelayMs);
    this.tweens.add({
      targets: this.levelText,
      scaleX: 1.24,
      scaleY: 1.24,
      duration: 140,
      yoyo: true,
      ease: 'Sine.easeOut',
    });
  }

  private applyDifficultyProfile(silent: boolean = false) {
    this.difficultyPreset = getDifficultyPreset(this.difficultyKey);
    this.enemyManager.setDifficultyPreset(this.difficultyPreset);
    this.enemyManager.setDifficultyLevel(this.level);
    this.powerUpDirector.setDifficultyPreset(this.difficultyPreset);
    this.powerUpDirector.setDifficultyLevel(this.level);
    this.ufo.setDifficultyPreset(this.difficultyPreset);
    this.ufo.setDifficultyLevel(this.level);
    if (!silent) {
      this.updateHUD();
    }
  }

  private updateActiveMarker() {
    if (this.playerCount !== 2 || !this.activeMarkerLeft || !this.activeMarkerRight) return;
    if (this.lastActiveMarkerIndex === this.activePlayerIndex) return;
    const activeLeft = this.activePlayerIndex === 0;
    this.activeMarkerLeft.setVisible(true);
    this.activeMarkerRight.setVisible(true);
    this.activeMarkerLeft.setAlpha(activeLeft ? 1 : 0.2);
    this.activeMarkerRight.setAlpha(activeLeft ? 0.2 : 1);
    if (this.activeMarkerTween) {
      this.activeMarkerTween.stop();
      this.activeMarkerTween = undefined;
    }
    const target = activeLeft ? this.activeMarkerLeft : this.activeMarkerRight;
    this.activeMarkerTween = this.tweens.add({
      targets: target,
      alpha: 0.2,
      duration: 400,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    this.lastActiveMarkerIndex = this.activePlayerIndex;
  }

  private createSmokeEmitter() {
    if (!this.useHighEndVFX) return;
    if (!this.textures.exists('smoke')) {
      const g = this.make.graphics({ x: 0, y: 0 });
      g.fillStyle(0xffffff, 1);
      g.fillCircle(6, 6, 6);
      g.generateTexture('smoke', 12, 12);
      g.destroy();
    }
    this.smokeEmitter = this.add.particles(0, 0, 'smoke', {
      lifespan: { min: 800, max: 1400 },
      speedY: { min: -60, max: -120 },
      speedX: { min: -20, max: 20 },
      scale: { start: 0.6, end: 1.2 },
      alpha: { start: 0.5, end: 0 },
      quantity: 8,
      emitting: false,
    });
    this.smokeEmitter.setDepth(120);
  }

  private createEliteDroneEntity() {
    this.eliteDrone = this.physics.add.sprite(-160, -160, 'elite_drone');
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

    this.eliteDroneLabel = this.add
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
  }

  private rollRange(range: IntRange) {
    return Phaser.Math.Between(range[0], range[1]);
  }

  private setWormholeSpawnTimer(mode: 'initial' | 'respawn') {
    const range =
      mode === 'initial' ? WORMHOLE_TUNING.initialSpawnDelayMs : WORMHOLE_TUNING.respawnDelayMs;
    this.wormholeSpawnTimer = this.rollRange(range);
  }

  private setEliteDroneSpawnTimer(reason: EliteDroneDeactivateReason) {
    this.eliteDroneSpawnTimer = this.rollRange(pickEliteDroneSpawnDelayRange(reason));
  }

  private clearWorldEvents(reason: EliteDroneDeactivateReason = 'reset') {
    this.deactivateWormhole();
    this.deactivateEliteDrone(reason);
  }

  private resetWorldEventTimers() {
    this.setWormholeSpawnTimer('initial');
    this.wormholeForceAccumulatorMs = 0;
    this.eliteDroneSpawnTimer = this.rollRange(ELITE_DRONE_TUNING.initialSpawnDelayMs);
    this.eliteDroneLifetimeMs = 0;
  }

  private applyPassivePerksFromActiveState() {
    const state = this.playerStates[this.activePlayerIndex];
    const coolingLevel = state?.eliteCoolingPerkLevel ?? 0;
    const magnetLevel = state?.eliteMagnetPerkLevel ?? 0;
    this.passiveCoolingMultiplier = 1 + coolingLevel * 0.2;
    this.magneticDurationMultiplier = 1 + magnetLevel * 0.24;
    this.player.setPassiveCoolingMultiplier(this.passiveCoolingMultiplier);
    this.updatePerkHUD();
  }

  private updatePerkHUD() {
    if (!this.perkText) return;
    const state = this.playerStates[this.activePlayerIndex];
    if (!state) return;
    const perkLabel = `PERKS L+${state.eliteLifePerkCount} C+${state.eliteCoolingPerkLevel} M+${state.eliteMagnetPerkLevel}`;
    if (perkLabel !== this.lastPerkLabel) {
      this.perkText.setText(perkLabel);
      this.lastPerkLabel = perkLabel;
    }
  }

  private getScaledMagneticDuration(baseMs: number) {
    return Math.round(
      baseMs * this.difficultyPreset.powerUpDurationScale * this.magneticDurationMultiplier,
    );
  }

  private pickElitePerk(state: PlayerState): ElitePerkType {
    const candidates: ElitePerkType[] = [];
    if (state.eliteLifePerkCount < 4) candidates.push('bonus_life');
    if (state.eliteCoolingPerkLevel < 3) candidates.push('cooling');
    if (state.eliteMagnetPerkLevel < 3) candidates.push('magnet');
    if (candidates.length === 0) return 'bonus_life';
    return Phaser.Utils.Array.GetRandom(candidates);
  }

  private grantElitePerk(trigger: 'rescued' | 'shot', x: number, y: number) {
    const state = this.playerStates[this.activePlayerIndex];
    if (!state) return;

    const perk = this.pickElitePerk(state);
    let label = '';
    if (perk === 'bonus_life') {
      state.eliteLifePerkCount += 1;
      this.lives = Math.min(9, this.lives + 1);
      state.lives = this.lives;
      label = '+1 LIFE';
    } else if (perk === 'cooling') {
      state.eliteCoolingPerkLevel += 1;
      label = 'COOLING+';
    } else {
      state.eliteMagnetPerkLevel += 1;
      label = 'MAGNET+';
    }

    this.applyPassivePerksFromActiveState();
    this.addScore(620 + this.level * 35);

    const prefix = trigger === 'rescued' ? 'RETTUNG' : 'BERGUNG';
    const pop = this.add
      .text(x, y - 24, `${prefix} ${label}`, {
        fontFamily: '"Press Start 2P"',
        fontSize: '13px',
        color: '#b7ffe0',
        stroke: '#00150f',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(140);
    this.tweens.add({
      targets: pop,
      y: y - 58,
      alpha: 0,
      duration: 780,
      ease: 'Sine.easeOut',
      onComplete: () => pop.destroy(),
    });

    this.cameras.main.flash(90, 120, 255, 210, false);
    this.updateHUD();
  }

  private spawnWormhole() {
    if (this.wormhole?.active || this.isGameOver) return;
    const width = this.scale.width;
    const height = this.scale.height;
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
    this.wormholeForceAccumulatorMs = 0;
    this.setWormholeSpawnTimer('respawn');
  }

  private deactivateWormhole() {
    if (!this.wormhole) return;
    this.wormhole.active = false;
    this.wormholeGraphics.clear();
    this.wormholeGraphics.setVisible(false);
    this.wormholeForceAccumulatorMs = 0;
  }

  private updateWormhole(delta: number) {
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

    const width = this.scale.width;
    const height = this.scale.height;
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

    const t = this.time.now * 0.004;
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

  private spawnEliteDrone() {
    if (this.eliteDrone.active || this.isGameOver) return;
    const spawnLeft = Phaser.Math.Between(0, 1) === 0;
    const x = spawnLeft
      ? Phaser.Math.Between(86, 180)
      : Phaser.Math.Between(this.scale.width - 180, this.scale.width - 86);
    const y = Phaser.Math.Between(92, Math.round(this.scale.height * 0.46));
    this.eliteDrone.enableBody(true, x, y, true, true);
    this.eliteDrone.setActive(true);
    this.eliteDrone.setVisible(true);
    this.eliteDrone.setAlpha(1);
    this.eliteDrone.setTint(0xa7ffd8);
    this.eliteDroneLifetimeMs = this.rollRange(ELITE_DRONE_TUNING.lifetimeMs);
    this.eliteDroneLabel.setVisible(true);
    this.eliteDroneSpawnTimer = this.rollRange(ELITE_DRONE_TUNING.postSpawnDelayMs);
    this.cameras.main.flash(70, 120, 255, 120, false);
  }

  private deactivateEliteDrone(reason: EliteDroneDeactivateReason) {
    if (!this.eliteDrone) return;
    if (this.eliteDrone.active) {
      this.eliteDrone.disableBody(true, true);
      this.eliteDrone.setActive(false);
      this.eliteDrone.setVisible(false);
    }
    this.eliteDroneLabel?.setVisible(false);
    this.eliteDroneLifetimeMs = 0;
    this.setEliteDroneSpawnTimer(reason);
  }

  private updateEliteDrone(delta: number) {
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
      Math.min(ELITE_DRONE_TUNING.speedBonusCap, this.level * ELITE_DRONE_TUNING.speedPerLevel);
    const wave = this.time.now * 0.0036;
    let vx = awayX * baseSpeed + Math.cos(wave) * 62;
    let vy = awayY * baseSpeed + Math.sin(wave * 1.15) * 52 - 36;

    if (this.eliteDrone.x < 76) vx += 85;
    if (this.eliteDrone.x > this.scale.width - 76) vx -= 85;
    if (this.eliteDrone.y < 72) vy += 72;
    if (this.eliteDrone.y > this.scale.height * 0.82) vy -= 96;

    body.setVelocity(vx, vy);
    this.eliteDrone.rotation += (delta / 1000) * 3.2;
    this.eliteDroneLabel.setPosition(this.eliteDrone.x, this.eliteDrone.y - 24);
    this.eliteDroneLabel.setAlpha(0.55 + Math.sin(this.time.now * 0.01) * 0.3);

    const outBounds = ELITE_DRONE_TUNING.outOfBoundsPadding;
    if (
      this.eliteDrone.x < -outBounds ||
      this.eliteDrone.x > this.scale.width + outBounds ||
      this.eliteDrone.y < -outBounds ||
      this.eliteDrone.y > this.scale.height + outBounds
    ) {
      this.deactivateEliteDrone('expired');
    }
  }

  private handlePlayerRescueEliteDrone(obj1: any, obj2: any) {
    if (this.isGameOver || this.isSwitching || this.isLevelTransition) return;
    const drone = (obj1 === this.eliteDrone ? obj1 : obj2) as Phaser.Physics.Arcade.Sprite;
    if (!drone.active) return;
    const x = drone.x;
    const y = drone.y;
    this.audio.playPickup();
    this.grantElitePerk('rescued', x, y);
    this.deactivateEliteDrone('rescued');
  }

  private handleBulletHitEliteDrone(obj1: any, obj2: any) {
    if (this.isGameOver || this.isSwitching || this.isLevelTransition) return;
    const bullet = (obj1 === this.eliteDrone ? obj2 : obj1) as Bullet;
    const drone = (obj1 === this.eliteDrone ? obj1 : obj2) as Phaser.Physics.Arcade.Sprite;
    if (!drone.active || !bullet.active) return;
    const x = drone.x;
    const y = drone.y;
    bullet.disableBody(true, true);
    this.explosionManager.triggerExplosion(x, y);
    this.audio.playExplosion();
    this.grantElitePerk('shot', x, y);
    this.deactivateEliteDrone('shot');
  }

  public spawnOverheatSmoke(x: number, y: number) {
    if (!this.useHighEndVFX || !this.smokeEmitter) return;
    this.smokeEmitter.emitParticleAt(x, y + 10, 10);
  }

  private updateActivePowerUps(delta: number) {
    let list = '';
    this.activePowerUps.forEach((timeLeft, type) => {
      const newTime = timeLeft - delta;
      if (newTime <= 0) {
        this.activePowerUps.delete(type);
        this.deactivatePowerUp(type);
      } else {
        this.activePowerUps.set(type, newTime);
        list += `${type}: ${(newTime / 1000).toFixed(1)}s\n`;
      }
    });
    this.powerUpTextRefreshMs -= delta;
    if (this.powerUpTextRefreshMs <= 0) {
      if (list !== this.lastPowerUpList) {
        this.powerUpListText.setText(list);
        this.lastPowerUpList = list;
      }
      this.powerUpTextRefreshMs = 100;
    }
    if (this.playerStates[this.activePlayerIndex]) {
      this.playerStates[this.activePlayerIndex].activePowerUps = new Map(this.activePowerUps);
    }
  }

  private saveActivePlayerState() {
    const state = this.playerStates[this.activePlayerIndex];
    if (!state) return;
    state.score = this.score;
    state.lives = this.lives;
    state.powerUpTimer = this.powerUpTimer;
    state.activePowerUps = new Map(this.activePowerUps);
  }

  private loadActivePlayerState(index: number) {
    const state = this.playerStates[index];
    if (!state) return;
    this.score = state.score;
    this.lives = state.lives;
    this.powerUpTimer = state.powerUpTimer;
    this.activePowerUps = new Map(state.activePowerUps);
    this.applyPassivePerksFromActiveState();
    this.applyActivePowerUpEffects(true);
    this.updatePowerUpUI();
    this.updateActivePowerUps(0);
    this.updateHUD();
  }

  private applyActivePowerUpEffects(silent: boolean) {
    this.player.setTripleShot(this.activePowerUps.has(PowerUpType.TRIPLE_SHOT));
    this.player.setShield(this.activePowerUps.has(PowerUpType.SHIELD));
    this.player.setCannonCooling(this.activePowerUps.has(PowerUpType.CANNON_COOLING));
    this.player.setSlowMotionVisual(this.activePowerUps.has(PowerUpType.SLOW_MOTION));
    this.player.setBlackHoleVisual(this.activePowerUps.has(PowerUpType.BLACK_HOLE));
    if (this.activePowerUps.has(PowerUpType.GHOST_PHASE)) {
      this.applyGhost(true, silent);
    } else {
      this.applyGhost(false, true);
    }
    if (this.activePowerUps.has(PowerUpType.SLOW_MOTION)) {
      this.applySlowMo(true);
    } else {
      this.applySlowMo(false);
    }
    if (this.activePowerUps.has(PowerUpType.WINGMAN_DRONES)) {
      this.spawnDrones();
    } else {
      this.removeDrones();
    }
    if (this.activePowerUps.has(PowerUpType.BLACK_HOLE)) {
      this.spawnBlackHole();
    } else {
      this.removeBlackHole();
    }
    this.player.setMagnetic(this.powerUpTimer > 0);
    if (this.powerUpTimer <= 0) this.powerUpBar.clear();
  }

  private clearCurrentPowerUps() {
    this.activePowerUps.clear();
    this.powerUpTimer = 0;
    this.powerUpBarRefreshMs = 0;
    this.player.setMagnetic(false);
    this.player.setTripleShot(false);
    this.player.setShield(false);
    this.player.setCannonCooling(false);
    this.player.setSlowMotionVisual(false);
    this.player.setBlackHoleVisual(false);
    this.applyGhost(false, true);
    this.applySlowMo(false);
    this.removeDrones();
    this.removeBlackHole();
    this.powerUpBar.clear();
    this.lastPowerUpList = '';
    this.powerUpListText.setText('');
  }

  private resetPlayfield() {
    this.pendingEnemyHits.length = 0;
    this.bullets.clear(true, true);
    this.enemyManager.enemies.clear(true, true);
    this.powerUpDirector.reset();
    this.ufo.deactivate();
    this.clearWorldEvents('reset');
    this.resetWorldEventTimers();
    this.ufoSpawnTimer = this.levelBossPendingDefeat
      ? Phaser.Math.Between(500, 900)
      : this.computeNextUFOSpawnDelay();
  }

  private createTurnOverlay() {
    const bg = this.add.rectangle(
      GAME_WIDTH / 2,
      GAME_HEIGHT / 2,
      GAME_WIDTH,
      GAME_HEIGHT,
      0x000000,
      0.8,
    );
    this.switchText = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2, '', {
        fontFamily: '"Press Start 2P"',
        fontSize: '32px',
        color: '#ffffff',
      })
      .setOrigin(0.5);
    this.switchPrompt = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 60, 'PRESS START', {
        fontFamily: '"Press Start 2P"',
        fontSize: '18px',
        color: '#ffff00',
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    this.switchPrompt.on('pointerdown', () => {
      if (this.awaitingTurnInput) {
        this.turnPointerHandler?.();
      }
    });
    this.switchOverlay = this.add
      .container(0, 0, [bg, this.switchText, this.switchPrompt])
      .setDepth(200);
    this.switchOverlay.setVisible(false);
  }

  private showTurnOverlay(playerIndex: number) {
    this.switchText.setText(`PLAYER ${playerIndex + 1} GET READY`);
    this.switchPrompt.setAlpha(1);
    this.tweens.add({
      targets: this.switchPrompt,
      alpha: 0.2,
      duration: 500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    this.switchOverlay.setVisible(true);
  }

  private hideTurnOverlay() {
    this.tweens.killTweensOf(this.switchPrompt);
    this.switchOverlay.setVisible(false);
  }

  private createLevelTransitionOverlay() {
    const bg = this.add.rectangle(
      GAME_WIDTH / 2,
      GAME_HEIGHT / 2,
      GAME_WIDTH,
      GAME_HEIGHT,
      0x000000,
      0.78,
    );
    this.levelTransitionTitle = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 96, '', {
        fontFamily: '"Press Start 2P"',
        fontSize: '42px',
        color: '#ffd966',
        stroke: '#000000',
        strokeThickness: 4,
      })
      .setOrigin(0.5);
    this.levelTransitionCountdown = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2, '', {
        fontFamily: '"Press Start 2P"',
        fontSize: '94px',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 6,
      })
      .setOrigin(0.5);
    this.levelTransitionPrompt = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 94, 'GET READY', {
        fontFamily: '"Press Start 2P"',
        fontSize: '18px',
        color: '#7dd3fc',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5);
    this.levelTransitionOverlay = this.add
      .container(0, 0, [
        bg,
        this.levelTransitionTitle,
        this.levelTransitionCountdown,
        this.levelTransitionPrompt,
      ])
      .setDepth(230);
    this.levelTransitionOverlay.setVisible(false);
  }

  private clearLevelTransitionEvents() {
    for (const event of this.levelTransitionEvents) {
      event.remove(false);
    }
    this.levelTransitionEvents.length = 0;
  }

  private stopLevelTransitionTweens() {
    this.tweens.killTweensOf(this.levelTransitionCountdown);
    this.tweens.killTweensOf(this.levelTransitionPrompt);
  }

  private startLevelTransitionCountdown(delayBeforeOverlayMs: number = 0) {
    if (this.isLevelTransition || this.isGameOver) return;
    this.isLevelTransition = true;
    this.physics.world.pause();
    this.ufo.setCombatTarget(null);
    if (this.player.body) this.player.body.enable = false;

    this.stopLevelTransitionTweens();
    this.clearLevelTransitionEvents();
    this.levelTransitionOverlay.setVisible(false);
    this.levelTransitionCountdownLabel = '';

    const beginCountdown = () => {
      if (!this.isLevelTransition || !this.scene.isActive(this.scene.key)) return;

      this.levelTransitionTitle.setText(`LEVEL ${this.level}`);
      this.levelTransitionCountdown.setText('3');
      this.levelTransitionCountdown.setScale(1);
      this.levelTransitionCountdown.setAlpha(1);
      this.levelTransitionCountdown.setFontSize(94);
      this.levelTransitionCountdown.setColor('#ffffff');
      this.levelTransitionPrompt.setAlpha(1);
      this.levelTransitionOverlay.setVisible(true);
      this.levelTransitionCountdownLabel = '3';

      this.tweens.add({
        targets: this.levelTransitionPrompt,
        alpha: 0.35,
        duration: 420,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });

      const beats = ['3', '2', '1', 'GO!'] as const;
      const beatMs = LEVEL_TRANSITION_TUNING.beatMs;
      beats.forEach((beat, index) => {
        const event = this.time.delayedCall(index * beatMs, () => {
          if (!this.isLevelTransition || !this.scene.isActive(this.scene.key)) return;
          const isGo = beat === 'GO!';
          this.levelTransitionCountdownLabel = beat;
          this.levelTransitionCountdown.setText(beat);
          this.levelTransitionCountdown.setFontSize(isGo ? 80 : 94);
          this.levelTransitionCountdown.setColor(isGo ? '#66ff99' : '#ffffff');
          this.levelTransitionCountdown.setScale(isGo ? 0.7 : 0.88);
          this.levelTransitionCountdown.setAlpha(1);
          this.tweens.add({
            targets: this.levelTransitionCountdown,
            scaleX: isGo ? 1.24 : 1.14,
            scaleY: isGo ? 1.24 : 1.14,
            alpha: isGo ? 1 : 0.9,
            duration: beatMs - 60,
            ease: 'Cubic.easeOut',
          });
          if (isGo) {
            this.cameras.main.flash(130, 180, 255, 180, false);
          }
        });
        this.levelTransitionEvents.push(event);
      });

      const finishEvent = this.time.delayedCall(beats.length * beatMs + 90, () => {
        this.finishLevelTransitionCountdown(true);
      });
      this.levelTransitionEvents.push(finishEvent);
    };

    const safeDelay = Math.max(0, delayBeforeOverlayMs);
    if (safeDelay === 0) {
      beginCountdown();
      return;
    }
    const delayEvent = this.time.delayedCall(safeDelay, beginCountdown);
    this.levelTransitionEvents.push(delayEvent);
  }

  private finishLevelTransitionCountdown(resumePhysics: boolean) {
    this.clearLevelTransitionEvents();
    this.stopLevelTransitionTweens();
    this.levelTransitionOverlay.setVisible(false);
    this.levelTransitionCountdownLabel = '';
    const wasActive = this.isLevelTransition;
    this.isLevelTransition = false;
    if (wasActive && resumePhysics && !this.isSwitching && !this.isGameOver) {
      const ghostActive = this.activePowerUps.has(PowerUpType.GHOST_PHASE);
      if (this.player.body) {
        this.player.body.enable = !ghostActive;
      }
      this.physics.world.resume();
      this.ufo.setCombatTarget(this.player.active ? this.player : null);
    }
  }

  private resetPlayerForTurn() {
    this.player.setPosition(GAME_WIDTH / 2, GAME_HEIGHT - 100);
    this.player.setActive(true).setVisible(true);
    const ghostActive = this.activePowerUps.has(PowerUpType.GHOST_PHASE);
    if (this.player.body) this.player.body.enable = !ghostActive;
    if (!ghostActive) {
      this.player.setAlpha(1);
    }
    this.player.resetHeat();
  }

  private queueTurnSwitch(nextIndex: number) {
    this.isSwitching = true;
    this.ufo.setCombatTarget(null);
    this.physics.world.pause();
    if (this.player.body) this.player.body.enable = false;
    this.player.setActive(false).setVisible(false);
    this.switchTimer?.remove(false);
    this.switchTimer = this.time.delayedCall(2000, () => {
      this.showTurnOverlay(nextIndex);
      this.awaitTurnContinue(nextIndex);
    });
  }

  private awaitTurnContinue(nextIndex: number) {
    this.awaitingTurnInput = true;
    const proceed = () => {
      if (!this.awaitingTurnInput) return;
      this.awaitingTurnInput = false;
      if (this.turnKeyHandler) {
        this.input.keyboard?.off('keydown', this.turnKeyHandler);
      }
      if (this.turnPointerHandler) {
        this.input.off('pointerdown', this.turnPointerHandler);
      }
      this.turnKeyHandler = undefined;
      this.turnPointerHandler = undefined;
      this.resetPlayfield();
      this.activePlayerIndex = nextIndex;
      this.loadActivePlayerState(nextIndex);
      this.resetPlayerForTurn();
      this.ufo.setCombatTarget(this.player);
      this.isSwitching = false;
      this.physics.world.resume();
      this.hideTurnOverlay();
    };
    this.turnKeyHandler = () => proceed();
    this.turnPointerHandler = () => proceed();
    this.input.keyboard?.on('keydown', this.turnKeyHandler);
    this.input.on('pointerdown', this.turnPointerHandler);
  }

  private activatePowerUp(type: PowerUpType) {
    this.activePowerUps.set(type, this.getPowerUpDuration(type));
    if (this.playerStates[this.activePlayerIndex]) {
      this.playerStates[this.activePlayerIndex].activePowerUps = new Map(this.activePowerUps);
    }
    switch (type) {
      case PowerUpType.TRIPLE_SHOT:
        this.player.setTripleShot(true);
        break;
      case PowerUpType.SLOW_MOTION:
        this.player.setSlowMotionVisual(true);
        this.applySlowMo(true);
        break;
      case PowerUpType.SHIELD:
        this.player.setShield(true);
        break;
      case PowerUpType.EMP_WAVE:
        this.triggerEMP();
        break;
      case PowerUpType.GHOST_PHASE:
        this.applyGhost(true);
        break;
      case PowerUpType.WINGMAN_DRONES:
        this.spawnDrones();
        break;
      case PowerUpType.CANNON_COOLING:
        this.player.setCannonCooling(true);
        break;
      case PowerUpType.BLACK_HOLE:
        this.player.setBlackHoleVisual(true);
        this.spawnBlackHole();
        break;
    }
  }

  private deactivatePowerUp(type: PowerUpType) {
    switch (type) {
      case PowerUpType.TRIPLE_SHOT:
        this.player.setTripleShot(false);
        break;
      case PowerUpType.SLOW_MOTION:
        this.player.setSlowMotionVisual(false);
        this.applySlowMo(false);
        break;
      case PowerUpType.SHIELD:
        this.player.setShield(false);
        break;
      case PowerUpType.GHOST_PHASE:
        this.applyGhost(false);
        break;
      case PowerUpType.WINGMAN_DRONES:
        this.removeDrones();
        break;
      case PowerUpType.CANNON_COOLING:
        this.player.setCannonCooling(false);
        break;
      case PowerUpType.BLACK_HOLE:
        this.player.setBlackHoleVisual(false);
        this.removeBlackHole();
        break;
    }
    if (this.playerStates[this.activePlayerIndex]) {
      this.playerStates[this.activePlayerIndex].activePowerUps = new Map(this.activePowerUps);
    }
  }

  private applySlowMo(active: boolean) {
    if (this.slowMoActive === active) return;
    this.slowMoActive = active;
    this.physics.world.timeScale = active ? 2.0 : 1.0;
    if (this.useHighEndVFX) {
      if (active) {
        const fx = this.cameras.main.postFX.addColorMatrix();
        fx.night();
        fx.grayscale();
      } else {
        this.cameras.main.postFX.clear();
      }
    } else {
      this.tweens.add({ targets: this.slowMoOverlay, alpha: active ? 0.3 : 0, duration: 500 });
    }
  }

  private triggerEMP() {
    this.audio.playEMP();
    const maxRadius = Math.max(GAME_WIDTH, GAME_HEIGHT);
    this.tweens.add({
      targets: { r: 0 },
      r: maxRadius,
      duration: 1000,
      onUpdate: (tween) => {
        const radius = tween.getValue() ?? 0;
        const radiusSq = radius * radius;
        const playerX = this.player.x;
        const playerY = this.player.y;
        this.empGraphics
          .clear()
          .lineStyle(4, 0x0000ff, 1 - radius / maxRadius)
          .strokeCircle(playerX, playerY, radius);
        const enemyChildren = (this.enemyManager?.enemies as any)?.children;
        if (!enemyChildren || typeof enemyChildren.each !== 'function') return;
        enemyChildren.each((enemy: any) => {
          if (enemy.active) {
            const dx = enemy.x - playerX;
            const dy = enemy.y - playerY;
            if (dx * dx + dy * dy > radiusSq) return null;
            this.enqueuePendingEnemyHit(enemy.x, enemy.y, 0, 'emp');
            enemy.disableBody(true, true);
          }
          return null;
        });
      },
      onComplete: () => this.empGraphics.clear(),
    });
  }

  private applyGhost(active: boolean, silent: boolean = false) {
    if (active && !silent) this.audio.playGhost();
    this.player.setAlpha(active ? 0.5 : 1.0);
    this.player.body!.enable = !active;
    if (active)
      this.tweens.add({ targets: this.player, alpha: 0.2, duration: 100, yoyo: true, repeat: -1 });
    else this.tweens.killTweensOf(this.player);
  }

  private spawnDrones() {
    this.audio.playDrones();
    this.removeDrones();
    this.drones = this.add.group();

    [-60, 60].forEach((offset) => {
      // Small wireframe V-shape ship
      const g = this.add.graphics();
      g.lineStyle(2, 0x00ff00, 1);
      g.beginPath();
      g.moveTo(0, -10);
      g.lineTo(10, 10);
      g.lineTo(0, 5);
      g.lineTo(-10, 10);
      g.closePath();
      g.strokePath();

      // Since it's a graphic, we create a container or sprite from it
      // For simplicity, we can just use the graphics object directly in the group
      g.x = this.player.x + offset;
      g.y = this.player.y + 20;
      this.drones?.add(g);
    });

    this.player.setDrones(this.drones);
  }

  private updateDrones() {
    if (!this.drones) return;
    const playerActive = this.player && this.player.active;
    const droneChildren = (this.drones as any).children;
    if (!droneChildren || typeof droneChildren.each !== 'function') return;
    droneChildren.each((drone: any, i: number) => {
      if (!playerActive) {
        drone.setVisible(false);
        return null;
      }
      drone.setVisible(true);
      const offset = i === 0 ? -60 : 60;
      drone.x = Phaser.Math.Linear(drone.x, this.player.x + offset, 0.1);
      drone.y = Phaser.Math.Linear(drone.y, this.player.y + 20, 0.1);
      return null;
    });
  }

  private removeDrones() {
    this.player.setDrones(null);
    if (this.drones) {
      const children = (this.drones as any).children;
      if (children && typeof children.size === 'number') {
        this.drones.clear(true, true);
      }
    }
    this.drones = null;
  }

  private spawnBlackHole() {
    this.audio.playBlackHole();
    const x = Phaser.Math.Between(Math.round(GAME_WIDTH * 0.2), Math.round(GAME_WIDTH * 0.8));
    const y = Phaser.Math.Between(Math.round(GAME_HEIGHT * 0.2), Math.round(GAME_HEIGHT * 0.5));
    const g = this.add.graphics().setDepth(5);
    this.blackHole = { x, y, active: true, graphics: g };
  }

  private updateBlackHole(delta: number) {
    if (!this.blackHole?.active) return;
    const { x, y, graphics } = this.blackHole;
    graphics
      .clear()
      .lineStyle(2, 0xaa00ff, 0.8)
      .strokeCircle(x, y, 50 + Math.sin(this.time.now * 0.01) * 10);

    this.blackHoleForceAccumulatorMs += delta;
    if (this.blackHoleForceAccumulatorMs < 33) return;

    const forceScale = this.blackHoleForceAccumulatorMs / (1000 / 60);
    this.blackHoleForceAccumulatorMs = 0;
    const force = 10 * forceScale;
    const children = this.enemyManager.enemies.getChildren() as Enemy[];
    for (const enemy of children) {
      if (!enemy.active || !enemy.body) continue;
      const angle = Phaser.Math.Angle.Between(enemy.x, enemy.y, x, y);
      enemy.body.velocity.x += Math.cos(angle) * force;
      enemy.body.velocity.y += Math.sin(angle) * force;
    }
  }

  private removeBlackHole() {
    this.blackHole?.graphics.destroy();
    this.blackHole = null;
  }

  private handlePlayerHitPowerUp(_player: any, obj2: any) {
    const powerUp = obj2 as PowerUp;
    this.audio.playPickup();
    this.activatePowerUp(powerUp.type);
    powerUp.deactivate();
  }

  private handleBulletHitUFO(obj1: any, obj2: any) {
    const bullet = (obj1 === this.ufo ? obj2 : obj1) as Bullet;
    if (!this.ufo.active || !bullet.active) return;

    const ufoX = this.ufo.x;
    const ufoY = this.ufo.y;
    const variant = this.ufo.getVariant();
    const bossPhase = this.ufo.getBossPhase?.() ?? 0;
    bullet.disableBody(true, true);
    bullet.setActive(false);
    bullet.setVisible(false);

    if (variant === 'scout') {
      // Scout should always pop instantly on hit to avoid stale/frozen visual states.
      this.ufo.deactivate();
      this.triggerUFODestructionFX(ufoX, ufoY, 'scout');
      this.powerUpTimer = Math.max(this.powerUpTimer, this.getScaledMagneticDuration(5000));
      this.player.setMagnetic(true);
      this.addScore(500 + this.level * 25);
      this.ufoSpawnTimer = this.levelBossPendingDefeat
        ? Phaser.Math.Between(650, 1200)
        : this.computeNextUFOSpawnDelay('scout');
      if (this.playerStates[this.activePlayerIndex]) {
        this.playerStates[this.activePlayerIndex].powerUpTimer = this.powerUpTimer;
      }
      return;
    }

    const hitResult = this.ufo.applyBulletHit(1);
    if (!hitResult.destroyed) {
      this.ufo.ensureCombatReady();
      this.explosionManager.triggerExplosion(ufoX, ufoY);
      this.audio.playExplosion();
      this.cameras.main.shake(70, 0.0032);
      this.updateHUD();
      return;
    }

    this.triggerUFODestructionFX(ufoX, ufoY, variant);

    this.powerUpTimer = Math.max(this.powerUpTimer, this.getScaledMagneticDuration(7000));
    this.player.setMagnetic(true);
    if (Phaser.Math.Between(0, 99) < 45) {
      const rewardPool = [PowerUpType.SHIELD, PowerUpType.CANNON_COOLING, PowerUpType.TRIPLE_SHOT];
      const reward = Phaser.Utils.Array.GetRandom(rewardPool);
      this.activatePowerUp(reward);
    }
    this.addScore(1800 + this.level * 220 + bossPhase * 120);
    if (this.levelBossPendingDefeat) {
      this.completeLevelAfterBossDefeat();
    }
    this.ufoSpawnTimer = this.levelBossPendingDefeat
      ? Phaser.Math.Between(650, 1200)
      : this.computeNextUFOSpawnDelay(variant);

    if (this.playerStates[this.activePlayerIndex]) {
      this.playerStates[this.activePlayerIndex].powerUpTimer = this.powerUpTimer;
    }
  }

  private triggerUFODestructionFX(x: number, y: number, variant: UFOVariant) {
    if (variant === 'boss') {
      this.triggerBossAnnihilationFX(x, y);
      return;
    }

    const burstCount = 4;
    const radius = 28;
    const shakeIntensity = 0.007;
    const shakeDuration = 180;

    this.explosionManager.triggerExplosion(x, y);
    this.explosionManager.triggerUFODebrisRing(x, y, variant);
    this.audio.playExplosion();
    this.cameras.main.shake(shakeDuration, shakeIntensity);

    for (let i = 0; i < burstCount; i++) {
      this.time.delayedCall(i * 55, () => {
        if (!this.scene.isActive(this.scene.key)) return;
        const angle = (i / burstCount) * Math.PI * 2 + Phaser.Math.FloatBetween(-0.2, 0.2);
        const spread = Phaser.Math.FloatBetween(radius * 0.45, radius);
        const ex = x + Math.cos(angle) * spread;
        const ey = y + Math.sin(angle) * spread;
        this.explosionManager.triggerExplosion(ex, ey);
        if (i % 2 === 0) this.audio.playExplosion();
      });
    }

    this.time.delayedCall(120, () => {
      if (!this.scene.isActive(this.scene.key)) return;
      this.cameras.main.flash(120, 255, 240, 210, false);
    });
  }

  private triggerBossAnnihilationFX(x: number, y: number) {
    this.explosionManager.triggerExplosion(x, y);
    this.explosionManager.triggerUFODebrisRing(x, y, 'boss');
    this.audio.playExplosion();
    this.audio.playEMP();
    this.audio.playBlackHole();
    this.cameras.main.shake(720, 0.019);
    this.cameras.main.flash(220, 210, 150, 255, false);

    const wave = this.add.graphics().setDepth(145);
    const waveState = { r: 24, a: 0.95 };
    this.tweens.add({
      targets: waveState,
      r: 320,
      a: 0,
      duration: 920,
      ease: 'Cubic.easeOut',
      onUpdate: () => {
        if (!wave.active) return;
        wave.clear();
        wave.lineStyle(4, 0xff6de0, waveState.a * 0.9);
        wave.strokeCircle(x, y, waveState.r);
        wave.lineStyle(2, 0x8cf8ff, waveState.a * 0.75);
        wave.strokeCircle(x, y, waveState.r * 0.72);
      },
      onComplete: () => wave.destroy(),
    });

    const bursts = 18;
    for (let i = 0; i < bursts; i++) {
      this.time.delayedCall(i * 48, () => {
        if (!this.scene.isActive(this.scene.key)) return;
        const t = i / bursts;
        const angle = t * Math.PI * 6 + Phaser.Math.FloatBetween(-0.2, 0.2);
        const radius = 26 + t * 170;
        const ex = x + Math.cos(angle) * radius;
        const ey = y + Math.sin(angle) * radius;
        this.explosionManager.triggerExplosion(ex, ey);
        if (i % 2 === 0) {
          this.audio.playExplosion();
        }
      });
    }

    this.time.delayedCall(260, () => {
      if (!this.scene.isActive(this.scene.key)) return;
      this.cameras.main.flash(120, 255, 90, 220, false);
    });
  }

  private handlePlayerHitUFOProjectile(obj1: any, obj2: any) {
    const shot = (obj1 === this.player ? obj2 : obj1) as UFOProjectile;
    if (!shot.active) return;
    const hitX = shot.x;
    const hitY = shot.y;
    shot.disableBody(true, true);

    const proxyEnemy = {
      active: true,
      x: hitX,
      y: hitY,
      disableBody: () => undefined,
    } as unknown as Enemy;

    this.handlePlayerHitEnemy(this.player, proxyEnemy);
  }

  private handleBulletHitEnemy(obj1: any, obj2: any) {
    const bullet = obj1 as Bullet;
    const enemy = obj2 as Enemy;
    if (bullet.active && enemy.active) {
      const x = enemy.x;
      const y = enemy.y;
      const points = Math.floor(100 / enemy.scaleX);
      bullet.disableBody(true, true);
      this.powerUpDirector.onAsteroidDestroyed(enemy.x, enemy.y);
      this.enemyManager.splitAsteroid(enemy.x, enemy.y, enemy.scaleX);
      enemy.disableBody(true, true);
      this.enqueuePendingEnemyHit(x, y, points, 'bullet');
    }
  }

  public canSpawnBullet() {
    return this.bullets.countActive(true) < this.dynamicBulletCap;
  }

  public getDynamicBulletCap() {
    return this.dynamicBulletCap;
  }

  private updateDynamicBulletCap(delta: number) {
    this.bulletCapRefreshMs -= delta;
    if (this.bulletCapRefreshMs > 0) return;

    const maxCap = performanceMonitor.reducedParticles ? 56 : 96;
    const minCap = performanceMonitor.reducedParticles ? 16 : 28;
    const activeEnemies = this.enemyManager.enemies.countActive(true);
    const activeBullets = this.bullets.countActive(true);
    const enemyPressureDivisor = performanceMonitor.reducedParticles ? 26 : 40;
    const enemyPressure = Phaser.Math.Clamp(activeEnemies / enemyPressureDivisor, 0, 1);
    const fpsPressure = Phaser.Math.Clamp((58 - this.game.loop.actualFps) / 20, 0, 1);
    const bulletPressure = Phaser.Math.Clamp(activeBullets / Math.max(1, maxCap), 0, 1);
    const pressure = Math.max(enemyPressure, fpsPressure * 0.9, bulletPressure * 0.7);
    const targetCap = Math.round(Phaser.Math.Linear(maxCap, minCap, pressure));
    this.dynamicBulletCap = Phaser.Math.Clamp(
      Math.round(Phaser.Math.Linear(this.dynamicBulletCap, targetCap, 0.45)),
      minCap,
      maxCap,
    );
    this.bulletCapRefreshMs = 120;
  }

  private flushPendingEnemyHits() {
    if (this.pendingEnemyHits.length === 0) return;

    const hits = this.pendingEnemyHits;
    this.pendingEnemyHits = [];
    this.collisionPressureMetrics.flushedTotal += hits.length;
    this.collisionPressureMetrics.lastFlushHits = hits.length;
    this.collisionPressureMetrics.lastFlushSourceMix = this.getCollisionSourceMix(hits);

    const activeEnemies = this.enemyManager.enemies.countActive(true);
    const shouldCoalesce =
      performanceMonitor.reducedParticles ||
      hits.length >= 4 ||
      activeEnemies >= 30 ||
      this.game.loop.actualFps < 52;

    let totalPoints = 0;
    let clusterCount = 0;
    let explosionEmits = 0;
    let sfxBursts = 0;
    let droppedClusters = 0;
    if (shouldCoalesce) {
      this.collisionPressureMetrics.coalescedFlushes++;
      const clusterSize = 90;
      const clusters = this.hitClusterScratch;
      clusters.clear();
      for (const hit of hits) {
        totalPoints += hit.points;
        const clusterX = Math.floor(hit.x / clusterSize);
        const clusterY = Math.floor(hit.y / clusterSize);
        const key = clusterY * 1024 + clusterX;
        const cluster = clusters.get(key);
        if (cluster) {
          cluster.sumX += hit.x;
          cluster.sumY += hit.y;
          cluster.count += 1;
        } else {
          clusters.set(key, { sumX: hit.x, sumY: hit.y, count: 1 });
        }
      }

      const maxExplosions = performanceMonitor.reducedParticles ? 4 : 8;
      clusterCount = clusters.size;
      let emitted = 0;
      for (const cluster of clusters.values()) {
        if (emitted >= maxExplosions) break;
        this.explosionManager.triggerExplosion(
          cluster.sumX / Math.max(1, cluster.count),
          cluster.sumY / Math.max(1, cluster.count),
        );
        emitted++;
      }
      explosionEmits = emitted;
      droppedClusters = Math.max(0, clusterCount - emitted);

      if (emitted > 0) {
        const burstCount = hits.length >= 12 ? 2 : 1;
        for (let i = 0; i < burstCount; i++) {
          this.audio.playExplosion();
        }
        sfxBursts = burstCount;
      }
    } else {
      this.collisionPressureMetrics.directFlushes++;
      for (const hit of hits) {
        totalPoints += hit.points;
        this.explosionManager.triggerExplosion(hit.x, hit.y);
        this.audio.playExplosion();
      }
      clusterCount = hits.length;
      explosionEmits = hits.length;
      sfxBursts = hits.length;
    }

    this.collisionPressureMetrics.explosionEmitsTotal += explosionEmits;
    this.collisionPressureMetrics.sfxBurstsTotal += sfxBursts;
    this.collisionPressureMetrics.clusterDropsTotal += droppedClusters;
    this.collisionPressureMetrics.lastFlushClusters = clusterCount;
    this.collisionPressureMetrics.lastFlushExplosionEmits = explosionEmits;
    this.collisionPressureMetrics.lastFlushSfxBursts = sfxBursts;
    this.collisionPressureMetrics.lastFlushClusterDrops = droppedClusters;
    this.collisionPressureMetrics.lastFlushCoalesced = shouldCoalesce;

    if (totalPoints > 0) {
      this.addScore(totalPoints);
    }
  }

  public getCollisionPressureStats() {
    return {
      pendingHits: this.pendingEnemyHits.length,
      queuedTotal: this.collisionPressureMetrics.queuedTotal,
      queuedBulletTotal: this.collisionPressureMetrics.queuedBulletTotal,
      queuedEmpTotal: this.collisionPressureMetrics.queuedEmpTotal,
      flushedTotal: this.collisionPressureMetrics.flushedTotal,
      coalescedFlushes: this.collisionPressureMetrics.coalescedFlushes,
      directFlushes: this.collisionPressureMetrics.directFlushes,
      explosionEmitsTotal: this.collisionPressureMetrics.explosionEmitsTotal,
      sfxBurstsTotal: this.collisionPressureMetrics.sfxBurstsTotal,
      clusterDropsTotal: this.collisionPressureMetrics.clusterDropsTotal,
      pendingQueuePeak: this.collisionPressureMetrics.pendingQueuePeak,
      lastFlushHits: this.collisionPressureMetrics.lastFlushHits,
      lastFlushClusters: this.collisionPressureMetrics.lastFlushClusters,
      lastFlushExplosionEmits: this.collisionPressureMetrics.lastFlushExplosionEmits,
      lastFlushSfxBursts: this.collisionPressureMetrics.lastFlushSfxBursts,
      lastFlushClusterDrops: this.collisionPressureMetrics.lastFlushClusterDrops,
      lastFlushCoalesced: this.collisionPressureMetrics.lastFlushCoalesced,
      lastFlushSourceMix: this.collisionPressureMetrics.lastFlushSourceMix,
    };
  }

  private enqueuePendingEnemyHit(x: number, y: number, points: number, source: 'bullet' | 'emp') {
    this.pendingEnemyHits.push({ x, y, points, source });
    this.collisionPressureMetrics.queuedTotal += 1;
    if (source === 'emp') this.collisionPressureMetrics.queuedEmpTotal += 1;
    else this.collisionPressureMetrics.queuedBulletTotal += 1;
    if (this.pendingEnemyHits.length > this.collisionPressureMetrics.pendingQueuePeak) {
      this.collisionPressureMetrics.pendingQueuePeak = this.pendingEnemyHits.length;
    }
  }

  private resetCollisionPressureMetrics() {
    this.pendingEnemyHits.length = 0;
    this.collisionPressureMetrics.queuedTotal = 0;
    this.collisionPressureMetrics.queuedBulletTotal = 0;
    this.collisionPressureMetrics.queuedEmpTotal = 0;
    this.collisionPressureMetrics.flushedTotal = 0;
    this.collisionPressureMetrics.coalescedFlushes = 0;
    this.collisionPressureMetrics.directFlushes = 0;
    this.collisionPressureMetrics.explosionEmitsTotal = 0;
    this.collisionPressureMetrics.sfxBurstsTotal = 0;
    this.collisionPressureMetrics.clusterDropsTotal = 0;
    this.collisionPressureMetrics.pendingQueuePeak = 0;
    this.collisionPressureMetrics.lastFlushHits = 0;
    this.collisionPressureMetrics.lastFlushClusters = 0;
    this.collisionPressureMetrics.lastFlushExplosionEmits = 0;
    this.collisionPressureMetrics.lastFlushSfxBursts = 0;
    this.collisionPressureMetrics.lastFlushClusterDrops = 0;
    this.collisionPressureMetrics.lastFlushCoalesced = false;
    this.collisionPressureMetrics.lastFlushSourceMix = 'none';
  }

  private getCollisionSourceMix(hits: PendingEnemyHit[]): CollisionSourceMix {
    let hasBullet = false;
    let hasEmp = false;
    for (const hit of hits) {
      if (hit.source === 'bullet') hasBullet = true;
      if (hit.source === 'emp') hasEmp = true;
      if (hasBullet && hasEmp) return 'mixed';
    }
    if (hasBullet) return 'bullet';
    if (hasEmp) return 'emp';
    return 'none';
  }

  private handlePlayerHitEnemy(_obj1: any, obj2: any) {
    if (this.isGameOver || this.isSwitching || this.isLevelTransition) return;
    const enemy = obj2 as Enemy;
    if (!enemy.active) return;
    if (this.player.getShieldActive()) {
      this.player.setShield(false);
      this.activePowerUps.delete(PowerUpType.SHIELD);
      this.explosionManager.triggerExplosion(enemy.x, enemy.y);
      this.audio.playExplosion();
      enemy.disableBody(true, true);
      return;
    }
    enemy.disableBody(true, true);
    this.lives -= 1;
    if (this.playerStates[this.activePlayerIndex]) {
      this.playerStates[this.activePlayerIndex].lives = this.lives;
    }
    this.updateHUD();
    this.explosionManager.triggerPlayerDeathExplosion(this.player.x, this.player.y);
    this.audio.playPlayerDeath();
    this.cameras.main.shake(500, 0.04);
    this.powerUpDirector.resetDamageFreeTime();

    if (this.playerCount === 1) {
      if (this.lives <= 0) {
        this.endGame();
      } else {
        this.player.setAlpha(0.5);
        this.player.body!.enable = false;
        this.tweens.add({
          targets: this.player,
          alpha: 0,
          duration: 100,
          yoyo: true,
          repeat: 10,
          onComplete: () => {
            this.player.setAlpha(1);
            this.player.body!.enable = true;
          },
        });
      }
      return;
    }

    this.saveActivePlayerState();
    if (this.areAllPlayersDead()) {
      this.endGame();
      return;
    }
    const nextIndex = this.getNextPlayerIndex();
    this.clearCurrentPowerUps();
    this.queueTurnSwitch(nextIndex);
  }

  private areAllPlayersDead() {
    return this.playerStates.every((state) => state.lives <= 0);
  }

  private getNextPlayerIndex() {
    for (let i = 1; i <= this.playerCount; i++) {
      const index = (this.activePlayerIndex + i) % this.playerCount;
      if (this.playerStates[index].lives > 0) return index;
    }
    return this.activePlayerIndex;
  }

  private endGame() {
    this.isGameOver = true;
    this.finishLevelTransitionCountdown(false);
    this.ufo.setCombatTarget(null);
    this.ufo.deactivate();
    this.clearWorldEvents('reset');
    this.player.setActive(false).setVisible(false);
    this.saveActivePlayerState();
    this.switchTimer?.remove(false);
    this.time.delayedCall(1500, () => {
      this.scene.stop('PauseScene');
      this.scene.start('GameOverScene', {
        scores: this.playerStates.map((state) => state.score),
        players: this.playerCount,
        difficulty: this.difficultyKey,
      });
    });
  }

  private createHUD() {
    const style = {
      fontFamily: '"Press Start 2P"',
      fontSize: '20px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 4,
    };
    const smallStyle = {
      fontFamily: '"Press Start 2P"',
      fontSize: '14px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 3,
    };
    if (this.playerCount === 2) {
      this.p1ScoreText = this.add.text(30, 30, 'P1 SCORE: 0', style).setDepth(100);
      this.p2ScoreText = this.add
        .text(GAME_WIDTH - 30, 30, 'P2 SCORE: 0', style)
        .setOrigin(1, 0)
        .setDepth(100);
      this.p1LivesText = this.add.text(30, 60, 'P1 LIVES: 3', smallStyle).setDepth(100);
      this.p2LivesText = this.add
        .text(GAME_WIDTH - 30, 60, 'P2 LIVES: 3', smallStyle)
        .setOrigin(1, 0)
        .setDepth(100);
      this.activeMarkerLeft = this.add.text(8, 30, '>', style).setDepth(101);
      this.activeMarkerRight = this.add
        .text(GAME_WIDTH - 8, 30, '<', style)
        .setOrigin(1, 0)
        .setDepth(101);
    } else {
      this.p1ScoreText = this.add.text(30, 30, 'SCORE: 0', style).setDepth(100);
      this.p1LivesText = this.add
        .text(GAME_WIDTH - 30, 30, 'LIVES: 3', style)
        .setOrigin(1, 0)
        .setDepth(100);
    }
    this.levelText = this.add
      .text(GAME_WIDTH / 2, 30, 'LEVEL 1', {
        fontFamily: '"Press Start 2P"',
        fontSize: '16px',
        color: '#ffd966',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5, 0)
      .setDepth(100);
    const debugY = this.playerCount === 2 ? 90 : 78;
    const powerY = this.playerCount === 2 ? 130 : 118;
    this.debugText = this.add
      .text(30, debugY, '', { fontFamily: '"Press Start 2P"', fontSize: '12px', color: '#00ff00' })
      .setDepth(100);
    this.powerUpListText = this.add
      .text(30, powerY, '', { fontFamily: '"Press Start 2P"', fontSize: '14px', color: '#00ffff' })
      .setDepth(100);
    this.perkText = this.add
      .text(30, powerY + 58, 'PERKS L+0 C+0 M+0', {
        fontFamily: '"Press Start 2P"',
        fontSize: '11px',
        color: '#9effd0',
      })
      .setDepth(100);
    const pauseBtn = this.add
      .text(GAME_WIDTH - 30, 80, '|| PAUSE', {
        fontFamily: '"Press Start 2P"',
        fontSize: '16px',
        color: '#ffffff',
        backgroundColor: '#333333',
        padding: { x: 10, y: 10 },
      })
      .setOrigin(1, 0)
      .setInteractive({ useHandCursor: true })
      .setDepth(100);
    pauseBtn.on('pointerdown', () => this.requestPause());

    const helpBtn = this.add
      .text(GAME_WIDTH - 30, 130, 'H', {
        fontFamily: '"Press Start 2P"',
        fontSize: '16px',
        color: '#ffffff',
        backgroundColor: '#333333',
        padding: { x: 10, y: 10 },
      })
      .setOrigin(1, 0)
      .setInteractive({ useHandCursor: true })
      .setDepth(100);
    helpBtn.on('pointerdown', () => this.openHelp());
    this.input.keyboard?.on('keydown-P', () => this.requestPause());
    this.input.keyboard?.on('keydown-ESC', () => this.requestPause());
    this.input.keyboard?.on('keydown-H', () => this.openHelp());

    this.onBlur = () => this.requestPause();
    this.onVisibilityChange = () => {
      if (document.hidden) this.requestPause();
    };
    this.game.events.on('blur', this.onBlur);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
  }

  private requestPause() {
    if (
      this.isGameOver ||
      this.isSwitching ||
      this.isLevelTransition ||
      this.scene.isPaused('MainScene') ||
      !this.scene.isActive('MainScene')
    )
      return;
    this.audio.pauseAll();
    this.scene.pause();
    this.scene.launch('PauseScene');
  }

  private openHelp() {
    if (
      this.isGameOver ||
      this.isSwitching ||
      this.isLevelTransition ||
      this.scene.isPaused('MainScene') ||
      this.scene.isActive('HelpScene')
    )
      return;
    this.scene.launch('HelpScene', { returnScene: this.scene.key });
    this.scene.pause();
  }

  private createGraphics() {
    const starG = this.add.graphics();
    starG.setVisible(false);
    starG.fillStyle(0xffffff, 1);
    starG.fillRect(0, 0, 2, 2);
    starG.generateTexture('star', 2, 2);
    starG.destroy();
    const bulletG = this.add.graphics();
    bulletG.setVisible(false);
    bulletG.fillStyle(0xffff00, 1);
    bulletG.fillRect(0, 0, 8, 20);
    bulletG.generateTexture('bullet', 8, 20);
    bulletG.destroy();

    if (!this.textures.exists('ufo_shard')) {
      const shardG = this.add.graphics();
      shardG.fillStyle(0xffffff, 1);
      shardG.beginPath();
      shardG.moveTo(8, 0);
      shardG.lineTo(14, 6);
      shardG.lineTo(10, 16);
      shardG.lineTo(2, 14);
      shardG.lineTo(0, 6);
      shardG.closePath();
      shardG.fillPath();
      shardG.lineStyle(1, 0xd7f8ff, 1);
      shardG.strokePath();
      shardG.generateTexture('ufo_shard', 16, 16);
      shardG.destroy();
    }

    if (!this.textures.exists('elite_drone')) {
      const droneG = this.add.graphics();
      droneG.fillStyle(0x103f2a, 0.95);
      droneG.lineStyle(2, 0xa2ffd8, 1);
      droneG.fillRoundedRect(2, 6, 28, 16, 8);
      droneG.strokeRoundedRect(2, 6, 28, 16, 8);
      droneG.lineStyle(1, 0xd6fff1, 0.9);
      droneG.strokeCircle(16, 14, 4);
      droneG.beginPath();
      droneG.moveTo(6, 14);
      droneG.lineTo(26, 14);
      droneG.strokePath();
      droneG.fillStyle(0x8affef, 0.95);
      droneG.fillCircle(16, 4, 2.4);
      droneG.generateTexture('elite_drone', 32, 28);
      droneG.destroy();
    }
  }

  private createStarfield() {
    const reduced = performanceMonitor.reducedParticles;
    this.add.particles(0, 0, 'star', {
      x: { min: 0, max: GAME_WIDTH },
      y: -50,
      quantity: reduced ? 1 : 2,
      frequency: reduced ? 200 : 100,
      lifespan: 4000,
      speedY: { min: 200, max: 400 },
      scale: { min: 0.5, max: 1.5 },
      alpha: { min: 0.1, max: 0.8 },
      emitting: true,
    });
  }

  public getDifficultyState() {
    const bossActive = this.ufo?.active && this.ufo.getVariant() === 'boss';
    const state = this.playerStates[this.activePlayerIndex];
    return {
      preset: this.difficultyKey,
      presetLabel: this.difficultyPreset.label,
      level: this.level,
      progressionScore: this.progressionScore,
      nextLevelScore: this.nextLevelScore,
      scoreToBoss: Math.max(0, this.nextLevelScore - this.progressionScore),
      bossPending: this.levelBossPendingDefeat,
      bossEnergy: bossActive ? this.ufo.getHealth() : 0,
      bossEnergyMax: bossActive ? this.ufo.getMaxHealth() : 0,
      transition: {
        active: this.isLevelTransition,
        countdown: this.levelTransitionCountdownLabel,
      },
      perks: {
        lifeBonus: state?.eliteLifePerkCount ?? 0,
        coolingLevel: state?.eliteCoolingPerkLevel ?? 0,
        magnetLevel: state?.eliteMagnetPerkLevel ?? 0,
      },
      worldEvents: {
        wormholeActive: Boolean(this.wormhole?.active),
        eliteDroneActive: Boolean(this.eliteDrone?.active),
      },
    };
  }

  private pickUFOVariantForLevel(): UFOVariant {
    // Bosses are strictly end-of-level encounters and must never spawn mid-level.
    return 'scout';
  }

  private computeNextUFOSpawnDelay(lastVariant?: UFOVariant) {
    const levelRamp = (this.level - 1) * 560;
    const rateScale = Phaser.Math.Clamp(1 / this.difficultyPreset.ufoSpawnRateScale, 0.62, 1.34);
    const minBase = Math.max(5200, Math.round((12200 - levelRamp) * rateScale));
    const maxBase = Math.max(minBase + 2600, Math.round((18800 - levelRamp) * rateScale));
    if (lastVariant === 'boss') {
      return Phaser.Math.Between(minBase + 2500, maxBase + 4200);
    }
    return Phaser.Math.Between(minBase, maxBase);
  }

  private getNextLevelScore(level: number) {
    const ramp = Math.max(0, level - 1);
    const requirement = 3400 + ramp * 1700 + Math.pow(ramp, 1.28) * 520;
    return Math.round(requirement * this.difficultyPreset.levelCurveScale);
  }

  private getPowerUpDuration(type: PowerUpType) {
    const base = type === PowerUpType.CANNON_COOLING ? 9000 : 7000;
    const durationScale = Phaser.Math.Clamp(1 - (this.level - 1) * 0.04, 0.64, 1);
    return Math.round(base * durationScale * this.difficultyPreset.powerUpDurationScale);
  }
}
