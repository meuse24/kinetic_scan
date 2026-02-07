import Phaser from 'phaser';

const WINDOW_SIZE = 60; // ~1 second at 60 FPS
const FPS_THRESHOLD = 55;
const CRITICAL_FPS = 35;
const EARLY_SAMPLE_COUNT = 20;

export const QualityLevel = {
  FULL: 5,
  NO_REFLECTION: 4,
  NO_CRT_HIGH_END: 3,
  NO_SMOKE: 2,
  NO_CRT: 1,
  MINIMAL: 0,
} as const;
export type QualityLevel = (typeof QualityLevel)[keyof typeof QualityLevel];

export class PerformanceMonitor {
  private samples: number[] = [];
  private sampleIndex = 0;
  private bufferFull = false;
  private stabilizing = false;
  private stabilizeCount = 0;
  private done = false;
  private initialized = false;
  private totalFrames = 0;

  qualityLevel: QualityLevel = QualityLevel.FULL;
  reflectionEnabled = true;
  crtHighEndEnabled = true;
  smokeEnabled = true;
  crtEnabled = true;
  reducedParticles = false;

  /** Call once to set initial flags based on device capabilities. Subsequent calls are no-ops. */
  init(game: Phaser.Game) {
    if (this.initialized) return;
    this.initialized = true;

    const isDesktop = game.device.os.desktop;
    const isWebGL = game.renderer.type === Phaser.WEBGL;

    if (isDesktop && isWebGL) {
      this.qualityLevel = QualityLevel.FULL;
      this.applyLevel();
      this.done = false;
    } else {
      // Mobile / canvas: minimal VFX, no monitoring needed
      this.qualityLevel = QualityLevel.MINIMAL;
      this.applyLevel();
      this.crtEnabled = isWebGL; // CRT shader still works on mobile WebGL
      this.done = true;
    }
  }

  /** Call every frame from a scene update. Returns true if quality flags changed. */
  update(game: Phaser.Game): boolean {
    if (!this.initialized) this.init(game);
    if (this.done) return false;

    const fps = game.loop.actualFps;
    this.totalFrames++;

    // Fast path: if FPS is critically low in the first few frames, skip multiple levels
    if (this.totalFrames <= EARLY_SAMPLE_COUNT && fps > 0 && fps < CRITICAL_FPS) {
      return this.dropToLevel(QualityLevel.NO_CRT);
    }

    // Write into circular buffer
    if (this.samples.length < WINDOW_SIZE) {
      this.samples.push(fps);
    } else {
      this.samples[this.sampleIndex] = fps;
    }
    this.sampleIndex = (this.sampleIndex + 1) % WINDOW_SIZE;

    if (!this.bufferFull) {
      if (this.samples.length >= WINDOW_SIZE) {
        this.bufferFull = true;
      }
      return false;
    }

    // After a downgrade, skip one full window to let FPS stabilize
    if (this.stabilizing) {
      this.stabilizeCount++;
      if (this.stabilizeCount >= WINDOW_SIZE) {
        this.stabilizing = false;
        this.stabilizeCount = 0;
        this.bufferFull = false;
        this.samples = [];
        this.sampleIndex = 0;
      }
      return false;
    }

    // Calculate average
    let sum = 0;
    for (let i = 0; i < WINDOW_SIZE; i++) {
      sum += this.samples[i];
    }
    const avg = sum / WINDOW_SIZE;

    if (avg < FPS_THRESHOLD) {
      return this.downgrade();
    }

    return false;
  }

  private downgrade(): boolean {
    if (this.qualityLevel <= QualityLevel.MINIMAL) {
      this.done = true;
      return false;
    }

    this.qualityLevel--;
    this.applyLevel();

    this.stabilizing = true;
    this.stabilizeCount = 0;

    if (this.qualityLevel <= QualityLevel.MINIMAL) {
      this.done = true;
    }

    return true;
  }

  /** Jump directly to a specific level (for fast degradation). */
  private dropToLevel(target: QualityLevel): boolean {
    if (this.qualityLevel <= target) return false;
    this.qualityLevel = target;
    this.applyLevel();

    // Reset sampling after a big jump
    this.stabilizing = true;
    this.stabilizeCount = 0;
    this.bufferFull = false;
    this.samples = [];
    this.sampleIndex = 0;

    if (this.qualityLevel <= QualityLevel.MINIMAL) {
      this.done = true;
    }

    return true;
  }

  private applyLevel() {
    this.reflectionEnabled = this.qualityLevel >= QualityLevel.FULL;
    this.crtHighEndEnabled = this.qualityLevel >= QualityLevel.NO_REFLECTION;
    this.smokeEnabled = this.qualityLevel >= QualityLevel.NO_CRT_HIGH_END;
    this.crtEnabled = this.qualityLevel >= QualityLevel.NO_SMOKE;
    this.reducedParticles = this.qualityLevel <= QualityLevel.MINIMAL;
  }

  getQualityLabel(): string {
    return `Q${this.qualityLevel}`;
  }
}

export const performanceMonitor = new PerformanceMonitor();
