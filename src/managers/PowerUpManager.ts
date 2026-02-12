/**
 * PowerUpManager
 *
 * Manages power-up activation, timers, and coordination.
 * Delegates entity spawning (Drones, BlackHole, etc.) to callbacks
 * for clean separation of concerns.
 *
 * Extracted from MainScene (lines 1852-1971, 2713-2970, 3028-3378)
 * Reduces MainScene by ~500 lines
 */

import { PowerUpType } from '../types/PowerUpType';

export interface PowerUpCallbacks {
  // Player effect callbacks
  onTripleShotChanged: (active: boolean) => void;
  onSlowMotionChanged: (active: boolean) => void;
  onShieldChanged: (active: boolean) => void;
  onGhostPhaseChanged: (active: boolean, silent: boolean) => void;
  onCannonCoolingChanged: (active: boolean) => void;
  onBlackHoleVisualChanged: (active: boolean) => void;

  // Entity spawn/remove callbacks
  onDronesSpawn: () => void;
  onDronesRemove: () => void;
  onBlackHoleSpawn: () => void;
  onBlackHoleRemove: () => void;
  onShieldBunkersSpawn: () => void;
  onShieldBunkersRemove: () => void;

  // Special effect callbacks
  onEMPTrigger: () => void;
  onMineChargesAdd: (charges: number) => void;

  // Audio callbacks
  onPowerUpAudioPlay: (type: PowerUpType) => void;

  // State sync callback
  onActivePowerUpsChanged: (activePowerUps: Map<PowerUpType, number>) => void;
}

export interface PowerUpManagerConfig {
  /** Get power-up duration in ms for a given type */
  getDuration: (type: PowerUpType) => number;
}

/**
 * PowerUpManager handles power-up timer management and activation/deactivation coordination
 */
export class PowerUpManager {
  private callbacks: PowerUpCallbacks;
  private config: PowerUpManagerConfig;

  // Active power-ups with remaining time in milliseconds
  private activePowerUps: Map<PowerUpType, number> = new Map();

  // State sync throttle
  private stateSyncMs: number = 0;

  constructor(callbacks: PowerUpCallbacks, config: PowerUpManagerConfig) {
    this.callbacks = callbacks;
    this.config = config;
  }

  /**
   * Activate a power-up
   */
  activate(type: PowerUpType): void {
    // MINE_LAYER is instant (adds charges, no timer)
    if (type === PowerUpType.MINE_LAYER) {
      this.callbacks.onMineChargesAdd(1);
      this.callbacks.onPowerUpAudioPlay(type);
      return;
    }

    // Set timer
    const duration = this.config.getDuration(type);
    this.activePowerUps.set(type, duration);
    this.notifyStateChanged();

    // Trigger activation effects
    this.applyPowerUpEffects(type, true, false);
    this.callbacks.onPowerUpAudioPlay(type);
  }

  /**
   * Deactivate a power-up
   */
  deactivate(type: PowerUpType): void {
    this.activePowerUps.delete(type);
    this.applyPowerUpEffects(type, false, false);
    this.notifyStateChanged();
  }

  /**
   * Update all active power-up timers
   */
  update(delta: number): void {
    let powerUpSetChanged = false;

    // Update timers
    this.activePowerUps.forEach((timeLeft, type) => {
      const newTime = timeLeft - delta;
      if (newTime <= 0) {
        this.activePowerUps.delete(type);
        this.applyPowerUpEffects(type, false, false);
        powerUpSetChanged = true;
      } else {
        this.activePowerUps.set(type, newTime);
      }
    });

    // Throttled state sync
    this.stateSyncMs -= delta;
    if (powerUpSetChanged || this.stateSyncMs <= 0) {
      this.notifyStateChanged();
      this.stateSyncMs = 180;
    }
  }

  /**
   * Re-apply all active power-up effects (used after player switch)
   */
  reapplyAll(silent: boolean = false): void {
    this.callbacks.onTripleShotChanged(this.activePowerUps.has(PowerUpType.TRIPLE_SHOT));
    this.callbacks.onShieldChanged(this.activePowerUps.has(PowerUpType.SHIELD));
    this.callbacks.onCannonCoolingChanged(this.activePowerUps.has(PowerUpType.CANNON_COOLING));
    this.callbacks.onSlowMotionChanged(this.activePowerUps.has(PowerUpType.SLOW_MOTION));
    this.callbacks.onBlackHoleVisualChanged(this.activePowerUps.has(PowerUpType.BLACK_HOLE));

    // Ghost Phase
    if (this.activePowerUps.has(PowerUpType.GHOST_PHASE)) {
      this.callbacks.onGhostPhaseChanged(true, silent);
    } else {
      this.callbacks.onGhostPhaseChanged(false, true);
    }

    // Slow Motion (physics)
    if (this.activePowerUps.has(PowerUpType.SLOW_MOTION)) {
      this.callbacks.onSlowMotionChanged(true);
    } else {
      this.callbacks.onSlowMotionChanged(false);
    }

    // Drones
    if (this.activePowerUps.has(PowerUpType.WINGMAN_DRONES)) {
      this.callbacks.onDronesSpawn();
    } else {
      this.callbacks.onDronesRemove();
    }

    // Black Hole
    if (this.activePowerUps.has(PowerUpType.BLACK_HOLE)) {
      this.callbacks.onBlackHoleSpawn();
    } else {
      this.callbacks.onBlackHoleRemove();
    }

    // Shield Bunkers
    if (this.activePowerUps.has(PowerUpType.SHIELD_BUNKER)) {
      this.callbacks.onShieldBunkersSpawn();
    } else {
      this.callbacks.onShieldBunkersRemove();
    }
  }

  /**
   * Load active power-ups from saved state
   */
  loadState(activePowerUps: Map<PowerUpType, number>): void {
    this.activePowerUps = new Map(activePowerUps);
    this.stateSyncMs = 0;
  }

  /**
   * Get current active power-ups map
   */
  getActivePowerUps(): Map<PowerUpType, number> {
    return new Map(this.activePowerUps);
  }

  /**
   * Check if a specific power-up is active
   */
  isActive(type: PowerUpType): boolean {
    return this.activePowerUps.has(type);
  }

  /**
   * Get remaining time for a power-up (0 if not active)
   */
  getRemainingTime(type: PowerUpType): number {
    return this.activePowerUps.get(type) ?? 0;
  }

  /**
   * Cleanup (called on scene shutdown)
   */
  cleanup(): void {
    this.activePowerUps.clear();
  }

  /**
   * Apply power-up activation/deactivation effects
   */
  private applyPowerUpEffects(type: PowerUpType, activate: boolean, silent: boolean): void {
    switch (type) {
      case PowerUpType.TRIPLE_SHOT:
        this.callbacks.onTripleShotChanged(activate);
        break;

      case PowerUpType.SLOW_MOTION:
        this.callbacks.onSlowMotionChanged(activate);
        break;

      case PowerUpType.SHIELD:
        this.callbacks.onShieldChanged(activate);
        break;

      case PowerUpType.EMP_WAVE:
        if (activate) this.callbacks.onEMPTrigger();
        break;

      case PowerUpType.GHOST_PHASE:
        this.callbacks.onGhostPhaseChanged(activate, silent);
        break;

      case PowerUpType.WINGMAN_DRONES:
        if (activate) this.callbacks.onDronesSpawn();
        else this.callbacks.onDronesRemove();
        break;

      case PowerUpType.CANNON_COOLING:
        this.callbacks.onCannonCoolingChanged(activate);
        break;

      case PowerUpType.BLACK_HOLE:
        this.callbacks.onBlackHoleVisualChanged(activate);
        if (activate) this.callbacks.onBlackHoleSpawn();
        else this.callbacks.onBlackHoleRemove();
        break;

      case PowerUpType.SHIELD_BUNKER:
        if (activate) this.callbacks.onShieldBunkersSpawn();
        else this.callbacks.onShieldBunkersRemove();
        break;

      case PowerUpType.MINE_LAYER:
        // Handled in activate() - no deactivation needed
        break;
    }
  }

  /**
   * Notify callbacks that active power-ups have changed
   */
  private notifyStateChanged(): void {
    this.callbacks.onActivePowerUpsChanged(this.getActivePowerUps());
  }
}
