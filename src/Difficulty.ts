export const DIFFICULTY_KEYS = ['easy', 'normal', 'hard'] as const;
export type DifficultyPresetKey = (typeof DIFFICULTY_KEYS)[number];

export type DifficultyPreset = {
  key: DifficultyPresetKey;
  label: string;
  enemySpeedScale: number;
  enemySpawnScale: number;
  enemyCapScale: number;
  powerUpDropScale: number;
  powerUpDurationScale: number;
  ufoSpawnRateScale: number;
  bossChanceScale: number;
  bossHealthScale: number;
  bossAggressionScale: number;
  bossProjectileSpeedScale: number;
  levelCurveScale: number;
};

export const DIFFICULTY_PRESETS: Record<DifficultyPresetKey, DifficultyPreset> = {
  easy: {
    key: 'easy',
    label: 'EASY',
    enemySpeedScale: 0.84,
    enemySpawnScale: 0.82,
    enemyCapScale: 0.88,
    powerUpDropScale: 1.28,
    powerUpDurationScale: 1.2,
    ufoSpawnRateScale: 0.82,
    bossChanceScale: 0.72,
    bossHealthScale: 0.8,
    bossAggressionScale: 0.82,
    bossProjectileSpeedScale: 0.88,
    levelCurveScale: 1.14,
  },
  normal: {
    key: 'normal',
    label: 'NORMAL',
    enemySpeedScale: 1,
    enemySpawnScale: 1,
    enemyCapScale: 1,
    powerUpDropScale: 1,
    powerUpDurationScale: 1,
    ufoSpawnRateScale: 1,
    bossChanceScale: 1,
    bossHealthScale: 1,
    bossAggressionScale: 1,
    bossProjectileSpeedScale: 1,
    levelCurveScale: 1,
  },
  hard: {
    key: 'hard',
    label: 'HARD',
    enemySpeedScale: 1.2,
    enemySpawnScale: 1.24,
    enemyCapScale: 1.14,
    powerUpDropScale: 0.72,
    powerUpDurationScale: 0.82,
    ufoSpawnRateScale: 1.25,
    bossChanceScale: 2,
    bossHealthScale: 1.35,
    bossAggressionScale: 1.3,
    bossProjectileSpeedScale: 1.25,
    levelCurveScale: 0.88,
  },
};

const STORAGE_KEY = 'spaceShooterDifficultyPreset';
const DEFAULT_KEY: DifficultyPresetKey = 'normal';

function parseDifficultyKey(value: string | null | undefined): DifficultyPresetKey | null {
  if (!value) return null;
  const normalized = value.toLowerCase();
  if (normalized === 'easy' || normalized === 'normal' || normalized === 'hard') {
    return normalized;
  }
  return null;
}

function resolveInitialDifficulty(): DifficultyPresetKey {
  if (typeof window === 'undefined') return DEFAULT_KEY;
  const fromQuery = parseDifficultyKey(
    new URLSearchParams(window.location.search).get('difficulty'),
  );
  if (fromQuery) return fromQuery;
  const fromStorage = parseDifficultyKey(window.localStorage.getItem(STORAGE_KEY));
  return fromStorage ?? DEFAULT_KEY;
}

let activeDifficultyKey: DifficultyPresetKey = resolveInitialDifficulty();

function persistDifficulty() {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, activeDifficultyKey);
}

export function getDifficultyPreset(key?: DifficultyPresetKey): DifficultyPreset {
  return DIFFICULTY_PRESETS[key ?? activeDifficultyKey];
}

export function getCurrentDifficultyKey(): DifficultyPresetKey {
  return activeDifficultyKey;
}

export function setCurrentDifficultyKey(key: DifficultyPresetKey) {
  activeDifficultyKey = key;
  persistDifficulty();
}

export function cycleDifficulty(direction: 1 | -1 = 1): DifficultyPresetKey {
  const index = DIFFICULTY_KEYS.indexOf(activeDifficultyKey);
  const nextIndex = (index + direction + DIFFICULTY_KEYS.length) % DIFFICULTY_KEYS.length;
  activeDifficultyKey = DIFFICULTY_KEYS[nextIndex];
  persistDifficulty();
  return activeDifficultyKey;
}

export function resolveDifficultyKey(input?: string | null): DifficultyPresetKey {
  return parseDifficultyKey(input) ?? activeDifficultyKey;
}
