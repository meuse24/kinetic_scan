/**
 * SpawnTimer
 *
 * Reusable timer utility for periodic spawning logic.
 * This pattern is repeated 4+ times in MainScene for different spawn types:
 * - Wormhole spawning
 * - Elite Drone spawning
 * - Background Decor spawning
 * - Swarm spawning
 */

export interface SpawnTimerConfig {
  /** Minimum interval in milliseconds */
  minIntervalMs: number;
  /** Maximum interval in milliseconds */
  maxIntervalMs: number;
  /** If true, timer automatically resets after triggering */
  autoReset?: boolean;
}

export class SpawnTimer {
  private timer: number = 0;
  private config: SpawnTimerConfig;

  constructor(config: SpawnTimerConfig) {
    this.config = {
      ...config,
      autoReset: config.autoReset ?? true,
    };
    this.reset();
  }

  /**
   * Update the timer. Returns true when it's time to spawn.
   * @param delta - Time elapsed in milliseconds
   * @returns true if timer reached zero (spawn trigger)
   */
  update(delta: number): boolean {
    this.timer -= delta;

    if (this.timer <= 0) {
      if (this.config.autoReset) {
        this.reset();
      }
      return true; // Time to spawn!
    }

    return false;
  }

  /**
   * Reset the timer to a random interval within the configured range
   */
  reset(): void {
    this.timer = this.randomInterval();
  }

  /**
   * Force the timer to trigger on next update
   */
  forceSpawn(): void {
    this.timer = 0;
  }

  /**
   * Get the current timer value in milliseconds
   */
  getRemaining(): number {
    return Math.max(0, this.timer);
  }

  /**
   * Set the timer to a specific value
   */
  setTimer(ms: number): void {
    this.timer = ms;
  }

  /**
   * Check if timer is ready to spawn without consuming the trigger
   */
  isReady(): boolean {
    return this.timer <= 0;
  }

  /**
   * Generate a random interval within the configured range
   */
  private randomInterval(): number {
    const min = this.config.minIntervalMs;
    const max = this.config.maxIntervalMs;
    return Math.random() * (max - min) + min;
  }
}
