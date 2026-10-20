// Flea prices page: search tarkov.dev items and compare flea vs trader prices.
import { $, esc } from '../shared/html.js';
import { getSettings, updateSettings, MODE_LABELS } from '../shared/settings.js';
import { readJson, writeJson } from '../shared/storage.js';
import { setupBackdrop, startRaidClocks } from '../shared/chrome.js';
import { rub, timeAgo } from '../shared/format.js';
import { SORT_KEYS, normalizeItem, sortItems } from './model.js';
import { searchItems } from './data.js';

const UI_KEY = 'eftracking.flea.v1';
const MIN_QUERY = 2;

const saved = readJson(UI_KEY) || readJson('eft_flea_state_v1') || {};
const state = {
  settings: getSettings(),
  query: typeof saved.query === 'string' ? saved.query : '',
  sort: saved.sort in SORT_KEYS ? saved.sort : 'relevance',
  items: [],
  status: 'idle',
  error: null,
  fetchedAt: null
};
const results = new Map(); // "mode|query" -> { items, fetchedAt }

const el = {
  form: $('#search-form'),
  search: $('#search'),
  mode: $('[data-setting="mode"]'),
  sort: $('#sort'),
  chips: $('#quick-chips'),
  status: $('#data-status'),
  statusText: $('#data-status-text'),
  retry: $('#retry-btn'),
  results: $('#results')
};

const saveUi = () => writeJson(UI_KEY, { query: state.query, sort: state.sort });

function renderStatus() {
  const mode = MODE_LABELS[state.settings.mode];
  const s = state.status;
  const n = state.items.length;
  el.status.dataset.tone = { idle: 'ok', loading: 'busy', done: 'ok', error: 'error' }[s];
  el.statusText.textContent =
    s === 'idle'
      ? `Type at least ${MIN_QUERY} letters to look up ${mode} prices.`
      : s === 'loading'
        ? `Searching the ${mode} flea market…`
        : s === 'error'
          ? `Couldn’t reach tarkov.dev (${state.error}).`
          : `${n} item${n === 1 ? '' : 's'} · ${mode} prices from tarkov.dev · fetched ${timeAgo(state.fetchedAt)}`;
  el.retry.hidden = s !== 'error';
}

function links(item) {
  const out = [];
  if (item.wikiLink) {
    out.push(
      `<a href="${esc(item.wikiLink)}" target="_blank" rel="noopener noreferrer">Wiki</a>`
    );
  }
  if (item.slug) {
    out.push(
      `<a href="https://tarkov.dev/item/${esc(encodeURIComponent(item.slug))}" target="_blank" rel="noopener noreferrer">tarkov.dev</a>`
    );
  }
  return out.join(' · ');
}

// Each cell is a main figure with a quieter line of context under it.
const cell = (label, main, sub = '') =>
  `<td data-label="${label}"><span class="cell-main">${main}</span>${sub ? `<span class="cell-sub">${sub}</span>` : ''}</td>`;

function rowHtml(item) {
  const change =
    item.change48h == null
      ? ''
      : `<span class="change ${item.change48h >= 0 ? 'up' : 'down'}">${item.change48h > 0 ? '+' : ''}${item.change48h.toFixed(1)}% in 48h</span>`;
  const range =
    item.low24h || item.high24h ? `${rub(item.low24h)} – ${rub(item.high24h)}` : '';
  const sellTo =
    item.sellTo === 'flea'
      ? '<span class="sell-to is-flea">Flea</span>'
      : item.sellTo === 'trader'
        ? `<span class="sell-to">${esc(item.bestTrader.vendor)}</span>`
        : '—';
  const linkHtml = links(item);
  return `<tr>
    <td class="item-cell">
      <span class="item-icon">${item.icon ? `<img src="${esc(item.icon)}" alt="" width="48" height="48" loading="lazy" decoding="async" onerror="this.remove()">` : ''}</span>
      <span class="item-text">
        <span class="item-name">${esc(item.name)}</span>
        <span class="item-meta">${esc(item.shortName)}${linkHtml ? ` · ${linkHtml}` : ''}</span>
      </span>
    </td>
    ${
      item.noFlea
        ? cell('Flea (lowest)', '<span class="muted">Not sellable on flea</span>')
        : cell(
            'Flea (lowest)',
            rub(item.flea),
            item.updated ? esc(`updated ${timeAgo(item.updated)}`) : ''
          )
    }
    ${cell('24h average', rub(item.avg24h), [change, range].filter(Boolean).join(' · '))}
    ${item.bestTrader ? cell('Best trader', rub(item.bestTrader.price), esc(item.bestTrader.vendor)) : cell('Best trader', '—')}
    ${cell('Sell to', sellTo)}
    ${cell('Per slot', rub(item.perSlot), item.slots > 1 ? `${item.slots} slots` : '')}
  </tr>`;
}

function renderResults() {
  if (state.status === 'idle') {
    el.results.innerHTML =
      '<div class="empty"><p>Search for an item to see its flea price, 24-hour trend, best trader offer and value per inventory slot.</p></div>';
    return;
  }
  if (state.status === 'loading' && !state.items.length) {
    el.results.innerHTML = '<div class="empty"><p>Searching…</p></div>';
    return;
  }
  if (state.status === 'error') {
    el.results.innerHTML =
      '<div class="empty"><p>Prices couldn’t be loaded. Check your connection and try again.</p></div>';
    return;
  }
  if (!state.items.length) {
    el.results.innerHTML = `<div class="empty"><p>No items match “${esc(state.query)}”.</p></div>`;
    return;
  }
  el.results.innerHTML = `<div class="table-wrap">
      <table class="price-table">
        <thead><tr>
          <th scope="col">Item</th><th scope="col">Flea (lowest)</th><th scope="col">24h average</th>
          <th scope="col">Best trader</th><th scope="col">Sell to</th><th scope="col">Per slot</th>
        </tr></thead>
        <tbody>${sortItems(state.items, state.sort).map(rowHtml).join('')}</tbody>
      </table>
    </div>
    <p class="table-note">Flea prices are the current lowest listing, before the flea market fee. “Sell to” compares that with the best trader offer; “Per slot” uses the better of the two.</p>`;
}

function render() {
  for (const btn of el.mode.querySelectorAll('button')) {
    btn.setAttribute('aria-pressed', String(btn.dataset.value === state.settings.mode));
  }
  el.sort.value = state.sort;
  renderStatus();
  renderResults();
}

let token = 0;
async function runSearch({ force = false } = {}) {
  const query = state.query.trim();
  if (query.length < MIN_QUERY) {
    token++;
    Object.assign(state, { items: [], status: 'idle', error: null });
    render();
    return;
  }
  const key = `${state.settings.mode}|${query.toLowerCase()}`;
  const hit = !force && results.get(key);
  if (hit) {
    Object.assign(state, {
      items: hit.items,
      fetchedAt: hit.fetchedAt,
      status: 'done',
      error: null
    });
    render();
    return;
  }
  const mine = ++token;
  state.status = 'loading';
  render();
  try {
    const items = (await searchItems(query, state.settings.mode)).map(normalizeItem);
    if (mine !== token) return;
    const entry = { items, fetchedAt: Date.now() };
    results.set(key, entry);
    Object.assign(state, { ...entry, status: 'done', error: null });
  } catch (e) {
    if (mine !== token) return;
    Object.assign(state, { items: [], status: 'error', error: e.message });
  }
  render();
}

let typingTimer = null;
el.search.addEventListener('input', () => {
  state.query = el.search.value;
  saveUi();
  clearTimeout(typingTimer);
  typingTimer = setTimeout(runSearch, 350);
});
el.form.addEventListener('submit', e => {
  e.preventDefault();
  clearTimeout(typingTimer);
  state.query = el.search.value;
  saveUi();
  runSearch();
});
el.chips.addEventListener('click', e => {
  const value = e.target.closest('[data-query]')?.dataset.query;
  if (!value) return;
  el.search.value = state.query = value;
  saveUi();
  runSearch();
});
el.mode.addEventListener('click', e => {
  const mode = e.target.closest('button')?.dataset.value;
  if (!mode || mode === state.settings.mode) return;
  state.settings = updateSettings({ mode });
  runSearch();
});
el.sort.addEventListener('change', () => {
  state.sort = el.sort.value;
  saveUi();
  renderResults();
});
el.retry.addEventListener('click', () => runSearch({ force: true }));
document.addEventListener('keydown', e => {
  const typing = e.target.closest?.('input, textarea, select');
  if (e.key === '/' && !typing && !e.ctrlKey && !e.metaKey && !e.altKey) {
    e.preventDefault();
    el.search.focus();
    el.search.select();
  }
});
setInterval(renderStatus, 60_000);

startRaidClocks();
el.search.value = state.query;
render();
runSearch();
setupBackdrop($('#backdrop'), $('#backdrop-toggle'));
