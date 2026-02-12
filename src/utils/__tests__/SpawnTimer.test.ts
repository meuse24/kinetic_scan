/**
 * SpawnTimer Tests
 *
 * Comprehensive test suite for spawn timer utility
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SpawnTimer } from '../SpawnTimer';

describe('SpawnTimer', () => {
  beforeEach(() => {
    // Mock Math.random for predictable tests
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should initialize with random interval', () => {
      const timer = new SpawnTimer({
        minIntervalMs: 1000,
        maxIntervalMs: 2000,
      });

      // With Math.random() = 0.5, should be 1500ms
      expect(timer.getRemaining()).toBe(1500);
    });

    it('should default autoReset to true', () => {
      const timer = new SpawnTimer({
        minIntervalMs: 1000,
        maxIntervalMs: 2000,
      });

      timer.update(2000); // Trigger

      // Should auto-reset with new interval
      expect(timer.getRemaining()).toBeGreaterThan(0);
    });

    it('should respect autoReset: false', () => {
      const timer = new SpawnTimer({
        minIntervalMs: 1000,
        maxIntervalMs: 2000,
        autoReset: false,
      });

      timer.update(2000); // Trigger

      // Should NOT auto-reset
      expect(timer.getRemaining()).toBe(0);
    });
  });

  describe('update', () => {
    it('should decrement timer by delta', () => {
      const timer = new SpawnTimer({
        minIntervalMs: 1000,
        maxIntervalMs: 2000,
      });

      const initial = timer.getRemaining();
      timer.update(100);

      expect(timer.getRemaining()).toBe(initial - 100);
    });

    it('should return false when timer is not ready', () => {
      const timer = new SpawnTimer({
        minIntervalMs: 1000,
        maxIntervalMs: 2000,
      });

      const result = timer.update(100);

      expect(result).toBe(false);
    });

    it('should return true when timer reaches zero', () => {
      const timer = new SpawnTimer({
        minIntervalMs: 1000,
        maxIntervalMs: 2000,
      });

      const result = timer.update(2000);

      expect(result).toBe(true);
    });

    it('should auto-reset after triggering when autoReset is true', () => {
      const timer = new SpawnTimer({
        minIntervalMs: 1000,
        maxIntervalMs: 2000,
        autoReset: true,
      });

      timer.update(2000); // Trigger

      // Should have reset to new random interval
      expect(timer.getRemaining()).toBeGreaterThan(0);
    });

    it('should not auto-reset when autoReset is false', () => {
      const timer = new SpawnTimer({
        minIntervalMs: 1000,
        maxIntervalMs: 2000,
        autoReset: false,
      });

      timer.update(2000); // Trigger

      // Should stay at 0
      expect(timer.getRemaining()).toBe(0);
      expect(timer.isReady()).toBe(true);
    });

    it('should trigger multiple times with autoReset', () => {
      const timer = new SpawnTimer({
        minIntervalMs: 100,
        maxIntervalMs: 200,
        autoReset: true,
      });

      let triggerCount = 0;
      for (let i = 0; i < 10; i++) {
        if (timer.update(200)) {
          triggerCount++;
        }
      }

      expect(triggerCount).toBeGreaterThan(0);
    });
  });

  describe('reset', () => {
    it('should reset timer to new random interval', () => {
      const timer = new SpawnTimer({
        minIntervalMs: 1000,
        maxIntervalMs: 2000,
      });

      timer.update(1000); // Partially consume

      const beforeReset = timer.getRemaining();
      timer.reset();
      const afterReset = timer.getRemaining();

      expect(afterReset).not.toBe(beforeReset);
      expect(afterReset).toBeGreaterThanOrEqual(1000);
      expect(afterReset).toBeLessThanOrEqual(2000);
    });

    it('should generate different intervals on multiple resets', () => {
      const timer = new SpawnTimer({
        minIntervalMs: 1000,
        maxIntervalMs: 2000,
      });

      vi.spyOn(Math, 'random').mockReturnValueOnce(0.2).mockReturnValueOnce(0.8);

      timer.reset();
      const first = timer.getRemaining();

      timer.reset();
      const second = timer.getRemaining();

      expect(first).not.toBe(second);
    });
  });

  describe('forceSpawn', () => {
    it('should set timer to zero', () => {
      const timer = new SpawnTimer({
        minIntervalMs: 1000,
        maxIntervalMs: 2000,
      });

      timer.forceSpawn();

      expect(timer.getRemaining()).toBe(0);
      expect(timer.isReady()).toBe(true);
    });

    it('should trigger on next update after force spawn', () => {
      const timer = new SpawnTimer({
        minIntervalMs: 1000,
        maxIntervalMs: 2000,
      });

      timer.forceSpawn();
      const result = timer.update(1);

      expect(result).toBe(true);
    });
  });

  describe('getRemaining', () => {
    it('should return current timer value', () => {
      const timer = new SpawnTimer({
        minIntervalMs: 1000,
        maxIntervalMs: 2000,
      });

      const initial = timer.getRemaining();
      expect(initial).toBeGreaterThan(0);

      timer.update(500);
      expect(timer.getRemaining()).toBe(initial - 500);
    });

    it('should never return negative values', () => {
      const timer = new SpawnTimer({
        minIntervalMs: 1000,
        maxIntervalMs: 2000,
        autoReset: false,
      });

      timer.update(5000); // Over-consume

      expect(timer.getRemaining()).toBeGreaterThanOrEqual(0);
    });
  });

  describe('setTimer', () => {
    it('should set timer to specific value', () => {
      const timer = new SpawnTimer({
        minIntervalMs: 1000,
        maxIntervalMs: 2000,
      });

      timer.setTimer(500);

      expect(timer.getRemaining()).toBe(500);
    });

    it('should allow setting timer to zero', () => {
      const timer = new SpawnTimer({
        minIntervalMs: 1000,
        maxIntervalMs: 2000,
      });

      timer.setTimer(0);

      expect(timer.getRemaining()).toBe(0);
      expect(timer.isReady()).toBe(true);
    });
  });

  describe('isReady', () => {
    it('should return false when timer is not ready', () => {
      const timer = new SpawnTimer({
        minIntervalMs: 1000,
        maxIntervalMs: 2000,
      });

      expect(timer.isReady()).toBe(false);
    });

    it('should return true when timer reaches zero', () => {
      const timer = new SpawnTimer({
        minIntervalMs: 1000,
        maxIntervalMs: 2000,
      });

      timer.setTimer(0);

      expect(timer.isReady()).toBe(true);
    });

    it('should not consume the timer', () => {
      const timer = new SpawnTimer({
        minIntervalMs: 1000,
        maxIntervalMs: 2000,
      });

      timer.setTimer(100);

      const before = timer.getRemaining();
      timer.isReady();
      const after = timer.getRemaining();

      expect(before).toBe(after);
    });
  });

  describe('randomInterval', () => {
    it('should generate intervals within configured range', () => {
      const min = 1000;
      const max = 2000;

      // Test with various random values
      for (let i = 0; i <= 10; i++) {
        const randomValue = i / 10; // 0.0 to 1.0
        vi.spyOn(Math, 'random').mockReturnValue(randomValue);

        const timer = new SpawnTimer({
          minIntervalMs: min,
          maxIntervalMs: max,
        });

        const remaining = timer.getRemaining();
        expect(remaining).toBeGreaterThanOrEqual(min);
        expect(remaining).toBeLessThanOrEqual(max);

        vi.restoreAllMocks();
      }
    });

    it('should use min interval when random = 0', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0);

      const timer = new SpawnTimer({
        minIntervalMs: 1000,
        maxIntervalMs: 2000,
      });

      expect(timer.getRemaining()).toBe(1000);
    });

    it('should use max interval when random = 1', () => {
      vi.spyOn(Math, 'random').mockReturnValue(1);

      const timer = new SpawnTimer({
        minIntervalMs: 1000,
        maxIntervalMs: 2000,
      });

      expect(timer.getRemaining()).toBe(2000);
    });
  });

  describe('edge cases', () => {
    it('should handle zero interval range', () => {
      const timer = new SpawnTimer({
        minIntervalMs: 1000,
        maxIntervalMs: 1000,
      });

      expect(timer.getRemaining()).toBe(1000);
    });

    it('should handle very small deltas', () => {
      const timer = new SpawnTimer({
        minIntervalMs: 1000,
        maxIntervalMs: 2000,
      });

      const initial = timer.getRemaining();
      timer.update(0.001);

      expect(timer.getRemaining()).toBeLessThan(initial);
    });

    it('should handle very large deltas', () => {
      const timer = new SpawnTimer({
        minIntervalMs: 1000,
        maxIntervalMs: 2000,
        autoReset: true,
      });

      const result = timer.update(999999);

      expect(result).toBe(true);
      expect(timer.getRemaining()).toBeGreaterThan(0); // Should have reset
    });
  });
});
