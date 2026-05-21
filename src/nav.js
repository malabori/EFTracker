import { refs } from './state.js';

export function setupNav() {
  function toggleMenu(open) {
    refs.offcanvas.setAttribute('aria-hidden', String(!open));
    refs.burger.setAttribute('aria-expanded', String(open));
    if (open) {
      refs.offcanvasClose.focus();
      document.body.style.overflow = 'hidden';
    } else {
      refs.burger.focus();
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
}
