import { describe, it, expect } from 'vitest';
import {
  escapeHtml,
  escReg,
  hi,
  parsePartIndex,
  getPrereqIdsSameTrader,
  topoSortByTrader,
  normalizeProgressPayload
} from './lib.js';

describe('escapeHtml', () => {
  it('escapes the five HTML metacharacters', () => {
    expect(escapeHtml(`<a href="x" class='y'>&`)).toBe(
      '&lt;a href=&quot;x&quot; class=&#39;y&#39;&gt;&amp;'
    );
  });

  it('coerces non-strings', () => {
    expect(escapeHtml(null)).toBe('null');
    expect(escapeHtml(undefined)).toBe('undefined');
    expect(escapeHtml(42)).toBe('42');
  });
});

describe('escReg', () => {
  it('escapes every regex metacharacter', () => {
    const meta = '.*+?^${}()|[]\\';
    const escaped = escReg(meta);
    // Each meta char should appear preceded by a backslash exactly once.
    for (const c of meta) {
      expect(escaped).toContain('\\' + c);
    }
    // The escaped string should be a valid regex matching the original literal.
    const re = new RegExp(escaped);
    expect(re.test(meta)).toBe(true);
  });

  it('does not throw when constructed for tricky queries', () => {
    for (const q of ['(', '[abc', '\\', '.*+?', '$$$', '{1,2}']) {
      expect(() => new RegExp(escReg(q))).not.toThrow();
    }
  });
});

describe('hi', () => {
  it('escapes HTML in the source text', () => {
    expect(hi('<script>', '')).toBe('&lt;script&gt;');
  });

  it('wraps matches in <mark> without breaking HTML escaping', () => {
    expect(hi('a<b>cAb', 'b')).toBe(
      'a&lt;<mark class="eft-hit">b</mark>&gt;cA<mark class="eft-hit">b</mark>'
    );
  });

  it('is case-insensitive', () => {
    expect(hi('Find Me', 'me')).toBe('Find <mark class="eft-hit">Me</mark>');
  });

  it('handles regex metacharacters in the query without throwing', () => {
    expect(() => hi('open ( paren', '(')).not.toThrow();
    expect(hi('open ( paren', '(')).toContain('<mark class="eft-hit">(</mark>');
  });

  it('returns the escaped text when query is empty', () => {
    expect(hi('a & b', '')).toBe('a &amp; b');
  });

  it('handles null/undefined input safely', () => {
    expect(hi(null, 'x')).toBe('');
    expect(hi(undefined, '')).toBe('');
  });
});

describe('parsePartIndex', () => {
  it('parses arabic numerals', () => {
    expect(parsePartIndex('Quest Name Part 3')).toBe(3);
    expect(parsePartIndex('Lend Lease - Part 1')).toBe(1);
  });

  it('parses roman numerals', () => {
    expect(parsePartIndex('Test Drive Part IV')).toBe(4);
    expect(parsePartIndex('Foo Part IX')).toBe(9);
  });

  it('returns Infinity for non-part names', () => {
    expect(parsePartIndex('Friend From the West')).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('getPrereqIdsSameTrader', () => {
  it('filters prereqs to the same trader', () => {
    const task = {
      taskRequirements: [
        { task: { id: 'a', trader: { name: 'Prapor' } } },
        { task: { id: 'b', trader: { name: 'Therapist' } } },
        { task: { id: 'c', trader: { name: 'Prapor' } } }
      ]
    };
    expect(getPrereqIdsSameTrader(task, 'Prapor')).toEqual(['a', 'c']);
  });

  it('handles missing fields', () => {
    expect(getPrereqIdsSameTrader({}, 'X')).toEqual([]);
    expect(getPrereqIdsSameTrader({ taskRequirements: [{}] }, 'X')).toEqual([]);
  });
});

describe('topoSortByTrader', () => {
  const mk = (id, name, opts = {}) => ({
    id,
    name,
    minPlayerLevel: opts.lvl ?? 0,
    taskRequirements: (opts.prereqs || []).map(pid => ({
      task: { id: pid, trader: { name: 'T' } }
    }))
  });

  it('orders prerequisites before dependents', () => {
    const list = [
      mk('c', 'Part 3', { prereqs: ['b'] }),
      mk('a', 'Part 1'),
      mk('b', 'Part 2', { prereqs: ['a'] })
    ];
    const ids = topoSortByTrader(list, 'T').map(t => t.id);
    expect(ids).toEqual(['a', 'b', 'c']);
  });

  it('uses tie-breakers (level, part index, name)', () => {
    const list = [
      mk('y', 'Part 2', { lvl: 5 }),
      mk('x', 'Part 1', { lvl: 5 }),
      mk('z', 'Low Lvl', { lvl: 1 })
    ];
    const ids = topoSortByTrader(list, 'T').map(t => t.id);
    expect(ids).toEqual(['z', 'x', 'y']);
  });

  it('still returns every task when a cycle exists', () => {
    const list = [mk('a', 'A', { prereqs: ['b'] }), mk('b', 'B', { prereqs: ['a'] })];
    const out = topoSortByTrader(list, 'T');
    expect(out.map(t => t.id).sort()).toEqual(['a', 'b']);
  });

  it('ignores prereqs from other traders', () => {
    const list = [
      {
        id: 'x',
        name: 'X',
        minPlayerLevel: 0,
        taskRequirements: [{ task: { id: 'other', trader: { name: 'OtherTrader' } } }]
      }
    ];
    expect(topoSortByTrader(list, 'T').map(t => t.id)).toEqual(['x']);
  });

  it('respects prereq order across a long chain regardless of input order', () => {
    const N = 50;
    const list = [];
    for (let i = N - 1; i >= 0; i--) {
      list.push(mk(`q${i}`, `Q${i}`, { prereqs: i > 0 ? [`q${i - 1}`] : [] }));
    }
    const ids = topoSortByTrader(list, 'T').map(t => t.id);
    for (let i = 0; i < N; i++) expect(ids[i]).toBe(`q${i}`);
  });

  it('completes a large fan-in/fan-out graph quickly', () => {
    // 500 leaf tasks all depending on one root, plus 500 children of the
    // first leaf. Old impl re-sorted the ready queue on every insertion;
    // this case exercises that.
    const list = [mk('root', 'Root')];
    for (let i = 0; i < 500; i++) {
      list.push(
        mk(`leaf${i}`, `Leaf ${String(i).padStart(3, '0')}`, { prereqs: ['root'] })
      );
    }
    for (let i = 0; i < 500; i++) {
      list.push(
        mk(`child${i}`, `Child ${String(i).padStart(3, '0')}`, { prereqs: ['leaf0'] })
      );
    }
    const t0 = performance.now();
    const out = topoSortByTrader(list, 'T');
    const elapsed = performance.now() - t0;
    expect(out).toHaveLength(list.length);
    expect(out[0].id).toBe('root');
    expect(elapsed).toBeLessThan(100);
  });
});

describe('normalizeProgressPayload', () => {
  it('drops non-boolean values and non-string keys', () => {
    const raw = { a: true, b: false, c: 1, d: 'yes', e: null, f: true };
    expect(normalizeProgressPayload(raw)).toEqual({ a: true, b: false, f: true });
  });

  it('rejects non-objects', () => {
    expect(() => normalizeProgressPayload(null)).toThrow();
    expect(() => normalizeProgressPayload([])).toThrow();
    expect(() => normalizeProgressPayload('not json')).toThrow();
    expect(() => normalizeProgressPayload(42)).toThrow();
  });

  it('returns an empty object for {}', () => {
    expect(normalizeProgressPayload({})).toEqual({});
  });

  it('drops empty-string keys', () => {
    expect(normalizeProgressPayload({ '': true, x: true })).toEqual({ x: true });
  });
});
