/**
 * UIComponentFactory
 *
 * Factory class for creating reusable UI components across scenes.
 * Eliminates ~300 lines of duplicated code from AttractScene, GameOverScene, and PauseScene.
 */

export interface VolumeSliderConfig {
  scene: Phaser.Scene;
  centerX: number;
  y: number;
  label: string;
  getter: () => number;
  setter: (v: number) => void;
  depth?: number;
  sliderWidth?: number;
  handleSize?: number;
  labelColor?: string;
  valueColor?: string;
  trackColor?: number;
  fillColor?: number;
  handleColor?: number;
}

export interface VolumeSliderComponents {
  labelText: Phaser.GameObjects.Text;
  track: Phaser.GameObjects.Rectangle;
  fill: Phaser.GameObjects.Rectangle;
  handle: Phaser.GameObjects.Rectangle;
  valueText: Phaser.GameObjects.Text;
  trackHitArea: Phaser.GameObjects.Rectangle;
  setValue: (value: number) => void;
  refresh: () => void;
  destroy: () => void;
}

export class UIComponentFactory {
  /**
   * Creates a volume slider with drag and click support
   *
   * @param config - Configuration for the volume slider
   * @returns Components and methods for controlling the slider
   */
  static createVolumeSlider(config: VolumeSliderConfig): VolumeSliderComponents {
    const {
      scene,
      centerX,
      y,
      label,
      getter,
      setter,
      depth = 0,
      sliderWidth = 210,
      handleSize = 16,
      labelColor = '#9ca3af',
      valueColor = '#cbd5e1',
      trackColor = 0x334155,
      fillColor = 0x00cc88,
      handleColor = 0xf8fafc,
    } = config;

    const sliderHeight = 10;
    const labelX = centerX - sliderWidth / 2 - 90;
    const trackX = centerX;
    const initialValue = Phaser.Math.Clamp(getter(), 0, 1);

    // Create label text
    const labelText = scene.add
      .text(labelX, y, label, {
        fontFamily: '"Press Start 2P"',
        fontSize: '10px',
        color: labelColor,
      })
      .setOrigin(0, 0.5)
      .setDepth(depth);

    // Create track background
    const track = scene.add
      .rectangle(trackX, y, sliderWidth, sliderHeight, trackColor, 0.96)
      .setOrigin(0.5)
      .setDepth(depth);

    // Create fill bar
    const fill = scene.add
      .rectangle(trackX - sliderWidth / 2, y, sliderWidth * initialValue, sliderHeight, fillColor)
      .setOrigin(0, 0.5)
      .setDepth(depth);

    // Create draggable handle
    const handle = scene.add
      .rectangle(
        trackX - sliderWidth / 2 + sliderWidth * initialValue,
        y,
        handleSize,
        handleSize,
        handleColor,
      )
      .setDepth(depth)
      .setInteractive({ useHandCursor: true, draggable: true });
    scene.input.setDraggable(handle);

    // Create value text
    const valueText = scene.add
      .text(trackX + sliderWidth / 2 + 20, y, `${Math.round(initialValue * 100)}%`, {
        fontFamily: '"Press Start 2P"',
        fontSize: '9px',
        color: valueColor,
      })
      .setOrigin(0, 0.5)
      .setDepth(depth);

    // setValue function to update slider position and value
    const setValue = (value: number) => {
      const clamped = Phaser.Math.Clamp(value, 0, 1);
      const minX = trackX - sliderWidth / 2;
      handle.x = minX + sliderWidth * clamped;
      fill.width = sliderWidth * clamped;
      valueText.setText(`${Math.round(clamped * 100)}%`);
      setter(clamped);
    };

    // Drag handler
    handle.on('drag', (_pointer: Phaser.Input.Pointer, dragX: number) => {
      const minX = trackX - sliderWidth / 2;
      const maxX = trackX + sliderWidth / 2;
      const clampedX = Phaser.Math.Clamp(dragX, minX, maxX);
      const value = (clampedX - minX) / sliderWidth;
      setValue(value);
    });

    // Create invisible hit area for track clicks
    const trackHitArea = scene.add
      .rectangle(trackX, y, sliderWidth + 20, 30, 0x000000, 0)
      .setDepth(depth)
      .setInteractive({ useHandCursor: true });

    // Track click handler
    trackHitArea.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      const minX = trackX - sliderWidth / 2;
      const maxX = trackX + sliderWidth / 2;
      const clampedX = Phaser.Math.Clamp(pointer.x, minX, maxX);
      const value = (clampedX - minX) / sliderWidth;
      setValue(value);
    });

    // Refresh function to update slider from current getter value
    const refresh = () => {
      const currentValue = Phaser.Math.Clamp(getter(), 0, 1);
      const minX = trackX - sliderWidth / 2;
      handle.x = minX + sliderWidth * currentValue;
      fill.width = sliderWidth * currentValue;
      valueText.setText(`${Math.round(currentValue * 100)}%`);
      // Note: we don't call setter() during refresh, only update visual state
    };

    // Destroy function to clean up all components
    const destroy = () => {
      labelText.destroy();
      track.destroy();
      fill.destroy();
      handle.destroy();
      valueText.destroy();
      trackHitArea.destroy();
    };

    return {
      labelText,
      track,
      fill,
      handle,
      valueText,
      trackHitArea,
      setValue,
      refresh,
      destroy,
    };
  }
}
