import Phaser from 'phaser';

export class Bullet extends Phaser.Physics.Arcade.Sprite {
  private isMagnetic: boolean = false;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    if (!scene.textures.exists('bullet_wireframe')) {
      const graphics = scene.make.graphics({ x: 0, y: 0 });
      graphics.lineStyle(2, 0xffffff, 1);
      graphics.fillStyle(0x000000, 0.5);
      graphics.beginPath();
      graphics.moveTo(8, 0);
      graphics.lineTo(12, 12);
      graphics.lineTo(8, 24);
      graphics.lineTo(4, 12);
      graphics.closePath();
      graphics.fillPath();
      graphics.strokePath();
      graphics.generateTexture('bullet_wireframe', 16, 24);
      graphics.destroy();
    }
    if (!scene.textures.exists('bullet_magnetic')) {
      const graphics = scene.make.graphics({ x: 0, y: 0 });
      graphics.lineStyle(2, 0x00ffff, 1);
      graphics.fillStyle(0x00ffff, 0.3);
      graphics.beginPath();
      graphics.moveTo(8, 0);
      graphics.lineTo(12, 12);
      graphics.lineTo(8, 24);
      graphics.lineTo(4, 12);
      graphics.closePath();
      graphics.fillPath();
      graphics.strokePath();
      graphics.generateTexture('bullet_magnetic', 16, 24);
      graphics.destroy();
    }
    super(scene, x, y, 'bullet_wireframe');
  }

  fire(x: number, y: number, magnetic: boolean = false, angle: number = -Math.PI / 2) {
    this.isMagnetic = magnetic;
    this.setTexture(magnetic ? 'bullet_magnetic' : 'bullet_wireframe');
    this.enableBody(true, x, y, true, true);
    this.rotation = angle + Math.PI / 2;
    const speed = 600;
    this.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
  }

  preUpdate(time: number, delta: number) {
    super.preUpdate(time, delta);
    if (!this.active) return;

    if (this.isMagnetic) {
      this.handleHoming(delta);
    }

    const w = this.scene.scale.width;
    const h = this.scene.scale.height;
    const pad = 150;
    if (this.y < -pad || this.y > h + pad || this.x < -pad || this.x > w + pad) {
      this.disableBody(true, true);
    }
  }

  private handleHoming(delta: number) {
    const enemies = (this.scene as any).enemyManager?.enemies;
    if (!enemies || !this.body) return;

    let closestEnemy: any = null;
    let minDist = 1500;

    enemies.children.each((enemy: any) => {
      if (enemy.active) {
        const dist = Phaser.Math.Distance.Between(this.x, this.y, enemy.x, enemy.y);
        if (dist < minDist) {
          minDist = dist;
          closestEnemy = enemy;
        }
      }
      return null;
    });

    if (closestEnemy) {
      const angle = Phaser.Math.Angle.Between(this.x, this.y, closestEnemy.x, closestEnemy.y);
      const currentVelocity = this.body.velocity;
      const speed = currentVelocity.length() || 600;

      const targetVX = Math.cos(angle) * speed;
      const targetVY = Math.sin(angle) * speed;

      const lerpFactor = Math.min(1, 0.005 * delta);
      this.body.velocity.x = Phaser.Math.Linear(currentVelocity.x, targetVX, lerpFactor);
      this.body.velocity.y = Phaser.Math.Linear(currentVelocity.y, targetVY, lerpFactor);

      this.rotation = Math.atan2(this.body.velocity.y, this.body.velocity.x) + Math.PI / 2;
    }
  }
}

export class Player extends Phaser.Physics.Arcade.Sprite {
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private nextFireTime: number = 0;
  private autoFireRate: number = 150;
  private fireRateHold: number = 200;
  private fireRateTap: number = 100;
  private fireBuffer: number = 0;
  private maxFireBuffer: number = 5;
  private keyHeld: boolean = false;
  private pointerHeld: boolean = false;
  private isDesktop: boolean = false;
  public bullets: Phaser.Physics.Arcade.Group;
  private minBoundY: number = 0;
  private maxBoundY: number = 1000;
  private isMagnetic: boolean = false;
  private isTripleShot: boolean = false;
  private hasShield: boolean = false;
  private wingmanDrones: Phaser.GameObjects.Group | null = null;
  private heat: number = 0;
  private heatPerShot: number = 9;
  private heatDecayPerSec: number = 28;
  private overheatUntil: number = 0;
  private firedThisFrame: boolean = false;
  private muzzleFlashes!: Phaser.GameObjects.Group;
  private spaceKey?: Phaser.Input.Keyboard.Key;

  // Relative Touch Control
  private touchStartPos: Phaser.Math.Vector2 = new Phaser.Math.Vector2();
  private shipStartPos: Phaser.Math.Vector2 = new Phaser.Math.Vector2();
  private isDragging: boolean = false;

  // Visuals
  private thrusterGraphics: Phaser.GameObjects.Graphics;
  private shieldGraphics: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, x: number, y: number, bullets: Phaser.Physics.Arcade.Group) {
    if (!scene.textures.exists('player_wireframe')) {
      const graphics = scene.make.graphics({ x: 0, y: 0 });
      graphics.lineStyle(2, 0xffffff, 1);
      graphics.fillStyle(0x000000, 0.7);
      graphics.beginPath();
      graphics.moveTo(20, 0);
      graphics.lineTo(40, 40);
      graphics.lineTo(20, 32);
      graphics.lineTo(0, 40);
      graphics.closePath();
      graphics.fillPath();
      graphics.strokePath();
      graphics.generateTexture('player_wireframe', 40, 40);
      graphics.destroy();
    }
    if (!scene.textures.exists('muzzle_flash')) {
      const graphics = scene.make.graphics({ x: 0, y: 0 });
      graphics.fillStyle(0xffcc66, 1);
      graphics.beginPath();
      graphics.moveTo(8, 0);
      graphics.lineTo(16, 16);
      graphics.lineTo(0, 16);
      graphics.closePath();
      graphics.fillPath();
      graphics.generateTexture('muzzle_flash', 16, 16);
      graphics.destroy();
    }
    super(scene, x, y, 'player_wireframe');
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setCollideWorldBounds(true);
    this.setBodySize(32, 32);
    this.setOffset(4, 4);
    this.isDesktop = scene.sys.game.device.os.desktop;
    this.heatDecayPerSec = this.isDesktop ? 28 : 45; // Faster cooling on mobile (45 vs 28)

    if (scene.input.keyboard) {
      this.cursors = scene.input.keyboard.createCursorKeys();
      this.spaceKey = scene.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);
      this.spaceKey.on('down', () => {
        this.keyHeld = true;
        this.queueFire();
      });
      this.spaceKey.on('up', () => (this.keyHeld = false));
    }

    scene.input.on('pointerdown', this.handlePointerDown, this);
    scene.input.on('pointerup', this.handlePointerUp, this);

    this.bullets = bullets;
    this.updateBounds(scene.scale.width, scene.scale.height);

    this.thrusterGraphics = scene.add.graphics();
    this.thrusterGraphics.setDepth(this.depth - 1);
    this.shieldGraphics = scene.add.graphics();
    this.shieldGraphics.setDepth(this.depth + 1);
    this.muzzleFlashes = scene.add.group({
      classType: Phaser.GameObjects.Image,
      maxSize: 20,
    });

    this.on('destroy', () => {
      if (this.isDesktop) {
        this.scene.input.off('pointerdown', this.handlePointerDown, this);
        this.scene.input.off('pointerup', this.handlePointerUp, this);
      }
      this.spaceKey?.removeAllListeners();
      this.thrusterGraphics.destroy();
      this.shieldGraphics.destroy();
      this.muzzleFlashes.clear(true, true);
    });
  }

  public updateBounds(_width: number, height: number) {
    this.minBoundY = height * 0.66;
    this.maxBoundY = height;
  }

  public setMagnetic(active: boolean) {
    this.isMagnetic = active;
  }
  public setTripleShot(active: boolean) {
    this.isTripleShot = active;
  }
  public setShield(active: boolean) {
    this.hasShield = active;
  }
  public getShieldActive(): boolean {
    return this.hasShield;
  }
  public setDrones(drones: Phaser.GameObjects.Group | null) {
    this.wingmanDrones = drones;
  }
  public getHeatNormalized(): number {
    return Phaser.Math.Clamp(this.heat / 100, 0, 1);
  }
  public isOverheated(): boolean {
    return this.scene.time.now < this.overheatUntil;
  }
  public getHeatBarAnchor() {
    return { x: this.x, y: this.y + 40 };
  }

  public resetHeat() {
    this.heat = 0;
    this.overheatUntil = 0;
    this.fireBuffer = 0;
    this.setTint(0xffffff);
  }

  private handlePointerDown(pointer: Phaser.Input.Pointer) {
    this.pointerHeld = true;
    this.isDragging = true;
    this.touchStartPos.set(pointer.x, pointer.y);
    this.shipStartPos.set(this.x, this.y);
    if (this.isDesktop) {
      this.queueFire();
    }
  }

  private handlePointerUp() {
    this.pointerHeld = false;
    this.isDragging = false;
  }

  private queueFire() {
    this.fireBuffer = Math.min(this.maxFireBuffer, this.fireBuffer + 1);
  }

  private drawShield() {
    this.shieldGraphics.clear();
    if (!this.hasShield) return;
    this.shieldGraphics.lineStyle(2, 0x00ffff, 0.8);
    this.shieldGraphics.strokeCircle(this.x, this.y, 40);
    const pulse = 0.2 + Math.sin(this.scene.time.now * 0.01) * 0.1;
    this.shieldGraphics.fillStyle(0x00ffff, pulse);
    this.shieldGraphics.fillCircle(this.x, this.y, 40);
  }

  private drawThruster() {
    this.thrusterGraphics.clear();
    this.thrusterGraphics.lineStyle(1, 0xffffff, 0.8);
    this.thrusterGraphics.fillStyle(0xffffff, 0.3);
    const flicker = Phaser.Math.Between(8, 18);
    const tx = this.x;
    const ty = this.y + 12;
    this.thrusterGraphics.beginPath();
    this.thrusterGraphics.moveTo(tx - 6, ty);
    this.thrusterGraphics.lineTo(tx + 6, ty);
    this.thrusterGraphics.lineTo(tx, ty + flicker);
    this.thrusterGraphics.closePath();
    this.thrusterGraphics.fillPath();
    this.thrusterGraphics.strokePath();
  }

  update(time: number, delta: number) {
    if (!this.active) {
      this.thrusterGraphics.clear();
      this.shieldGraphics.clear();
      this.setTint(0xffffff);
      return;
    }
    this.setVelocity(0);
    const pointer = this.scene.input.activePointer;
    const speed = 400;

    if (pointer.isDown && this.isDragging) {
      if (this.isDesktop) {
        // Desktop: Direct towards pointer
        const dx = pointer.x - this.x;
        const dy = pointer.y - this.y;
        if (Math.abs(dx) > 10) this.setVelocityX(Math.sign(dx) * speed);
        if (Math.abs(dy) > 10) this.setVelocityY(Math.sign(dy) * speed);
      } else {
        // Mobile: Relative Control (Touchpad Mode)
        const targetX = this.shipStartPos.x + (pointer.x - this.touchStartPos.x);
        const targetY = this.shipStartPos.y + (pointer.y - this.touchStartPos.y);

        // Movement is calculated based on delta from start, allowing pointer to be anywhere
        const dx = targetX - this.x;
        const dy = targetY - this.y;

        const mobileResponsiveness = 20;
        this.setVelocityX(dx * mobileResponsiveness);
        this.setVelocityY(dy * mobileResponsiveness);
      }
    } else if (this.cursors) {
      if (this.cursors.left.isDown) this.setVelocityX(-speed);
      else if (this.cursors.right.isDown) this.setVelocityX(speed);
      if (this.cursors.up.isDown) this.setVelocityY(-speed);
      else if (this.cursors.down.isDown) this.setVelocityY(speed);
    }
    if (this.y < this.minBoundY) {
      this.y = this.minBoundY;
      if (this.body && this.body.velocity.y < 0) this.body.velocity.y = 0;
    }
    if (this.y > this.maxBoundY) {
      this.y = this.maxBoundY;
      if (this.body && this.body.velocity.y > 0) this.body.velocity.y = 0;
    }
    this.drawThruster();
    this.drawShield();
    this.firedThisFrame = false;
    const canFire = time >= this.overheatUntil;
    if (this.isDesktop) {
      const fireHeld = this.pointerHeld || this.keyHeld;
      const useBuffer = this.fireBuffer > 0;
      if (canFire && time >= this.nextFireTime && (useBuffer || fireHeld)) {
        this.fireBullet(time, true);
        if (useBuffer) this.fireBuffer--;
        const interval = useBuffer ? this.fireRateTap : this.fireRateHold;
        this.nextFireTime = time + interval;
      }
    } else if (canFire && time >= this.nextFireTime && pointer.isDown) {
      this.fireBullet(time, false);
      this.nextFireTime = time + this.autoFireRate;
    }
    if (!this.firedThisFrame) {
      this.coolHeat(delta);
    }
    this.updateHeatVisuals();
  }

  private fireBullet(time: number, manual: boolean) {
    if (time < this.overheatUntil) return;
    let didFire = false;
    if (this.isTripleShot) {
      const angles = [-Math.PI / 2 - 0.2, -Math.PI / 2, -Math.PI / 2 + 0.2];
      angles.forEach((angle) => {
        const bullet = this.bullets.get(this.x, this.y - 25) as Bullet;
        if (bullet) {
          bullet.fire(this.x, this.y - 25, this.isMagnetic, angle);
          didFire = true;
        }
      });
    } else {
      const bullet = this.bullets.get(this.x, this.y - 25) as Bullet;
      if (bullet) {
        bullet.fire(this.x, this.y - 25, this.isMagnetic);
        didFire = true;
      }
    }

    if (this.wingmanDrones) {
      this.wingmanDrones.children.each((drone: any) => {
        if (drone.active && drone.visible) {
          const bullet = this.bullets.get(drone.x, drone.y - 10) as Bullet;
          if (bullet) {
            bullet.fire(drone.x, drone.y - 10, this.isMagnetic);
            didFire = true;
          }
        }
        return null;
      });
    }

    if (!didFire) return;
    this.applyHeat(time);
    this.spawnMuzzleFlash(manual);
    this.firedThisFrame = true;
    if ((this.scene as any).audio) (this.scene as any).audio.playShoot(manual);
  }

  private applyHeat(time: number) {
    const wasOverheated = time < this.overheatUntil;
    this.heat = Math.min(100, this.heat + this.heatPerShot);
    if (this.heat >= 100 && !wasOverheated) {
      this.overheatUntil = time + 2000;
      this.fireBuffer = 0;
      const sceneAny = this.scene as any;
      if (sceneAny.spawnOverheatSmoke) {
        sceneAny.spawnOverheatSmoke(this.x, this.y + 10);
      }
    }
  }

  private coolHeat(delta: number) {
    const coolAmount = (this.heatDecayPerSec * delta) / 1000;
    this.heat = Math.max(0, this.heat - coolAmount);
  }

  private updateHeatVisuals() {
    const ratio = this.getHeatNormalized();
    if (ratio <= 0) {
      this.setTint(0xffffff);
      return;
    }
    const base = Phaser.Display.Color.ValueToColor(0xffffff);
    const hot = Phaser.Display.Color.ValueToColor(0xff4040);
    const color = Phaser.Display.Color.Interpolate.ColorWithColor(base, hot, 100, ratio * 100);
    this.setTint(Phaser.Display.Color.GetColor(color.r, color.g, color.b));
  }

  private spawnMuzzleFlash(manual: boolean) {
    const flash = this.muzzleFlashes.get(
      this.x,
      this.y - 28,
      'muzzle_flash',
    ) as Phaser.GameObjects.Image | null;
    if (!flash) return;
    flash.setActive(true);
    flash.setVisible(true);
    flash.setAlpha(1);
    flash.setRotation(0);
    flash.setScale(manual ? 1.4 : 1.0);
    flash.setTint(manual ? 0xffaa33 : 0xffdd88);
    flash.setDepth(this.depth + 1);
    this.scene.tweens.add({
      targets: flash,
      alpha: 0,
      scale: manual ? 1.8 : 1.4,
      duration: manual ? 140 : 100,
      onComplete: () => {
        flash.setActive(false);
        flash.setVisible(false);
      },
    });
  }

  preUpdate(time: number, delta: number) {
    super.preUpdate(time, delta);
    if (!this.active) {
      this.thrusterGraphics.clear();
      this.shieldGraphics.clear();
    }
  }
}
