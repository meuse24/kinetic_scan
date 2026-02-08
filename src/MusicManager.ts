import songUrl from './song.mp3';
import gameplayLoopUrl from '../gameloop.mp3';
import { soundManager } from './SoundManager';

class MusicManager {
  private menuAudio: HTMLAudioElement;
  private gameplayAudio: HTMLAudioElement;

  constructor() {
    this.menuAudio = new Audio(songUrl);
    this.menuAudio.loop = true;
    this.menuAudio.volume = 0.3;

    this.gameplayAudio = new Audio(gameplayLoopUrl);
    this.gameplayAudio.loop = true;
    // Keep gameplay loop intentionally quiet so SFX stay in the foreground.
    this.gameplayAudio.volume = 0.1;

    const muted = soundManager.isMuted();
    this.menuAudio.muted = muted;
    this.gameplayAudio.muted = muted;
    soundManager.onChange((muted: boolean) => {
      this.menuAudio.muted = muted;
      this.gameplayAudio.muted = muted;
    });
  }

  play() {
    this.stopGameplay();
    if (this.menuAudio.paused) {
      this.menuAudio.play().catch(() => {});
    }
  }

  stop() {
    this.menuAudio.pause();
    this.menuAudio.currentTime = 0;
  }

  playGameplay() {
    this.stop();
    if (this.gameplayAudio.paused) {
      this.gameplayAudio.play().catch(() => {});
    }
  }

  pauseGameplay() {
    this.gameplayAudio.pause();
  }

  resumeGameplay() {
    if (this.gameplayAudio.paused) {
      this.gameplayAudio.play().catch(() => {});
    }
  }

  stopGameplay() {
    this.gameplayAudio.pause();
    this.gameplayAudio.currentTime = 0;
  }
}

export const musicManager = new MusicManager();
