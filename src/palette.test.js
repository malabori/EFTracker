import { describe, it, expect } from 'vitest';
import { filterCommands } from './palette.js';

const mk = (kind, label, hint = '') => ({ kind, label, hint, run: () => {} });

describe('filterCommands', () => {
  const cmds = [
    mk('action', 'Open briefing', 'View'),
    mk('action', 'Open list view', 'View'),
    mk('action', 'Toggle Kappa only', 'Filter'),
    mk('action', 'Export progress', 'Data'),
    mk('trader', 'Prapor', 'Open dossier'),
    mk('trader', 'Therapist', 'Open dossier'),
    mk('quest', 'Debut', 'Prapor'),
    mk('quest', 'Shooting Cans', 'Prapor'),
    mk('quest', 'Postman Pat - Part 1', 'Prapor'),
    mk('quest', 'Make ULTRA Great Again', 'Ragman')
  ];

  it('empty query returns actions first, then traders, then quests', () => {
    const out = filterCommands(cmds, '');
    expect(out[0].kind).toBe('action');
    const kinds = out.map(c => c.kind);
    const lastAction = kinds.lastIndexOf('action');
    const firstTrader = kinds.indexOf('trader');
    const firstQuest = kinds.indexOf('quest');
    expect(lastAction).toBeLessThan(firstTrader);
    expect(firstTrader).toBeLessThan(firstQuest);
  });

  it('exact-label matches outrank starts-with', () => {
    const list = [mk('quest', 'Debut Sequel'), mk('quest', 'Debut')];
    const out = filterCommands(list, 'debut');
    expect(out[0].label).toBe('Debut');
  });

  it('starts-with beats contains', () => {
    const list = [mk('quest', 'Sandbox Setup'), mk('quest', 'Setup')];
    const out = filterCommands(list, 'setup');
    expect(out[0].label).toBe('Setup');
  });

  it('matches word boundaries', () => {
    const out = filterCommands(cmds, 'make');
    expect(out.map(c => c.label)).toContain('Make ULTRA Great Again');
  });

  it('falls back to hint matches when label misses', () => {
    const out = filterCommands(cmds, 'view');
    // Both "Open briefing" and "Open list view" have hint=View;
    // "Open list view" matches by label too so it ranks higher,
    // but both should appear.
    const labels = out.map(c => c.label);
    expect(labels).toContain('Open briefing');
    expect(labels).toContain('Open list view');
  });

  it('case-insensitive', () => {
    expect(filterCommands(cmds, 'PRAPOR').map(c => c.label)).toContain('Prapor');
    expect(filterCommands(cmds, 'prapor').map(c => c.label)).toContain('Prapor');
  });

  it('respects the limit', () => {
    const many = Array.from({ length: 100 }, (_, i) => mk('quest', `q${i}`));
    expect(filterCommands(many, 'q', 10)).toHaveLength(10);
  });

  it('returns empty for no matches', () => {
    expect(filterCommands(cmds, 'xyzzy')).toEqual([]);
  });
});
