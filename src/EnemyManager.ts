import Phaser from 'phaser';
import { performanceMonitor } from './PerformanceMonitor';

const INITIAL_SPAWN_INTERVAL = 1000;
const MIN_SPAWN_INTERVAL = 220;
const PRESSURE_BACKOFF_MAX = 900;
const ACTIVE_ENEMY_CAP = 52;
const ACTIVE_ENEMY_CAP_REDUCED = 36;
const FRAGMENT_CAP_BUFFER = 8;

export class Enemy extends Phaser.Physics.Arcade.Sprite {
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
  spawn(x: number, y: number, scale?: number, velocityX?: number, velocityY?: number) {
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
      this.setVelocity(velocityX, velocityY);
    } else {
      // Standard Mode: Fall down with parallax speed
      // Scale 0.5 (small) -> Fast (400)
      // Scale 2.0 (big)   -> Slow (100)
      const currentScale = this.scaleX; // scale is uniform
      const t = (currentScale - 0.5) / 1.5; // 0..1
      const speedY = Phaser.Math.Linear(400, 100, t);

      this.setVelocityY(speedY);
      this.setVelocityX(Phaser.Math.Between(-50, 50)); // Drift
    }

    // 4. Rotation
    const rotSpeed = Phaser.Math.Between(50, 200);
    this.setAngularVelocity(Phaser.Math.RND.sign() * rotSpeed);
  }

  preUpdate(time: number, delta: number) {
    super.preUpdate(time, delta);

    const height = this.scene.scale.height;
    const width = this.scene.scale.width;
    const padding = 100 * this.scaleX;

    // Remove if off screen (bottom, left, right)
    if (this.y > height + padding || this.x < -padding || this.x > width + padding) {
      this.disableBody(true, true);
    }
  }
}

export class EnemyManager {
  private scene: Phaser.Scene;
  public enemies: Phaser.Physics.Arcade.Group;
  private spawnTimer: number = 0;
  private spawnInterval: number = INITIAL_SPAWN_INTERVAL;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;

    this.generateAsteroidTextures();

    this.enemies = this.scene.physics.add.group({
      classType: Enemy,
      runChildUpdate: true,
      maxSize: 100, // Increased pool for fragments
    });
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

        fragment.spawn(x, y, newScale, vx, vy);
      }
    }
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
    this.spawnTimer -= delta;
    if (this.spawnTimer > 0) return;

    const activeCount = this.enemies.countActive(true);
    const activeCap = this.getActiveEnemyCap();

    if (activeCount >= activeCap) {
      const overload = activeCount - activeCap;
      this.spawnTimer = Math.min(PRESSURE_BACKOFF_MAX, 220 + overload * 45);
      return;
    }

    const spawned = this.spawnEnemy();

    if (spawned && this.spawnInterval > MIN_SPAWN_INTERVAL) {
      this.spawnInterval -= 5;
    }

    if (!spawned) {
      this.spawnTimer = 150;
      return;
    }

    const pressure = activeCount / Math.max(1, activeCap);
    const pressurePenalty = Math.round(pressure * 350);
    this.spawnTimer = this.spawnInterval + pressurePenalty;
  }

  private spawnEnemy(): boolean {
    const width = this.scene.scale.width;
    const x = Phaser.Math.Between(50, width - 50);
    const y = -100;

    const enemy = this.enemies.get(x, y) as Enemy;

    if (enemy) {
      enemy.spawn(x, y);
      return true;
    }

    return false;
  }

  private getActiveEnemyCap() {
    return performanceMonitor.reducedParticles ? ACTIVE_ENEMY_CAP_REDUCED : ACTIVE_ENEMY_CAP;
  }
}
