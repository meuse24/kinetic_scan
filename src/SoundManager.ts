import Phaser from 'phaser';

const STORAGE_KEY = 'spaceShooterSoundMuted';

export class SoundManager {
  private muted = false;
  private events = new Phaser.Events.EventEmitter();

  constructor() {
    this.muted = this.readStorage();
  }

  public isMuted() {
    return this.muted;
  }

  public setMuted(value: boolean) {
    if (this.muted === value) return;
    this.muted = value;
    this.writeStorage();
    this.events.emit('change', this.muted);
  }

  public toggle() {
    this.setMuted(!this.muted);
  }

  public onChange(callback: (muted: boolean) => void, context?: any) {
    this.events.on('change', callback, context);
  }

  public offChange(callback: (muted: boolean) => void, context?: any) {
    this.events.off('change', callback, context);
  }

  private readStorage() {
    try {
      const value = localStorage.getItem(STORAGE_KEY);
      return value === '1';
    } catch {
      return false;
    }
  }

  private writeStorage() {
    try {
      localStorage.setItem(STORAGE_KEY, this.muted ? '1' : '0');
    } catch {
      // ignore storage failures
    }
  }
}

export const soundManager = new SoundManager();
