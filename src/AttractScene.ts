import Phaser from 'phaser';
import {
  GAME_WIDTH,
  GAME_HEIGHT,
  IS_TOUCH,
  applyPendingResize,
  recalculateDimensions,
} from './gameConfig';
import { AudioManager, DEFAULT_VOLUME } from './AudioManager';
import { creditManager } from './CreditManager';
import {
  cycleDifficulty,
  getCurrentDifficultyKey,
  getDifficultyPreset,
  setCurrentDifficultyKey,
} from './Difficulty';
import type { DifficultyPresetKey } from './Difficulty';
import { Enemy, EnemyManager } from './EnemyManager';
import { soundManager } from './SoundManager';
import { UFO, UFOProjectile } from './UFO';
import { PowerUp, PowerUpType } from './PowerUp';
import { performanceMonitor } from './PerformanceMonitor';
import { musicManager } from './MusicManager';
import { isDebugOverlayEnabled, toggleDebugOverlayEnabled } from './DebugSettings';
import { mergeLeaderboardEntries, remoteStatsService } from './RemoteStatsService';
import SceneBackground from './SceneBackground';
import { SettingsOverlayController } from './ui/SettingsOverlayController';

type PlayerButton = {
  requiredCredits: number;
  bg: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
};

type HighScoreEntry = {
  score: number;
  name: string;
};

type DemoPowerUpDrift = {
  icon: Phaser.GameObjects.Image;
  label: Phaser.GameObjects.Text;
  vx: number;
  vy: number;
  spin: number;
};

type AttractBlackHoleState = {
  x: number;
  y: number;
  ttlMs: number;
  graphics: Phaser.GameObjects.Graphics;
};

type AttractDecorTier = 'off' | 'low' | 'medium' | 'high';

type AttractBackgroundDecor = {
  sprite: Phaser.GameObjects.Image;
  vx: number;
  vy: number;
  spin: number;
  baseAlpha: number;
  pulseOffset: number;
};

type AttractNebulaLayer = {
  sprite: Phaser.GameObjects.TileSprite;
  vx: number;
  vy: number;
  baseAlpha: number;
  alphaWave: number;
  phase: number;
};

const ATTRACT_DECOR_TUNING = {
  initialSpawnDelayMs: {
    low: [2600, 4200] as const,
    medium: [2000, 3400] as const,
    high: [1600, 2800] as const,
  },
  respawnDelayMs: {
    low: [14000, 22000] as const,
    medium: [9500, 16500] as const,
    high: [7000, 13000] as const,
  },
  maxActive: {
    low: 1,
    medium: 2,
    high: 3,
  },
  planetChancePercent: {
    low: 100,
    medium: 78,
    high: 62,
  },
  depth: 3,
  cullPadding: 320,
  alphaRange: [0.18, 0.34] as const,
  planetScaleRange: [0.9, 1.7] as const,
  clusterScaleRange: [1.05, 1.95] as const,
  verticalSpeedRange: [5, 18] as const,
  driftSpeedRange: [-10, 10] as const,
  spinRange: [-0.0016, 0.0016] as const,
} as const;

const ATTRACT_JUICE_TUNING = {
  ufoTrailEmitIntervalMs: {
    full: 38,
    reduced: 72,
  },
  ufoTrailCapPerTick: {
    full: 14,
    reduced: 6,
  },
  warpLineCount: {
    full: 12,
    reduced: 8,
  },
  warpPulseDurationMs: {
    soft: 420,
    hard: 640,
  },
  warpPulseAlpha: {
    soft: 0.32,
    hard: 0.52,
  },
} as const;

export default class AttractScene extends Phaser.Scene {
  private audio!: AudioManager;
  private coinText!: Phaser.GameObjects.Text;
  private coinInfoText!: Phaser.GameObjects.Text;
  private helpText!: Phaser.GameObjects.Text;
  private settingsText!: Phaser.GameObjects.Text;
  private creditLabel!: Phaser.GameObjects.Text;
  private enemyManager!: EnemyManager;
  private ufo!: UFO;
  private attractCombatTarget!: Phaser.Physics.Arcade.Sprite;
  private attractCombatPhase: number = 0;
  private attractCombatTargetX: number = 0;
  private attractCombatTargetY: number = 0;
  private ufoSpawnTimer: number = 0;
  private ambientEmitter!: Phaser.GameObjects.Particles.ParticleEmitter;
  private highScoreGroup!: Phaser.GameObjects.Container;
  private dailyChallengeGroup!: Phaser.GameObjects.Container;
  private dailyChallengeOriginalY: number = 0;
  private serverStatsGroup!: Phaser.GameObjects.Container;
  private serverStatsUsersText?: Phaser.GameObjects.Text;
  private serverStatsCoinsText?: Phaser.GameObjects.Text;
  private attractDisplayState: number = 0; // 0: Info, 1: Scores, 2: Daily, 3: Stats
  private demoSplitTimer: number = 0;
  private enemyDepthRefreshMs: number = 0;
  private heartbeatActive: boolean = false;
  private heartbeatTimer: Phaser.Time.TimerEvent | null = null;
  private playerButtons: PlayerButton[] = [];
  private attractBlackHole: AttractBlackHoleState | null = null;
  private attractBlackHoleSpawnTimer: number = 0;
  private attractBlackHoleForceAccumulatorMs: number = 0;
  private demoPowerUps: DemoPowerUpDrift[] = [];
  private demoPowerUpSpawnTimer: number = 0;
  private eventBanner!: Phaser.GameObjects.Text;
  private eventBannerTween: Phaser.Tweens.Tween | null = null;
  private difficultyKey: DifficultyPresetKey = getCurrentDifficultyKey();
  private settingsOverlayOpen: boolean = false;
  private settingsOverlayController?: SettingsOverlayController;
  private titleLogoContainer?: Phaser.GameObjects.Container;
  private powerUpPreviewContainer?: Phaser.GameObjects.Container;
  private highScoreRows: Phaser.GameObjects.Text[] = [];
  private creditListener?: (credits: number) => void;
  private soundListener?: (muted: boolean) => void;
  private volumeListener?: () => void;
  private gpuName: string = '';
  private backgroundDecorTier: AttractDecorTier = 'off';
  private backgroundDecorSpawnTimerMs: number = 0;
  private backgroundDecor: AttractBackgroundDecor[] = [];
  private nebulaLayers: AttractNebulaLayer[] = [];
  private nebulaProfileKey: string = 'off';
  private attractWarpGraphics!: Phaser.GameObjects.Graphics;
  private attractWarpTween: Phaser.Tweens.Tween | null = null;
  private ufoTrailEmitter: Phaser.GameObjects.Particles.ParticleEmitter | null = null;
  private ufoTrailEmitAccumulatorMs: number = 0;
  private sceneBackground?: SceneBackground;

  constructor() {
    super('AttractScene');
  }

  preload() {
    SceneBackground.preload(this);
  }

  create() {
    if (applyPendingResize(this.game)) {
      if (this.scene.isActive('BezelScene')) {
        this.scene.stop('BezelScene');
      }
    }

    this.audio = new AudioManager(this);
    musicManager.play(this);
    const centerX = GAME_WIDTH / 2;
    const centerY = GAME_HEIGHT / 2;
    const uiDepth = 50;
    this.sceneBackground = new SceneBackground(this, {
      depth: -120,
      alpha: 0.42,
      maxOffsetX: 46,
      maxOffsetY: 30,
    });

    if (!this.scene.isActive('BezelScene')) {
      this.scene.launch('BezelScene');
    }
    this.scene.bringToTop('BezelScene');
    this.difficultyKey = getCurrentDifficultyKey();
    performanceMonitor.init(this.game);
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
    this.configureNebulaLayers(true);

    if (
      performanceMonitor.crtEnabled &&
      this.game.renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer
    ) {
      this.cameras.main.setPostPipeline('CRTPipeline');
    }

    this.createAmbientTexture();
    const reduced = performanceMonitor.reducedParticles;
    this.ambientEmitter = this.add.particles(0, 0, 'dust', {
      x: { min: 0, max: GAME_WIDTH },
      y: -50,
      quantity: reduced ? 1 : 2,
      frequency: reduced ? 160 : 80,
      lifespan: 6000,
      speedY: { min: 40, max: 120 },
      scale: { min: 0.2, max: 0.6 },
      alpha: { min: 0.05, max: 0.25 },
      blendMode: 'ADD',
    });
    this.ambientEmitter.setDepth(1);
    this.attractWarpGraphics = this.add.graphics().setDepth(uiDepth - 2);
    this.createUFOTrailEmitter();
    this.ufoTrailEmitAccumulatorMs = 0;

    this.enemyManager = new EnemyManager(this);
    this.attractCombatTarget = this.physics.add.sprite(centerX, centerY - 140, 'dust');
    this.attractCombatTarget.setActive(true);
    this.attractCombatTarget.setVisible(false);
    const combatBody = this.attractCombatTarget.body as Phaser.Physics.Arcade.Body | null;
    if (combatBody) {
      combatBody.allowGravity = false;
      combatBody.immovable = true;
      combatBody.setVelocity(0, 0);
    }
    this.attractCombatPhase = Phaser.Math.FloatBetween(0, Math.PI * 2);
    this.attractCombatTargetX = this.attractCombatTarget.x;
    this.attractCombatTargetY = this.attractCombatTarget.y;

    this.ufo = new UFO(this, this.audio, { combatEnabled: true });
    this.ufo.setCombatTarget(this.attractCombatTarget);
    this.ufo.setDepth(6);
    const preset = getDifficultyPreset(this.difficultyKey);
    this.audio.setDifficultyMix(this.difficultyKey);
    this.enemyManager.setDifficultyPreset(preset);
    this.ufo.setDifficultyPreset(preset);
    this.ufoSpawnTimer = Phaser.Math.Between(20000, 45000);

    // Title Logo
    this.titleLogoContainer = this.createTitleLogo(centerX, GAME_HEIGHT * 0.15, uiDepth);

    // INSERT COIN blinking text
    this.coinText = this.add
      .text(centerX, centerY + 120, 'INSERT COIN (I)', {
        fontFamily: '"Press Start 2P"',
        fontSize: '24px',
        color: '#ffff00',
      })
      .setOrigin(0.5)
      .setDepth(uiDepth)
      .setInteractive({ useHandCursor: true });
    this.coinText.on('pointerdown', () => this.insertCoin());
    this.coinInfoText = this.add
      .text(
        centerX,
        centerY + 24,
        '(c) 2026 gmeu - gpl\nvite tsx claude\ngemini codex suno\nphaser-3',
        {
          fontFamily: '"Press Start 2P"',
          fontSize: '20px',
          color: '#00ffff',
          align: 'center',
          lineSpacing: 4,
        },
      )
      .setOrigin(0.5)
      .setDepth(uiDepth);
    this.helpText = this.add
      .text(centerX, GAME_HEIGHT - 200, 'HELP (H)', {
        fontFamily: '"Press Start 2P"',
        fontSize: '16px',
        color: '#ffffff',
      })
      .setOrigin(0.5)
      .setDepth(uiDepth)
      .setInteractive({ useHandCursor: true });
    this.helpText.on('pointerdown', () => this.openHelp());
    this.settingsText = this.add
      .text(centerX, GAME_HEIGHT - 165, 'SETTINGS (O)', {
        fontFamily: '"Press Start 2P"',
        fontSize: '16px',
        color: '#9be7ff',
      })
      .setOrigin(0.5)
      .setDepth(uiDepth)
      .setInteractive({ useHandCursor: true });
    this.settingsText.on('pointerdown', () => this.openSettingsOverlay());

    this.startHeartbeatPulse();

    this.highScoreGroup = this.createHighScoreTable(centerX, centerY + 80, uiDepth);
    this.highScoreGroup.setAlpha(0);

    this.dailyChallengeGroup = this.createDailyChallengeBlock(centerX, centerY + 100, uiDepth);
    this.dailyChallengeGroup.setAlpha(0);

    this.serverStatsGroup = this.createServerStatsBlock(centerX, centerY + 90, uiDepth);
    this.serverStatsGroup.setAlpha(0);

    this.time.addEvent({
      delay: 5000,
      loop: true,
      callback: () => this.toggleAttractMessage(),
    });

    this.creditLabel = this.add
      .text(centerX, GAME_HEIGHT - 50, `CREDITS: ${creditManager.getCredits()}`, {
        fontFamily: '"Press Start 2P"',
        fontSize: '16px',
        color: '#ffffff',
      })
      .setOrigin(0.5)
      .setDepth(uiDepth);
    this.buildSettingsOverlay(uiDepth + 6);

    this.createPlayerButtons(centerX, centerY + 210, uiDepth);

    this.powerUpPreviewContainer = this.createPowerUpPreview(centerX, GAME_HEIGHT - 130, uiDepth);
    this.createEventBanner(centerX, centerY + 164, uiDepth);
    this.layoutAttractUi();
    this.time.delayedCall(120, () => this.refreshHighScoresFromServerLazy());
    this.attractBlackHoleSpawnTimer = Phaser.Math.Between(4800, 8500);
    this.demoPowerUpSpawnTimer = Phaser.Math.Between(1200, 2400);

    // Interaction
    this.input.keyboard?.on('keydown-I', () => this.insertCoin());
    this.input.keyboard?.on('keydown-ONE', () => this.startGame(1));
    this.input.keyboard?.on('keydown-TWO', () => this.startGame(2));
    this.input.keyboard?.on('keydown-SPACE', () => this.startGame(1));
    this.input.keyboard?.on('keydown-ENTER', () => this.startGame(1));
    this.input.keyboard?.on('keydown-UP', () => this.startGame(1));
    this.input.keyboard?.on('keydown-A', () => {
      if (this.settingsOverlayOpen) this.cycleDifficulty(-1);
    });
    this.input.keyboard?.on('keydown-D', () => {
      if (this.settingsOverlayOpen) this.cycleDifficulty(1);
    });
    this.input.keyboard?.on('keydown-LEFT', () => {
      if (this.settingsOverlayOpen) this.cycleDifficulty(-1);
    });
    this.input.keyboard?.on('keydown-RIGHT', () => {
      if (this.settingsOverlayOpen) this.cycleDifficulty(1);
    });
    this.input.keyboard?.on('keydown-S', () => {
      if (this.settingsOverlayOpen) this.toggleSound();
    });
    this.input.keyboard?.on('keydown-F', () => {
      if (this.settingsOverlayOpen) this.toggleFullscreen();
    });
    this.input.keyboard?.on('keydown-C', () => {
      if (this.settingsOverlayOpen) this.toggleCrt();
    });
    this.input.keyboard?.on('keydown-G', () => {
      if (this.settingsOverlayOpen) this.toggleDebugSetting();
    });
    this.input.keyboard?.on('keydown-H', () => this.openHelp());
    this.input.keyboard?.on('keydown-O', () => {
      if (this.settingsOverlayOpen) this.closeSettingsOverlay();
      else this.openSettingsOverlay();
    });
    this.input.keyboard?.on('keydown-ESC', () => this.closeSettingsOverlay());
    this.input.keyboard?.on('keydown-B', () => this.closeSettingsOverlay());

    this.creditListener = (credits) => {
      this.creditLabel.setText(`CREDITS: ${credits}`);
      this.updatePlayerButtons();
    };
    creditManager.onChange(this.creditListener, this);
    this.updatePlayerButtons();

    this.soundListener = (_muted) => {
      this.applyAttractAudioVolume();
      if (this.settingsOverlayOpen) this.refreshSettingsOverlayLabels();
    };
    soundManager.onChange(this.soundListener, this);
    this.volumeListener = () => {
      this.applyAttractAudioVolume();
      if (this.settingsOverlayOpen) this.refreshSettingsOverlayLabels();
    };
    soundManager.onVolumeChange(this.volumeListener, this);
    this.applyAttractAudioVolume();

    this.events.once('shutdown', () => {
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
      this.settingsOverlayController?.destroy();
      this.settingsOverlayController = undefined;
      this.settingsOverlayOpen = false;
      this.titleLogoContainer = undefined;
      this.powerUpPreviewContainer = undefined;
      this.highScoreRows.length = 0;
      this.heartbeatActive = false;
      this.heartbeatTimer?.remove(false);
      this.heartbeatTimer = null;
      safeDestroyGroup((this.enemyManager as any)?.enemies);
      this.ufo.setCombatTarget(null);
      this.ufo.deactivate();
      this.attractCombatTarget?.destroy();
      this.removeAttractBlackHole();
      this.clearDemoPowerUps();
      this.clearBackgroundDecor();
      this.clearNebulaLayers();
      this.serverStatsUsersText = undefined;
      this.serverStatsCoinsText = undefined;
      this.attractWarpTween?.stop();
      this.attractWarpTween = null;
      this.attractWarpGraphics?.destroy();
      this.eventBannerTween?.stop();
      this.eventBannerTween = null;
      this.ambientEmitter.destroy();
      this.ufoTrailEmitter?.destroy();
      this.ufoTrailEmitter = null;
      this.audio.destroy();
      if (this.creditListener) creditManager.offChange(this.creditListener, this);
      if (this.soundListener) soundManager.offChange(this.soundListener, this);
      if (this.volumeListener) soundManager.offVolumeChange(this.volumeListener, this);
    });
  }

  update(time: number, delta: number) {
    this.sceneBackground?.updateIdle(delta);
    const qualityChanged = performanceMonitor.update(this.game);
    if (this.game.renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer) {
      const hasCrt = this.hasCrtPipeline();
      if (performanceMonitor.crtEnabled && !hasCrt) {
        this.cameras.main.setPostPipeline('CRTPipeline');
      } else if (!performanceMonitor.crtEnabled && hasCrt) {
        this.cameras.main.removePostPipeline('CRTPipeline');
      }
    }
    if (qualityChanged) {
      this.configureBackgroundDecor();
      this.configureNebulaLayers();
    }
    this.enemyManager.update(time, delta);
    this.updateAttractCombatTarget(delta);
    this.updateBackgroundDecor(delta);
    this.updateNebulaLayers(delta);
    this.updateUFOTrails(delta);
    this.enemyDepthRefreshMs -= delta;
    if (this.enemyDepthRefreshMs <= 0) {
      this.applyEnemyDepth(5);
      this.enemyDepthRefreshMs = 500;
    }
    this.demoSplitTimer += delta;
    if (this.demoSplitTimer >= 1400) {
      this.demoSplitTimer = 0;
      this.triggerDemoSplit();
    }
    this.updateDemoPowerUps(delta);
    this.updateAttractBlackHole(delta);
    if (!this.ufo.active) {
      this.ufoSpawnTimer -= delta;
      if (this.ufoSpawnTimer <= 0) {
        this.ufo.spawn();
        this.announceEvent('UFO CONTACT');
        this.ufoSpawnTimer = Phaser.Math.Between(20000, 45000);
      }
    }
  }

  private updateAttractCombatTarget(delta: number) {
    if (!this.attractCombatTarget?.active) return;

    this.attractCombatPhase += (delta / 1000) * 0.55;
    const width = this.scale.width;
    const height = this.scale.height;
    const nextX = width * 0.5 + Math.sin(this.attractCombatPhase * 1.2) * width * 0.28;
    const nextY = height * 0.33 + Math.cos(this.attractCombatPhase * 1.7) * height * 0.16;
    const stepSec = Math.max(delta / 1000, 1 / 120);
    const vx = (nextX - this.attractCombatTargetX) / stepSec;
    const vy = (nextY - this.attractCombatTargetY) / stepSec;

    this.attractCombatTarget.setPosition(nextX, nextY);
    const body = this.attractCombatTarget.body as Phaser.Physics.Arcade.Body | null;
    body?.setVelocity(vx, vy);

    this.attractCombatTargetX = nextX;
    this.attractCombatTargetY = nextY;
  }

  private async insertCoin() {
    if (this.settingsOverlayOpen) return;
    await this.audio.resume();
    this.audio.playCoin();
    creditManager.addCredits(1);
  }

  private toggleSound() {
    void this.audio.resume();
    soundManager.toggle();
    this.settingsOverlayController?.refresh();
  }

  private toggleFullscreen() {
    if (IS_TOUCH) return;
    if (this.scale.isFullscreen) {
      this.scale.stopFullscreen();
    } else {
      this.scale.startFullscreen();
    }
    this.settingsOverlayController?.refresh();
  }

  private toggleCrt() {
    if (!performanceMonitor.isCrtSupported()) return;
    performanceMonitor.toggleCrtUserEnabled();
    this.settingsOverlayController?.refresh();
  }

  private getSoundLabel() {
    return `SOUND: ${soundManager.isMuted() ? 'OFF' : 'ON'} (S)`;
  }

  private getFullscreenLabel() {
    if (IS_TOUCH) return 'FULLSCREEN: N/A (TOUCH)';
    return `FULLSCREEN: ${this.scale.isFullscreen ? 'ON' : 'OFF'} (F)`;
  }

  private getDifficultyLabel() {
    return `DIFFICULTY: ${getDifficultyPreset(this.difficultyKey).label} (A/D)`;
  }

  private getDebugLabel() {
    return `DEBUG INFO: ${isDebugOverlayEnabled() ? 'ON' : 'OFF'} (G)`;
  }

  private getCrtLabel() {
    if (!performanceMonitor.isCrtSupported()) return 'SCAN / CRT: N/A';
    if (!performanceMonitor.isCrtUserEnabled()) return 'SCAN / CRT: OFF (C)';
    if (!performanceMonitor.crtEnabled) return 'SCAN / CRT: AUTO OFF (PERF)';
    return 'SCAN / CRT: ON (C)';
  }

  private cycleDifficulty(direction: 1 | -1) {
    this.difficultyKey = cycleDifficulty(direction);
    const preset = getDifficultyPreset(this.difficultyKey);
    this.audio.setDifficultyMix(this.difficultyKey);
    this.enemyManager.setDifficultyPreset(preset);
    this.ufo.setDifficultyPreset(preset);
    this.settingsOverlayController?.refresh();
  }

  private toggleDebugSetting() {
    toggleDebugOverlayEnabled();
    this.settingsOverlayController?.refresh();
  }

  private openHelp() {
    if (this.settingsOverlayOpen) return;
    if (this.scene.isActive('HelpScene')) return;
    this.scene.launch('HelpScene', { returnScene: this.scene.key });
    this.scene.pause();
  }

  private openSettingsOverlay() {
    if (this.settingsOverlayOpen) return;
    if (this.scene.isActive('HelpScene')) return;
    this.settingsOverlayOpen = true;
    this.settingsOverlayController?.open();
    this.settingsText.setColor('#ffffff');
  }

  private closeSettingsOverlay() {
    if (!this.settingsOverlayOpen) return;
    this.settingsOverlayOpen = false;
    this.settingsOverlayController?.close();
    this.settingsText.setColor('#9be7ff');
  }

  private buildSettingsOverlay(depth: number) {
    if (this.settingsOverlayController) return;
    this.settingsOverlayController = new SettingsOverlayController({
      scene: this,
      depth,
      isTouch: IS_TOUCH,
      isCrtSupported: () => performanceMonitor.isCrtSupported(),
      getSoundLabel: () => this.getSoundLabel(),
      getFullscreenLabel: () => this.getFullscreenLabel(),
      getDifficultyLabel: () => this.getDifficultyLabel(),
      getDebugLabel: () => this.getDebugLabel(),
      getCrtLabel: () => this.getCrtLabel(),
      onToggleSound: () => this.toggleSound(),
      onToggleFullscreen: () => this.toggleFullscreen(),
      onChangeDifficulty: (direction) => this.cycleDifficulty(direction),
      onToggleDebug: () => this.toggleDebugSetting(),
      onToggleCrt: () => this.toggleCrt(),
      onCloseRequested: () => this.closeSettingsOverlay(),
    });
    this.settingsOverlayController.build();
  }

  private refreshSettingsOverlayLabels() {
    this.settingsOverlayController?.refresh();
  }

  private applyAttractAudioVolume() {
    if (!this.audio) return;
    if (soundManager.isMuted()) {
      this.audio.setVolume(0);
      return;
    }
    this.audio.setVolume(DEFAULT_VOLUME * soundManager.getEffectiveSfxVolume());
  }

  private hasCrtPipeline() {
    const pipeline = this.cameras.main.getPostPipeline('CRTPipeline');
    return Array.isArray(pipeline) ? pipeline.length > 0 : Boolean(pipeline);
  }

  private toggleAttractMessage() {
    this.attractDisplayState = (this.attractDisplayState + 1) % 4;
    this.playAttractWarpPulse(
      this.coinText?.x ?? GAME_WIDTH / 2,
      (this.coinText?.y ?? GAME_HEIGHT / 2) - 40,
      'soft',
    );

    const coinTextAlpha = this.attractDisplayState === 0 || this.attractDisplayState === 2 ? 1 : 0;
    const infoBlockAlpha = this.attractDisplayState === 0 ? 1 : 0;
    const scoresAlpha = this.attractDisplayState === 1 ? 1 : 0;
    const dailyAlpha = this.attractDisplayState === 2 ? 1 : 0;
    const statsAlpha = this.attractDisplayState === 3 ? 1 : 0;

    const duration = 400;
    const ease = 'Sine.easeInOut';

    // INSERT COIN text (visible in states 0 and 2)
    this.tweens.add({ targets: this.coinText, alpha: coinTextAlpha, duration, ease });
    // Info block (only visible in state 0)
    this.tweens.add({ targets: this.coinInfoText, alpha: infoBlockAlpha, duration, ease });
    // Keep primary navigation actions always visible in attract mode.
    this.tweens.add({ targets: this.helpText, alpha: 1, duration, ease });
    this.tweens.add({ targets: this.settingsText, alpha: 1, duration, ease });

    // Scores
    this.tweens.add({ targets: this.highScoreGroup, alpha: scoresAlpha, duration, ease });

    // Daily Challenge - position higher when visible (state 2)
    const dailyY =
      this.attractDisplayState === 2
        ? this.dailyChallengeOriginalY - 60
        : this.dailyChallengeOriginalY;
    this.tweens.add({
      targets: this.dailyChallengeGroup,
      alpha: dailyAlpha,
      y: dailyY,
      duration,
      ease,
    });

    // Runtime stats (coins/users)
    this.tweens.add({ targets: this.serverStatsGroup, alpha: statsAlpha, duration, ease });
  }

  private startHeartbeatPulse() {
    this.heartbeatActive = true;
    this.coinText.setScale(1);
    this.runHeartbeatCycle();
  }

  private runHeartbeatCycle() {
    if (!this.heartbeatActive) return;
    this.tweens.add({
      targets: this.coinText,
      scale: 1.12,
      duration: 120,
      yoyo: true,
      ease: 'Sine.easeOut',
      onComplete: () => {
        if (!this.heartbeatActive) return;
        this.tweens.add({
          targets: this.coinText,
          scale: 1.06,
          duration: 120,
          yoyo: true,
          ease: 'Sine.easeOut',
          onComplete: () => {
            if (!this.heartbeatActive) return;
            this.heartbeatTimer = this.time.delayedCall(600, () => this.runHeartbeatCycle());
          },
        });
      },
    });
  }

  private playAttractWarpPulse(x: number, y: number, mode: 'soft' | 'hard' = 'soft') {
    if (!this.attractWarpGraphics) return;
    const reduced = performanceMonitor.reducedParticles;
    const fxBudget = performanceMonitor.getFxBudgetScale(this.game);
    const baseLineCount = reduced
      ? ATTRACT_JUICE_TUNING.warpLineCount.reduced
      : ATTRACT_JUICE_TUNING.warpLineCount.full;
    const lineCount = Phaser.Math.Clamp(
      Math.round(baseLineCount * fxBudget),
      reduced ? 5 : 7,
      baseLineCount,
    );
    const duration =
      mode === 'hard'
        ? ATTRACT_JUICE_TUNING.warpPulseDurationMs.hard
        : ATTRACT_JUICE_TUNING.warpPulseDurationMs.soft;
    const scaledDuration = Math.round(duration * (0.74 + fxBudget * 0.26));
    const peakAlpha =
      mode === 'hard'
        ? ATTRACT_JUICE_TUNING.warpPulseAlpha.hard
        : ATTRACT_JUICE_TUNING.warpPulseAlpha.soft;
    const state = { progress: 0, alpha: peakAlpha * (0.76 + fxBudget * 0.24) };

    this.attractWarpTween?.stop();
    this.attractWarpGraphics.clear();
    this.attractWarpTween = this.tweens.add({
      targets: state,
      progress: 1,
      alpha: 0,
      duration: scaledDuration,
      ease: 'Cubic.easeOut',
      onUpdate: () => {
        const g = this.attractWarpGraphics;
        g.clear();
        const p = state.progress;
        const lineAlpha = Phaser.Math.Clamp(state.alpha * (1 - p * 0.25), 0, 1);
        for (let i = 0; i < lineCount; i++) {
          const angle = (i / lineCount) * Math.PI * 2 + p * 0.33;
          const inner = 24 + p * 16 + Math.sin(i + p * 5) * 2;
          const outer = inner + 58 + p * 96 + (i % 3) * 8;
          const x1 = x + Math.cos(angle) * inner;
          const y1 = y + Math.sin(angle) * inner;
          const x2 = x + Math.cos(angle) * outer;
          const y2 = y + Math.sin(angle) * outer;
          const color = i % 2 === 0 ? 0x87f2ff : 0xffa7eb;
          g.lineStyle(i % 3 === 0 ? 3 : 2, color, lineAlpha * (i % 3 === 0 ? 0.62 : 0.48));
          g.beginPath();
          g.moveTo(x1, y1);
          g.lineTo(x2, y2);
          g.strokePath();
        }
      },
      onComplete: () => {
        this.attractWarpGraphics.clear();
      },
    });
  }

  private createAmbientTexture() {
    if (this.textures.exists('dust')) return;
    const g = this.make.graphics({ x: 0, y: 0 });
    g.fillStyle(0xffffff, 1);
    g.fillRect(0, 0, 2, 2);
    g.generateTexture('dust', 2, 2);
    g.destroy();
  }

  private createUFOTrailEmitter() {
    if (!this.textures.exists('attract_trail_dot')) {
      const g = this.make.graphics({ x: 0, y: 0 });
      g.fillStyle(0xffffff, 1);
      g.fillCircle(3, 3, 3);
      g.generateTexture('attract_trail_dot', 6, 6);
      g.destroy();
    }
    this.ufoTrailEmitter = this.add.particles(0, 0, 'attract_trail_dot', {
      lifespan: { min: 140, max: 240 },
      speed: { min: 10, max: 34 },
      angle: { min: 230, max: 310 },
      scale: { start: 0.35, end: 0 },
      alpha: { start: 0.55, end: 0 },
      tint: [0xff8cf4, 0xb090ff],
      blendMode: 'ADD',
      emitting: false,
      quantity: 1,
    });
    this.ufoTrailEmitter.setDepth(7);
  }

  private updateUFOTrails(delta: number) {
    if (!this.ufoTrailEmitter) return;
    const shots = this.ufo.getProjectiles()?.getChildren() as UFOProjectile[] | undefined;
    if (!shots || shots.length === 0) return;
    const reduced = performanceMonitor.reducedParticles;
    const baseEmitInterval = reduced
      ? ATTRACT_JUICE_TUNING.ufoTrailEmitIntervalMs.reduced
      : ATTRACT_JUICE_TUNING.ufoTrailEmitIntervalMs.full;
    const emitInterval = Math.round(
      baseEmitInterval * performanceMonitor.getFxIntervalScale(this.game),
    );
    this.ufoTrailEmitAccumulatorMs += delta;
    if (this.ufoTrailEmitAccumulatorMs < emitInterval) return;
    this.ufoTrailEmitAccumulatorMs = 0;

    const baseCap = reduced
      ? ATTRACT_JUICE_TUNING.ufoTrailCapPerTick.reduced
      : ATTRACT_JUICE_TUNING.ufoTrailCapPerTick.full;
    const cap = performanceMonitor.scaleFxCount(this.game, baseCap, reduced ? 1 : 2);
    const stride = reduced ? 2 : 1;
    let emitted = 0;
    for (let i = 0; i < shots.length && emitted < cap; i += stride) {
      const shot = shots[i];
      if (!shot.active || !shot.visible) continue;
      this.ufoTrailEmitter.emitParticleAt(shot.x, shot.y, 1);
      emitted++;
    }
  }

  private rollRange(range: readonly [number, number]) {
    return Phaser.Math.Between(range[0], range[1]);
  }

  private rollFloatRange(range: readonly [number, number]) {
    return Phaser.Math.FloatBetween(range[0], range[1]);
  }

  private createNebulaTexture(
    key: string,
    size: number,
    primaryColor: number,
    secondaryColor: number,
    cloudCount: number,
  ) {
    if (this.textures.exists(key)) return;
    const g = this.make.graphics({ x: 0, y: 0 });
    g.fillStyle(0x000000, 0);
    g.fillRect(0, 0, size, size);

    for (let i = 0; i < cloudCount; i++) {
      const cx = Phaser.Math.FloatBetween(0, size);
      const cy = Phaser.Math.FloatBetween(0, size);
      const rx = Phaser.Math.FloatBetween(size * 0.09, size * 0.25);
      const ry = rx * Phaser.Math.FloatBetween(0.5, 0.9);
      g.fillStyle(i % 2 === 0 ? primaryColor : secondaryColor, Phaser.Math.FloatBetween(0.03, 0.1));
      g.fillEllipse(cx, cy, rx * 2, ry * 2);
    }

    for (let i = 0; i < 28; i++) {
      const x = Phaser.Math.FloatBetween(0, size);
      const y = Phaser.Math.FloatBetween(0, size);
      const r = Phaser.Math.FloatBetween(0.6, 1.5);
      g.fillStyle(i % 3 === 0 ? secondaryColor : primaryColor, Phaser.Math.FloatBetween(0.08, 0.2));
      g.fillCircle(x, y, r);
    }

    g.generateTexture(key, size, size);
    g.destroy();
  }

  private resolveNebulaProfileKey() {
    if (this.game.renderer.type !== Phaser.WEBGL) return 'off';
    if (!this.isDecorTierActive(this.backgroundDecorTier)) return 'off';
    return `${this.backgroundDecorTier}-${performanceMonitor.reducedParticles ? 'reduced' : 'full'}`;
  }

  private configureNebulaLayers(force: boolean = false) {
    const profileKey = this.resolveNebulaProfileKey();
    if (!force && profileKey === this.nebulaProfileKey) return;

    this.clearNebulaLayers();
    this.nebulaProfileKey = profileKey;
    if (profileKey === 'off') return;

    this.createNebulaTexture('attract_nebula_a', 512, 0x3d79ff, 0xa36fff, 16);
    this.createNebulaTexture('attract_nebula_b', 512, 0x65ddff, 0xff7bde, 22);

    const reduced = performanceMonitor.reducedParticles;
    const layerCount = this.backgroundDecorTier === 'low' || reduced ? 1 : 2;
    const layerConfigs: Array<{
      key: string;
      vx: number;
      vy: number;
      baseAlpha: number;
      alphaWave: number;
      blendMode: Phaser.BlendModes;
      depth: number;
    }> = [
      {
        key: 'attract_nebula_a',
        vx: 0.5,
        vy: 3.2,
        baseAlpha: this.backgroundDecorTier === 'high' ? 0.095 : 0.08,
        alphaWave: 0.018,
        blendMode: Phaser.BlendModes.NORMAL,
        depth: 2,
      },
      {
        key: 'attract_nebula_b',
        vx: -0.38,
        vy: 4.5,
        baseAlpha: this.backgroundDecorTier === 'high' ? 0.08 : 0.065,
        alphaWave: 0.02,
        blendMode: Phaser.BlendModes.ADD,
        depth: 2.5,
      },
    ];

    for (let i = 0; i < layerCount; i++) {
      const config = layerConfigs[i];
      const baseAlpha = reduced ? config.baseAlpha * 0.84 : config.baseAlpha;
      const sprite = this.add
        .tileSprite(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, config.key)
        .setDepth(config.depth)
        .setAlpha(baseAlpha)
        .setBlendMode(config.blendMode);
      this.nebulaLayers.push({
        sprite,
        vx: config.vx,
        vy: config.vy,
        baseAlpha,
        alphaWave: reduced ? config.alphaWave * 0.6 : config.alphaWave,
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
        layer.baseAlpha + Math.sin(t * 0.33 + layer.phase) * layer.alphaWave,
        0.025,
        0.2,
      );
    }
  }

  private clearNebulaLayers() {
    for (const layer of this.nebulaLayers) {
      layer.sprite.destroy();
    }
    this.nebulaLayers.length = 0;
  }

  private isDecorTierActive(tier: AttractDecorTier): tier is Exclude<AttractDecorTier, 'off'> {
    return tier !== 'off';
  }

  private resolveBackgroundDecorTier(): AttractDecorTier {
    if (performanceMonitor.reducedParticles) {
      const fps = this.game.loop.actualFps;
      return fps > 0 && fps < 22 ? 'off' : 'low';
    }

    if (this.game.renderer.type !== Phaser.WEBGL) return 'low';

    const gpu = this.gpuName.toUpperCase();
    if (!gpu) return performanceMonitor.smokeEnabled ? 'medium' : 'low';

    const highGpuPattern = /(NVIDIA|RTX|GTX|RADEON|\bRX\b|ARC|APPLE M|M1|M2|M3|M4)/;
    if (highGpuPattern.test(gpu)) return 'high';

    const lowGpuPattern = /(INTEL\(R\).*HD|INTEL\(R\).*UHD|IRIS|MESA|VEGA 3|VEGA 6|VEGA 8)/;
    if (lowGpuPattern.test(gpu)) return 'low';

    return performanceMonitor.smokeEnabled ? 'medium' : 'low';
  }

  private configureBackgroundDecor(force: boolean = false) {
    const nextTier = this.resolveBackgroundDecorTier();
    if (!force && nextTier === this.backgroundDecorTier) return;

    this.backgroundDecorTier = nextTier;
    if (!this.isDecorTierActive(nextTier)) {
      this.backgroundDecorSpawnTimerMs = 0;
      this.clearBackgroundDecor();
      this.configureNebulaLayers(force);
      return;
    }

    this.createBackgroundDecorTextures();
    const maxActive = ATTRACT_DECOR_TUNING.maxActive[nextTier];
    while (this.backgroundDecor.length > maxActive) {
      const removed = this.backgroundDecor.shift();
      removed?.sprite.destroy();
    }
    this.scheduleNextBackgroundDecorSpawn(true);
    this.configureNebulaLayers(force);
  }

  private scheduleNextBackgroundDecorSpawn(initial: boolean) {
    if (!this.isDecorTierActive(this.backgroundDecorTier)) {
      this.backgroundDecorSpawnTimerMs = 0;
      return;
    }
    const range = initial
      ? ATTRACT_DECOR_TUNING.initialSpawnDelayMs[this.backgroundDecorTier]
      : ATTRACT_DECOR_TUNING.respawnDelayMs[this.backgroundDecorTier];
    this.backgroundDecorSpawnTimerMs = this.rollRange(range);
  }

  private createBackgroundDecorTextures() {
    this.createPlanetDecorTexture('attract_planet_azure', 300, 0x1a5f95, 0x88dfff);
    this.createPlanetDecorTexture('attract_planet_ember', 280, 0x824f26, 0xffc682);
    this.createPlanetDecorTexture('attract_planet_violet', 290, 0x55327f, 0xd5b8ff);
    this.createGalaxyClusterTexture('attract_cluster_blue', 360, 0x74d0ff, 0x7c6cff);
    this.createGalaxyClusterTexture('attract_cluster_rose', 360, 0xffa6dd, 0xad8bff);
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
    g.fillStyle(baseColor, 0.92);
    g.fillCircle(center, center, radius);
    g.fillStyle(accentColor, 0.17);
    g.fillCircle(center - radius * 0.2, center - radius * 0.22, radius * 0.7);
    g.fillStyle(0x000000, 0.15);
    g.fillCircle(center + radius * 0.2, center + radius * 0.2, radius * 0.54);
    g.lineStyle(4, accentColor, 0.22);
    g.strokeCircle(center, center, radius * 1.03);
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

    for (let i = 0; i < 9; i++) {
      const cx = center + Phaser.Math.FloatBetween(-size * 0.18, size * 0.18);
      const cy = center + Phaser.Math.FloatBetween(-size * 0.13, size * 0.13);
      const rx = Phaser.Math.FloatBetween(size * 0.16, size * 0.35);
      const ry = rx * Phaser.Math.FloatBetween(0.4, 0.76);
      const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(angle);
      const glow = ctx.createRadialGradient(0, 0, rx * 0.06, 0, 0, rx);
      glow.addColorStop(0, rgba(cloud, Phaser.Math.FloatBetween(0.18, 0.32)));
      glow.addColorStop(1, rgba(cloud, 0));
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    for (let i = 0; i < 94; i++) {
      const dist = Phaser.Math.FloatBetween(0, size * 0.46);
      const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const px = center + Math.cos(angle) * dist;
      const py = center + Math.sin(angle) * dist * Phaser.Math.FloatBetween(0.42, 1);
      const radius = Phaser.Math.FloatBetween(0.8, 2.6);
      const starColor = i % 4 === 0 ? cloud : core;
      const alpha = Phaser.Math.FloatBetween(0.35, 0.95);
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
    if (!this.isDecorTierActive(this.backgroundDecorTier)) return;
    if (this.backgroundDecor.length >= ATTRACT_DECOR_TUNING.maxActive[this.backgroundDecorTier])
      return;

    const planetChance = ATTRACT_DECOR_TUNING.planetChancePercent[this.backgroundDecorTier];
    const isPlanet = Phaser.Math.Between(0, 99) < planetChance;
    const texturePool = isPlanet
      ? ['attract_planet_azure', 'attract_planet_ember', 'attract_planet_violet']
      : ['attract_cluster_blue', 'attract_cluster_rose'];
    const texture = Phaser.Utils.Array.GetRandom(texturePool);
    const fromSide = Phaser.Math.Between(0, 99) < 30;

    let x = Phaser.Math.Between(-140, GAME_WIDTH + 140);
    let y = -ATTRACT_DECOR_TUNING.cullPadding;
    let vx = this.rollFloatRange(ATTRACT_DECOR_TUNING.driftSpeedRange);
    let vy = this.rollFloatRange(ATTRACT_DECOR_TUNING.verticalSpeedRange);
    if (fromSide) {
      const fromLeft = Phaser.Math.Between(0, 1) === 0;
      x = fromLeft
        ? -ATTRACT_DECOR_TUNING.cullPadding
        : GAME_WIDTH + ATTRACT_DECOR_TUNING.cullPadding;
      y = Phaser.Math.Between(90, Math.round(GAME_HEIGHT * 0.74));
      vx = fromLeft ? Phaser.Math.FloatBetween(8, 18) : Phaser.Math.FloatBetween(-18, -8);
      vy = this.rollFloatRange(ATTRACT_DECOR_TUNING.verticalSpeedRange) * 0.36;
    }

    const scale = isPlanet
      ? this.rollFloatRange(ATTRACT_DECOR_TUNING.planetScaleRange)
      : this.rollFloatRange(ATTRACT_DECOR_TUNING.clusterScaleRange);
    const alpha = this.rollFloatRange(ATTRACT_DECOR_TUNING.alphaRange);
    const sprite = this.add
      .image(x, y, texture)
      .setScale(scale)
      .setAlpha(alpha)
      .setDepth(ATTRACT_DECOR_TUNING.depth);
    if (!isPlanet) {
      sprite.setBlendMode(Phaser.BlendModes.ADD);
    } else if (Phaser.Math.Between(0, 99) < 40) {
      sprite.setTint(0xdaf0ff);
    }

    this.backgroundDecor.push({
      sprite,
      vx,
      vy,
      spin: this.rollFloatRange(ATTRACT_DECOR_TUNING.spinRange),
      baseAlpha: alpha,
      pulseOffset: Phaser.Math.FloatBetween(0, Math.PI * 2),
    });
  }

  private updateBackgroundDecor(delta: number) {
    if (!this.isDecorTierActive(this.backgroundDecorTier)) return;

    this.backgroundDecorSpawnTimerMs -= delta;
    if (this.backgroundDecorSpawnTimerMs <= 0) {
      this.spawnBackgroundDecor();
      this.scheduleNextBackgroundDecorSpawn(false);
    }

    for (let i = this.backgroundDecor.length - 1; i >= 0; i--) {
      const item = this.backgroundDecor[i];
      item.sprite.x += (item.vx * delta) / 1000;
      item.sprite.y += (item.vy * delta) / 1000;
      item.sprite.rotation += item.spin * delta;
      const pulse = 0.9 + Math.sin(this.time.now * 0.0007 + item.pulseOffset) * 0.1;
      item.sprite.setAlpha(item.baseAlpha * pulse);

      if (
        item.sprite.x < -ATTRACT_DECOR_TUNING.cullPadding ||
        item.sprite.x > GAME_WIDTH + ATTRACT_DECOR_TUNING.cullPadding ||
        item.sprite.y < -ATTRACT_DECOR_TUNING.cullPadding ||
        item.sprite.y > GAME_HEIGHT + ATTRACT_DECOR_TUNING.cullPadding
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

  public getAmbientVisualState() {
    return {
      backgroundDecorTier: this.backgroundDecorTier,
      backgroundDecorCount: this.backgroundDecor.length,
      nebulaLayerCount: this.nebulaLayers.length,
      gpu: this.gpuName,
    };
  }

  private applyEnemyDepth(depth: number) {
    const children = (this.enemyManager?.enemies as any)?.children;
    if (!children || typeof children.each !== 'function') return;
    children.each((enemy: any) => {
      if (enemy.depth !== depth) enemy.setDepth(depth);
      return null;
    });
  }

  private triggerDemoSplit() {
    const candidates: any[] = [];
    const children = (this.enemyManager?.enemies as any)?.children;
    if (!children || typeof children.each !== 'function') return;
    children.each((enemy: any) => {
      if (enemy.active && enemy.scaleX > 0.6) candidates.push(enemy);
      return null;
    });
    if (candidates.length === 0) return;
    const target = Phaser.Utils.Array.GetRandom(candidates);
    this.enemyManager.splitAsteroid(target.x, target.y, target.scaleX);
    target.disableBody(true, true);
  }

  private createEventBanner(centerX: number, y: number, depth: number) {
    this.eventBanner = this.add
      .text(centerX, y, '', {
        fontFamily: '"Press Start 2P"',
        fontSize: '12px',
        color: '#9be7ff',
        stroke: '#00131d',
        strokeThickness: 3,
      })
      .setOrigin(0.5)
      .setDepth(depth)
      .setAlpha(0);
  }

  private announceEvent(label: string) {
    if (!this.eventBanner) return;
    this.eventBannerTween?.stop();
    this.eventBanner.setText(label);
    this.eventBanner.setAlpha(0);
    this.eventBanner.setScale(0.92);
    this.playAttractWarpPulse(this.eventBanner.x, this.eventBanner.y, 'hard');
    this.eventBannerTween = this.tweens.add({
      targets: this.eventBanner,
      alpha: 1,
      scaleX: 1.02,
      scaleY: 1.02,
      duration: 180,
      ease: 'Sine.easeOut',
      yoyo: true,
      hold: 800,
      onComplete: () => {
        this.eventBannerTween = null;
      },
    });
  }

  private spawnDemoPowerUp() {
    const typePool: PowerUpType[] = [
      PowerUpType.BLACK_HOLE,
      PowerUpType.EMP_WAVE,
      PowerUpType.GHOST_PHASE,
      PowerUpType.WINGMAN_DRONES,
      PowerUpType.CANNON_COOLING,
      PowerUpType.SHIELD_BUNKER,
      PowerUpType.MINE_LAYER,
      PowerUpType.TRIPLE_SHOT,
      PowerUpType.SHIELD,
    ];
    const type = Phaser.Utils.Array.GetRandom(typePool);
    const x = Phaser.Math.Between(80, GAME_WIDTH - 80);
    const y = -40;
    const icon = this.add.image(x, y, `powerup_${type}`).setDepth(8).setScale(0.95).setAlpha(0.9);
    const label = this.add
      .text(x, y - 24, this.getPowerUpAbbreviation(type), {
        fontFamily: '"Press Start 2P"',
        fontSize: '11px',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 2,
      })
      .setDepth(8)
      .setOrigin(0.5);

    this.demoPowerUps.push({
      icon,
      label,
      vx: Phaser.Math.Between(-36, 36),
      vy: Phaser.Math.Between(58, 110),
      spin: Phaser.Math.FloatBetween(-0.025, 0.025),
    });
  }

  private updateDemoPowerUps(delta: number) {
    this.demoPowerUpSpawnTimer -= delta;
    if (this.demoPowerUpSpawnTimer <= 0 && this.demoPowerUps.length < 7) {
      this.spawnDemoPowerUp();
      this.demoPowerUpSpawnTimer = Phaser.Math.Between(1300, 2500);
    }

    for (let i = this.demoPowerUps.length - 1; i >= 0; i--) {
      const item = this.demoPowerUps[i];
      item.icon.x += (item.vx * delta) / 1000;
      item.icon.y += (item.vy * delta) / 1000;
      item.icon.rotation += item.spin * delta;
      item.label.x = item.icon.x;
      item.label.y = item.icon.y - 24;

      if (item.icon.y > GAME_HEIGHT + 80 || item.icon.x < -100 || item.icon.x > GAME_WIDTH + 100) {
        item.icon.destroy();
        item.label.destroy();
        this.demoPowerUps.splice(i, 1);
      }
    }
  }

  private spawnAttractBlackHole() {
    this.removeAttractBlackHole();
    this.audio.playBlackHole();
    const x = Phaser.Math.Between(Math.round(GAME_WIDTH * 0.24), Math.round(GAME_WIDTH * 0.76));
    const y = Phaser.Math.Between(Math.round(GAME_HEIGHT * 0.24), Math.round(GAME_HEIGHT * 0.68));
    const graphics = this.add.graphics().setDepth(4);
    this.attractBlackHole = {
      x,
      y,
      ttlMs: Phaser.Math.Between(5000, 8200),
      graphics,
    };
    this.attractBlackHoleForceAccumulatorMs = 0;
    this.attractBlackHoleSpawnTimer = Phaser.Math.Between(11000, 17000);
    this.announceEvent('BLACK HOLE FIELD');
  }

  private updateAttractBlackHole(delta: number) {
    if (!this.attractBlackHole) {
      this.attractBlackHoleSpawnTimer -= delta;
      if (this.attractBlackHoleSpawnTimer <= 0) {
        this.spawnAttractBlackHole();
      }
      return;
    }

    const state = this.attractBlackHole;
    state.ttlMs -= delta;
    if (state.ttlMs <= 0) {
      this.removeAttractBlackHole();
      return;
    }

    const phase = this.time.now * 0.006;
    const outer = 46 + Math.sin(phase * 1.4) * 8;
    const inner = 18 + Math.cos(phase * 2.2) * 4;
    state.graphics
      .clear()
      .lineStyle(3, 0xaa00ff, 0.75)
      .strokeCircle(state.x, state.y, outer)
      .lineStyle(2, 0x65f5ff, 0.85)
      .strokeCircle(state.x, state.y, inner);
    for (let i = 0; i < 3; i++) {
      const a = phase + i * ((Math.PI * 2) / 3);
      state.graphics.fillStyle(0xd3b3ff, 0.8);
      state.graphics.fillCircle(state.x + Math.cos(a) * 28, state.y + Math.sin(a) * 28, 2.5);
    }

    this.attractBlackHoleForceAccumulatorMs += delta;
    if (this.attractBlackHoleForceAccumulatorMs < 33) return;
    const forceScale = this.attractBlackHoleForceAccumulatorMs / (1000 / 60);
    this.attractBlackHoleForceAccumulatorMs = 0;
    const radius = 320;
    const radiusSq = radius * radius;

    const enemies = this.enemyManager.enemies.getChildren() as Enemy[];
    for (const enemy of enemies) {
      if (!enemy.active || !enemy.body) continue;
      const dx = state.x - enemy.x;
      const dy = state.y - enemy.y;
      const distSq = dx * dx + dy * dy;
      if (distSq <= 36 || distSq > radiusSq) continue;
      const invDist = 1 / Math.sqrt(distSq);
      const pull = (1 - distSq / radiusSq) * 14 * forceScale;
      enemy.body.velocity.x += dx * invDist * pull;
      enemy.body.velocity.y += dy * invDist * pull;
    }

    for (const item of this.demoPowerUps) {
      const dx = state.x - item.icon.x;
      const dy = state.y - item.icon.y;
      const distSq = dx * dx + dy * dy;
      if (distSq <= 36 || distSq > radiusSq) continue;
      const invDist = 1 / Math.sqrt(distSq);
      const pull = (1 - distSq / radiusSq) * 12 * forceScale;
      item.vx += dx * invDist * pull;
      item.vy += dy * invDist * pull;
      const speed = Math.hypot(item.vx, item.vy);
      if (speed > 190) {
        const scale = 190 / speed;
        item.vx *= scale;
        item.vy *= scale;
      }
    }
  }

  private removeAttractBlackHole() {
    if (!this.attractBlackHole) return;
    this.attractBlackHole.graphics.destroy();
    this.attractBlackHole = null;
    this.attractBlackHoleForceAccumulatorMs = 0;
  }

  private clearDemoPowerUps() {
    for (const item of this.demoPowerUps) {
      item.icon.destroy();
      item.label.destroy();
    }
    this.demoPowerUps.length = 0;
  }

  private getPowerUpAbbreviation(type: PowerUpType) {
    switch (type) {
      case PowerUpType.TRIPLE_SHOT:
        return 'TRI';
      case PowerUpType.SLOW_MOTION:
        return 'SLO';
      case PowerUpType.SHIELD:
        return 'SHD';
      case PowerUpType.EMP_WAVE:
        return 'EMP';
      case PowerUpType.GHOST_PHASE:
        return 'GST';
      case PowerUpType.WINGMAN_DRONES:
        return 'DRN';
      case PowerUpType.CANNON_COOLING:
        return 'CLG';
      case PowerUpType.BLACK_HOLE:
        return 'BLK';
      case PowerUpType.SHIELD_BUNKER:
        return 'BNK';
      case PowerUpType.MINE_LAYER:
        return 'MNE';
      default:
        return 'PWR';
    }
  }

  private createHighScoreTable(
    centerX: number,
    centerY: number,
    depth: number,
  ): Phaser.GameObjects.Container {
    const title = this.add
      .text(centerX, centerY - 80, 'TOP SCORES', {
        fontFamily: '"Press Start 2P"',
        fontSize: '20px',
        color: '#00ffff',
      })
      .setOrigin(0.5);

    const scores = this.getHighScoreRows();
    this.highScoreRows = scores.map((entry, index) =>
      this.add
        .text(centerX, centerY - 40 + index * 24, `${index + 1}. ${entry.name} ${entry.score}`, {
          fontFamily: '"Press Start 2P"',
          fontSize: '14px',
          color: '#ffffff',
        })
        .setOrigin(0.5),
    );

    const group = this.add.container(0, 0, [title, ...this.highScoreRows]);
    group.setDepth(depth);
    return group;
  }

  private getHighScoreRows(): HighScoreEntry[] {
    const fallback = { score: 0, name: '---' };
    const entries: HighScoreEntry[] = [];
    try {
      const raw = localStorage.getItem('spaceShooterHighscore');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          parsed.forEach((entry) => {
            if (typeof entry?.score === 'number' && typeof entry?.name === 'string') {
              entries.push({ score: entry.score, name: entry.name });
            }
          });
        } else if (typeof parsed?.score === 'number' && typeof parsed?.name === 'string') {
          entries.push({ score: parsed.score, name: parsed.name });
        }
      }
    } catch {
      // ignore malformed storage
    }
    entries.sort((a, b) => b.score - a.score);
    while (entries.length < 5) entries.push({ ...fallback });
    return entries.slice(0, 5);
  }

  private saveHighScoreRows(entries: HighScoreEntry[]) {
    const trimmed = entries.filter((entry) => entry.score > 0 && entry.name !== '---');
    localStorage.setItem('spaceShooterHighscore', JSON.stringify(trimmed));
  }

  private updateHighScoreRows(entries: HighScoreEntry[]) {
    if (this.highScoreRows.length === 0) return;
    const fallback = { score: 0, name: '---' };
    const normalized = [...entries].sort((a, b) => b.score - a.score);
    while (normalized.length < this.highScoreRows.length) {
      normalized.push({ ...fallback });
    }
    for (let i = 0; i < this.highScoreRows.length; i++) {
      const entry = normalized[i] ?? fallback;
      this.highScoreRows[i].setText(`${i + 1}. ${entry.name} ${entry.score}`);
    }
  }

  private refreshHighScoresFromServerLazy() {
    remoteStatsService.warmupUserRegistration();
    void remoteStatsService.fetchSnapshotLazy('normal', true).then((snapshot) => {
      if (!this.scene.isActive(this.scene.key)) return;
      if (!snapshot) {
        this.updateServerStatsUnavailableRows(remoteStatsService.isNetworkOnline());
        return;
      }
      const localRows = this.getHighScoreRows();
      const mergedRows = mergeLeaderboardEntries(localRows, snapshot.highscores, 5);
      this.saveHighScoreRows(mergedRows);
      this.updateHighScoreRows(mergedRows);
      this.updateServerStatsRows(snapshot.totalUsers, snapshot.coinsSpent);
    });
  }

  private createPowerUpPreview(
    centerX: number,
    y: number,
    depth: number,
  ): Phaser.GameObjects.Container {
    if (!this.textures.exists('powerup_SHIELD')) {
      const seed = new PowerUp(this, -1000, -1000);
      this.add.existing(seed);
      seed.setVisible(false);
      seed.setActive(false);
      seed.destroy();
    }

    const label = this.add
      .text(0, 0, 'COLLECT THESE!', {
        fontFamily: '"Press Start 2P"',
        fontSize: '16px',
        color: '#ffffff',
      })
      .setOrigin(0.5);

    const types = [
      PowerUpType.TRIPLE_SHOT,
      PowerUpType.SHIELD,
      PowerUpType.SLOW_MOTION,
      PowerUpType.EMP_WAVE,
      PowerUpType.GHOST_PHASE,
      PowerUpType.WINGMAN_DRONES,
      PowerUpType.CANNON_COOLING,
      PowerUpType.BLACK_HOLE,
      PowerUpType.SHIELD_BUNKER,
      PowerUpType.MINE_LAYER,
    ];
    const spacing = 50;
    const totalWidth = (types.length - 1) * spacing;
    const startX = -totalWidth / 2;
    const iconY = 36;
    const icons = types.map((type, index) =>
      this.add
        .image(startX + index * spacing, iconY, `powerup_${type}`)
        .setScale(1.05)
        .setAlpha(0.9),
    );

    const container = this.add.container(centerX, y, [label, ...icons]);
    container.setDepth(depth);
    return container;
  }

  private layoutAttractUi() {
    if (!this.titleLogoContainer || this.playerButtons.length === 0) return;
    const titleBottom = this.titleLogoContainer.getBounds().bottom;
    const buttonBounds = this.playerButtons[0].bg.getBounds();
    const buttonTop = buttonBounds.top;
    const buttonBottom = buttonBounds.bottom;
    const verticalMidpoint = (titleBottom + buttonTop) * 0.5;
    const minRotatingCenter = titleBottom + 88;
    const maxRotatingCenter = buttonTop - 88;
    const rotatingCenterY =
      maxRotatingCenter > minRotatingCenter
        ? Phaser.Math.Clamp(verticalMidpoint, minRotatingCenter, maxRotatingCenter)
        : verticalMidpoint;

    this.centerInfoBlockAtY(rotatingCenterY);
    this.centerObjectAtY(this.highScoreGroup, rotatingCenterY);
    this.centerObjectAtY(this.dailyChallengeGroup, rotatingCenterY);
    this.dailyChallengeOriginalY = this.dailyChallengeGroup.y;
    this.centerObjectAtY(this.serverStatsGroup, rotatingCenterY);

    if (this.eventBanner) {
      const bannerY = Phaser.Math.Clamp(buttonTop - 24, rotatingCenterY + 60, buttonTop - 18);
      this.eventBanner.setY(bannerY);
    }

    const footerTargets: Phaser.GameObjects.GameObject[] = [
      this.helpText,
      this.settingsText,
      this.powerUpPreviewContainer ?? this.creditLabel,
      this.creditLabel,
    ];
    const footerBottomY = GAME_HEIGHT - 26;
    const stepY = (footerBottomY - buttonBottom) / (footerTargets.length + 1);
    footerTargets.forEach((target, index) => {
      this.centerObjectAtY(target, buttonBottom + stepY * (index + 1));
    });
  }

  private centerInfoBlockAtY(targetCenterY: number) {
    const infoTop = Math.min(this.coinText.getBounds().top, this.coinInfoText.getBounds().top);
    const infoBottom = Math.max(
      this.coinText.getBounds().bottom,
      this.coinInfoText.getBounds().bottom,
    );
    const currentCenterY = (infoTop + infoBottom) * 0.5;
    const deltaY = targetCenterY - currentCenterY;
    this.coinText.y += deltaY;
    this.coinInfoText.y += deltaY;
  }

  private centerObjectAtY(target: Phaser.GameObjects.GameObject, centerY: number) {
    const targetWithBounds = target as Phaser.GameObjects.GameObject & {
      y: number;
      getBounds?: () => Phaser.Geom.Rectangle;
    };
    if (typeof targetWithBounds.getBounds !== 'function') return;
    const bounds = targetWithBounds.getBounds();
    const currentCenterY = (bounds.top + bounds.bottom) * 0.5;
    targetWithBounds.y += centerY - currentCenterY;
  }

  private createPlayerButtons(centerX: number, y: number, depth: number) {
    const buttonWidth = 220;
    const buttonHeight = 60;
    const spacing = 30;
    const totalWidth = buttonWidth * 2 + spacing;
    const startX = centerX - totalWidth / 2 + buttonWidth / 2;

    const makeButton = (label: string, requiredCredits: number, index: number) => {
      const x = startX + index * (buttonWidth + spacing);
      const bg = this.add
        .rectangle(x, y, buttonWidth, buttonHeight, 0x333333, 0.6)
        .setDepth(depth)
        .setInteractive({ useHandCursor: true });
      const text = this.add
        .text(x, y, label, {
          fontFamily: '"Press Start 2P"',
          fontSize: '18px',
          color: '#ffffff',
        })
        .setOrigin(0.5)
        .setDepth(depth);
      bg.on('pointerdown', () => this.startGame(requiredCredits));
      this.playerButtons.push({ requiredCredits, bg, label: text });
    };

    makeButton('1 PLAYER (1)', 1, 0);
    makeButton('2 PLAYER (2)', 2, 1);
  }

  private updatePlayerButtons() {
    const credits = creditManager.getCredits();
    this.playerButtons.forEach((button) => {
      const enabled = credits >= button.requiredCredits;
      button.bg.setFillStyle(enabled ? 0x00aa00 : 0x333333, enabled ? 1 : 0.6);
      button.label.setAlpha(enabled ? 1 : 0.4);
      if (button.bg.input) button.bg.input.enabled = enabled;
    });
  }

  private startGame(requiredCredits: number) {
    if (this.settingsOverlayOpen) return;
    if (!creditManager.spendCredits(requiredCredits)) return;
    remoteStatsService.reportCoinsSpent(requiredCredits);
    void this.audio.resume();
    recalculateDimensions();
    setCurrentDifficultyKey(this.difficultyKey);
    this.scene.start('MainScene', { players: requiredCredits, difficulty: this.difficultyKey });
  }

  private createDailyChallengeBlock(
    centerX: number,
    y: number,
    depth: number,
  ): Phaser.GameObjects.Container {
    const title = this.add
      .text(centerX, y - 40, 'DAILY CHALLENGE', {
        fontFamily: '"Press Start 2P"',
        fontSize: '18px',
        color: '#ffcc44',
      })
      .setOrigin(0.5);

    const bg = this.add
      .rectangle(centerX, y + 20, 280, 50, 0x664400, 0.8)
      .setStrokeStyle(2, 0xffaa00)
      .setInteractive({ useHandCursor: true });

    const btnText = this.add
      .text(centerX, y + 20, 'START (C)', {
        fontFamily: '"Press Start 2P"',
        fontSize: '16px',
        color: '#ffffff',
      })
      .setOrigin(0.5);

    bg.on('pointerdown', () => this.startDaily());
    this.input.keyboard?.on('keydown-C', () => this.startDaily());

    const group = this.add.container(0, 0, [title, bg, btnText]);
    group.setDepth(depth);
    return group;
  }

  private createServerStatsBlock(
    centerX: number,
    y: number,
    depth: number,
  ): Phaser.GameObjects.Container {
    const title = this.add
      .text(centerX, y - 42, 'LIVE STATS', {
        fontFamily: '"Press Start 2P"',
        fontSize: '18px',
        color: '#8cf8ff',
      })
      .setOrigin(0.5);

    const panel = this.add
      .rectangle(centerX, y + 18, 360, 88, 0x0f172a, 0.84)
      .setStrokeStyle(2, 0x3fc7ff);

    this.serverStatsUsersText = this.add
      .text(centerX, y, 'TOTAL USERS: ...', {
        fontFamily: '"Press Start 2P"',
        fontSize: '14px',
        color: '#ffffff',
      })
      .setOrigin(0.5);

    this.serverStatsCoinsText = this.add
      .text(centerX, y + 28, 'COINS USED: ...', {
        fontFamily: '"Press Start 2P"',
        fontSize: '14px',
        color: '#ffd166',
      })
      .setOrigin(0.5);

    const group = this.add.container(0, 0, [
      panel,
      title,
      this.serverStatsUsersText,
      this.serverStatsCoinsText,
    ]);
    group.setDepth(depth);
    return group;
  }

  private updateServerStatsRows(totalUsers: number, coinsSpent: number) {
    this.serverStatsUsersText?.setText(`TOTAL USERS: ${Math.max(0, Math.floor(totalUsers))}`);
    this.serverStatsCoinsText?.setText(`COINS USED: ${Math.max(0, Math.floor(coinsSpent))}`);
  }

  private updateServerStatsUnavailableRows(networkOnline: boolean) {
    if (networkOnline) {
      this.serverStatsUsersText?.setText('TOTAL USERS: N/A');
      this.serverStatsCoinsText?.setText('COINS USED: N/A');
      return;
    }
    this.serverStatsUsersText?.setText('TOTAL USERS: OFFLINE');
    this.serverStatsCoinsText?.setText('COINS USED: OFFLINE');
  }

  private startDaily() {
    if (this.settingsOverlayOpen) return;
    if (!creditManager.spendCredits(1)) return;
    remoteStatsService.reportCoinsSpent(1);
    void this.audio.resume();
    recalculateDimensions();
    const today = new Date().toISOString().slice(0, 10);
    setCurrentDifficultyKey('normal');
    this.scene.start('MainScene', {
      players: 1,
      difficulty: 'normal' as DifficultyPresetKey,
      dailySeed: today,
    });
  }

  private createTitleLogo(centerX: number, y: number, depth: number): Phaser.GameObjects.Container {
    const container = this.add.container(centerX, y).setDepth(depth);
    const topLine = this.createLogoLine('MEUSE24', 32, 2, 14);
    const midLine = this.createLogoLine('KINETIC', 96, 4, 8);
    const bottomLine = this.createLogoLine('SCAN', 96, 4, 8);
    topLine.y = 0;
    midLine.y = 100;
    bottomLine.y = 220;
    container.add([topLine, midLine, bottomLine]);
    container.setScale(1.12);
    this.tweens.add({
      targets: container,
      y: y + 15,
      duration: 3000,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });
    return container;
  }

  private createLogoLine(
    text: string,
    fontSize: number,
    strokeThickness: number,
    letterSpacing: number,
  ) {
    const textObj = this.add.text(0, 0, text, {
      fontFamily: '"Chakra Petch"',
      fontSize: `${fontSize}px`,
      color: '#f4f8ff',
      stroke: '#ffffff',
      strokeThickness,
      letterSpacing,
    });
    textObj.setOrigin(0.5);
    return textObj;
  }
}
