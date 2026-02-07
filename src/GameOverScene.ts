import Phaser from 'phaser';
import { AudioManager } from './AudioManager';
import { creditManager } from './CreditManager';
import { GAME_WIDTH, GAME_HEIGHT, applyPendingResize } from './gameConfig';
import { performanceMonitor } from './PerformanceMonitor';

interface GameOverData {
  score?: number;
  scores?: number[];
  players?: number;
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

const STORAGE_KEY = 'spaceShooterHighscore';
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
  private playerButtons: PlayerButton[] = [];
  private idleTimer?: Phaser.Time.TimerEvent;
  private audio!: AudioManager;
  private initialsHint?: Phaser.GameObjects.Text;
  private controlHint?: Phaser.GameObjects.Text;
  private keyHandler?: (event: KeyboardEvent) => void;
  private creditListener?: (credits: number) => void;

  constructor() {
    super('GameOverScene');
  }

  init(data: GameOverData) {
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
        .text(centerX, GAME_HEIGHT - 260, 'ARROWS = CHANGE  FIRE = CONFIRM', {
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

    this.creditListener = (credits) => {
      this.creditLabel.setText(`CREDITS: ${credits}`);
      this.updatePlayerButtons();
    };
    creditManager.onChange(this.creditListener, this);
    this.updatePlayerButtons();

    this.resetIdleTimer();

    this.events.once('shutdown', () => {
      if (this.keyHandler) this.input.keyboard?.off('keydown', this.keyHandler);
      if (this.creditListener) creditManager.offChange(this.creditListener, this);
      this.idleTimer?.remove(false);
    });
  }

  update() {
    if (
      !performanceMonitor.crtEnabled &&
      this.game.renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer
    ) {
      this.cameras.main.removePostPipeline('CRTPipeline');
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

    if (event.code === 'KeyH') {
      this.openHelp();
      return;
    }

    if (event.code === 'KeyI') {
      void this.insertCoin();
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

  private async insertCoin() {
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
    if (!creditManager.spendCredits(requiredCredits)) return;
    void this.audio.resume();
    document.documentElement.requestFullscreen?.().catch(() => {});
    this.scene.start('MainScene', { players: requiredCredits });
  }

  private resetIdleTimer() {
    this.idleTimer?.remove(false);
    this.idleTimer = this.time.delayedCall(15000, () => this.startAttract());
  }

  private startAttract() {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
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
      const raw = localStorage.getItem(STORAGE_KEY);
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
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed));
  }

  private createHelpButton() {
    const btn = this.add
      .text(GAME_WIDTH - 40, 40, 'H', {
        fontFamily: '"Press Start 2P"',
        fontSize: '16px',
        color: '#ffffff',
        backgroundColor: '#111111',
        padding: { x: 6, y: 6 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    btn.on('pointerdown', () => this.openHelp());
  }

  private openHelp() {
    if (this.scene.isActive('HelpScene')) return;
    this.scene.launch('HelpScene', { returnScene: this.scene.key });
    this.scene.pause();
  }
}
