// Behaviour shared by every page's header and footer: the raid clocks and
// the CRT-effect toggle.
import { raidTime, formatClock, isDaytime } from './clock.js';
import { getSettings, updateSettings } from './settings.js';

export function startRaidClocks(root = document) {
  const clocks = [...root.querySelectorAll('[data-raid-clock]')];
  if (!clocks.length) return;

  const tick = () => {
    const now = Date.now();
    for (const el of clocks) {
      const time = raidTime(now, el.dataset.raidClock);
      const day = isDaytime(time);
      el.querySelector('[data-time]').textContent = formatClock(time);
      el.dataset.phase = day ? 'day' : 'night';
      el.querySelector('[data-phase-label]').textContent = day ? 'Day' : 'Night';
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

export function setupCrtToggle(button) {
  if (!button) return;
  const apply = on => {
    document.documentElement.classList.toggle('no-crt', !on);
    button.setAttribute('aria-pressed', String(on));
    button.textContent = on ? 'CRT effect: on' : 'CRT effect: off';
  };
  apply(getSettings().crt);
  button.addEventListener('click', () =>
    apply(updateSettings({ crt: !getSettings().crt }).crt)
  );
}
