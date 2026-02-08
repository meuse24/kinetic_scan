import Phaser from 'phaser';

const WINDOW_SIZE = 60; // ~1 second at 60 FPS
const FPS_THRESHOLD = 55;
const CRITICAL_FPS = 35;
const EARLY_SAMPLE_COUNT = 20;
const CRT_PREF_STORAGE_KEY = 'spaceShooterCrtEnabled';

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
  private crtSupported = false;
  private crtAllowOnMinimal = false;
  private crtUserEnabled = true;

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
    this.crtSupported = isWebGL;
    this.crtAllowOnMinimal = !isDesktop && isWebGL;
    this.loadCrtUserPreference();

    if (isDesktop && isWebGL) {
      this.qualityLevel = QualityLevel.FULL;
      this.applyLevel();
      this.done = false;
    } else {
      // Mobile / canvas: minimal VFX, no monitoring needed
      this.qualityLevel = QualityLevel.MINIMAL;
      this.applyLevel();
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
    const qualityAllowsCrt = this.qualityLevel >= QualityLevel.NO_SMOKE || this.crtAllowOnMinimal;
    this.crtEnabled = this.crtSupported && this.crtUserEnabled && qualityAllowsCrt;
    this.reducedParticles = this.qualityLevel <= QualityLevel.MINIMAL;
  }

  isCrtSupported(): boolean {
    return this.crtSupported;
  }

  isCrtUserEnabled(): boolean {
    return this.crtUserEnabled;
  }

  setCrtUserEnabled(enabled: boolean): boolean {
    this.crtUserEnabled = Boolean(enabled);
    this.saveCrtUserPreference();
    this.applyLevel();
    return this.crtEnabled;
  }

  toggleCrtUserEnabled(): boolean {
    return this.setCrtUserEnabled(!this.crtUserEnabled);
  }

  private loadCrtUserPreference() {
    try {
      const raw = localStorage.getItem(CRT_PREF_STORAGE_KEY);
      if (raw === null) return;
      this.crtUserEnabled = raw !== '0';
    } catch {
      // ignore unavailable storage
    }
  }

  private saveCrtUserPreference() {
    try {
      localStorage.setItem(CRT_PREF_STORAGE_KEY, this.crtUserEnabled ? '1' : '0');
    } catch {
      // ignore unavailable storage
    }
  }

  getQualityLabel(): string {
    return `Q${this.qualityLevel}`;
  }

  getCurrentFps(game: Phaser.Game): number {
    const fps = game.loop.actualFps;
    if (!Number.isFinite(fps) || fps <= 0) return 60;
    return fps;
  }

  getFxBudgetScale(game: Phaser.Game): number {
    const fps = this.getCurrentFps(game);
    let scale = 1;
    if (fps < 58) scale = 0.92;
    if (fps < 54) scale = 0.8;
    if (fps < 50) scale = 0.68;
    if (fps < 44) scale = 0.55;
    if (fps < 38) scale = 0.42;
    if (this.reducedParticles) {
      scale = Math.min(scale, 0.62);
    }
    return Phaser.Math.Clamp(scale, 0.28, 1);
  }

  getFxIntervalScale(game: Phaser.Game): number {
    const fps = this.getCurrentFps(game);
    let scale = 1;
    if (fps < 58) scale = 1.08;
    if (fps < 54) scale = 1.22;
    if (fps < 50) scale = 1.4;
    if (fps < 44) scale = 1.65;
    if (fps < 38) scale = 1.95;
    if (this.reducedParticles) {
      scale = Math.max(scale, 1.45);
    }
    return scale;
  }

  scaleFxCount(game: Phaser.Game, baseCount: number, minCount: number = 1): number {
    const scaled = Math.round(baseCount * this.getFxBudgetScale(game));
    return Phaser.Math.Clamp(scaled, Math.max(1, minCount), Math.max(1, baseCount));
  }
}

export const performanceMonitor = new PerformanceMonitor();
