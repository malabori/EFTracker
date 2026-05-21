import { refs } from './state.js';

function cssGap() {
  const v = getComputedStyle(document.documentElement).getPropertyValue('--gap').trim();
  return parseFloat(v) || 24;
}

export function positionSidebar() {
  const wrap = document.getElementById('eft-wrap');
  const barEl = document.getElementById('eft-bar');
  if (!wrap || !barEl || !refs.side) return;

  if (matchMedia('(max-width:1400px)').matches) {
    refs.side.style.position = 'static';
    refs.side.style.left = '';
    refs.side.style.top = '';
    refs.side.style.width = '';
    return;
  }

  refs.side.style.position = 'fixed';

  const g = cssGap();
  const wR = wrap.getBoundingClientRect();
  const sW = Math.round(wR.left - 2 * g);
  if (sW <= 140) {
    refs.side.style.position = 'static';
    refs.side.style.left = '';
    refs.side.style.top = '';
    refs.side.style.width = '';
    return;
  }

  refs.side.style.left = `${g}px`;
  refs.side.style.width = `${sW}px`;

  const bR = barEl.getBoundingClientRect();
  const vvY = window.visualViewport ? window.visualViewport.offsetTop : 0;
  let top = Math.round(bR.top + vvY);

  const pad = 16;
  const sH = refs.side.getBoundingClientRect().height;
  const maxTop = window.innerHeight + vvY - sH - pad;
  top = Math.max(pad, Math.min(top, maxTop));
  refs.side.style.top = `${top}px`;
}

let ticking = false;
function onScrollRaf() {
  if (ticking) return;
  ticking = true;
  requestAnimationFrame(() => {
    positionSidebar();
    ticking = false;
  });
}

export function setupViewportListeners() {
  addEventListener('resize', positionSidebar, { passive: true });
  addEventListener('scroll', onScrollRaf, { passive: true });
  if (window.visualViewport) {
    visualViewport.addEventListener('resize', positionSidebar);
    visualViewport.addEventListener('scroll', positionSidebar);
  }
}
