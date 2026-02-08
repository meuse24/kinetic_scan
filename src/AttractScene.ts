import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, applyPendingResize, recalculateDimensions } from './gameConfig';
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
import { UFO } from './UFO';
import { PowerUp, PowerUpType } from './PowerUp';
import { performanceMonitor } from './PerformanceMonitor';
import { musicManager } from './MusicManager';

type PlayerButton = {
  requiredCredits: number;
  bg: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
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

export default class AttractScene extends Phaser.Scene {
  private audio!: AudioManager;
  private coinText!: Phaser.GameObjects.Text;
  private helpText!: Phaser.GameObjects.Text;
  private soundText!: Phaser.GameObjects.Text;
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
  private showScores: boolean = false;
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
  private difficultyText!: Phaser.GameObjects.Text;
  private creditListener?: (credits: number) => void;
  private soundListener?: (muted: boolean) => void;
  private gpuName: string = '';
  private backgroundDecorTier: AttractDecorTier = 'off';
  private backgroundDecorSpawnTimerMs: number = 0;
  private backgroundDecor: AttractBackgroundDecor[] = [];

  constructor() {
    super('AttractScene');
  }

  create() {
    if (applyPendingResize(this.game)) {
      if (this.scene.isActive('BezelScene')) {
        this.scene.stop('BezelScene');
      }
    }

    this.audio = new AudioManager(this);
    musicManager.play();
    const centerX = GAME_WIDTH / 2;
    const centerY = GAME_HEIGHT / 2;
    const uiDepth = 50;

    if (!this.scene.isActive('BezelScene')) {
      this.scene.launch('BezelScene');
    }
    this.scene.bringToTop('BezelScene');
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
    this.createTitleLogo(centerX, GAME_HEIGHT * 0.15, uiDepth);

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

    this.startHeartbeatPulse();

    this.highScoreGroup = this.createHighScoreTable(centerX, centerY + 80, uiDepth);
    this.highScoreGroup.setAlpha(0);

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

    this.soundText = this.add
      .text(centerX, GAME_HEIGHT - 165, this.getSoundLabel(), {
        fontFamily: '"Press Start 2P"',
        fontSize: '16px',
        color: '#ffffff',
      })
      .setOrigin(0.5)
      .setDepth(uiDepth)
      .setInteractive({ useHandCursor: true });
    this.soundText.on('pointerdown', () => this.toggleSound());

    this.difficultyText = this.add
      .text(centerX, GAME_HEIGHT - 230, this.getDifficultyLabel(), {
        fontFamily: '"Press Start 2P"',
        fontSize: '16px',
        color: '#ffcc66',
      })
      .setOrigin(0.5)
      .setDepth(uiDepth)
      .setInteractive({ useHandCursor: true });
    this.difficultyText.on('pointerdown', () => this.cycleDifficulty(1));

    this.createPlayerButtons(centerX, centerY + 210, uiDepth);

    this.createPowerUpPreview(centerX, GAME_HEIGHT - 130, uiDepth);
    this.createEventBanner(centerX, centerY + 164, uiDepth);
    this.attractBlackHoleSpawnTimer = Phaser.Math.Between(4800, 8500);
    this.demoPowerUpSpawnTimer = Phaser.Math.Between(1200, 2400);

    // Interaction
    this.input.keyboard?.on('keydown-I', () => this.insertCoin());
    this.input.keyboard?.on('keydown-ONE', () => this.startGame(1));
    this.input.keyboard?.on('keydown-TWO', () => this.startGame(2));
    this.input.keyboard?.on('keydown-SPACE', () => this.startGame(1));
    this.input.keyboard?.on('keydown-ENTER', () => this.startGame(1));
    this.input.keyboard?.on('keydown-UP', () => this.startGame(1));
    this.input.keyboard?.on('keydown-A', () => this.cycleDifficulty(-1));
    this.input.keyboard?.on('keydown-D', () => this.cycleDifficulty(1));
    this.input.keyboard?.on('keydown-LEFT', () => this.cycleDifficulty(-1));
    this.input.keyboard?.on('keydown-RIGHT', () => this.cycleDifficulty(1));
    this.input.keyboard?.on('keydown-S', () => this.toggleSound());
    this.input.keyboard?.on('keydown-H', () => this.openHelp());

    this.creditListener = (credits) => {
      this.creditLabel.setText(`CREDITS: ${credits}`);
      this.updatePlayerButtons();
    };
    creditManager.onChange(this.creditListener, this);
    this.updatePlayerButtons();

    this.soundListener = (muted) => {
      this.updateSoundLabel(muted);
      this.audio.setVolume(muted ? 0 : DEFAULT_VOLUME);
    };
    soundManager.onChange(this.soundListener, this);
    this.updateSoundLabel(soundManager.isMuted());

    this.events.once('shutdown', () => {
      this.heartbeatActive = false;
      this.heartbeatTimer?.remove(false);
      this.heartbeatTimer = null;
      this.enemyManager.enemies.destroy(true);
      this.ufo.setCombatTarget(null);
      this.ufo.deactivate();
      this.attractCombatTarget?.destroy();
      this.removeAttractBlackHole();
      this.clearDemoPowerUps();
      this.clearBackgroundDecor();
      this.eventBannerTween?.stop();
      this.eventBannerTween = null;
      this.ambientEmitter.destroy();
      this.audio.destroy();
      if (this.creditListener) creditManager.offChange(this.creditListener, this);
      if (this.soundListener) soundManager.offChange(this.soundListener, this);
    });
  }

  update(time: number, delta: number) {
    const qualityChanged = performanceMonitor.update(this.game);
    if (
      !performanceMonitor.crtEnabled &&
      this.game.renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer
    ) {
      this.cameras.main.removePostPipeline('CRTPipeline');
    }
    if (qualityChanged) {
      this.configureBackgroundDecor();
    }
    this.enemyManager.update(time, delta);
    this.updateAttractCombatTarget(delta);
    this.updateBackgroundDecor(delta);
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
    await this.audio.resume();
    this.audio.playCoin();
    creditManager.addCredits(1);
  }

  private toggleSound() {
    void this.audio.resume();
    soundManager.toggle();
  }

  private getSoundLabel() {
    return `SOUND: ${soundManager.isMuted() ? 'OFF' : 'ON'} (S)`;
  }

  private getDifficultyLabel() {
    return `DIFFICULTY: ${getDifficultyPreset(this.difficultyKey).label} (A/D)`;
  }

  private cycleDifficulty(direction: 1 | -1) {
    this.difficultyKey = cycleDifficulty(direction);
    this.difficultyText.setText(this.getDifficultyLabel());
    const preset = getDifficultyPreset(this.difficultyKey);
    this.audio.setDifficultyMix(this.difficultyKey);
    this.enemyManager.setDifficultyPreset(preset);
    this.ufo.setDifficultyPreset(preset);
  }

  private updateSoundLabel(muted: boolean) {
    this.soundText.setText(`SOUND: ${muted ? 'OFF' : 'ON'} (S)`);
    this.soundText.setColor(muted ? '#ff6666' : '#ffffff');
  }

  private openHelp() {
    if (this.scene.isActive('HelpScene')) return;
    this.scene.launch('HelpScene', { returnScene: this.scene.key });
    this.scene.pause();
  }

  private toggleAttractMessage() {
    this.showScores = !this.showScores;
    if (this.showScores) {
      this.tweens.add({ targets: this.coinText, alpha: 0, duration: 400, ease: 'Sine.easeInOut' });
      this.tweens.add({ targets: this.helpText, alpha: 0, duration: 400, ease: 'Sine.easeInOut' });
      this.tweens.add({
        targets: this.highScoreGroup,
        alpha: 1,
        duration: 500,
        ease: 'Sine.easeInOut',
      });
    } else {
      this.tweens.add({ targets: this.coinText, alpha: 1, duration: 500, ease: 'Sine.easeInOut' });
      this.tweens.add({ targets: this.helpText, alpha: 1, duration: 500, ease: 'Sine.easeInOut' });
      this.tweens.add({
        targets: this.highScoreGroup,
        alpha: 0,
        duration: 400,
        ease: 'Sine.easeInOut',
      });
    }
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

  private createAmbientTexture() {
    if (this.textures.exists('dust')) return;
    const g = this.make.graphics({ x: 0, y: 0 });
    g.fillStyle(0xffffff, 1);
    g.fillRect(0, 0, 2, 2);
    g.generateTexture('dust', 2, 2);
    g.destroy();
  }

  private rollRange(range: readonly [number, number]) {
    return Phaser.Math.Between(range[0], range[1]);
  }

  private rollFloatRange(range: readonly [number, number]) {
    return Phaser.Math.FloatBetween(range[0], range[1]);
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
      return;
    }

    this.createBackgroundDecorTextures();
    const maxActive = ATTRACT_DECOR_TUNING.maxActive[nextTier];
    while (this.backgroundDecor.length > maxActive) {
      const removed = this.backgroundDecor.shift();
      removed?.sprite.destroy();
    }
    this.scheduleNextBackgroundDecorSpawn(true);
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
    const center = size / 2;
    const g = this.make.graphics({ x: 0, y: 0 });

    for (let i = 0; i < 8; i++) {
      const rx = Phaser.Math.FloatBetween(size * 0.17, size * 0.35);
      const ry = Phaser.Math.FloatBetween(size * 0.08, size * 0.19);
      const cx = center + Phaser.Math.FloatBetween(-size * 0.17, size * 0.17);
      const cy = center + Phaser.Math.FloatBetween(-size * 0.12, size * 0.12);
      g.fillStyle(cloudColor, Phaser.Math.FloatBetween(0.06, 0.14));
      g.fillEllipse(cx, cy, rx * 2, ry * 2);
    }

    for (let i = 0; i < 90; i++) {
      const dist = Phaser.Math.FloatBetween(0, size * 0.46);
      const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const x = center + Math.cos(angle) * dist;
      const y = center + Math.sin(angle) * dist * Phaser.Math.FloatBetween(0.42, 1);
      const radius = Phaser.Math.FloatBetween(0.8, 2.6);
      g.fillStyle(i % 4 === 0 ? cloudColor : coreColor, Phaser.Math.FloatBetween(0.35, 0.95));
      g.fillCircle(x, y, radius);
    }

    g.generateTexture(key, size, size);
    g.destroy();
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
    const rows = scores.map((entry, index) =>
      this.add
        .text(centerX, centerY - 40 + index * 24, `${index + 1}. ${entry.name} ${entry.score}`, {
          fontFamily: '"Press Start 2P"',
          fontSize: '14px',
          color: '#ffffff',
        })
        .setOrigin(0.5),
    );

    const group = this.add.container(0, 0, [title, ...rows]);
    group.setDepth(depth);
    return group;
  }

  private getHighScoreRows() {
    const fallback = { score: 0, name: '---' };
    const entries: { score: number; name: string }[] = [];
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

  private createPowerUpPreview(centerX: number, y: number, depth: number) {
    if (!this.textures.exists('powerup_SHIELD')) {
      const seed = new PowerUp(this, -1000, -1000);
      this.add.existing(seed);
      seed.setVisible(false);
      seed.setActive(false);
      seed.destroy();
    }

    const label = this.add
      .text(centerX, y, 'COLLECT THESE!', {
        fontFamily: '"Press Start 2P"',
        fontSize: '16px',
        color: '#ffffff',
      })
      .setOrigin(0.5)
      .setDepth(depth);

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
    ];
    const spacing = 50;
    const totalWidth = (types.length - 1) * spacing;
    const startX = centerX - totalWidth / 2;
    types.forEach((type, index) => {
      const icon = this.add
        .image(startX + index * spacing, y + 40, `powerup_${type}`)
        .setScale(1.1)
        .setDepth(depth);
      icon.setAlpha(0.9);
    });

    label.setDepth(depth);
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
    if (!creditManager.spendCredits(requiredCredits)) return;
    void this.audio.resume();
    recalculateDimensions();
    setCurrentDifficultyKey(this.difficultyKey);
    this.scene.start('MainScene', { players: requiredCredits, difficulty: this.difficultyKey });
  }

  private createTitleLogo(centerX: number, y: number, depth: number) {
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
