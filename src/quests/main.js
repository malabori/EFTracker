// Quest board page: wires data, progress, settings and the DOM together.
import { $ } from '../shared/html.js';
import {
  getSettings,
  updateSettings,
  MODE_LABELS,
  MAX_LEVEL
} from '../shared/settings.js';
import { readJson, writeJson } from '../shared/storage.js';
import { setupCrtToggle, startRaidClocks } from '../shared/chrome.js';
import { shortDate, timeAgo } from '../shared/format.js';
import {
  TABS,
  buildCatalog,
  evaluate,
  filterTasks,
  groupByTrader,
  normalizeQuery,
  summarize
} from './model.js';
import {
  REFRESH_AFTER_MS,
  fetchLiveTasks,
  loadSnapshot,
  readCachedTasks
} from './data.js';
import {
  exportPayload,
  loadProgress,
  mergeProgress,
  modeBucket,
  parseImport,
  saveProgress,
  setObjectiveDone,
  setQuestDone
} from './progress.js';
import {
  detailHtml,
  emptyListHtml,
  listHtml,
  skeletonHtml,
  summaryHtml,
  tabLabel
} from './view.js';

const UI_KEY = 'eftracking.ui.v1';

function loadUi() {
  const saved = readJson(UI_KEY) || {};
  return {
    tab: TABS.includes(saved.tab) ? saved.tab : 'available',
    trader: typeof saved.trader === 'string' ? saved.trader : '',
    map: typeof saved.map === 'string' ? saved.map : '',
    kappa: saved.kappa === true,
    lightkeeper: saved.lightkeeper === true,
    collapsed:
      saved.collapsed && typeof saved.collapsed === 'object' ? saved.collapsed : {},
    selected: typeof saved.selected === 'string' ? saved.selected : null
  };
}

const state = {
  settings: getSettings(),
  progress: loadProgress(),
  ui: loadUi(),
  query: '',
  catalog: null,
  statuses: new Map(),
  summary: null,
  data: {
    mode: null,
    source: null,
    savedAt: null,
    loading: true,
    refreshing: false,
    error: null
  }
};

const el = {
  mode: $('[data-setting="mode"]'),
  faction: $('[data-setting="faction"]'),
  level: $('#level-input'),
  hint: $('#profile-hint'),
  status: $('#data-status'),
  statusText: $('#data-status-text'),
  refresh: $('#refresh-btn'),
  summary: $('#summary'),
  search: $('#search'),
  tabs: $('#tabs'),
  trader: $('#trader-filter'),
  map: $('#map-filter'),
  flags: $('#flag-filters'),
  clear: $('#clear-filters'),
  list: $('#quest-list'),
  detail: $('#detail'),
  backdrop: $('#sheet-backdrop'),
  toast: $('#toast'),
  toastText: $('#toast-text'),
  toastAction: $('#toast-action'),
  importFile: $('#import-file'),
  reset: $('#reset-btn')
};

const narrowScreen = matchMedia('(max-width: 900px)');
const bucket = () => modeBucket(state.progress, state.settings.mode);
const saveUi = () => writeJson(UI_KEY, state.ui);
const persistProgress = () => saveProgress(state.progress);
const hasFilters = () =>
  Boolean(
    state.query.trim() ||
    state.ui.trader ||
    state.ui.map ||
    state.ui.kappa ||
    state.ui.lightkeeper
  );

function debounce(fn, ms) {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

// ---------------------------------------------------------------- derive

function recompute() {
  if (!state.catalog) return;
  const { faction, level } = state.settings;
  state.statuses = evaluate(state.catalog, { done: bucket().tasks, faction, level });
  state.summary = summarize(state.catalog, state.statuses, faction);
}

function viewContext() {
  const c = state.catalog;
  return {
    byId: c.byId,
    unlocks: c.unlocks,
    traderImages: c.traderImages,
    hasMapData: c.maps.length > 0,
    statuses: state.statuses,
    summary: state.summary,
    bucket: bucket(),
    query: normalizeQuery(state.query),
    faction: state.settings.faction,
    level: state.settings.level,
    selectedId: state.ui.selected,
    collapsed: state.ui.collapsed
  };
}

// ---------------------------------------------------------------- render

const FOCUSABLE =
  '[data-action="toggle"],[data-action="open"],[data-action="collapse"],[data-action="objective"],[data-action="close-detail"]';

// Re-rendering replaces the elements, so put keyboard focus back on the same
// control (or whatever took its place) afterwards.
function keepFocus(container, render) {
  const active = document.activeElement;
  let selector = null;
  let index = -1;
  if (
    active &&
    active !== container &&
    container.contains(active) &&
    active.dataset.action
  ) {
    const { action, id, trader } = active.dataset;
    if (id) selector = `[data-action="${action}"][data-id="${CSS.escape(id)}"]`;
    else if (trader)
      selector = `[data-action="${action}"][data-trader="${CSS.escape(trader)}"]`;
    index = [...container.querySelectorAll(FOCUSABLE)].indexOf(active);
  }
  render();
  if (!selector && index < 0) return;
  const candidates = [...container.querySelectorAll(FOCUSABLE)];
  const target =
    (selector && container.querySelector(selector)) ||
    candidates[Math.min(index, candidates.length - 1)];
  (target || container).focus({ preventScroll: true });
}

function renderOperator() {
  for (const btn of el.mode.querySelectorAll('button')) {
    btn.setAttribute('aria-pressed', String(btn.dataset.value === state.settings.mode));
  }
  for (const btn of el.faction.querySelectorAll('button')) {
    btn.setAttribute(
      'aria-pressed',
      String(btn.dataset.value === state.settings.faction)
    );
  }
  if (document.activeElement !== el.level) el.level.value = state.settings.level ?? '';

  let hint = '';
  const hasFactionQuests = state.catalog?.tasks.some(t => t.faction !== 'Any');
  if (!state.settings.faction && hasFactionQuests) {
    hint =
      'Pick BEAR or USEC to hide the other faction’s quests and get exact Kappa totals.';
  } else if (state.settings.level == null) {
    hint = 'Set your level to see which quests you can take right now.';
  }
  el.hint.textContent = hint;
  el.hint.hidden = !hint;
}

function renderStatus() {
  const d = state.data;
  const mode = MODE_LABELS[state.settings.mode];
  let text;
  let tone;
  if (!state.catalog && d.loading) {
    text = `Loading ${mode} quests from tarkov.dev…`;
    tone = 'busy';
  } else if (!state.catalog) {
    text = `Couldn’t reach tarkov.dev (${d.error || 'unknown error'}).`;
    tone = 'error';
  } else if (d.source === 'snapshot') {
    const otherMode = d.snapshotMode && d.snapshotMode !== state.settings.mode;
    text = `tarkov.dev is unreachable — showing the built-in copy from ${shortDate(d.savedAt)}${
      otherMode ? ` (${MODE_LABELS[d.snapshotMode]} data)` : ''
    }.`;
    tone = 'warn';
  } else if (d.refreshing) {
    text = `${mode} data from ${timeAgo(d.savedAt)} · checking for updates…`;
    tone = 'busy';
  } else if (d.error) {
    text = `Offline — showing ${mode} data saved ${timeAgo(d.savedAt)}.`;
    tone = 'warn';
  } else if (d.limited) {
    // tarkov.dev rejected the full query (its schema changed), so a simpler
    // one was used: progress works, but factions/maps/prerequisites may be missing.
    text = `${mode} data from tarkov.dev (limited detail) · updated ${timeAgo(d.savedAt)}`;
    tone = 'warn';
  } else {
    text = `${mode} data from tarkov.dev · updated ${timeAgo(d.savedAt)}`;
    tone = 'ok';
  }
  el.statusText.textContent = text;
  el.status.dataset.tone = tone;
  el.refresh.disabled = d.refreshing || (d.loading && !state.catalog);
  el.refresh.textContent = state.catalog ? 'Refresh' : 'Retry';
}

function renderSummary() {
  el.summary.innerHTML = state.summary
    ? summaryHtml(state.summary)
    : '<div class="stat is-loading"></div>'.repeat(4);
}

let optionsFor = null;
function renderFilterOptions() {
  if (optionsFor === state.catalog) return;
  optionsFor = state.catalog;
  const option = (value, label) => {
    const o = document.createElement('option');
    o.value = value;
    o.textContent = label;
    return o;
  };
  el.trader.replaceChildren(
    option('', 'All traders'),
    ...state.catalog.traders.map(t => option(t, t))
  );
  el.map.replaceChildren(
    option('', 'All maps'),
    ...state.catalog.maps.map(m => option(m, m))
  );
  el.map.hidden = state.catalog.maps.length === 0;
}

function renderFilters(counts) {
  for (const btn of el.tabs.querySelectorAll('button')) {
    btn.innerHTML = tabLabel(btn.dataset.tab, counts[btn.dataset.tab] || 0);
    btn.setAttribute('aria-pressed', String(btn.dataset.tab === state.ui.tab));
  }
  el.trader.value = state.ui.trader;
  el.map.value = state.ui.map;
  for (const btn of el.flags.querySelectorAll('button')) {
    btn.setAttribute('aria-pressed', String(Boolean(state.ui[btn.dataset.flag])));
  }
  el.clear.hidden = !hasFilters();
}

function renderList() {
  if (!state.catalog) {
    el.list.innerHTML = state.data.loading
      ? skeletonHtml()
      : '<div class="empty"><p>Quests couldn’t be loaded. Check your connection, then press Retry above.</p></div>';
    return;
  }
  renderFilterOptions();
  const filters = { ...state.ui, query: state.query };
  const { list, counts } = filterTasks(
    state.catalog,
    state.statuses,
    filters,
    state.settings.faction
  );
  renderFilters(counts);
  const groups = groupByTrader(list);
  keepFocus(el.list, () => {
    el.list.innerHTML = groups.length
      ? listHtml(groups, viewContext())
      : emptyListHtml(state.ui.tab, counts, hasFilters());
  });
}

function renderDetail() {
  const task =
    state.catalog && state.ui.selected ? state.catalog.byId.get(state.ui.selected) : null;
  keepFocus(el.detail, () => {
    el.detail.innerHTML = state.catalog ? detailHtml(task, viewContext()) : '';
  });
  if (!task) closeSheet({ restoreFocus: false });
}

function renderAll() {
  recompute();
  renderOperator();
  renderStatus();
  renderSummary();
  renderList();
  renderDetail();
}

function afterProgressChange() {
  persistProgress();
  recompute();
  renderSummary();
  renderList();
  renderDetail();
  celebrateKappa();
}

// ---------------------------------------------------------------- toast

let toastTimer = null;
function showToast(message, action) {
  el.toastText.textContent = message;
  el.toastAction.hidden = !action;
  el.toastAction.textContent = action ? action.label : '';
  el.toastAction.onclick = action
    ? () => {
        hideToast();
        action.run();
      }
    : null;
  el.toast.classList.add('is-visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(hideToast, action ? 6000 : 4000);
}

function hideToast() {
  el.toast.classList.remove('is-visible');
}

function celebrateKappa() {
  if (!state.summary) return;
  const b = bucket();
  const { kappa } = state.summary;
  const complete = kappa.total > 0 && kappa.done === kappa.total;
  if (complete && !b.kappaCelebrated) {
    b.kappaCelebrated = true;
    persistProgress();
    showToast('Every Kappa-required quest is complete. Enjoy the container.');
  } else if (!complete && b.kappaCelebrated) {
    delete b.kappaCelebrated;
    persistProgress();
  }
}

// ---------------------------------------------------------------- detail sheet (narrow screens)

function openSheet() {
  if (!narrowScreen.matches) return;
  el.detail.classList.add('is-open');
  el.backdrop.hidden = false;
  document.body.classList.add('sheet-open');
  $('#detail-title', el.detail)?.focus();
}

function closeSheet({ restoreFocus = true } = {}) {
  if (!el.detail.classList.contains('is-open')) return;
  el.detail.classList.remove('is-open');
  el.backdrop.hidden = true;
  document.body.classList.remove('sheet-open');
  if (restoreFocus && state.ui.selected) {
    el.list
      .querySelector(`[data-action="open"][data-id="${CSS.escape(state.ui.selected)}"]`)
      ?.focus();
  }
}

// ---------------------------------------------------------------- actions

function openQuest(id, { fromDetail = false } = {}) {
  if (!state.catalog?.byId.has(id)) return;
  state.ui.selected = id;
  saveUi();
  for (const row of el.list.querySelectorAll('.quest[aria-current]'))
    row.removeAttribute('aria-current');
  el.list
    .querySelector(`.quest[data-id="${CSS.escape(id)}"]`)
    ?.setAttribute('aria-current', 'true');
  renderDetail();
  if (narrowScreen.matches) openSheet();
  else if (fromDetail) $('#detail-title', el.detail)?.focus();
}

function toggleQuest(id, done) {
  const task = state.catalog?.byId.get(id);
  if (!task) return;
  const b = bucket();
  const wasDone = Boolean(b.tasks[id]);
  if (wasDone === done) return;
  setQuestDone(b, task, done);
  afterProgressChange();
  showToast(done ? `Completed: ${task.name}` : `Marked not complete: ${task.name}`, {
    label: 'Undo',
    run: () => {
      setQuestDone(b, task, wasDone);
      afterProgressChange();
    }
  });
}

function toggleObjective(taskId, objectiveId, done) {
  const task = state.catalog?.byId.get(taskId);
  if (!task) return;
  const result = setObjectiveDone(bucket(), task, objectiveId, done);
  afterProgressChange();
  if (result === 'completed')
    showToast(`All objectives done — ${task.name} marked complete.`);
  else if (result === 'reopened') showToast(`${task.name} is no longer marked complete.`);
}

function setFilter(patch) {
  Object.assign(state.ui, patch);
  saveUi();
  renderList();
}

function clearFilters() {
  state.query = '';
  el.search.value = '';
  setFilter({ trader: '', map: '', kappa: false, lightkeeper: false });
}

function setLevel(value) {
  const level = value === '' || value == null ? null : Number(value);
  if (level === state.settings.level) return;
  state.settings = updateSettings({ level });
  renderAll();
}

function exportProgress() {
  const blob = new Blob([JSON.stringify(exportPayload(state.progress), null, 2)], {
    type: 'application/json'
  });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `eftracking-progress-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
  showToast('Progress exported. Import the file on another device to carry it over.');
}

async function importProgress(file) {
  try {
    const incoming = parseImport(JSON.parse(await file.text()));
    const added = mergeProgress(state.progress, incoming);
    afterProgressChange();
    const modes = Object.keys(incoming.modes)
      .map(m => MODE_LABELS[m] || m)
      .join(' + ');
    showToast(
      `Imported ${modes} progress: ${added} newly completed quest${added === 1 ? '' : 's'}.`
    );
  } catch (e) {
    showToast(e instanceof SyntaxError ? 'That file isn’t valid JSON.' : e.message);
  }
}

// Two clicks to reset (no confirm() dialog, which browsers may block inside the
// frame on eftracking.com), and an Undo afterwards.
let resetTimer = null;
function disarmReset() {
  clearTimeout(resetTimer);
  resetTimer = null;
  el.reset.textContent = 'Reset progress';
  el.reset.classList.remove('is-armed');
}

function resetProgress() {
  const mode = state.settings.mode;
  if (!resetTimer) {
    el.reset.textContent = `Click again to erase ${MODE_LABELS[mode]} progress`;
    el.reset.classList.add('is-armed');
    resetTimer = setTimeout(disarmReset, 5000);
    return;
  }
  disarmReset();
  const before = state.progress.modes[mode];
  delete state.progress.modes[mode];
  afterProgressChange();
  showToast(`${MODE_LABELS[mode]} progress reset.`, {
    label: 'Undo',
    run: () => {
      if (before) state.progress.modes[mode] = before;
      afterProgressChange();
    }
  });
}

// eftracking.com (WordPress) shows this page in a frame and passes along the
// progress its old version saved on that domain (see src/main.js). It's
// accepted from eftracking.com only, and only the first time.
const EMBED_HOSTS = ['eftracking.com', 'www.eftracking.com'];
const LOCAL_DEV = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);

function takeLegacyHandoff(e) {
  if (e.source !== window.parent || e.data?.type !== 'eftracking:legacy-progress') return;
  let host = '';
  try {
    host = new URL(e.origin).hostname;
  } catch {}
  const trusted =
    (e.origin.startsWith('https://') && EMBED_HOSTS.includes(host)) || LOCAL_DEV;
  if (!trusted || state.progress.legacyHandoff) return;
  state.progress.legacyHandoff = true;
  let added = 0;
  try {
    added = mergeProgress(state.progress, parseImport(JSON.parse(e.data.data)));
  } catch {}
  afterProgressChange();
  if (added) {
    showToast(
      `Brought over ${added} completed quest${added === 1 ? '' : 's'} from the old site.`
    );
  }
}

// ---------------------------------------------------------------- data

let loadToken = 0;

function applyTasks(rawTasks, mode, meta) {
  state.catalog = buildCatalog(rawTasks);
  state.data = { ...state.data, ...meta, mode, loading: false, refreshing: false };
  const c = state.catalog;
  if (state.ui.selected && !c.byId.has(state.ui.selected)) state.ui.selected = null;
  if (state.ui.trader && !c.traders.includes(state.ui.trader)) state.ui.trader = '';
  if (state.ui.map && !c.maps.includes(state.ui.map)) state.ui.map = '';
  renderAll();
}

async function loadData({ force = false } = {}) {
  const token = ++loadToken;
  const mode = state.settings.mode;
  if (state.data.mode !== mode) {
    state.catalog = null;
    state.summary = null;
    state.statuses = new Map();
    state.data = { mode: null, loading: true, refreshing: false, error: null };
  }

  const cached = !state.catalog ? readCachedTasks(mode) : null;
  if (cached)
    applyTasks(cached.tasks, mode, {
      source: 'cache',
      savedAt: cached.savedAt,
      limited: Boolean(cached.limited),
      error: null
    });
  const savedAt = state.catalog ? new Date(state.data.savedAt).getTime() : 0;
  if (!force && state.catalog && Date.now() - savedAt < REFRESH_AFTER_MS) return;

  state.data.refreshing = Boolean(state.catalog);
  if (state.catalog) renderStatus();
  else renderAll();
  try {
    const live = await fetchLiveTasks(mode);
    if (token !== loadToken) return;
    applyTasks(live.tasks, mode, {
      source: 'live',
      savedAt: live.savedAt,
      limited: live.limited,
      error: null
    });
  } catch (e) {
    if (token !== loadToken) return;
    if (state.catalog && state.data.source !== 'snapshot') {
      state.data = { ...state.data, refreshing: false, error: e.message };
      renderStatus();
      if (force) showToast(`Couldn’t refresh: ${e.message}`);
      return;
    }
    const snapshot = await loadSnapshot(mode);
    if (token !== loadToken) return;
    if (force) showToast(`Still can’t reach tarkov.dev: ${e.message}`);
    if (snapshot) {
      applyTasks(snapshot.tasks, mode, {
        source: 'snapshot',
        savedAt: snapshot.savedAt,
        snapshotMode: snapshot.mode,
        limited: false,
        error: e.message
      });
    } else {
      state.data = { mode, loading: false, refreshing: false, error: e.message };
      renderAll();
    }
  }
}

// ---------------------------------------------------------------- events

function bindEvents() {
  el.mode.addEventListener('click', e => {
    const mode = e.target.closest('button')?.dataset.value;
    if (!mode || mode === state.settings.mode) return;
    state.settings = updateSettings({ mode });
    renderOperator();
    loadData();
  });

  el.faction.addEventListener('click', e => {
    const faction = e.target.closest('button')?.dataset.value;
    if (!faction || faction === state.settings.faction) return;
    state.settings = updateSettings({ faction });
    renderAll();
  });

  const levelFromInput = () => setLevel(el.level.value.trim());
  el.level.addEventListener('input', debounce(levelFromInput, 350));
  el.level.addEventListener('change', levelFromInput);
  document.querySelectorAll('[data-level-step]').forEach(btn =>
    btn.addEventListener('click', () => {
      const current = state.settings.level ?? 0;
      const next = Math.min(
        MAX_LEVEL,
        Math.max(1, current + Number(btn.dataset.levelStep))
      );
      setLevel(next);
      el.level.value = next;
    })
  );

  el.refresh.addEventListener('click', () => loadData({ force: true }));

  el.search.addEventListener(
    'input',
    debounce(() => {
      state.query = el.search.value;
      renderList();
    }, 80)
  );
  el.tabs.addEventListener('click', e => {
    const tab = e.target.closest('button')?.dataset.tab;
    if (tab) setFilter({ tab });
  });
  el.trader.addEventListener('change', () => setFilter({ trader: el.trader.value }));
  el.map.addEventListener('change', () => setFilter({ map: el.map.value }));
  el.flags.addEventListener('click', e => {
    const flag = e.target.closest('button')?.dataset.flag;
    if (flag) setFilter({ [flag]: !state.ui[flag] });
  });
  el.clear.addEventListener('click', clearFilters);

  el.list.addEventListener('click', e => {
    const target = e.target.closest('[data-action]');
    const action = target?.dataset.action;
    if (action === 'open') openQuest(target.dataset.id);
    else if (action === 'clear-filters') clearFilters();
    else if (action === 'collapse') {
      const { trader } = target.dataset;
      if (state.ui.collapsed[trader]) delete state.ui.collapsed[trader];
      else state.ui.collapsed[trader] = true;
      saveUi();
      renderList();
    }
  });
  el.list.addEventListener('change', e => {
    const box = e.target.closest('[data-action="toggle"]');
    if (box) toggleQuest(box.dataset.id, box.checked);
  });

  el.detail.addEventListener('click', e => {
    const target = e.target.closest('[data-action]');
    const action = target?.dataset.action;
    if (action === 'toggle')
      toggleQuest(target.dataset.id, !bucket().tasks[target.dataset.id]);
    else if (action === 'open') openQuest(target.dataset.id, { fromDetail: true });
    else if (action === 'close-detail') closeSheet();
  });
  el.detail.addEventListener('change', e => {
    const box = e.target.closest('[data-action="objective"]');
    if (box) toggleObjective(box.dataset.task, box.dataset.id, box.checked);
  });
  el.backdrop.addEventListener('click', () => closeSheet());
  narrowScreen.addEventListener('change', () => closeSheet({ restoreFocus: false }));

  $('#export-btn').addEventListener('click', exportProgress);
  $('#import-btn').addEventListener('click', () => el.importFile.click());
  el.importFile.addEventListener('change', () => {
    const file = el.importFile.files?.[0];
    el.importFile.value = '';
    if (file) importProgress(file);
  });
  el.reset.addEventListener('click', resetProgress);
  window.addEventListener('message', takeLegacyHandoff);

  document.addEventListener('keydown', e => {
    const typing = e.target.closest?.(
      'input, textarea, select, [contenteditable="true"]'
    );
    if (e.key === '/' && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      el.search.focus();
      el.search.select();
    } else if (e.key === 'Escape' && el.detail.classList.contains('is-open')) {
      closeSheet();
    }
  });

  // Keep "updated N min ago" honest, and refresh data left open for hours.
  setInterval(renderStatus, 60_000);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden || !state.catalog || state.data.refreshing) return;
    if (Date.now() - new Date(state.data.savedAt).getTime() > REFRESH_AFTER_MS)
      loadData();
  });
}

bindEvents();
startRaidClocks();
setupCrtToggle($('#crt-toggle'));
renderAll();
loadData();
