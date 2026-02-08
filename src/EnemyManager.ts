import Phaser from 'phaser';
import { getDifficultyPreset } from './Difficulty';
import type { DifficultyPreset } from './Difficulty';
import { performanceMonitor } from './PerformanceMonitor';

const INITIAL_SPAWN_INTERVAL = 1000;
const MIN_SPAWN_INTERVAL = 220;
const PRESSURE_BACKOFF_MAX = 900;
const ACTIVE_ENEMY_CAP = 52;
const ACTIVE_ENEMY_CAP_REDUCED = 36;
const FRAGMENT_CAP_BUFFER = 8;
const OFFSCREEN_CULL_INTERVAL_MS = 64;

export class Enemy extends Phaser.Physics.Arcade.Sprite {
  public swarmId: number = 0;
  public swarmTotal: number = 0;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, 'asteroid_0');
  }

  /**
   * Spawns the asteroid.
   * @param x X Position
   * @param y Y Position
   * @param scale Optional: Specific scale (for fragments)
   * @param velocityX Optional: Specific velocity X (for fragments)
   * @param velocityY Optional: Specific velocity Y (for fragments)
   */
  spawn(
    x: number,
    y: number,
    scale?: number,
    velocityX?: number,
    velocityY?: number,
    difficultyScale: number = 1,
  ) {
    // 1. Texture & Scale
    if (scale !== undefined) {
      // Fragment Mode: Use passed scale and keep current texture if desired,
      // but here we pick a random texture for variety even for fragments
      const textureKey = `asteroid_${Phaser.Math.Between(0, 4)}`;
      this.setTexture(textureKey);
      this.setScale(scale);
    } else {
      // New Asteroid Mode: Random texture and random scale (0.5 to 2.0)
      const textureKey = `asteroid_${Phaser.Math.Between(0, 4)}`;
      this.setTexture(textureKey);
      this.setScale(Phaser.Math.FloatBetween(0.5, 2.0));
    }

    this.swarmId = 0;
    this.swarmTotal = 0;

    // 2. Physics Body & Offset
    this.enableBody(true, x, y, true, true);

    // CENTER THE BODY:
    // Texture is 64x64. Center is 32,32.
    // We want a radius of approx 28 (fits well).
    // Offset needs to shift the circle center to the sprite center.
    // Offset = Center - Radius = 32 - 28 = 4.
    this.setCircle(28);
    this.setOffset(4, 4);

    // 3. Movement
    if (velocityX !== undefined && velocityY !== undefined) {
      // Fragment Mode: Use explosive velocity
      const fragmentSpeedScale = Phaser.Math.Clamp(0.9 + (difficultyScale - 1) * 0.3, 0.8, 1.8);
      this.setVelocity(velocityX * fragmentSpeedScale, velocityY * fragmentSpeedScale);
    } else {
      // Standard Mode: Fall down with parallax speed
      // Scale 0.5 (small) -> Fast (400)
      // Scale 2.0 (big)   -> Slow (100)
      const currentScale = this.scaleX; // scale is uniform
      const t = (currentScale - 0.5) / 1.5; // 0..1
      const speedY = Phaser.Math.Linear(400, 100, t);

      const horizontalDriftScale = Phaser.Math.Clamp(0.85 + difficultyScale * 0.2, 0.8, 1.8);
      this.setVelocityY(speedY * difficultyScale);
      this.setVelocityX(Phaser.Math.Between(-50, 50) * horizontalDriftScale); // Drift
    }

    // 4. Rotation
    const rotSpeed = Phaser.Math.Between(50, 200) * Phaser.Math.Clamp(difficultyScale, 0.9, 1.9);
    this.setAngularVelocity(Phaser.Math.RND.sign() * rotSpeed);
  }
}

export class EnemyManager {
  private scene: Phaser.Scene;
  public enemies: Phaser.Physics.Arcade.Group;
  private spawnTimer: number = 0;
  private spawnInterval: number = INITIAL_SPAWN_INTERVAL;
  private offscreenCullTimer: number = 0;
  private difficultyLevel: number = 1;
  private baseEnemySpeedMultiplier: number = 1;
  private enemySpeedMultiplier: number = 1;
  private runtimeIntensity: number = 1;
  private preset: DifficultyPreset = getDifficultyPreset('normal');
  private nextSwarmId: number = 1;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;

    this.generateAsteroidTextures();

    this.enemies = this.scene.physics.add.group({
      classType: Enemy,
      runChildUpdate: true,
      maxSize: 100, // Increased pool for fragments
    });
  }

  public setDifficultyLevel(level: number) {
    this.difficultyLevel = Math.max(1, Math.floor(level));
    const ramp = this.difficultyLevel - 1;
    this.baseEnemySpeedMultiplier =
      this.preset.enemySpeedScale * (1 + Phaser.Math.Clamp(ramp * 0.07, 0, 1.05));
    this.refreshEnemySpeedMultiplier();
  }

  public setDifficultyPreset(preset: DifficultyPreset) {
    this.preset = preset;
    this.setDifficultyLevel(this.difficultyLevel);
  }

  public setRuntimeIntensity(intensity: number) {
    this.runtimeIntensity = Phaser.Math.Clamp(intensity, 0.6, 1.25);
    this.refreshEnemySpeedMultiplier();
  }

  public resetSpawnController(initialDelayMs: number = INITIAL_SPAWN_INTERVAL) {
    this.spawnInterval = INITIAL_SPAWN_INTERVAL;
    this.spawnTimer = Math.max(0, Math.round(initialDelayMs));
    this.offscreenCullTimer = 0;
  }

  public getDifficultyLevel() {
    return this.difficultyLevel;
  }

  private refreshEnemySpeedMultiplier() {
    const speedEase = Phaser.Math.Linear(0.84, 1, this.getIntensityRamp());
    this.enemySpeedMultiplier = this.baseEnemySpeedMultiplier * speedEase;
  }

  /**
   * Splits an asteroid into smaller fragments.
   * @param x Origin X
   * @param y Origin Y
   * @param parentScale Scale of the asteroid being destroyed
   */
  public splitAsteroid(x: number, y: number, parentScale: number) {
    // Recursion limit: Don't split if too small
    if (parentScale < 0.6) return;

    const activeCount = this.enemies.countActive(true);
    const hardCap = this.getActiveEnemyCap() + FRAGMENT_CAP_BUFFER;
    const headroom = hardCap - activeCount;
    if (headroom <= 0) return;

    const pressure = activeCount / Math.max(1, this.getActiveEnemyCap());
    let fragmentCount = Phaser.Math.Between(2, 3);
    if (pressure > 0.8) fragmentCount = 1;

    fragmentCount = Math.min(fragmentCount, headroom);
    if (fragmentCount <= 0) return;

    const newScale = parentScale * 0.5;

    for (let i = 0; i < fragmentCount; i++) {
      const fragment = this.enemies.get(x, y);
      if (fragment) {
        // Create an explosive impulse
        // Speed: 100-200 px/s in random direction
        const speed = Phaser.Math.Between(100, 250);
        const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);

        const vx = Math.cos(angle) * speed;
        const vy = Math.sin(angle) * speed;

        fragment.spawn(x, y, newScale, vx, vy, this.enemySpeedMultiplier);
      }
    }
  }

  public spawnSwarm(
    count: number,
    scale: number,
    speed: number,
    spacingX: number,
    spacingY: number,
  ): number {
    const width = this.scene.scale.width;
    const centerX = Phaser.Math.Between(Math.round(width * 0.25), Math.round(width * 0.75));
    const startY = -60;
    const swarmId = this.nextSwarmId++;
    let spawned = 0;

    for (let i = 0; i < count; i++) {
      const row = Math.floor(i / 2);
      const col = i % 2;
      const offsetX = (col === 0 ? -1 : 1) * Math.floor((i + 1) / 2) * spacingX * 0.5;
      const offsetY = -row * spacingY;
      const x = centerX + offsetX;
      const y = startY + offsetY;

      const enemy = this.enemies.get(x, y) as Enemy;
      if (enemy) {
        enemy.spawn(x, y, scale, 0, speed, this.enemySpeedMultiplier);
        enemy.swarmId = swarmId;
        enemy.swarmTotal = count;
        spawned++;
      }
    }

    return spawned > 0 ? swarmId : 0;
  }

  private generateAsteroidTextures() {
    for (let i = 0; i < 5; i++) {
      this.drawAsteroid(`asteroid_${i}`);
    }
  }

  private drawAsteroid(key: string) {
    if (this.scene.textures.exists(key)) return;

    const size = 64;
    const center = size / 2;
    const baseRadius = 30;

    const graphics = this.scene.make.graphics({ x: 0, y: 0 });

    const strokeColor = this.getAsteroidPaletteColor();
    graphics.fillStyle(strokeColor, 0.45);
    graphics.lineStyle(2, strokeColor, 1);

    graphics.beginPath();

    const points = Phaser.Math.Between(8, 12);
    const angleStep = (Math.PI * 2) / points;

    for (let i = 0; i < points; i++) {
      const angle = i * angleStep;
      const radius = Phaser.Math.FloatBetween(baseRadius * 0.6, baseRadius);

      const x = center + Math.cos(angle) * radius;
      const y = center + Math.sin(angle) * radius;

      if (i === 0) {
        graphics.moveTo(x, y);
      } else {
        graphics.lineTo(x, y);
      }
    }

    graphics.closePath();
    graphics.fillPath();
    graphics.strokePath();

    this.addCraterDetails(graphics, size);

    graphics.generateTexture(key, size, size);
    graphics.destroy();
  }

  private addCraterDetails(graphics: Phaser.GameObjects.Graphics, size: number) {
    const craterCount = Phaser.Math.Between(3, 6);
    const darkColor = 0x000000;
    for (let i = 0; i < craterCount; i++) {
      const radius = Phaser.Math.Between(2, 5);
      const x = Phaser.Math.Between(12, size - 12);
      const y = Phaser.Math.Between(12, size - 12);
      graphics.fillStyle(darkColor, 0.45);
      graphics.fillCircle(x, y, radius);
      graphics.lineStyle(1, darkColor, 0.8);
      graphics.strokeCircle(x, y, radius);
    }
  }

  private getAsteroidPaletteColor() {
    const palettes = [
      { hMin: 205, hMax: 225 }, // slate blue
      { hMin: 210, hMax: 240 }, // anthracite
      { hMin: 30, hMax: 45 }, // sand grey
      { hMin: 8, hMax: 20 }, // matte oxide red
    ];
    const pick = Phaser.Utils.Array.GetRandom(palettes);
    const h = Phaser.Math.FloatBetween(pick.hMin, pick.hMax) / 360;
    const s = Phaser.Math.FloatBetween(0.05, 0.14);
    const l = Phaser.Math.FloatBetween(0.4, 0.6);
    const color = Phaser.Display.Color.HSLToColor(h, s, l);
    return color.color;
  }

  update(_time: number, delta: number) {
    this.offscreenCullTimer -= delta;
    if (this.offscreenCullTimer <= 0) {
      this.cullOffscreenEnemies();
      this.offscreenCullTimer = OFFSCREEN_CULL_INTERVAL_MS;
    }

    this.spawnTimer -= delta;
    if (this.spawnTimer > 0) return;

    const activeCount = this.enemies.countActive(true);
    const activeCap = this.getActiveEnemyCap();
    const intensityRamp = this.getIntensityRamp();
    const spawnCadenceScale = Phaser.Math.Linear(1.35, 1, intensityRamp);

    if (activeCount >= activeCap) {
      const overload = activeCount - activeCap;
      this.spawnTimer = Math.min(PRESSURE_BACKOFF_MAX, 220 + overload * 45);
      return;
    }

    const spawned = this.spawnEnemy();
    const minInterval = this.getMinSpawnInterval();
    const intervalStep =
      (4 + Math.floor((this.difficultyLevel - 1) * 0.65)) *
      this.preset.enemySpawnScale *
      Phaser.Math.Linear(0.75, 1, intensityRamp);

    if (spawned && this.spawnInterval > minInterval) {
      this.spawnInterval -= intervalStep;
    }

    if (!spawned) {
      this.spawnTimer = 150;
      return;
    }

    const pressure = activeCount / Math.max(1, activeCap);
    const pressurePenaltyScale = Phaser.Math.Clamp(1 - (this.difficultyLevel - 1) * 0.025, 0.7, 1);
    const presetPressureScale = Phaser.Math.Clamp(1 / this.preset.enemySpawnScale, 0.72, 1.22);
    const pressurePenalty = Math.round(pressure * 350 * pressurePenaltyScale);
    this.spawnTimer = Math.round(
      (this.spawnInterval + pressurePenalty * presetPressureScale) * spawnCadenceScale,
    );
  }

  private spawnEnemy(): boolean {
    const width = this.scene.scale.width;
    const x = Phaser.Math.Between(50, width - 50);
    const y = -100;

    const enemy = this.enemies.get(x, y) as Enemy;

    if (enemy) {
      enemy.spawn(x, y, undefined, undefined, undefined, this.enemySpeedMultiplier);
      return true;
    }

    return false;
  }

  private getActiveEnemyCap() {
    const base = performanceMonitor.reducedParticles ? ACTIVE_ENEMY_CAP_REDUCED : ACTIVE_ENEMY_CAP;
    const levelBonusBase = performanceMonitor.reducedParticles
      ? Math.min(12, (this.difficultyLevel - 1) * 1.6)
      : Math.min(20, (this.difficultyLevel - 1) * 2.5);
    const levelBonus = Math.round(levelBonusBase * this.preset.enemyCapScale);
    const easedCap = Math.round(
      (base + levelBonus) * Phaser.Math.Linear(0.72, 1, this.getIntensityRamp()),
    );
    return Math.max(12, easedCap);
  }

  private getMinSpawnInterval() {
    const levelReduction = (this.difficultyLevel - 1) * 9 * this.preset.enemySpawnScale;
    const baseMin = Math.max(120, MIN_SPAWN_INTERVAL - levelReduction);
    const openingScale = Phaser.Math.Linear(1.3, 1, this.getIntensityRamp());
    return Math.round(baseMin * openingScale);
  }

  private getIntensityRamp() {
    return Phaser.Math.Clamp((this.runtimeIntensity - 0.6) / 0.4, 0, 1);
  }

  private cullOffscreenEnemies() {
    const height = this.scene.scale.height;
    const width = this.scene.scale.width;
    const enemies = this.enemies.getChildren() as Enemy[];
    for (const enemy of enemies) {
      if (!enemy.active) continue;
      const padding = 100 * enemy.scaleX;
      if (enemy.y > height + padding || enemy.x < -padding || enemy.x > width + padding) {
        enemy.disableBody(true, true);
      }
    }
  }
}
