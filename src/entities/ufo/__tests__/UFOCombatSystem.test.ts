/**
 * UFOCombatSystem Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { UFOCombatSystem } from '../UFOCombatSystem';

describe('UFOCombatSystem', () => {
  describe('Scout variant', () => {
    let combat: UFOCombatSystem;

    beforeEach(() => {
      combat = new UFOCombatSystem({ variant: 'scout' });
    });

    it('should initialize with 1 HP for scout', () => {
      expect(combat.getHitPoints()).toBe(1);
      expect(combat.getMaxHitPoints()).toBe(1);
      expect(combat.getVariant()).toBe('scout');
    });

    it('should be destroyed on single hit', () => {
      const result = combat.applyDamage(1, true);
      expect(result.destroyed).toBe(true);
      expect(result.health).toBe(0);
    });

    it('should not take damage when inactive', () => {
      const result = combat.applyDamage(1, false);
      expect(result.destroyed).toBe(false);
      expect(result.health).toBe(1);
    });
  });

  describe('Boss variant', () => {
    let combat: UFOCombatSystem;

    beforeEach(() => {
      combat = new UFOCombatSystem({ variant: 'boss', maxHitPoints: 12 });
    });

    it('should initialize with configured HP', () => {
      expect(combat.getHitPoints()).toBe(12);
      expect(combat.getMaxHitPoints()).toBe(12);
      expect(combat.getVariant()).toBe('boss');
    });

    it('should resolve boss phase based on HP ratio', () => {
      expect(combat.getBossPhase()).toBe(1); // Full HP

      combat.applyDamage(5, true); // 7/12 = 58% HP
      expect(combat.getBossPhase()).toBe(2);

      combat.applyDamage(4, true); // 3/12 = 25% HP
      expect(combat.getBossPhase()).toBe(3);
    });

    it('should not be destroyed until HP reaches 0', () => {
      let result = combat.applyDamage(5, true);
      expect(result.destroyed).toBe(false);
      expect(result.health).toBe(7);

      result = combat.applyDamage(7, true);
      expect(result.destroyed).toBe(true);
      expect(result.health).toBe(0);
    });

    it('should handle boss phase transitions correctly', () => {
      // Phase 1: > 66% HP
      expect(combat.getBossPhase()).toBe(1);

      // Damage to 60% HP
      combat.applyDamage(4.8, true);
      expect(combat.getBossPhase()).toBe(2);

      // Damage to 30% HP
      combat.applyDamage(3.6, true);
      expect(combat.getBossPhase()).toBe(3);
    });
  });

  describe('Boss modifiers', () => {
    it('should reduce damage by 50% with armored modifier', () => {
      const combat = new UFOCombatSystem({
        variant: 'boss',
        maxHitPoints: 10,
        modifier: 'armored',
      });

      const result = combat.applyDamage(4, true);
      expect(result.health).toBe(8); // 10 - (4 * 0.5) = 8
    });

    it('should regenerate HP with shielded modifier', () => {
      const combat = new UFOCombatSystem({
        variant: 'boss',
        maxHitPoints: 10,
        modifier: 'shielded',
      });

      combat.applyDamage(5, true); // 5 HP remaining

      // Simulate 1 second of regen
      combat.update(1000);
      expect(combat.getHitPoints()).toBeCloseTo(5.2, 1); // 5 + 0.2 regen
    });

    it('should not regenerate above max HP with shielded', () => {
      const combat = new UFOCombatSystem({
        variant: 'boss',
        maxHitPoints: 10,
        modifier: 'shielded',
      });

      combat.applyDamage(0.1, true); // 9.9 HP

      combat.update(1000); // Regen +0.2
      expect(combat.getHitPoints()).toBe(10); // Capped at max
    });

    it('should increase speed multiplier with berserk modifier as HP drops', () => {
      const combat = new UFOCombatSystem({
        variant: 'boss',
        maxHitPoints: 10,
        modifier: 'berserk',
      });

      const scaleAtFull = combat.getBerserkScale();
      expect(scaleAtFull).toBe(1.0); // No boost at full HP

      combat.applyDamage(5, true); // 50% HP
      const scaleAtHalf = combat.getBerserkScale();
      expect(scaleAtHalf).toBeCloseTo(1.3, 1); // 1 + (1 - 0.5) * 0.6

      combat.applyDamage(5, true); // 0% HP
      const scaleAtZero = combat.getBerserkScale();
      expect(scaleAtZero).toBeCloseTo(1.6, 1); // 1 + (1 - 0) * 0.6
    });

    it('should have normal damage with no modifier', () => {
      const combat = new UFOCombatSystem({
        variant: 'boss',
        maxHitPoints: 10,
        modifier: 'none',
      });

      const result = combat.applyDamage(3, true);
      expect(result.health).toBe(7);
    });
  });

  describe('Display HP smoothing', () => {
    it('should lerp display HP towards actual HP', () => {
      const combat = new UFOCombatSystem({ variant: 'boss', maxHitPoints: 10 });

      combat.applyDamage(5, true); // HP drops to 5, displayHP is still 10

      combat.update(100); // Small delta
      const displayAfterSmallDelta = combat.getDisplayHitPoints();
      expect(displayAfterSmallDelta).toBeGreaterThan(5);
      expect(displayAfterSmallDelta).toBeLessThan(10);

      // Keep updating until converged
      for (let i = 0; i < 100; i++) {
        combat.update(100);
      }
      expect(combat.getDisplayHitPoints()).toBeCloseTo(5, 1);
    });

    it('should snap display HP when very close to actual HP', () => {
      const combat = new UFOCombatSystem({ variant: 'boss', maxHitPoints: 10 });

      combat.applyDamage(5, true);

      // Force display HP to near actual
      for (let i = 0; i < 50; i++) {
        combat.update(100);
      }

      expect(combat.getDisplayHitPoints()).toBe(5);
    });
  });

  describe('reset', () => {
    it('should reset combat state to new config', () => {
      const combat = new UFOCombatSystem({ variant: 'scout' });

      combat.applyDamage(1, true); // Destroy scout
      expect(combat.getHitPoints()).toBe(0);

      combat.reset({ variant: 'boss', maxHitPoints: 15, modifier: 'armored' });
      expect(combat.getHitPoints()).toBe(15);
      expect(combat.getMaxHitPoints()).toBe(15);
      expect(combat.getVariant()).toBe('boss');
      expect(combat.getModifier()).toBe('armored');
      expect(combat.getBossPhase()).toBe(1);
    });
  });

  describe('edge cases', () => {
    it('should handle invalid maxHitPoints for boss', () => {
      const combat = new UFOCombatSystem({ variant: 'boss', maxHitPoints: NaN });

      const result = combat.applyDamage(1, true);
      // Should auto-fix to 6 HP
      expect(result.maxHealth).toBe(6);
    });

    it('should handle negative damage as healing', () => {
      const combat = new UFOCombatSystem({ variant: 'boss', maxHitPoints: 10 });

      combat.applyDamage(5, true); // 5 HP

      const result = combat.applyDamage(-2, true); // Attempt "heal"
      expect(result.health).toBeGreaterThanOrEqual(5); // Math.max(0, 5 - (-2)) = 7
    });

    it('should clamp HP at 0', () => {
      const combat = new UFOCombatSystem({ variant: 'boss', maxHitPoints: 10 });

      const result = combat.applyDamage(20, true); // Overkill
      expect(result.health).toBe(0);
      expect(result.destroyed).toBe(true);
    });
  });
});
