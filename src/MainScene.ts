import Phaser from 'phaser';
import { Player, Bullet } from './Player';
import { EnemyManager, Enemy } from './EnemyManager';
import { ExplosionManager } from './ExplosionManager';
import { AudioManager } from './AudioManager';
import { UFO } from './UFO';
import { PowerUpDirector } from './PowerUpDirector';
import { PowerUp, PowerUpType } from './PowerUp';
import { GAME_WIDTH, GAME_HEIGHT, applyPendingResize } from './gameConfig';
import { performanceMonitor } from './PerformanceMonitor';

interface PlayerState {
  score: number;
  lives: number;
  activePowerUps: Map<PowerUpType, number>;
  powerUpTimer: number;
}

type MainSceneData = {
  players?: number;
};

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
  private playerStates: PlayerState[] = [];
  private activePlayerIndex: number = 0;
  private playerCount: number = 1;
  private isSwitching: boolean = false;
  private switchOverlay!: Phaser.GameObjects.Container;
  private switchText!: Phaser.GameObjects.Text;
  private switchPrompt!: Phaser.GameObjects.Text;
  private switchTimer?: Phaser.Time.TimerEvent;
  private awaitingTurnInput: boolean = false;
  private turnKeyHandler?: (event: KeyboardEvent) => void;
  private turnPointerHandler?: () => void;

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
  private empGraphics!: Phaser.GameObjects.Graphics;

  private p1ScoreText!: Phaser.GameObjects.Text;
  private p2ScoreText?: Phaser.GameObjects.Text;
  private p1LivesText!: Phaser.GameObjects.Text;
  private p2LivesText?: Phaser.GameObjects.Text;
  private activeMarkerLeft?: Phaser.GameObjects.Text;
  private activeMarkerRight?: Phaser.GameObjects.Text;
  private activeMarkerTween?: Phaser.Tweens.Tween;
  private lastActiveMarkerIndex: number = -1;
  private debugText!: Phaser.GameObjects.Text;
  private powerUpBar!: Phaser.GameObjects.Graphics;
  private powerUpListText!: Phaser.GameObjects.Text;
  private heatBar!: Phaser.GameObjects.Graphics;
  private smokeEmitter: Phaser.GameObjects.Particles.ParticleEmitter | null = null;

  constructor() {
    super('MainScene');
  }

  init(data: MainSceneData) {
    this.playerCount = data?.players === 2 ? 2 : 1;
    this.activePlayerIndex = 0;
    this.playerStates = [];
    for (let i = 0; i < this.playerCount; i++) {
      this.playerStates.push({
        score: 0,
        lives: 3,
        activePowerUps: new Map(),
        powerUpTimer: 0,
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
    this.isGameOver = false;
    this.isSwitching = false;
    const startingState = this.playerStates[this.activePlayerIndex] ?? {
      score: 0,
      lives: 3,
      activePowerUps: new Map(),
      powerUpTimer: 0,
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
    this.ufo = new UFO(this, this.audio);
    this.powerUpDirector = new PowerUpDirector(this);

    this.useHighEndVFX =
      this.sys.game.device.os.desktop && this.game.renderer.type === Phaser.WEBGL;
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

    this.slowMoOverlay = this.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x0000ff, 0)
      .setDepth(5);
    this.empGraphics = this.add.graphics().setDepth(10);
    this.createHUD();
    this.createTurnOverlay();
    this.powerUpBar = this.add.graphics();
    this.heatBar = this.add.graphics().setDepth(120);
    this.createSmokeEmitter();
    this.updateHUD();
    this.applyActivePowerUpEffects(true);
    this.ufoSpawnTimer = Phaser.Math.Between(30000, 60000);

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

    // Apply CRT Shader Pipeline
    if (this.game.renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer) {
      this.cameras.main.setPostPipeline('CRTPipeline');
    }

    // Cleanup on scene shutdown

    this.events.once('shutdown', () => {
      this.ufo.deactivate();
      this.removeDrones();
      this.removeBlackHole();
      this.powerUpBar.destroy();
      this.heatBar.destroy();
      this.smokeEmitter?.destroy();
      this.empGraphics.destroy();
      this.slowMoOverlay.destroy();
      this.switchTimer?.remove(false);
      this.switchOverlay?.destroy();
      this.activeMarkerTween?.stop();
      if (this.turnKeyHandler) this.input.keyboard?.off('keydown', this.turnKeyHandler);
      if (this.turnPointerHandler) this.input.off('pointerdown', this.turnPointerHandler);
    });
  }

  update(time: number, delta: number) {
    if (this.isSwitching) return;
    this.player.update(time, delta);
    this.enemyManager.update(time, delta);
    this.powerUpDirector.update(this.score, delta);

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
      this.useHighEndVFX = performanceMonitor.smokeEnabled && this.useHighEndVFX;
    }

    let renderer = 'UNKNOWN';
    if (this.game.renderer.type === Phaser.WEBGL) renderer = 'WEBGL';
    else if (this.game.renderer.type === Phaser.CANVAS) renderer = 'CANVAS';
    else if (this.game.renderer.type === (Phaser as any).WEBGPU) renderer = 'WEBGPU';
    this.debugText.setText(
      `${renderer}${this.gpuName ? ` | ${this.gpuName}` : ''} | ${Math.round(this.game.loop.actualFps)} FPS | ${performanceMonitor.getQualityLabel()}`,
    );

    if (!this.ufo.active) {
      this.ufoSpawnTimer -= delta;
      if (this.ufoSpawnTimer <= 0) {
        this.ufo.spawn();
        this.ufoSpawnTimer = Phaser.Math.Between(30000, 60000);
      }
    }

    if (this.powerUpTimer > 0) {
      this.powerUpTimer -= delta;
      this.updatePowerUpUI();
      if (this.powerUpTimer <= 0) {
        this.player.setMagnetic(false);
        this.powerUpBar.clear();
      }
      if (this.playerStates[this.activePlayerIndex]) {
        this.playerStates[this.activePlayerIndex].powerUpTimer = this.powerUpTimer;
      }
    }

    this.updateActivePowerUps(delta);
    this.updateDrones();
    this.updateBlackHole();
    this.updateHeatBar();
  }

  private updatePowerUpUI() {
    this.powerUpBar.clear();
    const width = 200;
    const progress = Math.max(0, this.powerUpTimer / 5000);
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
      const cool = Phaser.Display.Color.ValueToColor(0x00ff66);
      const hot = Phaser.Display.Color.ValueToColor(0xff3333);
      const color = Phaser.Display.Color.Interpolate.ColorWithColor(cool, hot, 100, heat * 100);
      this.heatBar.fillStyle(Phaser.Display.Color.GetColor(color.r, color.g, color.b), 0.9);
    }
    this.heatBar.fillRect(x, y, width * heat, height);
  }

  private updateHUD() {
    if (this.playerCount === 2) {
      this.p1ScoreText.setText(`P1 SCORE: ${this.playerStates[0].score}`);
      this.p2ScoreText?.setText(`P2 SCORE: ${this.playerStates[1].score}`);
      this.p1LivesText.setText(`P1 LIVES: ${this.playerStates[0].lives}`);
      this.p2LivesText?.setText(`P2 LIVES: ${this.playerStates[1].lives}`);
      this.updateActiveMarker();
    } else {
      this.p1ScoreText.setText(`SCORE: ${this.score}`);
      this.p1LivesText.setText(`LIVES: ${this.lives}`);
    }
  }

  private addScore(points: number) {
    this.score += points;
    if (this.playerStates[this.activePlayerIndex]) {
      this.playerStates[this.activePlayerIndex].score = this.score;
    }
    this.updateHUD();
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
    this.powerUpListText.setText(list);
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
    this.applyActivePowerUpEffects(true);
    this.updatePowerUpUI();
    this.updateActivePowerUps(0);
    this.updateHUD();
  }

  private applyActivePowerUpEffects(silent: boolean) {
    this.player.setTripleShot(this.activePowerUps.has(PowerUpType.TRIPLE_SHOT));
    this.player.setShield(this.activePowerUps.has(PowerUpType.SHIELD));
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
    this.player.setMagnetic(false);
    this.player.setTripleShot(false);
    this.player.setShield(false);
    this.applyGhost(false, true);
    this.applySlowMo(false);
    this.removeDrones();
    this.removeBlackHole();
    this.powerUpBar.clear();
    this.powerUpListText.setText('');
  }

  private resetPlayfield() {
    this.bullets.clear(true, true);
    this.enemyManager.enemies.clear(true, true);
    this.powerUpDirector.reset();
    this.ufo.deactivate();
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
    this.activePowerUps.set(type, 7000);
    if (this.playerStates[this.activePlayerIndex]) {
      this.playerStates[this.activePlayerIndex].activePowerUps = new Map(this.activePowerUps);
    }
    switch (type) {
      case PowerUpType.TRIPLE_SHOT:
        this.player.setTripleShot(true);
        break;
      case PowerUpType.SLOW_MOTION:
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
      case PowerUpType.BLACK_HOLE:
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
      case PowerUpType.BLACK_HOLE:
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
        this.empGraphics
          .clear()
          .lineStyle(4, 0x0000ff, 1 - radius / maxRadius)
          .strokeCircle(this.player.x, this.player.y, radius);
        this.enemyManager.enemies.children.each((enemy: any) => {
          if (
            enemy.active &&
            Phaser.Math.Distance.Between(this.player.x, this.player.y, enemy.x, enemy.y) < radius
          ) {
            this.explosionManager.triggerExplosion(enemy.x, enemy.y);
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
    this.drones.children.each((drone: any, i) => {
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

  private updateBlackHole() {
    if (!this.blackHole?.active) return;
    const { x, y, graphics } = this.blackHole;
    graphics
      .clear()
      .lineStyle(2, 0xaa00ff, 0.8)
      .strokeCircle(x, y, 50 + Math.sin(this.time.now * 0.01) * 10);
    this.enemyManager.enemies.children.each((enemy: any) => {
      if (enemy.active) {
        const angle = Phaser.Math.Angle.Between(enemy.x, enemy.y, x, y);
        enemy.body.velocity.x += Math.cos(angle) * 10;
        enemy.body.velocity.y += Math.sin(angle) * 10;
      }
      return null;
    });
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

  private handleBulletHitUFO(obj1: any, _obj2: any) {
    const bullet = obj1 as Bullet;
    if (this.ufo.active && bullet.active) {
      this.explosionManager.triggerExplosion(this.ufo.x, this.ufo.y);
      this.audio.playExplosion();

      // Immediate deactivation
      this.ufo.deactivate();
      bullet.disableBody(true, true);
      bullet.setActive(false);
      bullet.setVisible(false);

      // Activate Power-up
      this.powerUpTimer = 5000;
      this.player.setMagnetic(true);
      if (this.playerStates[this.activePlayerIndex]) {
        this.playerStates[this.activePlayerIndex].powerUpTimer = this.powerUpTimer;
      }
      this.addScore(500);
    }
  }

  private handleBulletHitEnemy(obj1: any, obj2: any) {
    const bullet = obj1 as Bullet;
    const enemy = obj2 as Enemy;
    if (bullet.active && enemy.active) {
      this.explosionManager.triggerExplosion(enemy.x, enemy.y);
      this.audio.playExplosion();
      this.powerUpDirector.onAsteroidDestroyed(enemy.x, enemy.y);
      this.enemyManager.splitAsteroid(enemy.x, enemy.y, enemy.scaleX);
      const points = Math.floor(100 / enemy.scaleX);
      this.addScore(points);
      bullet.disableBody(true, true);
      enemy.disableBody(true, true);
    }
  }

  private handlePlayerHitEnemy(_obj1: any, obj2: any) {
    if (this.isGameOver || this.isSwitching) return;
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
    this.ufo.deactivate();
    this.player.setActive(false).setVisible(false);
    this.saveActivePlayerState();
    this.switchTimer?.remove(false);
    this.time.delayedCall(1500, () => {
      this.scene.stop('PauseScene');
      this.scene.start('GameOverScene', {
        scores: this.playerStates.map((state) => state.score),
        players: this.playerCount,
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
    const debugY = this.playerCount === 2 ? 90 : 60;
    const powerY = this.playerCount === 2 ? 130 : 100;
    this.debugText = this.add
      .text(30, debugY, '', { fontFamily: '"Press Start 2P"', fontSize: '12px', color: '#00ff00' })
      .setDepth(100);
    this.powerUpListText = this.add
      .text(30, powerY, '', { fontFamily: '"Press Start 2P"', fontSize: '14px', color: '#00ffff' })
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
    this.game.events.on('blur', () => this.requestPause());
  }

  private requestPause() {
    if (
      this.isGameOver ||
      this.isSwitching ||
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
  }

  private createStarfield() {
    this.add.particles(0, 0, 'star', {
      x: { min: 0, max: GAME_WIDTH },
      y: -50,
      quantity: 2,
      frequency: 100,
      lifespan: 4000,
      speedY: { min: 200, max: 400 },
      scale: { min: 0.5, max: 1.5 },
      alpha: { min: 0.1, max: 0.8 },
      emitting: true,
    });
  }
}
