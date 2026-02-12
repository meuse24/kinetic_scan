import Phaser from 'phaser';
import { SettingsOverlayController } from './SettingsOverlayController';

export interface SettingsOverlayHostConfig {
  triggerText: Phaser.GameObjects.Text;
  controller: SettingsOverlayController;
  canOpen?: () => boolean;
  openColor?: string;
  closedColor?: string;
}

/**
 * Small host wrapper for shared open/close/toggle lifecycle around a settings overlay.
 * Keeps scene integration logic consistent and avoids duplicate state handling.
 */
export class SettingsOverlayHost {
  private readonly triggerText: Phaser.GameObjects.Text;
  private readonly controller: SettingsOverlayController;
  private readonly canOpen: () => boolean;
  private readonly openColor: string;
  private readonly closedColor: string;
  private openState: boolean = false;

  constructor(config: SettingsOverlayHostConfig) {
    this.triggerText = config.triggerText;
    this.controller = config.controller;
    this.canOpen = config.canOpen ?? (() => true);
    this.openColor = config.openColor ?? '#ffffff';
    this.closedColor = config.closedColor ?? '#9be7ff';
  }

  public build(): void {
    this.controller.build();
  }

  public isOpen(): boolean {
    return this.openState;
  }

  public open(): boolean {
    if (this.openState || !this.canOpen()) return false;
    this.openState = true;
    this.controller.open();
    this.triggerText.setColor(this.openColor);
    return true;
  }

  public close(): boolean {
    if (!this.openState) return false;
    this.openState = false;
    this.controller.close();
    this.triggerText.setColor(this.closedColor);
    return true;
  }

  public toggle(): void {
    if (this.openState) {
      this.close();
      return;
    }
    this.open();
  }

  public refresh(): void {
    this.controller.refresh();
  }

  public destroy(): void {
    this.controller.destroy();
    this.openState = false;
  }
}
