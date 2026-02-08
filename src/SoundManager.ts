import Phaser from 'phaser';

const STORAGE_KEY = 'spaceShooterSoundMuted';
const VOLUME_STORAGE_KEY = 'spaceShooterVolumes';

export class SoundManager {
  private muted = false;
  private events = new Phaser.Events.EventEmitter();
  private _masterVolume = 1;
  private _sfxVolume = 1;
  private _bgmVolume = 1;

  constructor() {
    this.muted = this.readStorage();
    this.loadVolumes();
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

  // --- Volume Controls ---
  get masterVolume() {
    return this._masterVolume;
  }
  get sfxVolume() {
    return this._sfxVolume;
  }
  get bgmVolume() {
    return this._bgmVolume;
  }

  public setMasterVolume(v: number) {
    this._masterVolume = Phaser.Math.Clamp(v, 0, 1);
    this.saveVolumes();
    this.events.emit('volumeChange');
  }

  public setSfxVolume(v: number) {
    this._sfxVolume = Phaser.Math.Clamp(v, 0, 1);
    this.saveVolumes();
    this.events.emit('volumeChange');
  }

  public setBgmVolume(v: number) {
    this._bgmVolume = Phaser.Math.Clamp(v, 0, 1);
    this.saveVolumes();
    this.events.emit('volumeChange');
  }

  public onVolumeChange(callback: () => void, context?: any) {
    this.events.on('volumeChange', callback, context);
  }

  public offVolumeChange(callback: () => void, context?: any) {
    this.events.off('volumeChange', callback, context);
  }

  public getEffectiveSfxVolume(): number {
    return this._masterVolume * this._sfxVolume;
  }

  public getEffectiveBgmVolume(): number {
    return this._masterVolume * this._bgmVolume;
  }

  private loadVolumes() {
    try {
      const raw = localStorage.getItem(VOLUME_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        this._masterVolume = Phaser.Math.Clamp(parsed.master ?? 1, 0, 1);
        this._sfxVolume = Phaser.Math.Clamp(parsed.sfx ?? 1, 0, 1);
        this._bgmVolume = Phaser.Math.Clamp(parsed.bgm ?? 1, 0, 1);
      }
    } catch {
      // ignore
    }
  }

  private saveVolumes() {
    try {
      localStorage.setItem(
        VOLUME_STORAGE_KEY,
        JSON.stringify({
          master: this._masterVolume,
          sfx: this._sfxVolume,
          bgm: this._bgmVolume,
        }),
      );
    } catch {
      // ignore
    }
  }
}

export const soundManager = new SoundManager();
