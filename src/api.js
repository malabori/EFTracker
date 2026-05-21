import { readJsonLocalStorage, safeLocalStorageSet } from './storage.js';

export const ENDPOINT = 'https://api.tarkov.dev/graphql';

export const EXT_QUERY = `query Tasks { tasks {
    id name type kappaRequired wikiLink
    trader { id name imageLink }
    minPlayerLevel experience
    taskRequirements { task { id name trader { name } } status }
    objectives { id description maps { name } }
    finishRewards {
      traderStanding { trader { name } standing }
    }
} }`;

export const BASIC_QUERY = `query Tasks { tasks { id name type kappaRequired wikiLink trader { id name } objectives { id description } } }`;

const CACHE_KEY = 'eft_tasks_cache_v3';
const CACHE_TTL = 12 * 60 * 60 * 1000;

export const getCache = () => {
  const v = readJsonLocalStorage(CACHE_KEY, null);
  if (v && Date.now() - v.ts < CACHE_TTL) return v.data;
  return null;
};

export const setCache = data =>
  safeLocalStorageSet(CACHE_KEY, JSON.stringify({ ts: Date.now(), data }));

async function postQuery(query) {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query })
  });
  const json = await res.json();
  if (json.errors) throw new Error(json.errors.map(e => e.message).join('; '));
  return json.data?.tasks || [];
}

// Tries the extended query (with prereqs + level) first so we can topo
// sort; on any failure, falls back to the basic query. Returns
// { tasks, extended } on success, throws on total failure.
export async function fetchTasks() {
  try {
    const tasks = await postQuery(EXT_QUERY);
    return { tasks, extended: true };
  } catch (e) {
    const tasks = await postQuery(BASIC_QUERY).catch(() => {
      throw e;
    });
    return { tasks, extended: false };
  }
}
