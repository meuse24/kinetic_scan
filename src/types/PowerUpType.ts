/**
 * Power-Up Types
 * Extracted to avoid Phaser imports in tests
 */

export const PowerUpType = {
  TRIPLE_SHOT: 'TRIPLE_SHOT',
  SLOW_MOTION: 'SLOW_MOTION',
  SHIELD: 'SHIELD',
  EMP_WAVE: 'EMP_WAVE',
  GHOST_PHASE: 'GHOST_PHASE',
  WINGMAN_DRONES: 'WINGMAN_DRONES',
  CANNON_COOLING: 'CANNON_COOLING',
  BLACK_HOLE: 'BLACK_HOLE',
  SHIELD_BUNKER: 'SHIELD_BUNKER',
  MINE_LAYER: 'MINE_LAYER',
} as const;

export type PowerUpType = (typeof PowerUpType)[keyof typeof PowerUpType];
