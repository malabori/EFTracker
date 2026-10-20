// Pure quest logic: no DOM, storage or network. Everything the board shows
// is derived here from the raw tarkov.dev tasks plus the player's progress
// and profile (faction, level).

// In-game trader order; anything unknown goes after these, alphabetically.
export const TRADER_ORDER = [
  'Prapor',
  'Therapist',
  'Fence',
  'Skier',
  'Peacekeeper',
  'Mechanic',
  'Ragman',
  'Jaeger',
  'Ref',
  'Lightkeeper',
  'BTR Driver'
];

export const TABS = ['available', 'locked', 'completed', 'all'];

const unique = list => [...new Set(list.filter(Boolean))];

function normalizeStatus(status) {
  const list = (Array.isArray(status) ? status : [])
    .map(s => String(s).toLowerCase())
    .filter(Boolean);
  return list.length ? list : ['complete'];
}

export function normalizeTask(raw) {
  const objectives = (raw.objectives || [])
    .filter(o => o && o.id != null && o.description)
    .map(o => ({
      id: String(o.id),
      text: String(o.description),
      optional: Boolean(o.optional),
      maps: unique((o.maps || []).map(m => m?.name))
    }));
  const maps = unique([raw.map?.name, ...objectives.flatMap(o => o.maps)]);
  const trader = raw.trader?.name || 'Unknown trader';
  const name = String(raw.name);
  return {
    id: String(raw.id),
    name,
    slug: raw.normalizedName || null,
    wikiLink: raw.wikiLink || null,
    level: Number.isFinite(raw.minPlayerLevel) ? raw.minPlayerLevel : 1,
    xp: Number.isFinite(raw.experience) ? raw.experience : 0,
    kappa: Boolean(raw.kappaRequired),
    lightkeeper: Boolean(raw.lightkeeperRequired),
    faction:
      raw.factionName === 'BEAR' || raw.factionName === 'USEC' ? raw.factionName : 'Any',
    trader,
    traderImage: raw.trader?.imageLink || null,
    maps,
    requires: (raw.taskRequirements || [])
      .filter(r => r?.task?.id != null)
      .map(r => ({ id: String(r.task.id), status: normalizeStatus(r.status) })),
    traderReqs: (raw.traderRequirements || [])
      .filter(r => r?.trader?.name && r.value != null)
      .map(r => ({
        trader: r.trader.name,
        type: r.requirementType || 'level',
        compare: r.compareMethod || '>=',
        value: r.value
      })),
    objectives,
    rewards: {
      standing: (raw.finishRewards?.traderStanding || [])
        .filter(s => s?.trader?.name && s.standing)
        .map(s => ({ trader: s.trader.name, standing: s.standing })),
      items: (raw.finishRewards?.items || [])
        .filter(i => i?.item?.name)
        .map(i => ({ name: i.item.name, count: i.count || 1 }))
    },
    search: [name, trader, ...maps, ...objectives.map(o => o.text)]
      .join('\n')
      .toLowerCase()
  };
}

// Longest prerequisite chain below each task, used to list quests in the
// order they unlock. Cycles (bad data) are cut instead of recursing forever.
function chainDepths(tasks, byId) {
  const depth = new Map();
  const visiting = new Set();
  const visit = task => {
    if (depth.has(task.id)) return depth.get(task.id);
    if (visiting.has(task.id)) return 0;
    visiting.add(task.id);
    let d = 0;
    for (const req of task.requires) {
      const prereq = byId.get(req.id);
      if (prereq) d = Math.max(d, visit(prereq) + 1);
    }
    visiting.delete(task.id);
    depth.set(task.id, d);
    return d;
  };
  tasks.forEach(visit);
  return depth;
}

function traderRank(name) {
  const i = TRADER_ORDER.indexOf(name);
  return i === -1 ? TRADER_ORDER.length : i;
}

export function buildCatalog(rawTasks) {
  const tasks = [];
  const seen = new Set();
  for (const raw of rawTasks || []) {
    if (!raw || raw.id == null || !raw.name || seen.has(String(raw.id))) continue;
    seen.add(String(raw.id));
    tasks.push(normalizeTask(raw));
  }
  const byId = new Map(tasks.map(t => [t.id, t]));

  const unlocks = new Map();
  for (const task of tasks) {
    for (const req of task.requires) {
      if (!byId.has(req.id)) continue;
      if (!unlocks.has(req.id)) unlocks.set(req.id, []);
      unlocks.get(req.id).push(task.id);
    }
  }

  const depth = chainDepths(tasks, byId);
  tasks.sort(
    (a, b) =>
      traderRank(a.trader) - traderRank(b.trader) ||
      a.trader.localeCompare(b.trader) ||
      depth.get(a.id) - depth.get(b.id) ||
      a.level - b.level ||
      a.name.localeCompare(b.name, undefined, { numeric: true })
  );

  const traderImages = new Map();
  for (const t of tasks)
    if (t.traderImage && !traderImages.has(t.trader))
      traderImages.set(t.trader, t.traderImage);

  return {
    tasks,
    byId,
    unlocks,
    traders: unique(tasks.map(t => t.trader)),
    maps: unique(tasks.flatMap(t => t.maps)).sort((a, b) => a.localeCompare(b)),
    traderImages
  };
}

export function inFactionScope(task, faction) {
  return !faction || task.faction === 'Any' || task.faction === faction;
}

// Works out whether each quest is completed, available or locked, and why
// it is locked. Only requirements the tracker can know about block a quest:
//   - "complete" requirements need the prerequisite marked complete
//   - "active" requirements only need the prerequisite to be unlocked
//   - anything that can be met by *failing* a quest is not tracked, so it
//     never blocks
//   - prerequisites for the other faction, or missing from the data, never block
export function evaluate(catalog, { done = {}, faction = null, level = null } = {}) {
  const result = new Map();
  const visiting = new Set();

  const visit = task => {
    const known = result.get(task.id);
    if (known) return known;
    if (done[task.id]) {
      const r = { state: 'completed', missing: [], needLevel: null };
      result.set(task.id, r);
      return r;
    }
    if (visiting.has(task.id))
      return { state: 'available', missing: [], needLevel: null };
    visiting.add(task.id);

    const missing = [];
    for (const req of task.requires) {
      const prereq = catalog.byId.get(req.id);
      if (!prereq || !inFactionScope(prereq, faction) || req.status.includes('failed'))
        continue;
      if (req.status.includes('active')) {
        if (visit(prereq).state === 'locked') missing.push(prereq.id);
      } else if (req.status.includes('complete') && !done[prereq.id]) {
        missing.push(prereq.id);
      }
    }
    visiting.delete(task.id);

    const needLevel = level != null && task.level > level ? task.level : null;
    const r = {
      state: missing.length || needLevel ? 'locked' : 'available',
      missing,
      needLevel
    };
    result.set(task.id, r);
    return r;
  };

  for (const task of catalog.tasks) if (inFactionScope(task, faction)) visit(task);
  return result;
}

export function normalizeQuery(query) {
  return String(query || '')
    .trim()
    .toLowerCase();
}

function matches(task, f, query) {
  if (f.trader && task.trader !== f.trader) return false;
  if (f.map && !task.maps.includes(f.map)) return false;
  if (f.kappa && !task.kappa) return false;
  if (f.lightkeeper && !task.lightkeeper) return false;
  if (query && !task.search.includes(query)) return false;
  return true;
}

// Applies every filter except the status tab, counts how many quests land in
// each tab, then returns the quests for the active tab (in chain order).
export function filterTasks(catalog, statuses, filters, faction) {
  const query = normalizeQuery(filters.query);
  const counts = { available: 0, locked: 0, completed: 0, all: 0 };
  const list = [];
  for (const task of catalog.tasks) {
    if (!inFactionScope(task, faction) || !matches(task, filters, query)) continue;
    const state = statuses.get(task.id)?.state || 'available';
    counts[state]++;
    counts.all++;
    if (filters.tab === 'all' || filters.tab === state) list.push(task);
  }
  return { list, counts };
}

export function groupByTrader(list) {
  const groups = [];
  for (const task of list) {
    const last = groups[groups.length - 1];
    if (last && last.trader === task.trader) last.tasks.push(task);
    else groups.push({ trader: task.trader, tasks: [task] });
  }
  return groups;
}

export function summarize(catalog, statuses, faction) {
  const blank = () => ({ done: 0, total: 0 });
  const out = {
    all: blank(),
    kappa: blank(),
    lightkeeper: blank(),
    available: 0,
    traders: new Map()
  };
  for (const task of catalog.tasks) {
    if (!inFactionScope(task, faction)) continue;
    const state = statuses.get(task.id)?.state;
    const isDone = state === 'completed';
    const add = bucket => {
      bucket.total++;
      if (isDone) bucket.done++;
    };
    add(out.all);
    if (task.kappa) add(out.kappa);
    if (task.lightkeeper) add(out.lightkeeper);
    if (state === 'available') out.available++;
    if (!out.traders.has(task.trader)) out.traders.set(task.trader, blank());
    add(out.traders.get(task.trader));
  }
  return out;
}

export function requiredObjectives(task) {
  return task.objectives.filter(o => !o.optional);
}
