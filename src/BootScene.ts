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
let runtimeScenesLoadPromise: Promise<void> | null = null;

export default class BootScene extends Phaser.Scene {
  private soundText!: Phaser.GameObjects.Text;
  private startText!: Phaser.GameObjects.Text;
  private shareText!: Phaser.GameObjects.Text;
  private isStarting = false;
  private isSharing = false;
  private soundListener?: (muted: boolean) => void;

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

    // SHARE button
    this.shareText = this.add
      .text(centerX, centerY + 170, '[ SHARE MISSION ]', {
        fontFamily,
        fontSize: '14px',
        color: '#00ffff',
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    this.shareText.on('pointerdown', () => this.shareGame());

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
      if (this.soundListener) soundManager.offChange(this.soundListener, this);
    });
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

  private async shareGame() {
    if (this.isSharing) return;
    this.isSharing = true;

    const messages = [
      'Ready for some retro action? Crush the highscore in MEUSE24 KINETIC-SCAN! 🚀',
      'Think you can beat my score? Challenge me in MEUSE24 KINETIC-SCAN! 👾',
      'Absolute adrenaline! This arcade shooter is addictive. Check out KINETIC-SCAN: ⚡',
      'Space is dangerous, but the drift is smooth. Play MEUSE24 KINETIC-SCAN now! 🌌',
      'Vector vibes and asteroid dust. The ultimate arcade experience: 🕹️',
      'No downloads, just pure skill. Join the mission in MEUSE24 KINETIC-SCAN: 🛰️',
      'The galaxy needs a pilot. Are you ready for KINETIC-SCAN? 👨‍🚀',
      'Shredding asteroids has never felt this good. Try MEUSE24 KINETIC-SCAN: 💥',
      'Retro graphics, modern speed. Experience KINETIC-SCAN today! 🛸',
      'Warning: High difficulty, higher satisfaction. Play MEUSE24 KINETIC-SCAN: 🔥',
    ];

    const randomMessage = messages[Math.floor(Math.random() * messages.length)];
    const shareUrl = window.location.origin + window.location.pathname;

    const shareData = {
      title: 'MEUSE24 KINETIC-SCAN',
      text: randomMessage,
      url: shareUrl,
    };

    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        throw new Error('Native share not available');
      }
    } catch (err) {
      // User cancelled the native share dialog — do nothing
      if (err instanceof DOMException && err.name === 'AbortError') return;
      // Fallback: Copy to clipboard - URL is appended to the message
      try {
        await navigator.clipboard.writeText(`${shareData.text} ${shareData.url}`);
        const originalText = this.shareText.text;
        this.shareText.setText('[ MISSION LINK COPIED! ]');
        this.shareText.setColor('#00ff00');
        this.time.delayedCall(2000, () => {
          this.shareText.setText(originalText);
          this.shareText.setColor('#00ffff');
        });
      } catch (clipErr) {
        console.error('Sharing failed', clipErr);
      }
    } finally {
      this.isSharing = false;
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
