export type IntRange = readonly [number, number];

export type EliteDroneDeactivateReason = 'rescued' | 'shot' | 'expired' | 'reset';

export const LEVEL_TRANSITION_TUNING = {
  bossDefeatCelebrationDelayMs: 1600,
  beatMs: 1050,
} as const;

export const WORMHOLE_TUNING = {
  initialSpawnDelayMs: [13000, 21000] as IntRange,
  respawnDelayMs: [25000, 36000] as IntRange,
  ttlMs: [8200, 10800] as IntRange,
  velocityX: [-60, 60] as IntRange,
  velocityY: [-42, 42] as IntRange,
  motionPadding: 96,
  maxYRatio: 0.78,
  forceIntervalMs: 33,
  pullRadius: 250,
  enemyPullStrength: 16,
  bulletBendStrength: 24,
  bulletMaxSpeed: 760,
  outerRadiusBase: 34,
  outerRadiusWave: 4,
  innerRadiusBase: 19,
  innerRadiusWave: 3,
} as const;

export const ELITE_DRONE_TUNING = {
  initialSpawnDelayMs: [22000, 34000] as IntRange,
  postSpawnDelayMs: [28000, 42000] as IntRange,
  resetSpawnDelayMs: [16000, 26000] as IntRange,
  expiredSpawnDelayMs: [19000, 30000] as IntRange,
  resolvedSpawnDelayMs: [30000, 45000] as IntRange,
  lifetimeMs: [6300, 8200] as IntRange,
  speedBase: 210,
  speedPerLevel: 8,
  speedBonusCap: 120,
  outOfBoundsPadding: 140,
} as const;

export const pickEliteDroneSpawnDelayRange = (reason: EliteDroneDeactivateReason): IntRange => {
  if (reason === 'reset') return ELITE_DRONE_TUNING.resetSpawnDelayMs;
  if (reason === 'expired') return ELITE_DRONE_TUNING.expiredSpawnDelayMs;
  return ELITE_DRONE_TUNING.resolvedSpawnDelayMs;
};
