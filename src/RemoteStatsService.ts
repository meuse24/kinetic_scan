export type RemoteLeaderboardMode = 'normal' | 'daily';

export type RemoteScoreEntry = {
  name: string;
  score: number;
  timestamp?: string;
};

export type RemoteStatsSnapshot = {
  mode: RemoteLeaderboardMode;
  highscores: RemoteScoreEntry[];
  coinsSpent: number;
  totalUsers: number;
  activeUsers: number;
  uniqueUsers: number;
  updatedAt: string;
};

type SnapshotCacheEntry = {
  snapshot: RemoteStatsSnapshot;
  fetchedAt: number;
};

type RemoteEventAction = 'register_user' | 'consume_coins' | 'submit_highscore';

type QueuedRemoteEvent = {
  action: RemoteEventAction;
  data: Record<string, unknown>;
  queuedAt: number;
  tries: number;
};

const CLIENT_ID_STORAGE_KEY = 'spaceShooterClientId';
const DEFAULT_API_ENDPOINT = 'api/stats.php';
const SNAPSHOT_TTL_MS = 15_000;
const REQUEST_TIMEOUT_MS = 2_400;
const SNAPSHOT_CACHE_STORAGE_KEY = 'spaceShooterRemoteStatsSnapshotCacheV1';
const PENDING_EVENTS_STORAGE_KEY = 'spaceShooterRemoteStatsPendingEventsV1';
const MAX_PENDING_EVENTS = 120;
const RETRY_DELAY_ON_FAILURE_MS = 2600;

function isNetworkOnline() {
  if (typeof navigator === 'undefined') return true;
  return navigator.onLine !== false;
}

function resolveApiEndpoint() {
  const endpoint = (import.meta as any)?.env?.VITE_STATS_API;
  if (typeof endpoint === 'string' && endpoint.trim().length > 0) {
    return endpoint.trim();
  }
  return DEFAULT_API_ENDPOINT;
}

function loadOrCreateClientId() {
  try {
    const existing = localStorage.getItem(CLIENT_ID_STORAGE_KEY);
    if (existing && existing.length > 6) return existing;
  } catch {
    // Ignore storage failures.
  }

  const randomPart =
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  const nextId = `u-${randomPart}`.slice(0, 64);
  try {
    localStorage.setItem(CLIENT_ID_STORAGE_KEY, nextId);
  } catch {
    // Ignore storage failures.
  }
  return nextId;
}

function sanitizeLeaderboardMode(mode: string | undefined): RemoteLeaderboardMode {
  return mode === 'daily' ? 'daily' : 'normal';
}

function normalizeName(value: string) {
  const cleaned = value
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 12);
  return cleaned.length > 0 ? cleaned : '---';
}

function normalizeScore(value: unknown) {
  const parsed = Number.isFinite(Number(value)) ? Math.floor(Number(value)) : 0;
  return Math.max(0, parsed);
}

function normalizeRows(input: unknown): RemoteScoreEntry[] {
  if (!Array.isArray(input)) return [];
  const rows: RemoteScoreEntry[] = [];
  for (const raw of input) {
    if (!raw || typeof raw !== 'object') continue;
    const nameRaw = (raw as any).name;
    const scoreRaw = (raw as any).score;
    if (typeof nameRaw !== 'string') continue;
    const score = normalizeScore(scoreRaw);
    if (score <= 0) continue;
    const timestampRaw = (raw as any).timestamp;
    rows.push({
      name: normalizeName(nameRaw),
      score,
      timestamp: typeof timestampRaw === 'string' ? timestampRaw : undefined,
    });
  }
  rows.sort((a, b) => b.score - a.score);
  return rows.slice(0, 25);
}

function parseSnapshotPayload(
  payload: unknown,
  fallbackMode: RemoteLeaderboardMode,
): RemoteStatsSnapshot | null {
  if (!payload || typeof payload !== 'object') return null;
  const mode = sanitizeLeaderboardMode((payload as any).mode ?? fallbackMode);
  const totalUsers = normalizeScore((payload as any).totalUsers ?? (payload as any).uniqueUsers);
  const activeUsers = normalizeScore((payload as any).activeUsers);
  return {
    mode,
    highscores: normalizeRows((payload as any).highscores),
    coinsSpent: normalizeScore((payload as any).coinsSpent),
    totalUsers,
    activeUsers,
    uniqueUsers: totalUsers,
    updatedAt:
      typeof (payload as any).updatedAt === 'string'
        ? (payload as any).updatedAt
        : new Date().toISOString(),
  };
}

function loadPendingEvents(): QueuedRemoteEvent[] {
  try {
    const raw = localStorage.getItem(PENDING_EVENTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const events: QueuedRemoteEvent[] = [];
    for (const item of parsed) {
      if (!item || typeof item !== 'object') continue;
      const action = (item as any).action as RemoteEventAction;
      if (
        action !== 'register_user' &&
        action !== 'consume_coins' &&
        action !== 'submit_highscore'
      ) {
        continue;
      }
      const dataRaw = (item as any).data;
      if (!dataRaw || typeof dataRaw !== 'object') continue;
      const mode = sanitizeLeaderboardMode((dataRaw as any).mode ?? 'normal');
      if (action === 'consume_coins') {
        const amount = normalizeScore((dataRaw as any).amount);
        if (amount <= 0) continue;
        events.push({
          action,
          data: { mode, amount },
          queuedAt: normalizeScore((item as any).queuedAt),
          tries: normalizeScore((item as any).tries),
        });
        continue;
      }
      if (action === 'submit_highscore') {
        const score = normalizeScore((dataRaw as any).score);
        const nameRaw = (dataRaw as any).name;
        if (score <= 0 || typeof nameRaw !== 'string') continue;
        events.push({
          action,
          data: { mode, score, name: normalizeName(nameRaw) },
          queuedAt: normalizeScore((item as any).queuedAt),
          tries: normalizeScore((item as any).tries),
        });
        continue;
      }
      events.push({
        action,
        data: { mode },
        queuedAt: normalizeScore((item as any).queuedAt),
        tries: normalizeScore((item as any).tries),
      });
    }
    return events.slice(-MAX_PENDING_EVENTS);
  } catch {
    return [];
  }
}

function persistPendingEvents(events: QueuedRemoteEvent[]) {
  try {
    localStorage.setItem(
      PENDING_EVENTS_STORAGE_KEY,
      JSON.stringify(events.slice(-MAX_PENDING_EVENTS)),
    );
  } catch {
    // Ignore storage failures.
  }
}

function loadSnapshotCacheFromStorage() {
  const cache = new Map<RemoteLeaderboardMode, SnapshotCacheEntry>();
  try {
    const raw = localStorage.getItem(SNAPSHOT_CACHE_STORAGE_KEY);
    if (!raw) return cache;
    const parsed = JSON.parse(raw) as Record<string, any>;
    for (const mode of ['normal', 'daily'] as RemoteLeaderboardMode[]) {
      const modeRaw = parsed?.[mode];
      if (!modeRaw || typeof modeRaw !== 'object') continue;
      const snapshot = parseSnapshotPayload(modeRaw.snapshot ?? modeRaw, mode);
      if (!snapshot) continue;
      const fetchedAt = normalizeScore(modeRaw.fetchedAt ?? Date.now());
      cache.set(mode, {
        snapshot,
        fetchedAt: fetchedAt > 0 ? fetchedAt : Date.now(),
      });
    }
  } catch {
    // Ignore malformed cache.
  }
  return cache;
}

function persistSnapshotCache(cache: Map<RemoteLeaderboardMode, SnapshotCacheEntry>) {
  try {
    const out: Record<string, any> = {};
    for (const [mode, entry] of cache.entries()) {
      out[mode] = {
        snapshot: entry.snapshot,
        fetchedAt: entry.fetchedAt,
      };
    }
    localStorage.setItem(SNAPSHOT_CACHE_STORAGE_KEY, JSON.stringify(out));
  } catch {
    // Ignore storage failures.
  }
}

export function mergeLeaderboardEntries(
  localEntries: RemoteScoreEntry[],
  remoteEntries: RemoteScoreEntry[],
  limit: number = 5,
) {
  const mergedMap = new Map<string, RemoteScoreEntry>();
  for (const entry of [...localEntries, ...remoteEntries]) {
    const name = normalizeName(entry.name);
    const score = normalizeScore(entry.score);
    if (score <= 0) continue;
    const key = `${name}:${score}`;
    if (!mergedMap.has(key)) {
      mergedMap.set(key, { name, score });
    }
  }
  const merged = Array.from(mergedMap.values());
  merged.sort((a, b) => b.score - a.score);
  return merged.slice(0, Math.max(1, limit));
}

class RemoteStatsService {
  private readonly endpoint = resolveApiEndpoint();
  private readonly clientId = loadOrCreateClientId();
  private userRegistered = false;
  private readonly snapshotCache = loadSnapshotCacheFromStorage();
  private pendingEvents = loadPendingEvents();
  private readonly snapshotInflight = new Map<
    RemoteLeaderboardMode,
    Promise<RemoteStatsSnapshot | null>
  >();
  private flushInProgress = false;
  private flushScheduled = false;

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        void this.flushPendingEvents();
      });
      if (this.pendingEvents.length > 0) {
        this.scheduleFlush(700);
      }
    }
  }

  private getCachedSnapshot(mode: RemoteLeaderboardMode) {
    return this.snapshotCache.get(mode)?.snapshot ?? null;
  }

  public isNetworkOnline() {
    return isNetworkOnline();
  }

  private storeSnapshot(snapshot: RemoteStatsSnapshot) {
    this.snapshotCache.set(snapshot.mode, {
      snapshot,
      fetchedAt: Date.now(),
    });
    persistSnapshotCache(this.snapshotCache);
  }

  private scheduleFlush(delayMs: number = 180) {
    if (this.flushScheduled) return;
    this.flushScheduled = true;
    window.setTimeout(
      () => {
        this.flushScheduled = false;
        void this.flushPendingEvents();
      },
      Math.max(0, delayMs),
    );
  }

  private enqueueEvent(action: RemoteEventAction, data: Record<string, unknown>) {
    const mode = sanitizeLeaderboardMode((data.mode as string | undefined) ?? 'normal');
    if (action === 'register_user') {
      if (this.pendingEvents.some((evt) => evt.action === 'register_user')) {
        return;
      }
      this.pendingEvents.push({
        action,
        data: { mode },
        queuedAt: Date.now(),
        tries: 0,
      });
      persistPendingEvents(this.pendingEvents);
      return;
    }

    if (action === 'consume_coins') {
      const amount = normalizeScore(data.amount);
      if (amount <= 0) return;
      for (let i = this.pendingEvents.length - 1; i >= 0; i--) {
        const event = this.pendingEvents[i];
        if (event.action !== 'consume_coins') continue;
        const eventMode = sanitizeLeaderboardMode(
          (event.data.mode as string | undefined) ?? 'normal',
        );
        if (eventMode !== mode) continue;
        const prevAmount = normalizeScore(event.data.amount);
        event.data.amount = prevAmount + amount;
        persistPendingEvents(this.pendingEvents);
        return;
      }
      this.pendingEvents.push({
        action,
        data: { mode, amount },
        queuedAt: Date.now(),
        tries: 0,
      });
      if (this.pendingEvents.length > MAX_PENDING_EVENTS) {
        this.pendingEvents = this.pendingEvents.slice(-MAX_PENDING_EVENTS);
      }
      persistPendingEvents(this.pendingEvents);
      return;
    }

    const score = normalizeScore(data.score);
    if (score <= 0) return;
    this.pendingEvents.push({
      action,
      data: {
        mode,
        score,
        name: normalizeName(String(data.name ?? '---')),
      },
      queuedAt: Date.now(),
      tries: 0,
    });
    if (this.pendingEvents.length > MAX_PENDING_EVENTS) {
      this.pendingEvents = this.pendingEvents.slice(-MAX_PENDING_EVENTS);
    }
    persistPendingEvents(this.pendingEvents);
  }

  private async flushPendingEvents() {
    if (this.flushInProgress) return;
    if (this.pendingEvents.length === 0) return;
    if (!isNetworkOnline()) {
      this.scheduleFlush(RETRY_DELAY_ON_FAILURE_MS);
      return;
    }
    this.flushInProgress = true;
    let sawFailure = false;
    try {
      while (this.pendingEvents.length > 0) {
        const event = this.pendingEvents[0];
        const snapshot = await this.postEvent(event.action, event.data, false, false);
        if (!snapshot) {
          event.tries = normalizeScore(event.tries) + 1;
          persistPendingEvents(this.pendingEvents);
          sawFailure = true;
          break;
        }
        this.pendingEvents.shift();
        persistPendingEvents(this.pendingEvents);
      }
    } finally {
      this.flushInProgress = false;
      if (this.pendingEvents.length > 0) {
        this.scheduleFlush(sawFailure ? RETRY_DELAY_ON_FAILURE_MS : 260);
      }
    }
  }

  public warmupUserRegistration() {
    if (!this.userRegistered) {
      void this.postEvent('register_user', { mode: 'normal' }, true).then((snapshot) => {
        if (snapshot) {
          this.userRegistered = true;
        }
      });
    }
    if (this.pendingEvents.length > 0) {
      this.scheduleFlush(280);
    }
  }

  public reportCoinsSpent(amount: number) {
    const spendAmount = Math.max(0, Math.floor(amount));
    if (spendAmount <= 0) return;
    this.warmupUserRegistration();
    void this.postEvent('consume_coins', { amount: spendAmount, mode: 'normal' }, true);
  }

  public submitHighscore(name: string, score: number, mode: RemoteLeaderboardMode = 'normal') {
    const normalizedScore = normalizeScore(score);
    if (normalizedScore <= 0) return Promise.resolve<RemoteStatsSnapshot | null>(null);
    this.warmupUserRegistration();
    return this.postEvent(
      'submit_highscore',
      {
        mode,
        name: normalizeName(name),
        score: normalizedScore,
      },
      true,
    );
  }

  public fetchSnapshotLazy(mode: RemoteLeaderboardMode = 'normal', force: boolean = false) {
    const now = Date.now();
    const cached = this.snapshotCache.get(mode);
    if (!force && cached && now - cached.fetchedAt <= SNAPSHOT_TTL_MS) {
      return Promise.resolve(cached.snapshot);
    }

    const inflight = this.snapshotInflight.get(mode);
    if (!force && inflight) {
      return inflight;
    }

    const request = this.fetchSnapshot(mode).finally(() => {
      this.snapshotInflight.delete(mode);
    });
    this.snapshotInflight.set(mode, request);
    return request;
  }

  private async fetchSnapshot(mode: RemoteLeaderboardMode) {
    this.warmupUserRegistration();
    if (!isNetworkOnline()) {
      return this.getCachedSnapshot(mode);
    }
    void this.flushPendingEvents();
    const url = `${this.endpoint}?mode=${encodeURIComponent(mode)}&t=${Date.now()}`;
    const payload = await this.fetchJson(url, {
      method: 'GET',
      cache: 'no-store',
    });
    const parsed = parseSnapshotPayload(payload, mode);
    if (parsed) {
      this.storeSnapshot(parsed);
      return parsed;
    }
    return this.getCachedSnapshot(mode);
  }

  private async postEvent(
    action: RemoteEventAction,
    data: Record<string, unknown>,
    queueOnFailure: boolean = true,
    fallbackToCache: boolean = true,
  ) {
    const mode = sanitizeLeaderboardMode((data.mode as string | undefined) ?? 'normal');
    if (!isNetworkOnline()) {
      if (queueOnFailure) {
        this.enqueueEvent(action, data);
        this.scheduleFlush(RETRY_DELAY_ON_FAILURE_MS);
      }
      if (fallbackToCache) {
        return this.getCachedSnapshot(mode);
      }
      return null;
    }
    const payload = await this.fetchJson(this.endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      keepalive: true,
      body: JSON.stringify({
        action,
        userId: this.clientId,
        ...data,
      }),
    });
    const parsed = parseSnapshotPayload(payload, mode);
    if (parsed) {
      this.storeSnapshot(parsed);
      this.userRegistered = true;
      return parsed;
    }
    if (queueOnFailure) {
      this.enqueueEvent(action, data);
      this.scheduleFlush(RETRY_DELAY_ON_FAILURE_MS);
    }
    if (fallbackToCache) {
      return this.getCachedSnapshot(mode);
    }
    return null;
  }

  private async fetchJson(url: string, init: RequestInit): Promise<unknown> {
    if (!isNetworkOnline()) return null;
    const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timeoutId =
      controller &&
      window.setTimeout(() => {
        controller.abort();
      }, REQUEST_TIMEOUT_MS);
    try {
      const response = await fetch(url, {
        ...init,
        signal: controller?.signal,
      });
      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    } finally {
      if (typeof timeoutId === 'number') {
        window.clearTimeout(timeoutId);
      }
    }
  }
}

export const remoteStatsService = new RemoteStatsService();
