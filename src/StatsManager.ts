const STORAGE_KEY = 'spaceShooterStats';

export interface LifetimeStats {
  totalKills: number;
  totalScore: number;
  totalGames: number;
  totalDeaths: number;
  highestCombo: number;
  highestLevel: number;
  totalBossKills: number;
  totalPlaytimeMs: number;
  unlockedSkins: number[];
}

export interface ShipSkin {
  id: number;
  name: string;
  hullColor: number;
  thrusterColor: number;
  unlockCondition: string;
  unlockCheck: (stats: LifetimeStats) => boolean;
}

export const SHIP_SKINS: ShipSkin[] = [
  {
    id: 0,
    name: 'CLASSIC',
    hullColor: 0x00ff00,
    thrusterColor: 0xff4400,
    unlockCondition: 'Default',
    unlockCheck: () => true,
  },
  {
    id: 1,
    name: 'CRIMSON',
    hullColor: 0xff2244,
    thrusterColor: 0xff8800,
    unlockCondition: '500 kills',
    unlockCheck: (s) => s.totalKills >= 500,
  },
  {
    id: 2,
    name: 'ARCTIC',
    hullColor: 0x44ccff,
    thrusterColor: 0xaaeeff,
    unlockCondition: 'Level 5',
    unlockCheck: (s) => s.highestLevel >= 5,
  },
  {
    id: 3,
    name: 'PHANTOM',
    hullColor: 0x9966ff,
    thrusterColor: 0xcc88ff,
    unlockCondition: '10 boss kills',
    unlockCheck: (s) => s.totalBossKills >= 10,
  },
  {
    id: 4,
    name: 'SOLAR',
    hullColor: 0xffcc00,
    thrusterColor: 0xff6600,
    unlockCondition: '50,000 score',
    unlockCheck: (s) => s.totalScore >= 50000,
  },
];

class StatsManager {
  private stats: LifetimeStats;
  private selectedSkin: number = 0;

  constructor() {
    this.stats = this.load();
    this.selectedSkin = this.loadSelectedSkin();
  }

  private load(): LifetimeStats {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          totalKills: parsed.totalKills ?? 0,
          totalScore: parsed.totalScore ?? 0,
          totalGames: parsed.totalGames ?? 0,
          totalDeaths: parsed.totalDeaths ?? 0,
          highestCombo: parsed.highestCombo ?? 0,
          highestLevel: parsed.highestLevel ?? 0,
          totalBossKills: parsed.totalBossKills ?? 0,
          totalPlaytimeMs: parsed.totalPlaytimeMs ?? 0,
          unlockedSkins: parsed.unlockedSkins ?? [0],
        };
      }
    } catch {
      // Ignore parse errors
    }
    return {
      totalKills: 0,
      totalScore: 0,
      totalGames: 0,
      totalDeaths: 0,
      highestCombo: 0,
      highestLevel: 0,
      totalBossKills: 0,
      totalPlaytimeMs: 0,
      unlockedSkins: [0],
    };
  }

  private save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.stats));
    } catch {
      // Storage full / unavailable
    }
  }

  private loadSelectedSkin(): number {
    try {
      const raw = localStorage.getItem('spaceShooterSkin');
      if (raw) return parseInt(raw, 10) || 0;
    } catch {
      // Ignore
    }
    return 0;
  }

  getStats(): Readonly<LifetimeStats> {
    return this.stats;
  }

  getSelectedSkin(): number {
    return this.selectedSkin;
  }

  setSelectedSkin(id: number) {
    if (this.stats.unlockedSkins.includes(id)) {
      this.selectedSkin = id;
      try {
        localStorage.setItem('spaceShooterSkin', String(id));
      } catch {
        // Ignore
      }
    }
  }

  getSkinDef(): ShipSkin {
    return SHIP_SKINS.find((s) => s.id === this.selectedSkin) ?? SHIP_SKINS[0];
  }

  // --- Game session tracking ---

  onGameStart() {
    this.stats.totalGames++;
    this.save();
  }

  onKill() {
    this.stats.totalKills++;
  }

  onDeath() {
    this.stats.totalDeaths++;
  }

  onBossKill() {
    this.stats.totalBossKills++;
  }

  updateHighestCombo(combo: number) {
    if (combo > this.stats.highestCombo) {
      this.stats.highestCombo = combo;
    }
  }

  updateHighestLevel(level: number) {
    if (level > this.stats.highestLevel) {
      this.stats.highestLevel = level;
    }
  }

  addPlaytime(ms: number) {
    this.stats.totalPlaytimeMs += ms;
  }

  onGameEnd(finalScore: number) {
    this.stats.totalScore += finalScore;
    this.checkUnlocks();
    this.save();
  }

  private checkUnlocks() {
    let changed = false;
    for (const skin of SHIP_SKINS) {
      if (!this.stats.unlockedSkins.includes(skin.id) && skin.unlockCheck(this.stats)) {
        this.stats.unlockedSkins.push(skin.id);
        changed = true;
      }
    }
    if (changed) this.save();
  }

  getUnlockedSkins(): ShipSkin[] {
    return SHIP_SKINS.filter((s) => this.stats.unlockedSkins.includes(s.id));
  }

  isUnlocked(skinId: number): boolean {
    return this.stats.unlockedSkins.includes(skinId);
  }

  formatPlaytime(): string {
    const totalSec = Math.floor(this.stats.totalPlaytimeMs / 1000);
    const hours = Math.floor(totalSec / 3600);
    const minutes = Math.floor((totalSec % 3600) / 60);
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
  }
}

export const statsManager = new StatsManager();
