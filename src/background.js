export function initBackground() {
  document.title = 'EFTRACKER';

  if (!document.getElementById('eft-bg-grid')) {
    const g = document.createElement('div');
    g.id = 'eft-bg-grid';
    document.body.appendChild(g);
  }

  if (!document.getElementById('eft-bg-noise')) {
    const n = document.createElement('div');
    n.id = 'eft-bg-noise';
    document.body.appendChild(n);
  }

  if (!document.getElementById('eft-bg-watermark')) {
    const w = document.createElement('div');
    w.id = 'eft-bg-watermark';
    w.setAttribute('aria-hidden', 'true');
    document.body.appendChild(w);
  }
}
