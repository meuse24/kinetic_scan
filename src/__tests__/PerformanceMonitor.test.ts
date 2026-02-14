import { describe, expect, it, vi } from 'vitest';

vi.mock('phaser', () => ({
  default: {
    WEBGL: 1,
    CANVAS: 2,
    Math: {
      Clamp: (value: number, min: number, max: number) => Math.max(min, Math.min(max, value)),
    },
  },
}));

import { PerformanceMonitor, QualityLevel } from '../PerformanceMonitor';

type MockGame = {
  loop: { actualFps: number };
  renderer: { type: number };
  device: { os: { desktop: boolean } };
};

function createGame(fps: number): MockGame {
  return {
    loop: { actualFps: fps },
    renderer: { type: 1 },
    device: { os: { desktop: true } },
  };
}

function runFrames(monitor: PerformanceMonitor, game: MockGame, frames: number, fps: number) {
  game.loop.actualFps = fps;
  for (let i = 0; i < frames; i++) {
    monitor.update(game as any);
  }
}

describe('PerformanceMonitor', () => {
  it('downgrades quality after sustained low FPS', () => {
    const monitor = new PerformanceMonitor();
    const game = createGame(45);

    monitor.init(game as any);
    runFrames(monitor, game, 130, 45);

    expect(monitor.qualityLevel).toBeLessThan(QualityLevel.FULL);
  });

  it('upgrades quality again after stable FPS recovery', () => {
    const monitor = new PerformanceMonitor();
    const game = createGame(45);

    monitor.init(game as any);
    runFrames(monitor, game, 130, 45);
    expect(monitor.qualityLevel).toBeLessThan(QualityLevel.FULL);

    runFrames(monitor, game, 150, 60);
    expect(monitor.qualityLevel).toBe(QualityLevel.FULL);
  });

  it('ignores background-tab FPS throttling while document is hidden', () => {
    const monitor = new PerformanceMonitor();
    const game = createGame(20);
    const visibilitySpy = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden');

    monitor.init(game as any);
    runFrames(monitor, game, 220, 20);
    expect(monitor.qualityLevel).toBe(QualityLevel.FULL);

    visibilitySpy.mockReturnValue('visible');
    runFrames(monitor, game, 130, 20);
    expect(monitor.qualityLevel).toBeLessThan(QualityLevel.FULL);

    visibilitySpy.mockRestore();
  });
});
