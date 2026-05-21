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

export function topoSortByTrader(list, name) {
  const nodes = new Map();
  const deg = new Map();
  const adj = new Map();
  list.forEach(t => {
    nodes.set(t.id, t);
    deg.set(t.id, 0);
    adj.set(t.id, []);
  });
  list.forEach(t => {
    getPrereqIdsSameTrader(t, name).forEach(pid => {
      if (!nodes.has(pid)) return;
      adj.get(pid).push(t.id);
      deg.set(t.id, deg.get(t.id) + 1);
    });
  });

  const tie = (a, b) => {
    const al = a.minPlayerLevel ?? 0;
    const bl = b.minPlayerLevel ?? 0;
    if (al !== bl) return al - bl;
    const ap = parsePartIndex(a.name);
    const bp = parsePartIndex(b.name);
    if (ap !== bp) return ap - bp;
    return a.name.localeCompare(b.name);
  };

  // Single sort up front; ready queue stays small enough that
  // resorting on insertion is cheap, but avoid the worst case by
  // only sorting when we actually add new entries.
  const ready = [];
  deg.forEach((d, id) => {
    if (d === 0) ready.push(id);
  });
  ready.sort((a, b) => tie(nodes.get(a), nodes.get(b)));

  const out = [];
  const seen = new Set();
  while (ready.length) {
    const id = ready.shift();
    out.push(nodes.get(id));
    seen.add(id);
    let added = false;
    for (const v of adj.get(id)) {
      deg.set(v, deg.get(v) - 1);
      if (deg.get(v) === 0) {
        ready.push(v);
        added = true;
      }
    }
    if (added) ready.sort((a, b) => tie(nodes.get(a), nodes.get(b)));
  }

  if (out.length !== list.length) {
    const left = list.filter(t => !seen.has(t.id)).sort(tie);
    return out.concat(left);
  }
  return out;
}
