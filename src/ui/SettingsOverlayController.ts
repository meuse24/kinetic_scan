import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../gameConfig';
import { soundManager } from '../SoundManager';
import { UIComponentFactory } from './UIComponentFactory';
import type { VolumeSliderComponents } from './UIComponentFactory';

export interface SettingsOverlayControllerConfig {
  scene: Phaser.Scene;
  depth: number;
  isTouch: boolean;
  isCrtSupported: () => boolean;
  getSoundLabel: () => string;
  getFullscreenLabel: () => string;
  getDifficultyLabel: () => string;
  getDebugLabel: () => string;
  getCrtLabel: () => string;
  onToggleSound: () => void;
  onToggleFullscreen: () => void;
  onChangeDifficulty: (direction: 1 | -1) => void;
  onToggleDebug: () => void;
  onToggleCrt: () => void;
  onCloseRequested: () => void;
}

/**
 * Shared settings-overlay builder/controller used by AttractScene and GameOverScene.
 * Keeps layout and interaction logic in one place while scenes provide labels and actions.
 */
export class SettingsOverlayController {
  private readonly config: SettingsOverlayControllerConfig;
  private overlay?: Phaser.GameObjects.Container;
  private soundValue?: Phaser.GameObjects.Text;
  private fullscreenValue?: Phaser.GameObjects.Text;
  private difficultyValue?: Phaser.GameObjects.Text;
  private debugValue?: Phaser.GameObjects.Text;
  private crtValue?: Phaser.GameObjects.Text;
  private volumeSliders: VolumeSliderComponents[] = [];
  private openState: boolean = false;

  constructor(config: SettingsOverlayControllerConfig) {
    this.config = config;
  }

  build(): void {
    if (this.overlay) return;
    const centerX = GAME_WIDTH / 2;
    const centerY = GAME_HEIGHT / 2;
    const showCrtToggle = this.config.isCrtSupported();
    const panelWidth = Math.min(760, GAME_WIDTH - 120);
    const panelHeight = Math.min(560, GAME_HEIGHT - 140);
    const settingsItemCount = showCrtToggle ? 8 : 7;
    const layoutTopY = centerY - panelHeight * 0.24;
    const layoutBottomY = centerY + panelHeight * 0.22;
    const layoutStep =
      settingsItemCount > 1 ? (layoutBottomY - layoutTopY) / (settingsItemCount - 1) : 0;
    let layoutIndex = 0;
    const nextLayoutY = () => layoutTopY + layoutStep * layoutIndex++;
    const soundY = nextLayoutY();
    const masterSliderY = nextLayoutY();
    const sfxSliderY = nextLayoutY();
    const bgmSliderY = nextLayoutY();
    const fullscreenY = nextLayoutY();
    const difficultyY = nextLayoutY();
    const debugY = nextLayoutY();
    const crtY = showCrtToggle ? nextLayoutY() : 0;
    const valueStyle: Phaser.Types.GameObjects.Text.TextStyle = {
      fontFamily: '"Press Start 2P"',
      fontSize: '16px',
      color: '#ffffff',
    };

    const backdrop = this.config.scene.add
      .rectangle(centerX, centerY, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.78)
      .setDepth(this.config.depth)
      .setInteractive();
    const panel = this.config.scene.add
      .rectangle(centerX, centerY, panelWidth, panelHeight, 0x111827, 0.94)
      .setStrokeStyle(2, 0x6ee7ff)
      .setDepth(this.config.depth + 1);
    const title = this.config.scene.add
      .text(centerX, centerY - panelHeight * 0.39, 'SETTINGS', {
        fontFamily: '"Press Start 2P"',
        fontSize: '26px',
        color: '#9be7ff',
      })
      .setOrigin(0.5)
      .setDepth(this.config.depth + 2);

    this.soundValue = this.config.scene.add
      .text(centerX, soundY, '', valueStyle)
      .setOrigin(0.5)
      .setDepth(this.config.depth + 2)
      .setInteractive({ useHandCursor: true });
    this.soundValue.on('pointerdown', () => {
      this.config.onToggleSound();
      this.refresh();
    });

    this.fullscreenValue = this.config.scene.add
      .text(centerX, fullscreenY, '', valueStyle)
      .setOrigin(0.5)
      .setDepth(this.config.depth + 2)
      .setInteractive({ useHandCursor: !this.config.isTouch });
    this.fullscreenValue.on('pointerdown', () => {
      this.config.onToggleFullscreen();
      this.refresh();
    });

    this.difficultyValue = this.config.scene.add
      .text(centerX, difficultyY, '', valueStyle)
      .setOrigin(0.5)
      .setDepth(this.config.depth + 2)
      .setInteractive({ useHandCursor: true });
    this.difficultyValue.on('pointerdown', () => {
      this.config.onChangeDifficulty(1);
      this.refresh();
    });

    this.debugValue = this.config.scene.add
      .text(centerX, debugY, '', valueStyle)
      .setOrigin(0.5)
      .setDepth(this.config.depth + 2)
      .setInteractive({ useHandCursor: true });
    this.debugValue.on('pointerdown', () => {
      this.config.onToggleDebug();
      this.refresh();
    });

    if (showCrtToggle) {
      this.crtValue = this.config.scene.add
        .text(centerX, crtY, '', valueStyle)
        .setOrigin(0.5)
        .setDepth(this.config.depth + 2)
        .setInteractive({ useHandCursor: true });
      this.crtValue.on('pointerdown', () => {
        this.config.onToggleCrt();
        this.refresh();
      });
    } else {
      this.crtValue = undefined;
    }

    this.volumeSliders.length = 0;
    const sliderDepth = this.config.depth + 2;
    const sliderObjects: Phaser.GameObjects.GameObject[] = [];

    const masterSlider = UIComponentFactory.createVolumeSlider({
      scene: this.config.scene,
      centerX,
      y: masterSliderY,
      label: 'MASTER',
      getter: () => soundManager.masterVolume,
      setter: (v: number) => soundManager.setMasterVolume(v),
      depth: sliderDepth,
    });
    this.volumeSliders.push(masterSlider);
    sliderObjects.push(
      masterSlider.labelText,
      masterSlider.track,
      masterSlider.fill,
      masterSlider.handle,
      masterSlider.valueText,
      masterSlider.trackHitArea,
    );

    const sfxSlider = UIComponentFactory.createVolumeSlider({
      scene: this.config.scene,
      centerX,
      y: sfxSliderY,
      label: 'SFX',
      getter: () => soundManager.sfxVolume,
      setter: (v: number) => soundManager.setSfxVolume(v),
      depth: sliderDepth,
    });
    this.volumeSliders.push(sfxSlider);
    sliderObjects.push(
      sfxSlider.labelText,
      sfxSlider.track,
      sfxSlider.fill,
      sfxSlider.handle,
      sfxSlider.valueText,
      sfxSlider.trackHitArea,
    );

    const bgmSlider = UIComponentFactory.createVolumeSlider({
      scene: this.config.scene,
      centerX,
      y: bgmSliderY,
      label: 'BGM',
      getter: () => soundManager.bgmVolume,
      setter: (v: number) => soundManager.setBgmVolume(v),
      depth: sliderDepth,
    });
    this.volumeSliders.push(bgmSlider);
    sliderObjects.push(
      bgmSlider.labelText,
      bgmSlider.track,
      bgmSlider.fill,
      bgmSlider.handle,
      bgmSlider.valueText,
      bgmSlider.trackHitArea,
    );

    const hint = this.config.scene.add
      .text(
        centerX,
        centerY + panelHeight * 0.33,
        showCrtToggle
          ? 'SOUND[S]  FS[F]  DIFF[A/D]  DEBUG[G]  CRT[C]'
          : 'SOUND[S]  FS[F]  DIFF[A/D]  DEBUG[G]',
        {
          fontFamily: '"Press Start 2P"',
          fontSize: '10px',
          color: '#9ca3af',
        },
      )
      .setOrigin(0.5)
      .setDepth(this.config.depth + 2);

    const backText = this.config.scene.add
      .text(centerX, centerY + panelHeight * 0.4, 'BACK (ESC / B / O)', {
        fontFamily: '"Press Start 2P"',
        fontSize: '14px',
        color: '#ffdd88',
      })
      .setOrigin(0.5)
      .setDepth(this.config.depth + 2)
      .setInteractive({ useHandCursor: true });
    backText.on('pointerdown', () => this.config.onCloseRequested());

    this.overlay = this.config.scene.add.container(0, 0, [
      backdrop,
      panel,
      title,
      this.soundValue,
      this.fullscreenValue,
      this.difficultyValue,
      this.debugValue,
      hint,
      backText,
      ...sliderObjects,
    ]);
    if (this.crtValue) {
      this.overlay.add(this.crtValue);
    }
    this.overlay.setDepth(this.config.depth);
    this.overlay.setVisible(false);
  }

  open(): void {
    if (this.openState) return;
    this.openState = true;
    this.refresh();
    this.overlay?.setVisible(true);
  }

  close(): void {
    if (!this.openState) return;
    this.openState = false;
    this.overlay?.setVisible(false);
  }

  isOpen(): boolean {
    return this.openState;
  }

  refresh(): void {
    this.soundValue?.setText(this.config.getSoundLabel());
    this.fullscreenValue?.setText(this.config.getFullscreenLabel());
    this.difficultyValue?.setText(this.config.getDifficultyLabel());
    this.debugValue?.setText(this.config.getDebugLabel());
    this.crtValue?.setText(this.config.getCrtLabel());
    if (this.fullscreenValue?.input) {
      this.fullscreenValue.input.enabled = !this.config.isTouch;
      this.fullscreenValue.setAlpha(this.config.isTouch ? 0.45 : 1);
    }
    if (this.crtValue?.input) {
      const enableCrtToggle = this.config.isCrtSupported();
      this.crtValue.input.enabled = enableCrtToggle;
      this.crtValue.setAlpha(enableCrtToggle ? 1 : 0.45);
    }
    this.volumeSliders.forEach((slider) => slider.refresh());
  }

  destroy(): void {
    this.overlay?.destroy(true);
    this.overlay = undefined;
    this.soundValue = undefined;
    this.fullscreenValue = undefined;
    this.difficultyValue = undefined;
    this.debugValue = undefined;
    this.crtValue = undefined;
    this.volumeSliders.length = 0;
    this.openState = false;
  }
}
