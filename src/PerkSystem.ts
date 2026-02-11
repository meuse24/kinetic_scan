export interface PerkDefinition {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  maxStacks: number;
}

export const PERK_REGISTRY: PerkDefinition[] = [
  {
    id: 'fire_rate',
    name: 'RAPID FIRE',
    description: '+10% fire rate',
    icon: '>',
    color: '#ff4444',
    maxStacks: 3,
  },
  {
    id: 'max_life',
    name: 'EXTRA LIFE',
    description: '+1 max life',
    icon: '+',
    color: '#44ff44',
    maxStacks: 2,
  },
  {
    id: 'fragment_score',
    name: 'SCAVENGER',
    description: '2x fragment score',
    icon: '$',
    color: '#ffff44',
    maxStacks: 1,
  },
  {
    id: 'homing_chance',
    name: 'SEEKER',
    description: '20% homing bullets',
    icon: '@',
    color: '#44ffff',
    maxStacks: 2,
  },
  {
    id: 'cooldown_speed',
    name: 'CRYO CORE',
    description: '+15% heat cooldown',
    icon: '*',
    color: '#88ccff',
    maxStacks: 3,
  },
  {
    id: 'bullet_speed',
    name: 'VELOCITY',
    description: '+10% bullet speed',
    icon: '^',
    color: '#ffaa44',
    maxStacks: 3,
  },
  {
    id: 'score_multi',
    name: 'GREED',
    description: '+5% score bonus',
    icon: '%',
    color: '#ffdd00',
    maxStacks: 4,
  },
  {
    id: 'shield_on_level',
    name: 'AEGIS',
    description: 'Shield at level start',
    icon: 'O',
    color: '#00ffcc',
    maxStacks: 1,
  },
  {
    id: 'explosion_radius',
    name: 'BIG BANG',
    description: '+20% explosion size',
    icon: '!',
    color: '#ff8800',
    maxStacks: 2,
  },
  {
    id: 'combo_window',
    name: 'STREAK',
    description: '+500ms combo window',
    icon: '~',
    color: '#ff66ff',
    maxStacks: 2,
  },
  {
    id: 'magnet_range',
    name: 'MAGNETAR',
    description: '+30% magnet range',
    icon: 'M',
    color: '#66aaff',
    maxStacks: 2,
  },
  {
    id: 'start_shield',
    name: 'GUARDIAN',
    description: 'Start with shield',
    icon: '#',
    color: '#aaffaa',
    maxStacks: 1,
  },
  {
    id: 'mine_stock',
    name: 'MINE STOCK',
    description: '+1 mine charge',
    icon: '&',
    color: '#ffb347',
    maxStacks: 4,
  },
];

export class PerkSystem {
  private perks: Map<string, number> = new Map();

  reset() {
    this.perks.clear();
  }

  addPerk(perkId: string) {
    const def = PERK_REGISTRY.find((p) => p.id === perkId);
    if (!def) return;
    const current = this.perks.get(perkId) ?? 0;
    if (current < def.maxStacks) {
      this.perks.set(perkId, current + 1);
    }
  }

  getStacks(perkId: string): number {
    return this.perks.get(perkId) ?? 0;
  }

  hasAny(): boolean {
    return this.perks.size > 0;
  }

  getAll(): Map<string, number> {
    return new Map(this.perks);
  }

  saveState(): [string, number][] {
    return Array.from(this.perks.entries());
  }

  loadState(state: [string, number][]) {
    this.perks.clear();
    for (const [id, stacks] of state) {
      this.perks.set(id, stacks);
    }
  }

  /** Pick 3 random perks that haven't hit max stacks yet */
  rollChoices(count: number = 3): PerkDefinition[] {
    const available = PERK_REGISTRY.filter((def) => {
      const current = this.perks.get(def.id) ?? 0;
      return current < def.maxStacks;
    });

    // Shuffle and pick
    const shuffled = [...available];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    return shuffled.slice(0, Math.min(count, shuffled.length));
  }

  // --- Computed modifiers ---
  getFireRateMultiplier(): number {
    return 1 - this.getStacks('fire_rate') * 0.1;
  }

  getExtraLives(): number {
    return this.getStacks('max_life');
  }

  getFragmentScoreMultiplier(): number {
    return this.getStacks('fragment_score') > 0 ? 2 : 1;
  }

  getHomingChance(): number {
    return this.getStacks('homing_chance') * 0.2;
  }

  getCooldownMultiplier(): number {
    return 1 + this.getStacks('cooldown_speed') * 0.15;
  }

  getBulletSpeedMultiplier(): number {
    return 1 + this.getStacks('bullet_speed') * 0.1;
  }

  getScoreMultiplier(): number {
    return 1 + this.getStacks('score_multi') * 0.05;
  }

  hasShieldOnLevel(): boolean {
    return this.getStacks('shield_on_level') > 0;
  }

  getExplosionRadiusMultiplier(): number {
    return 1 + this.getStacks('explosion_radius') * 0.2;
  }

  getComboWindowBonusMs(): number {
    return this.getStacks('combo_window') * 500;
  }

  getMagnetRangeMultiplier(): number {
    return 1 + this.getStacks('magnet_range') * 0.3;
  }

  hasStartShield(): boolean {
    return this.getStacks('start_shield') > 0;
  }

  getMineStockStacks(): number {
    return this.getStacks('mine_stock');
  }
}
