import Phaser from 'phaser';

export class Bullet extends Phaser.Physics.Arcade.Sprite {
  private isMagnetic: boolean = false;
  private homingTarget: Phaser.Physics.Arcade.Sprite | null = null;
  private nextRetargetAt: number = 0;
  private readonly retargetIntervalMs: number = 120;

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
    this.homingTarget = null;
    this.nextRetargetAt = 0;
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
      this.handleHoming(time, delta);
    }

    const w = this.scene.scale.width;
    const h = this.scene.scale.height;
    const pad = 150;
    if (this.y < -pad || this.y > h + pad || this.x < -pad || this.x > w + pad) {
      this.disableBody(true, true);
    }
  }

  private handleHoming(time: number, delta: number) {
    const enemies = (this.scene as any).enemyManager?.enemies;
    if (!enemies || !this.body) return;
    const enemyChildren = (enemies as any).children;
    if (!enemyChildren || typeof enemyChildren.each !== 'function') return;

    if (!this.homingTarget || !this.homingTarget.active || time >= this.nextRetargetAt) {
      let closestEnemy: Phaser.Physics.Arcade.Sprite | null = null;
      let minDistSq = Number.POSITIVE_INFINITY;

      enemyChildren.each((enemy: any) => {
        if (!enemy.active) return null;
        const dx = enemy.x - this.x;
        const dy = enemy.y - this.y;
        const distSq = dx * dx + dy * dy;
        if (distSq < minDistSq) {
          minDistSq = distSq;
          closestEnemy = enemy as Phaser.Physics.Arcade.Sprite;
        }
        return null;
      });

      this.homingTarget = closestEnemy;
      this.nextRetargetAt = time + this.retargetIntervalMs;
    }

    if (this.homingTarget) {
      const angle = Phaser.Math.Angle.Between(
        this.x,
        this.y,
        this.homingTarget.x,
        this.homingTarget.y,
      );
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
  private hasCannonCooling: boolean = false;
  private hasSlowMotion: boolean = false;
  private hasBlackHole: boolean = false;
  private wingmanDrones: Phaser.GameObjects.Group | null = null;
  private heat: number = 0;
  private heatPerShot: number = 9;
  private heatDecayPerSec: number = 28;
  private overheatUntil: number = 0;
  private passiveCoolingMultiplier: number = 1;
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
  private powerUpGraphics: Phaser.GameObjects.Graphics;
  private visualRefreshAccumulatorMs: number = 0;
  private readonly visualRefreshIntervalMs: number = 30;

  constructor(scene: Phaser.Scene, x: number, y: number, bullets: Phaser.Physics.Arcade.Group) {
    if (!scene.textures.exists('player_wireframe')) {
      const graphics = scene.make.graphics({ x: 0, y: 0 });
      graphics.lineStyle(2, 0xffffff, 1);
      graphics.fillStyle(0x050505, 0.85);
      graphics.beginPath();
      graphics.moveTo(20, 2);
      graphics.lineTo(33, 14);
      graphics.lineTo(39, 36);
      graphics.lineTo(27, 34);
      graphics.lineTo(20, 28);
      graphics.lineTo(13, 34);
      graphics.lineTo(1, 36);
      graphics.lineTo(7, 14);
      graphics.closePath();
      graphics.fillPath();
      graphics.strokePath();
      graphics.lineStyle(1, 0x88ddff, 0.85);
      graphics.strokeCircle(20, 17, 5);
      graphics.lineStyle(1, 0xffffff, 0.8);
      graphics.beginPath();
      graphics.moveTo(20, 3);
      graphics.lineTo(20, 31);
      graphics.moveTo(11, 24);
      graphics.lineTo(29, 24);
      graphics.moveTo(8, 14);
      graphics.lineTo(32, 14);
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
    this.powerUpGraphics = scene.add.graphics();
    this.powerUpGraphics.setDepth(this.depth + 1);
    this.shieldGraphics = scene.add.graphics();
    this.shieldGraphics.setDepth(this.depth + 2);
    this.visualRefreshAccumulatorMs = this.visualRefreshIntervalMs;
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
      this.powerUpGraphics.destroy();
      this.shieldGraphics.destroy();
      this.muzzleFlashes.clear(true, true);
    });
  }

  public updateBounds(_width: number, height: number) {
    this.minBoundY = height * 0.66;
    this.maxBoundY = height;
  }

  public setMagnetic(active: boolean) {
    if (this.isMagnetic !== active) {
      this.invalidateVisualRefresh();
    }
    this.isMagnetic = active;
  }
  public setTripleShot(active: boolean) {
    if (this.isTripleShot !== active) {
      this.invalidateVisualRefresh();
    }
    this.isTripleShot = active;
  }
  public setShield(active: boolean) {
    if (this.hasShield !== active) {
      this.invalidateVisualRefresh();
    }
    this.hasShield = active;
  }
  public setCannonCooling(active: boolean) {
    if (this.hasCannonCooling !== active) {
      this.invalidateVisualRefresh();
    }
    this.hasCannonCooling = active;
    if (active) {
      this.heat = 0;
      this.overheatUntil = 0;
    }
  }
  public getShieldActive(): boolean {
    return this.hasShield;
  }
  public setSlowMotionVisual(active: boolean) {
    if (this.hasSlowMotion !== active) {
      this.invalidateVisualRefresh();
    }
    this.hasSlowMotion = active;
  }
  public setBlackHoleVisual(active: boolean) {
    if (this.hasBlackHole !== active) {
      this.invalidateVisualRefresh();
    }
    this.hasBlackHole = active;
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

  public setPassiveCoolingMultiplier(multiplier: number) {
    this.passiveCoolingMultiplier = Phaser.Math.Clamp(multiplier, 1, 2.2);
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

  private invalidateVisualRefresh() {
    this.visualRefreshAccumulatorMs = this.visualRefreshIntervalMs;
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
    const flameOuter = this.hasCannonCooling ? 0xf2f8ff : 0xff4422;
    const flameInner = this.hasCannonCooling ? 0xffffff : 0xffaa55;
    const pulse = 0.75 + Math.sin(this.scene.time.now * 0.02) * 0.25;
    const flickerBase = this.hasCannonCooling ? 12 : 10;
    const flicker = flickerBase + Phaser.Math.Between(4, 12);
    const tx = this.x;
    const ty = this.y + 12;
    const leftNozzleX = tx - 6;
    const rightNozzleX = tx + 6;

    this.thrusterGraphics.lineStyle(1, flameOuter, 0.9);
    this.thrusterGraphics.fillStyle(flameOuter, 0.38 + pulse * 0.2);
    this.thrusterGraphics.beginPath();
    this.thrusterGraphics.moveTo(leftNozzleX, ty);
    this.thrusterGraphics.lineTo(rightNozzleX, ty);
    this.thrusterGraphics.lineTo(tx, ty + flicker);
    this.thrusterGraphics.closePath();
    this.thrusterGraphics.fillPath();
    this.thrusterGraphics.strokePath();

    this.thrusterGraphics.fillStyle(flameInner, 0.55 + pulse * 0.25);
    this.thrusterGraphics.beginPath();
    this.thrusterGraphics.moveTo(tx - 3, ty + 1);
    this.thrusterGraphics.lineTo(tx + 3, ty + 1);
    this.thrusterGraphics.lineTo(tx, ty + flicker * 0.7);
    this.thrusterGraphics.closePath();
    this.thrusterGraphics.fillPath();

    this.thrusterGraphics.lineStyle(1, flameOuter, 0.6);
    this.thrusterGraphics.beginPath();
    this.thrusterGraphics.moveTo(tx - 9, ty + 2);
    this.thrusterGraphics.lineTo(tx - 9, ty + 8 + Phaser.Math.Between(0, 4));
    this.thrusterGraphics.moveTo(tx + 9, ty + 2);
    this.thrusterGraphics.lineTo(tx + 9, ty + 8 + Phaser.Math.Between(0, 4));
    this.thrusterGraphics.strokePath();
  }

  private drawPowerUpIndicators() {
    this.powerUpGraphics.clear();
    const t = this.scene.time.now;
    const pulse = 0.5 + 0.5 * Math.sin(t * 0.01);

    if (this.isMagnetic) {
      this.powerUpGraphics.lineStyle(2, 0x00e5ff, 0.65 + pulse * 0.25);
      this.powerUpGraphics.strokeCircle(this.x, this.y, 22 + pulse * 2);
      this.powerUpGraphics.lineStyle(1, 0x99f4ff, 0.7);
      this.powerUpGraphics.beginPath();
      this.powerUpGraphics.moveTo(this.x - 15, this.y - 2);
      this.powerUpGraphics.lineTo(this.x + 15, this.y - 2);
      this.powerUpGraphics.moveTo(this.x, this.y - 16);
      this.powerUpGraphics.lineTo(this.x, this.y + 8);
      this.powerUpGraphics.strokePath();
    }

    if (this.isTripleShot) {
      this.powerUpGraphics.lineStyle(1, 0xffd166, 0.95);
      this.powerUpGraphics.beginPath();
      this.powerUpGraphics.moveTo(this.x - 10, this.y - 16);
      this.powerUpGraphics.lineTo(this.x - 15, this.y - 24);
      this.powerUpGraphics.moveTo(this.x, this.y - 18);
      this.powerUpGraphics.lineTo(this.x, this.y - 28);
      this.powerUpGraphics.moveTo(this.x + 10, this.y - 16);
      this.powerUpGraphics.lineTo(this.x + 15, this.y - 24);
      this.powerUpGraphics.strokePath();
    }

    if (this.hasSlowMotion) {
      this.powerUpGraphics.lineStyle(1, 0x66aaff, 0.5 + pulse * 0.35);
      this.powerUpGraphics.strokeCircle(this.x, this.y, 28);
      this.powerUpGraphics.lineStyle(1, 0x66aaff, 0.35 + pulse * 0.25);
      this.powerUpGraphics.strokeCircle(this.x, this.y, 33);
    }

    if (this.hasBlackHole) {
      const radius = 26;
      this.powerUpGraphics.lineStyle(1, 0xaa66ff, 0.75);
      this.powerUpGraphics.strokeCircle(this.x, this.y, radius);
      for (let i = 0; i < 3; i++) {
        const angle = t * 0.005 + i * ((Math.PI * 2) / 3);
        const ox = Math.cos(angle) * radius;
        const oy = Math.sin(angle) * radius;
        this.powerUpGraphics.fillStyle(0xcf9bff, 0.85);
        this.powerUpGraphics.fillCircle(this.x + ox, this.y + oy, 2.2);
      }
    }
  }

  update(time: number, delta: number) {
    if (!this.active) {
      this.thrusterGraphics.clear();
      this.powerUpGraphics.clear();
      this.shieldGraphics.clear();
      this.visualRefreshAccumulatorMs = 0;
      this.setTint(0xffffff);
      return;
    }
    this.setVelocity(0);
    const pointer = this.scene.input.activePointer;
    const speed = 400;

    if (pointer.isDown && this.isDragging) {
      if (this.isDesktop) {
        // Desktop: Smooth lerp follow — velocity proportional to distance
        const dx = pointer.x - this.x;
        const dy = pointer.y - this.y;
        const responsiveness = 12;
        this.setVelocityX(dx * responsiveness);
        this.setVelocityY(dy * responsiveness);
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
    this.visualRefreshAccumulatorMs += delta;
    if (this.visualRefreshAccumulatorMs >= this.visualRefreshIntervalMs) {
      this.visualRefreshAccumulatorMs = 0;
      this.drawThruster();
      this.drawPowerUpIndicators();
      this.drawShield();
    }
    this.firedThisFrame = false;
    const canFire = this.hasCannonCooling || time >= this.overheatUntil;
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
    if (!this.hasCannonCooling && time < this.overheatUntil) return;
    let didFire = false;
    const trySpawnBullet = (x: number, y: number, angle: number) => {
      if (!this.canSpawnBullet()) return false;
      const bullet = this.bullets.get(x, y) as Bullet;
      if (!bullet) return false;
      bullet.fire(x, y, this.isMagnetic, angle);
      return true;
    };

    if (this.isTripleShot) {
      const angles = [-Math.PI / 2 - 0.2, -Math.PI / 2, -Math.PI / 2 + 0.2];
      for (const angle of angles) {
        didFire = trySpawnBullet(this.x, this.y - 25, angle) || didFire;
      }
    } else {
      didFire = trySpawnBullet(this.x, this.y - 25, -Math.PI / 2) || didFire;
    }

    if (this.wingmanDrones) {
      const droneChildren = (this.wingmanDrones as any).children;
      if (!droneChildren || typeof droneChildren.each !== 'function') return;
      droneChildren.each((drone: any) => {
        if (drone.active && drone.visible) {
          didFire = trySpawnBullet(drone.x, drone.y - 10, -Math.PI / 2) || didFire;
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

  private canSpawnBullet() {
    const sceneAny = this.scene as any;
    if (typeof sceneAny.canSpawnBullet === 'function') {
      return sceneAny.canSpawnBullet();
    }
    return true;
  }

  private applyHeat(time: number) {
    if (this.hasCannonCooling) {
      this.heat = 0;
      this.overheatUntil = 0;
      return;
    }
    const wasOverheated = time < this.overheatUntil;
    this.heat = Math.min(100, this.heat + this.heatPerShot);
    if (this.heat >= 100 && !wasOverheated) {
      const overheatDuration = Math.round(2000 / this.passiveCoolingMultiplier);
      this.overheatUntil = time + overheatDuration;
      this.fireBuffer = 0;
      const sceneAny = this.scene as any;
      if (sceneAny.spawnOverheatSmoke) {
        sceneAny.spawnOverheatSmoke(this.x, this.y + 10);
      }
    }
  }

  private coolHeat(delta: number) {
    if (this.hasCannonCooling) {
      this.heat = 0;
      this.overheatUntil = 0;
      return;
    }
    const coolAmount = (this.heatDecayPerSec * this.passiveCoolingMultiplier * delta) / 1000;
    this.heat = Math.max(0, this.heat - coolAmount);
  }

  private updateHeatVisuals() {
    if (this.hasCannonCooling) {
      this.setTint(0xeaf6ff);
      return;
    }
    const ratio = this.getHeatNormalized();
    if (ratio <= 0) {
      this.setTint(0xffffff);
      return;
    }
    const t = Phaser.Math.Clamp(ratio, 0, 1);
    const r = 255;
    const g = Math.round(255 - 191 * t);
    const b = Math.round(255 - 191 * t);
    this.setTint((r << 16) | (g << 8) | b);
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
      this.powerUpGraphics.clear();
      this.shieldGraphics.clear();
    }
  }
}
