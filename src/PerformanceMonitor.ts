import Phaser from 'phaser';

const WINDOW_SIZE = 120; // ~2 seconds at 60 FPS
const FPS_THRESHOLD = 55;

export const QualityLevel = {
  FULL: 4,
  NO_REFLECTION: 3,
  NO_CRT_HIGH_END: 2,
  NO_SMOKE: 1,
  NO_CRT: 0,
} as const;
export type QualityLevel = (typeof QualityLevel)[keyof typeof QualityLevel];

export class PerformanceMonitor {
  private samples: number[] = [];
  private sampleIndex = 0;
  private bufferFull = false;
  private stabilizing = false;
  private stabilizeCount = 0;
  private done = false;

  qualityLevel: QualityLevel = QualityLevel.FULL;
  reflectionEnabled = true;
  crtHighEndEnabled = true;
  smokeEnabled = true;
  crtEnabled = true;

  /** Call once during scene create to set initial flags based on device capabilities. */
  init(game: Phaser.Game) {
    const isDesktop = game.device.os.desktop;
    const isWebGL = game.renderer.type === Phaser.WEBGL;

    if (isDesktop && isWebGL) {
      // Start with everything on; the monitor will degrade if needed
      this.qualityLevel = QualityLevel.FULL;
      this.reflectionEnabled = true;
      this.crtHighEndEnabled = true;
      this.smokeEnabled = true;
      this.crtEnabled = true;
      this.done = false;
    } else {
      // Mobile / canvas: minimal VFX, no monitoring needed
      this.qualityLevel = QualityLevel.NO_CRT;
      this.reflectionEnabled = false;
      this.crtHighEndEnabled = false;
      this.smokeEnabled = false;
      this.crtEnabled = isWebGL; // CRT shader still works on mobile WebGL
      this.done = true;
    }

    this.samples = [];
    this.sampleIndex = 0;
    this.bufferFull = false;
    this.stabilizing = false;
    this.stabilizeCount = 0;
  }

  /** Call every frame from the main scene update. */
  update(game: Phaser.Game): boolean {
    if (this.done) return false;

    const fps = game.loop.actualFps;

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
        // Clear buffer so we get a fresh measurement
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
    if (this.qualityLevel <= QualityLevel.NO_CRT) {
      this.done = true;
      return false;
    }

    this.qualityLevel--;
    this.applyLevel();

    // Enter stabilization period
    this.stabilizing = true;
    this.stabilizeCount = 0;

    if (this.qualityLevel <= QualityLevel.NO_CRT) {
      this.done = true;
    }

    return true; // flag changed
  }

  private applyLevel() {
    this.reflectionEnabled = this.qualityLevel >= QualityLevel.FULL;
    this.crtHighEndEnabled = this.qualityLevel >= QualityLevel.NO_REFLECTION;
    this.smokeEnabled = this.qualityLevel >= QualityLevel.NO_CRT_HIGH_END;
    this.crtEnabled = this.qualityLevel >= QualityLevel.NO_SMOKE;
  }

  getQualityLabel(): string {
    return `Q${this.qualityLevel}`;
  }
}

export const performanceMonitor = new PerformanceMonitor();
