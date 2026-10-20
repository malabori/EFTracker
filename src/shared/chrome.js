// Behaviour for the page's header and footer: the nixie raid clocks and the
// ASCII backdrop with its Animated / Still / Off switch.
import { raidTime, formatClock, isDaytime } from './clock.js';
import { BACKDROP_MODES, getSettings, updateSettings } from './settings.js';
import { startBackdrop } from './backdrop.js';
import { nixieHtml } from './nixie.js';

export function startRaidClocks(root = document) {
  const clocks = [...root.querySelectorAll('[data-raid-clock]')];
  if (!clocks.length) return;

  const tick = () => {
    const now = Date.now();
    for (const el of clocks) {
      const time = raidTime(now, el.dataset.raidClock);
      const day = isDaytime(time);
      const text = formatClock(time).slice(0, 5);
      const tubes = el.querySelector('[data-time]');
      // Raid minutes tick about every 9 seconds; only redraw the tubes then.
      if (tubes.dataset.value !== text) {
        tubes.dataset.value = text;
        tubes.innerHTML = nixieHtml(text);
        tubes.setAttribute('aria-label', `${text}, ${day ? 'day' : 'night'}`);
      }
      el.dataset.phase = day ? 'day' : 'night';
    }
  };

  let timer = null;
  const start = () => {
    if (timer) return;
    tick();
    timer = setInterval(tick, 1000);
  };
  const stop = () => {
    clearInterval(timer);
    timer = null;
  };
  document.addEventListener('visibilitychange', () =>
    document.hidden ? stop() : start()
  );
  start();
}

const BACKDROP_LABELS = { animated: 'Animated', still: 'Still', off: 'Off' };

export function setupBackdrop(root, button) {
  if (!root) return;
  const backdrop = startBackdrop(root, getSettings().backdrop);
  if (!button) return;
  const label = mode => {
    button.textContent = `Background: ${BACKDROP_LABELS[mode]}`;
  };
  label(getSettings().backdrop);
  button.addEventListener('click', () => {
    const modes = BACKDROP_MODES;
    const next = modes[(modes.indexOf(getSettings().backdrop) + 1) % modes.length];
    updateSettings({ backdrop: next });
    backdrop.setMode(next);
    label(next);
  });
}
