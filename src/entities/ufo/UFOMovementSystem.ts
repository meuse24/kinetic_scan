/**
 * UFOMovementSystem
 *
 * Manages UFO movement calculations for scout and boss variants.
 * Scout: Simple sine-wave horizontal movement
 * Boss: Complex sine-wave with bullet dodging and phase-based aggression
 *
 * Extracted from UFO.ts to separate movement logic from combat and rendering.
 */

export type UFOVariant = 'scout' | 'boss';

// Math helpers (avoid Phaser imports for testability)
const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);
const linear = (a: number, b: number, t: number) => a + (b - a) * t;

export interface MovementConfig {
  variant: UFOVariant;
  startX: number;
  startY: number;
  movementSeed: number;
  difficultyLevel: number;
  reducedVisualDetail?: boolean;
}

export interface MovementState {
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  travelDir: number;
  startY: number;
}

// Minimal threat interface (avoid Phaser import)
export interface EvasionThreat {
  active: boolean;
  x: number;
  y: number;
  body?: {
    velocity: { x: number; y: number };
  };
}

export interface EvasionThreats {
  getChildren(): EvasionThreat[];
}

/**
 * UFO Movement Calculator
 */
export class UFOMovementSystem {
  private startX: number;
  private startY: number;
  private movementSeed: number;
  private difficultyLevel: number;
  private reducedVisualDetail: boolean;
  private travelDir: number = 1;

  // Boss dodge state
  private dodgeRefreshMs: number = 0;
  private cachedDodgeOffset: number = 0;

  constructor(config: MovementConfig) {
    this.startX = config.startX;
    this.startY = config.startY;
    this.movementSeed = config.movementSeed;
    this.difficultyLevel = config.difficultyLevel;
    this.reducedVisualDetail = config.reducedVisualDetail ?? false;
  }

  /**
   * Calculate next movement state for scout variant
   */
  updateScout(
    currentX: number,
    _currentY: number,
    timeAlive: number,
    sceneWidth: number,
  ): MovementState {
    const horizontalSpeed = 80 + this.difficultyLevel * 2;
    const velocityX = horizontalSpeed * this.travelDir;

    // Simple sine wave vertical movement
    const yOffset = Math.sin(timeAlive * 1.9 + this.movementSeed) * 48;
    const targetY = this.startY + yOffset;

    // Reverse direction at boundaries
    if (currentX < 90) this.travelDir = 1;
    else if (currentX > sceneWidth - 90) this.travelDir = -1;

    return {
      x: currentX,
      y: targetY,
      velocityX,
      velocityY: 0,
      travelDir: this.travelDir,
      startY: this.startY,
    };
  }

  /**
   * Calculate next movement state for boss variant
   */
  updateBoss(
    currentX: number,
    currentY: number,
    timeAlive: number,
    delta: number,
    time: number,
    phase: 1 | 2 | 3,
    sceneWidth: number,
    sceneHeight: number,
    evasionThreats?: EvasionThreats,
  ): MovementState {
    const phaseAggression = 1 + (phase - 1) * 0.22;
    const amplitudeX = (85 + this.difficultyLevel * 3) * phaseAggression;

    // Update dodge offset periodically
    this.dodgeRefreshMs -= delta;
    if (this.dodgeRefreshMs <= 0) {
      this.cachedDodgeOffset = this.computeDodgeOffset(currentX, currentY, phase, evasionThreats);
      this.dodgeRefreshMs = phase === 3 ? 52 : phase === 2 ? 64 : 78;
    }

    // Calculate target X with sine wave + dodge
    const targetX = clamp(
      this.startX +
        Math.sin(timeAlive * 1.35 + this.movementSeed) * amplitudeX +
        this.cachedDodgeOffset,
      125,
      sceneWidth - 125,
    );

    // Lerp to target X (smoother movement)
    const newX = linear(currentX, targetX, 0.085 + (phase - 1) * 0.015);

    // Calculate Y with double sine wave
    const yWave =
      Math.sin(timeAlive * (1.95 + (phase - 1) * 0.2) + this.movementSeed * 0.5) * 52 +
      Math.cos(timeAlive * 0.85 + this.movementSeed) * 14;
    const newY = this.startY + yWave;

    // Update travel direction at boundaries
    if (newX < 140) this.travelDir = 1;
    else if (newX > sceneWidth - 140) this.travelDir = -1;

    // Periodically adjust startY
    let updatedStartY = this.startY;
    if (Math.floor(time / 2400) % 2 === 0) {
      updatedStartY = clamp(
        this.startY + Math.sin(time * 0.0007 + this.movementSeed) * (0.65 + (phase - 1) * 0.35),
        120,
        sceneHeight * 0.55,
      );
    }

    return {
      x: newX,
      y: newY,
      velocityX: 0,
      velocityY: 0,
      travelDir: this.travelDir,
      startY: updatedStartY,
    };
  }

  /**
   * Reset movement state
   */
  reset(config: MovementConfig): void {
    this.startX = config.startX;
    this.startY = config.startY;
    this.movementSeed = config.movementSeed;
    this.difficultyLevel = config.difficultyLevel;
    this.reducedVisualDetail = config.reducedVisualDetail ?? false;
    this.travelDir = 1;
    this.dodgeRefreshMs = 0;
    this.cachedDodgeOffset = 0;
  }

  /**
   * Compute dodge offset based on nearby threats (bullets)
   */
  private computeDodgeOffset(
    currentX: number,
    currentY: number,
    phase: 1 | 2 | 3,
    evasionThreats?: EvasionThreats,
  ): number {
    if (!evasionThreats) return 0;

    const bulletChildren = evasionThreats.getChildren();
    let dodgeAccumulator = 0;
    let considered = 0;
    const maxDistanceSq = 290 * 290;
    const maxSamples = this.reducedVisualDetail ? 8 : 14;

    for (const bullet of bulletChildren) {
      if (!bullet.active) continue;
      const body = bullet.body;
      if (!body || body.velocity.y >= 0) continue; // Only dodge upward-moving bullets

      const dx = bullet.x - currentX;
      const dy = bullet.y - currentY;
      if (dy < -210 || dy > 230) continue; // Ignore bullets too far vertically

      const distSq = dx * dx + dy * dy;
      if (distSq > maxDistanceSq) continue; // Too far

      const pressure = 1 - distSq / maxDistanceSq;
      dodgeAccumulator += (dx < 0 ? 1 : -1) * pressure; // Dodge away from bullet
      considered += 1;
      if (considered >= maxSamples) break;
    }

    if (considered === 0) return 0;

    const baseDodge = 20 + (phase - 1) * 9 + this.difficultyLevel * 1.4;
    const scaled = (dodgeAccumulator / considered) * baseDodge;
    return clamp(scaled, -72, 72);
  }
}
