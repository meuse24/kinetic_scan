import type { DifficultyPresetKey } from './Difficulty';

export type IntRange = readonly [number, number];
export type FloatRange = readonly [number, number];

export type EliteDroneDeactivateReason = 'rescued' | 'shot' | 'expired' | 'reset';
export type BackgroundDecorTier = 'off' | 'low' | 'medium' | 'high';

export const LEVEL_TRANSITION_TUNING = {
  bossDefeatCelebrationDelayMs: 1600,
  beatMs: 1050,
} as const;

export const BACKGROUND_DECOR_TUNING = {
  initialSpawnDelayMs: {
    low: [3500, 6200] as IntRange,
    medium: [2800, 5200] as IntRange,
    high: [2200, 4600] as IntRange,
  },
  respawnDelayMs: {
    low: [20000, 32000] as IntRange,
    medium: [15000, 24000] as IntRange,
    high: [11000, 19000] as IntRange,
  },
  maxActive: {
    low: 1,
    medium: 2,
    high: 3,
  },
  planetChancePercent: {
    low: 100,
    medium: 70,
    high: 55,
  },
  depth: -3,
  cullPadding: 260,
  alphaRange: [0.16, 0.32] as FloatRange,
  planetScaleRange: [0.48, 1.04] as FloatRange,
  clusterScaleRange: [0.7, 1.26] as FloatRange,
  verticalSpeedRange: [8, 30] as FloatRange,
  driftSpeedRange: [-16, 16] as FloatRange,
  spinRange: [-0.004, 0.004] as FloatRange,
} as const;

export const SPAWN_PROTECTION_TUNING = {
  startGraceMs: 2200,
  respawnGraceMs: 2500,
  switchGraceMs: 1900,
  clearRadius: 220,
  safeSpawnYOffset: 100,
} as const;

export const EARLY_LEVEL_TUNING: {
  rampDurationMs: Record<DifficultyPresetKey, number>;
  minIntensity: Record<DifficultyPresetKey, number>;
  scoreRampPortion: number;
  guaranteedSupportDropDelayMs: Record<DifficultyPresetKey, IntRange>;
  supportDropSpawnY: number;
} = {
  rampDurationMs: {
    easy: 24000,
    normal: 20000,
    hard: 17000,
  },
  minIntensity: {
    easy: 0.66,
    normal: 0.74,
    hard: 0.81,
  },
  scoreRampPortion: 0.45,
  guaranteedSupportDropDelayMs: {
    easy: [6500, 9000],
    normal: [7600, 10800],
    hard: [8200, 11800],
  },
  supportDropSpawnY: -42,
};

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

export const SHIELD_BUNKER_TUNING = {
  baseDurationMs: 18000,
  compactLayoutMaxWidth: 720,
  layoutRatios: [0.22, 0.5, 0.78] as const,
  compactLayoutRatios: [0.34, 0.66] as const,
  spawnYRatio: 0.78,
  idleAlpha: 0.95,
  spawnPulseAlpha: 0.7,
  spawnPulseDurationMs: 140,
  warningBlinkCount: 4,
  warningBlinkHalfPeriodMs: 160,
  warningLeadMs: 1400,
} as const;

export const pickEliteDroneSpawnDelayRange = (reason: EliteDroneDeactivateReason): IntRange => {
  if (reason === 'reset') return ELITE_DRONE_TUNING.resetSpawnDelayMs;
  if (reason === 'expired') return ELITE_DRONE_TUNING.expiredSpawnDelayMs;
  return ELITE_DRONE_TUNING.resolvedSpawnDelayMs;
};
