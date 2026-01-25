import Phaser from 'phaser';
import { GAME_SIZE } from './gameConfig';
import { AudioManager, DEFAULT_VOLUME } from './AudioManager';
import { creditManager } from './CreditManager';
import { EnemyManager } from './EnemyManager';
import { soundManager } from './SoundManager';
import { UFO } from './UFO';
import { PowerUp, PowerUpType } from './PowerUp';

type PlayerButton = {
  requiredCredits: number;
  bg: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
};

export default class AttractScene extends Phaser.Scene {
  private audio!: AudioManager;
  private coinText!: Phaser.GameObjects.Text;
  private helpText!: Phaser.GameObjects.Text;
  private soundText!: Phaser.GameObjects.Text;
  private creditLabel!: Phaser.GameObjects.Text;
  private enemyManager!: EnemyManager;
  private ufo!: UFO;
  private ufoSpawnTimer: number = 0;
  private ambientEmitter!: Phaser.GameObjects.Particles.ParticleEmitter;
  private highScoreGroup!: Phaser.GameObjects.Container;
  private showScores: boolean = false;
  private demoSplitTimer: number = 0;
  private heartbeatActive: boolean = false;
  private heartbeatTimer: Phaser.Time.TimerEvent | null = null;
  private playerButtons: PlayerButton[] = [];
  private creditListener?: (credits: number) => void;
  private soundListener?: (muted: boolean) => void;

  constructor() {
    super('AttractScene');
  }

  create() {
    this.audio = new AudioManager(this);
    const centerX = GAME_SIZE / 2;
    const centerY = GAME_SIZE / 2;
    const uiDepth = 50;

    if (!this.scene.isActive('BezelScene')) {
      this.scene.launch('BezelScene');
    }
    this.scene.bringToTop('BezelScene');

    if (this.game.renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer) {
      this.cameras.main.setPostPipeline('CRTPipeline');
    }

    this.createAmbientTexture();
    this.ambientEmitter = this.add.particles(0, 0, 'dust', {
      x: { min: 0, max: GAME_SIZE },
      y: -50,
      quantity: 2,
      frequency: 80,
      lifespan: 6000,
      speedY: { min: 40, max: 120 },
      scale: { min: 0.2, max: 0.6 },
      alpha: { min: 0.05, max: 0.25 },
      blendMode: 'ADD',
    });
    this.ambientEmitter.setDepth(1);

    this.enemyManager = new EnemyManager(this);
    this.ufo = new UFO(this, this.audio);
    this.ufo.setDepth(6);
    this.ufoSpawnTimer = Phaser.Math.Between(20000, 45000);

    // Title Logo
    this.createTitleLogo(centerX, 150, uiDepth);

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
      .text(centerX, GAME_SIZE - 200, 'HELP (H)', {
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
      .text(centerX, GAME_SIZE - 50, `CREDITS: ${creditManager.getCredits()}`, {
        fontFamily: '"Press Start 2P"',
        fontSize: '16px',
        color: '#ffffff',
      })
      .setOrigin(0.5)
      .setDepth(uiDepth);

    this.soundText = this.add
      .text(centerX, GAME_SIZE - 165, this.getSoundLabel(), {
        fontFamily: '"Press Start 2P"',
        fontSize: '16px',
        color: '#ffffff',
      })
      .setOrigin(0.5)
      .setDepth(uiDepth)
      .setInteractive({ useHandCursor: true });
    this.soundText.on('pointerdown', () => this.toggleSound());

    this.createPlayerButtons(centerX, centerY + 210, uiDepth);

    this.createPowerUpPreview(centerX, GAME_SIZE - 130, uiDepth);

    // Interaction
    this.input.keyboard?.on('keydown-I', () => this.insertCoin());
    this.input.keyboard?.on('keydown-ONE', () => this.startGame(1));
    this.input.keyboard?.on('keydown-TWO', () => this.startGame(2));
    this.input.keyboard?.on('keydown-SPACE', () => this.startGame(1));
    this.input.keyboard?.on('keydown-ENTER', () => this.startGame(1));
    this.input.keyboard?.on('keydown-UP', () => this.startGame(1));
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
      this.ufo.deactivate();
      this.ambientEmitter.destroy();
      if (this.creditListener) creditManager.offChange(this.creditListener, this);
      if (this.soundListener) soundManager.offChange(this.soundListener, this);
    });
  }

  update(time: number, delta: number) {
    this.enemyManager.update(time, delta);
    this.applyEnemyDepth(5);
    this.demoSplitTimer += delta;
    if (this.demoSplitTimer >= 1400) {
      this.demoSplitTimer = 0;
      this.triggerDemoSplit();
    }
    if (!this.ufo.active) {
      this.ufoSpawnTimer -= delta;
      if (this.ufoSpawnTimer <= 0) {
        this.ufo.spawn();
        this.ufoSpawnTimer = Phaser.Math.Between(20000, 45000);
      }
    }
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

  private applyEnemyDepth(depth: number) {
    this.enemyManager.enemies.children.each((enemy: any) => {
      if (enemy.depth !== depth) enemy.setDepth(depth);
      return null;
    });
  }

  private triggerDemoSplit() {
    const candidates: any[] = [];
    this.enemyManager.enemies.children.each((enemy: any) => {
      if (enemy.active && enemy.scaleX > 0.6) candidates.push(enemy);
      return null;
    });
    if (candidates.length === 0) return;
    const target = Phaser.Utils.Array.GetRandom(candidates);
    this.enemyManager.splitAsteroid(target.x, target.y, target.scaleX);
    target.disableBody(true, true);
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
    ];
    const spacing = 56;
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
    this.scene.start('MainScene', { players: requiredCredits });
  }

  private createTitleLogo(centerX: number, y: number, depth: number) {
    const container = this.add.container(centerX, y).setDepth(depth);
    const topLine = this.createLogoLine('MEUSE24', 32, 2, 14, 0.8);
    const midLine = this.createLogoLine('KINETIC', 96, 4, 8, 1);
    const bottomLine = this.createLogoLine('SCAN', 96, 4, 8, 1);
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
    glowStrength: number,
  ) {
    const textObj = this.add.text(0, 0, text, {
      fontFamily: '"Chakra Petch"',
      fontSize: `${fontSize}px`,
      color: 'rgba(0,0,0,0)',
      stroke: '#ffffff',
      strokeThickness,
      letterSpacing,
    });
    textObj.setOrigin(0.5);
    textObj.initPostPipeline(true);
    textObj.preFX?.addGlow(0xffffff, glowStrength, 0, false);
    return textObj;
  }
}
