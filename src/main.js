import { state } from './state.js';
import { initBackground } from './background.js';
import { ensureShell } from './shell.js';
import { setupNav } from './nav.js';
import { render } from './render.js';
import { fetchTasks, getCache, setCache } from './api.js';
import { setupKeyboard } from './keyboard.js';

async function load(isRetry = false) {
  if (!isRetry) render();

  if (!isRetry) {
    const cached = getCache();
    if (cached) {
      state.tasks = cached.data || cached;
      state.extended = !!cached.extended;
      state.loading = false;
      render();
    }
  }

  try {
    const { tasks, extended } = await fetchTasks();
    state.tasks = tasks;
    state.extended = extended;
    setCache({ data: tasks, extended });
  } catch (e) {
    if (!state.tasks.length) {
      state.error = String(e?.message || e);
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
  setupKeyboard();
  window.addEventListener('eft:reload', () => load(true));
  load();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
