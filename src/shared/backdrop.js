// Animated ASCII backdrop: two layers of ASCII "dust" drifting behind the
// page.
//
// Kept cheap on purpose: each layer is a small tile drawn once and moved by
// the browser's compositor (Web Animations), so no script runs while it
// drifts. "Still" mode and reduced-motion show the dust without movement.
const TILE_COLS = 48;
const TILE_ROWS = 24;
const DUST = ['.', '·', ':', '+'];
const BASE = '205, 183, 135';
const MONO =
  'ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace';
const FOREVER = { iterations: Infinity, easing: 'linear' };
const SWING = { iterations: Infinity, direction: 'alternate', easing: 'ease-in-out' };

// Deterministic 0..1 hash of a grid cell.
export function hash(x, y, seed = 0) {
  let h =
    Math.imul(x | 0, 374761393) ^
    Math.imul(y | 0, 668265263) ^
    Math.imul(seed | 0, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

// Smooth value noise that repeats every `period` units, so tiles built from
// it join up seamlessly.
export function wrapNoise(x, y, period, seed = 0) {
  const wrap = v => ((v % period) + period) % period;
  const x0 = Math.floor(x);
  const y0 = Math.floor(y);
  const fx = x - x0;
  const fy = y - y0;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash(wrap(x0), wrap(y0), seed);
  const b = hash(wrap(x0 + 1), wrap(y0), seed);
  const c = hash(wrap(x0), wrap(y0 + 1), seed);
  const d = hash(wrap(x0 + 1), wrap(y0 + 1), seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}

export function startBackdrop(root, initialMode = 'animated') {
  const add = className => {
    const node = document.createElement('div');
    node.className = className;
    root.append(node);
    return node;
  };
  const dust = [add('bd-dust'), add('bd-dust')];
  const dustUrls = [];
  root.setAttribute('aria-hidden', 'true');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

  let mode = initialMode;
  let vw = 0;
  let vh = 0;
  let fontPx = 12;
  let tile = { w: 0, h: 0 };
  let ambient = [];

  const animated = () => mode === 'animated' && !reducedMotion.matches;

  function measure() {
    vw = window.innerWidth;
    vh = window.innerHeight;
    fontPx = vw < 760 ? 9 : 12;
    drawDust();
  }

  // Each layer is a small tile drawn once and repeated as a background image
  // over a box one tile larger than the window, so it can drift a whole tile
  // and loop without a seam. Tile sizes are kept even so they stay whole
  // pixels at 1.5x.
  function drawDust() {
    const scale = Math.min(
      1.5,
      Math.max(1, Math.round((window.devicePixelRatio || 1) * 2) / 2)
    );
    const probe = document.createElement('canvas').getContext('2d');
    probe.font = `${fontPx}px ${MONO}`;
    const cellH = Math.round(fontPx * 1.2);
    const tileW = 2 * Math.round((TILE_COLS * probe.measureText('M').width) / 2);
    const tileH = TILE_ROWS * cellH;
    tile = { w: tileW, h: tileH };

    const layers = [
      { seed: 7, threshold: 0.6, color: `rgba(${BASE}, 0.16)` },
      { seed: 19, threshold: 0.68, color: 'rgba(235, 228, 210, 0.1)' }
    ];
    layers.forEach(({ seed, threshold, color }, i) => {
      const pattern = document.createElement('canvas');
      pattern.width = tileW * scale;
      pattern.height = tileH * scale;
      const p = pattern.getContext('2d');
      p.scale(scale, scale);
      p.font = `${fontPx}px ${MONO}`;
      p.textBaseline = 'top';
      p.fillStyle = color;
      for (let r = 0; r < TILE_ROWS; r++) {
        for (let c = 0; c < TILE_COLS; c++) {
          const n =
            0.65 * wrapNoise(c / 4, r / 2, TILE_COLS / 4, seed) +
            0.35 * wrapNoise(c / 2, r, TILE_COLS / 2, seed + 1);
          if (n < threshold) continue;
          const level = Math.min(
            DUST.length - 1,
            Math.floor(((n - threshold) / (1 - threshold)) * DUST.length)
          );
          p.fillText(DUST[level], (c * tileW) / TILE_COLS, r * cellH);
        }
      }
      const layer = dust[i];
      layer.style.width = `${vw + tileW}px`;
      layer.style.height = `${vh + tileH}px`;
      // The second layer drifts right, so it starts a tile to the left.
      layer.style.left = i ? `${-tileW}px` : '0';
      layer.style.backgroundSize = `${tileW}px ${tileH}px`;
      pattern.toBlob(blob => {
        if (!blob) return;
        URL.revokeObjectURL(dustUrls[i]);
        dustUrls[i] = URL.createObjectURL(blob);
        layer.style.backgroundImage = `url(${dustUrls[i]})`;
      });
    });
  }

  function startAmbient() {
    const { w, h } = tile;
    ambient = [
      dust[0].animate(
        [
          { transform: 'translate3d(0, 0, 0)' },
          { transform: `translate3d(${-w}px, ${-h}px, 0)` }
        ],
        { duration: 90000, ...FOREVER }
      ),
      dust[1].animate(
        [
          { transform: 'translate3d(0, 0, 0)' },
          { transform: `translate3d(${w}px, ${-h}px, 0)` }
        ],
        { duration: 60000, ...FOREVER }
      ),
      dust[0].animate([{ opacity: 1 }, { opacity: 0.6 }], { duration: 7000, ...SWING }),
      dust[1].animate([{ opacity: 0.6 }, { opacity: 1 }], { duration: 5300, ...SWING })
    ];
  }

  function apply() {
    for (const a of ambient) a.cancel();
    ambient = [];
    root.hidden = mode === 'off';
    root.classList.toggle('is-still', !animated());
    if (animated()) startAmbient();
  }

  // Phones resize the window as the address bar slides in and out; the dust
  // already overhangs by a tile, so only redraw for real size changes.
  let resizeTimer = 0;
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      if (window.innerWidth === vw && Math.abs(window.innerHeight - vh) < 160) return;
      measure();
      apply();
    }, 250);
  });
  reducedMotion.addEventListener?.('change', apply);

  measure();
  apply();

  return {
    setMode(next) {
      mode = next;
      apply();
    }
  };
}
