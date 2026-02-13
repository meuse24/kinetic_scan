import Phaser from 'phaser';

export class Bullet extends Phaser.Physics.Arcade.Sprite {
  private isMagnetic: boolean = false;
  private homingTarget: Phaser.Physics.Arcade.Sprite | null = null;
  private nextRetargetAt: number = 0;
  private readonly retargetIntervalMs: number = 120;

  private static createCanvasTexture(
    scene: Phaser.Scene,
    key: string,
    width: number,
    height: number,
    draw: (ctx: CanvasRenderingContext2D) => void,
  ) {
    if (scene.textures.exists(key)) return;
    const texture = scene.textures.createCanvas(key, width, height);
    if (!texture) return;
    const ctx = texture.getContext();
    ctx.clearRect(0, 0, width, height);
    draw(ctx);
    texture.refresh();
  }

  private static ensureBulletTextures(scene: Phaser.Scene) {
    Bullet.createCanvasTexture(scene, 'bullet_wireframe', 20, 34, (ctx) => {
      ctx.beginPath();
      ctx.moveTo(10.8, 4.2);
      ctx.lineTo(15.4, 11.4);
      ctx.lineTo(14.3, 27.3);
      ctx.lineTo(10, 32.1);
      ctx.lineTo(5.7, 27.3);
      ctx.lineTo(4.6, 11.4);
      ctx.closePath();
      ctx.fillStyle = 'rgba(0, 0, 0, 0.32)';
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(10, 1.2);
      ctx.lineTo(15.2, 9.2);
      ctx.lineTo(14, 26.2);
      ctx.lineTo(10, 31.2);
      ctx.lineTo(6, 26.2);
      ctx.lineTo(4.8, 9.2);
      ctx.closePath();
      const hullGradient = ctx.createLinearGradient(10, 1.2, 10, 31.2);
      hullGradient.addColorStop(0, '#fff7d2');
      hullGradient.addColorStop(0.2, '#ffd067');
      hullGradient.addColorStop(0.54, '#ff9a38');
      hullGradient.addColorStop(1, '#bf3d12');
      ctx.fillStyle = hullGradient;
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 246, 205, 0.92)';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(10, 3.1);
      ctx.lineTo(12.3, 9.4);
      ctx.lineTo(11.5, 24.8);
      ctx.lineTo(10, 29);
      ctx.lineTo(8.5, 24.8);
      ctx.lineTo(7.7, 9.4);
      ctx.closePath();
      const coreGradient = ctx.createLinearGradient(10, 3.1, 10, 29);
      coreGradient.addColorStop(0, '#ffffff');
      coreGradient.addColorStop(0.34, '#ffe8a6');
      coreGradient.addColorStop(0.72, '#ffb74f');
      coreGradient.addColorStop(1, '#ff6c21');
      ctx.fillStyle = coreGradient;
      ctx.fill();

      ctx.fillStyle = 'rgba(255, 216, 135, 0.78)';
      ctx.fillRect(3.8, 12, 1.4, 8.5);
      ctx.fillRect(14.8, 12, 1.4, 8.5);

      ctx.beginPath();
      ctx.moveTo(10, 31.2);
      ctx.lineTo(11.7, 33.4);
      ctx.lineTo(10, 33);
      ctx.lineTo(8.3, 33.4);
      ctx.closePath();
      ctx.fillStyle = 'rgba(255, 155, 64, 0.9)';
      ctx.fill();
    });

    Bullet.createCanvasTexture(scene, 'bullet_magnetic', 24, 34, (ctx) => {
      ctx.beginPath();
      ctx.moveTo(12.8, 4.6);
      ctx.lineTo(17.9, 11.2);
      ctx.lineTo(16.8, 26.2);
      ctx.lineTo(12, 31.4);
      ctx.lineTo(7.2, 26.2);
      ctx.lineTo(6.1, 11.2);
      ctx.closePath();
      ctx.fillStyle = 'rgba(0, 0, 0, 0.34)';
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(12, 1.3);
      ctx.lineTo(18, 9.1);
      ctx.lineTo(16.6, 25.2);
      ctx.lineTo(12, 30.2);
      ctx.lineTo(7.4, 25.2);
      ctx.lineTo(6, 9.1);
      ctx.closePath();
      const shellGradient = ctx.createLinearGradient(12, 1.3, 12, 30.2);
      shellGradient.addColorStop(0, '#eff9ff');
      shellGradient.addColorStop(0.24, '#8feaff');
      shellGradient.addColorStop(0.45, '#49c2f3');
      shellGradient.addColorStop(0.72, '#f8a143');
      shellGradient.addColorStop(1, '#b63d19');
      ctx.fillStyle = shellGradient;
      ctx.fill();
      ctx.strokeStyle = 'rgba(198, 243, 255, 0.9)';
      ctx.lineWidth = 1;
      ctx.stroke();

      const noseHalo = ctx.createRadialGradient(12, 5.1, 0.2, 12, 5.1, 5.5);
      noseHalo.addColorStop(0, 'rgba(210, 255, 255, 0.95)');
      noseHalo.addColorStop(0.36, 'rgba(118, 228, 255, 0.72)');
      noseHalo.addColorStop(1, 'rgba(43, 166, 214, 0)');
      ctx.fillStyle = noseHalo;
      ctx.beginPath();
      ctx.arc(12, 5.1, 5.4, 0, Math.PI * 2);
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(12, 3.3);
      ctx.lineTo(14.2, 8.9);
      ctx.lineTo(13.4, 24.1);
      ctx.lineTo(12, 28.2);
      ctx.lineTo(10.6, 24.1);
      ctx.lineTo(9.8, 8.9);
      ctx.closePath();
      const plasmaCore = ctx.createLinearGradient(12, 3.3, 12, 28.2);
      plasmaCore.addColorStop(0, '#ffffff');
      plasmaCore.addColorStop(0.26, '#d7feff');
      plasmaCore.addColorStop(0.58, '#ffd37e');
      plasmaCore.addColorStop(1, '#ff8f35');
      ctx.fillStyle = plasmaCore;
      ctx.fill();

      ctx.strokeStyle = 'rgba(110, 228, 255, 0.85)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(5.2, 8.5);
      ctx.lineTo(8, 10.2);
      ctx.lineTo(7.2, 23.2);
      ctx.moveTo(18.8, 8.5);
      ctx.lineTo(16, 10.2);
      ctx.lineTo(16.8, 23.2);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(12, 30.2);
      ctx.lineTo(13.9, 33.5);
      ctx.lineTo(12, 33);
      ctx.lineTo(10.1, 33.5);
      ctx.closePath();
      ctx.fillStyle = 'rgba(255, 167, 79, 0.9)';
      ctx.fill();
    });

    // Grenade texture — oval, olive green with orange fuse
    Bullet.createCanvasTexture(scene, 'bullet_grenade', 24, 24, (ctx) => {
      // Shadow
      ctx.beginPath();
      ctx.ellipse(12.6, 13, 9, 7, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
      ctx.fill();

      // Main body
      ctx.beginPath();
      ctx.ellipse(12, 12, 9, 7, 0, 0, Math.PI * 2);
      const bodyGrad = ctx.createRadialGradient(12, 10, 1, 12, 12, 9);
      bodyGrad.addColorStop(0, '#8aad52');
      bodyGrad.addColorStop(0.5, '#5c7a2e');
      bodyGrad.addColorStop(1, '#3a4f1a');
      ctx.fillStyle = bodyGrad;
      ctx.fill();
      ctx.strokeStyle = 'rgba(160, 200, 100, 0.7)';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Fuse dot
      ctx.beginPath();
      ctx.arc(12, 4, 3, 0, Math.PI * 2);
      const fuseGrad = ctx.createRadialGradient(12, 4, 0.3, 12, 4, 3);
      fuseGrad.addColorStop(0, '#ffee88');
      fuseGrad.addColorStop(0.5, '#ff8833');
      fuseGrad.addColorStop(1, '#cc4400');
      ctx.fillStyle = fuseGrad;
      ctx.fill();
    });
  }

  private isGrenade: boolean = false;
  private fuseTimeMs: number = 1200;
  private fuseStartTime: number = 0;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    Bullet.ensureBulletTextures(scene);
    super(scene, x, y, 'bullet_wireframe');
  }

  fire(x: number, y: number, magnetic: boolean = false, angle: number = -Math.PI / 2) {
    this.isGrenade = false;
    this.isMagnetic = magnetic;
    this.homingTarget = null;
    this.nextRetargetAt = 0;
    this.setTexture(magnetic ? 'bullet_magnetic' : 'bullet_wireframe');
    this.setBlendMode(magnetic ? Phaser.BlendModes.ADD : Phaser.BlendModes.NORMAL);
    this.setScale(1);
    this.setAlpha(1);
    this.enableBody(true, x, y, true, true);
    const body = this.body as Phaser.Physics.Arcade.Body;
    if (body) body.setGravityY(0);
    this.rotation = angle + Math.PI / 2;
    const speed = 600;
    this.setVelocity(Math.cos(angle) * speed, Math.sin(angle) * speed);
  }

  fireGrenade(x: number, y: number) {
    this.isGrenade = true;
    this.isMagnetic = false;
    this.homingTarget = null;
    this.nextRetargetAt = 0;
    this.fuseStartTime = this.scene.time.now;
    this.setTexture('bullet_grenade');
    this.setBlendMode(Phaser.BlendModes.NORMAL);
    this.setScale(1);
    this.setAlpha(1);
    this.enableBody(true, x, y, true, true);
    this.rotation = 0;
    this.setVelocity(Phaser.Math.Between(-30, 30), -320);
    const body = this.body as Phaser.Physics.Arcade.Body;
    if (body) body.setGravityY(180);
  }

  preUpdate(time: number, delta: number) {
    super.preUpdate(time, delta);
    if (!this.active) return;

    // Grenade fuse timer
    if (this.isGrenade) {
      this.rotation += delta * 0.008;
      if (time - this.fuseStartTime >= this.fuseTimeMs) {
        const sceneAny = this.scene as any;
        if (typeof sceneAny.onGrenadeExplode === 'function') {
          sceneAny.onGrenadeExplode(this.x, this.y);
        }
        const body = this.body as Phaser.Physics.Arcade.Body;
        if (body) body.setGravityY(0);
        this.disableBody(true, true);
        return;
      }
    } else if (this.isMagnetic) {
      const pulse = Math.sin(time * 0.02 + this.x * 0.04);
      this.setScale(1.03 + (pulse * 0.5 + 0.5) * 0.12);
      this.setAlpha(0.78 + (pulse * 0.5 + 0.5) * 0.2);
      this.handleHoming(time, delta);
    } else {
      this.setScale(1);
      this.setAlpha(1);
    }

    const w = this.scene.scale.width;
    const h = this.scene.scale.height;
    const pad = 150;
    if (this.y < -pad || this.y > h + pad || this.x < -pad || this.x > w + pad) {
      const body = this.body as Phaser.Physics.Arcade.Body;
      if (this.isGrenade && body) body.setGravityY(0);
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
  private readonly mobileBottomBoundMarginRatio: number = 0.06;
  private readonly mobileBottomBoundMarginMin: number = 18;
  private readonly mobileBottomBoundMarginMax: number = 54;
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
  private activeWeaponMode: 'normal' | 'double_fire' | 'rapid_fire' | 'grenade_launcher' = 'normal';
  private weaponFireRateMultiplier: number = 1;
  private weaponHeatMultiplier: number = 1;
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
      const texture = scene.textures.createCanvas('player_wireframe', 40, 40);
      if (texture) {
        const ctx = texture.getContext();
        const hullPoints = [
          { x: 20, y: 2 },
          { x: 33, y: 14 },
          { x: 38, y: 35 },
          { x: 28, y: 33 },
          { x: 20, y: 28 },
          { x: 12, y: 33 },
          { x: 2, y: 35 },
          { x: 7, y: 14 },
        ];
        const traceHull = (xOffset: number = 0, yOffset: number = 0) => {
          ctx.beginPath();
          ctx.moveTo(hullPoints[0].x + xOffset, hullPoints[0].y + yOffset);
          for (let i = 1; i < hullPoints.length; i++) {
            ctx.lineTo(hullPoints[i].x + xOffset, hullPoints[i].y + yOffset);
          }
          ctx.closePath();
        };
        ctx.clearRect(0, 0, 40, 40);

        traceHull(0.5, 1.5);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.fill();

        traceHull();
        const hullGradient = ctx.createLinearGradient(7, 4, 33, 34);
        hullGradient.addColorStop(0, '#57667a');
        hullGradient.addColorStop(0.42, '#263243');
        hullGradient.addColorStop(1, '#0f141d');
        ctx.fillStyle = hullGradient;
        ctx.fill();
        ctx.strokeStyle = 'rgba(231, 242, 255, 0.92)';
        ctx.lineWidth = 1.6;
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(20, 6);
        ctx.lineTo(29, 14);
        ctx.lineTo(32, 27);
        ctx.lineTo(20, 24);
        ctx.lineTo(8, 27);
        ctx.lineTo(11, 14);
        ctx.closePath();
        const panelGradient = ctx.createLinearGradient(20, 6, 20, 27);
        panelGradient.addColorStop(0, '#141e2d');
        panelGradient.addColorStop(1, '#090c12');
        ctx.fillStyle = panelGradient;
        ctx.fill();
        ctx.strokeStyle = 'rgba(132, 162, 198, 0.45)';
        ctx.lineWidth = 1;
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(20, 4);
        ctx.lineTo(20, 31);
        ctx.moveTo(10, 16);
        ctx.lineTo(30, 16);
        ctx.moveTo(12, 24);
        ctx.lineTo(28, 24);
        ctx.strokeStyle = 'rgba(226, 242, 255, 0.28)';
        ctx.lineWidth = 0.9;
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(8, 14);
        ctx.lineTo(19, 7);
        ctx.moveTo(32, 14);
        ctx.lineTo(21, 7);
        ctx.strokeStyle = 'rgba(248, 253, 255, 0.35)';
        ctx.lineWidth = 0.7;
        ctx.stroke();

        const canopyGlow = ctx.createRadialGradient(20, 16, 1.2, 20, 16, 7.5);
        canopyGlow.addColorStop(0, 'rgba(160, 236, 255, 1)');
        canopyGlow.addColorStop(0.52, 'rgba(90, 200, 255, 0.5)');
        canopyGlow.addColorStop(1, 'rgba(0, 120, 200, 0)');
        ctx.beginPath();
        ctx.arc(20, 16, 7.4, 0, Math.PI * 2);
        ctx.fillStyle = canopyGlow;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(20, 16, 4.8, 0, Math.PI * 2);
        const canopyCore = ctx.createRadialGradient(19, 15, 0.4, 20, 16, 5);
        canopyCore.addColorStop(0, 'rgba(235, 251, 255, 1)');
        canopyCore.addColorStop(1, 'rgba(46, 166, 233, 0.52)');
        ctx.fillStyle = canopyCore;
        ctx.fill();
        ctx.beginPath();
        ctx.arc(20, 16, 5.6, Math.PI * 0.18, Math.PI * 1.82);
        ctx.strokeStyle = 'rgba(184, 237, 255, 0.85)';
        ctx.lineWidth = 1;
        ctx.stroke();

        const lightStrip = ctx.createLinearGradient(0, 0, 0, 34);
        lightStrip.addColorStop(0, 'rgba(255,255,255,0.82)');
        lightStrip.addColorStop(1, 'rgba(136,182,219,0.12)');
        ctx.strokeStyle = lightStrip;
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(6.5, 17.5);
        ctx.lineTo(4.8, 29);
        ctx.moveTo(33.5, 17.5);
        ctx.lineTo(35.2, 29);
        ctx.stroke();

        ctx.fillStyle = 'rgba(8, 12, 19, 0.95)';
        ctx.fillRect(12.5, 26, 15, 4);
        const ventGlow = ctx.createLinearGradient(12.5, 26, 27.5, 26);
        ventGlow.addColorStop(0, 'rgba(145, 195, 226, 0.1)');
        ventGlow.addColorStop(0.5, 'rgba(216, 236, 255, 0.32)');
        ventGlow.addColorStop(1, 'rgba(145, 195, 226, 0.1)');
        ctx.fillStyle = ventGlow;
        ctx.fillRect(12.5, 26, 15, 1.2);
        ctx.strokeStyle = 'rgba(165, 193, 225, 0.42)';
        ctx.lineWidth = 0.8;
        ctx.strokeRect(12.5, 26, 15, 4);

        ctx.fillStyle = 'rgba(244, 251, 255, 0.9)';
        for (const rivet of [
          { x: 11.5, y: 21.5 },
          { x: 28.5, y: 21.5 },
          { x: 14, y: 30.5 },
          { x: 26, y: 30.5 },
        ]) {
          ctx.beginPath();
          ctx.arc(rivet.x, rivet.y, 0.85, 0, Math.PI * 2);
          ctx.fill();
        }

        texture.refresh();
      }
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
      const safeClearGroup = (group: any) => {
        if (!group || typeof group.clear !== 'function') return;
        if (!group.children || typeof group.children.size !== 'number') return;
        try {
          group.clear(true, true);
        } catch {
          // Ignore teardown races while the player is being destroyed.
        }
      };

      if (this.isDesktop) {
        this.scene.input.off('pointerdown', this.handlePointerDown, this);
        this.scene.input.off('pointerup', this.handlePointerUp, this);
      }
      this.spaceKey?.removeAllListeners();
      this.thrusterGraphics.destroy();
      this.powerUpGraphics.destroy();
      this.shieldGraphics.destroy();
      safeClearGroup(this.muzzleFlashes as any);
    });
  }

  public updateBounds(_width: number, height: number) {
    this.minBoundY = height * 0.66;
    const mobileBottomInset = this.isDesktop
      ? 0
      : Phaser.Math.Clamp(
          Math.round(height * this.mobileBottomBoundMarginRatio),
          this.mobileBottomBoundMarginMin,
          this.mobileBottomBoundMarginMax,
        );
    this.maxBoundY = height - mobileBottomInset;
    this.y = Phaser.Math.Clamp(this.y, this.minBoundY, this.maxBoundY);
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

  public setWeaponMode(
    mode: 'normal' | 'double_fire' | 'rapid_fire' | 'grenade_launcher',
    fireRateMul: number,
    heatMul: number,
  ) {
    this.activeWeaponMode = mode;
    this.weaponFireRateMultiplier = fireRateMul;
    this.weaponHeatMultiplier = heatMul;
  }

  public resetWeaponMode() {
    this.activeWeaponMode = 'normal';
    this.weaponFireRateMultiplier = 1;
    this.weaponHeatMultiplier = 1;
  }

  public getWeaponMode() {
    return this.activeWeaponMode;
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
    const flameOuter = this.hasCannonCooling ? 0xd9f1ff : 0xff5b2f;
    const flameMid = this.hasCannonCooling ? 0xf4fbff : 0xff9d4d;
    const flameCore = this.hasCannonCooling ? 0xffffff : 0xffe7ab;
    const pulse = 0.76 + Math.sin(this.scene.time.now * 0.02) * 0.24;
    const flickerBase = this.hasCannonCooling ? 13 : 11;
    const flicker = flickerBase + Phaser.Math.Between(4, 11);
    const tx = this.x;
    const ty = this.y + 14;
    const leftNozzleX = tx - 6;
    const rightNozzleX = tx + 6;

    this.thrusterGraphics.fillStyle(0x0a1018, 0.9);
    this.thrusterGraphics.fillRoundedRect(tx - 8, ty - 3, 16, 6, 2);
    this.thrusterGraphics.lineStyle(1, 0xa9bdd7, 0.55);
    this.thrusterGraphics.strokeRoundedRect(tx - 8, ty - 3, 16, 6, 2);

    this.thrusterGraphics.fillStyle(flameOuter, 0.24 + pulse * 0.17);
    this.thrusterGraphics.beginPath();
    this.thrusterGraphics.moveTo(tx - 11, ty - 1);
    this.thrusterGraphics.lineTo(tx + 11, ty - 1);
    this.thrusterGraphics.lineTo(tx + 4, ty + flicker + 3);
    this.thrusterGraphics.lineTo(tx - 4, ty + flicker + 3);
    this.thrusterGraphics.closePath();
    this.thrusterGraphics.fillPath();

    this.thrusterGraphics.lineStyle(1, flameOuter, 0.82);
    this.thrusterGraphics.fillStyle(flameOuter, 0.35 + pulse * 0.22);
    this.thrusterGraphics.beginPath();
    this.thrusterGraphics.moveTo(leftNozzleX, ty);
    this.thrusterGraphics.lineTo(rightNozzleX, ty);
    this.thrusterGraphics.lineTo(tx, ty + flicker);
    this.thrusterGraphics.closePath();
    this.thrusterGraphics.fillPath();
    this.thrusterGraphics.strokePath();

    this.thrusterGraphics.fillStyle(flameMid, 0.48 + pulse * 0.26);
    this.thrusterGraphics.beginPath();
    this.thrusterGraphics.moveTo(tx - 4.5, ty + 1);
    this.thrusterGraphics.lineTo(tx + 4.5, ty + 1);
    this.thrusterGraphics.lineTo(tx, ty + flicker * 0.82);
    this.thrusterGraphics.closePath();
    this.thrusterGraphics.fillPath();

    this.thrusterGraphics.fillStyle(flameCore, 0.5 + pulse * 0.28);
    this.thrusterGraphics.beginPath();
    this.thrusterGraphics.moveTo(tx - 2, ty + 2);
    this.thrusterGraphics.lineTo(tx + 2, ty + 2);
    this.thrusterGraphics.lineTo(tx, ty + flicker * 0.62);
    this.thrusterGraphics.closePath();
    this.thrusterGraphics.fillPath();

    for (let i = 0; i < 3; i++) {
      const y = ty + 3 + i * 3.1;
      const width = 2.3 - i * 0.55;
      this.thrusterGraphics.fillStyle(flameCore, 0.24 + pulse * 0.12 - i * 0.04);
      this.thrusterGraphics.fillEllipse(tx, y, width * 2, 1.25);
    }

    this.thrusterGraphics.lineStyle(1, flameOuter, 0.58);
    this.thrusterGraphics.beginPath();
    this.thrusterGraphics.moveTo(tx - 9, ty + 1);
    this.thrusterGraphics.lineTo(tx - 9, ty + 8 + Phaser.Math.Between(0, 4));
    this.thrusterGraphics.moveTo(tx + 9, ty + 1);
    this.thrusterGraphics.lineTo(tx + 9, ty + 8 + Phaser.Math.Between(0, 4));
    this.thrusterGraphics.strokePath();

    this.thrusterGraphics.fillStyle(flameMid, 0.34 + pulse * 0.2);
    this.thrusterGraphics.fillCircle(tx - 9, ty + 1.5, 1.4);
    this.thrusterGraphics.fillCircle(tx + 9, ty + 1.5, 1.4);
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
        const interval =
          (useBuffer ? this.fireRateTap : this.fireRateHold) * this.weaponFireRateMultiplier;
        this.nextFireTime = time + interval;
      }
    } else if (canFire && time >= this.nextFireTime && pointer.isDown) {
      this.fireBullet(time, false);
      this.nextFireTime = time + this.autoFireRate * this.weaponFireRateMultiplier;
    }
    if (!this.firedThisFrame) {
      this.coolHeat(delta);
    }
    this.updateHeatVisuals();
  }

  private fireBullet(time: number, manual: boolean) {
    if (!this.hasCannonCooling && time < this.overheatUntil) return;
    let didFire = false;
    const trySpawnBullet = (x: number, y: number, angle: number, isGrenade: boolean = false) => {
      if (!this.canSpawnBullet()) return false;
      const bullet = this.bullets.get(x, y) as Bullet;
      if (!bullet) return false;
      if (isGrenade) {
        bullet.fireGrenade(x, y);
      } else {
        bullet.fire(x, y, this.isMagnetic, angle);
      }
      return true;
    };

    const wm = this.activeWeaponMode;

    // Grenade launcher: fires a single grenade projectile
    if (wm === 'grenade_launcher') {
      didFire = trySpawnBullet(this.x, this.y - 25, -Math.PI / 2, true);
    } else {
      // Base bullet pattern
      const baseAngles: number[] = this.isTripleShot
        ? [-Math.PI / 2 - 0.2, -Math.PI / 2, -Math.PI / 2 + 0.2]
        : [-Math.PI / 2];

      for (const baseAngle of baseAngles) {
        if (wm === 'double_fire') {
          // Two parallel bullets with slight offset
          didFire = trySpawnBullet(this.x - 12, this.y - 25, baseAngle) || didFire;
          didFire = trySpawnBullet(this.x + 12, this.y - 25, baseAngle) || didFire;
        } else if (wm === 'rapid_fire') {
          // Single bullet with slight random spread
          const spread = Phaser.Math.FloatBetween(-0.05, 0.05);
          didFire = trySpawnBullet(this.x, this.y - 25, baseAngle + spread) || didFire;
        } else {
          didFire = trySpawnBullet(this.x, this.y - 25, baseAngle) || didFire;
        }
      }
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
    const sceneAny = this.scene as any;
    if (sceneAny.audio) sceneAny.audio.playShoot(manual);
    if (typeof sceneAny.onPlayerShot === 'function') {
      sceneAny.onPlayerShot(manual);
    }
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
    this.heat = Math.min(100, this.heat + this.heatPerShot * this.weaponHeatMultiplier);
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
