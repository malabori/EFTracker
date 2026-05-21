import { refs, state, saveUI } from './state.js';
import { openPalette } from './palette.js';
import { render } from './render.js';

export function setupNav() {
  function toggleMenu(open) {
    refs.offcanvas.setAttribute('aria-hidden', String(!open));
    refs.burger?.setAttribute('aria-expanded', String(open));
    if (open) {
      refs.offcanvasClose.focus();
      document.body.style.overflow = 'hidden';
    } else {
      refs.burger?.focus();
      document.body.style.overflow = '';
    }
  }
  refs.burger?.addEventListener('click', () => toggleMenu(true));
  refs.offcanvasClose?.addEventListener('click', () => toggleMenu(false));
  refs.offcanvas?.addEventListener('click', e => {
    if (e.target === refs.offcanvas) toggleMenu(false);
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') toggleMenu(false);
  });

  setupMobileNav(toggleMenu);
}

function setupMobileNav(toggleMenu) {
  const nav = document.getElementById('eft-mobile-nav');
  if (!nav) return;

  const buttons = nav.querySelectorAll('button[data-mnav]');
  buttons.forEach(btn => {
    const tab = btn.getAttribute('data-mnav');
    btn.addEventListener('click', () => {
      switch (tab) {
        case 'briefing':
          if (state.view !== 'briefing') {
            state.view = 'briefing';
            saveUI();
            render();
          }
          scrollTo({ top: 0, behavior: 'smooth' });
          break;
        case 'list':
          if (state.view !== 'list') {
            state.view = 'list';
            saveUI();
            render();
          }
          requestAnimationFrame(() => {
            const content = document.getElementById('eft-content');
            content?.scrollIntoView({ behavior: 'smooth', block: 'start' });
          });
          break;
        case 'search':
          openPalette();
          break;
        case 'menu':
          toggleMenu(true);
          break;
      }
      syncMobileNavActive();
    });
  });

  syncMobileNavActive();
  // Re-sync after every render so the active tab tracks state.view.
  // render.js doesn't expose post-render hooks, so we hook the
  // MutationObserver on the content area as a lightweight signal.
  const target = document.getElementById('eft-app');
  if (target && window.MutationObserver) {
    const obs = new MutationObserver(syncMobileNavActive);
    obs.observe(target, { childList: true, subtree: false });
  }
}

function syncMobileNavActive() {
  const nav = document.getElementById('eft-mobile-nav');
  if (!nav) return;
  const active = state.view === 'list' ? 'list' : 'briefing';
  nav
    .querySelectorAll('button[data-mnav]')
    .forEach(b =>
      b.classList.toggle('is-active', b.getAttribute('data-mnav') === active)
    );
}
