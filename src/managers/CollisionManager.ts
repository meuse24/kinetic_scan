/**
 * CollisionManager
 *
 * Manages all physics collision/overlap handlers for MainScene.
 * Handles the Phaser 3.90 argument-order bug where overlap callbacks
 * may receive arguments in swapped order.
 *
 * CRITICAL: In Phaser 3.90, physics.add.overlap(group, sprite, callback)
 * does NOT guarantee obj1 = group member, obj2 = sprite. Arguments can be SWAPPED.
 * Always use identity checks to determine which object is which.
 */

import type Phaser from 'phaser';
import type { Bullet, Player } from '../Player';
import type { Enemy } from '../EnemyManager';
import type { UFO, UFOProjectile } from '../UFO';
import type { PowerUp } from '../PowerUp';
import type { SkyRaider, SkyRaiderShot } from '../SkyRaider';

/**
 * Callback signatures for all collision handlers
 */
export interface CollisionCallbacks {
  // Bullet collisions
  onBulletHitEnemy: (bullet: Bullet, enemy: Enemy) => void;
  onBulletHitUFO: (bullet: Bullet, ufo: UFO) => void;
  onBulletHitEliteDrone: (bullet: Bullet, drone: Phaser.Physics.Arcade.Sprite) => void;
  onBulletHitSkyRaider: (bullet: Bullet, raider: SkyRaider) => void;
  onBulletHitShieldBunker: (bullet: Bullet, bunker: Phaser.Physics.Arcade.Sprite) => void;

  // Player collisions
  onPlayerHitEnemy: (player: Player, enemy: Enemy) => void;
  onPlayerHitPowerUp: (player: Player, powerUp: PowerUp) => void;
  onPlayerRescueEliteDrone: (player: Player, drone: Phaser.Physics.Arcade.Sprite) => void;
  onPlayerRescueAstronaut: (player: Player, astronaut: Phaser.Physics.Arcade.Sprite) => void;
  onPlayerHitUFOProjectile: (player: Player, projectile: UFOProjectile) => void;
  onPlayerHitSkyRaider: (player: Player, raider: SkyRaider) => void;
  onPlayerHitSkyRaiderShot: (player: Player, shot: SkyRaiderShot) => void;

  // Mine collisions
  onMineHitEnemy: (mine: Phaser.Physics.Arcade.Image, enemy: Enemy) => void;
  onMineHitUFO: (mine: Phaser.Physics.Arcade.Image, ufo: UFO) => void;
  onMineHitSkyRaider: (mine: Phaser.Physics.Arcade.Image, raider: SkyRaider) => void;

  // Shield bunker collisions
  onAsteroidHitShieldBunker: (enemy: Enemy, bunker: Phaser.Physics.Arcade.Sprite) => void;
  onUFOProjectileHitShieldBunker: (
    projectile: UFOProjectile,
    bunker: Phaser.Physics.Arcade.Sprite,
  ) => void;
  onSkyRaiderHitShieldBunker: (raider: SkyRaider, bunker: Phaser.Physics.Arcade.Sprite) => void;
  onSkyRaiderShotHitShieldBunker: (
    shot: SkyRaiderShot,
    bunker: Phaser.Physics.Arcade.Sprite,
  ) => void;
}

/**
 * Groups and sprites needed for collision registration
 */
export interface CollisionGroups {
  bullets: Phaser.Physics.Arcade.Group;
  player: Player;
  enemies: Phaser.Physics.Arcade.Group;
  ufo: UFO;
  powerUps: Phaser.Physics.Arcade.Group;
  eliteDrone: Phaser.Physics.Arcade.Sprite;
  astronaut: Phaser.Physics.Arcade.Group;
  ufoProjectiles?: Phaser.Physics.Arcade.Group;
  shieldBunkers: Phaser.Physics.Arcade.StaticGroup;
  proximityMines: Phaser.Physics.Arcade.Group;
  skyRaiders: Phaser.Physics.Arcade.Group;
  skyRaiderProjectiles: Phaser.Physics.Arcade.Group;
}

export class CollisionManager {
  private scene: Phaser.Scene;
  private callbacks: CollisionCallbacks;

  constructor(scene: Phaser.Scene, callbacks: CollisionCallbacks) {
    this.scene = scene;
    this.callbacks = callbacks;
  }

  /**
   * Register all collision handlers
   */
  registerCollisions(groups: CollisionGroups): void {
    // Bullet collisions
    this.scene.physics.add.overlap(
      groups.bullets,
      groups.enemies,
      (obj1, obj2) => this.handleBulletEnemyCollision(obj1, obj2, groups),
      undefined,
      this,
    );

    this.scene.physics.add.overlap(
      groups.bullets,
      groups.ufo,
      (obj1, obj2) => this.handleBulletUFOCollision(obj1, obj2, groups),
      undefined,
      this,
    );

    this.scene.physics.add.overlap(
      groups.bullets,
      groups.eliteDrone,
      (obj1, obj2) => this.handleBulletEliteDroneCollision(obj1, obj2, groups),
      undefined,
      this,
    );

    this.scene.physics.add.overlap(
      groups.bullets,
      groups.skyRaiders,
      (obj1, obj2) => this.handleBulletSkyRaiderCollision(obj1, obj2, groups),
      undefined,
      this,
    );

    this.scene.physics.add.collider(
      groups.bullets,
      groups.shieldBunkers,
      (obj1, obj2) => this.handleBulletShieldBunkerCollision(obj1, obj2),
      undefined,
      this,
    );

    // Player collisions
    this.scene.physics.add.collider(groups.player, groups.shieldBunkers);

    this.scene.physics.add.overlap(
      groups.player,
      groups.enemies,
      (obj1, obj2) => this.handlePlayerEnemyCollision(obj1, obj2, groups),
      undefined,
      this,
    );

    this.scene.physics.add.overlap(
      groups.player,
      groups.powerUps,
      (obj1, obj2) => this.handlePlayerPowerUpCollision(obj1, obj2, groups),
      undefined,
      this,
    );

    this.scene.physics.add.overlap(
      groups.player,
      groups.eliteDrone,
      (obj1, obj2) => this.handlePlayerEliteDroneCollision(obj1, obj2, groups),
      undefined,
      this,
    );

    this.scene.physics.add.overlap(
      groups.player,
      groups.astronaut,
      (obj1, obj2) => this.handlePlayerAstronautCollision(obj1, obj2, groups),
      undefined,
      this,
    );

    this.scene.physics.add.overlap(
      groups.player,
      groups.skyRaiders,
      (obj1, obj2) => this.handlePlayerSkyRaiderCollision(obj1, obj2, groups),
      undefined,
      this,
    );

    this.scene.physics.add.overlap(
      groups.player,
      groups.skyRaiderProjectiles,
      (obj1, obj2) => this.handlePlayerSkyRaiderShotCollision(obj1, obj2, groups),
      undefined,
      this,
    );

    // UFO projectile collisions (optional - UFO may not always have projectiles)
    if (groups.ufoProjectiles) {
      this.scene.physics.add.collider(
        groups.ufoProjectiles,
        groups.shieldBunkers,
        (obj1, obj2) => this.handleUFOProjectileShieldBunkerCollision(obj1, obj2),
        undefined,
        this,
      );

      this.scene.physics.add.overlap(
        groups.player,
        groups.ufoProjectiles,
        (obj1, obj2) => this.handlePlayerUFOProjectileCollision(obj1, obj2, groups),
        undefined,
        this,
      );
    }

    // Mine collisions
    this.scene.physics.add.overlap(
      groups.proximityMines,
      groups.enemies,
      (obj1, obj2) => this.handleMineEnemyCollision(obj1, obj2, groups),
      undefined,
      this,
    );

    this.scene.physics.add.overlap(
      groups.proximityMines,
      groups.ufo,
      (obj1, obj2) => this.handleMineUFOCollision(obj1, obj2, groups),
      undefined,
      this,
    );

    this.scene.physics.add.overlap(
      groups.proximityMines,
      groups.skyRaiders,
      (obj1, obj2) => this.handleMineSkyRaiderCollision(obj1, obj2, groups),
      undefined,
      this,
    );

    // Shield bunker collisions
    this.scene.physics.add.collider(
      groups.enemies,
      groups.shieldBunkers,
      (obj1, obj2) => this.handleEnemyShieldBunkerCollision(obj1, obj2),
      undefined,
      this,
    );

    this.scene.physics.add.collider(
      groups.skyRaiders,
      groups.shieldBunkers,
      (obj1, obj2) => this.handleSkyRaiderShieldBunkerCollision(obj1, obj2, groups),
      undefined,
      this,
    );

    this.scene.physics.add.collider(
      groups.skyRaiderProjectiles,
      groups.shieldBunkers,
      (obj1, obj2) => this.handleSkyRaiderShotShieldBunkerCollision(obj1, obj2),
      undefined,
      this,
    );
  }

  // ========== BULLET COLLISIONS ==========

  private handleBulletEnemyCollision(obj1: any, obj2: any, groups: CollisionGroups): void {
    // CRITICAL: Arguments can be swapped in Phaser 3.90
    const bullet = groups.bullets.contains(obj1) ? (obj1 as Bullet) : (obj2 as Bullet);
    const enemy = groups.enemies.contains(obj1) ? (obj1 as Enemy) : (obj2 as Enemy);

    if (!bullet?.active || !enemy?.active) return;

    this.callbacks.onBulletHitEnemy(bullet, enemy);
  }

  private handleBulletUFOCollision(obj1: any, obj2: any, groups: CollisionGroups): void {
    // CRITICAL: Arguments can be swapped
    const bullet = (obj1 === groups.ufo ? obj2 : obj1) as Bullet;
    const ufo = groups.ufo;

    if (!bullet?.active || !ufo?.active) return;

    this.callbacks.onBulletHitUFO(bullet, ufo);
  }

  private handleBulletEliteDroneCollision(obj1: any, obj2: any, groups: CollisionGroups): void {
    // CRITICAL: Arguments can be swapped
    const bullet = (obj1 === groups.eliteDrone ? obj2 : obj1) as Bullet;
    const drone = groups.eliteDrone;

    if (!bullet?.active || !drone?.active) return;

    this.callbacks.onBulletHitEliteDrone(bullet, drone);
  }

  private handleBulletSkyRaiderCollision(obj1: any, obj2: any, groups: CollisionGroups): void {
    // CRITICAL: Arguments can be swapped
    const bullet = groups.bullets.contains(obj1) ? (obj1 as Bullet) : (obj2 as Bullet);
    const raider = groups.skyRaiders.contains(obj1) ? (obj1 as SkyRaider) : (obj2 as SkyRaider);

    if (!bullet?.active || !raider?.active) return;

    this.callbacks.onBulletHitSkyRaider(bullet, raider);
  }

  private handleBulletShieldBunkerCollision(obj1: any, obj2: any): void {
    const bullet = obj1 as Bullet;
    const bunker = obj2 as Phaser.Physics.Arcade.Sprite;

    if (!bullet?.active || !bunker?.active) return;

    this.callbacks.onBulletHitShieldBunker(bullet, bunker);
  }

  // ========== PLAYER COLLISIONS ==========

  private handlePlayerEnemyCollision(obj1: any, obj2: any, groups: CollisionGroups): void {
    // CRITICAL: Arguments can be swapped
    const player = (obj1 === groups.player ? obj1 : obj2) as Player;
    const enemy = groups.enemies.contains(obj1) ? (obj1 as Enemy) : (obj2 as Enemy);

    if (!player?.active || !enemy?.active) return;

    this.callbacks.onPlayerHitEnemy(player, enemy);
  }

  private handlePlayerPowerUpCollision(obj1: any, obj2: any, groups: CollisionGroups): void {
    // CRITICAL: Arguments can be swapped
    const player = (obj1 === groups.player ? obj1 : obj2) as Player;
    const powerUp = groups.powerUps.contains(obj1) ? (obj1 as PowerUp) : (obj2 as PowerUp);

    if (!player?.active || !powerUp?.active) return;

    this.callbacks.onPlayerHitPowerUp(player, powerUp);
  }

  private handlePlayerEliteDroneCollision(obj1: any, obj2: any, groups: CollisionGroups): void {
    // CRITICAL: Arguments can be swapped
    const player = (obj1 === groups.player ? obj1 : obj2) as Player;
    const drone = groups.eliteDrone;

    if (!player?.active || !drone?.active) return;

    this.callbacks.onPlayerRescueEliteDrone(player, drone);
  }

  private handlePlayerAstronautCollision(obj1: any, obj2: any, groups: CollisionGroups): void {
    // CRITICAL: Arguments can be swapped
    const player = (obj1 === groups.player ? obj1 : obj2) as Player;
    const astronaut = groups.astronaut.contains(obj1)
      ? (obj1 as Phaser.Physics.Arcade.Sprite)
      : (obj2 as Phaser.Physics.Arcade.Sprite);

    if (!player?.active || !astronaut?.active) return;

    this.callbacks.onPlayerRescueAstronaut(player, astronaut);
  }

  private handlePlayerUFOProjectileCollision(obj1: any, obj2: any, groups: CollisionGroups): void {
    // CRITICAL: Arguments can be swapped
    const player = (obj1 === groups.player ? obj1 : obj2) as Player;
    const projectile = groups.ufoProjectiles?.contains(obj1)
      ? (obj1 as UFOProjectile)
      : (obj2 as UFOProjectile);

    if (!player?.active || !projectile?.active) return;

    this.callbacks.onPlayerHitUFOProjectile(player, projectile);
  }

  private handlePlayerSkyRaiderCollision(obj1: any, obj2: any, groups: CollisionGroups): void {
    // CRITICAL: Arguments can be swapped
    const player = (obj1 === groups.player ? obj1 : obj2) as Player;
    const raider = groups.skyRaiders.contains(obj1) ? (obj1 as SkyRaider) : (obj2 as SkyRaider);

    if (!player?.active || !raider?.active) return;

    this.callbacks.onPlayerHitSkyRaider(player, raider);
  }

  private handlePlayerSkyRaiderShotCollision(obj1: any, obj2: any, groups: CollisionGroups): void {
    // CRITICAL: Arguments can be swapped
    const player = (obj1 === groups.player ? obj1 : obj2) as Player;
    const shot = groups.skyRaiderProjectiles.contains(obj1)
      ? (obj1 as SkyRaiderShot)
      : (obj2 as SkyRaiderShot);

    if (!player?.active || !shot?.active) return;

    this.callbacks.onPlayerHitSkyRaiderShot(player, shot);
  }

  // ========== MINE COLLISIONS ==========

  private handleMineEnemyCollision(obj1: any, obj2: any, groups: CollisionGroups): void {
    // CRITICAL: Arguments can be swapped
    const mine = groups.proximityMines.contains(obj1)
      ? (obj1 as Phaser.Physics.Arcade.Image)
      : (obj2 as Phaser.Physics.Arcade.Image);
    const enemy = groups.enemies.contains(obj1) ? (obj1 as Enemy) : (obj2 as Enemy);

    if (!mine?.active || !enemy?.active) return;

    this.callbacks.onMineHitEnemy(mine, enemy);
  }

  private handleMineUFOCollision(obj1: any, obj2: any, groups: CollisionGroups): void {
    // CRITICAL: Arguments can be swapped
    const mine = groups.proximityMines.contains(obj1)
      ? (obj1 as Phaser.Physics.Arcade.Image)
      : (obj2 as Phaser.Physics.Arcade.Image);
    const ufo = groups.ufo;

    if (!mine?.active || !ufo?.active) return;

    this.callbacks.onMineHitUFO(mine, ufo);
  }

  private handleMineSkyRaiderCollision(obj1: any, obj2: any, groups: CollisionGroups): void {
    // CRITICAL: Arguments can be swapped
    const mine = groups.proximityMines.contains(obj1)
      ? (obj1 as Phaser.Physics.Arcade.Image)
      : (obj2 as Phaser.Physics.Arcade.Image);
    const raider = groups.skyRaiders.contains(obj1) ? (obj1 as SkyRaider) : (obj2 as SkyRaider);

    if (!mine?.active || !raider?.active) return;

    this.callbacks.onMineHitSkyRaider(mine, raider);
  }

  // ========== SHIELD BUNKER COLLISIONS ==========

  private handleEnemyShieldBunkerCollision(obj1: any, obj2: any): void {
    const enemy = obj1 as Enemy;
    const bunker = obj2 as Phaser.Physics.Arcade.Sprite;

    if (!enemy?.active || !bunker?.active) return;

    this.callbacks.onAsteroidHitShieldBunker(enemy, bunker);
  }

  private handleUFOProjectileShieldBunkerCollision(obj1: any, obj2: any): void {
    const projectile = obj1 as UFOProjectile;
    const bunker = obj2 as Phaser.Physics.Arcade.Sprite;

    if (!projectile?.active || !bunker?.active) return;

    this.callbacks.onUFOProjectileHitShieldBunker(projectile, bunker);
  }

  private handleSkyRaiderShieldBunkerCollision(
    obj1: any,
    obj2: any,
    groups: CollisionGroups,
  ): void {
    const raider = groups.skyRaiders.contains(obj1) ? (obj1 as SkyRaider) : (obj2 as SkyRaider);
    const bunker = groups.skyRaiders.contains(obj1)
      ? (obj2 as Phaser.Physics.Arcade.Sprite)
      : (obj1 as Phaser.Physics.Arcade.Sprite);

    if (!raider?.active || !bunker?.active) return;

    this.callbacks.onSkyRaiderHitShieldBunker(raider, bunker);
  }

  private handleSkyRaiderShotShieldBunkerCollision(obj1: any, obj2: any): void {
    const shot = obj1 as SkyRaiderShot;
    const bunker = obj2 as Phaser.Physics.Arcade.Sprite;

    if (!shot?.active || !bunker?.active) return;

    this.callbacks.onSkyRaiderShotHitShieldBunker(shot, bunker);
  }
}
