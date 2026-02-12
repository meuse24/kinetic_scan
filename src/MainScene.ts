import Phaser from 'phaser';
import { Player, Bullet } from './Player';
import { EnemyManager, Enemy } from './EnemyManager';
import { ExplosionManager } from './ExplosionManager';
import { AudioManager } from './AudioManager';
import { UFO, UFOProjectile } from './UFO';
import type { UFOVariant, BossModifier } from './UFO';
import { SkyRaiderManager, SkyRaider, SkyRaiderShot } from './SkyRaider';
import type { SkyRaiderVariant } from './SkyRaider';
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
  BACKGROUND_DECOR_TUNING,
  EARLY_LEVEL_TUNING,
  ELITE_DRONE_TUNING,
  JUICE_TUNING,
  LEVEL_BONUS_TUNING,
  LEVEL_PROGRESS_TUNING,
  LEVEL_TRANSITION_TUNING,
  MILESTONE_TUNING,
  SHIELD_BUNKER_TUNING,
  SWARM_TUNING,
  SPAWN_PROTECTION_TUNING,
  WORMHOLE_TUNING,
  pickEliteDroneSpawnDelayRange,
  type BackgroundDecorTier,
  type EliteDroneDeactivateReason,
  type IntRange,
} from './MainSceneTuning';
import { ComboManager } from './ComboManager';
import type { ComboState } from './ComboManager';
import { PerkSystem } from './PerkSystem';
import { statsManager } from './StatsManager';
import { isDebugOverlayEnabled, setDebugOverlayEnabled } from './DebugSettings';
import SceneBackground from './SceneBackground';
import { CollisionManager } from './managers/CollisionManager';
import type { CollisionCallbacks } from './managers/CollisionManager';
import { HUDManager } from './managers/HUDManager';
import type { HUDComponents, HUDState, HUDManagerConfig } from './managers/HUDManager';
import { PowerUpManager } from './managers/PowerUpManager';
import type { PowerUpCallbacks, PowerUpManagerConfig } from './managers/PowerUpManager';

interface PlayerState {
  score: number;
  lives: number;
  activePowerUps: Map<PowerUpType, number>;
  powerUpTimer: number;
  mineDeployCharges: number;
  mineStockPerkApplied: number;
  eliteLifePerkCount: number;
  eliteCoolingPerkLevel: number;
  eliteMagnetPerkLevel: number;
  comboState: ComboState;
  perkState: [string, number][];
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

interface BackgroundDecorState {
  sprite: Phaser.GameObjects.Image;
  vx: number;
  vy: number;
  spin: number;
}

interface NebulaLayerState {
  sprite: Phaser.GameObjects.TileSprite;
  vx: number;
  vy: number;
  baseAlpha: number;
  alphaWave: number;
  phase: number;
}

interface MineState {
  targetX: number;
  targetY: number;
  armed: boolean;
  pulsePhase: number;
}

type MainSceneData = {
  players?: number;
  difficulty?: DifficultyPresetKey;
  dailySeed?: string;
};

interface PendingEnemyHit {
  x: number;
  y: number;
  points: number;
  source: 'bullet' | 'emp';
}

interface LevelBonusPayout {
  completedLevel: number;
  asteroidKills: number;
  specialKills: number;
  asteroidPoints: number;
  specialPoints: number;
  totalPoints: number;
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

const IMPACT_RING_TEXTURE_KEY = 'impact_ring';
const IMPACT_RING_TEXTURE_SIZE = 256;
const IMPACT_RING_TEXTURE_RADIUS = 120;
const IMPACT_RING_POOL_SIZE = 96;
const WINGMAN_DRONE_TEXTURE_KEY = 'wingman_drone';
const PROXIMITY_MINE_TEXTURE_KEY = 'proximity_mine';
const PROXIMITY_MINE_POOL_SIZE = 48;
const PROXIMITY_MINE_DEPLOY_COUNT = 5;
const INITIAL_MINE_DEPLOY_CHARGES = 2;

export default class MainScene extends Phaser.Scene {
  private player!: Player;
  private bullets!: Phaser.Physics.Arcade.Group;
  private proximityMines!: Phaser.Physics.Arcade.Group;
  private mineStates: Map<Phaser.Physics.Arcade.Image, MineState> = new Map();
  private shieldBunkers!: Phaser.Physics.Arcade.StaticGroup;
  public enemyManager!: EnemyManager;
  private explosionManager!: ExplosionManager;
  public audio!: AudioManager;
  private ufo!: UFO;
  private skyRaiderManager!: SkyRaiderManager;
  private powerUpDirector!: PowerUpDirector;
  private comboManager!: ComboManager;
  private perkSystem!: PerkSystem;
  private collisionManager!: CollisionManager;
  private hudManager!: HUDManager;
  private powerUpManager!: PowerUpManager;

  private score: number = 0;
  private lives: number = 3;
  private difficultyKey: DifficultyPresetKey = getCurrentDifficultyKey();
  private difficultyPreset: DifficultyPreset = getDifficultyPreset();
  private level: number = 1;
  private progressionScore: number = 0;
  private nextLevelScore: number = 2500;
  private levelBossPendingDefeat: boolean = false;
  private levelAsteroidKillCount: number = 0;
  private levelSpecialKillCount: number = 0;
  private levelStartScore: number = 0;
  private levelElapsedMs: number = 0;
  private earlySupportDropGranted: boolean = false;
  private earlySupportDropTimerMs: number = 0;
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
  private levelTransitionWarpGraphics!: Phaser.GameObjects.Graphics;
  private levelTransitionWarpTween?: Phaser.Tweens.Tween;
  private levelBonusPayoutTween?: Phaser.Tweens.Tween;
  private levelTransitionEvents: Phaser.Time.TimerEvent[] = [];
  private levelTransitionCountdownLabel: string = '';
  private awaitingTurnInput: boolean = false;
  private turnKeyHandler?: (event: KeyboardEvent) => void;
  private turnPointerHandler?: () => void;
  private mineDeployPointerHandler?: (
    pointer: Phaser.Input.Pointer,
    currentlyOver: Phaser.GameObjects.GameObject[],
  ) => void;
  private onScenePaused?: () => void;
  private onSceneResumed?: () => void;
  private onBlur?: () => void;
  private onHidden?: () => void;

  private useHighEndVFX: boolean = false;
  private slowMoOverlay!: Phaser.GameObjects.Rectangle;
  private slowMoActive: boolean = false;
  private slowMoColorMatrixFx: Phaser.FX.ColorMatrix | null = null;
  private gpuName: string = '';

  private powerUpTimer: number = 0; // UFO Magnetic
  private ufoSpawnTimer: number = 0;
  private isGameOver: boolean = false;

  private drones: Phaser.GameObjects.Group | null = null;
  private impactRingPool!: Phaser.GameObjects.Group;
  private impactRingTweens: Map<Phaser.GameObjects.Image, Phaser.Tweens.Tween> = new Map();
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
  private wormholeVisualAccumulatorMs: number = 0;
  private eliteDrone!: Phaser.Physics.Arcade.Sprite;
  private eliteDroneLabel!: Phaser.GameObjects.Text;
  private eliteDroneSpawnTimer: number = 0;
  private eliteDroneLifetimeMs: number = 0;
  private empGraphics!: Phaser.GameObjects.Graphics;
  private backgroundDecorTier: BackgroundDecorTier = 'off';
  private backgroundDecorSpawnTimerMs: number = 0;
  private backgroundDecor: BackgroundDecorState[] = [];
  private nebulaLayers: NebulaLayerState[] = [];
  private nebulaProfileKey: string = 'off';

  private p1ScoreText!: Phaser.GameObjects.Text;
  private p2ScoreText?: Phaser.GameObjects.Text;
  private p1LivesText!: Phaser.GameObjects.Text;
  private p2LivesText?: Phaser.GameObjects.Text;
  private mineChargesText!: Phaser.GameObjects.Text;
  private mineDeployHintText!: Phaser.GameObjects.Text;
  private activeMarkerLeft?: Phaser.GameObjects.Text;
  private activeMarkerRight?: Phaser.GameObjects.Text;
  private debugOverlayEnabled: boolean = false;
  private debugRefreshMs: number = 0;
  private lastDebugLine: string = '';
  private lastDebugStatsLine: string = '';
  // powerUpTextRefreshMs, lastPowerUpList moved to PowerUpManager
  private powerUpBarRefreshMs: number = 0;
  private heatBarRefreshMs: number = 0;
  private blackHoleForceAccumulatorMs: number = 0;
  private blackHoleVisualAccumulatorMs: number = 0;
  // activeStateSyncMs moved to PowerUpManager
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
  private debugStatsText!: Phaser.GameObjects.Text;
  private powerUpBar!: Phaser.GameObjects.Graphics;
  private powerUpListText!: Phaser.GameObjects.Text;
  private perkText!: Phaser.GameObjects.Text;
  private damageOverlay!: Phaser.GameObjects.Rectangle;
  private damageOverlayTween?: Phaser.Tweens.Tween;
  private heatBar!: Phaser.GameObjects.Graphics;
  private levelText!: Phaser.GameObjects.Text;
  private milestoneIndex: number = 0;
  private milestoneText!: Phaser.GameObjects.Text;
  private swarmSpawnTimerMs: number = 0;
  private swarmKills: Map<number, number> = new Map();
  private summonerTimerMs: number = 0;
  private dailySeed: string = '';
  private passiveCoolingMultiplier: number = 1;
  private magneticDurationMultiplier: number = 1;
  private smokeEmitter: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  private playerTrailEmitter: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  private enemyTrailEmitter: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  private trailEmitAccumulatorMs: number = 0;
  private spawnProtectionTimerMs: number = 0;
  private spawnProtectionTween?: Phaser.Tweens.Tween;
  private shieldBunkerWarningStarted: boolean = false;
  private shieldBunkerWarningTween?: Phaser.Tweens.Tween;
  private mineDeployCharges: number = INITIAL_MINE_DEPLOY_CHARGES;
  private lastMineDeployTapAt: number = -10000;
  private lastMineDeployTapX: number = -1000;
  private lastMineDeployTapY: number = -1000;
  private readonly mineDeployDoubleTapWindowMs: number = 320;
  private readonly mineDeployDoubleTapMaxDistancePx: number = 72;
  private mineDeployHintCooldownUntil: number = 0;
  private lastPlayerRecoilAt: number = -1000;
  private hitStopTimer?: Phaser.Time.TimerEvent;
  private hitStopCooldownUntil: number = 0;
  private sceneBackground?: SceneBackground;

  constructor() {
    super('MainScene');
  }

  init(data: MainSceneData) {
    this.playerCount = data?.players === 2 ? 2 : 1;
    this.difficultyKey = resolveDifficultyKey(data?.difficulty ?? null);
    setCurrentDifficultyKey(this.difficultyKey);
    this.difficultyPreset = getDifficultyPreset(this.difficultyKey);
    this.dailySeed = data?.dailySeed ?? '';
    if (this.dailySeed) {
      Phaser.Math.RND.sow([this.dailySeed]);
    }
    this.activePlayerIndex = 0;
    this.debugOverlayEnabled = isDebugOverlayEnabled();
    this.level = 1;
    this.progressionScore = 0;
    this.nextLevelScore = this.getNextLevelScore(1);
    this.levelBossPendingDefeat = false;
    this.levelAsteroidKillCount = 0;
    this.levelSpecialKillCount = 0;
    this.milestoneIndex = 0;
    this.levelStartScore = 0;
    this.levelElapsedMs = 0;
    this.earlySupportDropGranted = false;
    this.earlySupportDropTimerMs = 0;
    this.powerUpBarRefreshMs = 0;
    this.heatBarRefreshMs = 0;
    this.lastDebugStatsLine = '';
    this.passiveCoolingMultiplier = 1;
    this.magneticDurationMultiplier = 1;
    this.spawnProtectionTimerMs = 0;
    this.spawnProtectionTween = undefined;
    this.shieldBunkerWarningStarted = false;
    this.shieldBunkerWarningTween = undefined;
    this.mineDeployCharges = INITIAL_MINE_DEPLOY_CHARGES;
    this.lastMineDeployTapAt = -10000;
    this.lastMineDeployTapX = -1000;
    this.lastMineDeployTapY = -1000;
    this.mineDeployHintCooldownUntil = 0;
    this.mineStates.clear();
    this.lastPlayerRecoilAt = -1000;
    this.trailEmitAccumulatorMs = 0;
    this.backgroundDecorTier = 'off';
    this.backgroundDecorSpawnTimerMs = 0;
    this.backgroundDecor = [];
    this.nebulaLayers = [];
    this.nebulaProfileKey = 'off';
    this.wormholeVisualAccumulatorMs = 0;
    this.blackHoleVisualAccumulatorMs = 0;
    this.levelBonusPayoutTween = undefined;
    this.playerStates = [];
    for (let i = 0; i < this.playerCount; i++) {
      this.playerStates.push({
        score: 0,
        lives: 3,
        activePowerUps: new Map(),
        powerUpTimer: 0,
        mineDeployCharges: INITIAL_MINE_DEPLOY_CHARGES,
        mineStockPerkApplied: 0,
        eliteLifePerkCount: 0,
        eliteCoolingPerkLevel: 0,
        eliteMagnetPerkLevel: 0,
        comboState: { comboCount: 0, multiplier: 1, lastKillTime: 0 },
        perkState: [],
      });
    }
  }

  preload() {
    SceneBackground.preload(this);
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
    musicManager.playGameplay(this);
    this.onScenePaused = () => musicManager.pauseGameplay();
    this.onSceneResumed = () => musicManager.resumeGameplay();
    this.events.on(Phaser.Scenes.Events.PAUSE, this.onScenePaused);
    this.events.on(Phaser.Scenes.Events.RESUME, this.onSceneResumed);
    this.isGameOver = false;
    this.isSwitching = false;
    this.isLevelTransition = false;
    this.levelTransitionCountdownLabel = '';
    this.levelBonusPayoutTween = undefined;
    const startingState = this.playerStates[this.activePlayerIndex] ?? {
      score: 0,
      lives: 3,
      activePowerUps: new Map(),
      powerUpTimer: 0,
      mineDeployCharges: INITIAL_MINE_DEPLOY_CHARGES,
      mineStockPerkApplied: 0,
      eliteLifePerkCount: 0,
      eliteCoolingPerkLevel: 0,
      eliteMagnetPerkLevel: 0,
      comboState: { comboCount: 0, multiplier: 1, lastKillTime: 0 },
      perkState: [],
    };
    this.score = startingState.score;
    this.lives = startingState.lives;
    this.powerUpTimer = startingState.powerUpTimer;
    this.mineDeployCharges = startingState.mineDeployCharges ?? INITIAL_MINE_DEPLOY_CHARGES;
    // activePowerUps loaded into PowerUpManager after it's created (line ~4097)
    if (!this.scene.isActive('BezelScene')) {
      this.scene.launch('BezelScene');
    }
    this.scene.bringToTop('BezelScene');
    this.sceneBackground = new SceneBackground(this, {
      depth: -120,
      alpha: 0.54,
      maxOffsetX: 42,
      maxOffsetY: 28,
    });
    this.createGraphics();
    this.createImpactRingPool();
    this.createStarfield();
    this.createProjectileTrailEmitters();
    this.input.addPointer(2);
    this.bullets = this.physics.add.group({
      classType: Bullet,
      runChildUpdate: true,
      maxSize: 100,
    });
    this.proximityMines = this.physics.add.group({
      classType: Phaser.Physics.Arcade.Image,
      maxSize: PROXIMITY_MINE_POOL_SIZE,
    });
    this.shieldBunkers = this.physics.add.staticGroup();
    this.player = new Player(this, GAME_WIDTH / 2, GAME_HEIGHT - 100, this.bullets);
    this.player.updateBounds(GAME_WIDTH, GAME_HEIGHT);
    this.sceneBackground.resetPlayerTracking(this.player.x, this.player.y);
    this.enemyManager = new EnemyManager(this);
    this.explosionManager = new ExplosionManager(this);
    this.ufo = new UFO(this, this.audio, { combatEnabled: true });
    this.ufo.setCombatTarget(this.player);
    this.ufo.setEvasionThreatGroup(this.bullets);
    this.ufo.setReducedVisualDetail(performanceMonitor.reducedParticles);
    this.skyRaiderManager = new SkyRaiderManager(this, this.audio);
    this.skyRaiderManager.setCombatTarget(this.player);
    this.powerUpDirector = new PowerUpDirector(this);
    this.comboManager = new ComboManager(this);
    this.perkSystem = new PerkSystem();
    statsManager.onGameStart();
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
    this.configureBackgroundDecor(true);

    this.slowMoOverlay = this.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x0000ff, 0)
      .setDepth(5);
    this.wormholeGraphics = this.add.graphics().setDepth(35);
    this.wormholeGraphics.setVisible(false);
    this.empGraphics = this.add.graphics().setDepth(10);
    this.createEliteDroneEntity();
    this.resetWorldEventTimers();
    // Create graphics before HUD so they can be passed to HUDManager
    this.powerUpBar = this.add.graphics();
    this.heatBar = this.add.graphics().setDepth(120);
    this.createHUD();
    this.createDamageOverlay();
    this.createTurnOverlay();
    this.createLevelTransitionOverlay();
    this.createSmokeEmitter();
    this.applyPassivePerksFromActiveState();
    this.updateHUDDisplay();
    this.powerUpManager.reapplyAll(true);
    this.resetLevelOpeningState();
    this.applySpawnProtection(SPAWN_PROTECTION_TUNING.startGraceMs, true);
    this.showTutorialHints();
    this.ufoSpawnTimer = this.computeNextUFOSpawnDelay();
    this.skyRaiderManager.resetSpawnController(Phaser.Math.Between(1800, 3200));

    // Initialize CollisionManager with callbacks to existing handler methods
    const collisionCallbacks: CollisionCallbacks = {
      onBulletHitEnemy: (bullet, enemy) => this.handleBulletHitEnemy(bullet, enemy),
      onBulletHitUFO: (bullet, ufo) => this.handleBulletHitUFO(bullet, ufo),
      onBulletHitEliteDrone: (bullet, drone) => this.handleBulletHitEliteDrone(bullet, drone),
      onBulletHitSkyRaider: (bullet, raider) => this.handleBulletHitSkyRaider(bullet, raider),
      onBulletHitShieldBunker: (bullet, bunker) => this.handleBulletHitShieldBunker(bullet, bunker),
      onPlayerHitEnemy: (player, enemy) => this.handlePlayerHitEnemy(player, enemy),
      onPlayerHitPowerUp: (player, powerUp) => this.handlePlayerHitPowerUp(player, powerUp),
      onPlayerRescueEliteDrone: (player, drone) => this.handlePlayerRescueEliteDrone(player, drone),
      onPlayerHitUFOProjectile: (player, projectile) =>
        this.handlePlayerHitUFOProjectile(player, projectile),
      onPlayerHitSkyRaider: (player, raider) => this.handlePlayerHitSkyRaider(player, raider),
      onPlayerHitSkyRaiderShot: (player, shot) => this.handlePlayerHitSkyRaiderShot(player, shot),
      onMineHitEnemy: (mine, enemy) => this.handleMineHitEnemy(mine, enemy),
      onMineHitUFO: (mine, ufo) => this.handleMineHitUFO(mine, ufo),
      onMineHitSkyRaider: (mine, raider) => this.handleMineHitSkyRaider(mine, raider),
      onAsteroidHitShieldBunker: (enemy, bunker) =>
        this.handleAsteroidHitShieldBunker(enemy, bunker),
      onUFOProjectileHitShieldBunker: (projectile, bunker) =>
        this.handleUFOProjectileHitShieldBunker(projectile, bunker),
      onSkyRaiderHitShieldBunker: (raider, bunker) =>
        this.handleSkyRaiderHitShieldBunker(raider, bunker),
      onSkyRaiderShotHitShieldBunker: (shot, bunker) =>
        this.handleSkyRaiderShotHitShieldBunker(shot, bunker),
    };

    this.collisionManager = new CollisionManager(this, collisionCallbacks);

    // Register all collisions
    this.collisionManager.registerCollisions({
      bullets: this.bullets,
      player: this.player,
      enemies: this.enemyManager.enemies,
      ufo: this.ufo,
      powerUps: this.powerUpDirector.getGroup(),
      eliteDrone: this.eliteDrone,
      ufoProjectiles: this.ufo.getProjectiles() || undefined,
      shieldBunkers: this.shieldBunkers,
      proximityMines: this.proximityMines,
      skyRaiders: this.skyRaiderManager.getRaiders(),
      skyRaiderProjectiles: this.skyRaiderManager.getProjectiles(),
    });

    // Apply CRT Shader Pipeline
    if (
      performanceMonitor.crtEnabled &&
      this.game.renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer
    ) {
      this.cameras.main.setPostPipeline('CRTPipeline');
    }

    // Cleanup on scene shutdown

    this.events.once('shutdown', () => {
      const safeClearGroup = (group: any) => {
        if (!group || typeof group.clear !== 'function') return;
        if (!group.children || typeof group.children.size !== 'number') return;
        try {
          group.clear(true, true);
        } catch {
          // Ignore teardown races during scene shutdown.
        }
      };

      const safeDestroyGroup = (group: any) => {
        if (!group || typeof group.destroy !== 'function') return;
        try {
          group.destroy(true);
        } catch {
          // Ignore teardown races during scene shutdown.
        }
      };

      this.sceneBackground?.destroy();
      this.sceneBackground = undefined;
      this.finishLevelTransitionCountdown(false);
      this.ufo.deactivate();
      this.skyRaiderManager.deactivateAll();
      this.removeDrones();
      safeDestroyGroup(this.drones as any);
      this.drones = null;
      this.clearProximityMines();
      safeClearGroup(this.proximityMines as any);
      this.removeBlackHole();
      this.impactRingTweens.forEach((tween) => tween.stop());
      this.impactRingTweens.clear();
      safeClearGroup(this.impactRingPool as any);
      this.audio.destroy();
      musicManager.stopGameplay();
      this.clearWorldEvents('reset');
      this.pendingEnemyHits.length = 0;
      this.stopShieldBunkerWarning(false);
      const bunkerGroup = this.shieldBunkers as any;
      safeClearGroup(bunkerGroup);
      this.comboManager.destroy();
      this.hudManager.cleanup();
      this.powerUpManager.cleanup();
      this.powerUpBar.destroy();
      this.heatBar.destroy();
      this.damageOverlayTween?.stop();
      this.damageOverlay?.destroy();
      if (this.slowMoColorMatrixFx) {
        this.cameras.main.postFX.remove(
          this.slowMoColorMatrixFx as unknown as Phaser.FX.Controller,
        );
        this.slowMoColorMatrixFx = null;
      }
      this.smokeEmitter?.destroy();
      this.playerTrailEmitter?.destroy();
      this.enemyTrailEmitter?.destroy();
      this.stopSpawnProtectionVisuals();
      this.clearBackgroundDecor();
      this.clearNebulaLayers();
      this.wormholeGraphics.destroy();
      this.eliteDroneLabel.destroy();
      this.eliteDrone.destroy();
      this.perkText.destroy();
      this.empGraphics.destroy();
      this.slowMoOverlay.destroy();
      safeDestroyGroup(bunkerGroup);
      this.switchTimer?.remove(false);
      this.hitStopTimer?.remove(false);
      this.levelTransitionWarpTween?.stop();
      this.levelBonusPayoutTween?.stop();
      this.switchOverlay?.destroy();
      this.levelTransitionOverlay?.destroy();
      if (this.onScenePaused) this.events.off(Phaser.Scenes.Events.PAUSE, this.onScenePaused);
      if (this.onSceneResumed) this.events.off(Phaser.Scenes.Events.RESUME, this.onSceneResumed);
      if (this.turnKeyHandler) this.input.keyboard?.off('keydown', this.turnKeyHandler);
      if (this.turnPointerHandler) this.input.off('pointerdown', this.turnPointerHandler);
      if (this.mineDeployPointerHandler)
        this.input.off('pointerdown', this.mineDeployPointerHandler);
      if (this.onBlur) this.game.events.off('blur', this.onBlur);
      if (this.onHidden) this.game.events.off(Phaser.Core.Events.HIDDEN, this.onHidden);
      this.skyRaiderManager.destroy();
    });
  }

  update(time: number, delta: number) {
    if (this.isSwitching || this.isLevelTransition) {
      this.ufo.setCombatTarget(null);
      this.skyRaiderManager.setCombatTarget(null);
      this.sceneBackground?.updateIdle(delta);
      return;
    }
    this.ufo.setCombatTarget(this.player.active ? this.player : null);
    this.skyRaiderManager.setCombatTarget(this.player.active ? this.player : null);
    this.updateLevelOpeningBalance(delta);
    this.updateSpawnProtection(delta);
    this.updateGuaranteedSupportDrop(delta);
    this.updateDynamicBulletCap(delta);
    this.player.update(time, delta);
    if (this.player.active) {
      this.sceneBackground?.updatePlayerDriven(delta, this.player.x, this.player.y);
    } else {
      this.sceneBackground?.updateIdle(delta);
    }
    this.enemyManager.update(time, delta);
    this.updateWormhole(delta);
    this.updateEliteDrone(delta);
    this.updateSwarmSpawner(delta);
    this.flushPendingEnemyHits();
    this.comboManager.update(time);
    this.comboManager.updateHUD();
    this.powerUpDirector.update(this.progressionScore, delta);
    this.skyRaiderManager.update(time, delta);
    this.updateProjectileTrails(delta);

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
      this.configureBackgroundDecor();
    }
    this.updateBackgroundDecor(delta);
    this.updateNebulaLayers(delta);

    if (this.debugOverlayEnabled) {
      this.debugRefreshMs -= delta;
      if (this.debugRefreshMs <= 0) {
        let renderer = 'UNKNOWN';
        if (this.game.renderer.type === Phaser.WEBGL) renderer = 'WEBGL';
        else if (this.game.renderer.type === Phaser.CANVAS) renderer = 'CANVAS';
        else if (this.game.renderer.type === (Phaser as any).WEBGPU) renderer = 'WEBGPU';

        const bulletActive = this.bullets.countActive(true);
        const nextDebugLine = `${renderer}${this.gpuName ? ` | ${this.gpuName}` : ''} | ${Math.round(this.game.loop.actualFps)} FPS | L ${this.level} ${this.difficultyPreset.label} | Q ${performanceMonitor.getQualityLabel()} | B ${bulletActive}/${this.dynamicBulletCap}`;
        if (nextDebugLine !== this.lastDebugLine) {
          this.debugText.setText(nextDebugLine);
          this.lastDebugLine = nextDebugLine;
        }

        const activeEnemies = this.enemyManager.enemies.countActive(true);
        const activePowerUps = this.powerUpDirector.getGroup().countActive(true);
        const activeUFOProjectiles = this.ufo.getActiveProjectileCount();
        const activeSkyRaiders = this.skyRaiderManager.getActiveRaiderCount();
        const activeSkyRaiderProjectiles = this.skyRaiderManager.getActiveProjectileCount();
        const activeBunkers = this.shieldBunkers.countActive(true);
        const physicsBodies = (this.physics.world as any)?.bodies?.size ?? 0;
        const nextDebugStatsLine =
          `OBJ E ${activeEnemies} | P ${activePowerUps} | UP ${activeUFOProjectiles} | ` +
          `SR ${activeSkyRaiders}/${activeSkyRaiderProjectiles} | ` +
          `BNK ${activeBunkers} | DEC ${this.backgroundDecor.length}(${this.backgroundDecorTier}) | ` +
          `WH ${this.wormhole?.active ? 1 : 0} | ED ${this.eliteDrone?.active ? 1 : 0} | BOD ${physicsBodies}`;
        if (nextDebugStatsLine !== this.lastDebugStatsLine) {
          this.debugStatsText.setText(nextDebugStatsLine);
          this.lastDebugStatsLine = nextDebugStatsLine;
        }

        this.debugRefreshMs = 200;
      }
    }

    if (!this.ufo.active) {
      this.ufoSpawnTimer -= delta;
      if (this.ufoSpawnTimer <= 0) {
        if (this.levelBossPendingDefeat) {
          this.ufo.spawn({ variant: 'boss', level: this.level });
          if (this.level >= 3) {
            this.ufo.setBossModifier(this.rollBossModifier());
          }
          this.ufoSpawnTimer = Phaser.Math.Between(1700, 2500);
        } else {
          const variant = this.pickUFOVariantForLevel();
          this.ufo.spawn({ variant, level: this.level });
          this.ufoSpawnTimer = this.computeNextUFOSpawnDelay(variant);
        }
      }
    }

    // Summoner boss modifier: spawn extra asteroids periodically
    if (
      this.ufo.active &&
      this.ufo.getVariant() === 'boss' &&
      this.ufo.getBossModifier() === 'summoner'
    ) {
      this.summonerTimerMs -= delta;
      if (this.summonerTimerMs <= 0) {
        this.summonerTimerMs = Phaser.Math.Between(3000, 5000);
        const sx = this.ufo.x + Phaser.Math.Between(-80, 80);
        const sy = this.ufo.y + 30;
        this.enemyManager.spawnSwarm(3, 0.5, 220, 40, 20);
        this.cameras.main.flash(60, 180, 100, 255, false);
        // reposition last swarm near boss
        const enemies = this.enemyManager.enemies.getChildren() as Enemy[];
        for (let i = enemies.length - 1; i >= Math.max(0, enemies.length - 3); i--) {
          const e = enemies[i];
          if (e.active && e.swarmId > 0) {
            e.setPosition(sx + Phaser.Math.Between(-40, 40), sy);
          }
        }
      }
    } else {
      this.summonerTimerMs = 2000;
    }

    if (this.powerUpTimer > 0) {
      this.powerUpTimer -= delta;
      this.powerUpBarRefreshMs -= delta;
      if (this.powerUpBarRefreshMs <= 0 || this.powerUpTimer <= 0) {
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

    this.powerUpManager.update(delta);
    // Check if shield bunker needs expiry warning
    if (this.powerUpManager.isActive(PowerUpType.SHIELD_BUNKER)) {
      const timeLeft = this.powerUpManager.getRemainingTime(PowerUpType.SHIELD_BUNKER);
      this.maybeStartShieldBunkerExpiryWarning(timeLeft);
    }
    this.updateDrones();
    this.updateProximityMines(delta);
    this.updateBlackHole(delta);
    this.updateBossEnergyUI();

    // Update HUD displays (throttled at ~30 FPS for performance)
    this.heatBarRefreshMs -= delta;
    if (this.heatBarRefreshMs <= 0 || this.powerUpBarRefreshMs <= 0) {
      this.updateHUDDisplay();
      this.heatBarRefreshMs = 34;
    }
  }

  private updateBossEnergyUI() {
    // Boss energy is rendered directly on the boss UFO.
  }

  /**
   * Update all HUD elements via HUDManager
   */
  private updateHUDDisplay() {
    const state = this.playerStates[this.activePlayerIndex];
    const hudState: HUDState = {
      p1Score: this.playerCount === 2 ? this.playerStates[0].score : this.score,
      p2Score: this.playerCount === 2 ? this.playerStates[1].score : 0,
      p1Lives: this.playerCount === 2 ? this.playerStates[0].lives : this.lives,
      p2Lives: this.playerCount === 2 ? this.playerStates[1].lives : 0,
      level: this.level,
      mineCharges: this.mineDeployCharges,
      playerCount: this.playerCount as 1 | 2,
      activePlayerIndex: this.activePlayerIndex as 0 | 1,
      levelBossPendingDefeat: this.levelBossPendingDefeat,
      nextLevelScore: this.nextLevelScore,
      progressionScore: this.progressionScore,
      remainingBossGateTimeMs: this.getRemainingBossGateTimeMs(),
      difficultyLabel: this.difficultyPreset.label,
      eliteLifePerkCount: state?.eliteLifePerkCount ?? 0,
      eliteCoolingPerkLevel: state?.eliteCoolingPerkLevel ?? 0,
      eliteMagnetPerkLevel: state?.eliteMagnetPerkLevel ?? 0,
      powerUpTimer: this.powerUpTimer,
      powerUpBarMaxDuration: this.getScaledMagneticDuration(7000),
      time: this.time.now,
      playerHeat: this.player.getHeatNormalized(),
      playerActive: this.player.active,
      playerOverheated: this.player.isOverheated(),
      heatBarAnchor: this.player.getHeatBarAnchor(),
    };
    this.hudManager.update(hudState);
  }

  private addScore(points: number) {
    this.applyScoreDelta(points, true);
  }

  private addFlatScore(points: number) {
    this.applyScoreDelta(points, false);
  }

  private applyScoreDelta(points: number, applyMultiplier: boolean) {
    if (points <= 0) return;
    const prevScore = this.score;
    const adjusted = applyMultiplier
      ? Math.round(points * this.perkSystem.getScoreMultiplier())
      : Math.round(points);
    if (adjusted <= 0) return;
    this.score += adjusted;
    this.progressionScore += adjusted;
    if (this.playerStates[this.activePlayerIndex]) {
      this.playerStates[this.activePlayerIndex].score = this.score;
    }
    this.checkMilestone(prevScore, this.score);
    this.checkLevelProgression();
    this.updateHUDDisplay();
  }

  private checkMilestone(prevScore: number, newScore: number) {
    const thresholds = MILESTONE_TUNING.thresholds;
    if (this.milestoneIndex >= thresholds.length) return;
    const next = thresholds[this.milestoneIndex];
    if (prevScore < next.score && newScore >= next.score) {
      this.triggerMilestone(this.milestoneIndex);
      this.milestoneIndex++;
    }
  }

  private triggerMilestone(index: number) {
    const m = MILESTONE_TUNING.thresholds[index];
    const [r, g, b] = m.flashColor;
    this.cameras.main.flash(MILESTONE_TUNING.flashDurationMs, r, g, b, false);
    this.cameras.main.shake(MILESTONE_TUNING.shakeDurationMs, MILESTONE_TUNING.shakeIntensity);
    this.audio.playMilestoneSting();

    this.milestoneText
      .setText(m.label)
      .setColor(m.color)
      .setScale(0.5)
      .setAlpha(1)
      .setVisible(true);

    this.tweens.add({
      targets: this.milestoneText,
      scaleX: 1.2,
      scaleY: 1.2,
      duration: 280,
      ease: 'Back.easeOut',
      onComplete: () => {
        this.tweens.add({
          targets: this.milestoneText,
          y: this.milestoneText.y - MILESTONE_TUNING.textRiseY,
          alpha: 0,
          scaleX: 0.9,
          scaleY: 0.9,
          duration: MILESTONE_TUNING.textDurationMs - 280,
          delay: 400,
          ease: 'Sine.easeIn',
          onComplete: () => {
            this.milestoneText.setVisible(false);
            this.milestoneText.setY(GAME_HEIGHT * 0.32);
          },
        });
      },
    });
  }

  private showTutorialHints() {
    try {
      if (localStorage.getItem('spaceShooterTutorialShown')) return;
      localStorage.setItem('spaceShooterTutorialShown', '1');
    } catch {
      return;
    }

    const centerX = GAME_WIDTH / 2;
    const hintStyle = {
      fontFamily: '"Press Start 2P"',
      fontSize: '14px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 3,
    };

    const hints = [
      { text: 'ARROWS / WASD TO MOVE', delayMs: 500, durationMs: 2500 },
      { text: 'SPACE TO FIRE', delayMs: 3500, durationMs: 2500 },
      { text: 'COLLECT POWER-UPS!', delayMs: 7000, durationMs: 2500 },
    ];

    for (const hint of hints) {
      this.time.delayedCall(hint.delayMs, () => {
        if (!this.scene.isActive(this.scene.key) || this.isGameOver) return;
        const t = this.add
          .text(centerX, GAME_HEIGHT * 0.55, hint.text, hintStyle)
          .setOrigin(0.5)
          .setDepth(142)
          .setAlpha(0);
        this.tweens.add({
          targets: t,
          alpha: 1,
          duration: 300,
          onComplete: () => {
            this.tweens.add({
              targets: t,
              alpha: 0,
              delay: hint.durationMs - 600,
              duration: 300,
              onComplete: () => t.destroy(),
            });
          },
        });
      });
    }
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
    if (this.getRemainingBossGateTimeMs() > 0) return;
    this.triggerLevelBossEncounter();
  }

  private getRemainingBossGateTimeMs() {
    if (this.levelBossPendingDefeat || this.isGameOver) return 0;
    const minDurationMs = LEVEL_PROGRESS_TUNING.minLevelDurationMs[this.difficultyKey];
    return Math.max(0, minDurationMs - this.levelElapsedMs);
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
    this.updateHUDDisplay();
  }

  private completeLevelAfterBossDefeat() {
    if (!this.levelBossPendingDefeat || this.isGameOver) return;
    this.levelBossPendingDefeat = false;
    const completedLevel = this.level;
    const levelBonusPayout = this.consumeLevelBonusPayout(completedLevel);
    this.level += 1;
    statsManager.onBossKill();
    statsManager.updateHighestLevel(this.level);
    this.nextLevelScore = this.progressionScore + this.getNextLevelScore(this.level);
    this.applyDifficultyProfile();
    this.resetLevelOpeningState();
    this.tweens.add({
      targets: this.levelText,
      scaleX: 1.24,
      scaleY: 1.24,
      duration: 140,
      yoyo: true,
      ease: 'Sine.easeOut',
    });
    this.setPlayerOverlayControlLocked(true, false);
    this.physics.world.pause();

    // Show bonus fireworks first, then perk selection, then level transition countdown.
    const celebrationMs = LEVEL_TRANSITION_TUNING.bossDefeatCelebrationDelayMs;
    const hasPerkChoices = this.perkSystem.rollChoices(1).length > 0;
    this.startLevelBonusFireworksBeforeUpgrade(celebrationMs, levelBonusPayout, () => {
      if (!this.scene.isActive(this.scene.key) || this.isGameOver) return;
      this.setPlayerOverlayControlLocked(true, false);
      if (hasPerkChoices) {
        this.events.once('perkSelectDone', () => {
          this.applyPerkEffects();
          this.startLevelTransitionCountdown(0);
        });
        this.scene.launch('PerkSelectScene', {
          perkSystem: this.perkSystem,
          level: this.level,
        });
        return;
      }
      this.startLevelTransitionCountdown(0);
    });
  }

  private registerAsteroidKillForLevel() {
    this.levelAsteroidKillCount += 1;
  }

  private registerSpecialKillForLevel() {
    this.levelSpecialKillCount += 1;
  }

  private consumeLevelBonusPayout(completedLevel: number): LevelBonusPayout {
    const asteroidKills = this.levelAsteroidKillCount;
    const specialKills = this.levelSpecialKillCount;
    this.levelAsteroidKillCount = 0;
    this.levelSpecialKillCount = 0;
    const asteroidPoints = asteroidKills * LEVEL_BONUS_TUNING.asteroidKillPoints;
    const specialPoints = specialKills * LEVEL_BONUS_TUNING.specialKillPoints;
    return {
      completedLevel,
      asteroidKills,
      specialKills,
      asteroidPoints,
      specialPoints,
      totalPoints: asteroidPoints + specialPoints,
    };
  }

  private rollBossModifier(): BossModifier {
    const pool: BossModifier[] = ['shielded', 'berserk', 'armored'];
    if (this.level >= 4) pool.push('summoner');
    return Phaser.Utils.Array.GetRandom(pool);
  }

  private applyPerkEffects() {
    const activeState = this.playerStates[this.activePlayerIndex];
    if (activeState) {
      const mineStockStacks = this.perkSystem.getMineStockStacks();
      const alreadyAppliedStacks = activeState.mineStockPerkApplied ?? 0;
      if (mineStockStacks > alreadyAppliedStacks) {
        this.addMineDeployCharges(mineStockStacks - alreadyAppliedStacks);
      }
      activeState.mineStockPerkApplied = mineStockStacks;
    }

    // Apply shield-on-level-up perk
    if (this.perkSystem.hasShieldOnLevel() && !this.player.getShieldActive()) {
      this.powerUpManager.activate(PowerUpType.SHIELD);
      // Note: Infinite shields from perks use very long duration
    }
    // Apply start-shield perk (same effect)
    if (this.perkSystem.hasStartShield() && this.level === 2 && !this.player.getShieldActive()) {
      this.powerUpManager.activate(PowerUpType.SHIELD);
      // Note: Infinite shields from perks use very long duration
    }
    // Extra lives from perk are applied immediately when selected (addPerk recalculates)
    // Other perk effects are read dynamically via getters in the gameplay loop
  }

  private applyDifficultyProfile(silent: boolean = false) {
    this.difficultyPreset = getDifficultyPreset(this.difficultyKey);
    this.audio.setDifficultyMix(this.difficultyKey);
    this.enemyManager.setDifficultyPreset(this.difficultyPreset);
    this.enemyManager.setDifficultyLevel(this.level);
    this.powerUpDirector.setDifficultyPreset(this.difficultyPreset);
    this.powerUpDirector.setDifficultyLevel(this.level);
    this.ufo.setDifficultyPreset(this.difficultyPreset);
    this.ufo.setDifficultyLevel(this.level);
    this.skyRaiderManager.setDifficultyPreset(this.difficultyPreset);
    this.skyRaiderManager.setDifficultyLevel(this.level);
    if (!silent) {
      this.updateHUDDisplay();
    }
  }

  private resetLevelOpeningState() {
    this.levelStartScore = this.progressionScore;
    this.levelElapsedMs = 0;
    this.earlySupportDropGranted = false;
    this.earlySupportDropTimerMs = this.rollRange(
      EARLY_LEVEL_TUNING.guaranteedSupportDropDelayMs[this.difficultyKey],
    );
    this.enemyManager.setRuntimeIntensity(EARLY_LEVEL_TUNING.minIntensity[this.difficultyKey]);
    this.skyRaiderManager.setRuntimeIntensity(EARLY_LEVEL_TUNING.minIntensity[this.difficultyKey]);
  }

  private getLevelProgressRatio() {
    const requirement = Math.max(1, this.nextLevelScore - this.levelStartScore);
    const gained = Math.max(0, this.progressionScore - this.levelStartScore);
    return Phaser.Math.Clamp(gained / requirement, 0, 1);
  }

  private updateLevelOpeningBalance(delta: number) {
    if (this.levelBossPendingDefeat || this.isGameOver) {
      this.enemyManager.setRuntimeIntensity(1);
      this.skyRaiderManager.setRuntimeIntensity(1);
      return;
    }
    this.levelElapsedMs += delta;
    const timeRamp = Phaser.Math.Clamp(
      this.levelElapsedMs / EARLY_LEVEL_TUNING.rampDurationMs[this.difficultyKey],
      0,
      1,
    );
    const scoreRamp = Phaser.Math.Clamp(
      this.getLevelProgressRatio() / EARLY_LEVEL_TUNING.scoreRampPortion,
      0,
      1,
    );
    const easedRamp = Phaser.Math.Easing.Cubic.Out(Math.max(timeRamp, scoreRamp));
    const minIntensity = EARLY_LEVEL_TUNING.minIntensity[this.difficultyKey];
    this.enemyManager.setRuntimeIntensity(Phaser.Math.Linear(minIntensity, 1, easedRamp));
    this.skyRaiderManager.setRuntimeIntensity(Phaser.Math.Linear(minIntensity, 1, easedRamp));
  }

  private updateGuaranteedSupportDrop(delta: number) {
    if (this.earlySupportDropGranted || this.levelBossPendingDefeat || this.isGameOver) return;
    this.earlySupportDropTimerMs -= delta;
    const lowLifeUrgency = this.lives <= 1 && this.levelElapsedMs > 2400;
    const progressReady = this.getLevelProgressRatio() >= 0.32;
    if (this.earlySupportDropTimerMs > 0 && !lowLifeUrgency && !progressReady) return;
    this.triggerGuaranteedSupportDrop();
  }

  private triggerGuaranteedSupportDrop() {
    // Support drops were removed from timed flow; drops now come only from enemy kills.
    this.earlySupportDropGranted = true;
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

  private createDamageOverlay() {
    this.damageOverlay = this.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0xff466a, 0)
      .setDepth(98);
  }

  private showDamageOverlay() {
    const baseAlpha = JUICE_TUNING.damageOverlayMaxAlpha[this.difficultyKey];
    const alpha = performanceMonitor.reducedParticles ? baseAlpha * 0.84 : baseAlpha;
    const duration = JUICE_TUNING.damageOverlayDurationByDifficultyMs[this.difficultyKey];
    this.damageOverlayTween?.stop();
    this.damageOverlay.setAlpha(alpha);
    this.damageOverlayTween = this.tweens.add({
      targets: this.damageOverlay,
      alpha: 0,
      duration,
      ease: 'Cubic.easeOut',
    });
  }

  private createNebulaLayerTexture(
    key: string,
    size: number,
    primaryColor: number,
    secondaryColor: number,
    glowCount: number,
  ) {
    if (this.textures.exists(key)) return;
    const g = this.make.graphics({ x: 0, y: 0 });
    g.clear();
    g.fillStyle(0x000000, 0);
    g.fillRect(0, 0, size, size);

    for (let i = 0; i < glowCount; i++) {
      const cx = Phaser.Math.FloatBetween(0, size);
      const cy = Phaser.Math.FloatBetween(0, size);
      const rx = Phaser.Math.FloatBetween(size * 0.09, size * 0.28);
      const ry = rx * Phaser.Math.FloatBetween(0.52, 0.9);
      g.fillStyle(
        i % 2 === 0 ? primaryColor : secondaryColor,
        Phaser.Math.FloatBetween(0.03, 0.11),
      );
      g.fillEllipse(cx, cy, rx * 2, ry * 2);
    }

    for (let i = 0; i < 32; i++) {
      const x = Phaser.Math.FloatBetween(0, size);
      const y = Phaser.Math.FloatBetween(0, size);
      const r = Phaser.Math.FloatBetween(0.7, 1.6);
      const alpha = Phaser.Math.FloatBetween(0.08, 0.22);
      g.fillStyle(i % 3 === 0 ? secondaryColor : primaryColor, alpha);
      g.fillCircle(x, y, r);
    }

    g.generateTexture(key, size, size);
    g.destroy();
  }

  private resolveNebulaProfileKey() {
    if (this.game.renderer.type !== Phaser.WEBGL) return 'off';
    if (!this.isBackgroundDecorTierActive(this.backgroundDecorTier)) return 'off';
    const quality = performanceMonitor.reducedParticles ? 'reduced' : 'full';
    return `${this.backgroundDecorTier}-${quality}`;
  }

  private configureNebulaLayers(force: boolean = false) {
    const profileKey = this.resolveNebulaProfileKey();
    if (!force && profileKey === this.nebulaProfileKey) return;

    this.clearNebulaLayers();
    this.nebulaProfileKey = profileKey;
    if (profileKey === 'off') return;

    const isReduced = performanceMonitor.reducedParticles;
    const layerCount = this.backgroundDecorTier === 'low' ? 1 : isReduced ? 1 : 2;
    this.createNebulaLayerTexture('bg_nebula_a', 512, 0x3e7bff, 0xa26eff, 18);
    this.createNebulaLayerTexture('bg_nebula_b', 512, 0x5fd9ff, 0xff79da, 24);

    const width = this.scale.width;
    const height = this.scale.height;
    const baseAlphaA = this.backgroundDecorTier === 'high' ? 0.12 : 0.1;
    const baseAlphaB = this.backgroundDecorTier === 'high' ? 0.11 : 0.085;
    const layers: Array<{
      key: string;
      vx: number;
      vy: number;
      baseAlpha: number;
      alphaWave: number;
      blendMode: Phaser.BlendModes;
    }> = [
      {
        key: 'bg_nebula_a',
        vx: 0.65,
        vy: 4.6,
        baseAlpha: isReduced ? baseAlphaA * 0.82 : baseAlphaA,
        alphaWave: 0.018,
        blendMode: Phaser.BlendModes.NORMAL,
      },
      {
        key: 'bg_nebula_b',
        vx: -0.48,
        vy: 6.4,
        baseAlpha: isReduced ? baseAlphaB * 0.8 : baseAlphaB,
        alphaWave: 0.022,
        blendMode: Phaser.BlendModes.ADD,
      },
    ];

    for (let i = 0; i < layerCount; i++) {
      const config = layers[i];
      const sprite = this.add
        .tileSprite(width / 2, height / 2, width, height, config.key)
        .setDepth(-8 + i)
        .setAlpha(config.baseAlpha)
        .setBlendMode(config.blendMode);
      this.nebulaLayers.push({
        sprite,
        vx: config.vx,
        vy: config.vy,
        baseAlpha: config.baseAlpha,
        alphaWave: isReduced ? config.alphaWave * 0.6 : config.alphaWave,
        phase: Phaser.Math.FloatBetween(0, Math.PI * 2),
      });
    }
  }

  private updateNebulaLayers(delta: number) {
    if (this.nebulaLayers.length === 0) return;
    const t = this.time.now * 0.001;
    for (const layer of this.nebulaLayers) {
      layer.sprite.tilePositionX += (layer.vx * delta) / 1000;
      layer.sprite.tilePositionY += (layer.vy * delta) / 1000;
      layer.sprite.alpha = Phaser.Math.Clamp(
        layer.baseAlpha + Math.sin(t * 0.35 + layer.phase) * layer.alphaWave,
        0.03,
        0.22,
      );
    }
  }

  private clearNebulaLayers() {
    for (const layer of this.nebulaLayers) {
      layer.sprite.destroy();
    }
    this.nebulaLayers.length = 0;
  }

  private createProjectileTrailEmitters() {
    this.playerTrailEmitter = this.add.particles(0, 0, 'particle_flare', {
      lifespan: { min: 130, max: 240 },
      speed: { min: 8, max: 34 },
      angle: { min: 75, max: 105 },
      scale: { start: 0.32, end: 0 },
      alpha: { start: 0.5, end: 0 },
      tint: [0x66d6ff, 0x9dfbff],
      blendMode: 'ADD',
      emitting: false,
      quantity: 1,
    });
    this.playerTrailEmitter.setDepth(108);

    this.enemyTrailEmitter = this.add.particles(0, 0, 'particle_flare', {
      lifespan: { min: 120, max: 220 },
      speed: { min: 10, max: 38 },
      angle: { min: 240, max: 300 },
      scale: { start: 0.3, end: 0 },
      alpha: { start: 0.44, end: 0 },
      tint: [0xff8cf4, 0xb090ff],
      blendMode: 'ADD',
      emitting: false,
      quantity: 1,
    });
    this.enemyTrailEmitter.setDepth(108);
  }

  private updateProjectileTrails(delta: number) {
    if (!this.playerTrailEmitter && !this.enemyTrailEmitter) return;

    this.trailEmitAccumulatorMs += delta;
    const reduced = performanceMonitor.reducedParticles;
    const baseEmitEveryMs = reduced
      ? JUICE_TUNING.trailEmitIntervalMs.reduced
      : JUICE_TUNING.trailEmitIntervalMs.full;
    const emitEveryMs = Math.round(
      baseEmitEveryMs * performanceMonitor.getFxIntervalScale(this.game),
    );
    if (this.trailEmitAccumulatorMs < emitEveryMs) return;
    this.trailEmitAccumulatorMs = 0;

    const basePlayerCap = reduced
      ? JUICE_TUNING.playerTrailCapPerTick.reduced
      : JUICE_TUNING.playerTrailCapPerTick.full;
    const playerCap = performanceMonitor.scaleFxCount(this.game, basePlayerCap, reduced ? 2 : 4);
    let emittedPlayer = 0;
    const playerStride = reduced ? 2 : 1;
    const bullets = this.bullets.getChildren() as Bullet[];
    for (let i = 0; i < bullets.length && emittedPlayer < playerCap; i += playerStride) {
      const bullet = bullets[i];
      if (!bullet.active || !bullet.visible) continue;
      this.playerTrailEmitter?.emitParticleAt(bullet.x, bullet.y + 6, 1);
      emittedPlayer++;
    }

    const projectiles = this.ufo.getProjectiles()?.getChildren() as UFOProjectile[] | undefined;
    if (!projectiles) return;
    const baseEnemyCap = reduced
      ? JUICE_TUNING.enemyTrailCapPerTick.reduced
      : JUICE_TUNING.enemyTrailCapPerTick.full;
    const enemyCap = performanceMonitor.scaleFxCount(this.game, baseEnemyCap, reduced ? 2 : 3);
    let emittedEnemy = 0;
    const enemyStride = reduced ? 2 : 1;
    for (let i = 0; i < projectiles.length && emittedEnemy < enemyCap; i += enemyStride) {
      const shot = projectiles[i];
      if (!shot.active || !shot.visible) continue;
      this.enemyTrailEmitter?.emitParticleAt(shot.x, shot.y, 1);
      emittedEnemy++;
    }
  }

  public onPlayerShot(manual: boolean = false) {
    if (this.isGameOver || this.isSwitching || this.isLevelTransition) return;
    if (!this.player?.active) return;
    const now = this.time.now;
    if (now - this.lastPlayerRecoilAt < JUICE_TUNING.playerRecoilCooldownMs) return;
    this.lastPlayerRecoilAt = now;

    const baseIntensity = JUICE_TUNING.playerRecoilIntensity[this.difficultyKey];
    const reducedScale = performanceMonitor.reducedParticles ? 0.86 : 1;
    const manualScale = manual ? 1 : 0.92;
    this.cameras.main.shake(
      JUICE_TUNING.playerRecoilDurationMs,
      baseIntensity * reducedScale * manualScale,
    );
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
    this.skyRaiderManager.deactivateAll();
  }

  private resetWorldEventTimers() {
    this.setWormholeSpawnTimer('initial');
    this.wormholeForceAccumulatorMs = 0;
    this.eliteDroneSpawnTimer = this.rollRange(ELITE_DRONE_TUNING.initialSpawnDelayMs);
    this.eliteDroneLifetimeMs = 0;
    this.swarmSpawnTimerMs =
      this.level >= SWARM_TUNING.minLevel ? this.rollRange(SWARM_TUNING.initialDelayMs) : 999999;
    this.swarmKills.clear();
  }

  private updateSwarmSpawner(delta: number) {
    if (this.level < SWARM_TUNING.minLevel || this.isLevelTransition || this.isSwitching) return;
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

  private onSwarmEnemyKilled(enemy: Enemy, x: number, y: number) {
    if (enemy.swarmId === 0) return;
    const swarmId = enemy.swarmId;
    const total = enemy.swarmTotal;
    const kills = (this.swarmKills.get(swarmId) ?? 0) + 1;
    this.swarmKills.set(swarmId, kills);

    if (kills >= total) {
      // Full swarm wiped — bonus!
      const bonus = SWARM_TUNING.bonusPerAsteroid * total * SWARM_TUNING.fullSwarmBonusMultiplier;
      this.addScore(bonus);
      this.comboManager.spawnClusterPopup(x, y - 20, bonus);
      this.cameras.main.flash(100, 136, 204, 255, false);
      this.audio.playPickup();
      this.swarmKills.delete(swarmId);
    }
  }

  private applyPassivePerksFromActiveState() {
    const state = this.playerStates[this.activePlayerIndex];
    const coolingLevel = state?.eliteCoolingPerkLevel ?? 0;
    const magnetLevel = state?.eliteMagnetPerkLevel ?? 0;
    this.passiveCoolingMultiplier = 1 + coolingLevel * 0.2;
    this.magneticDurationMultiplier = 1 + magnetLevel * 0.24;
    this.player.setPassiveCoolingMultiplier(this.passiveCoolingMultiplier);
    this.updateHUDDisplay();
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
    this.updateHUDDisplay();
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
    this.wormholeVisualAccumulatorMs = performanceMonitor.reducedParticles ? 48 : 28;
    this.wormholeForceAccumulatorMs = 0;
    this.setWormholeSpawnTimer('respawn');
  }

  private deactivateWormhole() {
    if (!this.wormhole) return;
    this.wormhole.active = false;
    this.wormholeGraphics.clear();
    this.wormholeGraphics.setVisible(false);
    this.wormholeVisualAccumulatorMs = 0;
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

    this.wormholeVisualAccumulatorMs += delta;
    const wormholeVisualInterval = performanceMonitor.reducedParticles ? 48 : 28;
    if (this.wormholeVisualAccumulatorMs >= wormholeVisualInterval) {
      this.wormholeVisualAccumulatorMs = 0;
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

  private handlePlayerRescueEliteDrone(_player: Player, drone: Phaser.Physics.Arcade.Sprite) {
    if (this.isGameOver || this.isSwitching || this.isLevelTransition) return;
    if (!drone.active) return;
    const x = drone.x;
    const y = drone.y;
    this.audio.playPickup();
    this.grantElitePerk('rescued', x, y);
    this.deactivateEliteDrone('rescued');
  }

  private handleBulletHitEliteDrone(bullet: Bullet, drone: Phaser.Physics.Arcade.Sprite) {
    if (this.isGameOver || this.isSwitching || this.isLevelTransition) return;
    if (!drone.active || !bullet.active) return;
    const x = drone.x;
    const y = drone.y;
    bullet.disableBody(true, true);
    this.explosionManager.triggerExplosion(x, y);
    this.audio.playExplosion();
    this.triggerHitStop(
      JUICE_TUNING.eliteHitStopMs,
      JUICE_TUNING.eliteHitStopScale,
      JUICE_TUNING.hitStopCooldownMs,
    );
    this.applyImpactShake(120, 0.004);
    this.spawnImpactRing(x, y, 0x8cf8ff, 14, 46, 150);
    this.grantElitePerk('shot', x, y);
    this.deactivateEliteDrone('shot');
  }

  public spawnOverheatSmoke(x: number, y: number) {
    if (!this.useHighEndVFX || !this.smokeEmitter) return;
    this.smokeEmitter.emitParticleAt(x, y + 10, 10);
  }

  // Moved to PowerUpManager.update()

  private syncActivePowerUpsToState(activePowerUps: Map<PowerUpType, number>) {
    const state = this.playerStates[this.activePlayerIndex];
    if (!state) return;
    state.activePowerUps.clear();
    activePowerUps.forEach((timeLeft, type) => {
      state.activePowerUps.set(type, timeLeft);
    });
  }

  private syncMineDeployChargesToState() {
    const state = this.playerStates[this.activePlayerIndex];
    if (!state) return;
    state.mineDeployCharges = this.mineDeployCharges;
  }

  private saveActivePlayerState() {
    const state = this.playerStates[this.activePlayerIndex];
    if (!state) return;
    state.score = this.score;
    state.lives = this.lives;
    state.powerUpTimer = this.powerUpTimer;
    state.mineDeployCharges = this.mineDeployCharges;
    state.comboState = this.comboManager.saveState();
    state.perkState = this.perkSystem.saveState();
    this.syncActivePowerUpsToState(this.powerUpManager.getActivePowerUps());
  }

  private loadActivePlayerState(index: number) {
    const state = this.playerStates[index];
    if (!state) return;
    this.score = state.score;
    this.lives = state.lives;
    this.powerUpTimer = state.powerUpTimer;
    this.mineDeployCharges = state.mineDeployCharges ?? INITIAL_MINE_DEPLOY_CHARGES;
    this.powerUpManager.loadState(state.activePowerUps);
    this.comboManager.loadState(state.comboState);
    this.perkSystem.loadState(state.perkState);
    state.mineStockPerkApplied = state.mineStockPerkApplied ?? this.perkSystem.getMineStockStacks();
    this.applyPassivePerksFromActiveState();
    this.powerUpManager.reapplyAll(true);
    this.updateHUDDisplay();
    this.powerUpManager.update(0);
    this.updateHUDDisplay();
  }

  // Moved to PowerUpManager.reapplyAll()

  private clearCurrentPowerUps() {
    this.powerUpManager.cleanup();
    this.powerUpTimer = 0;
    this.powerUpBarRefreshMs = 0;
    this.clearProximityMines();
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
    this.removeShieldBunkers();
    this.powerUpBar.clear();
    this.powerUpListText.setText('');
  }

  private deactivateAllBullets() {
    const bullets = this.bullets.getChildren() as Bullet[];
    for (const bullet of bullets) {
      if (bullet.active) bullet.disableBody(true, true);
    }
  }

  private deactivateAllEnemies() {
    const enemies = this.enemyManager.enemies.getChildren() as Enemy[];
    for (const enemy of enemies) {
      if (enemy.active) enemy.disableBody(true, true);
    }
  }

  private resetPlayfield() {
    this.pendingEnemyHits.length = 0;
    this.deactivateAllBullets();
    this.deactivateAllEnemies();
    this.clearProximityMines();
    this.powerUpDirector.reset();
    this.ufo.deactivate();
    this.skyRaiderManager.deactivateAll();
    this.removeShieldBunkers();
    this.clearWorldEvents('reset');
    this.resetWorldEventTimers();
    this.ufoSpawnTimer = this.levelBossPendingDefeat
      ? Phaser.Math.Between(500, 900)
      : this.computeNextUFOSpawnDelay();
    this.skyRaiderManager.resetSpawnController(Phaser.Math.Between(1200, 2200));
  }

  private clearTransitionHazardPowerUps() {
    let changed = false;
    if (this.powerUpManager.isActive(PowerUpType.BLACK_HOLE)) {
      this.powerUpManager.deactivate(PowerUpType.BLACK_HOLE);
      changed = true;
    }
    if (this.powerUpManager.isActive(PowerUpType.SHIELD_BUNKER)) {
      this.powerUpManager.deactivate(PowerUpType.SHIELD_BUNKER);
      changed = true;
    }
    if (!changed) return;
    this.stopShieldBunkerWarning(true);
  }

  private preparePlayfieldForLevelTransition() {
    this.pendingEnemyHits.length = 0;
    this.stopShieldBunkerWarning(true);
    this.spawnProtectionTimerMs = 0;
    this.stopSpawnProtectionVisuals();
    this.hitStopTimer?.remove(false);
    this.hitStopTimer = undefined;
    this.physics.world.timeScale = this.getBaselinePhysicsTimeScale();
    this.deactivateAllBullets();
    this.deactivateAllEnemies();
    this.clearProximityMines();
    this.ufo.deactivate();
    this.skyRaiderManager.deactivateAll();
    this.powerUpDirector.resetForLevelStart(this.progressionScore);
    this.clearTransitionHazardPowerUps();
    this.clearWorldEvents('reset');
    this.resetWorldEventTimers();
    this.enemyManager.resetSpawnController(Phaser.Math.Between(520, 900));
    this.ufoSpawnTimer = this.computeNextUFOSpawnDelay();
    this.skyRaiderManager.resetSpawnController(Phaser.Math.Between(1400, 2600));
    this.updateHUDDisplay();
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
    this.levelTransitionWarpGraphics = this.add.graphics();
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
        this.levelTransitionWarpGraphics,
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
    this.levelTransitionWarpTween?.stop();
    this.levelBonusPayoutTween?.stop();
    this.levelBonusPayoutTween = undefined;
    this.levelTransitionWarpGraphics.clear();
  }

  private playLevelWarpPulse(mode: 'soft' | 'hard') {
    if (!this.levelTransitionOverlay.visible) return;
    const reduced = performanceMonitor.reducedParticles;
    const fxBudget = performanceMonitor.getFxBudgetScale(this.game);
    const diffScale = JUICE_TUNING.warpPulseDifficultyScale[this.difficultyKey];
    const lineCount = reduced
      ? JUICE_TUNING.warpLineCount.reduced
      : JUICE_TUNING.warpLineCount.full;
    const scaledLineCount = Phaser.Math.Clamp(
      Math.round(lineCount * diffScale.lines * fxBudget),
      reduced ? 6 : 10,
      reduced ? 16 : 26,
    );
    const baseDuration =
      mode === 'hard'
        ? JUICE_TUNING.warpPulseDurationMs.hard
        : JUICE_TUNING.warpPulseDurationMs.soft;
    const duration = Math.round(baseDuration * diffScale.duration * (0.72 + fxBudget * 0.28));
    const baseAlpha =
      mode === 'hard' ? JUICE_TUNING.warpPulseAlpha.hard : JUICE_TUNING.warpPulseAlpha.soft;
    const peakAlpha = Phaser.Math.Clamp(
      baseAlpha * diffScale.alpha * (0.75 + fxBudget * 0.25),
      0.1,
      0.95,
    );
    const centerX = GAME_WIDTH * 0.5;
    const centerY = GAME_HEIGHT * 0.52;
    const state = { progress: 0, alpha: peakAlpha };

    this.levelTransitionWarpTween?.stop();
    this.levelTransitionWarpGraphics.clear();
    this.levelTransitionWarpTween = this.tweens.add({
      targets: state,
      progress: 1,
      alpha: 0,
      duration,
      ease: 'Cubic.easeOut',
      onUpdate: () => {
        const g = this.levelTransitionWarpGraphics;
        g.clear();
        const p = state.progress;
        const lineAlpha = Phaser.Math.Clamp(state.alpha * (1 - p * 0.25), 0, 1);
        for (let i = 0; i < scaledLineCount; i++) {
          const angle = (i / scaledLineCount) * Math.PI * 2 + p * 0.35;
          const jitter = Math.sin(p * 7 + i * 0.9) * 8;
          const inner = 42 + p * 24 + jitter * 0.25;
          const outer = inner + 76 + (i % 3) * 24 + p * 138;
          const x1 = centerX + Math.cos(angle) * inner;
          const y1 = centerY + Math.sin(angle) * inner;
          const x2 = centerX + Math.cos(angle) * outer;
          const y2 = centerY + Math.sin(angle) * outer;
          const color = i % 2 === 0 ? 0x8cf8ff : 0xffb3ef;
          g.lineStyle(i % 3 === 0 ? 3 : 2, color, lineAlpha * (i % 3 === 0 ? 0.78 : 0.56));
          g.beginPath();
          g.moveTo(x1, y1);
          g.lineTo(x2, y2);
          g.strokePath();
        }

        g.fillStyle(0x9af8ff, lineAlpha * 0.15);
        g.fillCircle(centerX, centerY, 66 + p * 32);
      },
      onComplete: () => {
        this.levelTransitionWarpGraphics.clear();
      },
    });
  }

  private playLevelBonusCelebration(bonusPayout: LevelBonusPayout, onComplete: () => void) {
    if (!this.isLevelTransition || !this.scene.isActive(this.scene.key)) return;

    const totalPoints = Math.max(0, bonusPayout.totalPoints);
    const summaryLine1 = `ASTEROIDS ${bonusPayout.asteroidKills} x ${LEVEL_BONUS_TUNING.asteroidKillPoints} = ${bonusPayout.asteroidPoints}`;
    const summaryLine2 = `UFO/INVADER ${bonusPayout.specialKills} x ${LEVEL_BONUS_TUNING.specialKillPoints} = ${bonusPayout.specialPoints}`;
    this.levelTransitionOverlay.setVisible(true);
    this.levelTransitionTitle.setText(`LEVEL ${bonusPayout.completedLevel} BONUS`);
    this.levelTransitionTitle.setColor('#ffd966');
    this.levelTransitionCountdown.setText('+0');
    this.levelTransitionCountdown.setScale(1);
    this.levelTransitionCountdown.setAlpha(1);
    this.levelTransitionCountdown.setFontSize(76);
    this.levelTransitionCountdown.setColor('#ffe48a');
    this.levelTransitionPrompt.setText(`${summaryLine1}\n${summaryLine2}`);
    this.levelTransitionPrompt.setFontSize(14);
    this.levelTransitionPrompt.setColor('#8cf8ff');
    this.levelTransitionPrompt.setAlpha(1);
    this.playLevelWarpPulse('soft');

    if (totalPoints <= 0) {
      this.levelTransitionCountdown.setText('NO BONUS');
      this.levelTransitionCountdown.setFontSize(52);
      this.levelTransitionCountdown.setColor('#a0aec0');
      const doneEvent = this.time.delayedCall(LEVEL_BONUS_TUNING.completionHoldMs, () => {
        if (!this.isLevelTransition || !this.scene.isActive(this.scene.key)) return;
        onComplete();
      });
      this.levelTransitionEvents.push(doneEvent);
      return;
    }

    const duration = Phaser.Math.Clamp(
      Math.round(
        LEVEL_BONUS_TUNING.basePayoutDurationMs +
          totalPoints * LEVEL_BONUS_TUNING.perPointDurationMs,
      ),
      LEVEL_BONUS_TUNING.payoutDurationRangeMs[0],
      LEVEL_BONUS_TUNING.payoutDurationRangeMs[1],
    );

    const minX = LEVEL_BONUS_TUNING.fireworkXPadding;
    const maxX = GAME_WIDTH - LEVEL_BONUS_TUNING.fireworkXPadding;
    const minY = Math.round(GAME_HEIGHT * LEVEL_BONUS_TUNING.fireworkYRangeRatio[0]);
    const maxY = Math.round(GAME_HEIGHT * LEVEL_BONUS_TUNING.fireworkYRangeRatio[1]);
    let burstIndex = 0;
    const burstCount = Math.max(
      4,
      Math.ceil(duration / LEVEL_BONUS_TUNING.fireworkBurstIntervalMs),
    );
    const fireworkEvent = this.time.addEvent({
      delay: LEVEL_BONUS_TUNING.fireworkBurstIntervalMs,
      repeat: burstCount,
      callback: () => {
        if (!this.isLevelTransition || !this.scene.isActive(this.scene.key)) return;
        const fxX = Phaser.Math.Between(minX, maxX);
        const fxY = Phaser.Math.Between(minY, maxY);
        this.explosionManager.triggerExplosion(fxX, fxY);
        const ringPalette = [0xffe066, 0x8cf8ff, 0xff9be8, 0x9ef8ff];
        const ringColor = ringPalette[burstIndex % ringPalette.length];
        this.spawnImpactRing(fxX, fxY, ringColor, 12, Phaser.Math.Between(52, 94), 220);
        if (burstIndex % LEVEL_BONUS_TUNING.fireworkExplosionSfxModulo === 0) {
          this.audio.playExplosion();
        }
        burstIndex += 1;
      },
    });
    this.levelTransitionEvents.push(fireworkEvent);

    let awarded = 0;
    let lastCoinTickAt = -100000;
    const tickerState = { value: 0 };
    this.levelBonusPayoutTween = this.tweens.add({
      targets: tickerState,
      value: totalPoints,
      duration,
      ease: 'Cubic.easeOut',
      onUpdate: () => {
        if (!this.isLevelTransition || !this.scene.isActive(this.scene.key)) return;
        const targetValue = Math.floor(tickerState.value);
        if (targetValue <= awarded) return;
        const delta = targetValue - awarded;
        this.addFlatScore(delta);
        awarded = targetValue;
        this.levelTransitionCountdown.setText(`+${awarded}`);
        if (this.time.now - lastCoinTickAt >= LEVEL_BONUS_TUNING.coinTickIntervalMs) {
          this.audio.playCoin();
          lastCoinTickAt = this.time.now;
        }
      },
      onComplete: () => {
        this.levelBonusPayoutTween = undefined;
        const remainder = totalPoints - awarded;
        if (remainder > 0) {
          this.addFlatScore(remainder);
          awarded = totalPoints;
          this.levelTransitionCountdown.setText(`+${awarded}`);
        }
        this.levelTransitionCountdown.setColor('#66ff99');
        this.levelTransitionPrompt.setText(`${summaryLine1}\nTOTAL BONUS ${awarded}`);
        this.audio.playPickup();
        this.playLevelWarpPulse('hard');
        const doneEvent = this.time.delayedCall(LEVEL_BONUS_TUNING.completionHoldMs, () => {
          if (!this.isLevelTransition || !this.scene.isActive(this.scene.key)) return;
          onComplete();
        });
        this.levelTransitionEvents.push(doneEvent);
      },
    });
  }

  private startLevelBonusFireworksBeforeUpgrade(
    delayBeforeOverlayMs: number,
    bonusPayout: LevelBonusPayout,
    onComplete: () => void,
  ) {
    const beginBonus = () => {
      if (!this.scene.isActive(this.scene.key) || this.isGameOver) return;
      this.isLevelTransition = true;
      this.ufo.setCombatTarget(null);
      this.skyRaiderManager.setCombatTarget(null);
      this.stopLevelTransitionTweens();
      this.clearLevelTransitionEvents();
      this.levelTransitionOverlay.setVisible(false);
      this.levelTransitionCountdownLabel = '';
      this.playLevelBonusCelebration(bonusPayout, () => {
        if (!this.scene.isActive(this.scene.key) || this.isGameOver) return;
        this.clearLevelTransitionEvents();
        this.stopLevelTransitionTweens();
        this.levelTransitionWarpGraphics.clear();
        this.levelTransitionOverlay.setVisible(false);
        this.levelTransitionCountdownLabel = '';
        this.isLevelTransition = false;
        onComplete();
      });
    };

    const safeDelay = Math.max(0, delayBeforeOverlayMs);
    if (safeDelay === 0) {
      beginBonus();
      return;
    }
    const delayEvent = this.time.delayedCall(safeDelay, beginBonus);
    this.levelTransitionEvents.push(delayEvent);
  }

  private startLevelTransitionCountdown(delayBeforeOverlayMs: number = 0) {
    if (this.isLevelTransition || this.isGameOver) return;
    this.isLevelTransition = true;
    this.ufo.setCombatTarget(null);
    this.skyRaiderManager.setCombatTarget(null);
    this.setPlayerOverlayControlLocked(true, true);
    this.preparePlayfieldForLevelTransition();
    this.physics.world.pause();

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
      this.levelTransitionTitle.setColor('#ffd966');
      this.levelTransitionPrompt.setText('GET READY');
      this.levelTransitionPrompt.setFontSize(18);
      this.levelTransitionPrompt.setColor('#7dd3fc');
      this.levelTransitionPrompt.setAlpha(1);
      this.levelTransitionOverlay.setVisible(true);
      this.levelTransitionCountdownLabel = '3';
      this.playLevelWarpPulse('soft');

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
          this.playLevelWarpPulse(isGo ? 'hard' : 'soft');
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
    this.levelTransitionWarpGraphics.clear();
    this.levelTransitionOverlay.setVisible(false);
    this.levelTransitionCountdownLabel = '';
    const wasActive = this.isLevelTransition;
    this.isLevelTransition = false;
    if (wasActive && resumePhysics && !this.isSwitching && !this.isGameOver) {
      this.player.setActive(true).setVisible(true);
      this.physics.world.resume();
      this.applySpawnProtection(SPAWN_PROTECTION_TUNING.levelTransitionGraceMs, true);
      this.ufo.setCombatTarget(this.player.active ? this.player : null);
      this.skyRaiderManager.setCombatTarget(this.player.active ? this.player : null);
      this.skyRaiderManager.resetSpawnController(Phaser.Math.Between(1400, 2500));
    }
  }

  private setPlayerOverlayControlLocked(lock: boolean, hidePlayer: boolean) {
    if (lock) {
      if (this.player.body) {
        this.player.body.enable = false;
        this.player.body.velocity.set(0, 0);
      }
      this.player.setActive(false).setVisible(!hidePlayer);
      return;
    }
    this.player.setActive(true).setVisible(true);
  }

  private getSafeRespawnPoint() {
    const y = this.scale.height - SPAWN_PROTECTION_TUNING.safeSpawnYOffset;
    const width = this.scale.width;
    const samples = [0.14, 0.3, 0.5, 0.7, 0.86].map((ratio) => Math.round(width * ratio));
    let bestX = width / 2;
    let bestScore = -1;

    for (const x of samples) {
      let nearestDistSq = Number.POSITIVE_INFINITY;
      const enemies = this.enemyManager.enemies.getChildren() as Enemy[];
      for (const enemy of enemies) {
        if (!enemy.active) continue;
        const dx = enemy.x - x;
        const dy = enemy.y - y;
        nearestDistSq = Math.min(nearestDistSq, dx * dx + dy * dy);
      }
      const projectiles = this.ufo.getProjectiles()?.getChildren() as UFOProjectile[] | undefined;
      if (projectiles) {
        for (const shot of projectiles) {
          if (!shot.active) continue;
          const dx = shot.x - x;
          const dy = shot.y - y;
          nearestDistSq = Math.min(nearestDistSq, dx * dx + dy * dy);
        }
      }
      const skyRaiders = this.skyRaiderManager.getRaiders().getChildren() as unknown as SkyRaider[];
      for (const raider of skyRaiders) {
        if (!raider.active) continue;
        const dx = raider.x - x;
        const dy = raider.y - y;
        nearestDistSq = Math.min(nearestDistSq, dx * dx + dy * dy);
      }
      const skyRaiderShots = this.skyRaiderManager
        .getProjectiles()
        .getChildren() as SkyRaiderShot[];
      for (const shot of skyRaiderShots) {
        if (!shot.active) continue;
        const dx = shot.x - x;
        const dy = shot.y - y;
        nearestDistSq = Math.min(nearestDistSq, dx * dx + dy * dy);
      }
      if (this.ufo.active) {
        const dx = this.ufo.x - x;
        const dy = this.ufo.y - y;
        nearestDistSq = Math.min(nearestDistSq, dx * dx + dy * dy);
      }
      if (nearestDistSq > bestScore) {
        bestScore = nearestDistSq;
        bestX = x;
      }
    }

    return { x: bestX, y };
  }

  private clearThreatsNearPlayer(radius: number) {
    const px = this.player.x;
    const py = this.player.y;
    const radiusSq = radius * radius;
    const enemies = this.enemyManager.enemies.getChildren() as Enemy[];
    for (const enemy of enemies) {
      if (!enemy.active) continue;
      const dx = enemy.x - px;
      const dy = enemy.y - py;
      if (dx * dx + dy * dy <= radiusSq) {
        enemy.disableBody(true, true);
      }
    }
    const projectiles = this.ufo.getProjectiles()?.getChildren() as UFOProjectile[] | undefined;
    if (projectiles) {
      for (const shot of projectiles) {
        if (!shot.active) continue;
        const dx = shot.x - px;
        const dy = shot.y - py;
        if (dx * dx + dy * dy <= radiusSq) {
          shot.disableBody(true, true);
        }
      }
    }
    const skyRaiders = this.skyRaiderManager.getRaiders().getChildren() as unknown as SkyRaider[];
    for (const raider of skyRaiders) {
      if (!raider.active) continue;
      const dx = raider.x - px;
      const dy = raider.y - py;
      if (dx * dx + dy * dy <= radiusSq) {
        raider.deactivate();
      }
    }
    const skyRaiderShots = this.skyRaiderManager.getProjectiles().getChildren() as SkyRaiderShot[];
    for (const shot of skyRaiderShots) {
      if (!shot.active) continue;
      const dx = shot.x - px;
      const dy = shot.y - py;
      if (dx * dx + dy * dy <= radiusSq) {
        shot.disableBody(true, true);
      }
    }
  }

  private stopSpawnProtectionVisuals() {
    if (this.spawnProtectionTween) {
      this.spawnProtectionTween.stop();
      this.spawnProtectionTween = undefined;
    }
    this.tweens.killTweensOf(this.player);
  }

  private applySpawnProtection(durationMs: number, clearNearbyThreats: boolean) {
    this.spawnProtectionTimerMs = Math.max(this.spawnProtectionTimerMs, durationMs);
    if (this.player.body) {
      this.player.body.enable = false;
    }
    this.stopSpawnProtectionVisuals();
    this.player.setAlpha(0.5);
    this.spawnProtectionTween = this.tweens.add({
      targets: this.player,
      alpha: 0.18,
      duration: 95,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    if (clearNearbyThreats) {
      this.clearThreatsNearPlayer(SPAWN_PROTECTION_TUNING.clearRadius);
    }
  }

  private updateSpawnProtection(delta: number) {
    if (this.spawnProtectionTimerMs <= 0) return;
    this.spawnProtectionTimerMs -= delta;
    if (this.spawnProtectionTimerMs > 0) return;
    this.spawnProtectionTimerMs = 0;
    this.stopSpawnProtectionVisuals();
    const ghostActive = this.powerUpManager.isActive(PowerUpType.GHOST_PHASE);
    if (this.player.body) {
      this.player.body.enable = !ghostActive;
    }
    this.player.setAlpha(ghostActive ? 0.5 : 1);
  }

  private respawnPlayerSafely(protectionMs: number) {
    const spawnPoint = this.getSafeRespawnPoint();
    this.player.setPosition(spawnPoint.x, spawnPoint.y);
    this.player.setActive(true).setVisible(true);
    this.player.resetHeat();
    this.applySpawnProtection(protectionMs, true);
  }

  private resetPlayerForTurn() {
    this.respawnPlayerSafely(SPAWN_PROTECTION_TUNING.switchGraceMs);
  }

  private queueTurnSwitch(nextIndex: number) {
    this.isSwitching = true;
    this.ufo.setCombatTarget(null);
    this.skyRaiderManager.setCombatTarget(null);
    this.skyRaiderManager.deactivateAll();
    this.spawnProtectionTimerMs = 0;
    this.stopSpawnProtectionVisuals();
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
      this.skyRaiderManager.setCombatTarget(this.player);
      this.skyRaiderManager.resetSpawnController(Phaser.Math.Between(1400, 2400));
      this.isSwitching = false;
      this.physics.world.resume();
      this.hideTurnOverlay();
    };
    this.turnKeyHandler = () => proceed();
    this.turnPointerHandler = () => proceed();
    this.input.keyboard?.on('keydown', this.turnKeyHandler);
    this.input.on('pointerdown', this.turnPointerHandler);
  }

  private applySlowMo(active: boolean) {
    if (this.slowMoActive === active) return;
    this.slowMoActive = active;
    this.physics.world.timeScale = active ? 2.0 : 1.0;
    if (this.useHighEndVFX) {
      if (active) {
        if (!this.slowMoColorMatrixFx) {
          this.slowMoColorMatrixFx = this.cameras.main.postFX.addColorMatrix();
        }
        this.slowMoColorMatrixFx.reset();
        this.slowMoColorMatrixFx.night();
        this.slowMoColorMatrixFx.grayscale();
      } else {
        if (this.slowMoColorMatrixFx) {
          this.cameras.main.postFX.remove(
            this.slowMoColorMatrixFx as unknown as Phaser.FX.Controller,
          );
          this.slowMoColorMatrixFx = null;
        }
      }
    } else {
      this.tweens.add({ targets: this.slowMoOverlay, alpha: active ? 0.3 : 0, duration: 500 });
    }
  }

  private getBaselinePhysicsTimeScale() {
    return this.slowMoActive ? 2.0 : 1.0;
  }

  private applyImpactShake(durationMs: number, intensity: number) {
    const scale = performanceMonitor.reducedParticles ? 0.8 : 1;
    this.cameras.main.shake(Math.max(40, Math.round(durationMs * scale)), intensity * scale);
  }

  private triggerHitStop(durationMs: number, worldScale: number, cooldownMs: number) {
    if (this.isGameOver || this.isSwitching || this.isLevelTransition) return;
    if (this.physics.world.isPaused) return;
    if (this.time.now < this.hitStopCooldownUntil) return;

    this.hitStopCooldownUntil = this.time.now + cooldownMs;
    const baseline = this.getBaselinePhysicsTimeScale();
    this.physics.world.timeScale = Math.max(0.05, Math.min(baseline, worldScale));

    this.hitStopTimer?.remove(false);
    this.hitStopTimer = this.time.delayedCall(durationMs, () => {
      if (!this.scene.isActive(this.scene.key)) return;
      if (this.physics.world.isPaused) return;
      this.physics.world.timeScale = this.getBaselinePhysicsTimeScale();
    });
  }

  private createImpactRingPool() {
    this.impactRingPool = this.add.group({
      classType: Phaser.GameObjects.Image,
      maxSize: IMPACT_RING_POOL_SIZE,
      runChildUpdate: false,
    });
  }

  private spawnImpactRing(
    x: number,
    y: number,
    color: number,
    startRadius: number,
    endRadius: number,
    durationMs: number,
  ) {
    const startScale = Math.max(0.02, startRadius / IMPACT_RING_TEXTURE_RADIUS);
    const endScale = Math.max(0.02, endRadius / IMPACT_RING_TEXTURE_RADIUS);
    const ring = this.impactRingPool.get(
      x,
      y,
      IMPACT_RING_TEXTURE_KEY,
    ) as Phaser.GameObjects.Image | null;
    if (!ring) return;

    this.impactRingTweens.get(ring)?.stop();
    this.impactRingTweens.delete(ring);

    ring
      .setPosition(x, y)
      .setDepth(146)
      .setAlpha(0.92)
      .setTint(color)
      .setScale(startScale)
      .setActive(true)
      .setVisible(true);

    const tween = this.tweens.add({
      targets: ring,
      scaleX: endScale,
      scaleY: endScale,
      alpha: 0,
      duration: durationMs,
      ease: 'Quart.easeOut',
      onComplete: () => {
        this.impactRingTweens.delete(ring);
        ring.setActive(false);
        ring.setVisible(false);
      },
    });
    this.impactRingTweens.set(ring, tween);
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
    if (this.spawnProtectionTimerMs > 0) {
      this.player.body!.enable = false;
      if (active) this.player.setAlpha(0.5);
      return;
    }
    this.player.setAlpha(active ? 0.5 : 1.0);
    this.player.body!.enable = !active;
    if (active)
      this.tweens.add({ targets: this.player, alpha: 0.2, duration: 100, yoyo: true, repeat: -1 });
    else this.tweens.killTweensOf(this.player);
  }

  private spawnDrones() {
    this.audio.playDrones();
    if (!this.drones) {
      this.drones = this.add.group({ maxSize: 2 });
      for (let i = 0; i < 2; i++) {
        const drone = this.add.image(this.player.x, this.player.y, WINGMAN_DRONE_TEXTURE_KEY);
        drone.setDepth(this.player.depth + 0.2);
        drone.setScale(1);
        drone.setAlpha(0.95);
        drone.setActive(false);
        drone.setVisible(false);
        this.drones.add(drone);
      }
    }
    const children = this.drones.getChildren() as Phaser.GameObjects.Image[];
    for (let i = 0; i < children.length; i++) {
      const drone = children[i];
      const offset = i === 0 ? -60 : 60;
      drone.x = this.player.x + offset;
      drone.y = this.player.y + 20;
      drone.rotation = 0;
      drone.setScale(1);
      drone.setAlpha(0.95);
      drone.setActive(true);
      drone.setVisible(true);
    }

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
      const phase = this.time.now * 0.006 + i * 1.2;
      const hover = Math.sin(phase) * 2.4;
      const targetY = this.player.y + 20 + hover;
      drone.x = Phaser.Math.Linear(drone.x, this.player.x + offset, 0.12);
      drone.y = Phaser.Math.Linear(drone.y, targetY, 0.12);
      drone.rotation = Math.sin(phase * 0.85) * 0.08;
      drone.setScale(1 + Math.sin(phase * 1.35) * 0.03);
      drone.setAlpha(0.88 + (Math.sin(phase) * 0.5 + 0.5) * 0.16);
      return null;
    });
  }

  private removeDrones() {
    this.player.setDrones(null);
    if (!this.drones) return;
    const groupAny = this.drones as any;
    let children: Phaser.GameObjects.Image[] = [];
    try {
      if (groupAny.children && Array.isArray(groupAny.children.entries)) {
        children = groupAny.children.entries as Phaser.GameObjects.Image[];
      } else if (typeof groupAny.getChildren === 'function') {
        children = groupAny.getChildren() as Phaser.GameObjects.Image[];
      }
    } catch {
      // Ignore teardown races during scene shutdown.
      return;
    }
    for (const drone of children) {
      drone.setActive(false);
      drone.setVisible(false);
    }
  }

  private spawnBlackHole() {
    if (this.blackHole?.active) return;
    this.audio.playBlackHole();
    this.audio.startBlackHoleLoop();
    const x = Phaser.Math.Between(Math.round(GAME_WIDTH * 0.2), Math.round(GAME_WIDTH * 0.8));
    const y = Phaser.Math.Between(Math.round(GAME_HEIGHT * 0.2), Math.round(GAME_HEIGHT * 0.5));
    const g = this.add.graphics().setDepth(5);
    this.blackHoleVisualAccumulatorMs = performanceMonitor.reducedParticles ? 52 : 34;
    this.blackHoleForceAccumulatorMs = 0;
    this.blackHole = { x, y, active: true, graphics: g };
  }

  private updateBlackHole(delta: number) {
    if (!this.blackHole?.active) return;
    const { x, y, graphics } = this.blackHole;
    this.blackHoleVisualAccumulatorMs += delta;
    const visualInterval = performanceMonitor.reducedParticles ? 52 : 34;
    if (this.blackHoleVisualAccumulatorMs >= visualInterval) {
      this.blackHoleVisualAccumulatorMs = 0;
      graphics
        .clear()
        .lineStyle(2, 0xaa00ff, 0.8)
        .strokeCircle(x, y, 50 + Math.sin(this.time.now * 0.01) * 10);
    }

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
    this.blackHoleVisualAccumulatorMs = 0;
    this.blackHoleForceAccumulatorMs = 0;
    this.audio.stopBlackHoleLoop();
  }

  private spawnShieldBunkers() {
    if (!this.shieldBunkers || this.shieldBunkers.countActive(true) > 0) return;
    this.stopShieldBunkerWarning(false);
    const y = Math.round(this.scale.height * SHIELD_BUNKER_TUNING.spawnYRatio);
    const layoutRatios =
      this.scale.width <= SHIELD_BUNKER_TUNING.compactLayoutMaxWidth
        ? SHIELD_BUNKER_TUNING.compactLayoutRatios
        : SHIELD_BUNKER_TUNING.layoutRatios;
    const positions = layoutRatios.map((ratio) => Math.round(this.scale.width * ratio));

    for (const x of positions) {
      const bunker = this.shieldBunkers.get(x, y, 'shield_bunker') as Phaser.Physics.Arcade.Image;
      if (!bunker) continue;
      bunker.setTexture('shield_bunker');
      bunker.setActive(true);
      bunker.setVisible(true);
      bunker.setDepth(66);
      bunker.setAlpha(SHIELD_BUNKER_TUNING.idleAlpha);
      const body = bunker.body as Phaser.Physics.Arcade.StaticBody | Phaser.Physics.Arcade.Body;
      if (body) body.enable = true;
      bunker.setPosition(x, y);
      bunker.refreshBody();
      this.tweens.add({
        targets: bunker,
        alpha: SHIELD_BUNKER_TUNING.spawnPulseAlpha,
        duration: SHIELD_BUNKER_TUNING.spawnPulseDurationMs,
        yoyo: true,
        ease: 'Sine.easeOut',
      });
    }
  }

  private getActiveShieldBunkers() {
    if (!this.shieldBunkers) return [] as Phaser.Physics.Arcade.Image[];
    return (this.shieldBunkers.getChildren() as Phaser.Physics.Arcade.Image[]).filter(
      (bunker) => bunker.active,
    );
  }

  private maybeStartShieldBunkerExpiryWarning(timeLeftMs: number) {
    if (this.shieldBunkerWarningStarted) return;
    if (timeLeftMs > SHIELD_BUNKER_TUNING.warningLeadMs) return;
    const bunkers = this.getActiveShieldBunkers();
    if (bunkers.length === 0) return;

    this.shieldBunkerWarningStarted = true;
    this.tweens.killTweensOf(bunkers);
    for (const bunker of bunkers) {
      bunker.setAlpha(SHIELD_BUNKER_TUNING.idleAlpha);
    }

    this.shieldBunkerWarningTween = this.tweens.add({
      targets: bunkers,
      alpha: SHIELD_BUNKER_TUNING.spawnPulseAlpha,
      duration: SHIELD_BUNKER_TUNING.warningBlinkHalfPeriodMs,
      yoyo: true,
      repeat: Math.max(0, SHIELD_BUNKER_TUNING.warningBlinkCount - 1),
      ease: 'Sine.easeInOut',
      onComplete: () => {
        this.shieldBunkerWarningTween = undefined;
        if (!this.powerUpManager.isActive(PowerUpType.SHIELD_BUNKER)) return;
        for (const bunker of this.getActiveShieldBunkers()) {
          bunker.setAlpha(SHIELD_BUNKER_TUNING.idleAlpha);
        }
      },
    });
  }

  private stopShieldBunkerWarning(restoreAlpha: boolean) {
    if (this.shieldBunkerWarningTween) {
      this.shieldBunkerWarningTween.stop();
      this.shieldBunkerWarningTween = undefined;
    }
    this.shieldBunkerWarningStarted = false;
    if (!restoreAlpha) return;
    for (const bunker of this.getActiveShieldBunkers()) {
      bunker.setAlpha(SHIELD_BUNKER_TUNING.idleAlpha);
    }
  }

  private removeShieldBunkers() {
    const bunkers = this.getActiveShieldBunkers();
    if (bunkers.length > 0) {
      this.tweens.killTweensOf(bunkers);
    }
    this.stopShieldBunkerWarning(false);
    for (const bunker of bunkers) {
      bunker.disableBody(true, true);
    }
  }

  private handleBulletHitShieldBunker(bullet: Bullet, _bunker: Phaser.Physics.Arcade.Sprite) {
    if (!bullet?.active) return;
    bullet.disableBody(true, true);
  }

  private handleUFOProjectileHitShieldBunker(
    projectile: UFOProjectile,
    _bunker: Phaser.Physics.Arcade.Sprite,
  ) {
    if (!projectile?.active) return;
    projectile.disableBody(true, true);
  }

  private handleSkyRaiderShotHitShieldBunker(
    shot: SkyRaiderShot,
    _bunker: Phaser.Physics.Arcade.Sprite,
  ) {
    if (!shot?.active) return;
    shot.disableBody(true, true);
  }

  private handleSkyRaiderHitShieldBunker(raider: SkyRaider, _bunker: Phaser.Physics.Arcade.Sprite) {
    if (!raider?.active) return;
    const x = raider.x;
    const y = raider.y;
    raider.deactivate();
    this.explosionManager.triggerExplosion(x, y);
    this.audio.playExplosion();
  }

  private handleAsteroidHitShieldBunker(enemy: Enemy, _bunker: Phaser.Physics.Arcade.Sprite) {
    if (!enemy?.active) return;
    const x = enemy.x;
    const y = enemy.y;
    enemy.disableBody(true, true);
    this.explosionManager.triggerExplosion(x, y);
    this.audio.playExplosion();
  }

  private triggerShieldBunkerTest() {
    this.tryActivateShieldBunkerFromInput();
  }

  private hasActiveShieldBunkers() {
    return (
      this.powerUpManager.isActive(PowerUpType.SHIELD_BUNKER) ||
      (this.shieldBunkers?.countActive(true) ?? 0) > 0
    );
  }

  private tryActivateShieldBunkerFromInput() {
    if (this.isGameOver || this.isSwitching || this.isLevelTransition) return;
    if (this.scene.isPaused('MainScene') || !this.scene.isActive('MainScene')) return;
    if (this.hasActiveShieldBunkers()) return;
    this.audio.playPickup();
    this.powerUpManager.activate(PowerUpType.SHIELD_BUNKER);
  }

  private handleMineDeployPointerDown(
    pointer: Phaser.Input.Pointer,
    currentlyOver: Phaser.GameObjects.GameObject[] = [],
  ) {
    if (pointer.button !== 0) return;
    if (this.isGameOver || this.isSwitching || this.isLevelTransition) return;
    if (this.scene.isPaused('MainScene') || !this.scene.isActive('MainScene')) return;

    const overInteractiveUI = currentlyOver.some((obj) => {
      const input = (obj as any).input as { enabled?: boolean } | undefined;
      return Boolean(input?.enabled);
    });
    if (overInteractiveUI) {
      this.lastMineDeployTapAt = -10000;
      this.lastMineDeployTapX = -1000;
      this.lastMineDeployTapY = -1000;
      return;
    }

    const now = this.time.now;
    const dt = now - this.lastMineDeployTapAt;
    const dx = pointer.x - this.lastMineDeployTapX;
    const dy = pointer.y - this.lastMineDeployTapY;
    const isCloseEnough = dx * dx + dy * dy <= this.mineDeployDoubleTapMaxDistancePx ** 2;
    const isDoubleTap = dt <= this.mineDeployDoubleTapWindowMs && isCloseEnough;
    this.lastMineDeployTapAt = now;
    this.lastMineDeployTapX = pointer.x;
    this.lastMineDeployTapY = pointer.y;

    if (!isDoubleTap) return;
    this.tryDeployMineFieldFromInput();
  }

  private addMineDeployCharges(amount: number) {
    if (amount <= 0) return;
    this.mineDeployCharges += amount;
    this.syncMineDeployChargesToState();
    this.updateHUDDisplay();
  }

  private clearProximityMines() {
    this.mineStates.clear();
    if (!this.proximityMines) return;
    const groupAny = this.proximityMines as any;
    let children: Phaser.Physics.Arcade.Image[] = [];
    try {
      if (groupAny.children && Array.isArray(groupAny.children.entries)) {
        children = groupAny.children.entries as Phaser.Physics.Arcade.Image[];
      } else if (typeof groupAny.getChildren === 'function') {
        children = groupAny.getChildren() as Phaser.Physics.Arcade.Image[];
      }
    } catch {
      // Ignore teardown races during scene shutdown.
      return;
    }
    for (const mine of children) {
      if (!mine.active) continue;
      try {
        mine.disableBody(true, true);
        mine.setScale(1);
        mine.setAlpha(1);
      } catch {
        // Ignore teardown races during scene shutdown.
      }
    }
  }

  private tryDeployMineFieldFromInput() {
    if (this.isGameOver || this.isSwitching || this.isLevelTransition) return;
    if (this.scene.isPaused('MainScene') || !this.scene.isActive('MainScene')) return;
    if (this.mineDeployCharges <= 0) {
      this.showMineDeployUnavailableHint();
      return;
    }
    const deployed = this.deployMineFieldFromPlayer();
    if (deployed <= 0) return;
    this.mineDeployCharges = Math.max(0, this.mineDeployCharges - 1);
    this.syncMineDeployChargesToState();
    this.updateHUDDisplay();
    this.audio.playPickup();
  }

  private showMineDeployUnavailableHint() {
    if (!this.mineDeployHintText) return;
    const now = this.time.now;
    if (now < this.mineDeployHintCooldownUntil) return;
    this.mineDeployHintCooldownUntil = now + 520;
    this.tweens.killTweensOf(this.mineDeployHintText);
    this.mineDeployHintText.setText('NO MINES');
    this.mineDeployHintText.setAlpha(0.95);
    this.tweens.add({
      targets: this.mineDeployHintText,
      alpha: 0,
      duration: 520,
      ease: 'Sine.easeOut',
    });
  }

  private deployMineFieldFromPlayer() {
    if (!this.proximityMines || !this.player?.active) return 0;
    const launchCount = PROXIMITY_MINE_DEPLOY_COUNT;
    let deployed = 0;
    const launchOriginX = this.player.x;
    const launchOriginY = this.player.y - 4;

    for (let i = 0; i < launchCount; i++) {
      const mine = this.proximityMines.get(
        launchOriginX,
        launchOriginY,
        PROXIMITY_MINE_TEXTURE_KEY,
      ) as Phaser.Physics.Arcade.Image | null;
      if (!mine) continue;

      const target = this.rollMineTargetPosition(i);
      const dx = target.x - launchOriginX;
      const dy = target.y - launchOriginY;
      const len = Math.max(1, Math.hypot(dx, dy));
      const speed = Phaser.Math.Between(220, 320);
      const vx = (dx / len) * speed;
      const vy = (dy / len) * speed;

      mine.setTexture(PROXIMITY_MINE_TEXTURE_KEY);
      mine.enableBody(true, launchOriginX, launchOriginY, true, true);
      mine.setActive(true);
      mine.setVisible(true);
      mine.setDepth(88);
      mine.setAlpha(0.9);
      mine.setScale(0.88);
      mine.setBlendMode(Phaser.BlendModes.NORMAL);
      mine.setVelocity(vx, vy);
      mine.setAngularVelocity(Phaser.Math.Between(-70, 70));
      mine.setDrag(0, 0);
      mine.setImmovable(false);
      const body = mine.body as Phaser.Physics.Arcade.Body | undefined;
      if (body && typeof body.setCircle === 'function') {
        body.setCircle(10, 6, 6);
      }
      this.mineStates.set(mine, {
        targetX: target.x,
        targetY: target.y,
        armed: false,
        pulsePhase: Phaser.Math.FloatBetween(0, Math.PI * 2),
      });
      deployed++;
    }

    return deployed;
  }

  private rollMineTargetPosition(index: number) {
    const width = this.scale.width;
    const height = this.scale.height;
    const laneX = ((index + 0.5) / PROXIMITY_MINE_DEPLOY_COUNT) * width;
    const x = Phaser.Math.Clamp(
      laneX + Phaser.Math.Between(-68, 68),
      Math.round(width * 0.08),
      Math.round(width * 0.92),
    );
    const y = Phaser.Math.Between(
      Math.round(height * 0.2),
      Math.round(height * (this.playerCount === 2 ? 0.62 : 0.68)),
    );
    return { x, y };
  }

  private updateProximityMines(delta: number) {
    if (!this.proximityMines) return;
    const children = this.proximityMines.getChildren() as Phaser.Physics.Arcade.Image[];
    const t = this.time.now * 0.001;

    for (const mine of children) {
      if (!mine.active) continue;
      const state = this.mineStates.get(mine);
      if (!state) continue;

      if (!state.armed) {
        const dx = state.targetX - mine.x;
        const dy = state.targetY - mine.y;
        const arrivalDistSq = dx * dx + dy * dy;
        if (arrivalDistSq <= 18 * 18) {
          mine.setPosition(state.targetX, state.targetY);
          mine.setVelocity(0, 0);
          mine.setAngularVelocity(0);
          mine.setImmovable(true);
          mine.rotation = 0;
          state.armed = true;
          continue;
        }
        mine.rotation += (delta / 1000) * 2.8;
        continue;
      }

      const pulse = Math.sin(t * 7.5 + state.pulsePhase);
      const pulseNorm = pulse * 0.5 + 0.5;
      mine.setScale(0.92 + pulseNorm * 0.2);
      mine.setAlpha(0.72 + pulseNorm * 0.26);
      const r = Math.round(255);
      const g = Math.round(147 + (242 - 147) * pulseNorm);
      const b = Math.round(46 + (166 - 46) * pulseNorm);
      mine.setTint((r << 16) | (g << 8) | b);
    }
  }

  private isArmedMine(mine: Phaser.Physics.Arcade.Image) {
    return Boolean(this.mineStates.get(mine)?.armed);
  }

  private consumeMine(mine: Phaser.Physics.Arcade.Image) {
    this.mineStates.delete(mine);
    mine.clearTint();
    mine.disableBody(true, true);
    mine.setScale(1);
    mine.setAlpha(1);
  }

  private handleMineHitEnemy(mine: Phaser.Physics.Arcade.Image, enemy: Enemy) {
    if (!mine?.active || !enemy?.active) return;
    if (!this.isArmedMine(mine)) return;

    const x = enemy.x;
    const y = enemy.y;
    const points = Math.floor(100 / enemy.scaleX);
    const wasSwarm = enemy.swarmId > 0;
    this.consumeMine(mine);
    this.powerUpDirector.onAsteroidDestroyed(enemy.x, enemy.y);
    this.enemyManager.splitAsteroid(enemy.x, enemy.y, enemy.scaleX);
    enemy.disableBody(true, true);
    this.registerAsteroidKillForLevel();
    this.explosionManager.triggerExplosion(x, y);
    this.spawnImpactRing(x, y, 0xffc57a, 18, 72, 190);
    this.audio.playExplosion();
    this.addScore(this.comboManager.registerKill(x, y, points, this.time.now));
    if (wasSwarm) this.onSwarmEnemyKilled(enemy, x, y);
  }

  private handleMineHitSkyRaider(mine: Phaser.Physics.Arcade.Image, raider: SkyRaider) {
    if (!mine?.active || !raider?.active) return;
    if (!this.isArmedMine(mine)) return;

    const x = raider.x;
    const y = raider.y;
    const variant = raider.getVariant();
    this.consumeMine(mine);
    this.powerUpDirector.onSkyRaiderDestroyed(x, y);
    raider.deactivate();
    this.triggerSkyRaiderDestructionFX(x, y, variant);
    this.registerSpecialKillForLevel();
    const basePoints = variant === 'lancer' ? 420 : 280;
    const points = basePoints + this.level * (variant === 'lancer' ? 34 : 22);
    this.addScore(this.comboManager.registerKill(x, y, points, this.time.now));
  }

  private handleMineHitUFO(mine: Phaser.Physics.Arcade.Image, ufo: UFO) {
    if (!mine?.active || !ufo?.active) return;
    if (!this.isArmedMine(mine)) return;

    const ufoX = ufo.x;
    const ufoY = ufo.y;
    const variant = ufo.getVariant();
    const bossPhase = ufo.getBossPhase?.() ?? 0;
    this.consumeMine(mine);

    if (variant === 'scout') {
      this.powerUpDirector.onUfoDestroyed(ufoX, ufoY, 'scout');
      ufo.deactivate();
      this.triggerUFODestructionFX(ufoX, ufoY, 'scout');
      this.powerUpTimer = Math.max(this.powerUpTimer, this.getScaledMagneticDuration(5000));
      this.player.setMagnetic(true);
      this.registerSpecialKillForLevel();
      const scoutPoints = 500 + this.level * 25;
      this.addScore(this.comboManager.registerKill(ufoX, ufoY, scoutPoints, this.time.now));
      this.ufoSpawnTimer = this.levelBossPendingDefeat
        ? Phaser.Math.Between(650, 1200)
        : this.computeNextUFOSpawnDelay('scout');
      if (this.playerStates[this.activePlayerIndex]) {
        this.playerStates[this.activePlayerIndex].powerUpTimer = this.powerUpTimer;
      }
      return;
    }

    this.powerUpDirector.onUfoDestroyed(ufoX, ufoY, 'boss');
    ufo.deactivate();
    this.triggerUFODestructionFX(ufoX, ufoY, 'boss');
    this.registerSpecialKillForLevel();
    this.powerUpTimer = Math.max(this.powerUpTimer, this.getScaledMagneticDuration(7000));
    this.player.setMagnetic(true);
    if (Phaser.Math.Between(0, 99) < 45) {
      const rewardPool = [PowerUpType.SHIELD, PowerUpType.CANNON_COOLING, PowerUpType.TRIPLE_SHOT];
      const reward = Phaser.Utils.Array.GetRandom(rewardPool);
      this.powerUpManager.activate(reward);
    }
    const bossPoints = 1800 + this.level * 220 + bossPhase * 120;
    this.addScore(this.comboManager.registerKill(ufoX, ufoY, bossPoints, this.time.now));
    if (this.levelBossPendingDefeat) {
      this.completeLevelAfterBossDefeat();
    }
    this.ufoSpawnTimer = this.levelBossPendingDefeat
      ? Phaser.Math.Between(650, 1200)
      : this.computeNextUFOSpawnDelay('boss');
    if (this.playerStates[this.activePlayerIndex]) {
      this.playerStates[this.activePlayerIndex].powerUpTimer = this.powerUpTimer;
    }
  }

  private handlePlayerHitPowerUp(_player: Player, powerUp: PowerUp) {
    this.audio.playPickup();
    this.powerUpManager.activate(powerUp.type);
    powerUp.deactivate();
  }

  private handlePlayerHitSkyRaiderShot(_player: Player, shot: SkyRaiderShot) {
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

  private handlePlayerHitSkyRaider(_player: Player, raider: SkyRaider) {
    if (!raider.active) return;
    const hitX = raider.x;
    const hitY = raider.y;
    raider.deactivate();

    const proxyEnemy = {
      active: true,
      x: hitX,
      y: hitY,
      disableBody: () => undefined,
    } as unknown as Enemy;

    this.handlePlayerHitEnemy(this.player, proxyEnemy);
  }

  private handleBulletHitSkyRaider(bullet: Bullet, raider: SkyRaider) {
    if (!bullet?.active || !raider?.active) return;

    bullet.disableBody(true, true);
    const x = raider.x;
    const y = raider.y;
    const variant = raider.getVariant();
    const hitResult = raider.applyBulletHit(1);

    if (!hitResult.destroyed) {
      this.explosionManager.triggerExplosion(x, y);
      this.audio.playExplosion();
      this.applyImpactShake(70, 0.0027);
      return;
    }

    this.triggerSkyRaiderDestructionFX(x, y, variant);
    this.powerUpDirector.onSkyRaiderDestroyed(x, y);
    this.registerSpecialKillForLevel();
    const basePoints = variant === 'lancer' ? 420 : 280;
    const points = basePoints + this.level * (variant === 'lancer' ? 34 : 22);
    this.addScore(this.comboManager.registerKill(x, y, points, this.time.now));
  }

  private triggerSkyRaiderDestructionFX(x: number, y: number, variant: SkyRaiderVariant) {
    this.explosionManager.triggerExplosion(x, y);
    this.explosionManager.triggerUFODebrisRing(x, y, variant === 'lancer' ? 'boss' : 'scout');
    this.audio.playExplosion();
    const color = variant === 'lancer' ? 0xff9be8 : 0x95f7ff;
    const startRadius = variant === 'lancer' ? 20 : 16;
    const endRadius = variant === 'lancer' ? 104 : 82;
    this.spawnImpactRing(x, y, color, startRadius, endRadius, 220);
    this.applyImpactShake(120, variant === 'lancer' ? 0.0062 : 0.0046);
  }

  private handleBulletHitUFO(bullet: Bullet, ufo: UFO) {
    if (!ufo.active || !bullet.active) return;

    const ufoX = ufo.x;
    const ufoY = ufo.y;
    const variant = ufo.getVariant();
    const bossPhase = ufo.getBossPhase?.() ?? 0;
    bullet.disableBody(true, true);
    bullet.setActive(false);
    bullet.setVisible(false);

    if (variant === 'scout') {
      // Scout should always pop instantly on hit to avoid stale/frozen visual states.
      this.powerUpDirector.onUfoDestroyed(ufoX, ufoY, 'scout');
      ufo.deactivate();
      this.triggerUFODestructionFX(ufoX, ufoY, 'scout');
      this.powerUpTimer = Math.max(this.powerUpTimer, this.getScaledMagneticDuration(5000));
      this.player.setMagnetic(true);
      this.registerSpecialKillForLevel();
      const scoutPoints = 500 + this.level * 25;
      this.addScore(this.comboManager.registerKill(ufoX, ufoY, scoutPoints, this.time.now));
      this.ufoSpawnTimer = this.levelBossPendingDefeat
        ? Phaser.Math.Between(650, 1200)
        : this.computeNextUFOSpawnDelay('scout');
      if (this.playerStates[this.activePlayerIndex]) {
        this.playerStates[this.activePlayerIndex].powerUpTimer = this.powerUpTimer;
      }
      return;
    }

    const hitResult = ufo.applyBulletHit(1);
    if (!hitResult.destroyed) {
      ufo.ensureCombatReady();
      this.explosionManager.triggerExplosion(ufoX, ufoY);
      this.audio.playExplosion();
      this.triggerHitStop(
        JUICE_TUNING.bossHitStopMs,
        JUICE_TUNING.bossHitStopScale,
        JUICE_TUNING.hitStopCooldownMs,
      );
      this.applyImpactShake(95, 0.0038);
      this.spawnImpactRing(ufoX, ufoY, 0x9ef8ff, 18, 58, 160);
      this.updateHUDDisplay();
      return;
    }

    this.powerUpDirector.onUfoDestroyed(ufoX, ufoY, 'boss');
    this.triggerUFODestructionFX(ufoX, ufoY, variant);
    this.registerSpecialKillForLevel();

    this.powerUpTimer = Math.max(this.powerUpTimer, this.getScaledMagneticDuration(7000));
    this.player.setMagnetic(true);
    if (Phaser.Math.Between(0, 99) < 45) {
      const rewardPool = [PowerUpType.SHIELD, PowerUpType.CANNON_COOLING, PowerUpType.TRIPLE_SHOT];
      const reward = Phaser.Utils.Array.GetRandom(rewardPool);
      this.powerUpManager.activate(reward);
    }
    const bossPoints = 1800 + this.level * 220 + bossPhase * 120;
    this.addScore(this.comboManager.registerKill(ufoX, ufoY, bossPoints, this.time.now));
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
    const shakeIntensity = 0.0064;
    const shakeDuration = 190;

    this.explosionManager.triggerExplosion(x, y);
    this.explosionManager.triggerUFODebrisRing(x, y, variant);
    this.audio.playExplosion();
    this.triggerHitStop(
      JUICE_TUNING.eliteHitStopMs,
      JUICE_TUNING.eliteHitStopScale,
      JUICE_TUNING.hitStopCooldownMs,
    );
    this.applyImpactShake(shakeDuration, shakeIntensity);
    this.spawnImpactRing(x, y, 0x9ef8ff, 24, 92, 240);

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
    this.triggerHitStop(
      JUICE_TUNING.bossKillHitStopMs,
      JUICE_TUNING.bossKillHitStopScale,
      JUICE_TUNING.hitStopCooldownMs + 120,
    );
    this.applyImpactShake(720, 0.019);
    this.spawnImpactRing(x, y, 0xff6de0, 34, 188, 320);
    this.cameras.main.flash(220, 210, 150, 255, false);

    const wave = this.add.graphics().setDepth(145);
    const waveState = { r: 24, a: 0.95 };
    this.tweens.add({
      targets: waveState,
      r: 320,
      a: 0,
      duration: 920,
      ease: 'Expo.easeOut',
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

  private handlePlayerHitUFOProjectile(_player: Player, projectile: UFOProjectile) {
    if (!projectile.active) return;
    const hitX = projectile.x;
    const hitY = projectile.y;
    projectile.disableBody(true, true);

    const proxyEnemy = {
      active: true,
      x: hitX,
      y: hitY,
      disableBody: () => undefined,
    } as unknown as Enemy;

    this.handlePlayerHitEnemy(this.player, proxyEnemy);
  }

  private handleBulletHitEnemy(bullet: Bullet, enemy: Enemy) {
    if (bullet.active && enemy.active) {
      const x = enemy.x;
      const y = enemy.y;
      const points = Math.floor(100 / enemy.scaleX);
      const wasSwarm = enemy.swarmId > 0;
      bullet.disableBody(true, true);
      this.powerUpDirector.onAsteroidDestroyed(enemy.x, enemy.y);
      this.enemyManager.splitAsteroid(enemy.x, enemy.y, enemy.scaleX);
      enemy.disableBody(true, true);
      this.registerAsteroidKillForLevel();
      if (enemy.scaleX >= JUICE_TUNING.largeAsteroidMinScale) {
        this.triggerHitStop(
          JUICE_TUNING.largeAsteroidHitStopMs,
          JUICE_TUNING.largeAsteroidHitStopScale,
          JUICE_TUNING.hitStopCooldownMs,
        );
        this.applyImpactShake(80, 0.003);
      }
      this.enqueuePendingEnemyHit(x, y, points, 'bullet');
      if (wasSwarm) this.onSwarmEnemyKilled(enemy, x, y);
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
    const multipliedPoints =
      points > 0 ? this.comboManager.registerKill(x, y, points, this.time.now) : 0;
    statsManager.onKill();
    statsManager.updateHighestCombo(this.comboManager.getState().comboCount);
    this.pendingEnemyHits.push({ x, y, points: multipliedPoints, source });
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

  private handlePlayerHitEnemy(_player: Player, enemy: Enemy) {
    if (this.isGameOver || this.isSwitching || this.isLevelTransition) return;
    if (!enemy.active) return;
    if (this.player.getShieldActive()) {
      this.powerUpManager.deactivate(PowerUpType.SHIELD);
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
    this.updateHUDDisplay();
    this.explosionManager.triggerPlayerDeathExplosion(this.player.x, this.player.y);
    this.audio.playPlayerDeath();
    this.triggerHitStop(
      JUICE_TUNING.playerHitStopMs,
      JUICE_TUNING.playerHitStopScale,
      JUICE_TUNING.hitStopCooldownMs + 100,
    );
    this.showDamageOverlay();
    this.applyImpactShake(460, 0.031);
    this.spawnImpactRing(this.player.x, this.player.y, 0xff8c8c, 22, 98, 220);
    this.powerUpDirector.resetDamageFreeTime();
    this.comboManager.reset();
    statsManager.onDeath();

    if (this.playerCount === 1) {
      if (this.lives <= 0) {
        this.endGame();
      } else {
        this.respawnPlayerSafely(SPAWN_PROTECTION_TUNING.respawnGraceMs);
        if (!this.earlySupportDropGranted && this.levelElapsedMs < 28000) {
          this.earlySupportDropTimerMs = Math.min(this.earlySupportDropTimerMs, 500);
        }
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
    this.spawnProtectionTimerMs = 0;
    this.stopSpawnProtectionVisuals();
    this.finishLevelTransitionCountdown(false);
    this.ufo.setCombatTarget(null);
    this.ufo.deactivate();
    this.skyRaiderManager.setCombatTarget(null);
    this.skyRaiderManager.deactivateAll();
    this.clearProximityMines();
    this.clearWorldEvents('reset');
    this.removeShieldBunkers();
    this.physics.world.pause();
    this.player.setActive(false).setVisible(false);
    this.saveActivePlayerState();
    statsManager.updateHighestLevel(this.level);
    statsManager.onGameEnd(this.score);
    this.switchTimer?.remove(false);
    this.time.delayedCall(LEVEL_TRANSITION_TUNING.gameOverTransitionDelayMs, () => {
      this.scene.stop('PauseScene');
      this.scene.start('GameOverScene', {
        scores: this.playerStates.map((state) => state.score),
        players: this.playerCount,
        difficulty: this.difficultyKey,
        dailySeed: this.dailySeed,
      });
    });
  }

  private createHUD() {
    const isCompactHud = GAME_WIDTH <= 720;
    const hudMarginX = isCompactHud ? 18 : 30;
    const topRowY = isCompactHud ? 16 : 30;
    const rowGap = isCompactHud ? 24 : 30;
    const levelRowY =
      this.playerCount === 2
        ? isCompactHud
          ? topRowY + rowGap * 2
          : topRowY
        : isCompactHud
          ? topRowY + rowGap
          : topRowY;
    const pauseButtonY = isCompactHud ? topRowY + rowGap * 2 + 4 : 80;
    const helpButtonY = isCompactHud ? pauseButtonY + 42 : 130;
    const style = {
      fontFamily: '"Press Start 2P"',
      fontSize: isCompactHud ? '16px' : '20px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 4,
    };
    const smallStyle = {
      fontFamily: '"Press Start 2P"',
      fontSize: isCompactHud ? '12px' : '14px',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 3,
    };
    if (this.playerCount === 2) {
      this.p1ScoreText = this.add.text(hudMarginX, topRowY, 'P1 SCORE: 0', style).setDepth(100);
      this.p2ScoreText = this.add
        .text(GAME_WIDTH - hudMarginX, topRowY, 'P2 SCORE: 0', style)
        .setOrigin(1, 0)
        .setDepth(100);
      this.p1LivesText = this.add
        .text(hudMarginX, topRowY + rowGap, 'P1 LIVES: 3', smallStyle)
        .setDepth(100);
      this.p2LivesText = this.add
        .text(GAME_WIDTH - hudMarginX, topRowY + rowGap, 'P2 LIVES: 3', smallStyle)
        .setOrigin(1, 0)
        .setDepth(100);
      this.activeMarkerLeft = this.add.text(8, topRowY, '>', style).setDepth(101);
      this.activeMarkerRight = this.add
        .text(GAME_WIDTH - 8, topRowY, '<', style)
        .setOrigin(1, 0)
        .setDepth(101);
    } else {
      this.p1ScoreText = this.add.text(hudMarginX, topRowY, 'SCORE: 0', style).setDepth(100);
      this.p1LivesText = this.add
        .text(GAME_WIDTH - hudMarginX, topRowY, 'LIVES: 3', style)
        .setOrigin(1, 0)
        .setDepth(100);
    }
    const mineY = this.playerCount === 2 ? topRowY + rowGap * 2 : topRowY + rowGap;
    this.mineChargesText = this.add
      .text(GAME_WIDTH - hudMarginX, mineY, 'MINES: 0', smallStyle)
      .setOrigin(1, 0)
      .setDepth(100);
    this.mineDeployHintText = this.add
      .text(GAME_WIDTH - hudMarginX, mineY + (isCompactHud ? 14 : 18), '', {
        fontFamily: '"Press Start 2P"',
        fontSize: isCompactHud ? '9px' : '10px',
        color: '#ffb347',
        stroke: '#000000',
        strokeThickness: 2,
      })
      .setOrigin(1, 0)
      .setAlpha(0)
      .setDepth(101);
    this.levelText = this.add
      .text(GAME_WIDTH / 2, levelRowY, 'LEVEL 1', {
        fontFamily: '"Press Start 2P"',
        fontSize: isCompactHud ? '13px' : '16px',
        color: '#ffd966',
        stroke: '#000000',
        strokeThickness: 3,
      })
      .setOrigin(0.5, 0)
      .setDepth(100);
    const comboHudY = levelRowY + (isCompactHud ? 18 : 22);
    this.comboManager.createHUD(comboHudY, isCompactHud);
    const debugY =
      this.playerCount === 2
        ? isCompactHud
          ? topRowY + rowGap * 3 + 6
          : 90
        : isCompactHud
          ? topRowY + rowGap * 2 + 6
          : 78;
    const powerY = isCompactHud ? debugY + 40 : this.playerCount === 2 ? 130 : 118;
    this.debugText = this.add
      .text(hudMarginX, debugY, '', {
        fontFamily: '"Press Start 2P"',
        fontSize: isCompactHud ? '10px' : '12px',
        color: '#00ff00',
      })
      .setDepth(100);
    this.debugStatsText = this.add
      .text(hudMarginX, debugY + (isCompactHud ? 14 : 18), '', {
        fontFamily: '"Press Start 2P"',
        fontSize: isCompactHud ? '9px' : '11px',
        color: '#8cffb8',
      })
      .setDepth(100);
    this.powerUpListText = this.add
      .text(hudMarginX, powerY, '', {
        fontFamily: '"Press Start 2P"',
        fontSize: isCompactHud ? '12px' : '14px',
        color: '#00ffff',
      })
      .setDepth(100);
    this.perkText = this.add
      .text(hudMarginX, powerY + (isCompactHud ? 46 : 58), 'PERKS L+0 C+0 M+0', {
        fontFamily: '"Press Start 2P"',
        fontSize: isCompactHud ? '10px' : '11px',
        color: '#9effd0',
      })
      .setDepth(100);

    // Initialize HUDManager
    const hudComponents: HUDComponents = {
      p1ScoreText: this.p1ScoreText,
      p2ScoreText: this.p2ScoreText,
      p1LivesText: this.p1LivesText,
      p2LivesText: this.p2LivesText,
      levelText: this.levelText,
      mineChargesText: this.mineChargesText,
      perkText: this.perkText,
      powerUpBar: this.powerUpBar,
      heatBar: this.heatBar,
      activeMarkerLeft: this.activeMarkerLeft,
      activeMarkerRight: this.activeMarkerRight,
    };
    const hudConfig: HUDManagerConfig = {
      gameWidth: GAME_WIDTH,
    };
    this.hudManager = new HUDManager(this, hudComponents, hudConfig);

    // Initialize PowerUpManager with callbacks to existing methods
    const powerUpCallbacks: PowerUpCallbacks = {
      onTripleShotChanged: (active) => this.player.setTripleShot(active),
      onSlowMotionChanged: (active) => this.applySlowMo(active),
      onShieldChanged: (active) => this.player.setShield(active),
      onGhostPhaseChanged: (active, silent) => this.applyGhost(active, silent),
      onCannonCoolingChanged: (active) => this.player.setCannonCooling(active),
      onBlackHoleVisualChanged: (active) => this.player.setBlackHoleVisual(active),
      onDronesSpawn: () => this.spawnDrones(),
      onDronesRemove: () => this.removeDrones(),
      onBlackHoleSpawn: () => this.spawnBlackHole(),
      onBlackHoleRemove: () => this.removeBlackHole(),
      onShieldBunkersSpawn: () => this.spawnShieldBunkers(),
      onShieldBunkersRemove: () => this.removeShieldBunkers(),
      onEMPTrigger: () => this.triggerEMP(),
      onMineChargesAdd: (charges) => this.addMineDeployCharges(charges),
      onPowerUpAudioPlay: (type) => {
        // Audio handled by specific callbacks (EMP, Drones, Ghost already play)
        if (
          type !== PowerUpType.EMP_WAVE &&
          type !== PowerUpType.WINGMAN_DRONES &&
          type !== PowerUpType.GHOST_PHASE
        ) {
          this.audio.playPickup();
        }
      },
      onActivePowerUpsChanged: (activePowerUps) => this.syncActivePowerUpsToState(activePowerUps),
    };
    const powerUpConfig: PowerUpManagerConfig = {
      getDuration: (type) => this.getPowerUpDuration(type),
    };
    this.powerUpManager = new PowerUpManager(powerUpCallbacks, powerUpConfig);
    const initialPowerUps = this.playerStates[this.activePlayerIndex]?.activePowerUps ?? new Map();
    this.powerUpManager.loadState(initialPowerUps);

    this.milestoneText = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT * 0.32, '', {
        fontFamily: '"Press Start 2P"',
        fontSize: `${MILESTONE_TUNING.fontSize}px`,
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 5,
      })
      .setOrigin(0.5)
      .setDepth(MILESTONE_TUNING.textDepth)
      .setVisible(false);
    if (this.dailySeed) {
      this.add
        .text(GAME_WIDTH / 2, isCompactHud ? 6 : 10, 'DAILY CHALLENGE', {
          fontFamily: '"Press Start 2P"',
          fontSize: isCompactHud ? '9px' : '10px',
          color: '#ffcc44',
          stroke: '#000000',
          strokeThickness: 2,
        })
        .setOrigin(0.5, 0)
        .setDepth(100);
    }
    this.setDebugOverlayVisible(this.debugOverlayEnabled);
    if (this.debugOverlayEnabled) {
      this.debugRefreshMs = 0;
      this.updateHUDDisplay();
    }
    const pauseBtn = this.add
      .text(GAME_WIDTH - hudMarginX, pauseButtonY, '|| PAUSE (P)', {
        fontFamily: '"Press Start 2P"',
        fontSize: isCompactHud ? '13px' : '16px',
        color: '#ffffff',
        backgroundColor: '#333333',
        padding: isCompactHud ? { x: 8, y: 8 } : { x: 10, y: 10 },
      })
      .setOrigin(1, 0)
      .setInteractive({ useHandCursor: true })
      .setDepth(100);
    pauseBtn.on('pointerdown', () => this.requestPause());

    const helpBtn = this.add
      .text(GAME_WIDTH - hudMarginX, helpButtonY, 'HELP (H)', {
        fontFamily: '"Press Start 2P"',
        fontSize: isCompactHud ? '13px' : '16px',
        color: '#ffffff',
        backgroundColor: '#333333',
        padding: isCompactHud ? { x: 8, y: 8 } : { x: 10, y: 10 },
      })
      .setOrigin(1, 0)
      .setInteractive({ useHandCursor: true })
      .setDepth(100);
    helpBtn.on('pointerdown', () => this.openHelp());
    this.input.keyboard?.on('keydown-P', () => this.requestPause());
    this.input.keyboard?.on('keydown-ESC', () => this.requestPause());
    this.input.keyboard?.on('keydown-H', () => this.openHelp());
    this.input.keyboard?.on('keydown-D', () => this.toggleDebugOverlay());
    this.input.keyboard?.on('keydown-B', () => this.triggerShieldBunkerTest());
    this.input.keyboard?.on('keydown-M', () => this.tryDeployMineFieldFromInput());
    this.mineDeployPointerHandler = (pointer, currentlyOver) =>
      this.handleMineDeployPointerDown(pointer, currentlyOver);
    this.input.on('pointerdown', this.mineDeployPointerHandler);

    this.onBlur = () => this.requestPause();
    this.onHidden = () => this.requestPause();
    this.game.events.on('blur', this.onBlur);
    this.game.events.on(Phaser.Core.Events.HIDDEN, this.onHidden);
  }

  private setDebugOverlayVisible(visible: boolean) {
    this.debugText.setVisible(visible);
    this.debugStatsText.setVisible(visible);
    this.powerUpListText.setVisible(visible);
    this.perkText.setVisible(visible);
  }

  public setDebugOverlayFromSettings(enabled: boolean) {
    this.debugOverlayEnabled = enabled;
    setDebugOverlayEnabled(this.debugOverlayEnabled);
    this.setDebugOverlayVisible(this.debugOverlayEnabled);
    if (this.debugOverlayEnabled) {
      this.debugRefreshMs = 0;
      this.updateHUDDisplay();
      return;
    }
    this.lastDebugLine = '';
    this.lastDebugStatsLine = '';
    this.debugText.setText('');
    this.debugStatsText.setText('');
    this.powerUpListText.setText('');
  }

  private toggleDebugOverlay() {
    this.setDebugOverlayFromSettings(!this.debugOverlayEnabled);
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

    if (!this.textures.exists(PROXIMITY_MINE_TEXTURE_KEY)) {
      const texture = this.textures.createCanvas(PROXIMITY_MINE_TEXTURE_KEY, 30, 30);
      if (texture) {
        const ctx = texture.getContext();
        ctx.clearRect(0, 0, 30, 30);

        const shadow = ctx.createRadialGradient(15, 16.5, 2, 15, 16.5, 13.5);
        shadow.addColorStop(0, 'rgba(0, 0, 0, 0.52)');
        shadow.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = shadow;
        ctx.beginPath();
        ctx.arc(15, 16.5, 13.5, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.arc(15, 15, 9.6, 0, Math.PI * 2);
        const hullGrad = ctx.createLinearGradient(7, 6, 23, 24);
        hullGrad.addColorStop(0, '#7f8996');
        hullGrad.addColorStop(0.46, '#37414f');
        hullGrad.addColorStop(1, '#171e28');
        ctx.fillStyle = hullGrad;
        ctx.fill();
        ctx.strokeStyle = 'rgba(226, 236, 248, 0.88)';
        ctx.lineWidth = 1.2;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(15, 15, 5.9, 0, Math.PI * 2);
        const coreGrad = ctx.createRadialGradient(15, 14, 0.8, 15, 15, 6.2);
        coreGrad.addColorStop(0, 'rgba(255, 247, 217, 1)');
        coreGrad.addColorStop(0.35, 'rgba(255, 210, 126, 0.95)');
        coreGrad.addColorStop(1, 'rgba(255, 120, 52, 0.5)');
        ctx.fillStyle = coreGrad;
        ctx.fill();

        for (let i = 0; i < 8; i++) {
          const angle = (i / 8) * Math.PI * 2;
          const ix = 15 + Math.cos(angle) * 9.6;
          const iy = 15 + Math.sin(angle) * 9.6;
          const ox = 15 + Math.cos(angle) * 13.1;
          const oy = 15 + Math.sin(angle) * 13.1;
          ctx.strokeStyle = 'rgba(232, 242, 255, 0.86)';
          ctx.lineWidth = 1.1;
          ctx.beginPath();
          ctx.moveTo(ix, iy);
          ctx.lineTo(ox, oy);
          ctx.stroke();
        }

        ctx.strokeStyle = 'rgba(245, 171, 92, 0.8)';
        ctx.lineWidth = 0.95;
        ctx.beginPath();
        ctx.arc(15, 15, 3.1, 0, Math.PI * 2);
        ctx.stroke();

        texture.refresh();
      }
    }

    if (!this.textures.exists(IMPACT_RING_TEXTURE_KEY)) {
      const ringG = this.add.graphics();
      ringG.setVisible(false);
      ringG.lineStyle(8, 0xffffff, 1);
      ringG.strokeCircle(
        IMPACT_RING_TEXTURE_SIZE / 2,
        IMPACT_RING_TEXTURE_SIZE / 2,
        IMPACT_RING_TEXTURE_RADIUS,
      );
      ringG.generateTexture(
        IMPACT_RING_TEXTURE_KEY,
        IMPACT_RING_TEXTURE_SIZE,
        IMPACT_RING_TEXTURE_SIZE,
      );
      ringG.destroy();
    }

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
      const texture = this.textures.createCanvas('elite_drone', 32, 28);
      if (texture) {
        const ctx = texture.getContext();
        ctx.clearRect(0, 0, 32, 28);

        const bodyGradient = ctx.createLinearGradient(4, 6, 28, 22);
        bodyGradient.addColorStop(0, '#63778d');
        bodyGradient.addColorStop(0.45, '#2a394d');
        bodyGradient.addColorStop(1, '#10161f');
        ctx.fillStyle = bodyGradient;
        ctx.beginPath();
        ctx.moveTo(8, 6);
        ctx.lineTo(24, 6);
        ctx.quadraticCurveTo(30, 6, 30, 12);
        ctx.lineTo(30, 16);
        ctx.quadraticCurveTo(30, 22, 24, 22);
        ctx.lineTo(8, 22);
        ctx.quadraticCurveTo(2, 22, 2, 16);
        ctx.lineTo(2, 12);
        ctx.quadraticCurveTo(2, 6, 8, 6);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(226, 241, 255, 0.88)';
        ctx.lineWidth = 1.4;
        ctx.stroke();

        ctx.fillStyle = 'rgba(13, 20, 31, 0.92)';
        ctx.beginPath();
        ctx.moveTo(9, 9);
        ctx.lineTo(23, 9);
        ctx.lineTo(25, 14);
        ctx.lineTo(23, 19);
        ctx.lineTo(9, 19);
        ctx.lineTo(7, 14);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = 'rgba(123, 162, 199, 0.45)';
        ctx.lineWidth = 1;
        ctx.stroke();

        const eyeGlow = ctx.createRadialGradient(16, 14, 0.7, 16, 14, 6.3);
        eyeGlow.addColorStop(0, 'rgba(236, 251, 255, 1)');
        eyeGlow.addColorStop(0.35, 'rgba(142, 240, 255, 0.82)');
        eyeGlow.addColorStop(1, 'rgba(76, 191, 255, 0)');
        ctx.fillStyle = eyeGlow;
        ctx.beginPath();
        ctx.arc(16, 14, 6.1, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(214, 248, 255, 0.95)';
        ctx.beginPath();
        ctx.arc(16, 14, 2.6, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = 'rgba(188, 224, 255, 0.35)';
        ctx.lineWidth = 0.85;
        ctx.beginPath();
        ctx.moveTo(6.5, 14);
        ctx.lineTo(25.5, 14);
        ctx.moveTo(9, 18.5);
        ctx.lineTo(23, 18.5);
        ctx.stroke();

        const topBeacon = ctx.createRadialGradient(16, 4, 0.4, 16, 4, 3.3);
        topBeacon.addColorStop(0, 'rgba(241, 255, 255, 1)');
        topBeacon.addColorStop(0.5, 'rgba(154, 255, 238, 0.9)');
        topBeacon.addColorStop(1, 'rgba(90, 205, 175, 0)');
        ctx.fillStyle = topBeacon;
        ctx.beginPath();
        ctx.arc(16, 4, 3.1, 0, Math.PI * 2);
        ctx.fill();

        texture.refresh();
      }
    }

    if (!this.textures.exists(WINGMAN_DRONE_TEXTURE_KEY)) {
      const texture = this.textures.createCanvas(WINGMAN_DRONE_TEXTURE_KEY, 34, 26);
      if (texture) {
        const ctx = texture.getContext();
        const hullPoints = [
          { x: 17, y: 2 },
          { x: 30, y: 8 },
          { x: 27, y: 21 },
          { x: 17, y: 24 },
          { x: 7, y: 21 },
          { x: 4, y: 8 },
        ];
        const traceHull = (xOffset: number = 0, yOffset: number = 0) => {
          ctx.beginPath();
          ctx.moveTo(hullPoints[0].x + xOffset, hullPoints[0].y + yOffset);
          for (let i = 1; i < hullPoints.length; i++) {
            ctx.lineTo(hullPoints[i].x + xOffset, hullPoints[i].y + yOffset);
          }
          ctx.closePath();
        };
        ctx.clearRect(0, 0, 34, 26);

        traceHull(0.4, 1.2);
        ctx.fillStyle = 'rgba(0,0,0,0.36)';
        ctx.fill();

        traceHull();
        const bodyGradient = ctx.createLinearGradient(6, 3, 28, 22);
        bodyGradient.addColorStop(0, '#58677c');
        bodyGradient.addColorStop(0.45, '#253246');
        bodyGradient.addColorStop(1, '#0d121a');
        ctx.fillStyle = bodyGradient;
        ctx.fill();
        ctx.strokeStyle = 'rgba(212, 233, 255, 0.88)';
        ctx.lineWidth = 1.35;
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(17, 5);
        ctx.lineTo(25, 9);
        ctx.lineTo(23.5, 17.5);
        ctx.lineTo(17, 20);
        ctx.lineTo(10.5, 17.5);
        ctx.lineTo(9, 9);
        ctx.closePath();
        const panelGradient = ctx.createLinearGradient(17, 5, 17, 20);
        panelGradient.addColorStop(0, '#111a28');
        panelGradient.addColorStop(1, '#080c12');
        ctx.fillStyle = panelGradient;
        ctx.fill();
        ctx.strokeStyle = 'rgba(124, 159, 194, 0.45)';
        ctx.lineWidth = 0.9;
        ctx.stroke();

        const eyeGlow = ctx.createRadialGradient(17, 12, 0.6, 17, 12, 5.2);
        eyeGlow.addColorStop(0, 'rgba(206, 244, 255, 1)');
        eyeGlow.addColorStop(0.4, 'rgba(110, 217, 255, 0.82)');
        eyeGlow.addColorStop(1, 'rgba(36, 145, 220, 0)');
        ctx.beginPath();
        ctx.arc(17, 12, 5, 0, Math.PI * 2);
        ctx.fillStyle = eyeGlow;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(17, 12, 2.2, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(235, 250, 255, 0.94)';
        ctx.fill();

        ctx.beginPath();
        ctx.moveTo(8, 10.5);
        ctx.lineTo(14, 9);
        ctx.moveTo(26, 10.5);
        ctx.lineTo(20, 9);
        ctx.moveTo(9.5, 17.5);
        ctx.lineTo(14.5, 16.7);
        ctx.moveTo(24.5, 16.7);
        ctx.lineTo(19.5, 17.5);
        ctx.strokeStyle = 'rgba(222, 240, 255, 0.42)';
        ctx.lineWidth = 0.85;
        ctx.stroke();

        ctx.fillStyle = 'rgba(145, 190, 228, 0.66)';
        ctx.fillRect(8.5, 21.2, 17, 1);
        ctx.fillStyle = 'rgba(255, 187, 108, 0.78)';
        ctx.beginPath();
        ctx.arc(11.2, 22.4, 1.15, 0, Math.PI * 2);
        ctx.arc(22.8, 22.4, 1.15, 0, Math.PI * 2);
        ctx.fill();

        texture.refresh();
      }
    }

    if (!this.textures.exists('shield_bunker')) {
      const texture = this.textures.createCanvas('shield_bunker', 140, 52);
      if (texture) {
        const ctx = texture.getContext();
        ctx.clearRect(0, 0, 140, 52);

        const traceRoundedRect = (
          x: number,
          y: number,
          width: number,
          height: number,
          radius: number,
        ) => {
          const r = Math.min(radius, width * 0.5, height * 0.5);
          ctx.beginPath();
          ctx.moveTo(x + r, y);
          ctx.lineTo(x + width - r, y);
          ctx.quadraticCurveTo(x + width, y, x + width, y + r);
          ctx.lineTo(x + width, y + height - r);
          ctx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
          ctx.lineTo(x + r, y + height);
          ctx.quadraticCurveTo(x, y + height, x, y + height - r);
          ctx.lineTo(x, y + r);
          ctx.quadraticCurveTo(x, y, x + r, y);
          ctx.closePath();
        };

        traceRoundedRect(5, 5, 130, 42, 10);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.33)';
        ctx.fill();

        traceRoundedRect(4, 3, 132, 44, 10);
        const hullGradient = ctx.createLinearGradient(6, 3, 132, 47);
        hullGradient.addColorStop(0, '#8f9dac');
        hullGradient.addColorStop(0.38, '#4c5868');
        hullGradient.addColorStop(1, '#1f2935');
        ctx.fillStyle = hullGradient;
        ctx.fill();
        ctx.strokeStyle = 'rgba(219, 235, 255, 0.82)';
        ctx.lineWidth = 1.6;
        ctx.stroke();

        traceRoundedRect(8, 7, 124, 36, 8);
        const innerPlateGradient = ctx.createLinearGradient(8, 7, 8, 43);
        innerPlateGradient.addColorStop(0, 'rgba(21, 30, 41, 0.93)');
        innerPlateGradient.addColorStop(1, 'rgba(8, 12, 18, 0.95)');
        ctx.fillStyle = innerPlateGradient;
        ctx.fill();
        ctx.strokeStyle = 'rgba(124, 148, 174, 0.58)';
        ctx.lineWidth = 1;
        ctx.stroke();

        const topGlow = ctx.createLinearGradient(0, 8, 0, 18);
        topGlow.addColorStop(0, 'rgba(175, 234, 255, 0.54)');
        topGlow.addColorStop(1, 'rgba(175, 234, 255, 0)');
        ctx.fillStyle = topGlow;
        ctx.fillRect(14, 9, 112, 8);

        ctx.strokeStyle = 'rgba(210, 226, 244, 0.32)';
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(24, 14);
        ctx.lineTo(116, 14);
        ctx.moveTo(44, 8);
        ctx.lineTo(44, 42);
        ctx.moveTo(96, 8);
        ctx.lineTo(96, 42);
        ctx.stroke();

        const ventXs = [24, 61, 98];
        for (const x of ventXs) {
          const ventGradient = ctx.createLinearGradient(x, 22, x, 50);
          ventGradient.addColorStop(0, 'rgba(2, 6, 11, 0.95)');
          ventGradient.addColorStop(1, 'rgba(0, 0, 0, 1)');
          ctx.fillStyle = ventGradient;
          ctx.fillRect(x, 22, 18, 28);

          ctx.strokeStyle = 'rgba(145, 168, 198, 0.44)';
          ctx.lineWidth = 0.9;
          ctx.strokeRect(x + 0.5, 22.5, 17, 27);

          ctx.strokeStyle = 'rgba(102, 122, 152, 0.5)';
          ctx.lineWidth = 0.7;
          ctx.beginPath();
          ctx.moveTo(x + 6, 23);
          ctx.lineTo(x + 6, 49);
          ctx.moveTo(x + 12, 23);
          ctx.lineTo(x + 12, 49);
          ctx.stroke();

          const diodeGlow = ctx.createRadialGradient(x + 9, 21, 0.6, x + 9, 21, 4.8);
          diodeGlow.addColorStop(0, 'rgba(153, 241, 255, 0.95)');
          diodeGlow.addColorStop(1, 'rgba(45, 175, 225, 0)');
          ctx.fillStyle = diodeGlow;
          ctx.beginPath();
          ctx.arc(x + 9, 21, 4.5, 0, Math.PI * 2);
          ctx.fill();
        }

        ctx.strokeStyle = 'rgba(154, 203, 227, 0.75)';
        ctx.lineWidth = 1.35;
        ctx.beginPath();
        ctx.moveTo(13, 17);
        ctx.lineTo(127, 17);
        ctx.stroke();

        const rivets = [18, 33, 48, 63, 78, 93, 108, 123];
        ctx.fillStyle = 'rgba(218, 235, 255, 0.72)';
        for (const x of rivets) {
          ctx.beginPath();
          ctx.arc(x, 6.8, 0.9, 0, Math.PI * 2);
          ctx.fill();
        }

        texture.refresh();
      }
    }
  }

  private rollFloatRange(range: readonly [number, number]) {
    return Phaser.Math.FloatBetween(range[0], range[1]);
  }

  private isBackgroundDecorTierActive(
    tier: BackgroundDecorTier,
  ): tier is Exclude<BackgroundDecorTier, 'off'> {
    return tier !== 'off';
  }

  private resolveBackgroundDecorTier(): BackgroundDecorTier {
    if (this.game.renderer.type !== Phaser.WEBGL) return 'off';
    if (performanceMonitor.reducedParticles) return 'low';

    const gpu = this.gpuName.toUpperCase();
    if (!gpu) {
      return performanceMonitor.smokeEnabled ? 'medium' : 'low';
    }

    const highGpuPattern = /(NVIDIA|RTX|GTX|RADEON|\\bRX\\b|ARC|APPLE M|M1|M2|M3|M4)/;
    if (highGpuPattern.test(gpu)) return 'high';

    const lowGpuPattern = /(INTEL\\(R\\).*HD|INTEL\\(R\\).*UHD|IRIS|MESA|VEGA 3|VEGA 6|VEGA 8)/;
    if (lowGpuPattern.test(gpu)) return 'low';

    return performanceMonitor.smokeEnabled ? 'medium' : 'low';
  }

  private configureBackgroundDecor(force: boolean = false) {
    const nextTier = this.resolveBackgroundDecorTier();
    if (!force && nextTier === this.backgroundDecorTier) return;

    this.backgroundDecorTier = nextTier;
    if (!this.isBackgroundDecorTierActive(nextTier)) {
      this.backgroundDecorSpawnTimerMs = 0;
      this.clearBackgroundDecor();
      this.configureNebulaLayers(force);
      return;
    }

    this.createBackgroundDecorTextures();
    const maxActive = BACKGROUND_DECOR_TUNING.maxActive[nextTier];
    while (this.backgroundDecor.length > maxActive) {
      const removed = this.backgroundDecor.shift();
      removed?.sprite.destroy();
    }
    this.scheduleNextBackgroundDecorSpawn(true);
    this.configureNebulaLayers(force);
  }

  private scheduleNextBackgroundDecorSpawn(initial: boolean) {
    if (!this.isBackgroundDecorTierActive(this.backgroundDecorTier)) {
      this.backgroundDecorSpawnTimerMs = 0;
      return;
    }
    const range = initial
      ? BACKGROUND_DECOR_TUNING.initialSpawnDelayMs[this.backgroundDecorTier]
      : BACKGROUND_DECOR_TUNING.respawnDelayMs[this.backgroundDecorTier];
    this.backgroundDecorSpawnTimerMs = this.rollRange(range);
  }

  private createBackgroundDecorTextures() {
    this.createPlanetDecorTexture('bg_planet_cyan', 220, 0x2a6db7, 0x89d8ff);
    this.createPlanetDecorTexture('bg_planet_amber', 200, 0x8d5b2a, 0xf9c170);
    this.createPlanetDecorTexture('bg_planet_lilac', 210, 0x5b3f90, 0xd3b8ff);
    this.createGalaxyClusterTexture('bg_cluster_blue', 240, 0x74d0ff, 0x8c76ff);
    this.createGalaxyClusterTexture('bg_cluster_rose', 240, 0xffa4d6, 0xb58aff);
  }

  private createPlanetDecorTexture(
    key: string,
    size: number,
    baseColor: number,
    accentColor: number,
  ) {
    if (this.textures.exists(key)) return;
    const center = size / 2;
    const radius = size * 0.42;
    const g = this.make.graphics({ x: 0, y: 0 });
    g.fillStyle(baseColor, 0.95);
    g.fillCircle(center, center, radius);
    g.fillStyle(accentColor, 0.16);
    g.fillCircle(center - radius * 0.24, center - radius * 0.25, radius * 0.72);
    g.fillStyle(0x000000, 0.13);
    g.fillCircle(center + radius * 0.2, center + radius * 0.18, radius * 0.55);
    g.lineStyle(3, accentColor, 0.32);
    g.strokeCircle(center, center, radius * 1.02);
    g.lineStyle(2, accentColor, 0.15);
    g.strokeCircle(center, center, radius * 0.86);
    g.generateTexture(key, size, size);
    g.destroy();
  }

  private createGalaxyClusterTexture(
    key: string,
    size: number,
    coreColor: number,
    cloudColor: number,
  ) {
    if (this.textures.exists(key)) return;
    const texture = this.textures.createCanvas(key, size, size);
    if (!texture) return;
    const ctx = texture.getContext();
    const center = size * 0.5;

    const toRgb = (color: number) => ({
      r: (color >> 16) & 0xff,
      g: (color >> 8) & 0xff,
      b: color & 0xff,
    });
    const core = toRgb(coreColor);
    const cloud = toRgb(cloudColor);
    const rgba = (rgb: { r: number; g: number; b: number }, alpha: number) =>
      `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;

    ctx.clearRect(0, 0, size, size);

    for (let i = 0; i < 6; i++) {
      const cx = center + Phaser.Math.FloatBetween(-size * 0.14, size * 0.14);
      const cy = center + Phaser.Math.FloatBetween(-size * 0.12, size * 0.12);
      const rx = Phaser.Math.FloatBetween(size * 0.16, size * 0.34);
      const ry = rx * Phaser.Math.FloatBetween(0.42, 0.78);
      const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(angle);
      const glow = ctx.createRadialGradient(0, 0, rx * 0.06, 0, 0, rx);
      glow.addColorStop(0, rgba(cloud, Phaser.Math.FloatBetween(0.2, 0.35)));
      glow.addColorStop(1, rgba(cloud, 0));
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    for (let i = 0; i < 64; i++) {
      const dist = Phaser.Math.FloatBetween(0, size * 0.46);
      const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const px = center + Math.cos(angle) * dist;
      const py = center + Math.sin(angle) * dist * Phaser.Math.FloatBetween(0.45, 1);
      const radius = Phaser.Math.FloatBetween(0.6, 2.2);
      const starColor = i % 4 === 0 ? cloud : core;
      const alpha = Phaser.Math.FloatBetween(0.42, 0.96);
      ctx.fillStyle = rgba(starColor, alpha);
      ctx.beginPath();
      ctx.arc(px, py, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    // Soft radial alpha mask prevents hard rectangular edges during rotation.
    const edgeMask = ctx.createRadialGradient(
      center,
      center,
      size * 0.05,
      center,
      center,
      size * 0.5,
    );
    edgeMask.addColorStop(0, 'rgba(255,255,255,1)');
    edgeMask.addColorStop(0.7, 'rgba(255,255,255,0.96)');
    edgeMask.addColorStop(0.9, 'rgba(255,255,255,0.35)');
    edgeMask.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.globalCompositeOperation = 'destination-in';
    ctx.fillStyle = edgeMask;
    ctx.fillRect(0, 0, size, size);
    ctx.globalCompositeOperation = 'source-over';

    texture.refresh();
  }

  private spawnBackgroundDecor() {
    if (!this.isBackgroundDecorTierActive(this.backgroundDecorTier)) return;
    if (this.backgroundDecor.length >= BACKGROUND_DECOR_TUNING.maxActive[this.backgroundDecorTier])
      return;

    const planetChance = BACKGROUND_DECOR_TUNING.planetChancePercent[this.backgroundDecorTier];
    const isPlanet = Phaser.Math.Between(0, 99) < planetChance;
    const texturePool = isPlanet
      ? ['bg_planet_cyan', 'bg_planet_amber', 'bg_planet_lilac']
      : ['bg_cluster_blue', 'bg_cluster_rose'];
    const texture = Phaser.Utils.Array.GetRandom(texturePool);
    const fromSide = Phaser.Math.Between(0, 99) < 36;
    const width = this.scale.width;
    const height = this.scale.height;
    const cullPadding = BACKGROUND_DECOR_TUNING.cullPadding;

    let x = Phaser.Math.Between(-100, width + 100);
    let y = -cullPadding;
    let vx = this.rollFloatRange(BACKGROUND_DECOR_TUNING.driftSpeedRange);
    let vy = this.rollFloatRange(BACKGROUND_DECOR_TUNING.verticalSpeedRange);

    if (fromSide) {
      const fromLeft = Phaser.Math.Between(0, 1) === 0;
      x = fromLeft ? -cullPadding : width + cullPadding;
      y = Phaser.Math.Between(90, Math.round(height * 0.76));
      vx = fromLeft ? Phaser.Math.FloatBetween(12, 26) : Phaser.Math.FloatBetween(-26, -12);
      vy = this.rollFloatRange(BACKGROUND_DECOR_TUNING.verticalSpeedRange) * 0.45;
    }

    const scale = isPlanet
      ? this.rollFloatRange(BACKGROUND_DECOR_TUNING.planetScaleRange)
      : this.rollFloatRange(BACKGROUND_DECOR_TUNING.clusterScaleRange);
    const alpha = this.rollFloatRange(BACKGROUND_DECOR_TUNING.alphaRange);
    const sprite = this.add
      .image(x, y, texture)
      .setScale(scale)
      .setAlpha(alpha)
      .setDepth(BACKGROUND_DECOR_TUNING.depth);

    if (!isPlanet) {
      sprite.setBlendMode(Phaser.BlendModes.ADD);
    } else if (Phaser.Math.Between(0, 99) < 35) {
      sprite.setTint(0xd6edff);
    }

    this.backgroundDecor.push({
      sprite,
      vx,
      vy,
      spin: this.rollFloatRange(BACKGROUND_DECOR_TUNING.spinRange),
    });
  }

  private updateBackgroundDecor(delta: number) {
    if (!this.isBackgroundDecorTierActive(this.backgroundDecorTier)) return;

    this.backgroundDecorSpawnTimerMs -= delta;
    if (this.backgroundDecorSpawnTimerMs <= 0) {
      this.spawnBackgroundDecor();
      this.scheduleNextBackgroundDecorSpawn(false);
    }

    const width = this.scale.width;
    const height = this.scale.height;
    const cullPadding = BACKGROUND_DECOR_TUNING.cullPadding;

    for (let i = this.backgroundDecor.length - 1; i >= 0; i--) {
      const item = this.backgroundDecor[i];
      item.sprite.x += (item.vx * delta) / 1000;
      item.sprite.y += (item.vy * delta) / 1000;
      item.sprite.rotation += item.spin * delta;

      if (
        item.sprite.x < -cullPadding ||
        item.sprite.x > width + cullPadding ||
        item.sprite.y < -cullPadding ||
        item.sprite.y > height + cullPadding
      ) {
        item.sprite.destroy();
        this.backgroundDecor.splice(i, 1);
      }
    }
  }

  private clearBackgroundDecor() {
    for (const item of this.backgroundDecor) {
      item.sprite.destroy();
    }
    this.backgroundDecor.length = 0;
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
      minLevelDurationMs: LEVEL_PROGRESS_TUNING.minLevelDurationMs[this.difficultyKey],
      levelTimeRemainingMs: this.getRemainingBossGateTimeMs(),
      perks: {
        lifeBonus: state?.eliteLifePerkCount ?? 0,
        coolingLevel: state?.eliteCoolingPerkLevel ?? 0,
        magnetLevel: state?.eliteMagnetPerkLevel ?? 0,
      },
      worldEvents: {
        wormholeActive: Boolean(this.wormhole?.active),
        eliteDroneActive: Boolean(this.eliteDrone?.active),
        topRaidersActive: this.skyRaiderManager.getActiveRaiderCount(),
        topRaiderShotsActive: this.skyRaiderManager.getActiveProjectileCount(),
        shieldBunkerActive: this.powerUpManager.isActive(PowerUpType.SHIELD_BUNKER),
        shieldBunkerCount: this.shieldBunkers?.countActive(true) ?? 0,
        mineDeployCharges: this.mineDeployCharges,
        activeMines: this.proximityMines?.countActive(true) ?? 0,
        backgroundDecorTier: this.backgroundDecorTier,
        backgroundDecorCount: this.backgroundDecor.length,
        nebulaLayerCount: this.nebulaLayers.length,
      },
      spawnProtectionMs: Math.max(0, Math.round(this.spawnProtectionTimerMs)),
      levelOpening: {
        elapsedMs: Math.max(0, Math.round(this.levelElapsedMs)),
        startScore: this.levelStartScore,
        supportDropGranted: this.earlySupportDropGranted,
        supportDropInMs: Math.max(0, Math.round(this.earlySupportDropTimerMs)),
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
    const requirement = 6800 + ramp * 3200 + Math.pow(ramp, 1.28) * 900;
    return Math.round(requirement * this.difficultyPreset.levelCurveScale);
  }

  private getPowerUpDuration(type: PowerUpType) {
    const base =
      type === PowerUpType.CANNON_COOLING
        ? 9000
        : type === PowerUpType.SHIELD_BUNKER
          ? SHIELD_BUNKER_TUNING.baseDurationMs
          : 7000;
    const durationScale = Phaser.Math.Clamp(1 - (this.level - 1) * 0.04, 0.64, 1);
    return Math.round(base * durationScale * this.difficultyPreset.powerUpDurationScale);
  }
}
