export function fireConfetti() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (document.getElementById('eft-confetti')) return;
  const c = document.createElement('canvas');
  c.id = 'eft-confetti';
  document.body.appendChild(c);
  const ctx = c.getContext('2d');
  const DPR = Math.min(2, devicePixelRatio || 1);
  const rs = () => {
    c.width = innerWidth * DPR;
    c.height = innerHeight * DPR;
  };
  rs();
  const onResize = () => rs();
  addEventListener('resize', onResize, { passive: true });

  const count = Math.min(300, innerWidth < 600 ? 140 : 260);
  const colors = ['#d6b986', '#a7895f', '#90a4ae', '#cfd8dc', '#7fb27f', '#e57373'];
  const parts = Array.from({ length: count }, () => ({
    x: Math.random() * c.width,
    y: -Math.random() * c.height * 0.3,
    r: 4 + Math.random() * 6,
    vx: (Math.random() * 2 - 1) * 1.1 * DPR,
    vy: (1.6 + Math.random() * 2.4) * DPR,
    rot: Math.random() * Math.PI,
    vr: (Math.random() * 2 - 1) * 0.15,
    color: colors[(Math.random() * colors.length) | 0]
  }));
  const t0 = performance.now();
  const DUR = 2300;
  (function tick(t) {
    ctx.clearRect(0, 0, c.width, c.height);
    parts.forEach(p => {
      p.vy += 0.04 * DPR;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.r, -p.r * 0.4, p.r * 2, p.r * 0.8);
      ctx.restore();
    });
    if (t - t0 < DUR) requestAnimationFrame(tick);
    else {
      removeEventListener('resize', onResize);
      c.remove();
    }
  })(t0);
}
