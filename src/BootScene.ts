import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, IS_TOUCH } from './gameConfig';
import { soundManager } from './SoundManager';
import { creditManager } from './CreditManager';
import {
  GAMEPLAY_MUSIC_KEY,
  GAMEPLAY_MUSIC_URL,
  MENU_MUSIC_KEY,
  MENU_MUSIC_URL,
} from './MusicManager';

let runtimeScenesLoadPromise: Promise<void> | null = null;

export default class BootScene extends Phaser.Scene {
  private soundText!: Phaser.GameObjects.Text;
  private fsText?: Phaser.GameObjects.Text;
  private startText!: Phaser.GameObjects.Text;
  private isStarting = false;
  private soundListener?: (muted: boolean) => void;
  private wantFullscreen = true;

  constructor() {
    super('BootScene');
  }

  preload() {
    if (!this.cache.audio.exists(MENU_MUSIC_KEY)) {
      this.load.audio(MENU_MUSIC_KEY, MENU_MUSIC_URL);
    }
    if (!this.cache.audio.exists(GAMEPLAY_MUSIC_KEY)) {
      this.load.audio(GAMEPLAY_MUSIC_KEY, GAMEPLAY_MUSIC_URL);
    }
  }

  create() {
    const centerX = GAME_WIDTH / 2;
    const centerY = GAME_HEIGHT / 2;
    const fontFamily = '"Press Start 2P"';

    // Title
    this.add
      .text(centerX, centerY - 180, 'MEUSE24', {
        fontFamily: '"Chakra Petch"',
        fontSize: '48px',
        color: 'rgba(0,0,0,0)',
        stroke: '#ffffff',
        strokeThickness: 3,
        letterSpacing: 10,
      })
      .setOrigin(0.5);

    this.add
      .text(centerX, centerY - 120, 'KINETIC-SCAN', {
        fontFamily: '"Chakra Petch"',
        fontSize: '36px',
        color: 'rgba(0,0,0,0)',
        stroke: '#ffffff',
        strokeThickness: 2,
        letterSpacing: 8,
      })
      .setOrigin(0.5);

    // Sound toggle
    this.soundText = this.add
      .text(centerX, centerY - 20, this.getSoundLabel(), {
        fontFamily,
        fontSize: '20px',
        color: soundManager.isMuted() ? '#ff6666' : '#00ff00',
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    this.soundText.on('pointerdown', () => this.toggleSound());

    // Fullscreen toggle (desktop only)
    if (!IS_TOUCH) {
      this.fsText = this.add
        .text(centerX, centerY + 30, this.getFullscreenLabel(), {
          fontFamily,
          fontSize: '20px',
          color: '#00ff00',
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });
      this.fsText.on('pointerdown', () => this.toggleFullscreen());
    }

    // START button
    this.startText = this.add
      .text(centerX, centerY + 120, '[ START (ENTER/SPACE) ]', {
        fontFamily,
        fontSize: '20px',
        color: '#ffff00',
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    this.startText.on('pointerdown', () => this.begin());

    // Pulsing start text
    this.tweens.add({
      targets: this.startText,
      scale: 1.08,
      duration: 600,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    // Hint text
    this.add
      .text(
        centerX,
        GAME_HEIGHT - 60,
        IS_TOUCH ? 'TAP START TO PLAY' : 'PRESS ENTER OR CLICK START',
        {
          fontFamily,
          fontSize: '12px',
          color: '#666666',
        },
      )
      .setOrigin(0.5);

    // Install hint (mobile only)
    if (IS_TOUCH && !window.matchMedia('(display-mode: standalone)').matches) {
      this.add
        .text(centerX, GAME_HEIGHT - 30, 'TIP: ADD TO HOME SCREEN FOR FULLSCREEN', {
          fontFamily,
          fontSize: '8px',
          color: '#444444',
        })
        .setOrigin(0.5);
    }

    // Keyboard shortcuts
    this.input.keyboard?.on('keydown-S', () => this.toggleSound());
    if (!IS_TOUCH) {
      this.input.keyboard?.on('keydown-F', () => this.toggleFullscreen());
    }
    this.input.keyboard?.on('keydown-ENTER', () => this.begin());
    this.input.keyboard?.on('keydown-SPACE', () => this.begin());

    // Listen for sound changes
    this.soundListener = (muted) => {
      this.soundText.setText(this.getSoundLabel());
      this.soundText.setColor(muted ? '#ff6666' : '#00ff00');
    };
    soundManager.onChange(this.soundListener, this);

    this.events.once('shutdown', () => {
      if (this.soundListener) soundManager.offChange(this.soundListener, this);
    });
  }

  private getSoundLabel(): string {
    return `SOUND: ${soundManager.isMuted() ? 'OFF' : 'ON'} (S)`;
  }

  private getFullscreenLabel(): string {
    return `FULLSCREEN: ${this.wantFullscreen ? 'ON' : 'OFF'} (F)`;
  }

  private toggleSound() {
    soundManager.toggle();
  }

  private toggleFullscreen() {
    this.wantFullscreen = !this.wantFullscreen;
    this.fsText?.setText(this.getFullscreenLabel());
    this.fsText?.setColor(this.wantFullscreen ? '#00ff00' : '#ff6666');
  }

  private async begin() {
    if (this.isStarting) return;
    this.isStarting = true;
    this.startText.setText('[ LOADING... ]');
    this.startText.setColor('#00ffff');
    this.startText.disableInteractive();
    try {
      await this.ensureRuntimeScenesLoaded();
      creditManager.addCredits(4);
      if (!IS_TOUCH && this.wantFullscreen && !this.scale.isFullscreen) {
        this.scale.startFullscreen();
      }
      this.scene.start('AttractScene');
    } catch (error) {
      console.error('Failed to load runtime scenes', error);
      this.isStarting = false;
      this.startText.setText('[ START (ENTER/SPACE) ]');
      this.startText.setColor('#ffff00');
      this.startText.setInteractive({ useHandCursor: true });
    }
  }

  private ensureRuntimeScenesLoaded() {
    if (!runtimeScenesLoadPromise) {
      runtimeScenesLoadPromise = (async () => {
        const [
          { default: MainScene },
          { default: GameOverScene },
          { default: PauseScene },
          { default: HelpScene },
        ] = await Promise.all([
          import('./MainScene'),
          import('./GameOverScene'),
          import('./PauseScene'),
          import('./HelpScene'),
        ]);

        const sceneManager = this.game.scene;
        if (!sceneManager.keys.MainScene) sceneManager.add('MainScene', MainScene, false);
        if (!sceneManager.keys.GameOverScene)
          sceneManager.add('GameOverScene', GameOverScene, false);
        if (!sceneManager.keys.PauseScene) sceneManager.add('PauseScene', PauseScene, false);
        if (!sceneManager.keys.HelpScene) sceneManager.add('HelpScene', HelpScene, false);
      })();
    }
    return runtimeScenesLoadPromise;
  }
}
