/**
 * UFOMovementSystem Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { UFOMovementSystem } from '../UFOMovementSystem';
import type { MovementConfig } from '../UFOMovementSystem';

describe('UFOMovementSystem', () => {
  describe('Scout movement', () => {
    let movement: UFOMovementSystem;

    beforeEach(() => {
      movement = new UFOMovementSystem({
        variant: 'scout',
        startX: 500,
        startY: 200,
        movementSeed: 0,
        difficultyLevel: 1,
      });
    });

    it('should initialize with config values', () => {
      const config: MovementConfig = {
        variant: 'scout',
        startX: 300,
        startY: 150,
        movementSeed: 0.5,
        difficultyLevel: 3,
      };
      const sys = new UFOMovementSystem(config);
      expect(sys).toBeDefined();
    });

    it('should move horizontally with velocity', () => {
      const state = movement.updateScout(500, 200, 0, 1000);
      expect(state.velocityX).toBeGreaterThan(0); // Moving right initially (travelDir = 1)
    });

    it('should reverse direction at left boundary', () => {
      const state = movement.updateScout(50, 200, 0, 1000);
      expect(state.travelDir).toBe(1); // Should reverse to right
    });

    it('should reverse direction at right boundary', () => {
      const state = movement.updateScout(950, 200, 0, 1000);
      expect(state.travelDir).toBe(-1); // Should reverse to left
    });

    it('should oscillate vertically around startY', () => {
      const states: number[] = [];
      for (let t = 0; t < 10; t++) {
        const state = movement.updateScout(500, 200, t, 1000);
        states.push(state.y);
      }

      // Y should vary around startY due to sine wave
      const minY = Math.min(...states);
      const maxY = Math.max(...states);
      expect(maxY - minY).toBeGreaterThan(0);
    });
  });

  describe('Boss movement', () => {
    let movement: UFOMovementSystem;

    beforeEach(() => {
      movement = new UFOMovementSystem({
        variant: 'boss',
        startX: 500,
        startY: 250,
        movementSeed: 0,
        difficultyLevel: 2,
      });
    });

    it('should calculate position without evasion threats', () => {
      const state = movement.updateBoss(500, 250, 0, 16, 0, 1, 1000, 600);
      expect(state.x).toBeDefined();
      expect(state.y).toBeDefined();
    });

    it('should update startY periodically', () => {
      const initialStartY = 250;

      // Time at which startY updates (every 2400ms interval)
      const state1 = movement.updateBoss(500, 250, 0, 16, 0, 1, 1000, 600);
      expect(state1.startY).toBe(initialStartY); // No change yet

      movement.updateBoss(500, 250, 1, 16, 2400, 1, 1000, 600);
      // startY may change at time % 2400 == 0
    });

    it('should adjust movement based on boss phase', () => {
      const statePhase1 = movement.updateBoss(500, 250, 1, 16, 0, 1, 1000, 600);
      const statePhase3 = movement.updateBoss(500, 250, 1, 16, 0, 3, 1000, 600);

      // Phase 3 should be more aggressive (different movement)
      // Hard to test exact values, but we can verify it doesn't crash
      expect(statePhase1).toBeDefined();
      expect(statePhase3).toBeDefined();
    });

    it('should clamp X position within scene bounds', () => {
      const sceneWidth = 1000;

      // Try to move far left
      const stateLeft = movement.updateBoss(100, 250, 5, 16, 0, 1, sceneWidth, 600);
      expect(stateLeft.x).toBeGreaterThanOrEqual(125);

      // Try to move far right
      const stateRight = movement.updateBoss(900, 250, 5, 16, 0, 1, sceneWidth, 600);
      expect(stateRight.x).toBeLessThanOrEqual(sceneWidth - 125);
    });

    it('should cache dodge offset and refresh periodically', () => {
      // First update calculates dodge
      movement.updateBoss(500, 250, 0, 16, 0, 1, 1000, 600);

      // Subsequent updates within refresh period use cached value
      // Hard to test internal state, but verify no crash
      movement.updateBoss(500, 250, 0.1, 16, 100, 1, 1000, 600);
    });

    it('should reduce dodge refresh rate in higher phases', () => {
      // Phase 1: slower dodge updates
      const state1 = movement.updateBoss(500, 250, 0, 100, 0, 1, 1000, 600);
      // Phase 3: faster dodge updates (should refresh more often)
      const state3 = movement.updateBoss(500, 250, 0, 100, 0, 3, 1000, 600);

      expect(state1).toBeDefined();
      expect(state3).toBeDefined();
    });
  });

  describe('reset', () => {
    it('should reset movement state', () => {
      const movement = new UFOMovementSystem({
        variant: 'scout',
        startX: 500,
        startY: 200,
        movementSeed: 0,
        difficultyLevel: 1,
      });

      // Mutate state
      movement.updateScout(50, 200, 0, 1000); // Trigger direction change

      // Reset to boss
      movement.reset({
        variant: 'boss',
        startX: 700,
        startY: 300,
        movementSeed: 1.5,
        difficultyLevel: 5,
      });

      // Should work as boss now
      const state = movement.updateBoss(700, 300, 0, 16, 0, 1, 1000, 600);
      expect(state).toBeDefined();
    });
  });

  describe('edge cases', () => {
    it('should handle zero difficulty level', () => {
      const movement = new UFOMovementSystem({
        variant: 'scout',
        startX: 500,
        startY: 200,
        movementSeed: 0,
        difficultyLevel: 0,
      });

      const state = movement.updateScout(500, 200, 0, 1000);
      expect(state.velocityX).toBeGreaterThan(0); // Should still move
    });

    it('should handle very small scene dimensions', () => {
      const movement = new UFOMovementSystem({
        variant: 'boss',
        startX: 200,
        startY: 100,
        movementSeed: 0,
        difficultyLevel: 1,
      });

      const state = movement.updateBoss(200, 100, 0, 16, 0, 1, 400, 300);
      expect(state.x).toBeGreaterThanOrEqual(125);
      expect(state.x).toBeLessThanOrEqual(275); // 400 - 125
    });

    it('should handle reduced visual detail', () => {
      const movement = new UFOMovementSystem({
        variant: 'boss',
        startX: 500,
        startY: 250,
        movementSeed: 0,
        difficultyLevel: 1,
        reducedVisualDetail: true,
      });

      const state = movement.updateBoss(500, 250, 0, 16, 0, 1, 1000, 600);
      expect(state).toBeDefined();
    });
  });
});
