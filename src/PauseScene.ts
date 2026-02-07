import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from './gameConfig';
import MainScene from './MainScene';
import { soundManager } from './SoundManager';
import { DEFAULT_VOLUME } from './AudioManager';

export default class PauseScene extends Phaser.Scene {
  private soundText!: Phaser.GameObjects.Text;
  private soundListener?: (muted: boolean) => void;

  constructor() {
    super('PauseScene');
  }

  create() {
    const centerX = GAME_WIDTH / 2;
    const centerY = GAME_HEIGHT / 2;

    if (!this.scene.isActive('BezelScene')) {
      this.scene.launch('BezelScene');
    }
    this.scene.bringToTop('BezelScene');

    if (this.game.renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer) {
      this.cameras.main.setPostPipeline('CRTPipeline');
    }

    // Semi-transparent overlay
    const overlay = this.add.rectangle(centerX, centerY, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.7);
    overlay.setInteractive(); // Prevent clicks passing through

    // PAUSED Text
    this.add
      .text(centerX, centerY - 140, 'PAUSED', {
        fontFamily: '"Press Start 2P"',
        fontSize: '64px',
        color: '#ffffff',
      })
      .setOrigin(0.5);

    // RESUME Button Background
    const btnWidth = 350;
    const btnHeight = 80;
    const btnY = centerY + 20;

    const resumeBtn = this.add
      .rectangle(centerX, btnY, btnWidth, btnHeight, 0x00cc00)
      .setInteractive({ useHandCursor: true });

    this.add
      .text(centerX, btnY, 'RESUME', {
        fontFamily: '"Press Start 2P"',
        fontSize: '24px',
        color: '#ffffff',
      })
      .setOrigin(0.5);

    // SOUND Button
    const soundBtnY = centerY + 120;
    this.soundText = this.add
      .text(centerX, soundBtnY, this.getSoundLabel(), {
        fontFamily: '"Press Start 2P"',
        fontSize: '18px',
        color: '#ffffff',
        backgroundColor: '#333333',
        padding: { x: 20, y: 15 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    this.soundText.on('pointerdown', () => {
      soundManager.toggle();
    });

    this.soundListener = (muted: boolean) => {
      this.updateSoundLabel(muted);
      const mainScene = this.scene.get('MainScene') as MainScene;
      if (mainScene.audio) {
        mainScene.audio.setVolume(muted ? 0 : DEFAULT_VOLUME);
      }
    };
    soundManager.onChange(this.soundListener, this);
    this.updateSoundLabel(soundManager.isMuted());

    // Resume Logic
    const resumeGame = () => {
      const mainScene = this.scene.get('MainScene') as MainScene;
      mainScene.audio.resumeAll();
      this.scene.stop();
      this.scene.resume('MainScene');
    };

    resumeBtn.on('pointerdown', resumeGame);

    // Keyboard support
    this.input.keyboard?.on('keydown-P', resumeGame);
    this.input.keyboard?.on('keydown-ESC', resumeGame);
    this.input.keyboard?.on('keydown-S', () => soundManager.toggle());

    // Pulsing effect for button
    this.tweens.add({
      targets: resumeBtn,
      alpha: 0.8,
      duration: 500,
      yoyo: true,
      repeat: -1,
    });

    this.events.once('shutdown', () => {
      if (this.soundListener) {
        soundManager.offChange(this.soundListener, this);
      }
    });
  }

  private getSoundLabel() {
    return `SOUND: ${soundManager.isMuted() ? 'OFF' : 'ON'} (S)`;
  }

  private updateSoundLabel(muted: boolean) {
    this.soundText.setText(`SOUND: ${muted ? 'OFF' : 'ON'} (S)`);
    this.soundText.setColor(muted ? '#ff6666' : '#ffffff');
  }
}
