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
  levelTransitionGraceMs: 1400,
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

export const JUICE_TUNING = {
  hitStopCooldownMs: 120,
  eliteHitStopMs: 40,
  eliteHitStopScale: 0.26,
  bossHitStopMs: 55,
  bossHitStopScale: 0.18,
  bossKillHitStopMs: 82,
  bossKillHitStopScale: 0.1,
  playerHitStopMs: 88,
  playerHitStopScale: 0.14,
  largeAsteroidHitStopMs: 32,
  largeAsteroidHitStopScale: 0.32,
  largeAsteroidMinScale: 1.35,
  playerRecoilCooldownMs: 70,
  playerRecoilDurationMs: 58,
  playerRecoilIntensity: {
    easy: 0.001,
    normal: 0.00125,
    hard: 0.00155,
  } as Record<DifficultyPresetKey, number>,
  trailEmitIntervalMs: {
    full: 34,
    reduced: 68,
  },
  playerTrailCapPerTick: {
    full: 26,
    reduced: 10,
  },
  enemyTrailCapPerTick: {
    full: 18,
    reduced: 7,
  },
  damageOverlayDurationMs: 320,
  damageOverlayDurationByDifficultyMs: {
    easy: 360,
    normal: 320,
    hard: 280,
  } as Record<DifficultyPresetKey, number>,
  damageOverlayMaxAlpha: {
    easy: 0.2,
    normal: 0.24,
    hard: 0.3,
  } as Record<DifficultyPresetKey, number>,
  warpPulseDurationMs: {
    soft: 380,
    hard: 700,
  },
  warpPulseAlpha: {
    soft: 0.38,
    hard: 0.68,
  },
  warpLineCount: {
    full: 18,
    reduced: 10,
  },
  warpPulseDifficultyScale: {
    easy: {
      duration: 1.14,
      alpha: 0.9,
      lines: 0.88,
    },
    normal: {
      duration: 1,
      alpha: 1,
      lines: 1,
    },
    hard: {
      duration: 0.9,
      alpha: 1.16,
      lines: 1.14,
    },
  } as Record<DifficultyPresetKey, { duration: number; alpha: number; lines: number }>,
  bossTelegraphLeadScale: {
    easy: 1.16,
    normal: 1,
    hard: 0.86,
  } as Record<DifficultyPresetKey, number>,
  bossTelegraphAlphaScale: {
    easy: 0.92,
    normal: 1,
    hard: 1.14,
  } as Record<DifficultyPresetKey, number>,
} as const;

export const COMBO_TUNING = {
  timeWindowMs: 2500,
  thresholds: [
    { minKills: 0, multiplier: 1, color: '#ffffff', hudColor: '' },
    { minKills: 3, multiplier: 2, color: '#ffff00', hudColor: '#ffff00' },
    { minKills: 6, multiplier: 3, color: '#ff8800', hudColor: '#ff8800' },
    { minKills: 10, multiplier: 5, color: '#ff2200', hudColor: '#ff2200' },
    { minKills: 15, multiplier: 8, color: '#ff00ff', hudColor: '#ff00ff' },
  ],
  popupPoolSize: 20,
  popupRiseY: 48,
  popupDurationMs: 1400,
  popupHoldRatio: 0.35,
  popupFontSize: 13,
  popupDepth: 141,
} as const;

export const SWARM_TUNING = {
  minLevel: 2,
  spawnIntervalMs: [20000, 30000] as IntRange,
  initialDelayMs: [12000, 18000] as IntRange,
  countRange: [5, 8] as IntRange,
  scale: 0.45,
  speed: 260,
  spacingX: 52,
  spacingY: 28,
  bonusPerAsteroid: 50,
  fullSwarmBonusMultiplier: 3,
  swarmColor: 0x88ccff,
} as const;

export const MILESTONE_TUNING = {
  thresholds: [
    { score: 5000, label: 'NICE!', color: '#ffff00', flashColor: [255, 255, 100] as const },
    { score: 10000, label: 'GREAT!', color: '#ff8800', flashColor: [255, 180, 60] as const },
    { score: 25000, label: 'EXCELLENT!', color: '#ff4400', flashColor: [255, 100, 40] as const },
    { score: 50000, label: 'INCREDIBLE!', color: '#ff00ff', flashColor: [255, 80, 255] as const },
    { score: 100000, label: 'UNSTOPPABLE!', color: '#00ffff', flashColor: [80, 255, 255] as const },
  ],
  fontSize: 38,
  flashDurationMs: 200,
  flashAlpha: 160,
  textRiseY: 60,
  textDurationMs: 1800,
  textDepth: 145,
  shakeIntensity: 0.008,
  shakeDurationMs: 250,
} as const;

export const pickEliteDroneSpawnDelayRange = (reason: EliteDroneDeactivateReason): IntRange => {
  if (reason === 'reset') return ELITE_DRONE_TUNING.resetSpawnDelayMs;
  if (reason === 'expired') return ELITE_DRONE_TUNING.expiredSpawnDelayMs;
  return ELITE_DRONE_TUNING.resolvedSpawnDelayMs;
};
