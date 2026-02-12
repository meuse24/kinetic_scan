// @ts-nocheck
/**
 * PowerUpManager Tests
 *
 * Tests for power-up timer management and activation/deactivation
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PowerUpManager } from '../PowerUpManager';
import type { PowerUpCallbacks, PowerUpManagerConfig } from '../PowerUpManager';
import { PowerUpType } from '../../types/PowerUpType';

describe('PowerUpManager', () => {
  let mockCallbacks: PowerUpCallbacks;
  let mockConfig: PowerUpManagerConfig;
  let powerUpManager: PowerUpManager;

  beforeEach(() => {
    mockCallbacks = {
      onTripleShotChanged: vi.fn(),
      onSlowMotionChanged: vi.fn(),
      onShieldChanged: vi.fn(),
      onGhostPhaseChanged: vi.fn(),
      onCannonCoolingChanged: vi.fn(),
      onBlackHoleVisualChanged: vi.fn(),
      onDronesSpawn: vi.fn(),
      onDronesRemove: vi.fn(),
      onBlackHoleSpawn: vi.fn(),
      onBlackHoleRemove: vi.fn(),
      onShieldBunkersSpawn: vi.fn(),
      onShieldBunkersRemove: vi.fn(),
      onEMPTrigger: vi.fn(),
      onMineChargesAdd: vi.fn(),
      onPowerUpAudioPlay: vi.fn(),
      onActivePowerUpsChanged: vi.fn(),
    };

    mockConfig = {
      getDuration: vi.fn((type: PowerUpType) => {
        // Default durations for testing
        switch (type) {
          case PowerUpType.TRIPLE_SHOT:
            return 5000;
          case PowerUpType.SHIELD:
            return 8000;
          case PowerUpType.SLOW_MOTION:
            return 6000;
          default:
            return 10000;
        }
      }),
    };

    powerUpManager = new PowerUpManager(mockCallbacks, mockConfig);
  });

  describe('constructor', () => {
    it('should initialize with empty active power-ups', () => {
      expect(powerUpManager.getActivePowerUps().size).toBe(0);
    });
  });

  describe('activate', () => {
    it('should activate TRIPLE_SHOT and set timer', () => {
      powerUpManager.activate(PowerUpType.TRIPLE_SHOT);

      expect(powerUpManager.isActive(PowerUpType.TRIPLE_SHOT)).toBe(true);
      expect(powerUpManager.getRemainingTime(PowerUpType.TRIPLE_SHOT)).toBe(5000);
      expect(mockCallbacks.onTripleShotChanged).toHaveBeenCalledWith(true);
      expect(mockCallbacks.onPowerUpAudioPlay).toHaveBeenCalledWith(PowerUpType.TRIPLE_SHOT);
    });

    it('should activate SHIELD and set timer', () => {
      powerUpManager.activate(PowerUpType.SHIELD);

      expect(powerUpManager.isActive(PowerUpType.SHIELD)).toBe(true);
      expect(mockCallbacks.onShieldChanged).toHaveBeenCalledWith(true);
    });

    it('should activate SLOW_MOTION', () => {
      powerUpManager.activate(PowerUpType.SLOW_MOTION);

      expect(powerUpManager.isActive(PowerUpType.SLOW_MOTION)).toBe(true);
      expect(mockCallbacks.onSlowMotionChanged).toHaveBeenCalledWith(true);
    });

    it('should activate GHOST_PHASE', () => {
      powerUpManager.activate(PowerUpType.GHOST_PHASE);

      expect(powerUpManager.isActive(PowerUpType.GHOST_PHASE)).toBe(true);
      expect(mockCallbacks.onGhostPhaseChanged).toHaveBeenCalledWith(true, false);
    });

    it('should activate CANNON_COOLING', () => {
      powerUpManager.activate(PowerUpType.CANNON_COOLING);

      expect(powerUpManager.isActive(PowerUpType.CANNON_COOLING)).toBe(true);
      expect(mockCallbacks.onCannonCoolingChanged).toHaveBeenCalledWith(true);
    });

    it('should activate WINGMAN_DRONES', () => {
      powerUpManager.activate(PowerUpType.WINGMAN_DRONES);

      expect(powerUpManager.isActive(PowerUpType.WINGMAN_DRONES)).toBe(true);
      expect(mockCallbacks.onDronesSpawn).toHaveBeenCalled();
    });

    it('should activate BLACK_HOLE', () => {
      powerUpManager.activate(PowerUpType.BLACK_HOLE);

      expect(powerUpManager.isActive(PowerUpType.BLACK_HOLE)).toBe(true);
      expect(mockCallbacks.onBlackHoleVisualChanged).toHaveBeenCalledWith(true);
      expect(mockCallbacks.onBlackHoleSpawn).toHaveBeenCalled();
    });

    it('should activate SHIELD_BUNKER', () => {
      powerUpManager.activate(PowerUpType.SHIELD_BUNKER);

      expect(powerUpManager.isActive(PowerUpType.SHIELD_BUNKER)).toBe(true);
      expect(mockCallbacks.onShieldBunkersSpawn).toHaveBeenCalled();
    });

    it('should trigger EMP_WAVE immediately', () => {
      powerUpManager.activate(PowerUpType.EMP_WAVE);

      expect(mockCallbacks.onEMPTrigger).toHaveBeenCalled();
      expect(powerUpManager.isActive(PowerUpType.EMP_WAVE)).toBe(true);
    });

    it('should handle MINE_LAYER as instant (no timer)', () => {
      powerUpManager.activate(PowerUpType.MINE_LAYER);

      expect(mockCallbacks.onMineChargesAdd).toHaveBeenCalledWith(1);
      expect(mockCallbacks.onPowerUpAudioPlay).toHaveBeenCalledWith(PowerUpType.MINE_LAYER);
      expect(powerUpManager.isActive(PowerUpType.MINE_LAYER)).toBe(false);
    });

    it('should notify state changed when activating', () => {
      powerUpManager.activate(PowerUpType.TRIPLE_SHOT);

      expect(mockCallbacks.onActivePowerUpsChanged).toHaveBeenCalled();
    });
  });

  describe('deactivate', () => {
    it('should deactivate TRIPLE_SHOT', () => {
      powerUpManager.activate(PowerUpType.TRIPLE_SHOT);
      vi.clearAllMocks();

      powerUpManager.deactivate(PowerUpType.TRIPLE_SHOT);

      expect(powerUpManager.isActive(PowerUpType.TRIPLE_SHOT)).toBe(false);
      expect(mockCallbacks.onTripleShotChanged).toHaveBeenCalledWith(false);
    });

    it('should deactivate WINGMAN_DRONES', () => {
      powerUpManager.activate(PowerUpType.WINGMAN_DRONES);
      vi.clearAllMocks();

      powerUpManager.deactivate(PowerUpType.WINGMAN_DRONES);

      expect(powerUpManager.isActive(PowerUpType.WINGMAN_DRONES)).toBe(false);
      expect(mockCallbacks.onDronesRemove).toHaveBeenCalled();
    });

    it('should deactivate BLACK_HOLE', () => {
      powerUpManager.activate(PowerUpType.BLACK_HOLE);
      vi.clearAllMocks();

      powerUpManager.deactivate(PowerUpType.BLACK_HOLE);

      expect(powerUpManager.isActive(PowerUpType.BLACK_HOLE)).toBe(false);
      expect(mockCallbacks.onBlackHoleVisualChanged).toHaveBeenCalledWith(false);
      expect(mockCallbacks.onBlackHoleRemove).toHaveBeenCalled();
    });

    it('should deactivate SHIELD_BUNKER', () => {
      powerUpManager.activate(PowerUpType.SHIELD_BUNKER);
      vi.clearAllMocks();

      powerUpManager.deactivate(PowerUpType.SHIELD_BUNKER);

      expect(powerUpManager.isActive(PowerUpType.SHIELD_BUNKER)).toBe(false);
      expect(mockCallbacks.onShieldBunkersRemove).toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('should decrement timer', () => {
      powerUpManager.activate(PowerUpType.TRIPLE_SHOT);

      powerUpManager.update(1000);

      expect(powerUpManager.getRemainingTime(PowerUpType.TRIPLE_SHOT)).toBe(4000);
    });

    it('should deactivate when timer expires', () => {
      powerUpManager.activate(PowerUpType.TRIPLE_SHOT);
      vi.clearAllMocks();

      powerUpManager.update(6000);

      expect(powerUpManager.isActive(PowerUpType.TRIPLE_SHOT)).toBe(false);
      expect(mockCallbacks.onTripleShotChanged).toHaveBeenCalledWith(false);
    });

    it('should handle multiple active power-ups', () => {
      powerUpManager.activate(PowerUpType.TRIPLE_SHOT); // 5000ms
      powerUpManager.activate(PowerUpType.SHIELD); // 8000ms

      powerUpManager.update(3000);

      expect(powerUpManager.getRemainingTime(PowerUpType.TRIPLE_SHOT)).toBe(2000);
      expect(powerUpManager.getRemainingTime(PowerUpType.SHIELD)).toBe(5000);
    });

    it('should deactivate only expired power-ups', () => {
      powerUpManager.activate(PowerUpType.TRIPLE_SHOT); // 5000ms
      powerUpManager.activate(PowerUpType.SHIELD); // 8000ms
      vi.clearAllMocks();

      powerUpManager.update(6000);

      expect(powerUpManager.isActive(PowerUpType.TRIPLE_SHOT)).toBe(false);
      expect(powerUpManager.isActive(PowerUpType.SHIELD)).toBe(true);
      expect(mockCallbacks.onTripleShotChanged).toHaveBeenCalledWith(false);
    });

    it('should notify state changed on expiry', () => {
      powerUpManager.activate(PowerUpType.TRIPLE_SHOT);
      vi.clearAllMocks();

      powerUpManager.update(6000);

      expect(mockCallbacks.onActivePowerUpsChanged).toHaveBeenCalled();
    });
  });

  describe('reapplyAll', () => {
    it('should reapply all active power-ups', () => {
      powerUpManager.activate(PowerUpType.TRIPLE_SHOT);
      powerUpManager.activate(PowerUpType.SHIELD);
      vi.clearAllMocks();

      powerUpManager.reapplyAll(false);

      expect(mockCallbacks.onTripleShotChanged).toHaveBeenCalledWith(true);
      expect(mockCallbacks.onShieldChanged).toHaveBeenCalledWith(true);
    });

    it('should deactivate inactive power-ups', () => {
      powerUpManager.reapplyAll(false);

      expect(mockCallbacks.onTripleShotChanged).toHaveBeenCalledWith(false);
      expect(mockCallbacks.onShieldChanged).toHaveBeenCalledWith(false);
    });

    it('should handle silent mode for GHOST_PHASE', () => {
      powerUpManager.activate(PowerUpType.GHOST_PHASE);
      vi.clearAllMocks();

      powerUpManager.reapplyAll(true);

      expect(mockCallbacks.onGhostPhaseChanged).toHaveBeenCalledWith(true, true);
    });

    it('should spawn entities when reapplying', () => {
      powerUpManager.activate(PowerUpType.WINGMAN_DRONES);
      powerUpManager.activate(PowerUpType.BLACK_HOLE);
      vi.clearAllMocks();

      powerUpManager.reapplyAll(false);

      expect(mockCallbacks.onDronesSpawn).toHaveBeenCalled();
      expect(mockCallbacks.onBlackHoleSpawn).toHaveBeenCalled();
    });
  });

  describe('state management', () => {
    it('should load state from map', () => {
      const savedState = new Map<PowerUpType, number>([
        [PowerUpType.TRIPLE_SHOT, 3000],
        [PowerUpType.SHIELD, 5000],
      ]);

      powerUpManager.loadState(savedState);

      expect(powerUpManager.isActive(PowerUpType.TRIPLE_SHOT)).toBe(true);
      expect(powerUpManager.isActive(PowerUpType.SHIELD)).toBe(true);
      expect(powerUpManager.getRemainingTime(PowerUpType.TRIPLE_SHOT)).toBe(3000);
    });

    it('should return copy of active power-ups', () => {
      powerUpManager.activate(PowerUpType.TRIPLE_SHOT);

      const activePowerUps = powerUpManager.getActivePowerUps();

      // Should be a copy, not reference
      activePowerUps.set(PowerUpType.SHIELD, 1000);
      expect(powerUpManager.isActive(PowerUpType.SHIELD)).toBe(false);
    });

    it('should check if power-up is active', () => {
      powerUpManager.activate(PowerUpType.TRIPLE_SHOT);

      expect(powerUpManager.isActive(PowerUpType.TRIPLE_SHOT)).toBe(true);
      expect(powerUpManager.isActive(PowerUpType.SHIELD)).toBe(false);
    });

    it('should get remaining time', () => {
      powerUpManager.activate(PowerUpType.TRIPLE_SHOT);

      expect(powerUpManager.getRemainingTime(PowerUpType.TRIPLE_SHOT)).toBe(5000);
      expect(powerUpManager.getRemainingTime(PowerUpType.SHIELD)).toBe(0);
    });
  });

  describe('cleanup', () => {
    it('should clear all active power-ups', () => {
      powerUpManager.activate(PowerUpType.TRIPLE_SHOT);
      powerUpManager.activate(PowerUpType.SHIELD);

      powerUpManager.cleanup();

      expect(powerUpManager.getActivePowerUps().size).toBe(0);
    });
  });
});
