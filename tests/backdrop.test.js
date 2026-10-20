import { describe, it, expect } from 'vitest';
import { SCENES } from '../src/shared/ascii-art.js';
import {
  hash,
  maxSceneWidth,
  parseArt,
  placeScene,
  wrapNoise
} from '../src/shared/backdrop.js';

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

describe('ASCII scenes', () => {
  it('have unique ids, captions and known tones', () => {
    const ids = SCENES.map(s => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of SCENES) {
      expect(s.caption).toMatch(/\S/);
      expect(['warm', 'gold', 'red', 'cyan', 'tan']).toContain(s.tone);
      expect(s.art).not.toMatch(/\t/);
    }
  });

  it('keep every glow box on the drawing', () => {
    for (const s of SCENES) {
      const { lines, rows, cols } = parseArt(s);
      expect(rows).toBeLessThanOrEqual(30);
      expect(cols).toBeLessThanOrEqual(80);
      for (const [r1, c1, r2, c2] of s.glow) {
        expect(r1 <= r2 && c1 <= c2 && r2 < rows && c2 < cols, `${s.id} box`).toBe(true);
        const inside = lines
          .slice(r1, r2 + 1)
          .map(l => l.slice(c1, c2 + 1).join(''))
          .join('');
        expect(inside.trim(), `${s.id} box covers characters`).not.toBe('');
      }
    }
  });

  it('marks the lighthouse lamp and draws it as @', () => {
    const lighthouse = SCENES.find(s => s.effect === 'beam');
    const { lamp, lines, glow } = parseArt(lighthouse);
    expect(lamp).not.toBeNull();
    expect(lines[lamp.r][lamp.c]).toBe('@');
    expect(glow(lamp.r, lamp.c)).toBe(true);
  });
});

describe('scene placement', () => {
  const scene = { w: 300, h: 400 };

  it('centres low on phones', () => {
    const spot = placeScene({ vw: 390, vh: 800, ...scene, slot: 3 });
    expect(spot.x).toBe(45);
    expect(spot.y).toBe(800 - 400 - 24);
  });

  it('uses the side gutters on wide screens, alternating sides', () => {
    const right = placeScene({ vw: 2200, vh: 1200, ...scene, slot: 0 });
    const left = placeScene({ vw: 2200, vh: 1200, ...scene, slot: 1 });
    const gutter = (2200 - 1320) / 2;
    expect(right.x).toBeGreaterThanOrEqual(2200 - gutter - 12);
    expect(left.x + scene.w).toBeLessThanOrEqual(gutter + 12);
  });

  it('sizes scenes to the open space beside the content', () => {
    expect(maxSceneWidth(390)).toBe(359);
    expect(maxSceneWidth(1440)).toBe(456);
    expect(maxSceneWidth(1920)).toBeGreaterThan(maxSceneWidth(1440));
  });

  it('sits under the details panel when the gutters are narrow', () => {
    for (const slot of [0, 1, 2, 3]) {
      expect(placeScene({ vw: 1440, vh: 900, w: 400, h: 300, slot })).toEqual({
        x: 1440 - 400 - 24,
        y: 900 - 300 - 28
      });
    }
  });

  it('stays on screen and below the header at any size', () => {
    for (const vw of [760, 1024, 1440, 1920]) {
      for (let slot = 0; slot < 4; slot++) {
        const { x, y } = placeScene({ vw, vh: 700, ...scene, slot });
        expect(x).toBeGreaterThanOrEqual(12);
        expect(x + scene.w).toBeLessThanOrEqual(vw - 12);
        expect(y).toBeGreaterThanOrEqual(96);
      }
    }
  });
});
