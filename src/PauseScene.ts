import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from './gameConfig';
import MainScene from './MainScene';
import { soundManager } from './SoundManager';
import { DEFAULT_VOLUME } from './AudioManager';
import { performanceMonitor } from './PerformanceMonitor';
import { isDebugOverlayEnabled, toggleDebugOverlayEnabled } from './DebugSettings';
import SceneBackground from './SceneBackground';
import { UIComponentFactory } from './ui/UIComponentFactory';

export default class PauseScene extends Phaser.Scene {
  private soundText!: Phaser.GameObjects.Text;
  private debugText!: Phaser.GameObjects.Text;
  private soundListener?: (muted: boolean) => void;
  private volumeListener?: () => void;
  private sceneBackground?: SceneBackground;

  constructor() {
    super('PauseScene');
  }

  preload() {
    SceneBackground.preload(this);
  }

  create() {
    const centerX = GAME_WIDTH / 2;
    const centerY = GAME_HEIGHT / 2;
    this.sceneBackground = new SceneBackground(this, {
      depth: -120,
      alpha: 0.38,
      maxOffsetX: 40,
      maxOffsetY: 26,
    });

    if (!this.scene.isActive('BezelScene')) {
      this.scene.launch('BezelScene');
    }
    this.scene.bringToTop('BezelScene');

    if (
      performanceMonitor.crtEnabled &&
      this.game.renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer
    ) {
      this.cameras.main.setPostPipeline('CRTPipeline');
    }

    // Semi-transparent overlay
    const overlay = this.add.rectangle(centerX, centerY, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.7);
    overlay.setInteractive(); // Prevent clicks passing through

    // PAUSED Text
    this.add
      .text(centerX, centerY - 180, 'PAUSED', {
        fontFamily: '"Press Start 2P"',
        fontSize: '64px',
        color: '#ffffff',
      })
      .setOrigin(0.5);

    // RESUME Button
    const btnWidth = 350;
    const btnHeight = 70;
    const btnY = centerY - 80;

    const resumeBtn = this.add
      .rectangle(centerX, btnY, btnWidth, btnHeight, 0x00cc00)
      .setInteractive({ useHandCursor: true });

    this.add
      .text(centerX, btnY, 'RESUME (P)', {
        fontFamily: '"Press Start 2P"',
        fontSize: '24px',
        color: '#ffffff',
      })
      .setOrigin(0.5);

    const exitBtnY = centerY + 5;
    const exitBtn = this.add
      .rectangle(centerX, exitBtnY, btnWidth, btnHeight, 0xaa2222)
      .setInteractive({ useHandCursor: true });

    this.add
      .text(centerX, exitBtnY, 'EXIT (X)', {
        fontFamily: '"Press Start 2P"',
        fontSize: '20px',
        color: '#ffffff',
      })
      .setOrigin(0.5);

    // SOUND Button
    const soundBtnY = centerY + 95;
    this.soundText = this.add
      .text(centerX, soundBtnY, this.getSoundLabel(), {
        fontFamily: '"Press Start 2P"',
        fontSize: '16px',
        color: '#ffffff',
        backgroundColor: '#333333',
        padding: { x: 16, y: 12 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    this.soundText.on('pointerdown', () => {
      soundManager.toggle();
    });

    const debugBtnY = centerY + 148;
    this.debugText = this.add
      .text(centerX, debugBtnY, this.getDebugLabel(), {
        fontFamily: '"Press Start 2P"',
        fontSize: '14px',
        color: '#ffffff',
        backgroundColor: '#333333',
        padding: { x: 14, y: 9 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });

    const toggleDebug = () => {
      const enabled = toggleDebugOverlayEnabled();
      const mainScene = this.scene.get('MainScene') as MainScene;
      mainScene.setDebugOverlayFromSettings(enabled);
      this.updateDebugLabel(enabled);
    };
    this.debugText.on('pointerdown', toggleDebug);

    // Volume Sliders
    const sliderStartY = centerY + 195;
    const sliderConfigs = [
      {
        label: 'MASTER',
        getter: () => soundManager.masterVolume,
        setter: (v: number) => soundManager.setMasterVolume(v),
      },
      {
        label: 'SFX',
        getter: () => soundManager.sfxVolume,
        setter: (v: number) => soundManager.setSfxVolume(v),
      },
      {
        label: 'BGM',
        getter: () => soundManager.bgmVolume,
        setter: (v: number) => soundManager.setBgmVolume(v),
      },
    ];

    for (let i = 0; i < sliderConfigs.length; i++) {
      const y = sliderStartY + i * 42;
      UIComponentFactory.createVolumeSlider({
        scene: this,
        centerX,
        y,
        label: sliderConfigs[i].label,
        getter: sliderConfigs[i].getter,
        setter: sliderConfigs[i].setter,
        sliderWidth: 200,
        handleSize: 18,
        labelColor: '#aaaaaa',
        valueColor: '#cccccc',
        trackColor: 0x444444,
        fillColor: 0x00cc00,
        handleColor: 0xffffff,
      });
    }

    this.soundListener = (muted: boolean) => {
      this.updateSoundLabel(muted);
      const mainScene = this.scene.get('MainScene') as MainScene;
      if (mainScene.audio) {
        mainScene.audio.setVolume(
          muted ? 0 : DEFAULT_VOLUME * soundManager.getEffectiveSfxVolume(),
        );
      }
    };
    soundManager.onChange(this.soundListener, this);
    this.updateSoundLabel(soundManager.isMuted());

    this.volumeListener = () => {
      const mainScene = this.scene.get('MainScene') as MainScene;
      if (mainScene.audio && !soundManager.isMuted()) {
        mainScene.audio.setVolume(DEFAULT_VOLUME * soundManager.getEffectiveSfxVolume());
      }
    };
    soundManager.onVolumeChange(this.volumeListener, this);

    // Resume Logic
    const resumeGame = () => {
      const mainScene = this.scene.get('MainScene') as MainScene;
      mainScene.audio.resumeAll();
      this.scene.stop();
      this.scene.resume('MainScene');
    };

    const exitToAttract = () => {
      this.scene.stop('MainScene');
      this.scene.start('AttractScene');
    };

    resumeBtn.on('pointerdown', resumeGame);
    exitBtn.on('pointerdown', exitToAttract);

    // Keyboard support
    this.input.keyboard?.on('keydown-P', resumeGame);
    this.input.keyboard?.on('keydown-ESC', resumeGame);
    this.input.keyboard?.on('keydown-X', exitToAttract);
    this.input.keyboard?.on('keydown-S', () => soundManager.toggle());
    this.input.keyboard?.on('keydown-G', toggleDebug);

    // Pulsing effect for button
    this.tweens.add({
      targets: resumeBtn,
      alpha: 0.8,
      duration: 500,
      yoyo: true,
      repeat: -1,
    });

    this.events.once('shutdown', () => {
      this.sceneBackground?.destroy();
      this.sceneBackground = undefined;
      if (this.soundListener) {
        soundManager.offChange(this.soundListener, this);
      }
      if (this.volumeListener) {
        soundManager.offVolumeChange(this.volumeListener, this);
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

  private getDebugLabel() {
    return `DEBUG INFO: ${isDebugOverlayEnabled() ? 'ON' : 'OFF'} (G)`;
  }

  private updateDebugLabel(enabled: boolean) {
    this.debugText.setText(`DEBUG INFO: ${enabled ? 'ON' : 'OFF'} (G)`);
    this.debugText.setColor(enabled ? '#9effb2' : '#ffffff');
  }

  update(_time: number, delta: number) {
    this.sceneBackground?.updateIdle(delta);
  }
}
