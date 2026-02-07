import songUrl from './song.mp3';
import { soundManager } from './SoundManager';

class MusicManager {
  private audio: HTMLAudioElement;

  constructor() {
    this.audio = new Audio(songUrl);
    this.audio.loop = true;
    this.audio.volume = 0.3;

    this.audio.muted = soundManager.isMuted();
    soundManager.onChange((muted: boolean) => {
      this.audio.muted = muted;
    });
  }

  play() {
    if (this.audio.paused) {
      this.audio.play().catch(() => {});
    }
  }

  stop() {
    this.audio.pause();
    this.audio.currentTime = 0;
  }
}

export const musicManager = new MusicManager();
