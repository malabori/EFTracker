import { el } from './dom.js';
import { state } from './state.js';
import { getPaletteCommands, render } from './render.js';

// Ranks commands against a query.
//   0 = exact case-insensitive match
//   1 = starts-with
//   2 = word-boundary match ("make" matches "the maker")
//   3 = contains anywhere
// Pure so it's easy to unit-test independent of the DOM.
export function filterCommands(commands, query, limit = 30) {
  const q = (query || '').trim().toLowerCase();
  if (!q) {
    // No query: action commands first (so the palette feels useful
    // even with an empty box), then traders, then a small bite of
    // quests.
    const ranked = commands.slice().sort((a, b) => kindWeight(a) - kindWeight(b));
    return ranked.slice(0, limit);
  }
  const scored = [];
  for (const c of commands) {
    const label = c.label.toLowerCase();
    const hint = (c.hint || '').toLowerCase();
    let rank;
    if (label === q) rank = 0;
    else if (label.startsWith(q)) rank = 1;
    else if (new RegExp('\\b' + escapeForRegex(q)).test(label)) rank = 2;
    else if (label.includes(q)) rank = 3;
    else if (hint.includes(q)) rank = 4;
    else continue;
    scored.push([rank, kindWeight(c), c]);
  }
  scored.sort(
    (a, b) => a[0] - b[0] || a[1] - b[1] || a[2].label.localeCompare(b[2].label)
  );
  return scored.slice(0, limit).map(s => s[2]);
}

function kindWeight(c) {
  switch (c.kind) {
    case 'action':
      return 0;
    case 'trader':
      return 1;
    case 'quest':
      return 2;
    default:
      return 3;
  }
}

function escapeForRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

let overlayEl = null;
let inputEl = null;
let listEl = null;
let activeIndex = 0;
let currentResults = [];
let lastFocused = null;

export function openPalette() {
  if (state.paletteOpen) return;
  state.paletteOpen = true;
  lastFocused = document.activeElement;
  buildOverlay();
  document.body.appendChild(overlayEl);
  document.body.style.overflow = 'hidden';
  inputEl.value = '';
  refreshResults('');
  // requestAnimationFrame so the initial paint doesn't fight focus.
  requestAnimationFrame(() => inputEl.focus());
}

export function closePalette() {
  if (!state.paletteOpen) return;
  state.paletteOpen = false;
  if (overlayEl) {
    overlayEl.remove();
    overlayEl = null;
  }
  document.body.style.overflow = '';
  if (lastFocused && typeof lastFocused.focus === 'function') {
    lastFocused.focus();
  }
}

export function togglePalette() {
  if (state.paletteOpen) closePalette();
  else openPalette();
}

function buildOverlay() {
  overlayEl = el('div', {
    class: 'palette-overlay',
    role: 'dialog',
    'aria-modal': 'true',
    'aria-label': 'Command palette',
    onclick: e => {
      if (e.target === overlayEl) closePalette();
    }
  });

  inputEl = el('input', {
    class: 'palette-input',
    type: 'text',
    autocomplete: 'off',
    spellcheck: false,
    placeholder: 'Search quests, traders, actions…',
    oninput: e => refreshResults(e.target.value),
    onkeydown: handleInputKeydown
  });

  listEl = el('ul', { class: 'palette-list', role: 'listbox' });

  const panel = el(
    'div',
    { class: 'palette' },
    el(
      'div',
      { class: 'palette-head' },
      el('span', { class: 'palette-prefix' }, '//'),
      inputEl
    ),
    listEl,
    el(
      'div',
      { class: 'palette-foot' },
      el('span', {}, '↑↓ navigate'),
      el('span', {}, '↵ select'),
      el('span', {}, 'Esc close')
    )
  );

  overlayEl.append(panel);
}

function refreshResults(query) {
  currentResults = filterCommands(getPaletteCommands(), query);
  activeIndex = 0;
  renderResults();
}

function renderResults() {
  listEl.innerHTML = '';
  if (!currentResults.length) {
    listEl.append(
      el('li', { class: 'palette-empty' }, 'No matching commands or quests.')
    );
    return;
  }
  currentResults.forEach((c, i) => {
    const item = el(
      'li',
      {
        class: 'palette-item' + (i === activeIndex ? ' is-active' : ''),
        role: 'option',
        'aria-selected': i === activeIndex ? 'true' : 'false',
        onclick: () => runResult(i),
        onmousemove: () => {
          if (activeIndex !== i) {
            activeIndex = i;
            renderResults();
          }
        }
      },
      el('span', { class: `palette-kind kind-${c.kind}` }, c.kind.toUpperCase()),
      el('span', { class: 'palette-label', title: c.label }, c.label),
      c.hint ? el('span', { class: 'palette-hint' }, c.hint) : null
    );
    listEl.append(item);
  });
}

function runResult(i) {
  const c = currentResults[i];
  if (!c) return;
  closePalette();
  // Defer so the overlay is gone before the action runs anything
  // that might re-render.
  setTimeout(() => {
    try {
      c.run();
    } catch (e) {
      console.error('palette command failed', e);
    }
    // Many actions toggle state but don't trigger render themselves;
    // do it here so the UI stays in sync.
    render();
  }, 0);
}

function handleInputKeydown(e) {
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    if (currentResults.length) {
      activeIndex = (activeIndex + 1) % currentResults.length;
      renderResults();
      ensureActiveVisible();
    }
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    if (currentResults.length) {
      activeIndex = (activeIndex - 1 + currentResults.length) % currentResults.length;
      renderResults();
      ensureActiveVisible();
    }
  } else if (e.key === 'Enter') {
    e.preventDefault();
    runResult(activeIndex);
  } else if (e.key === 'Escape') {
    e.preventDefault();
    closePalette();
  }
}

function ensureActiveVisible() {
  const active = listEl.querySelector('.palette-item.is-active');
  if (active) active.scrollIntoView({ block: 'nearest' });
}
