import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from './gameConfig';
import { performanceMonitor } from './PerformanceMonitor';

type HelpSceneData = {
  returnScene?: string;
};

export default class HelpScene extends Phaser.Scene {
  private returnScene: string | null = null;
  private content!: Phaser.GameObjects.Container;
  private maskGraphics!: Phaser.GameObjects.Graphics;
  private viewRect!: Phaser.Geom.Rectangle;
  private scrollY: number = 0;
  private maxScroll: number = 0;
  private dragging: boolean = false;
  private dragStartY: number = 0;
  private dragStartScroll: number = 0;

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

    const frame = this.add.graphics();
    frame.lineStyle(2, 0xffffff, 1);
    frame.strokeRect(this.viewRect.x, this.viewRect.y, this.viewRect.width, this.viewRect.height);

    this.content = this.add.container(this.viewRect.x + 20, this.viewRect.y + 20);
    this.buildContent(viewWidth - 40);

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
    const visibleHeight = this.viewRect.height - 40;
    this.maxScroll = Math.max(0, contentHeight - visibleHeight);
    this.scrollTo(0);

    const zone = this.add
      .zone(this.viewRect.x, this.viewRect.y, this.viewRect.width, this.viewRect.height)
      .setOrigin(0);
    zone.setInteractive({ useHandCursor: true });
    zone.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.dragging = true;
      this.dragStartY = pointer.y;
      this.dragStartScroll = this.scrollY;
    });
    zone.on('pointerup', () => (this.dragging = false));
    zone.on('pointerout', () => (this.dragging = false));
    zone.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      if (!this.dragging) return;
      const delta = pointer.y - this.dragStartY;
      this.scrollTo(this.dragStartScroll - delta);
    });

    this.input.on('wheel', (_pointer: any, _dx: number, dy: number) => {
      this.scrollTo(this.scrollY + dy);
    });
    this.input.keyboard?.on('keydown-H', () => this.close());
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

    addHeader('SCORING');
    addParagraph(
      'Large asteroids split into smaller fragments. Smaller targets score more points, so clean-up pays.',
    );
    addParagraph('High scores allow 3-letter initials entry via arcade-style controls.');
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
  }

  private close() {
    if (this.returnScene) {
      this.scene.resume(this.returnScene);
    }
    this.scene.stop();
  }
}
