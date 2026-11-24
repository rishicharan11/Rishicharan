/* Pixel cursor trail: a vanilla port of the "pixel-trail" React component (21st.dev, PixelCursorTrail).
   Same behaviour and constants: a square pixel drops every time the pointer travels more than PIXEL_SIZE,
   at most TRAIL_LENGTH pixels live at once, each fades by FADE_SPEED per frame and shrinks with age
   (size = PIXEL_SIZE * max(0.3, 1 - age / 100)).
   Portfolio adaptations: it runs over the whole page on one canvas (no React re-render per frame),
   keeps the normal cursor (links stay usable), picks the pixel colour from the section under the
   pointer (blue on light grounds, white on blue/black), and is off for touch and reduced motion. */
(() => {
  const fine = matchMedia('(hover: hover) and (pointer: fine)');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  if (!fine.matches || reduce.matches) return;

  const PIXEL_SIZE = 12;
  const TRAIL_LENGTH = 40;
  const FADE_SPEED = 0.04;
  const ON_LIGHT = '#232de4'; // --blue
  const ON_DARK = '#ffffff';  // --white

  const canvas = document.createElement('canvas');
  canvas.className = 'pixel-trail';
  canvas.setAttribute('aria-hidden', 'true');
  Object.assign(canvas.style, {
    position: 'fixed', inset: '0', width: '100vw', height: '100vh',
    pointerEvents: 'none', zIndex: '90'
  });
  document.body.appendChild(canvas);
  const ctx = canvas.getContext('2d');

  let dpr = 1;
  function resize() {
    dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(innerWidth * dpr);
    canvas.height = Math.round(innerHeight * dpr);
  }
  resize();
  addEventListener('resize', resize);

  // colour of the nearest painted background under a point
  const cache = new WeakMap();
  function groundIsLight(el) {
    for (let n = el; n && n !== document.documentElement; n = n.parentElement) {
      if (cache.has(n)) return cache.get(n);
      const m = getComputedStyle(n).backgroundColor.match(/[\d.]+/g);
      if (m && (m.length < 4 || +m[3] > 0.5)) {
        const [r, g, b] = m.map(Number);
        const light = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.6;
        cache.set(n, light);
        return light;
      }
    }
    return true; // page ground is white
  }

  let pixels = [];
  let last = { x: -999, y: -999 };
  let raf = 0;

  addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse') return;
    const x = e.clientX, y = e.clientY;
    const dx = x - last.x, dy = y - last.y;
    if (Math.sqrt(dx * dx + dy * dy) <= PIXEL_SIZE) return;
    last = { x, y };
    const under = document.elementFromPoint(x, y);
    const colour = under && !groundIsLight(under) ? ON_DARK : ON_LIGHT;
    pixels = [...pixels.slice(-TRAIL_LENGTH), { x, y, opacity: 1, age: 0, colour }];
    if (!raf) raf = requestAnimationFrame(frame);
  }, { passive: true });

  // the trail sticks to the screen, not the page, so scrolling keeps it under the pointer
  function frame() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    pixels = pixels
      .map(p => ({ ...p, opacity: p.opacity - FADE_SPEED, age: p.age + 1 }))
      .filter(p => p.opacity > 0);
    for (const p of pixels) {
      const size = PIXEL_SIZE * Math.max(0.3, 1 - p.age / 100);
      ctx.globalAlpha = p.opacity;
      ctx.fillStyle = p.colour;
      ctx.fillRect(p.x - size / 2, p.y - size / 2, size, size);
    }
    ctx.globalAlpha = 1;
    raf = pixels.length ? requestAnimationFrame(frame) : 0;
  }

  // stop drawing when the tab is hidden or the user switches reduced motion on
  document.addEventListener('visibilitychange', () => { if (document.hidden) { pixels = []; } });
  reduce.addEventListener?.('change', () => { if (reduce.matches) { pixels = []; canvas.remove(); } });
})();
