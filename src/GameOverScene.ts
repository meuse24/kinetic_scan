import Phaser from 'phaser';
import { AudioManager, DEFAULT_VOLUME } from './AudioManager';
import { creditManager } from './CreditManager';
import {
  cycleDifficulty,
  getCurrentDifficultyKey,
  getDifficultyPreset,
  resolveDifficultyKey,
  setCurrentDifficultyKey,
} from './Difficulty';
import type { DifficultyPresetKey } from './Difficulty';
import {
  GAME_WIDTH,
  GAME_HEIGHT,
  IS_TOUCH,
  applyPendingResize,
  recalculateDimensions,
} from './gameConfig';
import { performanceMonitor } from './PerformanceMonitor';
import { musicManager } from './MusicManager';
import { soundManager } from './SoundManager';
import { isDebugOverlayEnabled, toggleDebugOverlayEnabled } from './DebugSettings';
import { mergeLeaderboardEntries, remoteStatsService } from './RemoteStatsService';
import SceneBackground from './SceneBackground';
import { SettingsOverlayController } from './ui/SettingsOverlayController';
import { SettingsOverlayHost } from './ui/SettingsOverlayHost';

interface GameOverData {
  score?: number;
  scores?: number[];
  players?: number;
  difficulty?: DifficultyPresetKey;
  dailySeed?: string;
}

interface ScoreEntry {
  name: string;
  score: number;
}

type PlayerButton = {
  requiredCredits: number;
  bg: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
};

const STORAGE_KEY_NORMAL = 'spaceShooterHighscore';
const STORAGE_KEY_DAILY = 'spaceShooterDailyHighscore';
const LEADERBOARD_SIZE = 5;
const FALLBACK_ENTRY: ScoreEntry = { name: '---', score: 0 };

export default class GameOverScene extends Phaser.Scene {
  private finalScore = 0;
  private playerScores: number[] = [];
  private playerCount = 1;
  private name: string[] = ['A', 'A', 'A'];
  private cursorIndex = 0;
  private awaitingInitials = false;
  private leaderboardEntries: ScoreEntry[] = [];
  private leaderboardRows: Phaser.GameObjects.Text[] = [];
  private highlightIndex: number | null = null;
  private coinText!: Phaser.GameObjects.Text;
  private creditLabel!: Phaser.GameObjects.Text;
  private difficultyKey: DifficultyPresetKey = getCurrentDifficultyKey();
  private dailySeed: string = '';
  private settingsText!: Phaser.GameObjects.Text;
  private settingsOverlayHost?: SettingsOverlayHost;
  private soundListener?: (muted: boolean) => void;
  private volumeListener?: () => void;
  private playerButtons: PlayerButton[] = [];
  private idleTimer?: Phaser.Time.TimerEvent;
  private audio!: AudioManager;
  private initialsHint?: Phaser.GameObjects.Text;
  private controlHint?: Phaser.GameObjects.Text;
  private keyHandler?: (event: KeyboardEvent) => void;
  private creditListener?: (credits: number) => void;
  private sceneBackground?: SceneBackground;

  constructor() {
    super('GameOverScene');
  }

  preload() {
    SceneBackground.preload(this);
  }

  private getStorageKey() {
    return this.dailySeed ? STORAGE_KEY_DAILY : STORAGE_KEY_NORMAL;
  }

  init(data: GameOverData) {
    this.difficultyKey = resolveDifficultyKey(data?.difficulty ?? null);
    this.dailySeed = data?.dailySeed ?? '';
    setCurrentDifficultyKey(this.difficultyKey);
    const scores = Array.isArray(data.scores) ? [...data.scores] : [data.score ?? 0];
    if (data.players === 2 || scores.length > 1) {
      this.playerCount = 2;
    } else {
      this.playerCount = 1;
    }
    while (scores.length < this.playerCount) scores.push(0);
    this.playerScores = scores.slice(0, this.playerCount);
    this.finalScore = Math.max(...this.playerScores);
    this.name = ['A', 'A', 'A'];
    this.cursorIndex = 0;

    const savedEntries = this.loadScores();
    this.awaitingInitials = this.doesScoreQualify(savedEntries);
    this.buildLeaderboard(savedEntries, this.awaitingInitials);
  }

  create() {
    if (applyPendingResize(this.game)) {
      if (this.scene.isActive('BezelScene')) {
        this.scene.stop('BezelScene');
      }
    }

    const centerX = GAME_WIDTH / 2;
    const centerY = GAME_HEIGHT / 2;

    this.audio = new AudioManager(this);
    musicManager.play(this);
    this.sceneBackground = new SceneBackground(this, {
      depth: -120,
      alpha: 0.44,
      maxOffsetX: 44,
      maxOffsetY: 30,
    });

    if (!this.scene.isActive('BezelScene')) {
      this.scene.launch('BezelScene');
    }
    this.scene.bringToTop('BezelScene');

    if (
      performanceMonitor.crtEnabled &&
      this.game.renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer
    ) {
      this.cameras.main.setPostPipeline('CRTPipeline');
    }

    this.createHelpButton();
    this.createSettingsButton();

    this.add
      .text(centerX, centerY - 260, 'GAME OVER', {
        fontFamily: '"Press Start 2P"',
        fontSize: '64px',
        color: '#ff0000',
        stroke: '#ffffff',
        strokeThickness: 4,
      })
      .setOrigin(0.5);

    this.createScoreSummary(centerX, centerY - 200);

    if (this.awaitingInitials) {
      this.initialsHint = this.add
        .text(centerX, centerY - 150, 'ENTER YOUR INITIALS', {
          fontFamily: '"Press Start 2P"',
          fontSize: '16px',
          color: '#ffff00',
        })
        .setOrigin(0.5);

      this.controlHint = this.add
        .text(centerX, GAME_HEIGHT - 260, 'ARROWS = CHANGE  CONFIRM (ENTER/SPACE)', {
          fontFamily: '"Press Start 2P"',
          fontSize: '12px',
          color: '#888888',
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });

      this.controlHint.on('pointerdown', () => {
        this.confirmLetter();
      });
    }

    this.createLeaderboard(centerX, centerY - 40);

    this.createPlayerButtons(centerX, GAME_HEIGHT - 220);
    this.buildSettingsOverlay(120);
    this.time.delayedCall(120, () => this.refreshLeaderboardFromServerLazy());

    this.coinText = this.add
      .text(centerX, GAME_HEIGHT - 140, 'INSERT COIN (I)', {
        fontFamily: '"Press Start 2P"',
        fontSize: '18px',
        color: '#ffff00',
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    this.coinText.on('pointerdown', () => this.insertCoin());

    this.creditLabel = this.add
      .text(centerX, GAME_HEIGHT - 80, `CREDITS: ${creditManager.getCredits()}`, {
        fontFamily: '"Press Start 2P"',
        fontSize: '16px',
        color: '#ffffff',
      })
      .setOrigin(0.5);

    this.tweens.add({
      targets: this.coinText,
      alpha: 0.25,
      duration: 500,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    this.keyHandler = (event: KeyboardEvent) => this.handleKeydown(event);
    this.input.keyboard?.on('keydown', this.keyHandler);

    let dragStartY = 0;
    let dragStartTime = 0;

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.resetIdleTimer();
      dragStartY = pointer.y;
      dragStartTime = this.time.now;
    });

    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (!this.awaitingInitials) return;

      const dragEndY = pointer.y;
      const dragDuration = this.time.now - dragStartTime;
      const dragDist = Math.abs(dragEndY - dragStartY);

      if (dragDist > 30 && dragDuration < 500) {
        // Swipe detected
        if (dragStartY > dragEndY) {
          this.changeLetter(1); // Swipe Up
        } else {
          this.changeLetter(-1); // Swipe Down
        }
      } else if (dragDist < 10 && dragDuration < 300) {
        // Tap detected
        const entryY = centerY - 40 + (this.highlightIndex ?? 0) * 28;
        const rowHeight = 40;

        if (Math.abs(pointer.y - entryY) < rowHeight) {
          this.confirmLetter();
        } else if (pointer.y < entryY) {
          this.changeLetter(1);
        } else {
          this.changeLetter(-1);
        }
      }
    });

    this.input.on(
      'wheel',
      (_pointer: Phaser.Input.Pointer, _gx: number, _gy: number, _dx: number, dy: number) => {
        if (!this.awaitingInitials) return;
        this.resetIdleTimer();
        if (dy < 0) {
          this.changeLetter(1);
        } else if (dy > 0) {
          this.changeLetter(-1);
        }
      },
    );

    this.creditListener = (credits) => {
      this.creditLabel.setText(`CREDITS: ${credits}`);
      this.updatePlayerButtons();
    };
    creditManager.onChange(this.creditListener, this);
    this.updatePlayerButtons();
    this.soundListener = (_muted) => {
      this.applyGameOverAudioVolume();
      if (this.isSettingsOverlayOpen()) this.refreshSettingsOverlayLabels();
    };
    soundManager.onChange(this.soundListener, this);
    this.volumeListener = () => {
      this.applyGameOverAudioVolume();
      if (this.isSettingsOverlayOpen()) this.refreshSettingsOverlayLabels();
    };
    soundManager.onVolumeChange(this.volumeListener, this);
    this.applyGameOverAudioVolume();

    this.resetIdleTimer();

    this.events.once('shutdown', () => {
      this.sceneBackground?.destroy();
      this.sceneBackground = undefined;
      this.settingsOverlayHost?.destroy();
      this.settingsOverlayHost = undefined;
      if (this.keyHandler) this.input.keyboard?.off('keydown', this.keyHandler);
      if (this.creditListener) creditManager.offChange(this.creditListener, this);
      if (this.soundListener) soundManager.offChange(this.soundListener, this);
      if (this.volumeListener) soundManager.offVolumeChange(this.volumeListener, this);
      this.idleTimer?.remove(false);
    });
  }

  update(_time: number, delta: number) {
    this.sceneBackground?.updateIdle(delta);
    if (this.game.renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer) {
      const hasCrt = this.hasCrtPipeline();
      if (performanceMonitor.crtEnabled && !hasCrt) {
        this.cameras.main.setPostPipeline('CRTPipeline');
      } else if (!performanceMonitor.crtEnabled && hasCrt) {
        this.cameras.main.removePostPipeline('CRTPipeline');
      }
    }
  }

  private createScoreSummary(centerX: number, startY: number) {
    if (this.playerCount === 2) {
      this.add
        .text(centerX, startY, `P1 SCORE: ${this.playerScores[0]}`, {
          fontFamily: '"Press Start 2P"',
          fontSize: '20px',
          color: '#ffffff',
        })
        .setOrigin(0.5);
      this.add
        .text(centerX, startY + 30, `P2 SCORE: ${this.playerScores[1]}`, {
          fontFamily: '"Press Start 2P"',
          fontSize: '20px',
          color: '#ffffff',
        })
        .setOrigin(0.5);
    } else {
      this.add
        .text(centerX, startY, `SCORE: ${this.playerScores[0]}`, {
          fontFamily: '"Press Start 2P"',
          fontSize: '24px',
          color: '#ffffff',
        })
        .setOrigin(0.5);
    }
  }

  private handleKeydown(event: KeyboardEvent) {
    this.resetIdleTimer();

    if (event.code === 'KeyO') {
      if (this.isSettingsOverlayOpen()) this.closeSettingsOverlay();
      else this.openSettingsOverlay();
      return;
    }

    if (event.code === 'Escape' || event.code === 'KeyB') {
      if (this.isSettingsOverlayOpen()) {
        this.closeSettingsOverlay();
        return;
      }
    }

    if (this.isSettingsOverlayOpen()) {
      if (event.code === 'KeyS') {
        this.toggleSound();
      } else if (event.code === 'KeyF') {
        this.toggleFullscreen();
      } else if (event.code === 'KeyC') {
        this.toggleCrt();
      } else if (event.code === 'KeyG') {
        this.toggleDebugSetting();
      } else if (event.code === 'KeyA' || event.code === 'ArrowLeft') {
        this.changeDifficulty(-1);
      } else if (event.code === 'KeyD' || event.code === 'ArrowRight') {
        this.changeDifficulty(1);
      }
      return;
    }

    if (event.code === 'KeyH') {
      this.openHelp();
      return;
    }

    if (event.code === 'KeyI') {
      void this.insertCoin();
      return;
    }

    if (!this.awaitingInitials) {
      if (event.code === 'Digit1' || event.code === 'Numpad1') {
        this.startGame(1);
      } else if (event.code === 'Digit2' || event.code === 'Numpad2') {
        this.startGame(2);
      } else if (event.code === 'ArrowUp' || event.code === 'Space' || event.code === 'Enter') {
        this.startGame(1);
      }
    }

    if (this.awaitingInitials) {
      this.handleInitialsInput(event);
    }
  }

  private handleInitialsInput(event: KeyboardEvent) {
    if (event.code === 'ArrowUp') {
      this.changeLetter(1);
    } else if (event.code === 'ArrowDown') {
      this.changeLetter(-1);
    } else if (event.code === 'Enter' || event.code === 'Space') {
      this.confirmLetter();
    }
  }

  private changeLetter(dir: number) {
    let charCode = this.name[this.cursorIndex].charCodeAt(0);
    charCode += dir;
    if (charCode < 65) charCode = 90;
    if (charCode > 90) charCode = 65;
    this.name[this.cursorIndex] = String.fromCharCode(charCode);
    this.updateHighlightedRow();
  }

  private confirmLetter() {
    this.cursorIndex += 1;
    if (this.cursorIndex >= this.name.length) {
      this.awaitingInitials = false;
      this.cursorIndex = this.name.length - 1;
      this.commitInitials();
      return;
    }
    this.updateHighlightedRow();
  }

  private commitInitials() {
    if (this.highlightIndex !== null) {
      this.leaderboardEntries[this.highlightIndex].name = this.name.join('');
      this.saveScores(this.leaderboardEntries);
      const submitName = this.name.join('');
      const mode = this.dailySeed ? 'daily' : 'normal';
      void remoteStatsService
        .submitHighscore(submitName, this.finalScore, mode)
        .then((snapshot) => {
          if (!snapshot || !this.scene.isActive(this.scene.key)) return;
          const merged = mergeLeaderboardEntries(
            this.loadScores(),
            snapshot.highscores,
            LEADERBOARD_SIZE,
          );
          this.saveScores(merged);
          this.buildLeaderboard(merged, false);
          this.refreshLeaderboardRows();
        });
    }
    this.initialsHint?.setVisible(false);
    this.controlHint?.setVisible(false);
    this.refreshLeaderboardRows();
  }

  private createLeaderboard(centerX: number, topY: number) {
    const title = this.add
      .text(centerX, topY - 60, 'TOP SCORES', {
        fontFamily: '"Press Start 2P"',
        fontSize: '20px',
        color: '#00ffff',
      })
      .setOrigin(0.5);

    const rowSpacing = 28;
    this.leaderboardRows = this.leaderboardEntries.map((entry, index) => {
      const row = this.add
        .text(centerX, topY + index * rowSpacing, this.formatRow(entry, index), {
          fontFamily: '"Press Start 2P"',
          fontSize: '16px',
          color: '#ffffff',
        })
        .setOrigin(0.5);

      if (index === this.highlightIndex) {
        row.setColor('#00ffff');
        this.tweens.add({
          targets: row,
          alpha: 0.2,
          duration: 400,
          yoyo: true,
          repeat: -1,
          ease: 'Sine.easeInOut',
        });
      }

      return row;
    });

    this.add.container(0, 0, [title, ...this.leaderboardRows]);
  }

  private formatRow(entry: ScoreEntry, index: number) {
    let name = entry.name;
    if (this.awaitingInitials && this.highlightIndex === index) {
      name = this.name
        .map((letter, letterIndex) => (letterIndex === this.cursorIndex ? `[${letter}]` : letter))
        .join(' ');
    }
    return `${index + 1}. ${name} ${entry.score}`;
  }

  private updateHighlightedRow() {
    if (this.highlightIndex === null) return;
    this.leaderboardEntries[this.highlightIndex].name = this.name.join('');
    this.leaderboardRows[this.highlightIndex].setText(
      this.formatRow(this.leaderboardEntries[this.highlightIndex], this.highlightIndex),
    );
  }

  private refreshLeaderboardRows() {
    this.leaderboardRows.forEach((row, index) => {
      row.setText(this.formatRow(this.leaderboardEntries[index], index));
    });
  }

  private refreshLeaderboardFromServerLazy() {
    const mode = this.dailySeed ? 'daily' : 'normal';
    remoteStatsService.warmupUserRegistration();
    void remoteStatsService.fetchSnapshotLazy(mode).then((snapshot) => {
      if (!snapshot || !this.scene.isActive(this.scene.key)) return;
      const merged = mergeLeaderboardEntries(
        this.loadScores(),
        snapshot.highscores,
        LEADERBOARD_SIZE,
      );
      this.saveScores(merged);
      if (this.awaitingInitials) return;
      this.buildLeaderboard(merged, false);
      this.refreshLeaderboardRows();
    });
  }

  private async insertCoin() {
    if (this.isSettingsOverlayOpen()) return;
    await this.audio.resume();
    this.audio.playCoin();
    creditManager.addCredits(1);
    this.resetIdleTimer();
  }

  private createPlayerButtons(centerX: number, y: number) {
    const buttonWidth = 220;
    const buttonHeight = 60;
    const spacing = 30;
    const totalWidth = buttonWidth * 2 + spacing;
    const startX = centerX - totalWidth / 2 + buttonWidth / 2;

    const makeButton = (label: string, requiredCredits: number, index: number) => {
      const x = startX + index * (buttonWidth + spacing);
      const bg = this.add
        .rectangle(x, y, buttonWidth, buttonHeight, 0x333333, 0.6)
        .setInteractive({ useHandCursor: true });
      const text = this.add
        .text(x, y, label, {
          fontFamily: '"Press Start 2P"',
          fontSize: '18px',
          color: '#ffffff',
        })
        .setOrigin(0.5);
      bg.on('pointerdown', () => this.startGame(requiredCredits));
      this.playerButtons.push({ requiredCredits, bg, label: text });
    };

    makeButton('1 PLAYER (1)', 1, 0);
    makeButton('2 PLAYER (2)', 2, 1);
  }

  private updatePlayerButtons() {
    const credits = creditManager.getCredits();
    this.playerButtons.forEach((button) => {
      const enabled = credits >= button.requiredCredits;
      button.bg.setFillStyle(enabled ? 0x00aa00 : 0x333333, enabled ? 1 : 0.6);
      button.label.setAlpha(enabled ? 1 : 0.4);
      if (button.bg.input) button.bg.input.enabled = enabled;
    });
  }

  private startGame(requiredCredits: number) {
    if (this.isSettingsOverlayOpen()) return;
    if (!creditManager.spendCredits(requiredCredits)) return;
    remoteStatsService.reportCoinsSpent(requiredCredits);
    void this.audio.resume();
    recalculateDimensions();
    setCurrentDifficultyKey(this.difficultyKey);
    this.scene.start('MainScene', { players: requiredCredits, difficulty: this.difficultyKey });
  }

  private getDifficultyLabel() {
    return `DIFFICULTY: ${getDifficultyPreset(this.difficultyKey).label} (A/D)`;
  }

  private getDebugLabel() {
    return `DEBUG INFO: ${isDebugOverlayEnabled() ? 'ON' : 'OFF'} (G)`;
  }

  private changeDifficulty(direction: 1 | -1) {
    this.difficultyKey = cycleDifficulty(direction);
    this.settingsOverlayHost?.refresh();
  }

  private toggleDebugSetting() {
    toggleDebugOverlayEnabled();
    this.settingsOverlayHost?.refresh();
  }

  private resetIdleTimer() {
    this.idleTimer?.remove(false);
    this.idleTimer = this.time.delayedCall(15000, () => this.startAttract());
  }

  private startAttract() {
    this.scene.start('AttractScene');
  }

  private doesScoreQualify(entries: ScoreEntry[]) {
    if (this.finalScore <= 0) return false;
    if (entries.length < LEADERBOARD_SIZE) return true;
    const sorted = [...entries].sort((a, b) => b.score - a.score);
    const cutoff = sorted[Math.min(sorted.length, LEADERBOARD_SIZE) - 1];
    return this.finalScore > cutoff.score;
  }

  private buildLeaderboard(entries: ScoreEntry[], includeCurrent: boolean) {
    const sorted = [...entries].sort((a, b) => b.score - a.score);
    const merged: ScoreEntry[] = [...sorted];
    this.highlightIndex = null;

    if (includeCurrent) {
      const currentEntry = { name: this.name.join(''), score: this.finalScore };
      const insertIndex = merged.findIndex((entry) => currentEntry.score > entry.score);
      if (insertIndex === -1) {
        merged.push(currentEntry);
        this.highlightIndex = merged.length - 1;
      } else {
        merged.splice(insertIndex, 0, currentEntry);
        this.highlightIndex = insertIndex;
      }
    }

    while (merged.length < LEADERBOARD_SIZE) {
      merged.push({ ...FALLBACK_ENTRY });
    }

    if (merged.length > LEADERBOARD_SIZE) {
      merged.length = LEADERBOARD_SIZE;
      if (this.highlightIndex !== null && this.highlightIndex >= LEADERBOARD_SIZE) {
        this.highlightIndex = null;
      }
    }

    this.leaderboardEntries = merged;
  }

  private loadScores(): ScoreEntry[] {
    const entries: ScoreEntry[] = [];
    try {
      const raw = localStorage.getItem(this.getStorageKey());
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          parsed.forEach((entry) => {
            if (typeof entry?.score === 'number' && typeof entry?.name === 'string') {
              entries.push({ score: entry.score, name: entry.name });
            }
          });
        } else if (typeof parsed?.score === 'number' && typeof parsed?.name === 'string') {
          entries.push({ score: parsed.score, name: parsed.name });
        }
      }
    } catch {
      // ignore malformed storage
    }
    return entries;
  }

  private saveScores(entries: ScoreEntry[]) {
    const trimmed = entries.filter((entry) => entry.score > 0 && entry.name !== '---');
    localStorage.setItem(this.getStorageKey(), JSON.stringify(trimmed));
  }

  private createHelpButton() {
    const btn = this.add
      .text(GAME_WIDTH - 96, 40, 'HELP (H)', {
        fontFamily: '"Press Start 2P"',
        fontSize: '14px',
        color: '#ffffff',
        backgroundColor: '#111111',
        padding: { x: 6, y: 6 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    btn.on('pointerdown', () => this.openHelp());
  }

  private createSettingsButton() {
    this.settingsText = this.add
      .text(GAME_WIDTH - 118, 84, 'SETTINGS (O)', {
        fontFamily: '"Press Start 2P"',
        fontSize: '12px',
        color: '#9be7ff',
        backgroundColor: '#111111',
        padding: { x: 6, y: 6 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    this.settingsText.on('pointerdown', () => {
      if (this.isSettingsOverlayOpen()) this.closeSettingsOverlay();
      else this.openSettingsOverlay();
    });
  }

  private isSettingsOverlayOpen() {
    return this.settingsOverlayHost?.isOpen() ?? false;
  }

  private openSettingsOverlay() {
    this.settingsOverlayHost?.open();
  }

  private closeSettingsOverlay() {
    this.settingsOverlayHost?.close();
  }

  private buildSettingsOverlay(depth: number) {
    if (this.settingsOverlayHost) return;
    const controller = new SettingsOverlayController({
      scene: this,
      depth,
      isTouch: IS_TOUCH,
      isCrtSupported: () => performanceMonitor.isCrtSupported(),
      getSoundLabel: () => this.getSoundLabel(),
      getFullscreenLabel: () => this.getFullscreenLabel(),
      getDifficultyLabel: () => this.getDifficultyLabel(),
      getDebugLabel: () => this.getDebugLabel(),
      getCrtLabel: () => this.getCrtLabel(),
      onToggleSound: () => this.toggleSound(),
      onToggleFullscreen: () => this.toggleFullscreen(),
      onChangeDifficulty: (direction) => this.changeDifficulty(direction),
      onToggleDebug: () => this.toggleDebugSetting(),
      onToggleCrt: () => this.toggleCrt(),
      onCloseRequested: () => this.closeSettingsOverlay(),
    });
    this.settingsOverlayHost = new SettingsOverlayHost({
      triggerText: this.settingsText,
      controller,
      canOpen: () => !this.scene.isActive('HelpScene'),
    });
    this.settingsOverlayHost.build();
  }

  private refreshSettingsOverlayLabels() {
    this.settingsOverlayHost?.refresh();
  }

  private toggleSound() {
    void this.audio.resume();
    soundManager.toggle();
    this.settingsOverlayHost?.refresh();
  }

  private toggleFullscreen() {
    if (IS_TOUCH) return;
    if (this.scale.isFullscreen) {
      this.scale.stopFullscreen();
    } else {
      this.scale.startFullscreen();
    }
    this.settingsOverlayHost?.refresh();
  }

  private toggleCrt() {
    if (!performanceMonitor.isCrtSupported()) return;
    performanceMonitor.toggleCrtUserEnabled();
    this.settingsOverlayHost?.refresh();
  }

  private getSoundLabel() {
    return `SOUND: ${soundManager.isMuted() ? 'OFF' : 'ON'} (S)`;
  }

  private getFullscreenLabel() {
    if (IS_TOUCH) return 'FULLSCREEN: N/A (TOUCH)';
    return `FULLSCREEN: ${this.scale.isFullscreen ? 'ON' : 'OFF'} (F)`;
  }

  private getCrtLabel() {
    if (!performanceMonitor.isCrtSupported()) return 'SCAN / CRT: N/A';
    if (!performanceMonitor.isCrtUserEnabled()) return 'SCAN / CRT: OFF (C)';
    if (!performanceMonitor.crtEnabled) return 'SCAN / CRT: AUTO OFF (PERF)';
    return 'SCAN / CRT: ON (C)';
  }

  private hasCrtPipeline() {
    const pipeline = this.cameras.main.getPostPipeline('CRTPipeline');
    return Array.isArray(pipeline) ? pipeline.length > 0 : Boolean(pipeline);
  }

  private applyGameOverAudioVolume() {
    if (!this.audio) return;
    if (soundManager.isMuted()) {
      this.audio.setVolume(0);
      return;
    }
    this.audio.setVolume(DEFAULT_VOLUME * soundManager.getEffectiveSfxVolume());
  }

  private openHelp() {
    if (this.isSettingsOverlayOpen()) return;
    if (this.scene.isActive('HelpScene')) return;
    this.scene.launch('HelpScene', { returnScene: this.scene.key });
    this.scene.pause();
  }
}
