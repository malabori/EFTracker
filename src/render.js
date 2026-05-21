import { hi, topoSortByTrader, parsePartIndex, normalizeProgressPayload } from './lib.js';
import { el } from './dom.js';
import { state, refs, saveProgress, saveUI, CELEBRATED_KEY } from './state.js';
import { safeLocalStorageRemove, safeLocalStorageSet } from './storage.js';
import { fireConfetti } from './confetti.js';
import { mapsForTask, repRewardsForTask } from './recommendations.js';

const ORDER_ROWS = [
  ['Prapor', 'Therapist'],
  ['Fence', 'Skier'],
  ['Peacekeeper', 'Mechanic'],
  ['Ragman', 'Jaeger'],
  ['Ref', 'Lightkeeper'],
  ['BTR Driver', null]
];

function orderForTrader(list, name) {
  if (state.extended) return topoSortByTrader(list, name);
  return list.slice().sort((a, b) => {
    const ap = parsePartIndex(a.name);
    const bp = parsePartIndex(b.name);
    if (ap !== bp) return ap - bp;
    return a.name.localeCompare(b.name);
  });
}

// Cache the trader-grouped + topo-sorted view of state.tasks. This only
// changes when a new task payload arrives (state.tasks reference flips)
// or when we switch between extended/basic GraphQL data. Search,
// filters, and progress all just filter against this cached structure.
let orderedGroupsCache = { tasks: null, extended: null, byTrader: null };

function orderedGroups() {
  if (
    orderedGroupsCache.tasks === state.tasks &&
    orderedGroupsCache.extended === state.extended &&
    orderedGroupsCache.byTrader
  ) {
    return orderedGroupsCache.byTrader;
  }
  const byTrader = new Map();
  for (const t of state.tasks) {
    const trader = t.trader?.name || 'Unknown';
    if (!byTrader.has(trader)) byTrader.set(trader, []);
    byTrader.get(trader).push(t);
  }
  for (const [n, list] of byTrader) {
    byTrader.set(n, orderForTrader(list, n));
  }
  orderedGroupsCache = { tasks: state.tasks, extended: state.extended, byTrader };
  return byTrader;
}

function stats() {
  let done = 0;
  let kAll = 0;
  let kDone = 0;
  for (const t of state.tasks) {
    const isDone = !!state.done[t.id];
    if (isDone) done++;
    if (t.kappaRequired) {
      kAll++;
      if (isDone) kDone++;
    }
  }
  const total = state.tasks.length;
  const pct = total ? Math.round((done / total) * 100) : 0;
  return { total, done, kAll, kDone, pct };
}

function groups() {
  const q = state.search.trim().toLowerCase();
  const out = new Map();
  for (const [trader, list] of orderedGroups()) {
    if (state.traderFilter !== 'ALL' && state.traderFilter !== trader) continue;
    const filtered = [];
    for (const t of list) {
      if (state.kappaOnly && !t.kappaRequired) continue;
      if (!state.showCompleted && state.done[t.id]) continue;
      if (q) {
        const hit =
          t.name.toLowerCase().includes(q) ||
          (t.trader?.name || '').toLowerCase().includes(q) ||
          (t.objectives || []).some(o => o?.description?.toLowerCase().includes(q));
        if (!hit) continue;
      }
      filtered.push(t);
    }
    if (filtered.length) out.set(trader, filtered);
  }
  return out;
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

// Builds the level / xp / map / rep badge strip shown under each task
// name. Returns null when there is nothing worth showing so callers
// can skip appending an empty container.
function buildTaskMeta(t) {
  const badges = [];
  const lvl = t.minPlayerLevel;
  if (typeof lvl === 'number' && lvl > 0) {
    badges.push(el('span', { class: 't-badge t-lvl' }, `LVL ${lvl}`));
  }
  if (typeof t.experience === 'number' && t.experience > 0) {
    const xp =
      t.experience >= 1000 ? `${Math.round(t.experience / 100) / 10}k` : t.experience;
    badges.push(el('span', { class: 't-badge t-xp' }, `${xp} XP`));
  }
  const maps = mapsForTask(t, 3);
  for (const m of maps) {
    badges.push(el('span', { class: 't-badge t-map' }, m));
  }
  const reps = repRewardsForTask(t);
  for (const r of reps) {
    const sign = r.standing > 0 ? '+' : '';
    const cls = r.standing < 0 ? 't-badge t-rep neg' : 't-badge t-rep';
    badges.push(el('span', { class: cls }, `${sign}${r.standing} ${r.trader}`));
  }
  if (!badges.length) return null;
  return el('div', { class: 't-meta' }, ...badges);
}

function captureScroll() {
  refs.app?.querySelectorAll('.section .task-wrap').forEach(w => {
    const trader = w.closest('.section')?.getAttribute('data-trader');
    if (trader) state.scrollByTrader[trader] = w.scrollTop;
  });
}

let toastDismissTimer = null;

function hideToast() {
  refs.toast.classList.remove('show');
  if (toastDismissTimer) {
    clearTimeout(toastDismissTimer);
    toastDismissTimer = null;
  }
}

function showToast(msg, actions = [], { persistent = false, duration = 5000 } = {}) {
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
  if (toastDismissTimer) clearTimeout(toastDismissTimer);
  toastDismissTimer = persistent
    ? null
    : setTimeout(() => refs.toast.classList.remove('show'), duration);
}

function exportProgress() {
  const blob = new Blob([JSON.stringify(state.done, null, 2)], {
    type: 'application/json'
  });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `eftracker-progress-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function importProgress() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'application/json,.json';
  input.onchange = async e => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const normalized = normalizeProgressPayload(parsed);
      const added = Object.keys(normalized).filter(k => !state.done[k]).length;
      state.done = { ...state.done, ...normalized };
      state.celebrated = false;
      safeLocalStorageRemove(CELEBRATED_KEY);
      saveProgress();
      render();
      showToast(`Imported ${Object.keys(normalized).length} entries (${added} new).`);
    } catch (err) {
      showToast(`Import failed: ${err.message}`);
    }
  };
  input.click();
}

function maybeCelebrate() {
  const s = stats();
  if (s.kAll > 0 && s.kDone === s.kAll && !state.celebrated) {
    state.celebrated = true;
    safeLocalStorageSet(CELEBRATED_KEY, 'true');
    fireConfetti();
    showToast('Kappa requirements complete!', [
      { label: 'Export progress', onClick: exportProgress }
    ]);
  }
}

function updateStatsDOM() {
  const statsEl = document.getElementById('eft-stats');
  if (!statsEl) return;
  const s = stats();
  const nums = statsEl.querySelectorAll('.stat .num');
  if (nums[0]) nums[0].textContent = String(s.done);
  if (nums[1]) nums[1].textContent = String(s.total);
  if (nums[2]) nums[2].textContent = `${s.kDone}/${s.kAll}`;
  if (nums[3]) nums[3].textContent = `${s.pct}%`;
}

function updateSectionCountDOM(traderName) {
  if (!refs.app) return;
  const sections = refs.app.querySelectorAll('.section');
  let sec = null;
  for (const s of sections) {
    if (s.getAttribute('data-trader') === traderName) {
      sec = s;
      break;
    }
  }
  if (!sec) return;
  const list = groups().get(traderName);
  const countEl = sec.querySelector('.sec-count');
  if (!countEl) return;
  if (!list) {
    countEl.textContent = '0/0';
    return;
  }
  const done = list.reduce((n, t) => n + (state.done[t.id] ? 1 : 0), 0);
  countEl.textContent = `${done}/${list.length}`;
}

function updateTraderChipDOM(traderName) {
  const chip = document.querySelector(
    `.trader-chip[data-trader="${CSS.escape(traderName)}"]`
  );
  if (!chip) return;
  const list = orderedGroups().get(traderName);
  if (!list) return;
  const done = list.reduce((n, t) => n + (state.done[t.id] ? 1 : 0), 0);
  const num = chip.querySelector('.trader-chip-num');
  if (num) num.textContent = `${done}/${list.length}`;
}

function toggleTaskDone(task, traderName, rowEl, checked) {
  state.done[task.id] = checked;
  saveProgress();
  rowEl.classList.toggle('done', checked);
  if (checked && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    rowEl.classList.add('just-stamped');
    setTimeout(() => rowEl.classList.remove('just-stamped'), 600);
  }
  updateStatsDOM();
  updateSectionCountDOM(traderName);
  updateTraderChipDOM(traderName);
  if (!state.showCompleted && checked) {
    renderColumnsOnly();
  }
  maybeCelebrate();
}

let searchTimer = null;

export function render() {
  let restoreSearch = null;
  const active = document.activeElement;
  if (active && active.id === 'eft-search') {
    restoreSearch = {
      value: active.value,
      start: active.selectionStart,
      end: active.selectionEnd
    };
  }

  captureScroll();
  const s = stats();
  refs.app.innerHTML = '';

  const today = new Date().toISOString().slice(0, 10);
  const briefingNo = `BRIEFING #${today.replace(/-/g, '')}`;
  const heroMeta = el(
    'div',
    { class: 'meta' },
    el('span', {}, briefingNo),
    el('span', {}, state.extended ? 'FULL INTEL' : 'PARTIAL INTEL'),
    el('span', {}, state.loading ? 'DECRYPTING' : 'STATUS GREEN')
  );
  const hero = el(
    'div',
    { class: 'hero' },
    el('h1', {}, 'EFTRACKER'),
    el('div', { class: 'sub' }, 'TASK TRACKER SYSTEM // INTEL BRIEFING'),
    heroMeta
  );

  const err = state.error
    ? el(
        'div',
        { class: 'err' },
        el('strong', {}, 'Error: '),
        state.error,
        ' ',
        el(
          'button',
          {
            class: 'btn',
            onclick: () => {
              state.error = '';
              state.loading = true;
              window.dispatchEvent(new CustomEvent('eft:reload'));
            }
          },
          'Retry'
        )
      )
    : null;

  const statsRow = el(
    'div',
    { class: 'stats', id: 'eft-stats' },
    el(
      'div',
      { class: 'stat' },
      el('div', { class: 'num' }, String(s.done)),
      el('div', { class: 'lbl' }, 'COMPLETED')
    ),
    el(
      'div',
      { class: 'stat' },
      el('div', { class: 'num' }, String(s.total)),
      el('div', { class: 'lbl' }, 'TOTAL TASKS')
    ),
    el(
      'div',
      { class: 'stat' },
      el('div', { class: 'num' }, `${s.kDone}/${s.kAll}`),
      el('div', { class: 'lbl' }, 'KAPPA PROGRESS')
    ),
    el(
      'div',
      { class: 'stat' },
      el('div', { class: 'num' }, `${s.pct}%`),
      el('div', { class: 'lbl' }, 'COMPLETION')
    )
  );

  const allNames = [...new Set(state.tasks.map(t => t.trader?.name || 'Unknown'))];
  const ordAll = buildColumnOrder(allNames);
  const dropdown = ['ALL', ...ordAll.left, ...ordAll.right];

  const traderChips = el('div', {
    class: 'trader-stats',
    'aria-label': 'Progress by trader'
  });
  if (!state.loading) {
    const ordered = orderedGroups();
    for (const name of [...ordAll.left, ...ordAll.right]) {
      const list = ordered.get(name);
      if (!list || !list.length) continue;
      const done = list.reduce((n, t) => n + (state.done[t.id] ? 1 : 0), 0);
      traderChips.append(
        el(
          'span',
          { class: 'trader-chip', 'data-trader': name },
          el('span', { class: 'trader-chip-name' }, name),
          ' ',
          el('span', { class: 'trader-chip-num' }, `${done}/${list.length}`)
        )
      );
    }
  }

  const traderSelectId = 'eft-trader-filter';
  const sel = el('select', {
    id: traderSelectId,
    onchange: e => {
      state.traderFilter = e.target.value;
      renderColumnsOnly();
    }
  });
  dropdown.forEach(name =>
    sel.append(
      el(
        'option',
        { value: name, selected: state.traderFilter === name },
        name === 'ALL' ? 'ALL TRADERS' : name
      )
    )
  );
  const traderLabel = el('label', { for: traderSelectId, class: 'bar-label' }, 'Trader:');

  const kappaOnly = el(
    'label',
    {},
    el('input', {
      type: 'checkbox',
      checked: state.kappaOnly,
      onchange: e => {
        state.kappaOnly = e.target.checked;
        renderColumnsOnly();
      }
    }),
    ' Kappa only'
  );
  const showCompleted = el(
    'label',
    {},
    el('input', {
      type: 'checkbox',
      checked: state.showCompleted,
      onchange: e => {
        state.showCompleted = e.target.checked;
        renderColumnsOnly();
      }
    }),
    ' Show completed'
  );

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
        if (e.key === 'Enter') renderColumnsOnly(true);
      }
    }),
    el(
      'button',
      {
        class: 'btn clear',
        type: 'button',
        onclick: () => {
          state.search = '';
          renderColumnsOnly();
        }
      },
      'Clear'
    )
  );

  const reset = el(
    'button',
    {
      class: 'btn',
      type: 'button',
      onclick: () => {
        showToast(
          'Reset all progress?',
          [
            {
              label: 'Confirm',
              onClick: () => {
                hideToast();
                state.done = {};
                state.celebrated = false;
                safeLocalStorageRemove(CELEBRATED_KEY);
                saveProgress();
                render();
              }
            },
            { label: 'Cancel', onClick: hideToast }
          ],
          { persistent: true }
        );
      }
    },
    'Reset progress'
  );

  const importBtn = el(
    'button',
    { class: 'btn', type: 'button', onclick: importProgress },
    'Import'
  );

  const exportBtn = el(
    'button',
    { class: 'btn', type: 'button', onclick: exportProgress },
    'Export'
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

  const bar = el(
    'div',
    { class: 'bar', id: 'eft-bar' },
    traderLabel,
    sel,
    kappaOnly,
    showCompleted,
    searchBox,
    importBtn,
    exportBtn,
    reset,
    collapseAll
  );

  const cols = el(
    'div',
    { class: 'columns' },
    el('div', { class: 'col', id: 'eft-col-L' }),
    el('div', { class: 'col', id: 'eft-col-R' })
  );

  refs.app.append(
    hero,
    err || document.createComment('noerr'),
    statsRow,
    traderChips,
    bar,
    cols
  );

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

  if (restoreSearch) {
    const sEl = document.getElementById('eft-search');
    if (sEl) {
      sEl.focus();
      try {
        sEl.setSelectionRange(restoreSearch.start, restoreSearch.end);
      } catch {
        /* selection ranges aren't supported on every input type */
      }
    }
  }
}

export function renderColumnsOnly(scrollToFirst = false) {
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
    const section = el('section', {
      class: 'section' + (collapse ? ' is-collapsed' : ''),
      'data-trader': name
    });
    const toggle = el(
      'div',
      {
        class: 'toggle',
        onclick: () => {
          state.collapsed[name] = !state.collapsed[name];
          saveUI();
          renderColumnsOnly();
        }
      },
      collapse ? '+' : '−'
    );
    const head = el(
      'div',
      { class: 'sec-head' },
      el('div', { class: 'sec-left' }, toggle, el('div', { class: 'sec-title' }, name)),
      el('div', { class: 'sec-count' }, `${doneCount}/${list.length}`)
    );

    const wrap = el('ul', { class: 'task-wrap', role: 'list' });
    for (const t of list) {
      const row = el('li', { class: 'task' + (state.done[t.id] ? ' done' : '') });
      const top = el('div', { class: 'task-row' });
      const cb = el('input', { type: 'checkbox', checked: !!state.done[t.id] });
      cb.addEventListener('change', e => toggleTaskDone(t, name, row, e.target.checked));

      const firstObj = t.objectives?.[0]?.description || '';
      const nameHtml = hi(t.name, q);
      const objHtml = hi(firstObj, q);

      const meta = buildTaskMeta(t);
      const text = el(
        'div',
        { style: 'flex:1;min-width:0;' },
        el('div', { class: 't-name', html: nameHtml, title: t.name }),
        firstObj ? el('div', { class: 't-obj', html: objHtml }) : null,
        meta
      );

      const badges = document.createDocumentFragment();
      if (t.kappaRequired) badges.append(el('span', { class: 't-kappa' }, 'Kappa'));

      top.append(cb, text, badges);
      row.append(top);

      const tools = el('div', { class: 't-tools' });
      const detailsBtn = el(
        'button',
        {
          class: 'mini-btn',
          type: 'button',
          onclick: () => {
            state.scrollByTrader[name] = wrap.scrollTop;
            state.openTask[t.id] = !state.openTask[t.id];
            saveUI();
            renderColumnsOnly();
            requestAnimationFrame(() => {
              wrap.scrollTop = state.scrollByTrader[name] || 0;
            });
          }
        },
        state.openTask[t.id] ? 'Hide details' : '▸ Details'
      );
      tools.append(detailsBtn);

      if (t.wikiLink) {
        tools.append(
          el(
            'a',
            {
              href: t.wikiLink,
              target: '_blank',
              rel: 'noreferrer noopener',
              class: 'mini-btn'
            },
            'Wiki'
          )
        );
      }
      row.append(tools);

      if (state.openTask[t.id]) {
        const details = el('div', { class: 'details' });
        if (t.objectives?.length) {
          const ul = el('ul', { style: 'margin:0; padding-left:18px;' });
          t.objectives.forEach(o => {
            if (o?.description) ul.append(el('li', {}, o.description));
          });
          details.append(ul);
        } else {
          details.append(el('div', {}, 'No objective text available.'));
        }
        row.append(details);
      }

      if (
        !firstMatchEl &&
        q &&
        (t.name.toLowerCase().includes(q.toLowerCase()) ||
          firstObj.toLowerCase().includes(q.toLowerCase()))
      ) {
        firstMatchEl = row;
      }

      wrap.append(row);
    }

    section.append(head, wrap);

    const saved = state.scrollByTrader[name];
    if (typeof saved === 'number') {
      requestAnimationFrame(() => {
        wrap.scrollTop = saved;
      });
    }

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

  maybeCelebrate();
}
