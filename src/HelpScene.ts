import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from './gameConfig';
import { performanceMonitor } from './PerformanceMonitor';

type HelpSceneData = {
  returnScene?: string;
};

export default class HelpScene extends Phaser.Scene {
  private returnScene: string | null = null;
  private content!: Phaser.GameObjects.Container;
  private scrollGraphics!: Phaser.GameObjects.Graphics;
  private scrollHint!: Phaser.GameObjects.Text;
  private maskGraphics!: Phaser.GameObjects.Graphics;
  private inputZone!: Phaser.GameObjects.Zone;
  private viewRect!: Phaser.Geom.Rectangle;
  private scrollY: number = 0;
  private maxScroll: number = 0;
  private visibleHeight: number = 0;
  private isPointerOverView: boolean = false;
  private dragging: boolean = false;
  private dragStartY: number = 0;
  private dragStartScroll: number = 0;
  private wheelHandler?: (
    pointer: Phaser.Input.Pointer,
    currentlyOver: Phaser.GameObjects.GameObject[],
    deltaX: number,
    deltaY: number,
  ) => void;
  private keyHandler?: (event: KeyboardEvent) => void;
  private pointerUpHandler?: () => void;

  constructor() {
    super('HelpScene');
  }

  init(data: HelpSceneData) {
    this.returnScene = data?.returnScene ?? null;
  }

  create() {
    const centerX = GAME_WIDTH / 2;
    const titleY = 80;

    if (
      performanceMonitor.crtEnabled &&
      this.game.renderer instanceof Phaser.Renderer.WebGL.WebGLRenderer
    ) {
      this.cameras.main.setPostPipeline('CRTPipeline');
    }

    if (!this.scene.isActive('BezelScene')) {
      this.scene.launch('BezelScene');
    }
    this.scene.bringToTop('BezelScene');

    this.add
      .text(centerX, titleY, 'HELP', {
        fontFamily: '"Press Start 2P"',
        fontSize: '36px',
        color: '#ffffff',
      })
      .setOrigin(0.5);

    const backBtn = this.add
      .text(GAME_WIDTH - 80, titleY, 'BACK', {
        fontFamily: '"Press Start 2P"',
        fontSize: '14px',
        color: '#ffffff',
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    backBtn.on('pointerdown', () => this.close());

    const margin = Math.max(40, GAME_WIDTH * 0.12);
    const viewWidth = GAME_WIDTH - margin * 2;
    const viewHeight = GAME_HEIGHT - 200;
    this.viewRect = new Phaser.Geom.Rectangle(margin, 140, viewWidth, viewHeight);
    this.visibleHeight = this.viewRect.height - 40;

    const frame = this.add.graphics();
    frame.lineStyle(2, 0xffffff, 1);
    frame.strokeRect(this.viewRect.x, this.viewRect.y, this.viewRect.width, this.viewRect.height);

    this.content = this.add.container(this.viewRect.x + 20, this.viewRect.y + 20);
    this.buildContent(viewWidth - 74);
    this.scrollGraphics = this.add.graphics().setDepth(20);
    this.scrollHint = this.add
      .text(this.viewRect.right - 12, this.viewRect.bottom + 18, 'SCROLL: WHEEL / DRAG / ARROWS', {
        fontFamily: '"Press Start 2P"',
        fontSize: '10px',
        color: '#7dd3fc',
      })
      .setOrigin(1, 0.5);

    this.maskGraphics = this.make.graphics({ x: 0, y: 0 });
    this.maskGraphics.fillStyle(0xffffff, 1);
    this.maskGraphics.fillRect(
      this.viewRect.x,
      this.viewRect.y,
      this.viewRect.width,
      this.viewRect.height,
    );
    const mask = this.maskGraphics.createGeometryMask();
    this.content.setMask(mask);

    const contentHeight = this.getContentHeight();
    this.maxScroll = Math.max(0, contentHeight - this.visibleHeight);
    this.scrollTo(0);

    this.inputZone = this.add
      .zone(this.viewRect.x, this.viewRect.y, this.viewRect.width, this.viewRect.height)
      .setOrigin(0);
    this.inputZone.setInteractive({ useHandCursor: true });
    this.inputZone.on('pointerover', () => {
      this.isPointerOverView = true;
    });
    this.inputZone.on('pointerout', () => {
      this.isPointerOverView = false;
      this.dragging = false;
    });
    this.inputZone.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.maxScroll <= 0) return;
      this.dragging = true;
      this.dragStartY = pointer.y;
      this.dragStartScroll = this.scrollY;
    });
    this.inputZone.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!this.dragging) return;
      const delta = pointer.y - this.dragStartY;
      this.scrollTo(this.dragStartScroll - delta);
    });

    this.pointerUpHandler = () => {
      this.dragging = false;
    };
    this.input.on('pointerup', this.pointerUpHandler);

    this.wheelHandler = (
      pointer: Phaser.Input.Pointer,
      _currentlyOver: Phaser.GameObjects.GameObject[],
      _dx: number,
      dy: number,
    ) => {
      if (!this.isPointerOverView && !this.viewRect.contains(pointer.x, pointer.y)) return;
      this.scrollTo(this.scrollY + dy);
    };
    this.input.on('wheel', this.wheelHandler);

    this.keyHandler = (event: KeyboardEvent) => {
      const pageStep = Math.max(120, this.visibleHeight * 0.85);
      switch (event.code) {
        case 'ArrowDown':
        case 'KeyS':
          this.scrollTo(this.scrollY + 46);
          event.preventDefault();
          return;
        case 'ArrowUp':
        case 'KeyW':
          this.scrollTo(this.scrollY - 46);
          event.preventDefault();
          return;
        case 'PageDown':
          this.scrollTo(this.scrollY + pageStep);
          event.preventDefault();
          return;
        case 'PageUp':
          this.scrollTo(this.scrollY - pageStep);
          event.preventDefault();
          return;
        case 'Home':
          this.scrollTo(0);
          event.preventDefault();
          return;
        case 'End':
          this.scrollTo(this.maxScroll);
          event.preventDefault();
          return;
        case 'KeyH':
        case 'Escape':
          this.close();
          event.preventDefault();
          return;
      }
    };
    this.input.keyboard?.on('keydown', this.keyHandler);

    this.events.once('shutdown', () => {
      if (this.wheelHandler) this.input.off('wheel', this.wheelHandler);
      if (this.keyHandler) this.input.keyboard?.off('keydown', this.keyHandler);
      if (this.pointerUpHandler) this.input.off('pointerup', this.pointerUpHandler);
    });
  }

  private buildContent(wrapWidth: number) {
    const sectionColor = '#00ffff';
    const powerColor = '#ffd166';
    const textStyle = {
      fontFamily: '"Press Start 2P"',
      fontSize: '14px',
      color: '#ffffff',
      wordWrap: { width: wrapWidth },
      lineSpacing: 6,
    };
    let y = 0;

    const addHeader = (label: string) => {
      const header = this.add.text(0, y, label, {
        fontFamily: '"Press Start 2P"',
        fontSize: '16px',
        color: sectionColor,
      });
      this.content.add(header);
      y += 26;
    };

    const addParagraph = (text: string) => {
      const p = this.add.text(0, y, text, textStyle);
      this.content.add(p);
      y += p.height + 18;
    };

    const addPowerUp = (name: string, desc: string) => {
      const nameText = this.add.text(0, y, name, {
        fontFamily: '"Press Start 2P"',
        fontSize: '14px',
        color: powerColor,
      });
      this.content.add(nameText);
      y += 18;
      const descText = this.add.text(20, y, desc, textStyle);
      this.content.add(descText);
      y += descText.height + 14;
    };

    addHeader('CONTROLS');
    addParagraph(
      'Desktop: Move with Arrows or WASD. Fire with Space or left-click. Tap firing to build heat slower than holding.',
    );
    addParagraph(
      'Mobile: Touch-drag anywhere to move the ship relatively (offset-based control). This prevents your finger from obstructing the view. Auto-fire is enabled by default while touching. Manage heat to avoid overheat lockouts.',
    );

    addHeader('LEVEL FLOW');
    addParagraph(
      'Fill the LEVEL NEXT score target to trigger an end-of-level BOSS FIGHT. The boss UFO appears only in this end phase.',
    );
    addParagraph(
      'After boss destruction, gameplay pauses and a short LEVEL countdown starts. Use this moment to reset position and prepare for faster asteroid waves.',
    );

    addHeader('POWER-UPS');
    addPowerUp('TRIPLE SHOT', 'Fires a three-shot spread for a short duration.');
    addPowerUp('SLOW-MO', 'Slows time briefly to help dodge dense patterns.');
    addPowerUp('SHIELD', 'Absorbs one hit and then breaks.');
    addPowerUp('EMP', 'Expanding shockwave that vaporizes nearby asteroids.');
    addPowerUp('GHOST', 'Phase through asteroids with temporary intangibility.');
    addPowerUp('WINGMAN', 'Two drones flank you and add extra fire.');
    addPowerUp('COOLING', 'Cannon cooling field: blocks overheat buildup while active.');
    addPowerUp('BLACK HOLE', 'Creates a local gravity well that pulls asteroids in.');
    addPowerUp('MAGNETIC', 'Bullets home toward the nearest asteroid for a short time.');

    addHeader('WORLD EVENTS');
    addParagraph(
      'WORMHOLE ANOMALY: A drifting anomaly can appear and bend both asteroid movement and bullet trajectories nearby.',
    );
    addParagraph(
      'ELITE DRONE: Rare rescue/salvage target. Touch or shoot it to earn a permanent run perk (extra life, better cooling, or longer magnetic effect).',
    );

    addHeader('SCORING');
    addParagraph(
      'Large asteroids split into smaller fragments. Smaller targets score more points, so clean-up pays.',
    );
    addParagraph(
      'High scores allow 3-letter initials entry via arcade-style controls. Difficulty and survival time both strongly affect final score potential.',
    );
  }

  private getContentHeight() {
    let maxY = 0;
    this.content.list.forEach((child: any) => {
      const bottom = child.y + (child.height || 0);
      if (bottom > maxY) maxY = bottom;
    });
    return maxY;
  }

  private scrollTo(value: number) {
    this.scrollY = Phaser.Math.Clamp(value, 0, this.maxScroll);
    this.content.y = this.viewRect.y + 20 - this.scrollY;
    this.drawScrollBar();
  }

  private drawScrollBar() {
    this.scrollGraphics.clear();
    const needsScroll = this.maxScroll > 0;
    this.scrollHint.setVisible(needsScroll);
    if (!needsScroll) return;

    const trackWidth = 8;
    const trackX = this.viewRect.right - 12;
    const trackTop = this.viewRect.y + 8;
    const trackHeight = this.viewRect.height - 16;

    this.scrollGraphics.fillStyle(0x1d2732, 0.85);
    this.scrollGraphics.fillRoundedRect(
      trackX - trackWidth / 2,
      trackTop,
      trackWidth,
      trackHeight,
      4,
    );

    const contentHeight = this.getContentHeight();
    const thumbHeight = Phaser.Math.Clamp(
      (this.visibleHeight / contentHeight) * trackHeight,
      24,
      trackHeight,
    );
    const travel = Math.max(0, trackHeight - thumbHeight);
    const ratio = this.maxScroll <= 0 ? 0 : this.scrollY / this.maxScroll;
    const thumbTop = trackTop + travel * ratio;

    this.scrollGraphics.fillStyle(0x9be7ff, 0.95);
    this.scrollGraphics.fillRoundedRect(
      trackX - trackWidth / 2,
      thumbTop,
      trackWidth,
      thumbHeight,
      4,
    );
  }

  private close() {
    if (this.returnScene) {
      this.scene.resume(this.returnScene);
    }
    this.scene.stop();
  }
}
