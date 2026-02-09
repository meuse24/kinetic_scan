import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, IS_TOUCH } from './gameConfig';
import { creditManager } from './CreditManager';
import { soundManager } from './SoundManager';
import {
  GAMEPLAY_MUSIC_KEY,
  GAMEPLAY_MUSIC_URL,
  MENU_MUSIC_KEY,
  MENU_MUSIC_URL,
} from './MusicManager';
import SceneBackground from './SceneBackground';

let runtimeScenesLoadPromise: Promise<void> | null = null;

export default class BootScene extends Phaser.Scene {
  private soundText!: Phaser.GameObjects.Text;
  private startText!: Phaser.GameObjects.Text;
  private sceneBackground?: SceneBackground;
  private isStarting = false;
  private soundListener?: (muted: boolean) => void;

  constructor() {
    super('BootScene');
  }

  preload() {
    SceneBackground.preload(this);
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
    this.sceneBackground = new SceneBackground(this, {
      depth: -120,
      alpha: 0.5,
      maxOffsetX: 42,
      maxOffsetY: 28,
    });

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

    // Startup / app-management guidance
    this.add
      .text(
        centerX,
        GAME_HEIGHT - 176,
        IS_TOUCH ? 'TAP START TO PLAY' : 'PRESS ENTER OR CLICK START',
        {
          fontFamily,
          fontSize: '16px',
          color: '#8b93a5',
        },
      )
      .setOrigin(0.5);

    const guideTopY = GAME_HEIGHT - 112;
    this.add
      .rectangle(centerX, guideTopY + 38, Math.min(980, GAME_WIDTH - 28), 118, 0x091422, 0.78)
      .setStrokeStyle(1, 0x2f415a, 0.9);
    this.add
      .text(centerX, guideTopY, 'INSTALL / UNINSTALL APP', {
        fontFamily,
        fontSize: '18px',
        color: '#ffdf99',
      })
      .setOrigin(0.5);
    this.add
      .text(
        centerX,
        guideTopY + 38,
        IS_TOUCH
          ? 'INSTALL: SHARE OR BROWSER MENU -> ADD TO HOME SCREEN\nUNINSTALL: PRESS-HOLD APP ICON -> REMOVE APP'
          : 'INSTALL: ADDRESS-BAR INSTALL ICON OR BROWSER MENU -> INSTALL APP\nUNINSTALL: OS APP SETTINGS OR BROWSER APP-MANAGER -> REMOVE',
        {
          fontFamily,
          fontSize: '12px',
          color: '#b6c0d3',
          align: 'center',
          lineSpacing: 6,
        },
      )
      .setOrigin(0.5);

    // Keyboard shortcuts
    this.input.keyboard?.on('keydown-S', () => this.toggleSound());
    this.input.keyboard?.on('keydown-ENTER', () => this.begin());
    this.input.keyboard?.on('keydown-SPACE', () => this.begin());

    this.soundListener = (muted) => {
      this.soundText.setText(this.getSoundLabel());
      this.soundText.setColor(muted ? '#ff6666' : '#00ff00');
    };
    soundManager.onChange(this.soundListener, this);

    this.events.once('shutdown', () => {
      this.sceneBackground?.destroy();
      this.sceneBackground = undefined;
      if (this.soundListener) soundManager.offChange(this.soundListener, this);
    });
  }

  update(_time: number, delta: number) {
    this.sceneBackground?.updateIdle(delta);
  }

  private getSoundLabel() {
    return `SOUND: ${soundManager.isMuted() ? 'OFF' : 'ON'} (S)`;
  }

  private toggleSound() {
    soundManager.toggle();
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
      if (!IS_TOUCH && !this.scale.isFullscreen) {
        try {
          this.scale.startFullscreen();
        } catch {
          // Fullscreen can be blocked by browser policy; game still continues.
        }
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
          { default: PerkSelectScene },
        ] = await Promise.all([
          import('./MainScene'),
          import('./GameOverScene'),
          import('./PauseScene'),
          import('./HelpScene'),
          import('./PerkSelectScene'),
        ]);

        const sceneManager = this.game.scene;
        if (!sceneManager.keys.MainScene) sceneManager.add('MainScene', MainScene, false);
        if (!sceneManager.keys.GameOverScene)
          sceneManager.add('GameOverScene', GameOverScene, false);
        if (!sceneManager.keys.PauseScene) sceneManager.add('PauseScene', PauseScene, false);
        if (!sceneManager.keys.HelpScene) sceneManager.add('HelpScene', HelpScene, false);
        if (!sceneManager.keys.PerkSelectScene)
          sceneManager.add('PerkSelectScene', PerkSelectScene, false);
      })();
    }
    return runtimeScenesLoadPromise;
  }
}
