import { readJsonLocalStorage, safeLocalStorageSet } from './storage.js';

export const PROGRESS_KEY = 'eft-task-progress-stable';
export const UI_KEY = 'eft-ui';
export const CELEBRATED_KEY = 'eft-kappa-celebrated';

const hydratedUI = readJsonLocalStorage(UI_KEY, {});

export const state = {
  tasks: [],
  extended: false,
  done: readJsonLocalStorage(PROGRESS_KEY, {}),
  traderFilter: 'ALL',
  kappaOnly: false,
  showCompleted: true,
  search: '',
  collapsed: hydratedUI.collapsed || {},
  openTask: hydratedUI.openTask || {},
  colMap: {},
  scrollByTrader: {},
  celebrated: readJsonLocalStorage(CELEBRATED_KEY, false),
  loading: true,
  error: ''
};

export const refs = {
  side: null,
  app: null,
  toast: null,
  burger: null,
  offcanvas: null,
  offcanvasClose: null
};

export const saveProgress = () =>
  safeLocalStorageSet(PROGRESS_KEY, JSON.stringify(state.done));

export const saveUI = () =>
  safeLocalStorageSet(
    UI_KEY,
    JSON.stringify({ collapsed: state.collapsed, openTask: state.openTask })
  );
