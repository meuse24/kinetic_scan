import Phaser from 'phaser';
import menuMusicUrl from './song.mp3';
import gameplayMusicUrl from '../gameloop.mp3';
import { soundManager } from './SoundManager';

export const MENU_MUSIC_KEY = 'music_menu_loop';
export const GAMEPLAY_MUSIC_KEY = 'music_gameplay_loop';
export const MENU_MUSIC_URL = menuMusicUrl;
export const GAMEPLAY_MUSIC_URL = gameplayMusicUrl;
type ManagedMusicSound =
  | Phaser.Sound.WebAudioSound
  | Phaser.Sound.HTML5AudioSound
  | Phaser.Sound.NoAudioSound;

class MusicManager {
  private readonly menuVolume = 0.3;
  private readonly gameplayVolume = 0.1;
  private phaserSoundManager: Phaser.Sound.BaseSoundManager | null = null;
  private menuAudio: Phaser.Sound.BaseSound | null = null;
  private gameplayAudio: Phaser.Sound.BaseSound | null = null;
  private muteListenerBound = false;
  private volumeListenerBound = false;

  private applyMuteState() {
    if (!this.phaserSoundManager) return;
    this.phaserSoundManager.mute = soundManager.isMuted();
  }

  private bindMuteListener() {
    if (this.muteListenerBound) return;
    this.muteListenerBound = true;
    soundManager.onChange((muted: boolean) => {
      if (!this.phaserSoundManager) return;
      this.phaserSoundManager.mute = muted;
    });
  }

  private applyVolumeState() {
    const bgmScale = soundManager.getEffectiveBgmVolume();
    const menuTrack = this.menuAudio as ManagedMusicSound | null;
    const gameplayTrack = this.gameplayAudio as ManagedMusicSound | null;
    if (menuTrack) menuTrack.volume = this.menuVolume * bgmScale;
    if (gameplayTrack) gameplayTrack.volume = this.gameplayVolume * bgmScale;
  }

  private bindVolumeListener() {
    if (this.volumeListenerBound) return;
    this.volumeListenerBound = true;
    soundManager.onVolumeChange(() => {
      this.applyVolumeState();
    });
  }

  private ensureTracks(scene: Phaser.Scene) {
    const sound = scene.sound;
    this.phaserSoundManager = sound;
    if (!this.menuAudio) {
      this.menuAudio =
        sound.get(MENU_MUSIC_KEY) ??
        sound.add(MENU_MUSIC_KEY, {
          loop: true,
          volume: this.menuVolume,
        });
    }
    if (!this.gameplayAudio) {
      this.gameplayAudio =
        sound.get(GAMEPLAY_MUSIC_KEY) ??
        sound.add(GAMEPLAY_MUSIC_KEY, {
          loop: true,
          // Keep gameplay loop intentionally quiet so SFX stay in the foreground.
          volume: this.gameplayVolume,
        });
    }
    this.applyMuteState();
    this.applyVolumeState();
    this.bindMuteListener();
    this.bindVolumeListener();
  }

  play(scene: Phaser.Scene) {
    this.ensureTracks(scene);
    this.stopGameplay();
    if (!this.menuAudio?.isPlaying) {
      this.menuAudio?.play();
    }
  }

  stop() {
    this.menuAudio?.stop();
  }

  playGameplay(scene: Phaser.Scene) {
    this.ensureTracks(scene);
    this.stop();
    if (!this.gameplayAudio?.isPlaying) {
      this.gameplayAudio?.play();
    }
  }

  pauseGameplay() {
    if (this.gameplayAudio?.isPlaying) this.gameplayAudio.pause();
  }

  resumeGameplay() {
    if (this.gameplayAudio?.isPaused) this.gameplayAudio.resume();
  }

  stopGameplay() {
    this.gameplayAudio?.stop();
  }
}

export const musicManager = new MusicManager();
