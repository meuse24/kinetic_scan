import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from './gameConfig';
import SceneBackground from './SceneBackground';
import {
  applyCrtPipelineIfEnabled,
  createFullscreenOverlay,
  ensureBezelScene,
} from './ui/SceneOverlayUtils';

type HelpSceneData = {
  returnScene?: string;
};

export default class HelpScene extends Phaser.Scene {
  private returnScene: string | null = null;
  private returnSceneInputWasEnabled: boolean = true;
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
  private sceneBackground?: SceneBackground;

  constructor() {
    super('HelpScene');
  }

  preload() {
    SceneBackground.preload(this);
  }

  init(data: HelpSceneData) {
    this.returnScene = data?.returnScene ?? null;
  }

  create() {
    const centerX = GAME_WIDTH / 2;
    const titleY = 80;
    this.sceneBackground = new SceneBackground(this, {
      depth: -120,
      alpha: 0.4,
      maxOffsetX: 42,
      maxOffsetY: 28,
    });
    createFullscreenOverlay(this, { color: 0x040914, alpha: 0.72, depth: -30 });
    this.add.rectangle(centerX, titleY, GAME_WIDTH - 72, 72, 0x0a1322, 0.9).setDepth(-20);

    if (this.returnScene) {
      const targetScene = this.scene.get(this.returnScene);
      if (targetScene?.input) {
        this.returnSceneInputWasEnabled = targetScene.input.enabled;
        targetScene.input.enabled = false;
      }
    }

    applyCrtPipelineIfEnabled(this);
    ensureBezelScene(this);

    this.add
      .text(centerX, titleY, 'HELP', {
        fontFamily: '"Press Start 2P"',
        fontSize: '36px',
        color: '#ffffff',
      })
      .setOrigin(0.5);

    const backX = GAME_WIDTH - 120;
    const backHitArea = this.add
      .rectangle(backX, titleY, 248, 52, 0x000000, 0.001)
      .setDepth(40)
      .setInteractive({ useHandCursor: true });
    const backBtn = this.add
      .text(backX, titleY, 'BACK (ESC/H)', {
        fontFamily: '"Press Start 2P"',
        fontSize: '14px',
        color: '#ffffff',
      })
      .setOrigin(0.5)
      .setDepth(41);
    backHitArea.on('pointerdown', () => this.close());
    backBtn.setInteractive({ useHandCursor: true });
    backBtn.on('pointerdown', () => this.close());
    backHitArea.on('pointerover', () => backBtn.setColor('#9be7ff'));
    backHitArea.on('pointerout', () => backBtn.setColor('#ffffff'));

    const margin = Math.max(40, GAME_WIDTH * 0.12);
    const viewWidth = GAME_WIDTH - margin * 2;
    const viewHeight = GAME_HEIGHT - 200;
    this.viewRect = new Phaser.Geom.Rectangle(margin, 140, viewWidth, viewHeight);
    this.visibleHeight = this.viewRect.height - 40;
    this.add
      .rectangle(
        this.viewRect.centerX,
        this.viewRect.centerY,
        this.viewRect.width,
        this.viewRect.height,
        0x0a1322,
        0.92,
      )
      .setDepth(-10);

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
      this.sceneBackground?.destroy();
      this.sceneBackground = undefined;
      if (this.returnScene) {
        const targetScene = this.scene.get(this.returnScene);
        if (targetScene?.input) {
          targetScene.input.enabled = this.returnSceneInputWasEnabled;
        }
      }
      if (this.wheelHandler) this.input.off('wheel', this.wheelHandler);
      if (this.keyHandler) this.input.keyboard?.off('keydown', this.keyHandler);
      if (this.pointerUpHandler) this.input.off('pointerup', this.pointerUpHandler);
    });
  }

  update(_time: number, delta: number) {
    this.sceneBackground?.updateIdle(delta);
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
      'Double-click (desktop), double-tap (mobile), or press M deploys a minefield when you have Mine Layer charges.',
    );
    addParagraph(
      'Each run starts with 2 minefield charges. Manage them carefully and restock with drops or upgrades.',
    );
    addParagraph(
      'Mobile: Touch-drag anywhere to move the ship relatively (offset-based control). This prevents your finger from obstructing the view, and a small bottom steering margin keeps control gestures stable. Auto-fire is enabled by default while touching. Manage heat to avoid overheat lockouts.',
    );
    addParagraph(
      'Debug overlay is off by default. Press D to toggle renderer/FPS/object counters and graphics diagnostics.',
    );
    addParagraph('Debug/Test: Press B to spawn temporary shield bunkers instantly.');

    addHeader('LEVEL FLOW');
    addParagraph(
      'Fill the LEVEL SURVIVE score target to trigger an end-of-level BOSS FIGHT. The boss UFO appears only in this end phase.',
    );
    addParagraph(
      'After boss destruction, gameplay pauses and a short LEVEL countdown starts. Use this moment to reset position and prepare for faster asteroid waves.',
    );
    addParagraph(
      'Boss clears also unlock one of three permanent run upgrades. Mine Stock can appear here and grants extra minefield charges.',
    );

    addHeader('ENEMY FLIGHT OBJECTS');
    addParagraph(
      'SCOUT UFO: Fast light craft. Usually one hit to destroy. On destruction it ejects 2-3 stranded astronauts.',
    );
    addParagraph(
      'BOSS UFO: Appears only in the level-end boss phase. High HP, escalating attack phases, and optional modifiers (shielded/summoner/berserk/armored).',
    );
    addParagraph(
      'SKY RAIDER STALKER: Tracks your horizontal lane and fires aimed shots. Medium pressure, easier to outmaneuver.',
    );
    addParagraph(
      'SKY RAIDER LANCER: Heavier strike variant. Faster dives, denser shot timing, and higher reward on destruction.',
    );
    addParagraph(
      'ELITE DRONE: Rare bonus target, not a standard attacker. Touch or shoot it for a permanent run perk.',
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
    addPowerUp(
      'BUNKER',
      'Deploys temporary shield bunkers that block your ship, stop shots, and shatter asteroids.',
    );
    addPowerUp(
      'MINE LAYER',
      'Grants +1 minefield charge (you start each run with 2). Double-click/tap or press M to launch 5 proximity mines that arm and destroy asteroids, UFOs, and invaders on contact.',
    );
    addPowerUp('MAGNETIC', 'Bullets home toward the nearest asteroid for a short time.');

    addHeader('WORLD EVENTS');
    addParagraph(
      'WORMHOLE ANOMALY: A drifting anomaly can appear and bend both asteroid movement and bullet trajectories nearby.',
    );
    addParagraph(
      'LOST ASTRONAUT: Destroyed scout UFOs eject 2-3 astronauts, and destroyed enemy ships eject 1. Touch "Rescue Me!" astronauts to save them for bonus points.',
    );
    addParagraph(
      'RESCUE STREAK: Save astronauts in quick succession to build a separate rescue multiplier. Keep the streak timer alive to climb to higher rescue payout tiers.',
    );
    addParagraph(
      'ELITE DRONE: Rare rescue/salvage target. Touch or shoot it to earn a permanent run perk (extra life, better cooling, or longer magnetic effect).',
    );
    addParagraph(
      'DYNAMIC MINI-EVENTS: During runs, random timed events (for example SOLAR STORM, LOW GRAVITY, SWARM RUSH) temporarily change battlefield flow and pressure.',
    );

    addHeader('ADRENALINE RUSH');
    addParagraph(
      'Fly dangerously close to enemies and projectiles without getting hit to fill the ADRENALINE meter (purple bar below heat). The closer you graze, the faster it fills.',
    );
    addParagraph(
      'When the meter reaches 80%, press V (desktop) to activate MATRIX MODE: time slows dramatically while your ship retains near-normal speed, bullets pierce through enemies, and all scores multiply 3x.',
    );
    addParagraph(
      'Matrix mode lasts 5.5 seconds and drains the meter to zero. Grazing does not fill the meter during ghost phase or while shield is active.',
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
