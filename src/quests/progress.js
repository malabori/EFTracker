// Quest progress, saved per game mode in this browser:
//   { version: 1, modes: { regular: { tasks: { [taskId]: true }, objectives: { [objectiveId]: true } } } }
// A quest's completion and its objective checkboxes are stored separately,
// so un-ticking a quest brings back whatever objectives were ticked before.
import { readJson, writeJson, storageKeys } from '../shared/storage.js';
import { requiredObjectives } from './model.js';

export const PROGRESS_KEY = 'eftracking.progress.v1';
export const EXPORT_FORMAT = 'eftracking-progress';

// Keys written by earlier versions of the site.
const LEGACY_SIMPLE_KEY = 'eft-task-progress-stable'; // 2025 site: { [taskId]: true }
const LEGACY_BOARD_KEY = /^eft_tracker_state_v(\d+)$/; // Feb 2026 "Quest Board"

const flagMap = value => {
  const out = {};
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [id, flag] of Object.entries(value))
      if (id && flag === true) out[id] = true;
  }
  return out;
};

function normalizeBucket(raw) {
  const b = { tasks: flagMap(raw?.tasks), objectives: flagMap(raw?.objectives) };
  if (raw?.kappaCelebrated === true) b.kappaCelebrated = true;
  return b;
}

export function normalizeProgress(raw) {
  const modes = {};
  for (const [mode, b] of Object.entries(raw?.modes || {}))
    modes[mode] = normalizeBucket(b);
  return { version: 1, modes };
}

export function modeBucket(progress, mode) {
  if (!progress.modes[mode]) progress.modes[mode] = { tasks: {}, objectives: {} };
  return progress.modes[mode];
}

// The Feb 2026 board saved its whole catalog as `tasks`, with ids like
// "official:<taskId>" and a `done` flag per objective. Its JSON export used
// the same array, so this handles both. Returns how many flags it picked up.
function absorbBoardTasks(target, tasks) {
  let found = 0;
  if (!Array.isArray(tasks)) return found;
  for (const task of tasks) {
    const rawId = typeof task?.id === 'string' ? task.id : '';
    if (!rawId.startsWith('official:')) continue;
    const id = rawId.slice('official:'.length);
    if (task.completed === true) {
      target.tasks[id] = true;
      found++;
      continue;
    }
    for (const o of Array.isArray(task.objectives) ? task.objectives : []) {
      // Ids starting with "official-" were invented locally, not real objectives.
      if (o?.done === true && o.id && !String(o.id).startsWith('official-')) {
        target.objectives[String(o.id)] = true;
        found++;
      }
    }
  }
  return found;
}

// Builds progress from whatever older versions of the site left in storage.
// Both older sites only ever tracked PvP, so everything goes to "regular".
export function migrateLegacy(read, keys) {
  const regular = { tasks: {}, objectives: {} };
  let found = 0;

  const simple = flagMap(read(LEGACY_SIMPLE_KEY));
  for (const id of Object.keys(simple)) {
    regular.tasks[id] = true;
    found++;
  }

  const newestBoardKey = keys
    .map(key => ({ key, v: Number(LEGACY_BOARD_KEY.exec(key)?.[1]) }))
    .filter(k => Number.isFinite(k.v))
    .sort((a, b) => b.v - a.v)[0]?.key;
  if (newestBoardKey) found += absorbBoardTasks(regular, read(newestBoardKey)?.tasks);

  return found ? { version: 1, modes: { regular }, migratedAt: Date.now() } : null;
}

export function loadProgress() {
  const saved = readJson(PROGRESS_KEY);
  if (saved && typeof saved === 'object' && saved.modes) return normalizeProgress(saved);
  const progress = migrateLegacy(key => readJson(key), storageKeys()) || {
    version: 1,
    modes: {}
  };
  writeJson(PROGRESS_KEY, progress);
  return progress;
}

export function saveProgress(progress) {
  writeJson(PROGRESS_KEY, progress);
}

export function isObjectiveChecked(b, task, objective) {
  if (b.tasks[task.id] && !objective.optional) return true;
  return Boolean(b.objectives[objective.id]);
}

export function setQuestDone(b, task, done) {
  if (done) b.tasks[task.id] = true;
  else delete b.tasks[task.id];
}

// Ticks or un-ticks one objective. Ticking the last required objective
// completes the quest; un-ticking a required objective of a completed quest
// re-opens it (keeping the other objectives ticked). Returns 'completed',
// 'reopened' or null so the caller can tell the player what happened.
export function setObjectiveDone(b, task, objectiveId, done) {
  const objective = task.objectives.find(o => o.id === objectiveId);
  if (!objective) return null;
  const required = requiredObjectives(task);

  if (b.tasks[task.id] && !objective.optional) {
    if (done) return null;
    delete b.tasks[task.id];
    for (const o of required) b.objectives[o.id] = true;
    delete b.objectives[objectiveId];
    return 'reopened';
  }

  if (done) b.objectives[objectiveId] = true;
  else delete b.objectives[objectiveId];

  if (!b.tasks[task.id] && required.length && required.every(o => b.objectives[o.id])) {
    b.tasks[task.id] = true;
    return 'completed';
  }
  return null;
}

export function exportPayload(progress) {
  return {
    format: EXPORT_FORMAT,
    version: 1,
    exportedAt: new Date().toISOString(),
    modes: normalizeProgress(progress).modes
  };
}

// Reads a progress file from this site or either earlier version. Throws
// with a readable message when the file isn't recognised.
export function parseImport(json) {
  if (json && json.format === EXPORT_FORMAT) return normalizeProgress(json);
  const regular = { tasks: {}, objectives: {} };
  const boardTasks = Array.isArray(json) ? json : json?.tasks;
  if (absorbBoardTasks(regular, boardTasks)) return { version: 1, modes: { regular } };
  if (json && typeof json === 'object' && !Array.isArray(json)) {
    const simple = flagMap(json);
    if (Object.keys(simple).length)
      return { version: 1, modes: { regular: { tasks: simple, objectives: {} } } };
  }
  throw new Error("That file doesn't look like an EFTracking progress export.");
}

// Adds imported flags on top of existing progress (never removes anything).
// Returns the number of quests that became complete.
export function mergeProgress(target, incoming) {
  let added = 0;
  for (const [mode, b] of Object.entries(incoming.modes)) {
    const dest = modeBucket(target, mode);
    for (const id of Object.keys(b.tasks)) {
      if (!dest.tasks[id]) added++;
      dest.tasks[id] = true;
    }
    Object.assign(dest.objectives, b.objectives);
  }
  return added;
}
