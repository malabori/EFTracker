import { describe, it, expect } from 'vitest';
import { getNextUp, mapsForTask, repRewardsForTask } from './recommendations.js';

const mk = (id, opts = {}) => ({
  id,
  name: opts.name || id,
  kappaRequired: opts.kappa ?? false,
  minPlayerLevel: opts.lvl ?? 0,
  taskRequirements: (opts.prereqs || []).map(pid => ({ task: { id: pid } })),
  objectives: opts.objectives || [],
  finishRewards: opts.finishRewards
});

describe('getNextUp', () => {
  it('hides quests that are already done', () => {
    const tasks = [mk('a'), mk('b')];
    const out = getNextUp(tasks, { a: true });
    expect(out.map(t => t.id)).toEqual(['b']);
  });

  it('hides quests with an unsatisfied prereq', () => {
    const tasks = [mk('a'), mk('b', { prereqs: ['a'] })];
    const out = getNextUp(tasks, {});
    expect(out.map(t => t.id)).toEqual(['a']);
  });

  it('unblocks a quest once the prereq is done', () => {
    const tasks = [mk('a'), mk('b', { prereqs: ['a'] })];
    const out = getNextUp(tasks, { a: true });
    expect(out.map(t => t.id)).toEqual(['b']);
  });

  it('ignores prereqs that are not in the task set (missing data)', () => {
    const tasks = [mk('b', { prereqs: ['ghost'] })];
    expect(getNextUp(tasks, {}).map(t => t.id)).toEqual(['b']);
  });

  it('puts kappa-required quests first regardless of level', () => {
    const tasks = [mk('low', { lvl: 1 }), mk('kappa', { lvl: 20, kappa: true })];
    expect(getNextUp(tasks, {}).map(t => t.id)).toEqual(['kappa', 'low']);
  });

  it('orders by level within the same kappa tier', () => {
    const tasks = [
      mk('high', { lvl: 30 }),
      mk('mid', { lvl: 10 }),
      mk('low', { lvl: 1 })
    ];
    expect(getNextUp(tasks, {}).map(t => t.id)).toEqual(['low', 'mid', 'high']);
  });

  it('caps the result at the requested limit', () => {
    const tasks = Array.from({ length: 20 }, (_, i) =>
      mk(`q${i}`, { name: `Q${String(i).padStart(2, '0')}` })
    );
    expect(getNextUp(tasks, {}, 5)).toHaveLength(5);
  });
});

describe('mapsForTask', () => {
  it('returns distinct map names across objectives', () => {
    const t = mk('x', {
      objectives: [
        { maps: [{ name: 'Customs' }] },
        { maps: [{ name: 'Customs' }, { name: 'Reserve' }] }
      ]
    });
    expect(mapsForTask(t)).toEqual(['Customs', 'Reserve']);
  });

  it('returns [] when no maps are present', () => {
    expect(mapsForTask(mk('x'))).toEqual([]);
    expect(mapsForTask(mk('x', { objectives: [{ description: 'do thing' }] }))).toEqual(
      []
    );
  });

  it('honors the limit', () => {
    const t = mk('x', {
      objectives: [{ maps: [{ name: 'A' }, { name: 'B' }, { name: 'C' }, { name: 'D' }] }]
    });
    expect(mapsForTask(t, 2)).toEqual(['A', 'B']);
  });
});

describe('repRewardsForTask', () => {
  it('extracts trader standing rewards', () => {
    const t = mk('x', {
      finishRewards: {
        traderStanding: [
          { trader: { name: 'Prapor' }, standing: 0.02 },
          { trader: { name: 'Fence' }, standing: -0.03 }
        ]
      }
    });
    expect(repRewardsForTask(t)).toEqual([
      { trader: 'Prapor', standing: 0.02 },
      { trader: 'Fence', standing: -0.03 }
    ]);
  });

  it('drops entries with missing trader or zero standing', () => {
    const t = mk('x', {
      finishRewards: {
        traderStanding: [
          { trader: null, standing: 0.02 },
          { trader: { name: 'Prapor' }, standing: 0 },
          { trader: { name: 'Therapist' }, standing: 0.05 }
        ]
      }
    });
    expect(repRewardsForTask(t)).toEqual([{ trader: 'Therapist', standing: 0.05 }]);
  });
});
