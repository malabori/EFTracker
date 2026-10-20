import { describe, it, expect } from 'vitest';
import { hash, wrapNoise } from '../src/shared/backdrop.js';

describe('backdrop noise', () => {
  it('hashes cells deterministically into 0..1', () => {
    expect(hash(3, 4, 5)).toBe(hash(3, 4, 5));
    expect(hash(3, 4, 5)).not.toBe(hash(3, 4, 6));
    for (let i = 0; i < 200; i++) {
      const h = hash(i, i * 7, 11);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(1);
    }
  });

  it('repeats every period so dust tiles join up', () => {
    for (const [x, y] of [
      [0.3, 1.7],
      [5.5, 9.25],
      [11.9, 0]
    ]) {
      const n = wrapNoise(x, y, 12, 7);
      expect(wrapNoise(x + 12, y, 12, 7)).toBeCloseTo(n, 10);
      expect(wrapNoise(x, y + 12, 12, 7)).toBeCloseTo(n, 10);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThanOrEqual(1);
    }
  });
});
