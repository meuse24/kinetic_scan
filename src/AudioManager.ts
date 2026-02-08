import Phaser from 'phaser';
import { soundManager } from './SoundManager';

export const DEFAULT_VOLUME = 0.3;
type UFOShootVariant = 'scout' | 'boss';
type AudioDifficultyKey = 'easy' | 'normal' | 'hard';

type AudioMixProfile = {
  scoutShotGainScale: number;
  bossShotGainScale: number;
  blackHoleOneShotGainScale: number;
  blackHoleLoopGainScale: number;
  ufoShotRateScale: number;
  blackHoleTriggerRateScale: number;
};

const AUDIO_MIX_PROFILES: Record<AudioDifficultyKey, AudioMixProfile> = {
  easy: {
    scoutShotGainScale: 1.06,
    bossShotGainScale: 1.02,
    blackHoleOneShotGainScale: 1.04,
    blackHoleLoopGainScale: 0.9,
    ufoShotRateScale: 1,
    blackHoleTriggerRateScale: 1,
  },
  normal: {
    scoutShotGainScale: 1,
    bossShotGainScale: 1,
    blackHoleOneShotGainScale: 1,
    blackHoleLoopGainScale: 1,
    ufoShotRateScale: 1,
    blackHoleTriggerRateScale: 1,
  },
  hard: {
    scoutShotGainScale: 0.86,
    bossShotGainScale: 0.78,
    blackHoleOneShotGainScale: 0.9,
    blackHoleLoopGainScale: 0.84,
    ufoShotRateScale: 1.22,
    blackHoleTriggerRateScale: 1.22,
  },
};

export class AudioManager {
  private audioContext: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private ufoOsc: OscillatorNode | null = null;
  private ufoGain: GainNode | null = null;
  private blackHoleLoopOsc: OscillatorNode | null = null;
  private blackHoleLoopLfo: OscillatorNode | null = null;
  private blackHoleLoopGain: GainNode | null = null;
  private blackHoleLoopLfoGain: GainNode | null = null;
  private noiseBuffers: Map<number, AudioBuffer> = new Map();
  private lastUFOShootAt: number = -1;
  private lastBlackHoleAt: number = -1;
  private mixProfile: AudioMixProfile = AUDIO_MIX_PROFILES.normal;

  constructor(scene: Phaser.Scene) {
    const gameContext = (scene.game.sound as any)?.context as AudioContext | undefined;
    const AudioContextCtor = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (gameContext) {
      this.audioContext = gameContext;
    } else if (typeof AudioContextCtor === 'function') {
      this.audioContext = new AudioContextCtor();
    } else {
      // WebKit/headless environments can expose neither constructor.
      this.audioContext = null;
      return;
    }

    const audioContext = this.audioContext;
    if (!audioContext) return;
    const masterGain = audioContext.createGain();
    const limiter = audioContext.createDynamicsCompressor();
    limiter.threshold.setValueAtTime(-22, audioContext.currentTime);
    limiter.knee.setValueAtTime(20, audioContext.currentTime);
    limiter.ratio.setValueAtTime(5, audioContext.currentTime);
    limiter.attack.setValueAtTime(0.002, audioContext.currentTime);
    limiter.release.setValueAtTime(0.18, audioContext.currentTime);
    masterGain.connect(limiter);
    limiter.connect(audioContext.destination);
    masterGain.gain.value = soundManager.isMuted() ? 0 : DEFAULT_VOLUME;
    this.masterGain = masterGain;
  }

  public async resume() {
    if (!this.audioContext) return;
    if (this.audioContext.state === 'suspended') await this.audioContext.resume();
  }

  public pauseAll() {
    if (!this.audioContext) return;
    if (this.audioContext.state === 'running') this.audioContext.suspend();
  }

  public resumeAll() {
    if (!this.audioContext) return;
    if (this.audioContext.state === 'suspended') this.audioContext.resume();
  }

  public setVolume(value: number) {
    if (!this.audioContext || !this.masterGain) return;
    this.masterGain.gain.setTargetAtTime(value, this.audioContext.currentTime, 0.1);
  }

  public setDifficultyMix(key: AudioDifficultyKey) {
    this.mixProfile = AUDIO_MIX_PROFILES[key] ?? AUDIO_MIX_PROFILES.normal;
    if (this.audioContext && this.blackHoleLoopGain) {
      this.blackHoleLoopGain.gain.setTargetAtTime(
        0.075 * this.mixProfile.blackHoleLoopGainScale,
        this.audioContext.currentTime,
        0.18,
      );
    }
  }

  private getNoiseBuffer(durationSec: number) {
    if (!this.audioContext) return null;
    const clamped = Phaser.Math.Clamp(durationSec, 0.02, 2);
    const key = Math.max(1, Math.floor(clamped * 1000));
    const cached = this.noiseBuffers.get(key);
    if (cached) return cached;
    const size = Math.max(1, Math.floor(this.audioContext.sampleRate * clamped));
    const buffer = this.audioContext.createBuffer(1, size, this.audioContext.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < size; i++) data[i] = Math.random() * 2 - 1;
    this.noiseBuffers.set(key, buffer);
    return buffer;
  }

  private connectWithPan(input: AudioNode, pan: number) {
    if (!this.audioContext || !this.masterGain) return;
    if (typeof this.audioContext.createStereoPanner === 'function') {
      const panner = this.audioContext.createStereoPanner();
      panner.pan.setValueAtTime(Phaser.Math.Clamp(pan, -1, 1), this.audioContext.currentTime);
      input.connect(panner);
      panner.connect(this.masterGain);
      return;
    }
    input.connect(this.masterGain);
  }

  public playShoot(manual: boolean = false) {
    if (!this.audioContext || !this.masterGain || this.audioContext.state !== 'running') return;
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
    if (!this.audioContext || !this.masterGain || this.audioContext.state !== 'running') return;
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
    if (!this.audioContext || !this.masterGain || this.audioContext.state !== 'running') return;
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
    if (!this.audioContext || !this.masterGain || this.audioContext.state !== 'running') return;
    const audioContext = this.audioContext;
    const masterGain = this.masterGain;
    const notes = [440, 554.37, 659.25, 880];
    const duration = 0.1;
    notes.forEach((freq, i) => {
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      const time = audioContext.currentTime + i * duration;
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, time);
      gain.gain.setValueAtTime(0.3, time);
      gain.gain.exponentialRampToValueAtTime(0.01, time + duration);
      osc.connect(gain);
      gain.connect(masterGain);
      osc.start(time);
      osc.stop(time + duration);
    });
  }

  public playCoin() {
    if (!this.audioContext || !this.masterGain || this.audioContext.state !== 'running') return;
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
    if (!this.audioContext || !this.masterGain || this.audioContext.state !== 'running') return;
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
    if (!this.audioContext || !this.masterGain || this.audioContext.state !== 'running') return;
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
    if (!this.audioContext || !this.masterGain || this.audioContext.state !== 'running') return;
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
    if (!this.audioContext || !this.masterGain || this.audioContext.state !== 'running') return;
    const now = this.audioContext.currentTime;
    const triggerInterval = 0.25 * this.mixProfile.blackHoleTriggerRateScale;
    if (this.lastBlackHoleAt > 0 && now - this.lastBlackHoleAt < triggerInterval) return;
    this.lastBlackHoleAt = now;

    const oscA = this.audioContext.createOscillator();
    const oscB = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();
    oscA.type = 'triangle';
    oscB.type = 'sine';
    oscA.frequency.setValueAtTime(140, now);
    oscA.frequency.exponentialRampToValueAtTime(36, now + 1.2);
    oscB.frequency.setValueAtTime(410, now);
    oscB.frequency.exponentialRampToValueAtTime(90, now + 0.7);
    gain.gain.setValueAtTime(0.25 * this.mixProfile.blackHoleOneShotGainScale, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + 1.0);
    oscA.connect(gain);
    oscB.connect(gain);
    this.connectWithPan(gain, Phaser.Math.FloatBetween(-0.12, 0.12));

    const noise = this.audioContext.createBufferSource();
    const noiseBuffer = this.getNoiseBuffer(0.7);
    if (!noiseBuffer) return;
    noise.buffer = noiseBuffer;
    const noiseFilter = this.audioContext.createBiquadFilter();
    noiseFilter.type = 'bandpass';
    noiseFilter.frequency.setValueAtTime(860, now);
    noiseFilter.frequency.exponentialRampToValueAtTime(180, now + 0.7);
    const noiseGain = this.audioContext.createGain();
    noiseGain.gain.setValueAtTime(0.18 * this.mixProfile.blackHoleOneShotGainScale, now);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, now + 0.65);
    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    this.connectWithPan(noiseGain, Phaser.Math.FloatBetween(-0.2, 0.2));

    oscA.start(now);
    oscB.start(now);
    oscA.stop(now + 1.2);
    oscB.stop(now + 0.85);
    noise.start(now);
    noise.stop(now + 0.7);
  }

  public startBlackHoleLoop() {
    if (!this.audioContext || !this.masterGain || this.audioContext.state !== 'running') return;
    if (this.blackHoleLoopOsc || this.blackHoleLoopGain) return;

    const now = this.audioContext.currentTime;
    this.blackHoleLoopOsc = this.audioContext.createOscillator();
    this.blackHoleLoopLfo = this.audioContext.createOscillator();
    this.blackHoleLoopGain = this.audioContext.createGain();
    this.blackHoleLoopLfoGain = this.audioContext.createGain();

    this.blackHoleLoopOsc.type = 'sine';
    this.blackHoleLoopOsc.frequency.setValueAtTime(38, now);
    this.blackHoleLoopLfo.type = 'triangle';
    this.blackHoleLoopLfo.frequency.setValueAtTime(0.22, now);
    this.blackHoleLoopLfoGain.gain.setValueAtTime(8, now);
    this.blackHoleLoopLfo.connect(this.blackHoleLoopLfoGain);
    this.blackHoleLoopLfoGain.connect(this.blackHoleLoopOsc.frequency);

    this.blackHoleLoopGain.gain.setValueAtTime(0.0001, now);
    this.blackHoleLoopGain.gain.exponentialRampToValueAtTime(
      0.075 * this.mixProfile.blackHoleLoopGainScale,
      now + 0.25,
    );
    this.blackHoleLoopOsc.connect(this.blackHoleLoopGain);
    this.connectWithPan(this.blackHoleLoopGain, 0);

    this.blackHoleLoopOsc.start(now);
    this.blackHoleLoopLfo.start(now);
  }

  public stopBlackHoleLoop() {
    if (!this.audioContext) return;
    const now = this.audioContext.currentTime;
    const loopGain = this.blackHoleLoopGain;
    if (loopGain) {
      loopGain.gain.cancelScheduledValues(now);
      loopGain.gain.setTargetAtTime(0.0001, now, 0.08);
    }

    if (this.blackHoleLoopOsc) {
      this.blackHoleLoopOsc.stop(now + 0.3);
      this.blackHoleLoopOsc.disconnect();
      this.blackHoleLoopOsc = null;
    }
    if (this.blackHoleLoopLfo) {
      this.blackHoleLoopLfo.stop(now + 0.3);
      this.blackHoleLoopLfo.disconnect();
      this.blackHoleLoopLfo = null;
    }
    if (this.blackHoleLoopLfoGain) {
      this.blackHoleLoopLfoGain.disconnect();
      this.blackHoleLoopLfoGain = null;
    }
    if (this.blackHoleLoopGain) {
      this.blackHoleLoopGain.disconnect();
      this.blackHoleLoopGain = null;
    }
  }

  public playUFOShoot(variant: UFOShootVariant = 'scout', pan: number = 0) {
    if (!this.audioContext || !this.masterGain || this.audioContext.state !== 'running') return;
    const now = this.audioContext.currentTime;
    const minInterval = (variant === 'boss' ? 0.075 : 0.04) * this.mixProfile.ufoShotRateScale;
    if (this.lastUFOShootAt > 0 && now - this.lastUFOShootAt < minInterval) return;
    this.lastUFOShootAt = now;

    const oscA = this.audioContext.createOscillator();
    const oscB = this.audioContext.createOscillator();
    const gain = this.audioContext.createGain();

    const isBoss = variant === 'boss';
    const shotDuration = isBoss ? 0.2 : 0.12;
    const baseA = isBoss ? 560 : 1120;
    const baseB = isBoss ? 300 : 680;
    const endA = isBoss ? 120 : 260;
    const endB = isBoss ? 80 : 180;
    const pitchVariance = Phaser.Math.FloatBetween(0.92, 1.08);

    oscA.type = isBoss ? 'sawtooth' : 'triangle';
    oscB.type = isBoss ? 'triangle' : 'square';
    oscA.frequency.setValueAtTime(baseA * pitchVariance, now);
    oscA.frequency.exponentialRampToValueAtTime(endA * pitchVariance, now + shotDuration);
    oscB.frequency.setValueAtTime(baseB * pitchVariance, now);
    oscB.frequency.exponentialRampToValueAtTime(endB * pitchVariance, now + shotDuration);
    oscA.detune.setValueAtTime(Phaser.Math.Between(-18, 18), now);
    oscB.detune.setValueAtTime(Phaser.Math.Between(-12, 12), now);

    const shotBaseGain = isBoss
      ? 0.2 * this.mixProfile.bossShotGainScale
      : 0.14 * this.mixProfile.scoutShotGainScale;
    gain.gain.setValueAtTime(shotBaseGain, now);
    gain.gain.exponentialRampToValueAtTime(0.01, now + shotDuration);

    oscA.connect(gain);
    oscB.connect(gain);
    this.connectWithPan(
      gain,
      Phaser.Math.Clamp(pan + Phaser.Math.FloatBetween(-0.08, 0.08), -1, 1),
    );

    const click = this.audioContext.createBufferSource();
    const clickBuffer = this.getNoiseBuffer(isBoss ? 0.08 : 0.05);
    if (!clickBuffer) return;
    click.buffer = clickBuffer;
    const clickFilter = this.audioContext.createBiquadFilter();
    clickFilter.type = 'highpass';
    clickFilter.frequency.setValueAtTime(isBoss ? 420 : 700, now);
    const clickGain = this.audioContext.createGain();
    const clickBaseGain = isBoss
      ? 0.06 * this.mixProfile.bossShotGainScale
      : 0.045 * this.mixProfile.scoutShotGainScale;
    clickGain.gain.setValueAtTime(clickBaseGain, now);
    clickGain.gain.exponentialRampToValueAtTime(0.01, now + shotDuration * 0.75);
    click.connect(clickFilter);
    clickFilter.connect(clickGain);
    this.connectWithPan(clickGain, pan);

    oscA.start(now);
    oscB.start(now);
    oscA.stop(now + shotDuration);
    oscB.stop(now + shotDuration);
    click.start(now);
    click.stop(now + shotDuration * 0.8);
  }

  public startUFOSound() {
    if (
      !this.audioContext ||
      !this.masterGain ||
      this.audioContext.state !== 'running' ||
      this.ufoOsc
    )
      return;
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

  public destroy() {
    this.stopUFOSound();
    this.stopBlackHoleLoop();
  }
}
