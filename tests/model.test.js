import { describe, it, expect } from 'vitest';
import {
  buildCatalog,
  evaluate,
  filterTasks,
  groupByTrader,
  normalizeTask,
  summarize
} from '../src/quests/model.js';

const task = (id, opts = {}) => ({
  id,
  name: opts.name || id,
  trader: { name: opts.trader || 'Prapor' },
  minPlayerLevel: opts.level ?? 1,
  kappaRequired: opts.kappa ?? false,
  lightkeeperRequired: opts.lk ?? false,
  factionName: opts.faction || 'Any',
  map: opts.map ? { name: opts.map } : null,
  taskRequirements: (opts.requires || []).map(r =>
    typeof r === 'string'
      ? { task: { id: r }, status: ['complete'] }
      : { task: { id: r.id }, status: r.status }
  ),
  objectives: opts.objectives || [{ id: `${id}-o1`, description: `Do ${id}` }]
});

const filters = (overrides = {}) => ({
  tab: 'all',
  query: '',
  trader: '',
  kappa: false,
  ...overrides
});

describe('normalizeTask', () => {
  it('collects map names from the task and its objectives without duplicates', () => {
    const t = normalizeTask(
      task('a', {
        map: 'Customs',
        objectives: [
          { id: 'o1', description: 'x', maps: [{ name: 'Customs' }, { name: 'Woods' }] },
          { id: 'o2', description: 'y', maps: [] }
        ]
      })
    );
    expect(t.maps).toEqual(['Customs', 'Woods']);
  });

  it('treats anything but BEAR/USEC as an all-faction quest', () => {
    expect(normalizeTask(task('a', { faction: 'BEAR' })).faction).toBe('BEAR');
    expect(normalizeTask(task('a', { faction: 'Any' })).faction).toBe('Any');
    expect(normalizeTask({ ...task('a'), factionName: null }).faction).toBe('Any');
  });

  it('defaults missing requirement status to "complete" and lower-cases it', () => {
    const t = normalizeTask({
      ...task('a'),
      taskRequirements: [
        { task: { id: 'p1' }, status: [] },
        { task: { id: 'p2' }, status: ['Active'] }
      ]
    });
    expect(t.requires).toEqual([
      { id: 'p1', status: ['complete'] },
      { id: 'p2', status: ['active'] }
    ]);
  });

  it('drops objectives without text and builds a lower-case search string', () => {
    const t = normalizeTask(
      task('a', {
        name: 'Debut',
        objectives: [
          { id: 'o1', description: 'Eliminate Scavs' },
          { id: 'o2', description: '' }
        ]
      })
    );
    expect(t.objectives).toHaveLength(1);
    expect(t.search).toContain('debut');
    expect(t.search).toContain('eliminate scavs');
    expect(t.search).toContain('prapor');
  });
});

describe('buildCatalog', () => {
  it('drops duplicate and broken records', () => {
    const c = buildCatalog([task('a'), task('a'), null, { id: 'x' }]);
    expect(c.tasks.map(t => t.id)).toEqual(['a']);
  });

  it('orders traders in game order and quests by unlock chain', () => {
    const c = buildCatalog([
      task('t1', { trader: 'Therapist' }),
      task('p3', { requires: ['p2'], name: 'C' }),
      task('p1', { name: 'Z' }),
      task('p2', { requires: ['p1'], name: 'A' })
    ]);
    expect(c.tasks.map(t => t.id)).toEqual(['p1', 'p2', 'p3', 't1']);
    expect(c.traders).toEqual(['Prapor', 'Therapist']);
  });

  it('sorts "Part 2" before "Part 10" when nothing else separates them', () => {
    const c = buildCatalog([
      task('b', { name: 'Op - Part 10' }),
      task('a', { name: 'Op - Part 2' })
    ]);
    expect(c.tasks.map(t => t.name)).toEqual(['Op - Part 2', 'Op - Part 10']);
  });

  it('survives a prerequisite cycle', () => {
    const c = buildCatalog([
      task('a', { requires: ['b'] }),
      task('b', { requires: ['a'] })
    ]);
    expect(c.tasks).toHaveLength(2);
  });
});

describe('evaluate', () => {
  it('locks a quest until its prerequisite is complete', () => {
    const c = buildCatalog([task('a'), task('b', { requires: ['a'] })]);
    expect(evaluate(c, { done: {} }).get('b')).toMatchObject({
      state: 'locked',
      missing: ['a']
    });
    expect(evaluate(c, { done: { a: true } }).get('b').state).toBe('available');
    expect(evaluate(c, { done: { a: true } }).get('a').state).toBe('completed');
  });

  it('treats an "active" requirement as met once the prerequisite is unlocked', () => {
    const c = buildCatalog([
      task('root'),
      task('mid', { requires: ['root'] }),
      task('b', { requires: [{ id: 'mid', status: ['active'] }] })
    ]);
    expect(evaluate(c, { done: {} }).get('b').state).toBe('locked');
    expect(evaluate(c, { done: { root: true } }).get('b').state).toBe('available');
  });

  it('never blocks on requirements that can be met by failing a quest', () => {
    const c = buildCatalog([
      task('a'),
      task('b', { requires: [{ id: 'a', status: ['failed'] }] })
    ]);
    expect(evaluate(c, { done: {} }).get('b').state).toBe('available');
  });

  it('ignores prerequisites for the other faction or missing from the data', () => {
    const c = buildCatalog([
      task('usec', { faction: 'USEC' }),
      task('b', { requires: ['usec', 'not-in-data'] })
    ]);
    expect(evaluate(c, { done: {}, faction: 'BEAR' }).get('b').state).toBe('available');
    expect(evaluate(c, { done: {}, faction: 'USEC' }).get('b').state).toBe('locked');
  });

  it('locks quests above the player level only when a level is set', () => {
    const c = buildCatalog([task('a', { level: 20 })]);
    expect(evaluate(c, { level: 10 }).get('a')).toMatchObject({
      state: 'locked',
      needLevel: 20
    });
    expect(evaluate(c, { level: 20 }).get('a').state).toBe('available');
    expect(evaluate(c, { level: null }).get('a').state).toBe('available');
  });

  it('does not hang on cycles', () => {
    const c = buildCatalog([
      task('a', { requires: [{ id: 'b', status: ['active'] }] }),
      task('b', { requires: [{ id: 'a', status: ['active'] }] })
    ]);
    expect(() => evaluate(c, {})).not.toThrow();
  });
});

describe('filterTasks', () => {
  const catalog = buildCatalog([
    task('debut', { name: 'Debut', kappa: true, map: 'Customs' }),
    task('checking', { name: 'Checking', requires: ['debut'], map: 'Customs' }),
    task('shortage', { name: 'Shortage', trader: 'Therapist', kappa: true, lk: true }),
    task('bear', { name: 'Textile', faction: 'BEAR' }),
    task('usec', { name: 'Textile', faction: 'USEC' })
  ]);
  const statuses = evaluate(catalog, { done: { shortage: true } });

  it('counts every tab with the other filters applied', () => {
    const { counts } = filterTasks(catalog, statuses, filters(), null);
    expect(counts).toEqual({ available: 3, locked: 1, completed: 1, all: 5 });
  });

  it('returns only the active tab, in chain order', () => {
    const { list } = filterTasks(catalog, statuses, filters({ tab: 'available' }), null);
    expect(list.map(t => t.id)).toEqual(['debut', 'bear', 'usec']);
  });

  it('hides the other faction', () => {
    const { list } = filterTasks(catalog, statuses, filters(), 'USEC');
    expect(list.map(t => t.id)).not.toContain('bear');
    expect(list.map(t => t.id)).toContain('usec');
  });

  it('searches names, traders, maps and objectives case-insensitively', () => {
    const ids = q =>
      filterTasks(catalog, statuses, filters({ query: q }), null).list.map(t => t.id);
    expect(ids('DEBUT')).toEqual(['debut']);
    expect(ids('therapist')).toEqual(['shortage']);
    expect(ids('customs')).toEqual(['debut', 'checking']);
    expect(ids('do checking')).toEqual(['checking']);
    expect(ids('(')).toEqual([]);
  });

  it('filters by trader and Kappa', () => {
    const ids = f => filterTasks(catalog, statuses, filters(f), null).list.map(t => t.id);
    expect(ids({ trader: 'Therapist' })).toEqual(['shortage']);
    expect(ids({ kappa: true })).toEqual(['debut', 'shortage']);
    expect(ids({ trader: 'Prapor', kappa: true })).toEqual(['debut']);
  });

  it('groups consecutive quests by trader', () => {
    const { list } = filterTasks(catalog, statuses, filters(), 'BEAR');
    expect(groupByTrader(list).map(g => [g.trader, g.tasks.length])).toEqual([
      ['Prapor', 3],
      ['Therapist', 1]
    ]);
  });
});

describe('summarize', () => {
  it('counts faction quests once the faction is known', () => {
    const catalog = buildCatalog([
      task('a', { kappa: true }),
      task('bear', { kappa: true, faction: 'BEAR' }),
      task('usec', { kappa: true, faction: 'USEC' })
    ]);
    const statuses = evaluate(catalog, { done: { a: true }, faction: 'BEAR' });
    const s = summarize(catalog, statuses, 'BEAR');
    expect(s.kappa).toEqual({ done: 1, total: 2 });
    expect(s.all).toEqual({ done: 1, total: 2 });
    expect(s.available).toBe(1);
    expect(s.traders.get('Prapor')).toEqual({ done: 1, total: 2 });
  });
});
