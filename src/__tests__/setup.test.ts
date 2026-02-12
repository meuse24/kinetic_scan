/**
 * Sanity test to verify Vitest infrastructure is working
 */

import { describe, it, expect } from 'vitest';

describe('Test Infrastructure', () => {
  it('should run tests successfully', () => {
    expect(true).toBe(true);
  });

  it('should have Phaser mocks available', () => {
    expect(Phaser).toBeDefined();
    expect(Phaser.Math.Between).toBeDefined();
  });

  it('should have localStorage mock available', () => {
    localStorage.setItem('test', 'value');
    expect(localStorage.getItem('test')).toBe('value');
    localStorage.clear();
  });

  it('should have window dimensions defined', () => {
    expect(window.innerWidth).toBe(1920);
    expect(window.innerHeight).toBe(1080);
  });
});
