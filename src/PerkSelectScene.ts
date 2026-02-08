import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from './gameConfig';
import { performanceMonitor } from './PerformanceMonitor';
import type { PerkDefinition, PerkSystem } from './PerkSystem';
import SceneBackground from './SceneBackground';

interface PerkSelectData {
  perkSystem: PerkSystem;
  level: number;
}

export default class PerkSelectScene extends Phaser.Scene {
  private perkSystem!: PerkSystem;
  private choices: PerkDefinition[] = [];
  private autoTimer?: Phaser.Time.TimerEvent;
  private sceneBackground?: SceneBackground;

  constructor() {
    super('PerkSelectScene');
  }

  preload() {
    SceneBackground.preload(this);
  }

  create(data: PerkSelectData) {
    this.perkSystem = data.perkSystem;
    const level = data.level;
    this.sceneBackground = new SceneBackground(this, {
      depth: -120,
      alpha: 0.42,
      maxOffsetX: 42,
      maxOffsetY: 28,
    });

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

    // Roll choices
    this.choices = this.perkSystem.rollChoices(3);

    if (this.choices.length === 0) {
      // All perks maxed — auto-close
      this.selectDone();
      return;
    }

    // Layout calculations
    const isNarrow = GAME_WIDTH < 768;
    const cardWidth = isNarrow ? Math.min(480, GAME_WIDTH - 60) : 240;
    const cardHeight = isNarrow ? 120 : 280;
    const cardGap = isNarrow ? 16 : 24;

    const totalHeight = isNarrow
      ? this.choices.length * cardHeight + (this.choices.length - 1) * cardGap
      : cardHeight;
    const totalWidth = isNarrow
      ? cardWidth
      : this.choices.length * cardWidth + (this.choices.length - 1) * cardGap;

    const titleY = isNarrow ? centerY - totalHeight / 2 - 80 : centerY - 220;
    const subtitleY = isNarrow ? centerY - totalHeight / 2 - 40 : centerY - 175;

    // Title
    this.add
      .text(centerX, titleY, `LEVEL ${level} PERK`, {
        fontFamily: '"Press Start 2P"',
        fontSize: isNarrow ? '24px' : '32px',
        color: '#ffdd00',
        stroke: '#000000',
        strokeThickness: 4,
      })
      .setOrigin(0.5);

    this.add
      .text(centerX, subtitleY, 'CHOOSE AN UPGRADE', {
        fontFamily: '"Press Start 2P"',
        fontSize: '16px',
        color: '#aaaaaa',
      })
      .setOrigin(0.5);

    // Render cards
    const startX = isNarrow ? centerX : centerX - totalWidth / 2 + cardWidth / 2;
    const startY = isNarrow ? centerY - totalHeight / 2 + cardHeight / 2 + 20 : centerY + 20;

    this.choices.forEach((perk, i) => {
      const cx = isNarrow ? startX : startX + i * (cardWidth + cardGap);
      const cy = isNarrow ? startY + i * (cardHeight + cardGap) : startY;
      const currentStacks = this.perkSystem.getStacks(perk.id);

      // Card background
      const card = this.add.rectangle(cx, cy, cardWidth, cardHeight, 0x222244, 1);
      card.setStrokeStyle(2, Phaser.Display.Color.HexStringToColor(perk.color).color);
      card.setInteractive({ useHandCursor: true });

      if (isNarrow) {
        // Horizontal layout within the narrow card
        const iconSize = 40;
        const padding = 16;
        const leftX = cx - cardWidth / 2 + padding + iconSize / 2;

        // Icon
        this.add
          .text(leftX, cy, perk.icon, {
            fontFamily: '"Press Start 2P"',
            fontSize: '32px',
            color: perk.color,
          })
          .setOrigin(0.5);

        // Name
        this.add
          .text(leftX + iconSize + 12, cy - 20, perk.name, {
            fontFamily: '"Press Start 2P"',
            fontSize: '14px',
            color: '#ffffff',
            align: 'left',
          })
          .setOrigin(0, 0.5);

        // Description
        this.add
          .text(leftX + iconSize + 12, cy + 10, perk.description, {
            fontFamily: '"Press Start 2P"',
            fontSize: '10px',
            color: '#cccccc',
            wordWrap: { width: cardWidth - iconSize - padding * 3 },
            align: 'left',
          })
          .setOrigin(0, 0.5);

        // Stack & Key hint (bottom right)
        const rightX = cx + cardWidth / 2 - padding;
        const stackLabel = perk.maxStacks > 1 ? `${currentStacks}/${perk.maxStacks}` : '';
        this.add
          .text(rightX, cy - 20, stackLabel, {
            fontFamily: '"Press Start 2P"',
            fontSize: '11px',
            color: '#888888',
          })
          .setOrigin(1, 0.5);

        this.add
          .text(rightX, cy + 20, `[${i + 1}]`, {
            fontFamily: '"Press Start 2P"',
            fontSize: '16px',
            color: '#ffff88',
          })
          .setOrigin(1, 0.5);
      } else {
        // Vertical layout (original desktop style)
        // Icon
        this.add
          .text(cx, cy - 95, perk.icon, {
            fontFamily: '"Press Start 2P"',
            fontSize: '44px',
            color: perk.color,
          })
          .setOrigin(0.5);

        // Name
        this.add
          .text(cx, cy - 35, perk.name, {
            fontFamily: '"Press Start 2P"',
            fontSize: '14px',
            color: '#ffffff',
            wordWrap: { width: cardWidth - 24 },
            align: 'center',
          })
          .setOrigin(0.5);

        // Description
        this.add
          .text(cx, cy + 15, perk.description, {
            fontFamily: '"Press Start 2P"',
            fontSize: '11px',
            color: '#cccccc',
            wordWrap: { width: cardWidth - 24 },
            align: 'center',
          })
          .setOrigin(0.5);

        // Stack indicator
        if (perk.maxStacks > 1) {
          const stackLabel = `${currentStacks}/${perk.maxStacks}`;
          this.add
            .text(cx, cy + 60, stackLabel, {
              fontFamily: '"Press Start 2P"',
              fontSize: '12px',
              color: '#888888',
            })
            .setOrigin(0.5);
        }

        // Key hint
        this.add
          .text(cx, cy + 105, `[${i + 1}]`, {
            fontFamily: '"Press Start 2P"',
            fontSize: '18px',
            color: '#ffff88',
          })
          .setOrigin(0.5);
      }

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
    const timerY = isNarrow ? centerY + totalHeight / 2 + 60 : centerY + 180;
    const timerText = this.add
      .text(centerX, timerY, '15', {
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

    this.events.once('shutdown', () => {
      this.sceneBackground?.destroy();
      this.sceneBackground = undefined;
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

  update(_time: number, delta: number) {
    this.sceneBackground?.updateIdle(delta);
  }
}
