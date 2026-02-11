import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from './gameConfig';
import MainScene from './MainScene';
import { soundManager } from './SoundManager';
import { DEFAULT_VOLUME } from './AudioManager';
import { performanceMonitor } from './PerformanceMonitor';
import { isDebugOverlayEnabled, toggleDebugOverlayEnabled } from './DebugSettings';
import SceneBackground from './SceneBackground';

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
    const sliderLabels = ['MASTER', 'SFX', 'BGM'];
    const sliderValues = [
      soundManager.masterVolume,
      soundManager.sfxVolume,
      soundManager.bgmVolume,
    ];
    const sliderSetters = [
      (v: number) => soundManager.setMasterVolume(v),
      (v: number) => soundManager.setSfxVolume(v),
      (v: number) => soundManager.setBgmVolume(v),
    ];
    const sliderValueTexts: Phaser.GameObjects.Text[] = [];

    for (let i = 0; i < sliderLabels.length; i++) {
      const y = sliderStartY + i * 42;
      this.createVolumeSlider(
        centerX,
        y,
        sliderLabels[i],
        sliderValues[i],
        sliderSetters[i],
        sliderValueTexts,
      );
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

  private createVolumeSlider(
    centerX: number,
    y: number,
    label: string,
    initialValue: number,
    setter: (v: number) => void,
    valueTexts: Phaser.GameObjects.Text[],
  ) {
    const sliderWidth = 200;
    const sliderHeight = 10;
    const handleSize = 18;
    const labelX = centerX - sliderWidth / 2 - 80;

    // Label
    this.add
      .text(labelX, y, label, {
        fontFamily: '"Press Start 2P"',
        fontSize: '10px',
        color: '#aaaaaa',
      })
      .setOrigin(0, 0.5);

    // Track background
    const trackX = centerX;
    this.add.rectangle(trackX, y, sliderWidth, sliderHeight, 0x444444).setOrigin(0.5);

    // Fill bar
    const fill = this.add
      .rectangle(trackX - sliderWidth / 2, y, sliderWidth * initialValue, sliderHeight, 0x00cc00)
      .setOrigin(0, 0.5);

    // Handle
    const handleX = trackX - sliderWidth / 2 + sliderWidth * initialValue;
    const handle = this.add
      .rectangle(handleX, y, handleSize, handleSize, 0xffffff)
      .setInteractive({ useHandCursor: true, draggable: true });

    // Value text
    const valueText = this.add
      .text(trackX + sliderWidth / 2 + 20, y, `${Math.round(initialValue * 100)}%`, {
        fontFamily: '"Press Start 2P"',
        fontSize: '9px',
        color: '#cccccc',
      })
      .setOrigin(0, 0.5);
    valueTexts.push(valueText);

    // Drag handler
    this.input.on(
      'drag',
      (
        _pointer: Phaser.Input.Pointer,
        gameObject: Phaser.GameObjects.GameObject,
        dragX: number,
      ) => {
        if (gameObject !== handle) return;
        const minX = trackX - sliderWidth / 2;
        const maxX = trackX + sliderWidth / 2;
        const clampedX = Phaser.Math.Clamp(dragX, minX, maxX);
        handle.x = clampedX;
        const value = (clampedX - minX) / sliderWidth;
        fill.width = sliderWidth * value;
        valueText.setText(`${Math.round(value * 100)}%`);
        setter(value);
      },
    );

    // Click on track to set value
    const trackHitArea = this.add
      .rectangle(trackX, y, sliderWidth + 20, 30, 0x000000, 0)
      .setInteractive({ useHandCursor: true });
    trackHitArea.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      const minX = trackX - sliderWidth / 2;
      const maxX = trackX + sliderWidth / 2;
      const clampedX = Phaser.Math.Clamp(pointer.x, minX, maxX);
      handle.x = clampedX;
      const value = (clampedX - minX) / sliderWidth;
      fill.width = sliderWidth * value;
      valueText.setText(`${Math.round(value * 100)}%`);
      setter(value);
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
