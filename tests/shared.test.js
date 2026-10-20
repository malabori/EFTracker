import { describe, it, expect } from 'vitest';
import { gql, gqlFirstAccepted } from '../src/shared/api.js';
import { formatClock, isDaytime, raidTime } from '../src/shared/clock.js';
import { esc, highlight } from '../src/shared/html.js';
import { normalizeSettings } from '../src/shared/settings.js';
import { rub, timeAgo } from '../src/shared/format.js';

const HOUR = 60 * 60 * 1000;
const respond = (status, body) => async () => ({
  status,
  json: async () => {
    if (body === undefined) throw new Error('not json');
    return body;
  }
});

describe('raid clock', () => {
  it('runs 7x real time from Moscow midnight, with the right clock 12 h ahead', () => {
    expect(formatClock(raidTime(0, 'left'))).toBe('03:00:00');
    expect(formatClock(raidTime(0, 'right'))).toBe('15:00:00');
    expect(formatClock(raidTime(HOUR, 'left'))).toBe('10:00:00');
    expect(formatClock(raidTime(HOUR + 1000, 'left'))).toBe('10:00:07');
  });

  it('marks roughly 05:00–22:00 as daytime', () => {
    const at = h => new Date(Date.UTC(1970, 0, 1, h));
    expect(isDaytime(at(4))).toBe(false);
    expect(isDaytime(at(5))).toBe(true);
    expect(isDaytime(at(21))).toBe(true);
    expect(isDaytime(at(22))).toBe(false);
  });
});

describe('gql', () => {
  it('keeps the data when the API also reports partial errors', async () => {
    const fetchImpl = respond(200, {
      data: { tasks: [1] },
      errors: [{ message: 'one item failed' }]
    });
    const out = await gql('{ tasks { id } }', {}, { fetchImpl });
    expect(out.data.tasks).toEqual([1]);
    expect(out.errors).toHaveLength(1);
  });

  it('flags schema rejections so a simpler query can be tried', async () => {
    const fetchImpl = respond(400, { errors: [{ message: 'Cannot query field "x"' }] });
    await expect(gql('{ x }', {}, { fetchImpl })).rejects.toMatchObject({
      message: 'Cannot query field "x"',
      rejected: true
    });
  });

  it('reports non-JSON failures by status', async () => {
    await expect(gql('{ x }', {}, { fetchImpl: respond(502) })).rejects.toThrow(
      'HTTP 502'
    );
  });

  it('times out slow requests', async () => {
    const fetchImpl = (_url, { signal }) =>
      new Promise((_, reject) =>
        signal.addEventListener('abort', () =>
          reject(Object.assign(new Error('aborted'), { name: 'AbortError' }))
        )
      );
    await expect(gql('{ x }', {}, { fetchImpl, timeoutMs: 10 })).rejects.toThrow(
      'timed out'
    );
  });

  it('falls back through rejected queries but stops on network errors', async () => {
    const seen = [];
    const fetchImpl = async (_url, init) => {
      const { query } = JSON.parse(init.body);
      seen.push(query);
      if (query === 'full')
        return { status: 400, json: async () => ({ errors: [{ message: 'bad' }] }) };
      return { status: 200, json: async () => ({ data: { ok: query } }) };
    };
    const warn = console.warn;
    console.warn = () => {};
    const out = await gqlFirstAccepted(['full', 'core', 'basic'], {}, { fetchImpl });
    console.warn = warn;
    expect(out.data.ok).toBe('core');
    expect(out.level).toBe(1);
    expect(seen).toEqual(['full', 'core']);

    const offline = async () => {
      throw new TypeError('Failed to fetch');
    };
    await expect(
      gqlFirstAccepted(['a', 'b'], {}, { fetchImpl: offline })
    ).rejects.toThrow('Failed to fetch');
  });
});

describe('html helpers', () => {
  it('escapes markup', () => {
    expect(esc(`<a href="x">'&'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;'
    );
    expect(esc(null)).toBe('');
  });

  it('highlights matches case-insensitively and stays escaped', () => {
    expect(highlight('Find <b>Me</b>', 'me')).toBe(
      'Find &lt;b&gt;<mark>Me</mark>&lt;/b&gt;'
    );
    expect(highlight('a(b)a', '(')).toBe('a<mark>(</mark>b)a');
    expect(highlight('plain', '')).toBe('plain');
  });
});

describe('settings', () => {
  it('fills defaults and rejects junk', () => {
    expect(normalizeSettings(null)).toEqual({
      mode: 'regular',
      faction: null,
      level: null,
      crt: true
    });
    expect(
      normalizeSettings({ mode: 'pve', faction: 'USEC', level: '42', crt: false })
    ).toEqual({
      mode: 'pve',
      faction: 'USEC',
      level: 42,
      crt: false
    });
    expect(
      normalizeSettings({ mode: 'arena', faction: 'scav', level: 1.5 })
    ).toMatchObject({
      mode: 'regular',
      faction: null,
      level: null
    });
  });

  it('clamps the level and lets it be cleared', () => {
    expect(normalizeSettings({ level: 0 }).level).toBe(1);
    expect(normalizeSettings({ level: 500 }).level).toBe(99);
    expect(normalizeSettings({ level: '' }).level).toBeNull();
  });
});

describe('format', () => {
  it('formats roubles and hides missing prices', () => {
    expect(rub(1234567, 'en-US')).toBe('1,234,567 ₽');
    expect(rub(0)).toBe('—');
    expect(rub(null)).toBe('—');
  });

  it('describes how long ago something happened', () => {
    const now = Date.UTC(2026, 0, 1);
    expect(timeAgo(now - 10_000, now)).toBe('just now');
    expect(timeAgo(now - 5 * 60_000, now)).toBe('5 min ago');
    expect(timeAgo(now - 3 * HOUR, now)).toBe('3 h ago');
    expect(timeAgo(now - 72 * HOUR, now)).toBe('3 days ago');
  });
});
