import Phaser from 'phaser';

export class CreditManager {
  private static instance: CreditManager | null = null;
  private credits = 0;
  private events = new Phaser.Events.EventEmitter();

  static getInstance() {
    if (!CreditManager.instance) {
      CreditManager.instance = new CreditManager();
    }
    return CreditManager.instance;
  }

  getCredits() {
    return this.credits;
  }

  addCredits(amount: number = 1) {
    if (amount <= 0) return;
    this.credits += amount;
    this.events.emit('change', this.credits);
  }

  spendCredits(amount: number) {
    if (amount <= 0) return true;
    if (this.credits < amount) return false;
    this.credits -= amount;
    this.events.emit('change', this.credits);
    return true;
  }

  onChange(callback: (credits: number) => void, context?: any) {
    this.events.on('change', callback, context);
  }

  offChange(callback: (credits: number) => void, context?: any) {
    this.events.off('change', callback, context);
  }
}

export const creditManager = CreditManager.getInstance();
