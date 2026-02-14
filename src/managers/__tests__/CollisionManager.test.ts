/**
 * CollisionManager Tests
 *
 * CRITICAL: Tests the Phaser 3.90 argument-order bug where overlap callbacks
 * may receive arguments in swapped order.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CollisionManager } from '../CollisionManager';
import type { CollisionCallbacks, CollisionGroups } from '../CollisionManager';

describe('CollisionManager', () => {
  let mockScene: any;
  let mockCallbacks: CollisionCallbacks;
  let mockGroups: CollisionGroups;
  let collisionManager: CollisionManager;

  // Mock objects
  let mockBullet: any;
  let mockEnemy: any;
  let mockUFO: any;
  let mockPlayer: any;
  let mockPowerUp: any;
  let mockEliteDrone: any;
  let mockAstronaut: any;
  let mockMine: any;
  let mockSkyRaider: any;
  let mockUFOProjectile: any;
  let mockSkyRaiderShot: any;
  let mockShieldBunker: any;

  beforeEach(() => {
    // Create mock scene
    mockScene = {
      physics: {
        add: {
          overlap: vi.fn(),
          collider: vi.fn(),
        },
      },
    };

    // Create mock game objects
    mockBullet = {
      active: true,
      x: 100,
      y: 100,
      disableBody: vi.fn(),
      isGrenadeProjectile: vi.fn(() => false),
    };
    mockEnemy = { active: true, x: 200, y: 200, disableBody: vi.fn(), scaleX: 1 };
    mockUFO = { active: true, x: 300, y: 300 };
    mockPlayer = { active: true, x: 50, y: 50 };
    mockPowerUp = { active: true, x: 150, y: 150 };
    mockEliteDrone = { active: true, x: 250, y: 250 };
    mockAstronaut = { active: true, x: 275, y: 225 };
    mockMine = { active: true, x: 350, y: 350 };
    mockSkyRaider = { active: true, x: 400, y: 400, getVariant: vi.fn(() => 'scout') };
    mockUFOProjectile = { active: true, x: 450, y: 450 };
    mockSkyRaiderShot = { active: true, x: 500, y: 500 };
    mockShieldBunker = { active: true, x: 550, y: 550 };

    // Create mock groups
    const createMockGroup = (members: any[]) => ({
      contains: vi.fn((obj: any) => members.includes(obj)),
    });

    mockGroups = {
      bullets: createMockGroup([mockBullet]),
      player: mockPlayer,
      enemies: createMockGroup([mockEnemy]),
      ufo: mockUFO,
      powerUps: createMockGroup([mockPowerUp]),
      eliteDrone: mockEliteDrone,
      astronaut: createMockGroup([mockAstronaut]),
      ufoProjectiles: createMockGroup([mockUFOProjectile]),
      shieldBunkers: createMockGroup([mockShieldBunker]),
      proximityMines: createMockGroup([mockMine]),
      skyRaiders: createMockGroup([mockSkyRaider]),
      skyRaiderProjectiles: createMockGroup([mockSkyRaiderShot]),
    };

    // Create mock callbacks
    mockCallbacks = {
      onBulletHitEnemy: vi.fn(),
      onBulletHitUFO: vi.fn(),
      onBulletHitEliteDrone: vi.fn(),
      onBulletHitSkyRaider: vi.fn(),
      onBulletHitShieldBunker: vi.fn(),
      onPlayerHitEnemy: vi.fn(),
      onPlayerHitPowerUp: vi.fn(),
      onPlayerRescueEliteDrone: vi.fn(),
      onPlayerRescueAstronaut: vi.fn(),
      onPlayerHitUFOProjectile: vi.fn(),
      onPlayerHitSkyRaider: vi.fn(),
      onPlayerHitSkyRaiderShot: vi.fn(),
      onMineHitEnemy: vi.fn(),
      onMineHitUFO: vi.fn(),
      onMineHitSkyRaider: vi.fn(),
      onAsteroidHitShieldBunker: vi.fn(),
      onUFOProjectileHitShieldBunker: vi.fn(),
      onSkyRaiderHitShieldBunker: vi.fn(),
      onSkyRaiderShotHitShieldBunker: vi.fn(),
    };

    collisionManager = new CollisionManager(mockScene, mockCallbacks);
  });

  describe('constructor', () => {
    it('should store scene and callbacks', () => {
      expect(collisionManager['scene']).toBe(mockScene);
      expect(collisionManager['callbacks']).toBe(mockCallbacks);
    });
  });

  describe('registerCollisions', () => {
    it('should register all collision handlers', () => {
      collisionManager.registerCollisions(mockGroups);

      // Should register 18+ collision handlers
      const totalOverlaps = mockScene.physics.add.overlap.mock.calls.length;
      const totalColliders = mockScene.physics.add.collider.mock.calls.length;

      expect(totalOverlaps).toBeGreaterThanOrEqual(12);
      expect(totalColliders).toBeGreaterThanOrEqual(6);
    });

    it('should pass correct context to handlers', () => {
      collisionManager.registerCollisions(mockGroups);

      // Check that context is set correctly
      const overlapCalls = mockScene.physics.add.overlap.mock.calls;
      overlapCalls.forEach((call) => {
        expect(call[4]).toBe(collisionManager); // context should be manager
      });
    });

    it('should handle missing ufoProjectiles gracefully', () => {
      const groupsWithoutUFOProjectiles = {
        ...mockGroups,
        ufoProjectiles: undefined,
      };

      expect(() => {
        collisionManager.registerCollisions(groupsWithoutUFOProjectiles);
      }).not.toThrow();
    });
  });

  describe('CRITICAL: Phaser 3.90 argument-order bug handling', () => {
    it('should handle swapped arguments for bullet vs enemy', () => {
      collisionManager.registerCollisions(mockGroups);

      // Find the bullet-enemy collision handler
      const bulletEnemyCall = mockScene.physics.add.overlap.mock.calls.find(
        (call) => call[0] === mockGroups.bullets && call[1] === mockGroups.enemies,
      );
      const handler = bulletEnemyCall[2];

      // Test normal order: (bullet, enemy)
      handler(mockBullet, mockEnemy);
      expect(mockCallbacks.onBulletHitEnemy).toHaveBeenCalledWith(mockBullet, mockEnemy);

      mockCallbacks.onBulletHitEnemy.mockClear();

      // Test SWAPPED order: (enemy, bullet) - THE BUG!
      handler(mockEnemy, mockBullet);
      expect(mockCallbacks.onBulletHitEnemy).toHaveBeenCalledWith(mockBullet, mockEnemy);
    });

    it('should handle swapped arguments for bullet vs UFO', () => {
      collisionManager.registerCollisions(mockGroups);

      const bulletUFOCall = mockScene.physics.add.overlap.mock.calls.find(
        (call) => call[0] === mockGroups.bullets && call[1] === mockGroups.ufo,
      );
      const handler = bulletUFOCall[2];

      // Test normal order
      handler(mockBullet, mockUFO);
      expect(mockCallbacks.onBulletHitUFO).toHaveBeenCalledWith(mockBullet, mockUFO);

      mockCallbacks.onBulletHitUFO.mockClear();

      // Test SWAPPED order - THE BUG!
      handler(mockUFO, mockBullet);
      expect(mockCallbacks.onBulletHitUFO).toHaveBeenCalledWith(mockBullet, mockUFO);
    });

    it('should handle swapped arguments for player vs enemy', () => {
      collisionManager.registerCollisions(mockGroups);

      const playerEnemyCall = mockScene.physics.add.overlap.mock.calls.find(
        (call) => call[0] === mockGroups.player && call[1] === mockGroups.enemies,
      );
      const handler = playerEnemyCall[2];

      // Test normal order
      handler(mockPlayer, mockEnemy);
      expect(mockCallbacks.onPlayerHitEnemy).toHaveBeenCalledWith(mockPlayer, mockEnemy);

      mockCallbacks.onPlayerHitEnemy.mockClear();

      // Test SWAPPED order - THE BUG!
      handler(mockEnemy, mockPlayer);
      expect(mockCallbacks.onPlayerHitEnemy).toHaveBeenCalledWith(mockPlayer, mockEnemy);
    });

    it('should handle swapped arguments for mine vs UFO', () => {
      collisionManager.registerCollisions(mockGroups);

      const mineUFOCall = mockScene.physics.add.overlap.mock.calls.find(
        (call) => call[0] === mockGroups.proximityMines && call[1] === mockGroups.ufo,
      );
      const handler = mineUFOCall[2];

      // Test normal order
      handler(mockMine, mockUFO);
      expect(mockCallbacks.onMineHitUFO).toHaveBeenCalledWith(mockMine, mockUFO);

      mockCallbacks.onMineHitUFO.mockClear();

      // Test SWAPPED order - THE BUG!
      handler(mockUFO, mockMine);
      expect(mockCallbacks.onMineHitUFO).toHaveBeenCalledWith(mockMine, mockUFO);
    });
  });

  describe('inactive object handling', () => {
    it('should ignore collision if bullet is inactive', () => {
      collisionManager.registerCollisions(mockGroups);
      mockBullet.active = false;

      const bulletEnemyCall = mockScene.physics.add.overlap.mock.calls.find(
        (call) => call[0] === mockGroups.bullets && call[1] === mockGroups.enemies,
      );
      const handler = bulletEnemyCall[2];

      handler(mockBullet, mockEnemy);

      expect(mockCallbacks.onBulletHitEnemy).not.toHaveBeenCalled();
    });

    it('should ignore collision if enemy is inactive', () => {
      collisionManager.registerCollisions(mockGroups);
      mockEnemy.active = false;

      const bulletEnemyCall = mockScene.physics.add.overlap.mock.calls.find(
        (call) => call[0] === mockGroups.bullets && call[1] === mockGroups.enemies,
      );
      const handler = bulletEnemyCall[2];

      handler(mockBullet, mockEnemy);

      expect(mockCallbacks.onBulletHitEnemy).not.toHaveBeenCalled();
    });

    it('should ignore collision if UFO is inactive', () => {
      collisionManager.registerCollisions(mockGroups);
      mockUFO.active = false;

      const bulletUFOCall = mockScene.physics.add.overlap.mock.calls.find(
        (call) => call[0] === mockGroups.bullets && call[1] === mockGroups.ufo,
      );
      const handler = bulletUFOCall[2];

      handler(mockBullet, mockUFO);

      expect(mockCallbacks.onBulletHitUFO).not.toHaveBeenCalled();
    });

    it('should ignore collision if player is inactive', () => {
      collisionManager.registerCollisions(mockGroups);
      mockPlayer.active = false;

      const playerEnemyCall = mockScene.physics.add.overlap.mock.calls.find(
        (call) => call[0] === mockGroups.player && call[1] === mockGroups.enemies,
      );
      const handler = playerEnemyCall[2];

      handler(mockPlayer, mockEnemy);

      expect(mockCallbacks.onPlayerHitEnemy).not.toHaveBeenCalled();
    });

    it('should ignore bullet collisions against enemies for grenade projectiles', () => {
      collisionManager.registerCollisions(mockGroups);
      mockBullet.isGrenadeProjectile.mockReturnValue(true);

      const bulletEnemyCall = mockScene.physics.add.overlap.mock.calls.find(
        (call) => call[0] === mockGroups.bullets && call[1] === mockGroups.enemies,
      );
      const handler = bulletEnemyCall[2];

      handler(mockBullet, mockEnemy);

      expect(mockCallbacks.onBulletHitEnemy).not.toHaveBeenCalled();
    });

    it('should ignore bullet collisions against UFO for grenade projectiles', () => {
      collisionManager.registerCollisions(mockGroups);
      mockBullet.isGrenadeProjectile.mockReturnValue(true);

      const bulletUFOCall = mockScene.physics.add.overlap.mock.calls.find(
        (call) => call[0] === mockGroups.bullets && call[1] === mockGroups.ufo,
      );
      const handler = bulletUFOCall[2];

      handler(mockBullet, mockUFO);

      expect(mockCallbacks.onBulletHitUFO).not.toHaveBeenCalled();
    });

    it('should ignore bullet collisions against sky raiders for grenade projectiles', () => {
      collisionManager.registerCollisions(mockGroups);
      mockBullet.isGrenadeProjectile.mockReturnValue(true);

      const bulletSkyRaiderCall = mockScene.physics.add.overlap.mock.calls.find(
        (call) => call[0] === mockGroups.bullets && call[1] === mockGroups.skyRaiders,
      );
      const handler = bulletSkyRaiderCall[2];

      handler(mockBullet, mockSkyRaider);

      expect(mockCallbacks.onBulletHitSkyRaider).not.toHaveBeenCalled();
    });

    it('should ignore bullet collisions against shield bunkers for grenade projectiles', () => {
      collisionManager.registerCollisions(mockGroups);
      mockBullet.isGrenadeProjectile.mockReturnValue(true);

      const bulletBunkerCall = mockScene.physics.add.collider.mock.calls.find(
        (call) => call[0] === mockGroups.bullets && call[1] === mockGroups.shieldBunkers,
      );
      const handler = bulletBunkerCall[2];

      handler(mockBullet, mockShieldBunker);

      expect(mockCallbacks.onBulletHitShieldBunker).not.toHaveBeenCalled();
    });
  });

  describe('callback invocation', () => {
    beforeEach(() => {
      collisionManager.registerCollisions(mockGroups);
    });

    it('should invoke onBulletHitEliteDrone callback', () => {
      const bulletEliteDroneCall = mockScene.physics.add.overlap.mock.calls.find(
        (call) => call[0] === mockGroups.bullets && call[1] === mockGroups.eliteDrone,
      );
      const handler = bulletEliteDroneCall[2];

      handler(mockBullet, mockEliteDrone);

      expect(mockCallbacks.onBulletHitEliteDrone).toHaveBeenCalledWith(mockBullet, mockEliteDrone);
    });

    it('should invoke onBulletHitSkyRaider callback', () => {
      const bulletSkyRaiderCall = mockScene.physics.add.overlap.mock.calls.find(
        (call) => call[0] === mockGroups.bullets && call[1] === mockGroups.skyRaiders,
      );
      const handler = bulletSkyRaiderCall[2];

      handler(mockBullet, mockSkyRaider);

      expect(mockCallbacks.onBulletHitSkyRaider).toHaveBeenCalledWith(mockBullet, mockSkyRaider);
    });

    it('should invoke onPlayerHitPowerUp callback', () => {
      const playerPowerUpCall = mockScene.physics.add.overlap.mock.calls.find(
        (call) => call[0] === mockGroups.player && call[1] === mockGroups.powerUps,
      );
      const handler = playerPowerUpCall[2];

      handler(mockPlayer, mockPowerUp);

      expect(mockCallbacks.onPlayerHitPowerUp).toHaveBeenCalledWith(mockPlayer, mockPowerUp);
    });

    it('should invoke onPlayerRescueEliteDrone callback', () => {
      const playerEliteDroneCall = mockScene.physics.add.overlap.mock.calls.find(
        (call) => call[0] === mockGroups.player && call[1] === mockGroups.eliteDrone,
      );
      const handler = playerEliteDroneCall[2];

      handler(mockPlayer, mockEliteDrone);

      expect(mockCallbacks.onPlayerRescueEliteDrone).toHaveBeenCalledWith(
        mockPlayer,
        mockEliteDrone,
      );
    });

    it('should invoke onPlayerRescueAstronaut callback', () => {
      const playerAstronautCall = mockScene.physics.add.overlap.mock.calls.find(
        (call) => call[0] === mockGroups.player && call[1] === mockGroups.astronaut,
      );
      const handler = playerAstronautCall[2];

      handler(mockPlayer, mockAstronaut);

      expect(mockCallbacks.onPlayerRescueAstronaut).toHaveBeenCalledWith(mockPlayer, mockAstronaut);
    });

    it('should invoke onPlayerHitUFOProjectile callback', () => {
      const playerUFOProjectileCall = mockScene.physics.add.overlap.mock.calls.find(
        (call) => call[0] === mockGroups.player && call[1] === mockGroups.ufoProjectiles,
      );
      const handler = playerUFOProjectileCall[2];

      handler(mockPlayer, mockUFOProjectile);

      expect(mockCallbacks.onPlayerHitUFOProjectile).toHaveBeenCalledWith(
        mockPlayer,
        mockUFOProjectile,
      );
    });

    it('should invoke onPlayerHitSkyRaider callback', () => {
      const playerSkyRaiderCall = mockScene.physics.add.overlap.mock.calls.find(
        (call) => call[0] === mockGroups.player && call[1] === mockGroups.skyRaiders,
      );
      const handler = playerSkyRaiderCall[2];

      handler(mockPlayer, mockSkyRaider);

      expect(mockCallbacks.onPlayerHitSkyRaider).toHaveBeenCalledWith(mockPlayer, mockSkyRaider);
    });

    it('should invoke onPlayerHitSkyRaiderShot callback', () => {
      const playerSkyRaiderShotCall = mockScene.physics.add.overlap.mock.calls.find(
        (call) => call[0] === mockGroups.player && call[1] === mockGroups.skyRaiderProjectiles,
      );
      const handler = playerSkyRaiderShotCall[2];

      handler(mockPlayer, mockSkyRaiderShot);

      expect(mockCallbacks.onPlayerHitSkyRaiderShot).toHaveBeenCalledWith(
        mockPlayer,
        mockSkyRaiderShot,
      );
    });

    it('should invoke onMineHitEnemy callback', () => {
      const mineEnemyCall = mockScene.physics.add.overlap.mock.calls.find(
        (call) => call[0] === mockGroups.proximityMines && call[1] === mockGroups.enemies,
      );
      const handler = mineEnemyCall[2];

      handler(mockMine, mockEnemy);

      expect(mockCallbacks.onMineHitEnemy).toHaveBeenCalledWith(mockMine, mockEnemy);
    });

    it('should invoke onMineHitSkyRaider callback', () => {
      const mineSkyRaiderCall = mockScene.physics.add.overlap.mock.calls.find(
        (call) => call[0] === mockGroups.proximityMines && call[1] === mockGroups.skyRaiders,
      );
      const handler = mineSkyRaiderCall[2];

      handler(mockMine, mockSkyRaider);

      expect(mockCallbacks.onMineHitSkyRaider).toHaveBeenCalledWith(mockMine, mockSkyRaider);
    });

    it('should invoke onBulletHitShieldBunker callback', () => {
      const bulletBunkerCall = mockScene.physics.add.collider.mock.calls.find(
        (call) => call[0] === mockGroups.bullets && call[1] === mockGroups.shieldBunkers,
      );
      const handler = bulletBunkerCall[2];

      handler(mockBullet, mockShieldBunker);

      expect(mockCallbacks.onBulletHitShieldBunker).toHaveBeenCalledWith(
        mockBullet,
        mockShieldBunker,
      );
    });

    it('should invoke onAsteroidHitShieldBunker callback', () => {
      const enemyBunkerCall = mockScene.physics.add.collider.mock.calls.find(
        (call) => call[0] === mockGroups.enemies && call[1] === mockGroups.shieldBunkers,
      );
      const handler = enemyBunkerCall[2];

      handler(mockEnemy, mockShieldBunker);

      expect(mockCallbacks.onAsteroidHitShieldBunker).toHaveBeenCalledWith(
        mockEnemy,
        mockShieldBunker,
      );
    });

    it('should invoke onUFOProjectileHitShieldBunker callback', () => {
      const ufoProjectileBunkerCall = mockScene.physics.add.collider.mock.calls.find(
        (call) => call[0] === mockGroups.ufoProjectiles && call[1] === mockGroups.shieldBunkers,
      );
      const handler = ufoProjectileBunkerCall[2];

      handler(mockUFOProjectile, mockShieldBunker);

      expect(mockCallbacks.onUFOProjectileHitShieldBunker).toHaveBeenCalledWith(
        mockUFOProjectile,
        mockShieldBunker,
      );
    });

    it('should invoke onSkyRaiderHitShieldBunker callback', () => {
      const skyRaiderBunkerCall = mockScene.physics.add.collider.mock.calls.find(
        (call) => call[0] === mockGroups.skyRaiders && call[1] === mockGroups.shieldBunkers,
      );
      const handler = skyRaiderBunkerCall[2];

      handler(mockSkyRaider, mockShieldBunker);

      expect(mockCallbacks.onSkyRaiderHitShieldBunker).toHaveBeenCalledWith(
        mockSkyRaider,
        mockShieldBunker,
      );
    });

    it('should invoke onSkyRaiderShotHitShieldBunker callback', () => {
      const skyRaiderShotBunkerCall = mockScene.physics.add.collider.mock.calls.find(
        (call) =>
          call[0] === mockGroups.skyRaiderProjectiles && call[1] === mockGroups.shieldBunkers,
      );
      const handler = skyRaiderShotBunkerCall[2];

      handler(mockSkyRaiderShot, mockShieldBunker);

      expect(mockCallbacks.onSkyRaiderShotHitShieldBunker).toHaveBeenCalledWith(
        mockSkyRaiderShot,
        mockShieldBunker,
      );
    });
  });
});
