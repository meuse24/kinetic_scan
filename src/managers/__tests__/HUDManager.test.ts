/**
 * HUDManager Tests
 *
 * Tests for HUD rendering and update optimization
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { HUDManager } from '../HUDManager';
import type { HUDComponents, HUDState, HUDManagerConfig } from '../HUDManager';

describe('HUDManager', () => {
  let mockScene: any;
  let mockComponents: HUDComponents;
  let hudManager: HUDManager;
  let mockTween: any;

  beforeEach(() => {
    mockTween = {
      stop: vi.fn(),
    };

    mockScene = {
      tweens: {
        add: vi.fn(() => mockTween),
      },
      time: {
        now: 1000,
      },
    };

    mockComponents = {
      p1ScoreText: {
        setText: vi.fn(),
        text: '',
      },
      p2ScoreText: {
        setText: vi.fn(),
        text: '',
      },
      p1LivesText: {
        setText: vi.fn(),
        text: '',
      },
      p2LivesText: {
        setText: vi.fn(),
        text: '',
      },
      levelText: {
        setText: vi.fn(),
        text: '',
      },
      mineChargesText: {
        setText: vi.fn(),
        text: '',
      },
      perkText: {
        setText: vi.fn(),
        text: '',
      },
      powerUpBar: {
        clear: vi.fn(),
        fillStyle: vi.fn(),
        fillRect: vi.fn(),
        lineStyle: vi.fn(),
        strokeRect: vi.fn(),
      },
      heatBar: {
        clear: vi.fn(),
        fillStyle: vi.fn(),
        fillRect: vi.fn(),
      },
      activeMarkerLeft: {
        setVisible: vi.fn(),
        setAlpha: vi.fn(),
      },
      activeMarkerRight: {
        setVisible: vi.fn(),
        setAlpha: vi.fn(),
      },
    };

    const config: HUDManagerConfig = {
      gameWidth: 1000,
    };
    hudManager = new HUDManager(mockScene, mockComponents, config);
  });

  const createBaseState = (): HUDState => ({
    p1Score: 1000,
    p2Score: 500,
    p1Lives: 3,
    p2Lives: 2,
    level: 5,
    mineCharges: 2,
    playerCount: 1,
    activePlayerIndex: 0,
    levelBossPendingDefeat: false,
    nextLevelScore: 2000,
    progressionScore: 1500,
    remainingBossGateTimeMs: 30000,
    difficultyLabel: 'NORMAL',
    eliteLifePerkCount: 1,
    eliteCoolingPerkLevel: 2,
    eliteMagnetPerkLevel: 1,
    powerUpTimer: 3500,
    powerUpBarMaxDuration: 7000,
    time: 1000,
    playerHeat: 0.5,
    playerActive: true,
    playerOverheated: false,
    heatBarAnchor: { x: 400, y: 500 },
  });

  describe('constructor', () => {
    it('should initialize with scene and components', () => {
      expect(hudManager).toBeDefined();
    });
  });

  describe('updateScoresAndLives - 1P mode', () => {
    it('should update score and lives text in 1P mode', () => {
      const state = createBaseState();
      state.playerCount = 1;

      hudManager.update(state);

      expect(mockComponents.p1ScoreText.setText).toHaveBeenCalledWith('SCORE: 1000');
      expect(mockComponents.p1LivesText.setText).toHaveBeenCalledWith('LIVES: 3');
    });

    it('should not update text if values unchanged', () => {
      const state = createBaseState();
      state.playerCount = 1;

      hudManager.update(state);
      vi.clearAllMocks();

      // Same state
      hudManager.update(state);

      expect(mockComponents.p1ScoreText.setText).not.toHaveBeenCalled();
      expect(mockComponents.p1LivesText.setText).not.toHaveBeenCalled();
    });

    it('should update text when score changes', () => {
      const state = createBaseState();
      state.playerCount = 1;

      hudManager.update(state);
      vi.clearAllMocks();

      // Change score
      state.p1Score = 2000;
      hudManager.update(state);

      expect(mockComponents.p1ScoreText.setText).toHaveBeenCalledWith('SCORE: 2000');
      expect(mockComponents.p1LivesText.setText).not.toHaveBeenCalled();
    });

    it('should update text when lives change', () => {
      const state = createBaseState();
      state.playerCount = 1;

      hudManager.update(state);
      vi.clearAllMocks();

      // Change lives
      state.p1Lives = 5;
      hudManager.update(state);

      expect(mockComponents.p1ScoreText.setText).not.toHaveBeenCalled();
      expect(mockComponents.p1LivesText.setText).toHaveBeenCalledWith('LIVES: 5');
    });
  });

  describe('updateScoresAndLives - 2P mode', () => {
    it('should update both players scores and lives in 2P mode', () => {
      const state = createBaseState();
      state.playerCount = 2;

      hudManager.update(state);

      expect(mockComponents.p1ScoreText.setText).toHaveBeenCalledWith('P1 SCORE: 1000');
      expect(mockComponents.p2ScoreText.setText).toHaveBeenCalledWith('P2 SCORE: 500');
      expect(mockComponents.p1LivesText.setText).toHaveBeenCalledWith('P1 LIVES: 3');
      expect(mockComponents.p2LivesText.setText).toHaveBeenCalledWith('P2 LIVES: 2');
    });

    it('should not update p2 text if values unchanged', () => {
      const state = createBaseState();
      state.playerCount = 2;

      hudManager.update(state);
      vi.clearAllMocks();

      // Same state
      hudManager.update(state);

      expect(mockComponents.p2ScoreText.setText).not.toHaveBeenCalled();
      expect(mockComponents.p2LivesText.setText).not.toHaveBeenCalled();
    });

    it('should update p2 score when changed', () => {
      const state = createBaseState();
      state.playerCount = 2;

      hudManager.update(state);
      vi.clearAllMocks();

      // Change p2 score
      state.p2Score = 1500;
      hudManager.update(state);

      expect(mockComponents.p2ScoreText.setText).toHaveBeenCalledWith('P2 SCORE: 1500');
    });
  });

  describe('updateLevelDisplay', () => {
    it('should show boss fight label when boss is pending', () => {
      const state = createBaseState();
      state.levelBossPendingDefeat = true;

      hudManager.update(state);

      expect(mockComponents.levelText.setText).toHaveBeenCalledWith('NORMAL  LEVEL 5  BOSS FIGHT');
    });

    it('should show survive label with score and time', () => {
      const state = createBaseState();
      state.levelBossPendingDefeat = false;
      state.remainingBossGateTimeMs = 30000;

      hudManager.update(state);

      expect(mockComponents.levelText.setText).toHaveBeenCalledWith(
        'NORMAL  LEVEL 5  SURVIVE 500  T-30s',
      );
    });

    it('should show survive label without time when zero', () => {
      const state = createBaseState();
      state.levelBossPendingDefeat = false;
      state.remainingBossGateTimeMs = 0;

      hudManager.update(state);

      expect(mockComponents.levelText.setText).toHaveBeenCalledWith('NORMAL  LEVEL 5  SURVIVE 500');
    });

    it('should not update if label unchanged', () => {
      const state = createBaseState();

      hudManager.update(state);
      vi.clearAllMocks();

      hudManager.update(state);

      expect(mockComponents.levelText.setText).not.toHaveBeenCalled();
    });
  });

  describe('updateMineCharges', () => {
    it('should update mine charges display', () => {
      const state = createBaseState();
      state.mineCharges = 3;

      hudManager.update(state);

      expect(mockComponents.mineChargesText.setText).toHaveBeenCalledWith('MINES: 3');
    });

    it('should not update if charges unchanged', () => {
      const state = createBaseState();

      hudManager.update(state);
      vi.clearAllMocks();

      hudManager.update(state);

      expect(mockComponents.mineChargesText.setText).not.toHaveBeenCalled();
    });

    it('should update when charges change', () => {
      const state = createBaseState();

      hudManager.update(state);
      vi.clearAllMocks();

      state.mineCharges = 1;
      hudManager.update(state);

      expect(mockComponents.mineChargesText.setText).toHaveBeenCalledWith('MINES: 1');
    });
  });

  describe('updatePerkDisplay', () => {
    it('should show perk counts', () => {
      const state = createBaseState();

      hudManager.update(state);

      expect(mockComponents.perkText.setText).toHaveBeenCalledWith('PERKS L+1 C+2 M+1');
    });

    it('should not update if perks unchanged', () => {
      const state = createBaseState();

      hudManager.update(state);
      vi.clearAllMocks();

      hudManager.update(state);

      expect(mockComponents.perkText.setText).not.toHaveBeenCalled();
    });

    it('should update when perks change', () => {
      const state = createBaseState();

      hudManager.update(state);
      vi.clearAllMocks();

      state.eliteLifePerkCount = 2;
      hudManager.update(state);

      expect(mockComponents.perkText.setText).toHaveBeenCalledWith('PERKS L+2 C+2 M+1');
    });
  });

  describe('updatePowerUpBar', () => {
    it('should clear and render power-up bar', () => {
      const state = createBaseState();

      hudManager.update(state);

      expect(mockComponents.powerUpBar.clear).toHaveBeenCalled();
      expect(mockComponents.powerUpBar.fillStyle).toHaveBeenCalledWith(0x00ffff, 0.8);
      expect(mockComponents.powerUpBar.fillRect).toHaveBeenCalled();
    });

    it('should render at 50% progress when timer is half of max', () => {
      const state = createBaseState();
      state.powerUpTimer = 3500;
      state.powerUpBarMaxDuration = 7000;

      hudManager.update(state);

      // Should render at width * 0.5
      const calls = mockComponents.powerUpBar.fillRect.mock.calls;
      const progressCall = calls.find((call) => call[2] === 200 * 0.5);
      expect(progressCall).toBeDefined();
    });

    it('should render at 100% progress when timer equals max', () => {
      const state = createBaseState();
      state.powerUpTimer = 7000;
      state.powerUpBarMaxDuration = 7000;

      hudManager.update(state);

      const calls = mockComponents.powerUpBar.fillRect.mock.calls;
      const progressCall = calls.find((call) => call[2] === 200 * 1.0);
      expect(progressCall).toBeDefined();
    });

    it('should show border on blink cycle', () => {
      const state = createBaseState();
      // Math.sin(1000 * 0.01) = Math.sin(10) ≈ -0.544 (negative, no border)
      state.time = 1000;

      hudManager.update(state);

      expect(mockComponents.powerUpBar.lineStyle).not.toHaveBeenCalled();
    });
  });

  describe('updateHeatBar', () => {
    it('should clear and render heat bar', () => {
      const state = createBaseState();

      hudManager.update(state);

      expect(mockComponents.heatBar.clear).toHaveBeenCalled();
      expect(mockComponents.heatBar.fillStyle).toHaveBeenCalled();
      expect(mockComponents.heatBar.fillRect).toHaveBeenCalled();
    });

    it('should not render if player inactive', () => {
      const state = createBaseState();
      state.playerActive = false;

      hudManager.update(state);

      expect(mockComponents.heatBar.clear).toHaveBeenCalled();
      // Should only clear, not render
      expect(mockComponents.heatBar.fillStyle).not.toHaveBeenCalled();
    });

    it('should not render if heat is zero', () => {
      const state = createBaseState();
      state.playerHeat = 0;

      hudManager.update(state);

      expect(mockComponents.heatBar.clear).toHaveBeenCalled();
      expect(mockComponents.heatBar.fillStyle).not.toHaveBeenCalled();
    });

    it('should render background and heat fill', () => {
      const state = createBaseState();
      state.playerHeat = 0.5;

      hudManager.update(state);

      // Background (black) + heat fill (gradient)
      expect(mockComponents.heatBar.fillStyle).toHaveBeenCalledTimes(2);
      expect(mockComponents.heatBar.fillRect).toHaveBeenCalledTimes(2);
    });

    it('should blink red when overheated', () => {
      const state = createBaseState();
      state.playerOverheated = true;
      state.playerHeat = 1.0;
      state.time = 0; // Math.floor(0 / 150) % 2 === 0 (blink on)

      hudManager.update(state);

      // Should render red
      const fillCalls = mockComponents.heatBar.fillStyle.mock.calls;
      const redCall = fillCalls.find((call) => call[0] === 0xff3333);
      expect(redCall).toBeDefined();
    });

    it('should not render when overheated and blink off', () => {
      const state = createBaseState();
      state.playerOverheated = true;
      state.playerHeat = 1.0;
      state.time = 150; // Math.floor(150 / 150) % 2 === 1 (blink off)

      hudManager.update(state);

      // Should only render background, not heat fill
      expect(mockComponents.heatBar.fillStyle).toHaveBeenCalledTimes(1);
      expect(mockComponents.heatBar.fillRect).toHaveBeenCalledTimes(1);
    });
  });

  describe('updateActiveMarker', () => {
    it('should not update if not 2P mode', () => {
      const state = createBaseState();
      state.playerCount = 1;

      hudManager.update(state);

      expect(mockComponents.activeMarkerLeft?.setVisible).not.toHaveBeenCalled();
    });

    it('should not update if markers not present', () => {
      const state = createBaseState();
      state.playerCount = 2;

      const noMarkerComponents = { ...mockComponents };
      delete noMarkerComponents.activeMarkerLeft;
      delete noMarkerComponents.activeMarkerRight;

      const config: HUDManagerConfig = { gameWidth: 1000 };
      const manager = new HUDManager(mockScene, noMarkerComponents, config);
      manager.update(state);

      // Should not crash
    });

    it('should show both markers with correct opacity for P1', () => {
      const state = createBaseState();
      state.playerCount = 2;
      state.activePlayerIndex = 0;

      hudManager.update(state);

      expect(mockComponents.activeMarkerLeft.setVisible).toHaveBeenCalledWith(true);
      expect(mockComponents.activeMarkerRight.setVisible).toHaveBeenCalledWith(true);
      expect(mockComponents.activeMarkerLeft.setAlpha).toHaveBeenCalledWith(1);
      expect(mockComponents.activeMarkerRight.setAlpha).toHaveBeenCalledWith(0.2);
    });

    it('should show both markers with correct opacity for P2', () => {
      const state = createBaseState();
      state.playerCount = 2;
      state.activePlayerIndex = 1;

      hudManager.update(state);

      expect(mockComponents.activeMarkerLeft.setAlpha).toHaveBeenCalledWith(0.2);
      expect(mockComponents.activeMarkerRight.setAlpha).toHaveBeenCalledWith(1);
    });

    it('should start pulsing animation on active marker', () => {
      const state = createBaseState();
      state.playerCount = 2;
      state.activePlayerIndex = 0;

      hudManager.update(state);

      expect(mockScene.tweens.add).toHaveBeenCalledWith(
        expect.objectContaining({
          targets: mockComponents.activeMarkerLeft,
          alpha: 0.2,
          duration: 400,
          yoyo: true,
          repeat: -1,
        }),
      );
    });

    it('should stop previous tween when switching player', () => {
      const state = createBaseState();
      state.playerCount = 2;
      state.activePlayerIndex = 0;

      hudManager.update(state);

      // Switch player
      state.activePlayerIndex = 1;
      hudManager.update(state);

      expect(mockTween.stop).toHaveBeenCalled();
    });

    it('should not update if active player unchanged', () => {
      const state = createBaseState();
      state.playerCount = 2;
      state.activePlayerIndex = 0;

      hudManager.update(state);
      vi.clearAllMocks();

      hudManager.update(state);

      expect(mockComponents.activeMarkerLeft.setVisible).not.toHaveBeenCalled();
    });
  });

  describe('cleanup', () => {
    it('should stop active marker tween', () => {
      const state = createBaseState();
      state.playerCount = 2;
      state.activePlayerIndex = 0;

      hudManager.update(state);
      hudManager.cleanup();

      expect(mockTween.stop).toHaveBeenCalled();
    });

    it('should reset active marker index', () => {
      const state = createBaseState();
      state.playerCount = 2;
      state.activePlayerIndex = 0;

      hudManager.update(state);
      vi.clearAllMocks();

      hudManager.cleanup();

      // After cleanup, next update should re-render marker
      hudManager.update(state);

      expect(mockComponents.activeMarkerLeft.setVisible).toHaveBeenCalled();
    });
  });
});
