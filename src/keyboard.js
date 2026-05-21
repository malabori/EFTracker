import { state } from './state.js';
import { openPalette, closePalette } from './palette.js';

// Returns true if the user is currently typing somewhere where global
// shortcuts shouldn't fire (an input, textarea, select, or any element
// with contenteditable). Without this, hitting "/" while typing in the
// search box would steal focus and feel awful.
function isEditingTarget(t) {
  if (!t) return false;
  if (t.isContentEditable) return true;
  const tag = t.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

export function setupKeyboard() {
  document.addEventListener('keydown', e => {
    const meta = e.ctrlKey || e.metaKey;

    // Cmd/Ctrl-K toggles the command palette. Works even when typing
    // — the palette is the search affordance, so it should always win.
    if (meta && (e.key === 'k' || e.key === 'K')) {
      e.preventDefault();
      if (state.paletteOpen) closePalette();
      else openPalette();
      return;
    }

    if (e.key === 'Escape') {
      if (state.paletteOpen) {
        closePalette();
        e.preventDefault();
      }
      return;
    }

    if (isEditingTarget(e.target)) return;

    if (e.key === '/') {
      const search = document.getElementById('eft-search');
      if (search) {
        e.preventDefault();
        search.focus();
        search.select();
      }
      return;
    }

    if (e.key === '?') {
      e.preventDefault();
      showShortcuts();
      return;
    }
  });
}

function showShortcuts() {
  // Re-use the toast for the help blurb. The render module exports
  // showToast / hideToast through a small message-passing surface;
  // we don't want a hard dep cycle here so we just dispatch a window
  // event that render.js listens for.
  window.dispatchEvent(new CustomEvent('eft:show-shortcuts'));
}
