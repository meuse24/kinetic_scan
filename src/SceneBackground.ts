import Phaser from 'phaser';

const BACKGROUND_TEXTURE_KEY = 'scene_background_image';
const BACKGROUND_IMAGE_URL = new URL('../background.jpg', import.meta.url).href;

type SceneBackgroundOptions = {
  depth?: number;
  alpha?: number;
  maxOffsetX?: number;
  maxOffsetY?: number;
  idleRetargetMinMs?: number;
  idleRetargetMaxMs?: number;
  idleSmoothing?: number;
  followSmoothing?: number;
  velocitySmoothing?: number;
  gameplayVelocityInfluenceX?: number;
  gameplayVelocityInfluenceY?: number;
  gameplayPositionInfluenceX?: number;
  gameplayPositionInfluenceY?: number;
};

const DEFAULT_OPTIONS: Required<SceneBackgroundOptions> = {
  depth: -100,
  alpha: 0.42,
  maxOffsetX: 44,
  maxOffsetY: 30,
  idleRetargetMinMs: 5200,
  idleRetargetMaxMs: 11800,
  idleSmoothing: 0.48,
  followSmoothing: 3.6,
  velocitySmoothing: 4.8,
  gameplayVelocityInfluenceX: 24,
  gameplayVelocityInfluenceY: 18,
  gameplayPositionInfluenceX: 8,
  gameplayPositionInfluenceY: 6,
};

export default class SceneBackground {
  static preload(scene: Phaser.Scene) {
    if (scene.textures.exists(BACKGROUND_TEXTURE_KEY)) return;
    scene.load.image(BACKGROUND_TEXTURE_KEY, BACKGROUND_IMAGE_URL);
  }

  private scene: Phaser.Scene;
  private options: Required<SceneBackgroundOptions>;
  private image: Phaser.GameObjects.Image;
  private centerX: number = 0;
  private centerY: number = 0;
  private offsetLimitX: number = 0;
  private offsetLimitY: number = 0;
  private offsetX: number = 0;
  private offsetY: number = 0;
  private targetX: number = 0;
  private targetY: number = 0;
  private idleRetargetInMs: number = 0;
  private lastPlayerX: number = 0;
  private lastPlayerY: number = 0;
  private hasPlayerSample: boolean = false;
  private smoothedVelX: number = 0;
  private smoothedVelY: number = 0;
  private isDestroyed: boolean = false;
  private onResizeBound: () => void;

  constructor(scene: Phaser.Scene, options: SceneBackgroundOptions = {}) {
    this.scene = scene;
    this.options = { ...DEFAULT_OPTIONS, ...options };

    const textureKey = scene.textures.exists(BACKGROUND_TEXTURE_KEY)
      ? BACKGROUND_TEXTURE_KEY
      : this.createFallbackTexture();
    this.image = scene.add
      .image(scene.scale.width / 2, scene.scale.height / 2, textureKey)
      .setDepth(this.options.depth)
      .setAlpha(this.options.alpha)
      .setScrollFactor(0);

    this.onResizeBound = () => this.relayout();
    scene.scale.on(Phaser.Scale.Events.RESIZE, this.onResizeBound);

    this.relayout();
    this.pickNextIdleTarget();
  }

  updateIdle(deltaMs: number) {
    if (this.isDestroyed) return;
    const clampedDeltaMs = Math.min(Math.max(deltaMs, 0), 80);
    const deltaSec = clampedDeltaMs / 1000;

    this.idleRetargetInMs -= clampedDeltaMs;
    if (this.idleRetargetInMs <= 0) {
      this.pickNextIdleTarget();
    }

    const blend = 1 - Math.exp(-this.options.idleSmoothing * deltaSec);
    this.offsetX = Phaser.Math.Linear(this.offsetX, this.targetX, blend);
    this.offsetY = Phaser.Math.Linear(this.offsetY, this.targetY, blend);
    this.applyOffset();
  }

  updatePlayerDriven(deltaMs: number, playerX: number, playerY: number) {
    if (this.isDestroyed) return;
    const clampedDeltaMs = Math.min(Math.max(deltaMs, 0), 80);
    const deltaSec = Math.max(clampedDeltaMs / 1000, 1 / 120);

    if (!this.hasPlayerSample) {
      this.lastPlayerX = playerX;
      this.lastPlayerY = playerY;
      this.hasPlayerSample = true;
    }

    const rawVelX = (playerX - this.lastPlayerX) / deltaSec;
    const rawVelY = (playerY - this.lastPlayerY) / deltaSec;
    this.lastPlayerX = playerX;
    this.lastPlayerY = playerY;

    const normalizedVelX = Phaser.Math.Clamp(rawVelX / 460, -1, 1);
    const normalizedVelY = Phaser.Math.Clamp(rawVelY / 460, -1, 1);
    const velocityBlend = 1 - Math.exp(-this.options.velocitySmoothing * deltaSec);
    this.smoothedVelX = Phaser.Math.Linear(this.smoothedVelX, normalizedVelX, velocityBlend);
    this.smoothedVelY = Phaser.Math.Linear(this.smoothedVelY, normalizedVelY, velocityBlend);

    const posNormX = Phaser.Math.Clamp(
      (playerX - this.centerX) / (this.scene.scale.width * 0.5),
      -1,
      1,
    );
    const posNormY = Phaser.Math.Clamp(
      (playerY - this.centerY) / (this.scene.scale.height * 0.5),
      -1,
      1,
    );

    const desiredX =
      this.smoothedVelX * this.options.gameplayVelocityInfluenceX +
      posNormX * this.options.gameplayPositionInfluenceX;
    const desiredY =
      this.smoothedVelY * this.options.gameplayVelocityInfluenceY +
      posNormY * this.options.gameplayPositionInfluenceY;

    this.targetX = Phaser.Math.Clamp(desiredX, -this.offsetLimitX, this.offsetLimitX);
    this.targetY = Phaser.Math.Clamp(desiredY, -this.offsetLimitY, this.offsetLimitY);

    const followBlend = 1 - Math.exp(-this.options.followSmoothing * deltaSec);
    this.offsetX = Phaser.Math.Linear(this.offsetX, this.targetX, followBlend);
    this.offsetY = Phaser.Math.Linear(this.offsetY, this.targetY, followBlend);
    this.applyOffset();
  }

  resetPlayerTracking(playerX: number, playerY: number) {
    this.lastPlayerX = playerX;
    this.lastPlayerY = playerY;
    this.hasPlayerSample = true;
    this.smoothedVelX = 0;
    this.smoothedVelY = 0;
  }

  destroy() {
    if (this.isDestroyed) return;
    this.isDestroyed = true;
    this.scene.scale.off(Phaser.Scale.Events.RESIZE, this.onResizeBound);
    this.image.destroy();
  }

  private createFallbackTexture() {
    const key = 'scene_background_fallback';
    if (this.scene.textures.exists(key)) return key;
    const g = this.scene.make.graphics({ x: 0, y: 0 });
    g.fillStyle(0x0a1221, 1);
    g.fillRect(0, 0, 4, 4);
    g.generateTexture(key, 4, 4);
    g.destroy();
    return key;
  }

  private relayout() {
    const width = this.scene.scale.width;
    const height = this.scene.scale.height;
    this.centerX = width * 0.5;
    this.centerY = height * 0.5;

    const targetOffsetX = this.options.maxOffsetX;
    const targetOffsetY = this.options.maxOffsetY;
    const requiredWidth = width + targetOffsetX * 2 + 2;
    const requiredHeight = height + targetOffsetY * 2 + 2;

    const texture = this.scene.textures.get(this.image.texture.key);
    const source = texture.getSourceImage() as { width: number; height: number };
    const scale = Math.max(requiredWidth / source.width, requiredHeight / source.height);
    const displayWidth = source.width * scale;
    const displayHeight = source.height * scale;
    this.image.setDisplaySize(displayWidth, displayHeight);

    const maxCropX = Math.max(0, (displayWidth - width) * 0.5 - 1);
    const maxCropY = Math.max(0, (displayHeight - height) * 0.5 - 1);
    this.offsetLimitX = Math.min(targetOffsetX, maxCropX);
    this.offsetLimitY = Math.min(targetOffsetY, maxCropY);

    this.offsetX = Phaser.Math.Clamp(this.offsetX, -this.offsetLimitX, this.offsetLimitX);
    this.offsetY = Phaser.Math.Clamp(this.offsetY, -this.offsetLimitY, this.offsetLimitY);
    this.targetX = Phaser.Math.Clamp(this.targetX, -this.offsetLimitX, this.offsetLimitX);
    this.targetY = Phaser.Math.Clamp(this.targetY, -this.offsetLimitY, this.offsetLimitY);
    this.applyOffset();
  }

  private pickNextIdleTarget() {
    const idleLimitX = this.offsetLimitX * 0.92;
    const idleLimitY = this.offsetLimitY * 0.92;
    this.targetX = Phaser.Math.FloatBetween(-idleLimitX, idleLimitX);
    this.targetY = Phaser.Math.FloatBetween(-idleLimitY, idleLimitY);
    this.idleRetargetInMs = Phaser.Math.Between(
      this.options.idleRetargetMinMs,
      this.options.idleRetargetMaxMs,
    );
  }

  private applyOffset() {
    const clampedX = Phaser.Math.Clamp(this.offsetX, -this.offsetLimitX, this.offsetLimitX);
    const clampedY = Phaser.Math.Clamp(this.offsetY, -this.offsetLimitY, this.offsetLimitY);
    this.offsetX = clampedX;
    this.offsetY = clampedY;
    // Offset represents the sampled area in source space. Move the image inverse to that offset.
    this.image.setPosition(this.centerX - clampedX, this.centerY - clampedY);
  }
}
