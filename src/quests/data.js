// Loads quest data from tarkov.dev, caches it per game mode, and falls back
// to the bundled snapshot when the API can't be reached.
import { gqlFirstAccepted } from '../shared/api.js';
import { readJson, writeJson } from '../shared/storage.js';

// Everything the board uses. If tarkov.dev ever rejects a field, the simpler
// queries below keep the site working with less detail.
export const QUEST_QUERY = `query EftrackingQuests($mode: GameMode) {
  tasks(gameMode: $mode) {
    id
    name
    normalizedName
    wikiLink
    minPlayerLevel
    kappaRequired
    factionName
    trader { name imageLink }
    map { name }
    taskRequirements { task { id } status }
    objectives { id description optional maps { name } }
  }
}`;

const CORE_QUERY = `query EftrackingQuestsCore($mode: GameMode) {
  tasks(gameMode: $mode) {
    id name wikiLink minPlayerLevel kappaRequired
    trader { name }
    taskRequirements { task { id } status }
    objectives { id description }
  }
}`;

// Exactly what the previous version of the site requested.
const BASIC_QUERY = `query EftrackingQuestsBasic($mode: GameMode) {
  tasks(gameMode: $mode) {
    id name kappaRequired wikiLink minPlayerLevel
    trader { name }
    objectives { id description }
  }
}`;

const CACHE_PREFIX = 'eftracking.tasks.v1.';
export const REFRESH_AFTER_MS = 6 * 60 * 60 * 1000;

export function readCachedTasks(mode) {
  const cached = readJson(CACHE_PREFIX + mode);
  return cached && Array.isArray(cached.tasks) && cached.tasks.length ? cached : null;
}

export async function fetchLiveTasks(mode, opts) {
  const { data, level } = await gqlFirstAccepted(
    [QUEST_QUERY, CORE_QUERY, BASIC_QUERY],
    { mode },
    opts
  );
  const tasks = (Array.isArray(data.tasks) ? data.tasks : []).filter(Boolean);
  if (!tasks.length) throw new Error('tarkov.dev returned no quests');
  // `limited` means a fallback query was used, so some details are missing.
  const entry = { savedAt: Date.now(), limited: level > 0, tasks };
  writeJson(CACHE_PREFIX + mode, entry);
  return entry;
}

// Last-resort copy shipped with the site (see scripts/update-snapshot.mjs).
// Only downloaded when the live API fails and nothing is cached.
export async function loadSnapshot(mode) {
  const files = mode === 'regular' ? ['regular'] : [mode, 'regular'];
  for (const file of files) {
    try {
      const res = await fetch(
        new URL(`../../data/snapshot-${file}.json`, import.meta.url)
      );
      if (!res.ok) continue;
      const json = await res.json();
      if (Array.isArray(json?.tasks) && json.tasks.length) {
        return { savedAt: json.generatedAt, tasks: json.tasks, mode: json.mode || file };
      }
    } catch {}
  }
  return null;
}
