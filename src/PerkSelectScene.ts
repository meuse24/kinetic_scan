import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from './gameConfig';
import { performanceMonitor } from './PerformanceMonitor';
import type { PerkDefinition, PerkSystem } from './PerkSystem';

interface PerkSelectData {
  perkSystem: PerkSystem;
  level: number;
}

export default class PerkSelectScene extends Phaser.Scene {
  private perkSystem!: PerkSystem;
  private choices: PerkDefinition[] = [];
  private autoTimer?: Phaser.Time.TimerEvent;

  constructor() {
    super('PerkSelectScene');
  }

  create(data: PerkSelectData) {
    this.perkSystem = data.perkSystem;
    const level = data.level;

    if (
      performanceMonitor.crtEnabled &&
      this.game.renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer
    ) {
      this.cameras.main.setPostPipeline('CRTPipeline');
    }

    const centerX = GAME_WIDTH / 2;
    const centerY = GAME_HEIGHT / 2;

    // Overlay
    const overlay = this.add.rectangle(centerX, centerY, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0.8);
    overlay.setInteractive();

    // Title
    this.add
      .text(centerX, centerY - 200, `LEVEL ${level} PERK`, {
        fontFamily: '"Press Start 2P"',
        fontSize: '28px',
        color: '#ffdd00',
        stroke: '#000000',
        strokeThickness: 4,
      })
      .setOrigin(0.5);

    this.add
      .text(centerX, centerY - 160, 'CHOOSE AN UPGRADE', {
        fontFamily: '"Press Start 2P"',
        fontSize: '14px',
        color: '#aaaaaa',
      })
      .setOrigin(0.5);

    // Roll choices
    this.choices = this.perkSystem.rollChoices(3);

    if (this.choices.length === 0) {
      // All perks maxed — auto-close
      this.selectDone();
      return;
    }

    // Render cards
    const cardWidth = 200;
    const cardHeight = 240;
    const cardGap = 24;
    const totalWidth = this.choices.length * cardWidth + (this.choices.length - 1) * cardGap;
    const startX = centerX - totalWidth / 2 + cardWidth / 2;

    this.choices.forEach((perk, i) => {
      const cx = startX + i * (cardWidth + cardGap);
      const cy = centerY + 20;
      const currentStacks = this.perkSystem.getStacks(perk.id);

      // Card background
      const card = this.add.rectangle(cx, cy, cardWidth, cardHeight, 0x222244, 1);
      card.setStrokeStyle(2, Phaser.Display.Color.HexStringToColor(perk.color).color);
      card.setInteractive({ useHandCursor: true });

      // Icon
      this.add
        .text(cx, cy - 80, perk.icon, {
          fontFamily: '"Press Start 2P"',
          fontSize: '36px',
          color: perk.color,
        })
        .setOrigin(0.5);

      // Name
      this.add
        .text(cx, cy - 30, perk.name, {
          fontFamily: '"Press Start 2P"',
          fontSize: '11px',
          color: '#ffffff',
          wordWrap: { width: cardWidth - 20 },
          align: 'center',
        })
        .setOrigin(0.5);

      // Description
      this.add
        .text(cx, cy + 10, perk.description, {
          fontFamily: '"Press Start 2P"',
          fontSize: '9px',
          color: '#cccccc',
          wordWrap: { width: cardWidth - 20 },
          align: 'center',
        })
        .setOrigin(0.5);

      // Stack indicator
      if (perk.maxStacks > 1) {
        const stackLabel = `${currentStacks}/${perk.maxStacks}`;
        this.add
          .text(cx, cy + 45, stackLabel, {
            fontFamily: '"Press Start 2P"',
            fontSize: '10px',
            color: '#888888',
          })
          .setOrigin(0.5);
      }

      // Key hint
      this.add
        .text(cx, cy + 90, `[${i + 1}]`, {
          fontFamily: '"Press Start 2P"',
          fontSize: '14px',
          color: '#ffff88',
        })
        .setOrigin(0.5);

      // Hover effect
      card.on('pointerover', () => {
        card.setFillStyle(0x334466);
      });
      card.on('pointerout', () => {
        card.setFillStyle(0x222244);
      });

      // Click
      card.on('pointerdown', () => {
        this.selectPerk(perk);
      });
    });

    // Keyboard shortcuts
    for (let i = 0; i < this.choices.length; i++) {
      this.input.keyboard?.on(`keydown-${i + 1}`, () => {
        this.selectPerk(this.choices[i]);
      });
    }

    // Auto-timeout: 15s → pick random
    const timerText = this.add
      .text(centerX, centerY + 180, '15', {
        fontFamily: '"Press Start 2P"',
        fontSize: '12px',
        color: '#666666',
      })
      .setOrigin(0.5);

    let remaining = 15;
    this.autoTimer = this.time.addEvent({
      delay: 1000,
      repeat: 14,
      callback: () => {
        remaining--;
        timerText.setText(`${remaining}`);
        if (remaining <= 0) {
          const pick = Phaser.Utils.Array.GetRandom(this.choices);
          this.selectPerk(pick);
        }
      },
    });
  }

  private selectPerk(perk: PerkDefinition) {
    this.perkSystem.addPerk(perk.id);
    this.selectDone();
  }

  private selectDone() {
    this.autoTimer?.remove(false);
    this.scene.stop();
    // Signal MainScene to continue level transition
    this.scene.get('MainScene').events.emit('perkSelectDone');
  }
}
