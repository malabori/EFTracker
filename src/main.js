import './styles/main.css';

const ENDPOINT = 'https://api.tarkov.dev/graphql';
const EXT_QUERY = `query Tasks { tasks {
    id name type kappaRequired wikiLink trader { id name }
    minPlayerLevel taskRequirements { task { id name trader { name } } status }
    objectives { id description }
} }`;
const BASIC_QUERY = `query Tasks { tasks { id name type kappaRequired wikiLink trader { id name } objectives { id description } } }`;

const ORDER_ROWS = [
  ['Prapor', 'Therapist'],
  ['Fence', 'Skier'],
  ['Peacekeeper', 'Mechanic'],
  ['Ragman', 'Jaeger'],
  ['Ref', 'Lightkeeper'],
  ['BTR Driver', null]
];

const DEFUNCT_EXACT = new Set([]);
const CACHE_KEY = 'eft_tasks_cache_v2';
const CACHE_TTL = 12 * 60 * 60 * 1000;

const state = {
  tasks: [],
  extended: false,
  done: JSON.parse(localStorage.getItem('eft-task-progress-stable') || '{}'),
  traderFilter: 'ALL',
  kappaOnly: false,
  showCompleted: true,
  search: '',
  collapsed: {},
  openTask: {},
  colMap: {},
  scrollByTrader: {},
  celebrated: JSON.parse(localStorage.getItem('eft-kappa-celebrated') || 'false'),
  loading: true,
  error: ''
};

try {
  const ui = JSON.parse(localStorage.getItem('eft-ui') || '{}');
  state.collapsed = ui.collapsed || {};
  state.openTask = ui.openTask || {};
} catch {}

const saveProgress = () => localStorage.setItem('eft-task-progress-stable', JSON.stringify(state.done));
const saveUI = () =>
  localStorage.setItem('eft-ui', JSON.stringify({ collapsed: state.collapsed, openTask: state.openTask }));

const refs = {
  side: null,
  app: null,
  toast: null,
  burger: null,
  offcanvas: null,
  offcanvasClose: null
};

function ensureShell() {
  if (!mountHasShell()) {
    renderShell();
  }

  refs.side = document.getElementById('eft-side');
  refs.app = document.getElementById('eft-shell');
  refs.toast = document.getElementById('eft-toast');
  refs.burger = document.getElementById('eft-burger');
  refs.offcanvas = document.getElementById('eft-offcanvas');
  refs.offcanvasClose = document.getElementById('eft-offcanvas-close');
}

function mountHasShell() {
  return document.getElementById('eft-shell');
}

function renderShell() {
  const mount = document.getElementById('eft-app');
  mount.innerHTML = `
    <div id="eft-wrap">
      <aside id="eft-side" aria-label="Site">
        <nav class="bubble">
          <div class="title">Menu</div>
          <ul class="snav primary">
            <li><a class="slink" href="/sign-in">Sign in</a></li>
            <li><a class="slink" href="/updates">Updates</a></li>
            <li><a class="slink" href="/blog">Blog</a></li>
          </ul>
          <div class="legal-text">
            <a href="/terms">Terms</a> •
            <a href="/privacy">Privacy</a> •
            <a href="/dmca">DMCA</a> •
            <a href="/sources">Data sources</a>
          </div>
        </nav>
      </aside>

      <button id="eft-burger" aria-expanded="false" aria-controls="eft-offcanvas" aria-label="Open menu">☰</button>
      <div id="eft-offcanvas" aria-hidden="true">
        <div class="panel" role="dialog" aria-modal="true" id="eft-offcanvas-panel">
          <button class="close" type="button" id="eft-offcanvas-close">Close</button>
          <nav class="bubble" aria-label="Mobile site">
            <div class="title">Menu</div>
            <ul class="snav primary">
              <li><a class="slink" href="/sign-in">Sign in</a></li>
              <li><a class="slink" href="/updates">Updates</a></li>
              <li><a class="slink" href="/blog">Blog</a></li>
            </ul>
            <div class="legal-text" style="margin-top:12px;">
              <a href="/terms">Terms</a> •
              <a href="/privacy">Privacy</a> •
              <a href="/dmca">DMCA</a> •
              <a href="/sources">Data sources</a>
            </div>
          </nav>
        </div>
      </div>

      <div id="eft-cw"><div class="shell" id="eft-shell"></div></div>
      <div id="eft-toast"><span id="eft-toast-msg"></span><span class="toast-actions"></span></div>
    </div>
  `;
}

function initBackground() {
  document.title = 'EFTRACKER';

  if (!document.getElementById('eft-bg-grid')) {
    const g = document.createElement('div');
    g.id = 'eft-bg-grid';
    document.body.appendChild(g);
  }

  if (!document.getElementById('eft-bg-noise')) {
    const c = document.createElement('canvas');
    c.id = 'eft-bg-noise';
    document.body.appendChild(c);
    const x = c.getContext('2d', { alpha: true });
    const DPR = Math.min(2, window.devicePixelRatio || 1);
    function size() {
      c.width = innerWidth * DPR;
      c.height = innerHeight * DPR;
    }
    size();
    addEventListener('resize', size, { passive: true });
    let interval = matchMedia('(max-width: 600px)').matches ? 120 : 90;
    function frame() {
      const w = c.width;
      const h = c.height;
      const img = x.createImageData(w, h);
      const d = img.data;
      for (let i = 0; i < w * h; i += 8) {
        const v = Math.floor(Math.random() * 255);
        const o = i * 4;
        d[o] = v;
        d[o + 1] = v;
        d[o + 2] = v;
        d[o + 3] = 12;
      }
      x.putImageData(img, 0, 0);
    }
    let tid = setInterval(frame, interval);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) clearInterval(tid);
      else tid = setInterval(frame, interval);
    });
  }
}

const getCache = () => {
  try {
    const v = JSON.parse(localStorage.getItem(CACHE_KEY) || '');
    if (v && Date.now() - v.ts < CACHE_TTL) return v.data;
  } catch {}
  return null;
};

const setCache = data => {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data }));
  } catch {}
};

const isDefunct = t => DEFUNCT_EXACT.has(t.name);

function getPrereqIdsSameTrader(task, traderName) {
  const reqs = task.taskRequirements || [];
  const ids = [];
  for (const r of reqs) {
    const rt = r.task;
    const tn = rt?.trader?.name;
    if (rt && tn === traderName) ids.push(rt.id);
  }
  return ids;
}

function parsePartIndex(name) {
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

function topoSortByTrader(list, name) {
  const nodes = new Map();
  list.forEach(t => nodes.set(t.id, t));
  const deg = new Map();
  const adj = new Map();
  list.forEach(t => {
    deg.set(t.id, 0);
    adj.set(t.id, []);
  });
  list.forEach(t => {
    getPrereqIdsSameTrader(t, name).forEach(pid => {
      if (!nodes.has(pid)) return;
      adj.get(pid).push(t.id);
      deg.set(t.id, (deg.get(t.id) || 0) + 1);
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
  const q = [];
  deg.forEach((d, id) => {
    if (d === 0) q.push(id);
  });
  q.sort((a, b) => tie(nodes.get(a), nodes.get(b)));
  const out = [];
  while (q.length) {
    const id = q.shift();
    out.push(nodes.get(id));
    for (const v of adj.get(id)) {
      deg.set(v, deg.get(v) - 1);
      if (deg.get(v) === 0) {
        q.push(v);
        q.sort((a, b) => tie(nodes.get(a), nodes.get(b)));
      }
    }
  }
  if (out.length !== list.length) {
    const left = list.filter(t => !out.includes(t)).sort(tie);
    return out.concat(left);
  }
  return out;
}

function orderForTrader(list, name) {
  const alive = list.filter(t => !isDefunct(t));
  const dead = list.filter(t => isDefunct(t));
  const ordered = state.extended
    ? topoSortByTrader(alive, name)
    : alive
        .slice()
        .sort((a, b) => {
          const ap = parsePartIndex(a.name);
          const bp = parsePartIndex(b.name);
          if (ap !== bp) return ap - bp;
          return a.name.localeCompare(b.name);
        });
  return ordered.concat(dead);
}

function stats() {
  const total = state.tasks.length;
  const done = state.tasks.reduce((n, t) => n + (state.done[t.id] ? 1 : 0), 0);
  const kAll = state.tasks.filter(t => t.kappaRequired).length;
  const kDone = state.tasks.filter(t => t.kappaRequired && state.done[t.id]).length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  return { total, done, kAll, kDone, pct };
}

function escReg(s) {
  return s.replace(/[.*+?^${}()|[\\]\\]/g, '\\$&');
}

function hi(text, q) {
  if (!q) return text;
  const r = new RegExp(`(${escReg(q)})`, 'ig');
  return text.replace(r, '<mark class="eft-hit">$1</mark>');
}

function groups() {
  const q = state.search.trim().toLowerCase();
  const map = new Map();
  for (const t of state.tasks) {
    const trader = t.trader?.name || 'Unknown';
    if (state.traderFilter !== 'ALL' && state.traderFilter !== trader) continue;
    if (state.kappaOnly && !t.kappaRequired) continue;
    if (!state.showCompleted && state.done[t.id]) continue;

    if (q) {
      const hit =
        t.name.toLowerCase().includes(q) ||
        (t.trader?.name || '').toLowerCase().includes(q) ||
        (t.objectives || []).some(o => o?.description?.toLowerCase().includes(q));
      if (!hit) continue;
    }
    if (!map.has(trader)) map.set(trader, []);
    map.get(trader).push(t);
  }
  for (const [n, list] of map) {
    map.set(n, orderForTrader(list, n));
  }
  return map;
}

function buildColumnOrder(present) {
  const set = new Set(present);
  const L = [];
  const R = [];
  for (const [l, r] of ORDER_ROWS) {
    if (l && set.has(l)) {
      L.push(l);
      state.colMap[l] = 'L';
    }
    if (r && set.has(r)) {
      R.push(r);
      state.colMap[r] = 'R';
    }
  }
  for (const n of set) {
    if (!L.includes(n) && !R.includes(n)) {
      (L.length <= R.length ? L : R).push(n);
    }
  }
  return { left: L, right: R };
}

function captureScroll() {
  refs.app?.querySelectorAll('.section .task-wrap').forEach(w => {
    const trader = w.closest('.section')?.getAttribute('data-trader');
    if (trader) state.scrollByTrader[trader] = w.scrollTop;
  });
}

function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') {
      n.className = v || '';
      continue;
    }
    if (k === 'html') {
      n.innerHTML = v ?? '';
      continue;
    }
    if (k.startsWith('on') && typeof v === 'function') {
      n.addEventListener(k.slice(2), v);
      continue;
    }
    if (k in n && (typeof v === 'boolean' || typeof v === 'number' || v == null)) {
      if (v != null) n[k] = v;
      continue;
    }
    if (v != null && v !== false) n.setAttribute(k, String(v));
  }
  for (const kid of kids) {
    if (kid != null) n.append(kid.nodeType ? kid : document.createTextNode(kid));
  }
  return n;
}

function fireConfetti() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (document.getElementById('eft-confetti')) return;
  const c = document.createElement('canvas');
  c.id = 'eft-confetti';
  document.body.appendChild(c);
  const ctx = c.getContext('2d');
  const DPR = Math.min(2, devicePixelRatio || 1);
  function rs() {
    c.width = innerWidth * DPR;
    c.height = innerHeight * DPR;
  }
  rs();
  addEventListener('resize', rs, { passive: true });
  const count = Math.min(300, innerWidth < 600 ? 140 : 260);
  const colors = ['#d6b986', '#a7895f', '#90a4ae', '#cfd8dc', '#7fb27f', '#e57373'];
  const parts = Array.from({ length: count }, () => ({
    x: Math.random() * c.width,
    y: -Math.random() * c.height * 0.3,
    r: 4 + Math.random() * 6,
    vx: (Math.random() * 2 - 1) * 1.1 * DPR,
    vy: (1.6 + Math.random() * 2.4) * DPR,
    rot: Math.random() * Math.PI,
    vr: (Math.random() * 2 - 1) * 0.15,
    color: colors[(Math.random() * colors.length) | 0]
  }));
  const t0 = performance.now();
  const DUR = 2300;
  (function tick(t) {
    ctx.clearRect(0, 0, c.width, c.height);
    parts.forEach(p => {
      p.vy += 0.04 * DPR;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.r, -p.r * 0.4, p.r * 2, p.r * 0.8);
      ctx.restore();
    });
    if (t - t0 < DUR) requestAnimationFrame(tick);
    else c.remove();
  })(t0);
}

function showToast(msg, actions = []) {
  const msgEl = document.getElementById('eft-toast-msg');
  const actEl = refs.toast.querySelector('.toast-actions');
  msgEl.textContent = msg;
  actEl.innerHTML = '';
  actions.forEach(a => {
    const b = document.createElement('button');
    b.className = 'btn';
    b.textContent = a.label;
    b.onclick = a.onClick;
    actEl.appendChild(b);
  });
  refs.toast.classList.add('show');
  setTimeout(() => refs.toast.classList.remove('show'), 5000);
}

function exportProgress() {
  const blob = new Blob([JSON.stringify(state.done, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `eftracker-progress-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function maybeCelebrate() {
  const s = stats();
  if (s.kAll > 0 && s.kDone === s.kAll && !state.celebrated) {
    state.celebrated = true;
    localStorage.setItem('eft-kappa-celebrated', 'true');
    fireConfetti();
    showToast('Kappa requirements complete!', [{ label: 'Export progress', onClick: exportProgress }]);
  }
}

let searchTimer = null;

function render() {
  let restoreSearch = null;
  const active = document.activeElement;
  if (active && active.id === 'eft-search') {
    restoreSearch = { value: active.value, start: active.selectionStart, end: active.selectionEnd };
  }

  captureScroll();
  const s = stats();
  refs.app.innerHTML = '';

  const hero = el('div', { class: 'hero' }, el('h1', {}, 'EFTRACKER'), el('div', { class: 'sub' }, 'TASK TRACKER SYSTEM v1.0'));

  const err = state.error
    ? el(
        'div',
        { class: 'err' },
        el('strong', {}, 'Error: '),
        state.error,
        ' ',
        el('button', { class: 'btn', onclick: () => { state.error = ''; state.loading = true; load(true); } }, 'Retry')
      )
    : null;

  const statsRow = el(
    'div',
    { class: 'stats', id: 'eft-stats' },
    el('div', { class: 'stat' }, el('div', { class: 'num' }, String(s.done)), el('div', { class: 'lbl' }, 'COMPLETED')),
    el('div', { class: 'stat' }, el('div', { class: 'num' }, String(s.total)), el('div', { class: 'lbl' }, 'TOTAL TASKS')),
    el('div', { class: 'stat' }, el('div', { class: 'num' }, `${s.kDone}/${s.kAll}`), el('div', { class: 'lbl' }, 'KAPPA PROGRESS')),
    el('div', { class: 'stat' }, el('div', { class: 'num' }, `${s.pct}%`), el('div', { class: 'lbl' }, 'COMPLETION'))
  );

  const allNames = [...new Set(state.tasks.map(t => t.trader?.name || 'Unknown'))];
  const ordAll = buildColumnOrder(allNames);
  const dropdown = ['ALL', ...ordAll.left, ...ordAll.right];

  const traderSelectId = 'eft-trader-filter';
  const sel = el('select', { id: traderSelectId, onchange: e => { state.traderFilter = e.target.value; renderColumnsOnly(); } });
  dropdown.forEach(name => sel.append(el('option', { value: name, selected: state.traderFilter === name }, name === 'ALL' ? 'ALL TRADERS' : name)));
  const traderLabel = el('label', { for: traderSelectId, class: 'bar-label' }, 'Trader:');

  const kappaOnly = el('label', {}, el('input', { type: 'checkbox', checked: state.kappaOnly, onchange: e => { state.kappaOnly = e.target.checked; renderColumnsOnly(); } }), ' Kappa only');
  const showCompleted = el('label', {}, el('input', { type: 'checkbox', checked: state.showCompleted, onchange: e => { state.showCompleted = e.target.checked; renderColumnsOnly(); } }), ' Show completed');

  const searchBox = el(
    'div',
    { class: 'search' },
    el('input', {
      id: 'eft-search',
      type: 'search',
      placeholder: 'Search tasks…',
      value: state.search,
      oninput: e => {
        state.search = e.target.value;
        if (searchTimer) clearTimeout(searchTimer);
        searchTimer = setTimeout(() => renderColumnsOnly(), 120);
      },
      onkeydown: e => {
        if (e.key === 'Enter') {
          renderColumnsOnly(true);
        }
      }
    }),
    el('button', { class: 'btn clear', type: 'button', onclick: () => { state.search = ''; renderColumnsOnly(); } }, 'Clear')
  );

  const reset = el(
    'button',
    {
      class: 'btn',
      type: 'button',
      onclick: () => {
        if (confirm('Reset all progress?')) {
          state.done = {};
          state.celebrated = false;
          localStorage.removeItem('eft-kappa-celebrated');
          saveProgress();
          render();
        }
      }
    },
    'Reset progress'
  );

  const collapseAll = el(
    'button',
    {
      class: 'btn',
      type: 'button',
      onclick: () => {
        const g = groups();
        const anyOpen = [...g.keys()].some(n => !state.collapsed[n]);
        for (const n of g.keys()) state.collapsed[n] = anyOpen;
        saveUI();
        renderColumnsOnly();
      }
    },
    'Collapse all'
  );

  const bar = el('div', { class: 'bar', id: 'eft-bar' }, traderLabel, sel, kappaOnly, showCompleted, searchBox, reset, collapseAll);

  const cols = el('div', { class: 'columns' }, el('div', { class: 'col', id: 'eft-col-L' }), el('div', { class: 'col', id: 'eft-col-R' }));

  refs.app.append(hero, err || document.createComment('noerr'), statsRow, bar, cols);

  if (state.loading) {
    const L = document.getElementById('eft-col-L');
    const R = document.getElementById('eft-col-R');
    for (let i = 0; i < 4; i++) {
      L.append(el('div', { class: 'skeleton' }));
      R.append(el('div', { class: 'skeleton' }));
    }
  } else {
    renderColumnsOnly();
  }

  requestAnimationFrame(positionSidebar);
  if (restoreSearch) {
    const sEl = document.getElementById('eft-search');
    if (sEl) {
      sEl.focus();
      try {
        sEl.setSelectionRange(restoreSearch.start, restoreSearch.end);
      } catch {}
    }
  }
}

function renderColumnsOnly(scrollToFirst = false) {
  const colsL = document.getElementById('eft-col-L');
  const colsR = document.getElementById('eft-col-R');
  if (!colsL || !colsR) return;

  colsL.innerHTML = '';
  colsR.innerHTML = '';

  const q = state.search.trim();
  const gmap = groups();

  const present = [...gmap.keys()];
  const { left, right } = buildColumnOrder(present);

  let firstMatchEl = null;

  function buildSection(name, list) {
    const doneCount = list.filter(t => state.done[t.id]).length;
    const collapse = q ? false : !!state.collapsed[name];
    const section = el('section', { class: 'section' + (collapse ? ' is-collapsed' : ''), 'data-trader': name });
    const toggle = el('div', { class: 'toggle', onclick: () => { state.collapsed[name] = !state.collapsed[name]; saveUI(); renderColumnsOnly(); } }, collapse ? '+' : '−');
    const head = el('div', { class: 'sec-head' }, el('div', { class: 'sec-left' }, toggle, el('div', { class: 'sec-title' }, name)), el('div', { class: 'sec-count' }, `${doneCount}/${list.length}`));

    const wrap = el('div', { class: 'task-wrap' });
    for (const t of list) {
      const def = isDefunct(t);
      const row = el('div', { class: 'task' + (state.done[t.id] ? ' done' : '') + (def ? ' defunct' : '') });
      const top = el('div', { class: 'task-row' });
      const cb = el('input', { type: 'checkbox', checked: !!state.done[t.id] });
      cb.addEventListener('change', e => {
        state.done[t.id] = e.target.checked;
        saveProgress();
        render();
      });

      const firstObj = t.objectives?.[0]?.description || '';
      const nameHtml = hi(t.name, q);
      const objHtml = hi(firstObj, q);

      const text = el('div', { style: 'flex:1;min-width:0;' }, el('div', { class: 't-name', html: nameHtml, title: t.name }), firstObj ? el('div', { class: 't-obj', html: objHtml }) : null);

      const badges = document.createDocumentFragment();
      if (t.kappaRequired) badges.append(el('span', { class: 't-kappa' }, 'Kappa'));
      if (def) badges.append(el('span', { class: 'badge-defunct', 'data-tip': 'Limited-time event quest — no longer completable' }, 'Defunct'));

      top.append(cb, text, badges);
      row.append(top);

      const tools = el('div', { class: 't-tools' });
      const detailsBtn = el(
        'button',
        {
          class: 'mini-btn',
          type: 'button',
          onclick: () => {
            const wrapEl = wrap;
            state.scrollByTrader[name] = wrapEl.scrollTop;
            state.openTask[t.id] = !state.openTask[t.id];
            saveUI();
            renderColumnsOnly();
            requestAnimationFrame(() => {
              wrapEl.scrollTop = state.scrollByTrader[name] || 0;
            });
          }
        },
        state.openTask[t.id] ? 'Hide details' : '▸ Details'
      );
      tools.append(detailsBtn);

      if (t.wikiLink) tools.append(el('a', { href: t.wikiLink, target: '_blank', rel: 'noreferrer noopener', class: 'mini-btn' }, 'Wiki'));
      row.append(tools);

      if (state.openTask[t.id]) {
        const details = el('div', { class: 'details' });
        if (t.objectives?.length) {
          const ul = el('ul', { style: 'margin:0; padding-left:18px;' });
          t.objectives.forEach(o => {
            if (o?.description) ul.append(el('li', {}, o.description));
          });
          details.append(ul);
        } else details.append(el('div', {}, 'No objective text available.'));
        row.append(details);
      }

      if (!firstMatchEl && q && (t.name.toLowerCase().includes(q.toLowerCase()) || firstObj.toLowerCase().includes(q.toLowerCase()))) {
        firstMatchEl = row;
      }

      wrap.append(row);
    }

    section.append(head, wrap);

    const saved = state.scrollByTrader[name];
    if (typeof saved === 'number') requestAnimationFrame(() => { wrap.scrollTop = saved; });

    return section;
  }

  if (!gmap.size) {
    const emptyMsg = el('div', { class: 'err' }, 'No tasks match the current filters.');
    colsL.append(emptyMsg.cloneNode(true));
    colsR.append(emptyMsg);
  } else {
    left.forEach(n => {
      if (gmap.has(n)) colsL.append(buildSection(n, gmap.get(n)));
    });
    right.forEach(n => {
      if (gmap.has(n)) colsR.append(buildSection(n, gmap.get(n)));
    });
  }

  if (scrollToFirst && firstMatchEl) {
    firstMatchEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  positionSidebar();
  maybeCelebrate();
}

let ticking = false;
function onScrollRaf() {
  if (!ticking) {
    ticking = true;
    requestAnimationFrame(() => {
      positionSidebar();
      ticking = false;
    });
  }
}

function cssGap() {
  const v = getComputedStyle(document.documentElement).getPropertyValue('--gap').trim();
  return parseFloat(v) || 24;
}

function positionSidebar() {
  const wrap = document.getElementById('eft-wrap');
  const barEl = document.getElementById('eft-bar');
  if (!wrap || !barEl || !refs.side) return;

  if (matchMedia('(max-width:1400px)').matches) {
    refs.side.style.position = 'static';
    refs.side.style.left = '';
    refs.side.style.top = '';
    refs.side.style.width = '';
    return;
  }

  refs.side.style.position = 'fixed';

  const g = cssGap();
  const wR = wrap.getBoundingClientRect();
  const sW = Math.round(wR.left - 2 * g);
  if (sW <= 140) {
    refs.side.style.position = 'static';
    refs.side.style.left = '';
    refs.side.style.top = '';
    refs.side.style.width = '';
    return;
  }

  refs.side.style.left = `${g}px`;
  refs.side.style.width = `${sW}px`;

  const bR = barEl.getBoundingClientRect();
  const vvY = window.visualViewport ? window.visualViewport.offsetTop : 0;
  let top = Math.round(bR.top + vvY);

  const pad = 16;
  const sH = refs.side.getBoundingClientRect().height;
  const maxTop = (window.innerHeight + vvY) - sH - pad;
  top = Math.max(pad, Math.min(top, maxTop));
  refs.side.style.top = `${top}px`;
}

function setupNav() {
  function toggleMenu(open) {
    refs.offcanvas.setAttribute('aria-hidden', String(!open));
    refs.burger.setAttribute('aria-expanded', String(open));
    if (open) {
      refs.offcanvasClose.focus();
      document.body.style.overflow = 'hidden';
    } else {
      refs.burger.focus();
      document.body.style.overflow = '';
    }
  }
  refs.burger?.addEventListener('click', () => toggleMenu(true));
  refs.offcanvasClose?.addEventListener('click', () => toggleMenu(false));
  refs.offcanvas?.addEventListener('click', e => {
    if (e.target === refs.offcanvas) toggleMenu(false);
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') toggleMenu(false);
  });
}

async function load(isRetry = false) {
  if (!isRetry) render();
  addEventListener('resize', positionSidebar, { passive: true });
  addEventListener('scroll', onScrollRaf, { passive: true });
  if (window.visualViewport) {
    visualViewport.addEventListener('resize', positionSidebar);
    visualViewport.addEventListener('scroll', positionSidebar);
  }

  const cached = getCache();
  if (cached && !isRetry) {
    state.tasks = cached.data || cached;
    state.extended = !!cached.extended;
    state.loading = false;
    render();
  }

  try {
    const res = await fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: EXT_QUERY }) });
    const json = await res.json();
    if (json.errors) throw new Error(json.errors.map(e => e.message).join('; '));
    state.tasks = json.data?.tasks || [];
    state.extended = true;
    setCache({ data: state.tasks, extended: true });
  } catch (e) {
    if (!state.tasks.length) {
      try {
        const res2 = await fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: BASIC_QUERY }) });
        const json2 = await res2.json();
        state.tasks = json2.data?.tasks || [];
        state.extended = false;
        setCache({ data: state.tasks, extended: false });
      } catch (e2) {
        if (!state.tasks.length) {
          state.error = String(e2?.message || e2 || e);
        }
      }
    }
  } finally {
    state.loading = false;
    render();
  }
}

function init() {
  initBackground();
  ensureShell();
  setupNav();
  load();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
