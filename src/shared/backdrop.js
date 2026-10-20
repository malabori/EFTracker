// Animated ASCII backdrop: drifting ASCII "dust" with scenes from the game
// (ascii-art.js) that materialise out of it, linger, and dissolve away.
//
// Kept cheap on purpose: the dust, the floating art and the lighthouse beam
// are drawn once and then moved by the browser's compositor (Web Animations),
// so script only runs for the couple of seconds a scene takes to appear or
// dissolve. "Still" mode and reduced-motion show one scene with no movement.
import { SCENES } from './ascii-art.js';

const SCENE_MS = 26000;
const FADE_MS = 2400;
const FADE_FRAME_MS = 1000 / 24;
const TILE_COLS = 48;
const TILE_ROWS = 24;
const DUST = ['.', '·', ':', '+'];
const GLITCH = ['.', ':', '-', '=', '+', '*', '#', '/', '\\', '|'];
const BASE = '205, 183, 135';
const TONES = {
  warm: '255, 236, 196',
  gold: '230, 180, 80',
  red: '224, 107, 95',
  cyan: '111, 198, 220',
  tan: '232, 214, 170'
};
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

// Splits a scene's art into a grid of characters. In a 'beam' scene the first
// '*' marks the lamp: it is drawn as '@' and the light sweeps out from it.
export function parseArt(scene) {
  const lines = scene.art
    .replace(/^\n/, '')
    .replace(/\s+$/, '')
    .split('\n')
    .map(line => [...line]);
  const cols = Math.max(...lines.map(l => l.length));
  let lamp = null;
  if (scene.effect === 'beam') {
    const r = lines.findIndex(l => l.includes('*'));
    if (r >= 0) {
      lamp = { r, c: lines[r].indexOf('*') };
      lines[r][lamp.c] = '@';
    }
  }
  const glow = (r, c) =>
    scene.glow.some(([r1, c1, r2, c2]) => r >= r1 && r <= r2 && c >= c1 && c <= c2);
  return { lines, rows: lines.length, cols, lamp, glow };
}

// How wide a scene may be. Phones: nearly the full width (it sits behind the
// content anyway). Desktops: the open space on the right under the quest
// details panel, or a side gutter if that is wider.
export function maxSceneWidth(vw, contentW = 1320) {
  if (vw < 760) return Math.round(vw * 0.92);
  const gutter = (vw - Math.min(contentW, vw)) / 2;
  const panel = vw > 1180 ? 400 : vw > 900 ? 340 : vw * 0.5;
  return Math.round(gutter + panel - 4);
}

// Where a scene goes: centred low on phones; bottom right under the details
// panel on most desktops; and on wide screens, moving between the corners of
// both side gutters scene by scene.
export function placeScene({ vw, vh, w, h, slot, contentW = 1320, top = 96 }) {
  if (vw < 760) {
    return { x: Math.round((vw - w) / 2), y: Math.round(Math.max(top, vh - h - 24)) };
  }
  const gutter = (vw - Math.min(contentW, vw)) / 2;
  let x = vw - w - 24;
  let y = vh - h - 28;
  if (gutter >= w * 0.75) {
    x = slot % 2 === 0 ? vw - gutter / 2 - w / 2 : gutter / 2 - w / 2;
    if (slot % 4 >= 2) y = top;
  }
  x = Math.min(Math.max(12, x), vw - w - 12);
  return { x: Math.round(x), y: Math.round(Math.max(top, y)) };
}

const ease = t => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

export function startBackdrop(root, initialMode = 'animated') {
  const add = (tag, className, parent = root) => {
    const node = document.createElement(tag);
    node.className = className;
    parent.append(node);
    return node;
  };
  const dust = [add('div', 'bd-dust'), add('div', 'bd-dust')];
  const dustUrls = [];
  const scene = add('div', 'bd-scene');
  const float = add('div', 'bd-float', scene);
  const beam = add('canvas', 'bd-beam', float);
  const art = add('canvas', 'bd-art', float);
  const glow = add('canvas', 'bd-glow', float);
  root.setAttribute('aria-hidden', 'true');

  const artCtx = art.getContext('2d');
  const glowCtx = glow.getContext('2d');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');

  let mode = initialMode;
  let vw = 0;
  let vh = 0;
  let fontPx = 12;
  let tile = { w: 0, h: 0 };
  let index = Math.floor(Math.random() * SCENES.length);
  let slot = 0;
  let current = null;
  let ambient = []; // dust drift + floating, while animated
  let sceneMotion = []; // beam sweep / BTR drive for the current scene
  let timer = 0;
  let raf = 0;

  const animated = () => mode === 'animated' && !reducedMotion.matches;

  function measure() {
    vw = window.innerWidth;
    vh = window.innerHeight;
    fontPx = vw < 760 ? 9 : 12;
    drawDust();
  }

  // Two layers of dust. Each is a small tile drawn once and repeated as a
  // background image over a box one tile larger than the window, so it can
  // drift a whole tile and loop without a seam. (Images are rasterised once;
  // big canvases would be re-sent to the compositor on every frame a scene
  // fades.) Tile sizes are kept even so they stay whole pixels at 1.5x.
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

  // The lighthouse beam: two soft cones and a halo, drawn once at half
  // resolution (it's all gradients) and spun by the compositor.
  function drawBeam(radius) {
    const res = 0.5;
    beam.width = beam.height = Math.round(radius * 2 * res);
    beam.style.width = beam.style.height = `${radius * 2}px`;
    const ctx = beam.getContext('2d');
    const c = beam.width / 2;
    const light = ctx.createRadialGradient(c, c, 0, c, c, c);
    light.addColorStop(0, 'rgba(255, 236, 196, 0.2)');
    light.addColorStop(0.35, 'rgba(255, 236, 196, 0.06)');
    light.addColorStop(1, 'rgba(255, 236, 196, 0)');
    ctx.fillStyle = light;
    for (const a of [0, Math.PI]) {
      ctx.beginPath();
      ctx.moveTo(c, c);
      ctx.arc(c, c, c, a - 0.13, a + 0.13);
      ctx.closePath();
      ctx.fill();
    }
    const haloR = 48 * res;
    const halo = ctx.createRadialGradient(c, c, 0, c, c, haloR);
    halo.addColorStop(0, 'rgba(255, 236, 196, 0.4)');
    halo.addColorStop(1, 'rgba(255, 236, 196, 0)');
    ctx.fillStyle = halo;
    ctx.fillRect(c - haloR, c - haloR, haloR * 2, haloR * 2);
  }

  function showScene(s) {
    for (const a of sceneMotion) a.cancel();
    sceneMotion = [];
    const parsed = parseArt(s);
    // The caption is letter-spaced, so it can be wider than the art.
    const cols = Math.max(parsed.cols, s.caption.length * 2 - 1);
    artCtx.font = `100px ${MONO}`;
    const glyphW = artCtx.measureText('M').width / 100;
    const px = Math.max(
      7,
      Math.min(fontPx, Math.floor(maxSceneWidth(vw) / (cols * glyphW)))
    );
    const scale = Math.min(window.devicePixelRatio || 1, 2);
    artCtx.font = `${px}px ${MONO}`;
    const cellW = artCtx.measureText('M').width;
    const cellH = Math.round(px * 1.2);
    const w = Math.ceil(cols * cellW);
    const h = parsed.rows * cellH + cellH * 2;
    for (const canvas of [art, glow]) {
      canvas.width = Math.round(w * scale);
      canvas.height = Math.round(h * scale);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
    }
    const spot = placeScene({ vw, vh, w, h, slot });
    scene.style.left = `${spot.x}px`;
    scene.style.top = `${spot.y}px`;
    glow.style.setProperty('--tone', `rgb(${TONES[s.tone] || TONES.tan})`);

    // The finished drawing, rendered once; fades reveal it cell by cell.
    const base = `rgba(${BASE}, 0.42)`;
    const tone = `rgba(${TONES[s.tone] || TONES.tan}, 0.95)`;
    const full = document.createElement('canvas');
    full.width = art.width;
    full.height = art.height;
    const f = full.getContext('2d');
    f.setTransform(scale, 0, 0, scale, 0, 0);
    f.font = `${px}px ${MONO}`;
    f.textBaseline = 'top';
    parsed.lines.forEach((line, r) =>
      line.forEach((chr, col) => {
        if (chr === ' ') return;
        f.fillStyle = parsed.glow(r, col) ? tone : base;
        f.fillText(chr, col * cellW, r * cellH);
      })
    );
    current = {
      scene: s,
      parsed,
      w,
      h,
      px,
      cellW,
      cellH,
      scale,
      full,
      base,
      tone,
      lit: false
    };

    beam.hidden = !parsed.lamp;
    if (parsed.lamp) {
      const radius = Math.round(Math.min(1000, Math.max(vw, vh) * 0.8));
      drawBeam(radius);
      beam.style.left = `${(parsed.lamp.c + 0.5) * cellW - radius}px`;
      beam.style.top = `${(parsed.lamp.r + 0.5) * cellH - radius}px`;
      beam.style.transform = 'rotate(-35deg)';
    }
    if (!animated()) return;
    if (parsed.lamp) {
      sceneMotion.push(
        beam.animate([{ transform: 'rotate(-35deg)' }, { transform: 'rotate(325deg)' }], {
          duration: 16000,
          ...FOREVER
        })
      );
    }
    if (s.effect === 'drive') {
      // The BTR rolls out from behind the page into its spot.
      const distance = Math.max(0, Math.min(360, spot.x - 12));
      sceneMotion.push(
        scene.animate(
          [
            { transform: `translate3d(${-distance}px, 0, 0)` },
            { transform: 'translate3d(0, 0, 0)' }
          ],
          {
            duration: SCENE_MS - FADE_MS,
            easing: 'cubic-bezier(0.2, 0, 0.4, 1)',
            fill: 'forwards'
          }
        )
      );
    }
  }

  // Show only the cells "revealed" so far, with the cells right at the edge
  // of the reveal flickering as random glyphs: that's the materialise and
  // dissolve effect. The revealed cells are cut out of the finished drawing
  // with a mask, so only the few edge glyphs are drawn as text each frame.
  // The glow layer (with its soft, costly shadow) lights up only once the
  // scene is fully there.
  function renderArt(reveal, flicker) {
    const c = current;
    const { lines, rows, glow: isGlow } = c.parsed;
    const seed = SCENES.indexOf(c.scene) * 97;
    const lit = reveal >= 1;
    const setText = ctx => {
      ctx.setTransform(c.scale, 0, 0, c.scale, 0, 0);
      ctx.font = `${c.px}px ${MONO}`;
      ctx.textBaseline = 'top';
    };

    artCtx.setTransform(1, 0, 0, 1, 0, 0);
    artCtx.clearRect(0, 0, art.width, art.height);
    if (lit) {
      artCtx.drawImage(c.full, 0, 0);
    } else if (reveal > 0) {
      const edge = [];
      const px = v => Math.round(v * c.scale);
      artCtx.beginPath();
      for (let r = 0; r < rows; r++) {
        const y0 = px(r * c.cellH);
        const y1 = px((r + 1) * c.cellH);
        lines[r].forEach((chr, col) => {
          if (chr === ' ') return;
          const h = hash(col, r, seed);
          if (h > reveal) return;
          if (reveal - h < 0.08) edge.push([col, r]);
          else
            artCtx.rect(
              px(col * c.cellW),
              y0,
              px((col + 1) * c.cellW) - px(col * c.cellW),
              y1 - y0
            );
        });
      }
      artCtx.fillStyle = '#000';
      artCtx.fill();
      artCtx.globalCompositeOperation = 'source-in';
      artCtx.drawImage(c.full, 0, 0);
      artCtx.globalCompositeOperation = 'source-over';
      setText(artCtx);
      artCtx.fillStyle = c.base;
      for (const [col, r] of edge) {
        artCtx.fillText(
          GLITCH[Math.floor(hash(col, r, flicker) * GLITCH.length)],
          col * c.cellW,
          r * c.cellH
        );
      }
    }
    // Caption under the art, spaced out like a map label.
    setText(artCtx);
    artCtx.globalAlpha = reveal;
    artCtx.fillStyle = `rgba(${BASE}, 0.55)`;
    artCtx.fillText(
      c.scene.caption.split('').join(' '),
      0,
      rows * c.cellH + c.cellH * 0.6
    );
    artCtx.globalAlpha = 1;

    if (lit === c.lit) return;
    c.lit = lit;
    glowCtx.setTransform(1, 0, 0, 1, 0, 0);
    glowCtx.clearRect(0, 0, glow.width, glow.height);
    if (!lit) return;
    setText(glowCtx);
    glowCtx.fillStyle = c.tone;
    lines.forEach((line, r) =>
      line.forEach((chr, col) => {
        if (chr !== ' ' && isGlow(r, col))
          glowCtx.fillText(chr, col * c.cellW, r * c.cellH);
      })
    );
  }

  function setReveal(reveal, now = 0) {
    renderArt(reveal, Math.floor(now / 80));
    if (!beam.hidden) beam.style.opacity = reveal;
  }

  function fade(from, to, done) {
    cancelAnimationFrame(raf);
    const start = performance.now();
    let last = -Infinity;
    const step = now => {
      const t = Math.min(1, (now - start) / FADE_MS);
      if (now - last >= FADE_FRAME_MS || t === 1) {
        last = now;
        setReveal(from + (to - from) * ease(t), now);
      }
      if (t < 1) raf = requestAnimationFrame(step);
      else done?.();
    };
    raf = requestAnimationFrame(step);
  }

  function play() {
    showScene(SCENES[index]);
    setReveal(0);
    fade(0, 1);
    timer = setTimeout(
      () =>
        fade(1, 0, () => {
          index = (index + 1) % SCENES.length;
          slot++;
          play();
        }),
      SCENE_MS - FADE_MS
    );
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
      dust[1].animate([{ opacity: 0.6 }, { opacity: 1 }], { duration: 5300, ...SWING }),
      float.animate(
        [
          { transform: 'translate3d(0, -5px, 0)' },
          { transform: 'translate3d(0, 5px, 0)' }
        ],
        { duration: 5500, ...SWING }
      )
    ];
  }

  function apply() {
    clearTimeout(timer);
    cancelAnimationFrame(raf);
    for (const a of [...ambient, ...sceneMotion]) a.cancel();
    ambient = [];
    sceneMotion = [];
    root.hidden = mode === 'off';
    root.classList.toggle('is-still', !animated());
    if (mode === 'off') return;
    if (animated()) {
      startAmbient();
      play();
    } else {
      showScene(SCENES[index]);
      setReveal(1);
    }
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
