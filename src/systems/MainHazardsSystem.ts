import Phaser from 'phaser';
import { AudioManager } from '../AudioManager';
import { Enemy, EnemyManager } from '../EnemyManager';
import { GAME_HEIGHT, GAME_WIDTH } from '../gameConfig';
import { SHIELD_BUNKER_TUNING } from '../MainSceneTuning';
import { performanceMonitor } from '../PerformanceMonitor';
import type { Player } from '../Player';

interface MainHazardsSystemConfig {
  scene: Phaser.Scene;
  player: Player;
  enemyManager: EnemyManager;
  audio: AudioManager;
  shieldBunkers: Phaser.Physics.Arcade.StaticGroup;
  wingmanDroneTextureKey: string;
  shieldBunkerTextureKey: string;
  isShieldBunkerPowerActive: () => boolean;
}

/**
 * Handles hazard-like support systems that are not core to the main loop:
 * wingman drones, black hole visual/force, and shield bunker lifecycle/warnings.
 */
export class MainHazardsSystem {
  private readonly scene: Phaser.Scene;
  private readonly player: Player;
  private readonly enemyManager: EnemyManager;
  private readonly audio: AudioManager;
  private readonly shieldBunkers: Phaser.Physics.Arcade.StaticGroup;
  private readonly wingmanDroneTextureKey: string;
  private readonly shieldBunkerTextureKey: string;
  private readonly isShieldBunkerPowerActive: () => boolean;

  private drones: Phaser.GameObjects.Group | null = null;
  private blackHole: {
    x: number;
    y: number;
    active: boolean;
    graphics: Phaser.GameObjects.Graphics;
  } | null = null;
  private blackHoleForceAccumulatorMs: number = 0;
  private blackHoleVisualAccumulatorMs: number = 0;
  private shieldBunkerWarningStarted: boolean = false;
  private shieldBunkerWarningTween?: Phaser.Tweens.Tween;

  constructor(config: MainHazardsSystemConfig) {
    this.scene = config.scene;
    this.player = config.player;
    this.enemyManager = config.enemyManager;
    this.audio = config.audio;
    this.shieldBunkers = config.shieldBunkers;
    this.wingmanDroneTextureKey = config.wingmanDroneTextureKey;
    this.shieldBunkerTextureKey = config.shieldBunkerTextureKey;
    this.isShieldBunkerPowerActive = config.isShieldBunkerPowerActive;
  }

  public update(delta: number, shieldBunkerTimeLeftMs: number | null): void {
    if (shieldBunkerTimeLeftMs !== null) {
      this.maybeStartShieldBunkerExpiryWarning(shieldBunkerTimeLeftMs);
    }
    this.updateDrones();
    this.updateBlackHole(delta);
  }

  public destroy(): void {
    this.removeDrones();
    if (this.drones) {
      try {
        this.drones.destroy(true);
      } catch {
        // Ignore teardown races during scene shutdown.
      }
      this.drones = null;
    }
    this.removeBlackHole();
    this.stopShieldBunkerWarning(false);
  }

  public spawnDrones(): void {
    this.audio.playDrones();
    if (!this.drones) {
      this.drones = this.scene.add.group({ maxSize: 2 });
      for (let i = 0; i < 2; i++) {
        const drone = this.scene.add
          .image(this.player.x, this.player.y, this.wingmanDroneTextureKey)
          .setDepth(this.player.depth + 0.2)
          .setScale(1)
          .setAlpha(0.95)
          .setActive(false)
          .setVisible(false);
        this.drones.add(drone);
      }
    }

    const children = this.drones.getChildren() as Phaser.GameObjects.Image[];
    for (let i = 0; i < children.length; i++) {
      const drone = children[i];
      const offset = i === 0 ? -60 : 60;
      drone.x = this.player.x + offset;
      drone.y = this.player.y + 20;
      drone.rotation = 0;
      drone.setScale(1);
      drone.setAlpha(0.95);
      drone.setActive(true);
      drone.setVisible(true);
    }

    this.player.setDrones(this.drones);
  }

  public removeDrones(): void {
    this.player.setDrones(null);
    if (!this.drones) return;
    const groupAny = this.drones as any;
    let children: Phaser.GameObjects.Image[] = [];
    try {
      if (groupAny.children && Array.isArray(groupAny.children.entries)) {
        children = groupAny.children.entries as Phaser.GameObjects.Image[];
      } else if (typeof groupAny.getChildren === 'function') {
        children = groupAny.getChildren() as Phaser.GameObjects.Image[];
      }
    } catch {
      // Ignore teardown races during scene shutdown.
      return;
    }
    for (const drone of children) {
      drone.setActive(false);
      drone.setVisible(false);
    }
  }

  public spawnBlackHole(): void {
    if (this.blackHole?.active) return;
    this.audio.playBlackHole();
    this.audio.startBlackHoleLoop();
    const x = Phaser.Math.Between(Math.round(GAME_WIDTH * 0.2), Math.round(GAME_WIDTH * 0.8));
    const y = Phaser.Math.Between(Math.round(GAME_HEIGHT * 0.2), Math.round(GAME_HEIGHT * 0.5));
    const g = this.scene.add.graphics().setDepth(5);
    this.blackHoleVisualAccumulatorMs = performanceMonitor.reducedParticles ? 52 : 34;
    this.blackHoleForceAccumulatorMs = 0;
    this.blackHole = { x, y, active: true, graphics: g };
  }

  public removeBlackHole(): void {
    this.blackHole?.graphics.destroy();
    this.blackHole = null;
    this.blackHoleVisualAccumulatorMs = 0;
    this.blackHoleForceAccumulatorMs = 0;
    this.audio.stopBlackHoleLoop();
  }

  public spawnShieldBunkers(): void {
    if (!this.shieldBunkers || this.shieldBunkers.countActive(true) > 0) return;
    this.stopShieldBunkerWarning(false);
    const y = Math.round(this.scene.scale.height * SHIELD_BUNKER_TUNING.spawnYRatio);
    const layoutRatios =
      this.scene.scale.width <= SHIELD_BUNKER_TUNING.compactLayoutMaxWidth
        ? SHIELD_BUNKER_TUNING.compactLayoutRatios
        : SHIELD_BUNKER_TUNING.layoutRatios;
    const positions = layoutRatios.map((ratio) => Math.round(this.scene.scale.width * ratio));

    for (const x of positions) {
      const bunker = this.shieldBunkers.get(
        x,
        y,
        this.shieldBunkerTextureKey,
      ) as Phaser.Physics.Arcade.Image;
      if (!bunker) continue;
      bunker.setTexture(this.shieldBunkerTextureKey);
      bunker.setActive(true);
      bunker.setVisible(true);
      bunker.setDepth(66);
      bunker.setAlpha(SHIELD_BUNKER_TUNING.idleAlpha);
      const body = bunker.body as Phaser.Physics.Arcade.StaticBody | Phaser.Physics.Arcade.Body;
      if (body) body.enable = true;
      bunker.setPosition(x, y);
      bunker.refreshBody();
      this.scene.tweens.add({
        targets: bunker,
        alpha: SHIELD_BUNKER_TUNING.spawnPulseAlpha,
        duration: SHIELD_BUNKER_TUNING.spawnPulseDurationMs,
        yoyo: true,
        ease: 'Sine.easeOut',
      });
    }
  }

  public removeShieldBunkers(): void {
    const bunkers = this.getActiveShieldBunkers();
    if (bunkers.length > 0) {
      this.scene.tweens.killTweensOf(bunkers);
    }
    this.stopShieldBunkerWarning(false);
    for (const bunker of bunkers) {
      bunker.disableBody(true, true);
    }
  }

  public stopShieldBunkerWarning(restoreAlpha: boolean): void {
    if (this.shieldBunkerWarningTween) {
      this.shieldBunkerWarningTween.stop();
      this.shieldBunkerWarningTween = undefined;
    }
    this.shieldBunkerWarningStarted = false;
    if (!restoreAlpha) return;
    for (const bunker of this.getActiveShieldBunkers()) {
      bunker.setAlpha(SHIELD_BUNKER_TUNING.idleAlpha);
    }
  }

  public hasActiveShieldBunkers(): boolean {
    return this.isShieldBunkerPowerActive() || (this.shieldBunkers?.countActive(true) ?? 0) > 0;
  }

  private updateDrones(): void {
    if (!this.drones) return;
    const playerActive = this.player && this.player.active;
    const droneChildren = (this.drones as any).children;
    if (!droneChildren || typeof droneChildren.each !== 'function') return;
    droneChildren.each((drone: any, i: number) => {
      if (!playerActive) {
        drone.setVisible(false);
        return null;
      }
      drone.setVisible(true);
      const offset = i === 0 ? -60 : 60;
      const phase = this.scene.time.now * 0.006 + i * 1.2;
      const hover = Math.sin(phase) * 2.4;
      const targetY = this.player.y + 20 + hover;
      drone.x = Phaser.Math.Linear(drone.x, this.player.x + offset, 0.12);
      drone.y = Phaser.Math.Linear(drone.y, targetY, 0.12);
      drone.rotation = Math.sin(phase * 0.85) * 0.08;
      drone.setScale(1 + Math.sin(phase * 1.35) * 0.03);
      drone.setAlpha(0.88 + (Math.sin(phase) * 0.5 + 0.5) * 0.16);
      return null;
    });
  }

  private updateBlackHole(delta: number): void {
    if (!this.blackHole?.active) return;
    const { x, y, graphics } = this.blackHole;
    this.blackHoleVisualAccumulatorMs += delta;
    const visualInterval = performanceMonitor.reducedParticles ? 52 : 34;
    if (this.blackHoleVisualAccumulatorMs >= visualInterval) {
      this.blackHoleVisualAccumulatorMs = 0;
      graphics
        .clear()
        .lineStyle(2, 0xaa00ff, 0.8)
        .strokeCircle(x, y, 50 + Math.sin(this.scene.time.now * 0.01) * 10);
    }

    this.blackHoleForceAccumulatorMs += delta;
    if (this.blackHoleForceAccumulatorMs < 33) return;

    const forceScale = this.blackHoleForceAccumulatorMs / (1000 / 60);
    this.blackHoleForceAccumulatorMs = 0;
    const force = 10 * forceScale;
    const children = this.enemyManager.enemies.getChildren() as Enemy[];
    for (const enemy of children) {
      if (!enemy.active || !enemy.body) continue;
      const angle = Phaser.Math.Angle.Between(enemy.x, enemy.y, x, y);
      enemy.body.velocity.x += Math.cos(angle) * force;
      enemy.body.velocity.y += Math.sin(angle) * force;
    }
  }

  private getActiveShieldBunkers(): Phaser.Physics.Arcade.Image[] {
    if (!this.shieldBunkers) return [];
    return (this.shieldBunkers.getChildren() as Phaser.Physics.Arcade.Image[]).filter(
      (bunker) => bunker.active,
    );
  }

  private maybeStartShieldBunkerExpiryWarning(timeLeftMs: number): void {
    if (this.shieldBunkerWarningStarted) return;
    if (timeLeftMs > SHIELD_BUNKER_TUNING.warningLeadMs) return;
    const bunkers = this.getActiveShieldBunkers();
    if (bunkers.length === 0) return;

    this.shieldBunkerWarningStarted = true;
    this.scene.tweens.killTweensOf(bunkers);
    for (const bunker of bunkers) {
      bunker.setAlpha(SHIELD_BUNKER_TUNING.idleAlpha);
    }

    this.shieldBunkerWarningTween = this.scene.tweens.add({
      targets: bunkers,
      alpha: SHIELD_BUNKER_TUNING.spawnPulseAlpha,
      duration: SHIELD_BUNKER_TUNING.warningBlinkHalfPeriodMs,
      yoyo: true,
      repeat: Math.max(0, SHIELD_BUNKER_TUNING.warningBlinkCount - 1),
      ease: 'Sine.easeInOut',
      onComplete: () => {
        this.shieldBunkerWarningTween = undefined;
        if (!this.isShieldBunkerPowerActive()) return;
        for (const bunker of this.getActiveShieldBunkers()) {
          bunker.setAlpha(SHIELD_BUNKER_TUNING.idleAlpha);
        }
      },
    });
  }
}
