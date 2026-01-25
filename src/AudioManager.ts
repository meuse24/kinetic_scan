import Phaser from 'phaser';
import { soundManager } from './SoundManager';

export const DEFAULT_VOLUME = 0.3;

export class AudioManager {
  private audioContext: AudioContext;
  private masterGain: GainNode;
  private ufoOsc: OscillatorNode | null = null;
  private ufoGain: GainNode | null = null;

  constructor(scene: Phaser.Scene) {
    this.audioContext =
      (scene.game.sound as any).context ||
      new (window.AudioContext || (window as any).webkitAudioContext)();
    this.masterGain = this.audioContext.createGain();
    this.masterGain.connect(this.audioContext.destination);
    this.masterGain.gain.value = soundManager.isMuted() ? 0 : DEFAULT_VOLUME;
  }

  public async resume() {
    if (this.audioContext.state === 'suspended') await this.audioContext.resume();
  }

  public pauseAll() {
    if (this.audioContext.state === 'running') this.audioContext.suspend();
  }

  public resumeAll() {
    if (this.audioContext.state === 'suspended') this.audioContext.resume();
  }

  public setVolume(value: number) {
    this.masterGain.gain.setTargetAtTime(value, this.audioContext.currentTime, 0.1);
  }

  public playShoot(manual: boolean = false) {
    if (this.audioContext.state !== 'running') return;
    const osc = this.audioContext.createOscillator();
    const osc2 = manual ? this.audioContext.createOscillator() : null;
    const gain = this.audioContext.createGain();
    osc.type = manual ? 'sawtooth' : 'square';
    osc.frequency.setValueAtTime(manual ? 900 : 800, this.audioContext.currentTime);
    osc.frequency.exponentialRampToValueAtTime(120, this.audioContext.currentTime + 0.12);
    gain.gain.setValueAtTime(manual ? 0.45 : 0.3, this.audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.12);
    osc.connect(gain);
    if (osc2) {
      osc2.type = 'triangle';
      osc2.frequency.setValueAtTime(600, this.audioContext.currentTime);
      osc2.frequency.exponentialRampToValueAtTime(140, this.audioContext.currentTime + 0.12);
      osc2.connect(gain);
      osc2.start();
      osc2.stop(this.audioContext.currentTime + 0.12);
    }
    gain.connect(this.masterGain);
    osc.start();
    osc.stop(this.audioContext.currentTime + 0.12);
  }

  public playExplosion() {
    if (this.audioContext.state !== 'running') return;
    const bufferSize = this.audioContext.sampleRate * 0.3;
    const buffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const noise = this.audioContext.createBufferSource();
    noise.buffer = buffer;
    const filter = this.audioContext.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1000, this.audioContext.currentTime);
    filter.frequency.exponentialRampToValueAtTime(100, this.audioContext.currentTime + 0.3);
    const gain = this.audioContext.createGain();
    gain.gain.setValueAtTime(0.5, this.audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.3);
    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);
    noise.start();
  }

  public playPlayerDeath() {
    if (this.audioContext.state !== 'running') return;
    const osc = this.audioContext.createOscillator();
    osc.type = 'square';
    osc.frequency.setValueAtTime(400, this.audioContext.currentTime);
    osc.frequency.exponentialRampToValueAtTime(40, this.audioContext.currentTime + 1.0);
    const oscGain = this.audioContext.createGain();
    oscGain.gain.setValueAtTime(0.5, this.audioContext.currentTime);
    oscGain.gain.linearRampToValueAtTime(0, this.audioContext.currentTime + 1.0);
    const bufferSize = this.audioContext.sampleRate * 1.5;
    const buffer = this.audioContext.createBuffer(1, bufferSize, this.audioContext.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
    const noise = this.audioContext.createBufferSource();
    noise.buffer = buffer;
    const filter = this.audioContext.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(600, this.audioContext.currentTime);
    const noiseGain = this.audioContext.createGain();
    noiseGain.gain.setValueAtTime(0.6, this.audioContext.currentTime);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 1.5);
    osc.connect(oscGain);
    oscGain.connect(this.masterGain);
    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.masterGain);
    osc.start();
    osc.stop(this.audioContext.currentTime + 1.0);
    noise.start();
  }

  public playPickup() {
    if (this.audioContext.state !== 'running') return;
    const notes = [440, 554.37, 659.25, 880];
    const duration = 0.1;
    notes.forEach((freq, i) => {
      const osc = this.audioContext.createOscillator();
      const gain = this.audioContext.createGain();
      const time = this.audioContext.currentTime + i * duration;
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, time);
      gain.gain.setValueAtTime(0.3, time);
      gain.gain.exponentialRampToValueAtTime(0.01, time + duration);
      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(time);
      osc.stop(time + duration);
    });
  }

  public playCoin() {
    if (this.audioContext.state !== 'running') return;
    const now = this.audioContext.currentTime;
    const osc = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(987.77, now); // B5
    osc.frequency.setValueAtTime(1318.51, now + 0.05); // E6
    gain.gain.setValueAtTime(0.2, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 0.2);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start();
    osc.stop(now + 0.2);
  }

  public playEMP() {
    if (this.audioContext.state !== 'running') return;
    const osc = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(50, this.audioContext.currentTime);
    osc.frequency.exponentialRampToValueAtTime(2000, this.audioContext.currentTime + 0.5);
    gain.gain.setValueAtTime(0.5, this.audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.5);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start();
    osc.stop(this.audioContext.currentTime + 0.5);
  }

  public playGhost() {
    if (this.audioContext.state !== 'running') return;
    const osc = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(1200, this.audioContext.currentTime);
    osc.frequency.linearRampToValueAtTime(800, this.audioContext.currentTime + 0.3);
    gain.gain.setValueAtTime(0.2, this.audioContext.currentTime);
    gain.gain.linearRampToValueAtTime(0, this.audioContext.currentTime + 0.3);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start();
    osc.stop(this.audioContext.currentTime + 0.3);
  }

  public playDrones() {
    if (this.audioContext.state !== 'running') return;
    const osc = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(880, this.audioContext.currentTime);
    osc.frequency.linearRampToValueAtTime(1760, this.audioContext.currentTime + 0.1);
    gain.gain.setValueAtTime(0.2, this.audioContext.currentTime);
    gain.gain.linearRampToValueAtTime(0, this.audioContext.currentTime + 0.1);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start();
    osc.stop(this.audioContext.currentTime + 0.1);
  }

  public playBlackHole() {
    if (this.audioContext.state !== 'running') return;
    const osc = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(60, this.audioContext.currentTime);
    osc.frequency.linearRampToValueAtTime(40, this.audioContext.currentTime + 1.0);
    gain.gain.setValueAtTime(0.4, this.audioContext.currentTime);
    gain.gain.linearRampToValueAtTime(0, this.audioContext.currentTime + 1.0);
    osc.connect(gain);
    gain.connect(this.masterGain);
    osc.start();
    osc.stop(this.audioContext.currentTime + 1.0);
  }

  public startUFOSound() {
    if (this.audioContext.state !== 'running' || this.ufoOsc) return;
    this.ufoOsc = this.audioContext.createOscillator();
    this.ufoGain = this.audioContext.createGain();
    const lfo = this.audioContext.createOscillator();
    const lfoGain = this.audioContext.createGain();
    this.ufoOsc.type = 'sine';
    this.ufoOsc.frequency.setValueAtTime(440, this.audioContext.currentTime);
    lfo.type = 'sine';
    lfo.frequency.setValueAtTime(5, this.audioContext.currentTime);
    lfoGain.gain.setValueAtTime(0.2, this.audioContext.currentTime);
    lfo.connect(lfoGain);
    lfoGain.connect(this.ufoGain.gain);
    this.ufoGain.gain.setValueAtTime(0.2, this.audioContext.currentTime);
    this.ufoOsc.connect(this.ufoGain);
    this.ufoGain.connect(this.masterGain);
    lfo.start();
    this.ufoOsc.start();
  }

  public stopUFOSound() {
    if (this.ufoOsc) {
      this.ufoOsc.stop();
      this.ufoOsc.disconnect();
      this.ufoOsc = null;
    }
    if (this.ufoGain) {
      this.ufoGain.disconnect();
      this.ufoGain = null;
    }
  }
}
