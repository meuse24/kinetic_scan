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
  JUICE_TUNING,
  LEVEL_BONUS_TUNING,
  LEVEL_PROGRESS_TUNING,
  LEVEL_TRANSITION_TUNING,
  MILESTONE_TUNING,
  SHIELD_BUNKER_TUNING,
  SPAWN_PROTECTION_TUNING,
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
import { bootstrapMainSceneGraphics } from './MainSceneGraphics';
import { MainHazardsSystem } from './systems/MainHazardsSystem';
import { MainLevelFlowSystem } from './systems/MainLevelFlowSystem';
import type { LevelBonusPayout } from './systems/MainLevelFlowSystem';
import { MainMilestoneSystem } from './systems/MainMilestoneSystem';
import { MainMineFieldSystem } from './systems/MainMineFieldSystem';
import { MainPowerUpNoticeSystem } from './systems/MainPowerUpNoticeSystem';
import { MainWorldEvents } from './systems/MainWorldEvents';

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
  private levelFlow: MainLevelFlowSystem = new MainLevelFlowSystem();
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

  private impactRingPool!: Phaser.GameObjects.Group;
  private impactRingTweens: Map<Phaser.GameObjects.Image, Phaser.Tweens.Tween> = new Map();
  private worldEvents!: MainWorldEvents;
  private hazards!: MainHazardsSystem;
  private milestones!: MainMilestoneSystem;
  private mineField!: MainMineFieldSystem;
  private powerUpNotices!: MainPowerUpNoticeSystem;
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
  private milestoneText!: Phaser.GameObjects.Text;
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
  private mineDeployCharges: number = INITIAL_MINE_DEPLOY_CHARGES;
  private mineDeployHintCooldownUntil: number = 0;
  private lastPlayerRecoilAt: number = -1000;
  private wasPlayerOverheated: boolean = false;
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
    this.levelFlow.resetForRun({
      difficultyKey: this.difficultyKey,
      progressionScore: this.progressionScore,
      rollRange: (range) => this.rollRange(range),
    });
    this.powerUpBarRefreshMs = 0;
    this.heatBarRefreshMs = 0;
    this.lastDebugStatsLine = '';
    this.passiveCoolingMultiplier = 1;
    this.magneticDurationMultiplier = 1;
    this.spawnProtectionTimerMs = 0;
    this.spawnProtectionTween = undefined;
    this.mineDeployCharges = INITIAL_MINE_DEPLOY_CHARGES;
    this.mineDeployHintCooldownUntil = 0;
    this.lastPlayerRecoilAt = -1000;
    this.wasPlayerOverheated = false;
    this.trailEmitAccumulatorMs = 0;
    this.backgroundDecorTier = 'off';
    this.backgroundDecorSpawnTimerMs = 0;
    this.backgroundDecor = [];
    this.nebulaLayers = [];
    this.nebulaProfileKey = 'off';
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
    this.empGraphics = this.add.graphics().setDepth(10);
    this.worldEvents = new MainWorldEvents({
      scene: this,
      enemyManager: this.enemyManager,
      bullets: this.bullets,
      player: this.player,
      getLevel: () => this.level,
      isFlowBlocked: () => this.isLevelTransition || this.isSwitching,
      isGameOver: () => this.isGameOver,
    });
    this.hazards = new MainHazardsSystem({
      scene: this,
      player: this.player,
      enemyManager: this.enemyManager,
      audio: this.audio,
      shieldBunkers: this.shieldBunkers,
      wingmanDroneTextureKey: WINGMAN_DRONE_TEXTURE_KEY,
      shieldBunkerTextureKey: 'shield_bunker',
      isShieldBunkerPowerActive: () =>
        this.powerUpManager?.isActive(PowerUpType.SHIELD_BUNKER) ?? false,
    });
    this.mineField = new MainMineFieldSystem({
      scene: this,
      mines: this.proximityMines,
      player: this.player,
      textureKey: PROXIMITY_MINE_TEXTURE_KEY,
      deployCount: PROXIMITY_MINE_DEPLOY_COUNT,
      getPlayerCount: () => this.playerCount,
      isInputBlocked: () =>
        this.isGameOver ||
        this.isSwitching ||
        this.isLevelTransition ||
        this.scene.isPaused('MainScene') ||
        !this.scene.isActive('MainScene'),
    });
    this.powerUpNotices = new MainPowerUpNoticeSystem({
      scene: this,
      getAnchor: () => {
        if (!this.player?.active || this.isGameOver || this.isSwitching || this.isLevelTransition) {
          return null;
        }
        return { x: this.player.x, y: this.player.y };
      },
    });
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
      onPlayerRescueAstronaut: (player, astronaut) =>
        this.handlePlayerRescueAstronaut(player, astronaut),
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
      eliteDrone: this.worldEvents.getEliteDrone(),
      astronaut: this.worldEvents.getAstronautGroup(),
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
      this.hazards.destroy();
      this.mineField.destroy();
      safeClearGroup(this.proximityMines as any);
      this.impactRingTweens.forEach((tween) => tween.stop());
      this.impactRingTweens.clear();
      safeClearGroup(this.impactRingPool as any);
      this.audio.destroy();
      musicManager.stopGameplay();
      this.clearWorldEvents('reset');
      this.pendingEnemyHits.length = 0;
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
      this.worldEvents.destroy();
      this.milestones?.reset();
      this.powerUpNotices?.destroy();
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
    const playerOverheated = this.player.active && this.player.isOverheated();
    if (playerOverheated && !this.wasPlayerOverheated) {
      this.powerUpNotices.showCustom('CANNON OVERHEATED', '#ff8c66');
    }
    this.wasPlayerOverheated = playerOverheated;
    if (this.player.active) {
      this.sceneBackground?.updatePlayerDriven(delta, this.player.x, this.player.y);
    } else {
      this.sceneBackground?.updateIdle(delta);
    }
    this.enemyManager.update(time, delta);
    this.worldEvents.update(delta);
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
        const activeAstronaut = this.worldEvents.isAstronautActive();
        const physicsBodies = (this.physics.world as any)?.bodies?.size ?? 0;
        const nextDebugStatsLine =
          `OBJ E ${activeEnemies} | P ${activePowerUps} | UP ${activeUFOProjectiles} | ` +
          `SR ${activeSkyRaiders}/${activeSkyRaiderProjectiles} | ` +
          `BNK ${activeBunkers} | DEC ${this.backgroundDecor.length}(${this.backgroundDecorTier}) | ` +
          `WH ${this.worldEvents.isWormholeActive() ? 1 : 0} | ED ${this.worldEvents.isEliteDroneActive() ? 1 : 0} | ` +
          `AST ${activeAstronaut ? 1 : 0} | BOD ${physicsBodies}`;
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
        if (this.levelFlow.isBossPendingDefeat()) {
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
    const shieldBunkerTimeLeft = this.powerUpManager.isActive(PowerUpType.SHIELD_BUNKER)
      ? this.powerUpManager.getRemainingTime(PowerUpType.SHIELD_BUNKER)
      : null;
    this.hazards.update(delta, shieldBunkerTimeLeft);
    this.updateProximityMines(delta);
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
      levelBossPendingDefeat: this.levelFlow.isBossPendingDefeat(),
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
    this.milestones.onScoreChanged(prevScore, this.score);
    this.checkLevelProgression();
    this.updateHUDDisplay();
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
    const shouldTrigger = this.levelFlow.shouldTriggerBossEncounter({
      difficultyKey: this.difficultyKey,
      isGameOver: this.isGameOver,
      isSwitching: this.isSwitching,
      isLevelTransition: this.isLevelTransition,
      progressionScore: this.progressionScore,
      nextLevelScore: this.nextLevelScore,
    });
    if (!shouldTrigger) return;
    this.triggerLevelBossEncounter();
  }

  private getRemainingBossGateTimeMs() {
    return this.levelFlow.getRemainingBossGateTimeMs(this.difficultyKey, this.isGameOver);
  }

  private triggerLevelBossEncounter() {
    if (this.isGameOver) return;
    if (!this.levelFlow.triggerBossEncounter()) return;
    if (this.ufo.active && this.ufo.getVariant() !== 'boss') {
      this.ufo.deactivate();
    }
    this.ufoSpawnTimer = Phaser.Math.Between(320, 620);
    this.cameras.main.flash(180, 255, 96, 128, false);
    this.cameras.main.shake(220, 0.005);
    this.updateHUDDisplay();
  }

  private completeLevelAfterBossDefeat() {
    if (this.isGameOver) return;
    if (!this.levelFlow.clearBossPendingDefeat()) return;
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
    this.levelFlow.registerAsteroidKill();
  }

  private registerSpecialKillForLevel() {
    this.levelFlow.registerSpecialKill();
  }

  private consumeLevelBonusPayout(completedLevel: number): LevelBonusPayout {
    return this.levelFlow.consumeLevelBonusPayout(completedLevel);
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
    this.levelFlow.resetOpeningState({
      difficultyKey: this.difficultyKey,
      progressionScore: this.progressionScore,
      rollRange: (range) => this.rollRange(range),
      setRuntimeIntensity: (intensity) => {
        this.enemyManager.setRuntimeIntensity(intensity);
        this.skyRaiderManager.setRuntimeIntensity(intensity);
      },
    });
  }

  private updateLevelOpeningBalance(delta: number) {
    this.levelFlow.updateOpeningBalance({
      delta,
      difficultyKey: this.difficultyKey,
      isGameOver: this.isGameOver,
      progressionScore: this.progressionScore,
      nextLevelScore: this.nextLevelScore,
      setRuntimeIntensity: (intensity) => {
        this.enemyManager.setRuntimeIntensity(intensity);
        this.skyRaiderManager.setRuntimeIntensity(intensity);
      },
    });
  }

  private updateGuaranteedSupportDrop(delta: number) {
    this.levelFlow.updateGuaranteedSupportDrop({
      delta,
      difficultyKey: this.difficultyKey,
      isGameOver: this.isGameOver,
      lives: this.lives,
      progressionScore: this.progressionScore,
      nextLevelScore: this.nextLevelScore,
      onSupportDropTriggered: () => this.triggerGuaranteedSupportDrop(),
    });
  }

  private triggerGuaranteedSupportDrop() {
    // Support drops were removed from timed flow; drops now come only from enemy kills.
    this.levelFlow.markSupportDropTriggered();
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

  private rollRange(range: IntRange) {
    return Phaser.Math.Between(range[0], range[1]);
  }

  private clearWorldEvents(reason: EliteDroneDeactivateReason = 'reset') {
    this.worldEvents.clear(reason);
    this.skyRaiderManager.deactivateAll();
  }

  private resetWorldEventTimers() {
    this.worldEvents.resetTimers();
  }

  private onSwarmEnemyKilled(enemy: Enemy, x: number, y: number) {
    const bonus = this.worldEvents.registerSwarmKill(enemy);
    if (bonus === null) return;
    this.addScore(bonus);
    this.comboManager.spawnClusterPopup(x, y - 20, bonus);
    this.cameras.main.flash(100, 136, 204, 255, false);
    this.audio.playPickup();
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

  private deactivateEliteDrone(reason: EliteDroneDeactivateReason) {
    this.worldEvents.deactivateEliteDrone(reason);
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

  private handlePlayerRescueAstronaut(_player: Player, astronaut: Phaser.Physics.Arcade.Sprite) {
    if (this.isGameOver || this.isSwitching || this.isLevelTransition) return;
    if (!astronaut.active) return;
    const x = astronaut.x;
    const y = astronaut.y;
    const rescuePoints = 680 + this.level * 42;

    this.audio.playRescue();
    this.addScore(rescuePoints);
    this.comboManager.spawnClusterPopup(x, y - 20, rescuePoints);
    this.spawnImpactRing(x, y, 0xb6f7ff, 12, 58, 200);
    this.applyImpactShake(95, 0.0033);
    this.cameras.main.flash(85, 140, 235, 210, false);

    const pop = this.add
      .text(x, y - 28, `RESCUE +${rescuePoints}`, {
        fontFamily: '"Press Start 2P"',
        fontSize: '13px',
        color: '#d4fbff',
        stroke: '#001721',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(142);
    this.tweens.add({
      targets: pop,
      y: y - 66,
      alpha: 0,
      duration: 820,
      ease: 'Sine.easeOut',
      onComplete: () => pop.destroy(),
    });

    this.powerUpNotices.showCustom('ASTRONAUT RESCUED', '#d4fbff');
    this.worldEvents.deactivateAstronaut(astronaut, 'rescued');
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
    this.ufoSpawnTimer = this.levelFlow.isBossPendingDefeat()
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
    this.hazards.spawnDrones();
  }

  private removeDrones() {
    this.hazards.removeDrones();
  }

  private spawnBlackHole() {
    this.hazards.spawnBlackHole();
  }

  private removeBlackHole() {
    this.hazards.removeBlackHole();
  }

  private spawnShieldBunkers() {
    this.hazards.spawnShieldBunkers();
  }

  private stopShieldBunkerWarning(restoreAlpha: boolean) {
    this.hazards.stopShieldBunkerWarning(restoreAlpha);
  }

  private removeShieldBunkers() {
    this.hazards.removeShieldBunkers();
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
    return this.hazards.hasActiveShieldBunkers();
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
    if (!this.mineField.handlePointerDown(pointer, currentlyOver)) return;
    this.tryDeployMineFieldFromInput();
  }

  private addMineDeployCharges(amount: number) {
    if (amount <= 0) return;
    this.mineDeployCharges += amount;
    this.syncMineDeployChargesToState();
    this.updateHUDDisplay();
  }

  private clearProximityMines() {
    this.mineField.clear();
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
    return this.mineField.deployFromPlayer();
  }

  private updateProximityMines(delta: number) {
    this.mineField.update(delta);
  }

  private isArmedMine(mine: Phaser.Physics.Arcade.Image) {
    return this.mineField.isArmed(mine);
  }

  private consumeMine(mine: Phaser.Physics.Arcade.Image) {
    this.mineField.consume(mine);
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
      this.worldEvents.spawnAstronautBurstFromScout(ufoX, ufoY);
      this.powerUpTimer = Math.max(this.powerUpTimer, this.getScaledMagneticDuration(5000));
      this.player.setMagnetic(true);
      this.registerSpecialKillForLevel();
      const scoutPoints = 500 + this.level * 25;
      this.addScore(this.comboManager.registerKill(ufoX, ufoY, scoutPoints, this.time.now));
      this.ufoSpawnTimer = this.levelFlow.isBossPendingDefeat()
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
    if (this.levelFlow.isBossPendingDefeat()) {
      this.completeLevelAfterBossDefeat();
    }
    this.ufoSpawnTimer = this.levelFlow.isBossPendingDefeat()
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
      this.worldEvents.spawnAstronautBurstFromScout(ufoX, ufoY);
      this.powerUpTimer = Math.max(this.powerUpTimer, this.getScaledMagneticDuration(5000));
      this.player.setMagnetic(true);
      this.registerSpecialKillForLevel();
      const scoutPoints = 500 + this.level * 25;
      this.addScore(this.comboManager.registerKill(ufoX, ufoY, scoutPoints, this.time.now));
      this.ufoSpawnTimer = this.levelFlow.isBossPendingDefeat()
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
    if (this.levelFlow.isBossPendingDefeat()) {
      this.completeLevelAfterBossDefeat();
    }
    this.ufoSpawnTimer = this.levelFlow.isBossPendingDefeat()
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
        if (!this.levelFlow.isSupportDropGranted() && this.levelFlow.getLevelElapsedMs() < 28000) {
          this.levelFlow.expediteSupportDropTimer(500);
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
      onPowerUpActivated: (type) => this.powerUpNotices.show(type),
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
    this.milestones = new MainMilestoneSystem({
      scene: this,
      audio: this.audio,
      milestoneText: this.milestoneText,
    });
    this.milestones.reset();
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

  private canOpenPauseMenu() {
    if (this.isGameOver || this.isSwitching || this.isLevelTransition) return false;
    if (!this.scene.isActive(this.scene.key) || this.scene.isPaused(this.scene.key)) return false;
    if (this.scene.isActive('PauseScene') || this.scene.isActive('HelpScene')) return false;
    if (this.scene.isActive('PerkSelectScene')) return false;
    if (!this.player?.active) return false;
    if (this.physics.world.isPaused) return false;
    return true;
  }

  private requestPause() {
    if (!this.canOpenPauseMenu()) return;
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
    bootstrapMainSceneGraphics(this, {
      proximityMineTextureKey: PROXIMITY_MINE_TEXTURE_KEY,
      impactRingTextureKey: IMPACT_RING_TEXTURE_KEY,
      impactRingTextureSize: IMPACT_RING_TEXTURE_SIZE,
      impactRingTextureRadius: IMPACT_RING_TEXTURE_RADIUS,
      wingmanDroneTextureKey: WINGMAN_DRONE_TEXTURE_KEY,
    });
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
      bossPending: this.levelFlow.isBossPendingDefeat(),
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
        wormholeActive: this.worldEvents.isWormholeActive(),
        eliteDroneActive: this.worldEvents.isEliteDroneActive(),
        astronautActive: this.worldEvents.isAstronautActive(),
        astronautCount: this.worldEvents.getAstronautActiveCount(),
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
        elapsedMs: Math.max(0, Math.round(this.levelFlow.getLevelElapsedMs())),
        startScore: this.levelFlow.getLevelStartScore(),
        supportDropGranted: this.levelFlow.isSupportDropGranted(),
        supportDropInMs: Math.max(0, Math.round(this.levelFlow.getSupportDropTimerMs())),
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
