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

type AsteroidPoint = {
  x: number;
  y: number;
};

type AsteroidPalette = {
  base: Phaser.Display.Color;
  shadow: Phaser.Display.Color;
  highlight: Phaser.Display.Color;
  ridgeLight: Phaser.Display.Color;
  ridgeDark: Phaser.Display.Color;
};

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
    const radius = size * 0.46;
    const contour = this.buildAsteroidContour(center, center, radius, Phaser.Math.Between(10, 14));
    const polygon = new Phaser.Geom.Polygon(contour.map((p) => new Phaser.Geom.Point(p.x, p.y)));
    const palette = this.getAsteroidPalette();
    const texture = this.scene.textures.createCanvas(key, size, size);
    if (!texture) return;
    const ctx = texture.getContext();

    ctx.clearRect(0, 0, size, size);
    this.traceContourPath(ctx, contour);
    ctx.save();
    ctx.clip();
    this.paintAsteroidBase(ctx, size, radius, palette);
    this.paintAsteroidStrata(ctx, size, radius, palette);
    this.paintAsteroidNoise(ctx, size, polygon, palette);
    this.paintAsteroidCraters(ctx, size, polygon, palette);
    this.paintAsteroidRimOcclusion(ctx, contour);
    ctx.restore();

    this.traceContourPath(ctx, contour);
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = this.toRgba(this.mixColors(palette.ridgeDark, palette.shadow, 0.5), 0.9);
    ctx.stroke();

    this.traceContourPath(ctx, contour);
    ctx.lineWidth = 0.9;
    ctx.strokeStyle = this.toRgba(this.mixColors(palette.highlight, palette.ridgeLight, 0.5), 0.28);
    ctx.stroke();

    texture.refresh();
  }

  private buildAsteroidContour(
    centerX: number,
    centerY: number,
    baseRadius: number,
    points: number,
  ): AsteroidPoint[] {
    const contour: AsteroidPoint[] = [];
    const angleStep = (Math.PI * 2) / points;
    const phaseA = Phaser.Math.FloatBetween(0, Math.PI * 2);
    const phaseB = Phaser.Math.FloatBetween(0, Math.PI * 2);
    const wobbleA = Phaser.Math.FloatBetween(0.08, 0.15);
    const wobbleB = Phaser.Math.FloatBetween(0.05, 0.11);

    for (let i = 0; i < points; i++) {
      const angle = i * angleStep;
      const wave =
        1 + Math.sin(angle * 3 + phaseA) * wobbleA + Math.cos(angle * 5 + phaseB) * wobbleB;
      const noise = Phaser.Math.FloatBetween(0.84, 1.12);
      const radius = baseRadius * Phaser.Math.Clamp(wave * noise, 0.7, 1.16);
      contour.push({
        x: centerX + Math.cos(angle) * radius,
        y: centerY + Math.sin(angle) * radius,
      });
    }

    return contour;
  }

  private traceContourPath(ctx: CanvasRenderingContext2D, contour: AsteroidPoint[]) {
    if (contour.length === 0) return;
    ctx.beginPath();
    ctx.moveTo(contour[0].x, contour[0].y);
    for (let i = 1; i < contour.length; i++) {
      ctx.lineTo(contour[i].x, contour[i].y);
    }
    ctx.closePath();
  }

  private paintAsteroidBase(
    ctx: CanvasRenderingContext2D,
    size: number,
    radius: number,
    palette: AsteroidPalette,
  ) {
    const center = size / 2;
    const litX = center - radius * 0.38;
    const litY = center - radius * 0.34;
    const baseGradient = ctx.createRadialGradient(
      litX,
      litY,
      radius * 0.08,
      center,
      center,
      radius * 1.14,
    );
    baseGradient.addColorStop(
      0,
      this.toRgba(this.mixColors(palette.highlight, palette.base, 0.15), 1),
    );
    baseGradient.addColorStop(0.45, this.toRgba(palette.base, 1));
    baseGradient.addColorStop(1, this.toRgba(palette.shadow, 1));
    ctx.fillStyle = baseGradient;
    ctx.fillRect(0, 0, size, size);

    const directionalShade = ctx.createLinearGradient(
      center - radius * 1.1,
      center - radius * 1.2,
      center + radius * 1.05,
      center + radius * 1.15,
    );
    directionalShade.addColorStop(0, this.toRgba(palette.ridgeLight, 0));
    directionalShade.addColorStop(0.52, this.toRgba(palette.base, 0.08));
    directionalShade.addColorStop(
      1,
      this.toRgba(this.mixColors(palette.shadow, palette.ridgeDark, 0.65), 0.45),
    );
    ctx.fillStyle = directionalShade;
    ctx.fillRect(0, 0, size, size);
  }

  private paintAsteroidStrata(
    ctx: CanvasRenderingContext2D,
    size: number,
    radius: number,
    palette: AsteroidPalette,
  ) {
    const center = size / 2;
    const strataCount = Phaser.Math.Between(6, 10);
    for (let i = 0; i < strataCount; i++) {
      const y = center + Phaser.Math.FloatBetween(-radius * 0.55, radius * 0.68);
      const slope = Phaser.Math.FloatBetween(-radius * 0.16, radius * 0.16);
      const arcY = y + Phaser.Math.FloatBetween(-radius * 0.15, radius * 0.15);
      const thickness = Phaser.Math.FloatBetween(0.8, 2.2);
      const tone =
        Phaser.Math.FloatBetween(0, 1) < 0.58
          ? this.mixColors(palette.base, palette.ridgeLight, Phaser.Math.FloatBetween(0.25, 0.58))
          : this.mixColors(palette.base, palette.ridgeDark, Phaser.Math.FloatBetween(0.35, 0.68));
      ctx.lineWidth = thickness;
      ctx.strokeStyle = this.toRgba(tone, Phaser.Math.FloatBetween(0.08, 0.2));
      ctx.beginPath();
      ctx.moveTo(center - radius * 1.18, y - slope);
      ctx.quadraticCurveTo(
        center + Phaser.Math.FloatBetween(-radius * 0.35, radius * 0.35),
        arcY,
        center + radius * 1.2,
        y + slope,
      );
      ctx.stroke();
    }
  }

  private paintAsteroidNoise(
    ctx: CanvasRenderingContext2D,
    size: number,
    polygon: Phaser.Geom.Polygon,
    palette: AsteroidPalette,
  ) {
    const speckCount = 210;
    for (let i = 0; i < speckCount; i++) {
      const x = Phaser.Math.FloatBetween(0, size);
      const y = Phaser.Math.FloatBetween(0, size);
      if (!Phaser.Geom.Polygon.Contains(polygon, x, y)) continue;

      const isLight = Phaser.Math.FloatBetween(0, 1) < 0.44;
      const color = isLight
        ? this.mixColors(palette.base, palette.ridgeLight, Phaser.Math.FloatBetween(0.25, 0.7))
        : this.mixColors(palette.base, palette.ridgeDark, Phaser.Math.FloatBetween(0.35, 0.82));
      const radius = Phaser.Math.FloatBetween(0.3, 1.3);
      const alpha = isLight
        ? Phaser.Math.FloatBetween(0.08, 0.2)
        : Phaser.Math.FloatBetween(0.06, 0.16);

      ctx.beginPath();
      ctx.fillStyle = this.toRgba(color, alpha);
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private paintAsteroidCraters(
    ctx: CanvasRenderingContext2D,
    size: number,
    polygon: Phaser.Geom.Polygon,
    palette: AsteroidPalette,
  ) {
    const craterCount = Phaser.Math.Between(7, 11);
    for (let i = 0; i < craterCount; i++) {
      const point = this.samplePointInPolygon(polygon, size, 26);
      if (!point) continue;
      const radius = Phaser.Math.FloatBetween(2.2, 6.4);
      const angle = Phaser.Math.FloatBetween(-Math.PI * 0.35, Math.PI * 0.35);
      const craterWidth = radius * Phaser.Math.FloatBetween(0.78, 1.1);
      const craterHeight = radius * Phaser.Math.FloatBetween(0.64, 0.96);

      ctx.beginPath();
      ctx.fillStyle = this.toRgba(this.mixColors(palette.shadow, palette.ridgeDark, 0.5), 0.4);
      ctx.ellipse(
        point.x + radius * 0.24,
        point.y + radius * 0.2,
        craterWidth * 1.04,
        craterHeight * 0.92,
        angle,
        0,
        Math.PI * 2,
      );
      ctx.fill();

      const craterFill = ctx.createRadialGradient(
        point.x - radius * 0.24,
        point.y - radius * 0.28,
        radius * 0.22,
        point.x,
        point.y,
        radius * 1.24,
      );
      craterFill.addColorStop(
        0,
        this.toRgba(
          this.mixColors(palette.base, palette.ridgeLight, Phaser.Math.FloatBetween(0.2, 0.42)),
          0.95,
        ),
      );
      craterFill.addColorStop(
        1,
        this.toRgba(this.mixColors(palette.shadow, palette.base, 0.2), 0.98),
      );
      ctx.fillStyle = craterFill;
      ctx.beginPath();
      ctx.ellipse(point.x, point.y, craterWidth, craterHeight, angle, 0, Math.PI * 2);
      ctx.fill();

      ctx.strokeStyle = this.toRgba(this.mixColors(palette.ridgeLight, palette.base, 0.44), 0.33);
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.ellipse(
        point.x - radius * 0.11,
        point.y - radius * 0.1,
        craterWidth * 0.84,
        craterHeight * 0.74,
        angle,
        Math.PI * 1.05,
        Math.PI * 1.92,
      );
      ctx.stroke();
    }
  }

  private paintAsteroidRimOcclusion(ctx: CanvasRenderingContext2D, contour: AsteroidPoint[]) {
    this.traceContourPath(ctx, contour);
    ctx.lineWidth = 4.8;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.18)';
    ctx.stroke();
  }

  private samplePointInPolygon(
    polygon: Phaser.Geom.Polygon,
    size: number,
    maxAttempts: number,
  ): AsteroidPoint | null {
    for (let i = 0; i < maxAttempts; i++) {
      const x = Phaser.Math.FloatBetween(6, size - 6);
      const y = Phaser.Math.FloatBetween(6, size - 6);
      if (Phaser.Geom.Polygon.Contains(polygon, x, y)) return { x, y };
    }
    return null;
  }

  private getAsteroidPalette(): AsteroidPalette {
    const palettes = [
      { hMin: 205, hMax: 225 }, // slate blue
      { hMin: 210, hMax: 240 }, // anthracite
      { hMin: 30, hMax: 45 }, // sand grey
      { hMin: 8, hMax: 20 }, // matte oxide red
    ];
    const pick = Phaser.Utils.Array.GetRandom(palettes);
    const h = Phaser.Math.FloatBetween(pick.hMin, pick.hMax) / 360;
    const s = Phaser.Math.FloatBetween(0.1, 0.2);
    const l = Phaser.Math.FloatBetween(0.34, 0.48);
    return {
      base: Phaser.Display.Color.HSLToColor(h, s, l),
      shadow: Phaser.Display.Color.HSLToColor(
        h,
        Phaser.Math.Clamp(s + 0.08, 0, 1),
        Phaser.Math.Clamp(l * 0.52, 0, 1),
      ),
      highlight: Phaser.Display.Color.HSLToColor(
        h,
        Phaser.Math.Clamp(s - 0.04, 0, 1),
        Phaser.Math.Clamp(l + 0.24, 0, 1),
      ),
      ridgeLight: Phaser.Display.Color.HSLToColor(
        h,
        Phaser.Math.Clamp(s - 0.06, 0, 1),
        Phaser.Math.Clamp(l + 0.17, 0, 1),
      ),
      ridgeDark: Phaser.Display.Color.HSLToColor(
        h,
        Phaser.Math.Clamp(s + 0.1, 0, 1),
        Phaser.Math.Clamp(l * 0.65, 0, 1),
      ),
    };
  }

  private mixColors(
    first: Phaser.Display.Color,
    second: Phaser.Display.Color,
    factor: number,
  ): Phaser.Display.Color {
    const t = Phaser.Math.Clamp(factor, 0, 1);
    return new Phaser.Display.Color(
      Math.round(Phaser.Math.Linear(first.red, second.red, t)),
      Math.round(Phaser.Math.Linear(first.green, second.green, t)),
      Math.round(Phaser.Math.Linear(first.blue, second.blue, t)),
    );
  }

  private toRgba(color: Phaser.Display.Color, alpha: number) {
    return `rgba(${color.red}, ${color.green}, ${color.blue}, ${alpha})`;
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
