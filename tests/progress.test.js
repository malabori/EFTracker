import { describe, it, expect } from 'vitest';
import { normalizeTask } from '../src/quests/model.js';
import {
  EXPORT_FORMAT,
  exportPayload,
  isObjectiveChecked,
  mergeProgress,
  migrateLegacy,
  normalizeProgress,
  parseImport,
  setObjectiveDone,
  setQuestDone
} from '../src/quests/progress.js';

const quest = normalizeTask({
  id: 'q1',
  name: 'Quest',
  trader: { name: 'Prapor' },
  objectives: [
    { id: 'o1', description: 'First' },
    { id: 'o2', description: 'Second' },
    { id: 'o3', description: 'Bonus', optional: true }
  ]
});
const fresh = () => ({ tasks: {}, objectives: {} });

// What the Feb 2026 site (the "clean" branch) kept in localStorage.
const boardState = {
  tasks: [
    { id: 'official:aaa', completed: true, objectives: [{ id: 'oa', done: true }] },
    {
      id: 'official:bbb',
      completed: false,
      objectives: [
        { id: 'ob1', done: true },
        { id: 'ob2', done: false },
        { id: 'official-bbb-o3', done: true }
      ]
    },
    { id: 'fallback-debut', completed: true, objectives: [] }
  ],
  filters: {},
  activity: []
};

describe('migrateLegacy', () => {
  it('picks up completed quests and ticked objectives from the Feb 2026 site', () => {
    const store = { eft_tracker_state_v7: boardState };
    const out = migrateLegacy(k => store[k], Object.keys(store));
    expect(out.modes.regular.tasks).toEqual({ aaa: true });
    expect(out.modes.regular.objectives).toEqual({ ob1: true });
  });

  it('uses the newest board version when several exist', () => {
    const store = {
      eft_tracker_state_v3: { tasks: [{ id: 'official:old', completed: true }] },
      eft_tracker_state_v7: boardState
    };
    const out = migrateLegacy(k => store[k], Object.keys(store));
    expect(out.modes.regular.tasks).toEqual({ aaa: true });
  });

  it('merges in the 2025 site progress', () => {
    const store = {
      'eft-task-progress-stable': { x1: true, x2: false },
      eft_tracker_state_v7: boardState
    };
    const out = migrateLegacy(k => store[k], Object.keys(store));
    expect(out.modes.regular.tasks).toEqual({ x1: true, aaa: true });
  });

  it('returns null when there is nothing to migrate', () => {
    expect(migrateLegacy(() => null, [])).toBeNull();
    expect(migrateLegacy(() => 'garbage', ['eft_tracker_state_v7'])).toBeNull();
  });
});

describe('objective tracking', () => {
  it('completes the quest when the last required objective is ticked', () => {
    const b = fresh();
    expect(setObjectiveDone(b, quest, 'o1', true)).toBeNull();
    expect(setObjectiveDone(b, quest, 'o2', true)).toBe('completed');
    expect(b.tasks.q1).toBe(true);
  });

  it('optional objectives never complete or reopen a quest', () => {
    const b = fresh();
    expect(setObjectiveDone(b, quest, 'o3', true)).toBeNull();
    expect(b.tasks.q1).toBeUndefined();
    setQuestDone(b, quest, true);
    expect(setObjectiveDone(b, quest, 'o3', false)).toBeNull();
    expect(b.tasks.q1).toBe(true);
  });

  it('un-ticking a required objective reopens the quest but keeps the others ticked', () => {
    const b = fresh();
    setQuestDone(b, quest, true);
    expect(setObjectiveDone(b, quest, 'o1', false)).toBe('reopened');
    expect(b.tasks.q1).toBeUndefined();
    expect(isObjectiveChecked(b, quest, quest.objectives[0])).toBe(false);
    expect(isObjectiveChecked(b, quest, quest.objectives[1])).toBe(true);
  });

  it('un-ticking a quest restores the objectives that were ticked before', () => {
    const b = fresh();
    setObjectiveDone(b, quest, 'o1', true);
    setQuestDone(b, quest, true);
    expect(isObjectiveChecked(b, quest, quest.objectives[1])).toBe(true);
    setQuestDone(b, quest, false);
    expect(isObjectiveChecked(b, quest, quest.objectives[0])).toBe(true);
    expect(isObjectiveChecked(b, quest, quest.objectives[1])).toBe(false);
  });
});

describe('normalizeProgress', () => {
  it('remembers that the eftracking.com handoff already happened', () => {
    expect(normalizeProgress({ modes: {}, legacyHandoff: true }).legacyHandoff).toBe(
      true
    );
    expect(normalizeProgress({ modes: {} }).legacyHandoff).toBeUndefined();
  });

  it('drops junk flags and unknown fields', () => {
    const out = normalizeProgress({
      modes: { regular: { tasks: { a: true, b: 'yes', '': true }, objectives: null } },
      extra: 1
    });
    expect(out).toEqual({
      version: 1,
      modes: { regular: { tasks: { a: true }, objectives: {} } }
    });
  });
});

describe('import / export', () => {
  it('round-trips this site’s own export', () => {
    const progress = {
      version: 1,
      modes: { pve: { tasks: { q1: true }, objectives: { o9: true } } }
    };
    const payload = exportPayload(progress);
    expect(payload.format).toBe(EXPORT_FORMAT);
    expect(parseImport(JSON.parse(JSON.stringify(payload))).modes).toEqual(
      progress.modes
    );
  });

  it('reads the Feb 2026 site export (object or bare array)', () => {
    const file = {
      exportedAt: 'x',
      source: 'eft-tracker-quest-board',
      tasks: boardState.tasks
    };
    expect(parseImport(file).modes.regular.tasks).toEqual({ aaa: true });
    expect(parseImport(boardState.tasks).modes.regular.tasks).toEqual({ aaa: true });
  });

  it('reads the 2025 site export', () => {
    expect(parseImport({ abc: true, def: false }).modes.regular.tasks).toEqual({
      abc: true
    });
  });

  it('rejects anything else with a readable message', () => {
    expect(() => parseImport(null)).toThrow(/progress export/);
    expect(() => parseImport([1, 2])).toThrow(/progress export/);
    expect(() => parseImport({ hello: 'world' })).toThrow(/progress export/);
  });

  it('merges without removing anything and counts newly completed quests', () => {
    const target = {
      version: 1,
      modes: { regular: { tasks: { a: true }, objectives: {} } }
    };
    const added = mergeProgress(target, {
      modes: { regular: { tasks: { a: true, b: true }, objectives: { o: true } } }
    });
    expect(added).toBe(1);
    expect(target.modes.regular).toEqual({
      tasks: { a: true, b: true },
      objectives: { o: true }
    });
  });
});
