// Quest progress, saved per game mode in this browser:
//   { version: 1, modes: { regular: { tasks: { [taskId]: true }, objectives: { [objectiveId]: true } } } }
// The tracker only ticks whole quests now. Objective flags saved by earlier
// versions are still carried through saves, exports and imports untouched.
import { readJson, writeJson, storageKeys } from '../shared/storage.js';

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
  const out = { version: 1, modes };
  // Set once eftracking.com has handed over the old site's progress.
  if (raw?.legacyHandoff === true) out.legacyHandoff = true;
  return out;
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

export function setQuestDone(b, task, done) {
  if (done) b.tasks[task.id] = true;
  else delete b.tasks[task.id];
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
