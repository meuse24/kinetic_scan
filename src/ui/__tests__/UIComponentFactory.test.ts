/**
 * UIComponentFactory Tests
 *
 * Comprehensive test suite for volume slider creation and interaction
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { UIComponentFactory } from '../UIComponentFactory';

describe('UIComponentFactory', () => {
  let mockScene: any;
  let mockGameObjects: any[];
  let getter: () => number;
  let setter: (v: number) => void;

  beforeEach(() => {
    mockGameObjects = [];
    getter = vi.fn(() => 0.5);
    setter = vi.fn();

    // Mock Phaser scene
    mockScene = {
      add: {
        text: vi.fn((x: number, y: number, text: string, style: any) => {
          const obj = {
            x,
            y,
            text,
            style,
            setOrigin: vi.fn().mockReturnThis(),
            setDepth: vi.fn().mockReturnThis(),
            setText: vi.fn(),
            destroy: vi.fn(),
          };
          mockGameObjects.push(obj);
          return obj;
        }),
        rectangle: vi.fn(
          (x: number, y: number, w: number, h: number, color: number, alpha?: number) => {
            const obj = {
              x,
              y,
              width: w,
              height: h,
              color,
              alpha,
              setOrigin: vi.fn().mockReturnThis(),
              setDepth: vi.fn().mockReturnThis(),
              setInteractive: vi.fn().mockReturnThis(),
              on: vi.fn(),
              destroy: vi.fn(),
            };
            mockGameObjects.push(obj);
            return obj;
          },
        ),
      },
      input: {
        setDraggable: vi.fn(),
      },
    };
  });

  describe('createVolumeSlider', () => {
    it('should create all slider components', () => {
      const slider = UIComponentFactory.createVolumeSlider({
        scene: mockScene,
        centerX: 500,
        y: 100,
        label: 'VOLUME',
        getter,
        setter,
      });

      expect(slider.labelText).toBeDefined();
      expect(slider.track).toBeDefined();
      expect(slider.fill).toBeDefined();
      expect(slider.handle).toBeDefined();
      expect(slider.valueText).toBeDefined();
      expect(slider.trackHitArea).toBeDefined();
      expect(slider.setValue).toBeInstanceOf(Function);
      expect(slider.destroy).toBeInstanceOf(Function);
    });

    it('should initialize with value from getter', () => {
      getter = vi.fn(() => 0.75);

      const slider = UIComponentFactory.createVolumeSlider({
        scene: mockScene,
        centerX: 500,
        y: 100,
        label: 'VOLUME',
        getter,
        setter,
      });

      expect(getter).toHaveBeenCalled();
      // Initial text is set during creation via add.text(), not via setText()
      expect(slider.valueText.text).toBe('75%');
    });

    it('should clamp initial value between 0 and 1', () => {
      getter = vi.fn(() => 1.5);

      const slider = UIComponentFactory.createVolumeSlider({
        scene: mockScene,
        centerX: 500,
        y: 100,
        label: 'VOLUME',
        getter,
        setter,
      });

      // Should be clamped to 100%
      // Initial text is set during creation via add.text(), not via setText()
      expect(slider.valueText.text).toBe('100%');
    });

    it('should apply custom depth parameter', () => {
      const slider = UIComponentFactory.createVolumeSlider({
        scene: mockScene,
        centerX: 500,
        y: 100,
        label: 'VOLUME',
        getter,
        setter,
        depth: 999,
      });

      expect(slider.labelText.setDepth).toHaveBeenCalledWith(999);
      expect(slider.track.setDepth).toHaveBeenCalledWith(999);
      expect(slider.fill.setDepth).toHaveBeenCalledWith(999);
      expect(slider.handle.setDepth).toHaveBeenCalledWith(999);
      expect(slider.valueText.setDepth).toHaveBeenCalledWith(999);
      expect(slider.trackHitArea.setDepth).toHaveBeenCalledWith(999);
    });

    it('should apply custom slider width', () => {
      const slider = UIComponentFactory.createVolumeSlider({
        scene: mockScene,
        centerX: 500,
        y: 100,
        label: 'VOLUME',
        getter,
        setter,
        sliderWidth: 300,
      });

      // Track should have custom width
      expect(slider.track.width).toBe(300);
    });

    it('should apply custom handle size', () => {
      const slider = UIComponentFactory.createVolumeSlider({
        scene: mockScene,
        centerX: 500,
        y: 100,
        label: 'VOLUME',
        getter,
        setter,
        handleSize: 24,
      });

      // Handle should have custom size
      expect(slider.handle.width).toBe(24);
      expect(slider.handle.height).toBe(24);
    });

    it('should set handle as draggable', () => {
      const slider = UIComponentFactory.createVolumeSlider({
        scene: mockScene,
        centerX: 500,
        y: 100,
        label: 'VOLUME',
        getter,
        setter,
      });

      expect(slider.handle.setInteractive).toHaveBeenCalledWith({
        useHandCursor: true,
        draggable: true,
      });
      expect(mockScene.input.setDraggable).toHaveBeenCalledWith(slider.handle);
    });

    it('should register drag event handler on handle', () => {
      const slider = UIComponentFactory.createVolumeSlider({
        scene: mockScene,
        centerX: 500,
        y: 100,
        label: 'VOLUME',
        getter,
        setter,
      });

      expect(slider.handle.on).toHaveBeenCalledWith('drag', expect.any(Function));
    });

    it('should register click event handler on track hit area', () => {
      const slider = UIComponentFactory.createVolumeSlider({
        scene: mockScene,
        centerX: 500,
        y: 100,
        label: 'VOLUME',
        getter,
        setter,
      });

      expect(slider.trackHitArea.on).toHaveBeenCalledWith('pointerdown', expect.any(Function));
    });
  });

  describe('setValue', () => {
    it('should update slider position and call setter', () => {
      const slider = UIComponentFactory.createVolumeSlider({
        scene: mockScene,
        centerX: 500,
        y: 100,
        label: 'VOLUME',
        getter,
        setter,
        sliderWidth: 200,
      });

      setter.mockClear(); // Clear initial call
      slider.setValue(0.8);

      expect(setter).toHaveBeenCalledWith(0.8);
      expect(slider.valueText.setText).toHaveBeenCalledWith('80%');
      expect(slider.fill.width).toBe(160); // 200 * 0.8
      expect(slider.handle.x).toBe(500 - 100 + 160); // centerX - sliderWidth/2 + sliderWidth * value
    });

    it('should clamp value to 0-1 range', () => {
      const slider = UIComponentFactory.createVolumeSlider({
        scene: mockScene,
        centerX: 500,
        y: 100,
        label: 'VOLUME',
        getter,
        setter,
      });

      setter.mockClear();

      // Test upper bound
      slider.setValue(1.5);
      expect(setter).toHaveBeenCalledWith(1);
      expect(slider.valueText.setText).toHaveBeenCalledWith('100%');

      // Test lower bound
      slider.setValue(-0.5);
      expect(setter).toHaveBeenCalledWith(0);
      expect(slider.valueText.setText).toHaveBeenCalledWith('0%');
    });

    it('should handle edge values correctly', () => {
      const slider = UIComponentFactory.createVolumeSlider({
        scene: mockScene,
        centerX: 500,
        y: 100,
        label: 'VOLUME',
        getter,
        setter,
        sliderWidth: 200,
      });

      setter.mockClear();

      // Test 0
      slider.setValue(0);
      expect(slider.valueText.setText).toHaveBeenCalledWith('0%');
      expect(slider.fill.width).toBe(0);

      // Test 1
      slider.setValue(1);
      expect(slider.valueText.setText).toHaveBeenCalledWith('100%');
      expect(slider.fill.width).toBe(200);
    });
  });

  describe('drag interaction', () => {
    it('should update value when handle is dragged', () => {
      const slider = UIComponentFactory.createVolumeSlider({
        scene: mockScene,
        centerX: 500,
        y: 100,
        label: 'VOLUME',
        getter,
        setter,
        sliderWidth: 200,
      });

      setter.mockClear();

      // Get drag handler
      const dragHandler = slider.handle.on.mock.calls.find((call: any) => call[0] === 'drag')?.[1];
      expect(dragHandler).toBeDefined();

      // Simulate drag to 75% (centerX - sliderWidth/2 + sliderWidth * 0.75)
      const dragX = 500 - 100 + 150; // 550
      dragHandler(null, dragX);

      expect(setter).toHaveBeenCalledWith(0.75);
      expect(slider.valueText.setText).toHaveBeenCalledWith('75%');
    });

    it('should clamp drag position to slider bounds', () => {
      const slider = UIComponentFactory.createVolumeSlider({
        scene: mockScene,
        centerX: 500,
        y: 100,
        label: 'VOLUME',
        getter,
        setter,
        sliderWidth: 200,
      });

      setter.mockClear();

      const dragHandler = slider.handle.on.mock.calls.find((call: any) => call[0] === 'drag')?.[1];

      // Drag beyond max (should clamp to 1)
      dragHandler(null, 999);
      expect(setter).toHaveBeenCalledWith(1);

      // Drag beyond min (should clamp to 0)
      dragHandler(null, 0);
      expect(setter).toHaveBeenCalledWith(0);
    });
  });

  describe('track click interaction', () => {
    it('should jump to clicked position', () => {
      const slider = UIComponentFactory.createVolumeSlider({
        scene: mockScene,
        centerX: 500,
        y: 100,
        label: 'VOLUME',
        getter,
        setter,
        sliderWidth: 200,
      });

      setter.mockClear();

      // Get click handler
      const clickHandler = slider.trackHitArea.on.mock.calls.find(
        (call: any) => call[0] === 'pointerdown',
      )?.[1];
      expect(clickHandler).toBeDefined();

      // Simulate click at 25%
      const clickX = 500 - 100 + 50; // 450
      const mockPointer = { x: clickX };
      clickHandler(mockPointer);

      expect(setter).toHaveBeenCalledWith(0.25);
      expect(slider.valueText.setText).toHaveBeenCalledWith('25%');
    });

    it('should clamp click position to slider bounds', () => {
      const slider = UIComponentFactory.createVolumeSlider({
        scene: mockScene,
        centerX: 500,
        y: 100,
        label: 'VOLUME',
        getter,
        setter,
        sliderWidth: 200,
      });

      setter.mockClear();

      const clickHandler = slider.trackHitArea.on.mock.calls.find(
        (call: any) => call[0] === 'pointerdown',
      )?.[1];

      // Click beyond max
      clickHandler({ x: 999 });
      expect(setter).toHaveBeenCalledWith(1);

      // Click beyond min
      clickHandler({ x: 0 });
      expect(setter).toHaveBeenCalledWith(0);
    });
  });

  describe('refresh', () => {
    it('should update slider visual state from getter', () => {
      let currentValue = 0.5;
      getter = vi.fn(() => currentValue);

      const slider = UIComponentFactory.createVolumeSlider({
        scene: mockScene,
        centerX: 500,
        y: 100,
        label: 'VOLUME',
        getter,
        setter,
        sliderWidth: 200,
      });

      // Change the value externally
      currentValue = 0.8;

      // Refresh should update visual state
      slider.refresh();

      expect(getter).toHaveBeenCalled();
      expect(slider.valueText.setText).toHaveBeenCalledWith('80%');
      expect(slider.fill.width).toBe(160); // 200 * 0.8
      expect(slider.handle.x).toBe(500 - 100 + 160);
    });

    it('should not call setter during refresh', () => {
      const currentValue = 0.7;
      getter = vi.fn(() => currentValue);

      const slider = UIComponentFactory.createVolumeSlider({
        scene: mockScene,
        centerX: 500,
        y: 100,
        label: 'VOLUME',
        getter,
        setter,
      });

      setter.mockClear(); // Clear initial setter call

      slider.refresh();

      // Refresh should NOT call setter, only update visuals
      expect(setter).not.toHaveBeenCalled();
    });

    it('should clamp refreshed value to 0-1 range', () => {
      getter = vi.fn(() => 1.5); // Over max

      const slider = UIComponentFactory.createVolumeSlider({
        scene: mockScene,
        centerX: 500,
        y: 100,
        label: 'VOLUME',
        getter,
        setter,
      });

      slider.refresh();

      expect(slider.valueText.setText).toHaveBeenCalledWith('100%');
    });
  });

  describe('destroy', () => {
    it('should destroy all components', () => {
      const slider = UIComponentFactory.createVolumeSlider({
        scene: mockScene,
        centerX: 500,
        y: 100,
        label: 'VOLUME',
        getter,
        setter,
      });

      slider.destroy();

      expect(slider.labelText.destroy).toHaveBeenCalled();
      expect(slider.track.destroy).toHaveBeenCalled();
      expect(slider.fill.destroy).toHaveBeenCalled();
      expect(slider.handle.destroy).toHaveBeenCalled();
      expect(slider.valueText.destroy).toHaveBeenCalled();
      expect(slider.trackHitArea.destroy).toHaveBeenCalled();
    });

    it('should clean up all created game objects', () => {
      const slider = UIComponentFactory.createVolumeSlider({
        scene: mockScene,
        centerX: 500,
        y: 100,
        label: 'VOLUME',
        getter,
        setter,
      });

      const destroyCalls = mockGameObjects.map((obj) => obj.destroy);

      slider.destroy();

      destroyCalls.forEach((destroyFn) => {
        expect(destroyFn).toHaveBeenCalled();
      });
    });
  });
});
