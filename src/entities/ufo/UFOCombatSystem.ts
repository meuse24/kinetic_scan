/**
 * UFOCombatSystem
 *
 * Manages UFO combat state: hit points, boss phases, damage calculation, regeneration.
 * Extracted from UFO.ts to separate combat logic from rendering and movement.
 */

export type UFOVariant = 'scout' | 'boss';
export type BossModifier = 'none' | 'shielded' | 'summoner' | 'berserk' | 'armored';

export interface CombatConfig {
  variant: UFOVariant;
  modifier?: BossModifier;
  maxHitPoints?: number;
}

export interface HitResult {
  destroyed: boolean;
  variant: UFOVariant;
  health: number;
  maxHealth: number;
}

/**
 * UFO Combat State Manager
 */
export class UFOCombatSystem {
  private variant: UFOVariant;
  private modifier: BossModifier;
  private maxHitPoints: number;
  private hitPoints: number;
  private displayHitPoints: number;
  private bossPhase: 1 | 2 | 3 = 1;
  private regenAccumulatorMs: number = 0;

  constructor(config: CombatConfig) {
    this.variant = config.variant;
    this.modifier = config.modifier ?? 'none';
    this.maxHitPoints = config.maxHitPoints ?? (config.variant === 'boss' ? 6 : 1);
    this.hitPoints = this.maxHitPoints;
    this.displayHitPoints = this.maxHitPoints;
    this.bossPhase = 1;
  }

  /**
   * Get current hit points
   */
  getHitPoints(): number {
    return this.hitPoints;
  }

  /**
   * Get maximum hit points
   */
  getMaxHitPoints(): number {
    return this.maxHitPoints;
  }

  /**
   * Get display hit points (smoothed for UI)
   */
  getDisplayHitPoints(): number {
    return this.displayHitPoints;
  }

  /**
   * Get current boss phase (1, 2, or 3 based on HP ratio)
   */
  getBossPhase(): 1 | 2 | 3 {
    return this.bossPhase;
  }

  /**
   * Get boss modifier
   */
  getModifier(): BossModifier {
    return this.modifier;
  }

  /**
   * Get variant
   */
  getVariant(): UFOVariant {
    return this.variant;
  }

  /**
   * Get berserk speed multiplier (for berserk modifier)
   */
  getBerserkScale(): number {
    if (this.modifier !== 'berserk') return 1;
    const hpRatio = this.hitPoints / Math.max(1, this.maxHitPoints);
    return 1 + (1 - hpRatio) * 0.6;
  }

  /**
   * Apply bullet damage
   * Returns hit result with destroyed flag and health info
   */
  applyDamage(damage: number, isActive: boolean): HitResult {
    if (!isActive) {
      return {
        destroyed: false,
        variant: this.variant,
        health: this.hitPoints,
        maxHealth: this.maxHitPoints,
      };
    }

    // Boss safety checks
    if (this.variant === 'boss') {
      if (!Number.isFinite(this.maxHitPoints) || this.maxHitPoints < 2) {
        this.maxHitPoints = 6;
      }
      if (!Number.isFinite(this.hitPoints) || this.hitPoints < 1) {
        this.hitPoints = this.maxHitPoints;
        this.displayHitPoints = this.maxHitPoints;
      }
    }

    // Apply damage with modifier
    const effectiveDamage = this.modifier === 'armored' ? damage * 0.5 : damage;
    const prevHitPoints = this.hitPoints;
    this.hitPoints = Math.max(0, prevHitPoints - effectiveDamage);
    this.displayHitPoints = prevHitPoints;

    // Update boss phase after damage
    if (this.variant === 'boss') {
      this.bossPhase = this.resolveBossPhase();
    }

    // Check if destroyed
    if (this.hitPoints <= 0) {
      return {
        destroyed: true,
        variant: this.variant,
        health: 0,
        maxHealth: this.maxHitPoints,
      };
    }

    return {
      destroyed: false,
      variant: this.variant,
      health: this.hitPoints,
      maxHealth: this.maxHitPoints,
    };
  }

  /**
   * Update combat state (boss phase, regeneration, display HP lerp)
   */
  update(delta: number): void {
    if (this.variant === 'boss') {
      // Update boss phase
      this.bossPhase = this.resolveBossPhase();

      // Smooth display HP
      const lerpToLiveHealth = Math.min(Math.max(delta * 0.012, 0.12), 0.28);
      this.displayHitPoints =
        this.displayHitPoints + (this.hitPoints - this.displayHitPoints) * lerpToLiveHealth;

      if (Math.abs(this.displayHitPoints - this.hitPoints) < 0.02) {
        this.displayHitPoints = this.hitPoints;
      }

      // Shielded: slow HP regen (0.2 HP/sec)
      if (this.modifier === 'shielded' && this.hitPoints < this.maxHitPoints) {
        this.regenAccumulatorMs += delta;
        if (this.regenAccumulatorMs >= 1000) {
          this.regenAccumulatorMs -= 1000;
          this.hitPoints = Math.min(this.maxHitPoints, this.hitPoints + 0.2);
        }
      }
    }
  }

  /**
   * Reset combat state for new spawn
   */
  reset(config: CombatConfig): void {
    this.variant = config.variant;
    this.modifier = config.modifier ?? 'none';
    this.maxHitPoints = config.maxHitPoints ?? (config.variant === 'boss' ? 6 : 1);
    this.hitPoints = this.maxHitPoints;
    this.displayHitPoints = this.maxHitPoints;
    this.bossPhase = 1;
    this.regenAccumulatorMs = 0;
  }

  /**
   * Resolve boss phase based on HP ratio
   */
  private resolveBossPhase(): 1 | 2 | 3 {
    if (this.maxHitPoints <= 0) return 1;
    const ratio = this.hitPoints / this.maxHitPoints;
    if (ratio <= 0.33) return 3;
    if (ratio <= 0.66) return 2;
    return 1;
  }
}
