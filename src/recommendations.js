import { parsePartIndex } from './lib.js';

// Returns the top `limit` tasks the user should do next. A task is
// eligible if:
//   - not already completed
//   - every same-task prerequisite is either completed or absent from
//     the task set (so we don't get stuck behind a missing prereq)
// Ranking, in order:
//   1. Kappa-required quests first
//   2. Lower minPlayerLevel before higher
//   3. Lower part index ("Part 1" before "Part 2")
//   4. Alphabetical by name as final tie-breaker
export function getNextUp(tasks, done, limit = 5) {
  const ids = new Set(tasks.map(t => t.id));
  const eligible = tasks.filter(t => {
    if (done[t.id]) return false;
    const reqs = t.taskRequirements || [];
    for (const r of reqs) {
      const pid = r.task?.id;
      if (!pid) continue;
      if (!ids.has(pid)) continue;
      if (!done[pid]) return false;
    }
    return true;
  });

  eligible.sort((a, b) => {
    const ak = a.kappaRequired ? 0 : 1;
    const bk = b.kappaRequired ? 0 : 1;
    if (ak !== bk) return ak - bk;
    const al = a.minPlayerLevel ?? 0;
    const bl = b.minPlayerLevel ?? 0;
    if (al !== bl) return al - bl;
    const ap = parsePartIndex(a.name);
    const bp = parsePartIndex(b.name);
    if (ap !== bp) return ap - bp;
    return a.name.localeCompare(b.name);
  });

  return eligible.slice(0, limit);
}

// Pulls the distinct map names referenced by a task's objectives.
// Returns at most `limit` names so the badge row doesn't explode on
// "anywhere" tasks. Empty array for tasks without map data.
export function mapsForTask(task, limit = 3) {
  const seen = new Set();
  for (const o of task.objectives || []) {
    for (const m of o?.maps || []) {
      const n = m?.name;
      if (n) seen.add(n);
      if (seen.size >= limit) break;
    }
    if (seen.size >= limit) break;
  }
  return [...seen];
}

// Summarises trader-standing rewards as a list of
// { trader, standing } objects. Drops zero entries — Tarkov.dev
// sometimes returns those for cosmetic reasons.
export function repRewardsForTask(task) {
  const out = [];
  for (const r of task.finishRewards?.traderStanding || []) {
    const standing = r?.standing;
    const trader = r?.trader?.name;
    if (!trader || !standing) continue;
    out.push({ trader, standing });
  }
  return out;
}
