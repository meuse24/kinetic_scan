/**
 * Vitest Setup File
 * Provides minimal Phaser mocks for unit testing
 */

import { vi } from 'vitest';

// Mock Phaser namespace
(globalThis as any).Phaser = {
  Math: {
    Between: vi.fn((min: number, max: number) => {
      return Math.floor(Math.random() * (max - min + 1)) + min;
    }),
    FloatBetween: vi.fn((min: number, max: number) => {
      return Math.random() * (max - min) + min;
    }),
    Clamp: vi.fn((value: number, min: number, max: number) => {
      return Math.max(min, Math.min(max, value));
    }),
    Distance: {
      Between: vi.fn((x1: number, y1: number, x2: number, y2: number) => {
        const dx = x2 - x1;
        const dy = y2 - y1;
        return Math.sqrt(dx * dx + dy * dy);
      }),
    },
    Angle: {
      Between: vi.fn((x1: number, y1: number, x2: number, y2: number) => {
        return Math.atan2(y2 - y1, x2 - x1);
      }),
    },
  },
  GameObjects: {
    Graphics: vi.fn(),
    Text: vi.fn(),
    Rectangle: vi.fn(),
    Image: vi.fn(),
    Sprite: vi.fn(),
    Group: vi.fn(() => ({
      getChildren: vi.fn(() => []),
      clear: vi.fn(),
      destroy: vi.fn(),
    })),
  },
  Physics: {
    Arcade: {
      Sprite: vi.fn(),
      Group: vi.fn(() => ({
        getChildren: vi.fn(() => []),
        clear: vi.fn(),
        destroy: vi.fn(),
      })),
      StaticGroup: vi.fn(() => ({
        getChildren: vi.fn(() => []),
        clear: vi.fn(),
        destroy: vi.fn(),
      })),
    },
  },
  Scene: vi.fn(() => ({
    add: {
      graphics: vi.fn(),
      text: vi.fn(),
      rectangle: vi.fn(),
      image: vi.fn(),
      sprite: vi.fn(),
      group: vi.fn(),
    },
    physics: {
      add: {
        overlap: vi.fn(),
        collider: vi.fn(),
        sprite: vi.fn(),
        group: vi.fn(),
        staticGroup: vi.fn(),
      },
    },
    time: {
      now: 0,
      addEvent: vi.fn(),
    },
    input: {
      keyboard: {
        on: vi.fn(),
        off: vi.fn(),
      },
    },
  })),
  Scale: {
    FIT: 'FIT',
  },
  AUTO: 'AUTO',
} as any;

// Mock window dimensions for gameConfig tests
Object.defineProperty(window, 'innerWidth', {
  writable: true,
  configurable: true,
  value: 1920,
});

Object.defineProperty(window, 'innerHeight', {
  writable: true,
  configurable: true,
  value: 1080,
});

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};

  return {
    getItem: (key: string) => store[key] || null,
    setItem: (key: string, value: string) => {
      store[key] = value.toString();
    },
    removeItem: (key: string) => {
      delete store[key];
    },
    clear: () => {
      store = {};
    },
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

// Mock AudioContext for AudioManager tests
(globalThis as any).AudioContext = vi.fn(() => ({
  createOscillator: vi.fn(() => ({
    type: 'sine',
    frequency: { value: 440 },
    connect: vi.fn(),
    start: vi.fn(),
    stop: vi.fn(),
  })),
  createGain: vi.fn(() => ({
    gain: { value: 1 },
    connect: vi.fn(),
  })),
  destination: {},
  currentTime: 0,
})) as any;
