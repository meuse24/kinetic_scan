import Phaser from 'phaser';
import type { Player } from '../Player';

interface ProximityMineState {
  targetX: number;
  targetY: number;
  armed: boolean;
  pulsePhase: number;
}

interface MainMineFieldSystemConfig {
  scene: Phaser.Scene;
  mines: Phaser.Physics.Arcade.Group;
  player: Player;
  textureKey: string;
  deployCount: number;
  getPlayerCount: () => number;
  isInputBlocked: () => boolean;
  doubleTapWindowMs?: number;
  doubleTapMaxDistancePx?: number;
}

/**
 * Encapsulates proximity-mine behavior:
 * deploy targeting, arming/pulsing update loop, pointer double-tap detection,
 * and defensive cleanup during scene teardown.
 */
export class MainMineFieldSystem {
  private readonly scene: Phaser.Scene;
  private readonly mines: Phaser.Physics.Arcade.Group;
  private readonly player: Player;
  private readonly textureKey: string;
  private readonly deployCount: number;
  private readonly getPlayerCount: () => number;
  private readonly isInputBlocked: () => boolean;
  private readonly doubleTapWindowMs: number;
  private readonly doubleTapMaxDistancePx: number;
  private readonly mineStates: Map<Phaser.Physics.Arcade.Image, ProximityMineState> = new Map();

  private lastTapAt: number = -10000;
  private lastTapX: number = -1000;
  private lastTapY: number = -1000;

  constructor(config: MainMineFieldSystemConfig) {
    this.scene = config.scene;
    this.mines = config.mines;
    this.player = config.player;
    this.textureKey = config.textureKey;
    this.deployCount = config.deployCount;
    this.getPlayerCount = config.getPlayerCount;
    this.isInputBlocked = config.isInputBlocked;
    this.doubleTapWindowMs = config.doubleTapWindowMs ?? 320;
    this.doubleTapMaxDistancePx = config.doubleTapMaxDistancePx ?? 72;
  }

  public handlePointerDown(
    pointer: Phaser.Input.Pointer,
    currentlyOver: Phaser.GameObjects.GameObject[] = [],
  ): boolean {
    if (pointer.button !== 0) return false;
    if (this.isInputBlocked()) return false;

    const overInteractiveUI = currentlyOver.some((obj) => {
      const input = (obj as any).input as { enabled?: boolean } | undefined;
      return Boolean(input?.enabled);
    });
    if (overInteractiveUI) {
      this.resetTapState();
      return false;
    }

    const now = this.scene.time.now;
    const dt = now - this.lastTapAt;
    const dx = pointer.x - this.lastTapX;
    const dy = pointer.y - this.lastTapY;
    const maxDistSq = this.doubleTapMaxDistancePx ** 2;
    const isDoubleTap = dt <= this.doubleTapWindowMs && dx * dx + dy * dy <= maxDistSq;

    this.lastTapAt = now;
    this.lastTapX = pointer.x;
    this.lastTapY = pointer.y;

    return isDoubleTap;
  }

  public deployFromPlayer(): number {
    if (!this.mines || !this.player?.active) return 0;

    let deployed = 0;
    const launchOriginX = this.player.x;
    const launchOriginY = this.player.y - 4;

    for (let i = 0; i < this.deployCount; i++) {
      const mine = this.mines.get(
        launchOriginX,
        launchOriginY,
        this.textureKey,
      ) as Phaser.Physics.Arcade.Image | null;
      if (!mine) continue;

      const target = this.rollMineTargetPosition(i);
      const dx = target.x - launchOriginX;
      const dy = target.y - launchOriginY;
      const len = Math.max(1, Math.hypot(dx, dy));
      const speed = Phaser.Math.Between(220, 320);
      const vx = (dx / len) * speed;
      const vy = (dy / len) * speed;

      mine.setTexture(this.textureKey);
      mine.enableBody(true, launchOriginX, launchOriginY, true, true);
      mine.setActive(true);
      mine.setVisible(true);
      mine.setDepth(88);
      mine.setAlpha(0.9);
      mine.setScale(0.88);
      mine.setBlendMode(Phaser.BlendModes.NORMAL);
      mine.setVelocity(vx, vy);
      mine.setAngularVelocity(Phaser.Math.Between(-70, 70));
      mine.setDrag(0, 0);
      mine.setImmovable(false);
      const body = mine.body as Phaser.Physics.Arcade.Body | undefined;
      if (body && typeof body.setCircle === 'function') {
        body.setCircle(10, 6, 6);
      }
      this.mineStates.set(mine, {
        targetX: target.x,
        targetY: target.y,
        armed: false,
        pulsePhase: Phaser.Math.FloatBetween(0, Math.PI * 2),
      });
      deployed++;
    }

    return deployed;
  }

  public update(delta: number): void {
    if (!this.mines) return;
    const children = this.mines.getChildren() as Phaser.Physics.Arcade.Image[];
    const t = this.scene.time.now * 0.001;

    for (const mine of children) {
      if (!mine.active) continue;
      const state = this.mineStates.get(mine);
      if (!state) continue;

      if (!state.armed) {
        const dx = state.targetX - mine.x;
        const dy = state.targetY - mine.y;
        const arrivalDistSq = dx * dx + dy * dy;
        if (arrivalDistSq <= 18 * 18) {
          mine.setPosition(state.targetX, state.targetY);
          mine.setVelocity(0, 0);
          mine.setAngularVelocity(0);
          mine.setImmovable(true);
          mine.rotation = 0;
          state.armed = true;
          continue;
        }
        mine.rotation += (delta / 1000) * 2.8;
        continue;
      }

      const pulse = Math.sin(t * 7.5 + state.pulsePhase);
      const pulseNorm = pulse * 0.5 + 0.5;
      mine.setScale(0.92 + pulseNorm * 0.2);
      mine.setAlpha(0.72 + pulseNorm * 0.26);
      const r = Math.round(255);
      const g = Math.round(147 + (242 - 147) * pulseNorm);
      const b = Math.round(46 + (166 - 46) * pulseNorm);
      mine.setTint((r << 16) | (g << 8) | b);
    }
  }

  public isArmed(mine: Phaser.Physics.Arcade.Image): boolean {
    return Boolean(this.mineStates.get(mine)?.armed);
  }

  public consume(mine: Phaser.Physics.Arcade.Image): void {
    this.mineStates.delete(mine);
    mine.clearTint();
    mine.disableBody(true, true);
    mine.setScale(1);
    mine.setAlpha(1);
  }

  public clear(): void {
    this.mineStates.clear();
    if (!this.mines) return;
    const groupAny = this.mines as any;
    let children: Phaser.Physics.Arcade.Image[] = [];
    try {
      if (groupAny.children && Array.isArray(groupAny.children.entries)) {
        children = groupAny.children.entries as Phaser.Physics.Arcade.Image[];
      } else if (typeof groupAny.getChildren === 'function') {
        children = groupAny.getChildren() as Phaser.Physics.Arcade.Image[];
      }
    } catch {
      // Ignore teardown races during scene shutdown.
      return;
    }
    for (const mine of children) {
      if (!mine.active) continue;
      try {
        mine.disableBody(true, true);
        mine.setScale(1);
        mine.setAlpha(1);
      } catch {
        // Ignore teardown races during scene shutdown.
      }
    }
  }

  public destroy(): void {
    this.clear();
    this.resetTapState();
  }

  private rollMineTargetPosition(index: number): { x: number; y: number } {
    const width = this.scene.scale.width;
    const height = this.scene.scale.height;
    const laneX = ((index + 0.5) / this.deployCount) * width;
    const x = Phaser.Math.Clamp(
      laneX + Phaser.Math.Between(-68, 68),
      Math.round(width * 0.08),
      Math.round(width * 0.92),
    );
    const y = Phaser.Math.Between(
      Math.round(height * 0.2),
      Math.round(height * (this.getPlayerCount() === 2 ? 0.62 : 0.68)),
    );
    return { x, y };
  }

  private resetTapState(): void {
    this.lastTapAt = -10000;
    this.lastTapX = -1000;
    this.lastTapY = -1000;
  }
}
