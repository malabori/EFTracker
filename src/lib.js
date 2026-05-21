export function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[c]));
}

export function escReg(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function hi(text, q) {
  const src = String(text ?? '');
  if (!q) return escapeHtml(src);
  const r = new RegExp(escReg(q), 'ig');
  let out = '';
  let last = 0;
  let m;
  while ((m = r.exec(src)) !== null) {
    out += escapeHtml(src.slice(last, m.index));
    out += `<mark class="eft-hit">${escapeHtml(m[0])}</mark>`;
    last = m.index + m[0].length;
    if (m[0].length === 0) r.lastIndex++;
  }
  out += escapeHtml(src.slice(last));
  return out;
}

export function parsePartIndex(name) {
  const m = name.match(/part\s+(\d+)/i);
  if (m) return parseInt(m[1], 10);
  const r = name.match(/part\s+([ivxlcdm]+)/i);
  if (!r) return Number.POSITIVE_INFINITY;
  const map = { i: 1, v: 5, x: 10, l: 50, c: 100, d: 500, m: 1000 };
  let n = 0;
  let p = 0;
  const s = r[1].toLowerCase();
  for (let i = s.length - 1; i >= 0; i--) {
    const v = map[s[i]] || 0;
    n += v < p ? -v : v;
    p = v;
  }
  return n;
}

export function getPrereqIdsSameTrader(task, traderName) {
  const reqs = task.taskRequirements || [];
  const ids = [];
  for (const r of reqs) {
    const rt = r.task;
    const tn = rt?.trader?.name;
    if (rt && tn === traderName) ids.push(rt.id);
  }
  return ids;
}

// Topological order by "tier" depth: a task's depth is one more than the
// max depth of its same-trader prerequisites. Sorting by (depth, level,
// part index, name) gives a single O(n + E + n log n) ordering that
// always places prereqs before dependents. On cycles, depth falls back to
// 0 for the cycle members so they still appear in a stable position.
export function topoSortByTrader(list, name) {
  const prereqs = new Map();
  const inList = new Set(list.map(t => t.id));
  for (const t of list) {
    prereqs.set(
      t.id,
      getPrereqIdsSameTrader(t, name).filter(pid => inList.has(pid))
    );
  }

  const depths = new Map();
  const visiting = new Set();
  const depthOf = id => {
    const cached = depths.get(id);
    if (cached !== undefined) return cached;
    if (visiting.has(id)) return 0;
    visiting.add(id);
    let max = 0;
    for (const pid of prereqs.get(id)) {
      const d = depthOf(pid) + 1;
      if (d > max) max = d;
    }
    visiting.delete(id);
    depths.set(id, max);
    return max;
  };

  for (const t of list) depthOf(t.id);

  return list.slice().sort((a, b) => {
    const da = depths.get(a.id);
    const db = depths.get(b.id);
    if (da !== db) return da - db;
    const al = a.minPlayerLevel ?? 0;
    const bl = b.minPlayerLevel ?? 0;
    if (al !== bl) return al - bl;
    const ap = parsePartIndex(a.name);
    const bp = parsePartIndex(b.name);
    if (ap !== bp) return ap - bp;
    return a.name.localeCompare(b.name);
  });
}
