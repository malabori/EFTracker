import { readJson, writeJson } from './storage.js';

// Settings shared by every page: game mode, faction, player level and how the
// ASCII backdrop behaves.
export const SETTINGS_KEY = 'eftracking.settings.v1';
export const MODE_LABELS = { regular: 'PvP', pve: 'PvE' };
export const FACTIONS = ['BEAR', 'USEC'];
export const BACKDROP_MODES = ['animated', 'still', 'off'];
export const MAX_LEVEL = 99;

const DEFAULTS = Object.freeze({
  mode: 'regular',
  faction: null,
  level: null,
  backdrop: 'animated'
});

export function normalizeSettings(raw) {
  const out = { ...DEFAULTS };
  if (!raw || typeof raw !== 'object') return out;
  if (raw.mode in MODE_LABELS) out.mode = raw.mode;
  if (FACTIONS.includes(raw.faction)) out.faction = raw.faction;
  const level = Number(raw.level);
  if (raw.level != null && raw.level !== '' && Number.isInteger(level)) {
    out.level = Math.min(MAX_LEVEL, Math.max(1, level));
  }
  if (BACKDROP_MODES.includes(raw.backdrop)) out.backdrop = raw.backdrop;
  return out;
}

function loadSettings() {
  const saved = readJson(SETTINGS_KEY);
  if (saved) return normalizeSettings(saved);
  // First visit since the rebuild: keep the PvP/PvE choice from the old flea page.
  const oldFlea = readJson('eft_flea_state_v1');
  return normalizeSettings({ mode: oldFlea?.mode });
}

let current = null;
const listeners = new Set();

export function getSettings() {
  if (!current) current = loadSettings();
  return current;
}

export function updateSettings(patch) {
  current = normalizeSettings({ ...getSettings(), ...patch });
  writeJson(SETTINGS_KEY, current);
  for (const fn of listeners) fn(current);
  return current;
}

export function onSettingsChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
