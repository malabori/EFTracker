// Legacy entry point — keep this file at this path.
//
// eftracking.com is a WordPress page that loads this script (and
// src/styles/main.css) straight from GitHub Pages. Instead of rendering an
// old copy of the app, it shows the current site in a full-window frame, so
// the WordPress page never needs editing when the site changes.
//
// Plain script on purpose (no import/export): it works whether the WordPress
// page loads it as a module or as a classic script.
(() => {
  const PATH = /\/src\/main\.js(?:[?#].*)?$/;
  const self =
    document.currentScript?.src ||
    [...document.scripts].map(s => s.src).find(src => PATH.test(src)) ||
    'https://malabori.github.io/EFTracker/src/main.js';
  const site = new URL('../', self);

  function mount() {
    const frame = document.createElement('iframe');
    frame.src = site.href;
    frame.title = 'EFTracking';
    frame.className = 'eftracking-frame';

    // The old version saved progress in this domain's storage, which the
    // framed site (another origin) can't read. Hand it over; the site only
    // accepts it from eftracking.com and imports it once.
    frame.addEventListener('load', () => {
      let saved = null;
      try {
        saved = localStorage.getItem('eft-task-progress-stable');
      } catch {}
      if (saved) {
        frame.contentWindow.postMessage(
          { type: 'eftracking:legacy-progress', data: saved },
          site.origin
        );
      }
    });

    const host = document.getElementById('eft-app');
    if (host) host.replaceChildren(frame);
    else document.body.append(frame);
    document.documentElement.classList.add('eftracking-embedded');
  }

  if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', mount);
  else mount();
})();
