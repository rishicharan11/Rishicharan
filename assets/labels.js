/* Footer skill labels: a tiny 2D rigid-body sandbox for stadium-shaped DOM pills.
   Capsule collision (segment + radius), sequential impulses with friction and restitution,
   position projection, per-body sleeping, pointer drag and throw. No libraries. */
(() => {
  'use strict';
  const play = document.querySelector('#footer [data-lb-play]');
  if (!play) return;
  const list = play.querySelector('.lb-pills');
  const els = Array.from(play.querySelectorAll('.lb-pill'));
  if (!list || !els.length || !('requestAnimationFrame' in window)) return;

  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)');

  // ---- tuning ----
  const G = 2600;            // gravity px/s^2
  const DT = 1 / 120;        // fixed step
  const ITER = 10;           // velocity iterations
  const POS_ITER = 3;        // position projection passes
  const SLOP = 0.6;          // allowed penetration px
  const MARGIN = 2;         // speculative contact distance px (keeps resting contacts alive)
  const E = 0.18;            // restitution
  const MU = 0.55;           // pill-pill friction
  const MU_WALL = 0.7;       // floor/wall friction
  const VMAX = 3200;         // speed clamp px/s
  const WMAX = 18;           // angular speed clamp rad/s
  const SLEEP_V = 9, SLEEP_W = 0.12, SLEEP_T = 0.5;

  let W = 0, H = 0, floor = 0;
  let bodies = [];
  let running = false, visible = false, started = false, raf = 0, last = 0, acc = 0;
  let drag = null;           // { b, lx, ly, tx, ty, id, ix, iy }

  // ---- bodies ----
  function measure(b) {
    const w = b.el.offsetWidth, h = b.el.offsetHeight;
    b.bw = w; b.bh = h; b.r = h / 2; b.hl = Math.max(0, (w - h) / 2);
    b.m = w * h * 0.001; b.im = 1 / b.m;
    b.I = b.m * (w * w + h * h) / 12; b.iI = 1 / b.I;
  }
  function makeBodies() {
    bodies = els.map((el, i) => {
      const b = { el, i, x: 0, y: 0, a: 0, vx: 0, vy: 0, av: 0, asleep: false, still: 0 };
      measure(b);
      return b;
    });
  }
  function readBounds() {
    W = play.clientWidth; H = play.clientHeight;
    const pb = parseFloat(getComputedStyle(list).paddingBottom) || 0;
    floor = H - pb;
  }
  function spawn() {
    // drop in from above, spread over the width, staggered in height
    const order = bodies.map((b, i) => i).sort(() => Math.random() - 0.5);
    const cols = Math.max(2, Math.floor(W / 220));
    order.forEach((idx, k) => {
      const b = bodies[idx];
      const col = k % cols;
      const span = Math.max(W - b.bw - 20, 1);
      const cx = (col + 0.5) / cols;
      b.x = Math.min(Math.max(b.bw / 2 + 10, cx * span + b.bw / 2 + 10 + (Math.random() - 0.5) * 60), W - b.bw / 2 - 10);
      b.y = -b.bh - Math.floor(k / cols) * (b.bh * 3.2) - Math.random() * b.bh * 1.6 - 20;
      b.a = Math.random() < 0.12 ? Math.PI + (Math.random() - 0.5) * 0.5 : (Math.random() - 0.5) * 0.9;
      b.vx = (Math.random() - 0.5) * 120; b.vy = 200 + Math.random() * 200;
      b.av = (Math.random() - 0.5) * 3;
      b.asleep = false; b.still = 0;
    });
  }

  // ---- geometry helpers ----
  function ends(b) {
    const c = Math.cos(b.a) * b.hl, s = Math.sin(b.a) * b.hl;
    return [b.x - c, b.y - s, b.x + c, b.y + s];
  }
  function closestOnSeg(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
    let t = l2 > 1e-9 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return [ax + dx * t, ay + dy * t, t];
  }
  function segSeg(a0x, a0y, a1x, a1y, b0x, b0y, b1x, b1y) {
    // closest points between two segments
    const d1x = a1x - a0x, d1y = a1y - a0y, d2x = b1x - b0x, d2y = b1y - b0y;
    const rx = a0x - b0x, ry = a0y - b0y;
    const a = d1x * d1x + d1y * d1y, e = d2x * d2x + d2y * d2y, f = d2x * rx + d2y * ry;
    let s, t;
    if (a < 1e-9 && e < 1e-9) { s = 0; t = 0; }
    else if (a < 1e-9) { s = 0; t = Math.min(1, Math.max(0, f / e)); }
    else {
      const c = d1x * rx + d1y * ry;
      if (e < 1e-9) { t = 0; s = Math.min(1, Math.max(0, -c / a)); }
      else {
        const bb = d1x * d2x + d1y * d2y, den = a * e - bb * bb;
        s = den > 1e-9 ? Math.min(1, Math.max(0, (bb * f - c * e) / den)) : 0;
        t = (bb * s + f) / e;
        if (t < 0) { t = 0; s = Math.min(1, Math.max(0, -c / a)); }
        else if (t > 1) { t = 1; s = Math.min(1, Math.max(0, (bb - c) / a)); }
      }
    }
    return [a0x + d1x * s, a0y + d1y * s, b0x + d2x * t, b0y + d2y * t];
  }

  // ---- contacts ----
  // contact: { A, B (null = static), nx, ny (A->B), px, py, pen, mu }
  let contacts = [];
  function pushCand(cands, ax, ay, bx, by, rs) {
    let dx = bx - ax, dy = by - ay;
    const d = Math.hypot(dx, dy);
    if (d >= rs + MARGIN) return;
    if (d < 1e-6) { dx = 0; dy = 1; } else { dx /= d; dy /= d; }
    cands.push({ nx: dx, ny: dy, pen: rs - d, px: ax + dx * (d * 0.5), py: ay + dy * (d * 0.5) });
  }
  function collidePair(A, B, out) {
    const rs = A.r + B.r;
    const dx = B.x - A.x, dy = B.y - A.y, lim = A.hl + B.hl + rs;
    if (dx * dx + dy * dy > lim * lim) return;
    const [a0x, a0y, a1x, a1y] = ends(A), [b0x, b0y, b1x, b1y] = ends(B);
    const cands = [];
    let q;
    q = closestOnSeg(a0x, a0y, b0x, b0y, b1x, b1y); pushCand(cands, a0x, a0y, q[0], q[1], rs);
    q = closestOnSeg(a1x, a1y, b0x, b0y, b1x, b1y); pushCand(cands, a1x, a1y, q[0], q[1], rs);
    q = closestOnSeg(b0x, b0y, a0x, a0y, a1x, a1y); pushCand(cands, q[0], q[1], b0x, b0y, rs);
    q = closestOnSeg(b1x, b1y, a0x, a0y, a1x, a1y); pushCand(cands, q[0], q[1], b1x, b1y, rs);
    const ss = segSeg(a0x, a0y, a1x, a1y, b0x, b0y, b1x, b1y);
    pushCand(cands, ss[0], ss[1], ss[2], ss[3], rs);
    if (!cands.length) return;
    // segments crossing: the segSeg normal is degenerate, use centre direction
    for (const c of cands) {
      if (c.pen >= rs - 1e-3) {
        const d = Math.hypot(dx, dy) || 1;
        c.nx = dx / d; c.ny = dy / d;
      }
    }
    cands.sort((u, v) => v.pen - u.pen);
    const first = cands[0];
    out.push({ A, B, nx: first.nx, ny: first.ny, px: first.px, py: first.py, pen: first.pen, mu: MU, jn: 0, jt: 0 });
    // second manifold point: farthest candidate with a similar normal
    let best = null, bd = 4;
    for (let k = 1; k < cands.length; k++) {
      const c = cands[k];
      if (c.nx * first.nx + c.ny * first.ny < 0.9) continue;
      const dd = (c.px - first.px) ** 2 + (c.py - first.py) ** 2;
      if (dd > bd) { bd = dd; best = c; }
    }
    if (best) out.push({ A, B, nx: first.nx, ny: first.ny, px: best.px, py: best.py, pen: best.pen, mu: MU, jn: 0, jt: 0 });
  }
  function collideWalls(b, out) {
    const [x0, y0, x1, y1] = ends(b), r = b.r;
    const pts = b.hl > 0 ? [[x0, y0], [x1, y1]] : [[x0, y0]];
    for (const [px, py] of pts) {
      let pen = py + r - floor;
      if (pen > -MARGIN) out.push({ A: b, B: null, nx: 0, ny: 1, px, py: floor, pen, mu: MU_WALL, jn: 0, jt: 0 });
      pen = r - px;
      if (pen > -MARGIN) out.push({ A: b, B: null, nx: -1, ny: 0, px: 0, py, pen, mu: MU_WALL, jn: 0, jt: 0 });
      pen = px + r - W;
      if (pen > -MARGIN) out.push({ A: b, B: null, nx: 1, ny: 0, px: W, py, pen, mu: MU_WALL, jn: 0, jt: 0 });
    }
  }
  function detect() {
    const out = [];
    for (let i = 0; i < bodies.length; i++) {
      const A = bodies[i];
      collideWalls(A, out);
      for (let j = i + 1; j < bodies.length; j++) {
        const B = bodies[j];
        if (A.asleep && B.asleep) { collidePair(A, B, out); continue; }
        collidePair(A, B, out);
      }
    }
    return out;
  }

  // effective inverse mass/inertia (sleeping or held bodies behave differently)
  const imOf = b => (!b || b.asleep) ? 0 : b.im;
  const iIOf = b => (!b || b.asleep) ? 0 : b.iI;

  function prepare(c) {
    const A = c.A, B = c.B;
    c.rax = c.px - A.x; c.ray = c.py - A.y;
    c.rbx = B ? c.px - B.x : 0; c.rby = B ? c.py - B.y : 0;
    const imA = imOf(A), iIA = iIOf(A), imB = imOf(B), iIB = iIOf(B);
    const rnA = c.rax * c.ny - c.ray * c.nx, rnB = c.rbx * c.ny - c.rby * c.nx;
    const kn = imA + imB + rnA * rnA * iIA + rnB * rnB * iIB;
    c.mn = kn > 0 ? 1 / kn : 0;
    const tx = -c.ny, ty = c.nx;
    const rtA = c.rax * ty - c.ray * tx, rtB = c.rbx * ty - c.rby * tx;
    const kt = imA + imB + rtA * rtA * iIA + rtB * rtB * iIB;
    c.mt = kt > 0 ? 1 / kt : 0;
    const vn = relVel(c, c.nx, c.ny);
    c.bounce = c.pen < 0 ? c.pen / DT : vn < -90 ? -E * vn : 0;
  }
  function relVel(c, nx, ny) {
    const A = c.A, B = c.B;
    let vbx = 0, vby = 0;
    if (B) { vbx = B.vx - B.av * c.rby; vby = B.vy + B.av * c.rbx; }
    const vax = A.vx - A.av * c.ray, vay = A.vy + A.av * c.rax;
    return (vbx - vax) * nx + (vby - vay) * ny;
  }
  function applyImp(c, jx, jy) {
    const A = c.A, B = c.B;
    if (!A.asleep) { A.vx -= jx * A.im; A.vy -= jy * A.im; A.av -= (c.rax * jy - c.ray * jx) * A.iI; }
    if (B && !B.asleep) { B.vx += jx * B.im; B.vy += jy * B.im; B.av += (c.rbx * jy - c.rby * jx) * B.iI; }
  }
  function solve(c) {
    if (c.mn === 0) return;
    // friction first (uses previous normal impulse), then normal
    const tx = -c.ny, ty = c.nx;
    let jt = -relVel(c, tx, ty) * c.mt;
    const maxF = c.mu * c.jn, old = c.jt;
    c.jt = Math.max(-maxF, Math.min(maxF, old + jt)); jt = c.jt - old;
    applyImp(c, tx * jt, ty * jt);
    let jn = (-relVel(c, c.nx, c.ny) + c.bounce) * c.mn;
    const oldn = c.jn;
    c.jn = Math.max(0, oldn + jn); jn = c.jn - oldn;
    applyImp(c, c.nx * jn, c.ny * jn);
  }

  // ---- mouse joint (soft constraint) ----
  function solveDrag(h) {
    if (!drag) return;
    const b = drag.b;
    const ca = Math.cos(b.a), sa = Math.sin(b.a);
    const rx = drag.lx * ca - drag.ly * sa, ry = drag.lx * sa + drag.ly * ca;
    const px = b.x + rx, py = b.y + ry;
    const hz = 7, zeta = 0.85, om = 2 * Math.PI * hz;
    const d = 2 * b.m * zeta * om, k = b.m * om * om;
    let gamma = h * (d + h * k); gamma = gamma ? 1 / gamma : 0;
    const beta = h * k * gamma;
    const Cx = px - drag.tx, Cy = py - drag.ty;
    const k11 = b.im + b.iI * ry * ry + gamma, k12 = -b.iI * rx * ry, k22 = b.im + b.iI * rx * rx + gamma;
    const det = k11 * k22 - k12 * k12 || 1e-9;
    const vpx = b.vx - b.av * ry, vpy = b.vy + b.av * rx;
    const bx = -(vpx + Cx * beta + gamma * drag.ix), by = -(vpy + Cy * beta + gamma * drag.iy);
    let jx = (k22 * bx - k12 * by) / det, jy = (k11 * by - k12 * bx) / det;
    const ox = drag.ix, oy = drag.iy, maxI = 1200 * b.m * h * 60;
    drag.ix += jx; drag.iy += jy;
    const mag = Math.hypot(drag.ix, drag.iy);
    if (mag > maxI) { drag.ix *= maxI / mag; drag.iy *= maxI / mag; }
    jx = drag.ix - ox; jy = drag.iy - oy;
    b.vx += jx * b.im; b.vy += jy * b.im; b.av += (rx * jy - ry * jx) * b.iI;
  }

  // ---- step ----
  function step(h) {
    for (const b of bodies) {
      if (b.asleep) continue;
      b.vy += G * h;
      b.vx *= 0.9995; b.vy *= 0.9995; b.av *= drag && drag.b === b ? 0.985 : 0.997;
    }
    contacts = detect();
    // wake sleepers that are hit hard or lost their support
    const supported = new Set();
    for (const c of contacts) {
      if (c.ny > 0.35) supported.add(c.A);
      if (c.B && c.ny < -0.35) supported.add(c.B);
      if (c.B && c.A.asleep !== c.B.asleep) {
        const mover = c.A.asleep ? c.B : c.A;
        if (Math.hypot(mover.vx, mover.vy) > 140 || Math.abs(mover.av) > 2) wake(c.A.asleep ? c.A : c.B);
      }
    }
    for (const b of bodies) if (b.asleep && !supported.has(b)) wake(b);
    for (const c of contacts) prepare(c);
    if (drag) { drag.ix = 0; drag.iy = 0; }
    for (let it = 0; it < ITER; it++) {
      solveDrag(h);
      for (const c of contacts) solve(c);
    }
    for (const b of bodies) {
      if (b.asleep) continue;
      const sp = Math.hypot(b.vx, b.vy);
      if (sp > VMAX) { b.vx *= VMAX / sp; b.vy *= VMAX / sp; }
      if (b.av > WMAX) b.av = WMAX; else if (b.av < -WMAX) b.av = -WMAX;
      b.x += b.vx * h; b.y += b.vy * h; b.a += b.av * h;
    }
    // position projection (linear only)
    for (let p = 0; p < POS_ITER; p++) {
      const cs = detect();
      for (const c of cs) {
        const imA = imOf(c.A), imB = imOf(c.B), sum = imA + imB;
        if (sum === 0) continue;
        const corr = Math.max(0, c.pen - SLOP) * 0.45 / sum;
        if (!corr) continue;
        c.A.x -= c.nx * corr * imA; c.A.y -= c.ny * corr * imA;
        if (c.B && imB) { c.B.x += c.nx * corr * imB; c.B.y += c.ny * corr * imB; }
      }
    }
    // keep everything inside the side walls even after violent throws
    for (const b of bodies) {
      if (b.x < 0) b.x = b.r; else if (b.x > W) b.x = W - b.r;
      if (b.y > floor) { b.y = floor - b.r; b.vy = Math.min(b.vy, 0); }
    }
    // sleeping
    for (const b of bodies) {
      if (b.asleep) continue;
      const held = drag && drag.b === b;
      if (!held && !drag && b.y > 0 && Math.hypot(b.vx, b.vy) < SLEEP_V && Math.abs(b.av) < SLEEP_W) {
        b.still += h;
        if (b.still > SLEEP_T) { b.asleep = true; b.vx = b.vy = b.av = 0; }
      } else b.still = 0;
    }
  }
  function wake(b) { b.asleep = false; b.still = 0; }
  function wakeAll() { for (const b of bodies) wake(b); }

  // ---- render ----
  function render() {
    for (const b of bodies) {
      b.el.style.transform = `translate3d(${(b.x - b.bw / 2).toFixed(2)}px, ${(b.y - b.bh / 2).toFixed(2)}px, 0) rotate(${b.a.toFixed(4)}rad)`;
    }
  }

  // ---- loop ----
  function frame(t) {
    raf = 0;
    if (!running) return;
    let d = (t - last) / 1000; last = t;
    if (!(d > 0)) d = DT;
    acc += Math.min(d, 1 / 20);
    let n = 0;
    while (acc >= DT && n < 8) { step(DT); acc -= DT; n++; }
    if (n === 8) acc = 0;
    render();
    if (!drag && bodies.every(b => b.asleep)) { running = false; return; }
    raf = requestAnimationFrame(frame);
  }
  function start() {
    if (running || !visible) return;
    running = true; last = performance.now(); acc = 0;
    raf = requestAnimationFrame(frame);
  }
  function stop() { running = false; if (raf) cancelAnimationFrame(raf); raf = 0; }

  // ---- pointer ----
  function local(e) {
    const r = play.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }
  function onDown(e) {
    if (drag || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const el = e.target.closest && e.target.closest('.lb-pill');
    if (!el || !play.contains(el)) return;     // let the page scroll / select elsewhere
    const b = bodies.find(o => o.el === el);
    if (!b) return;
    e.preventDefault();
    const [x, y] = local(e);
    const dx = x - b.x, dy = y - b.y, ca = Math.cos(-b.a), sa = Math.sin(-b.a);
    drag = { b, id: e.pointerId, lx: dx * ca - dy * sa, ly: dx * sa + dy * ca, tx: x, ty: y, ix: 0, iy: 0 };
    try { play.setPointerCapture(e.pointerId); } catch (_) {}
    el.classList.add('lb-held'); play.classList.add('lb-dragging');
    wakeAll(); start();
  }
  function onMove(e) {
    if (!drag || e.pointerId !== drag.id) return;
    const [x, y] = local(e);
    drag.tx = Math.min(Math.max(x, 0), W);
    drag.ty = Math.min(Math.max(y, drag.b.r), floor);
  }
  function onUp(e) {
    if (!drag || e.pointerId !== drag.id) return;
    drag.b.el.classList.remove('lb-held'); play.classList.remove('lb-dragging');
    try { play.releasePointerCapture(e.pointerId); } catch (_) {}
    drag = null; wakeAll(); start();
  }

  // ---- lifecycle ----
  function enable() {
    play.classList.add('lb-live');
    readBounds();
    makeBodies();
    for (const b of bodies) { b.x = -9999; b.y = -9999; }
    render();
  }
  function disable() {
    stop();
    if (drag) { drag.b.el.classList.remove('lb-held'); drag = null; }
    play.classList.remove('lb-live', 'lb-dragging');
    for (const el of els) el.style.transform = '';
    started = false;
  }
  function onResize() {
    if (!play.classList.contains('lb-live')) return;
    const oldW = W, oldFloor = floor;
    readBounds();
    for (const b of bodies) {
      measure(b);
      if (started) {
        if (oldW > 0) b.x = Math.min(Math.max(b.x * (W / oldW), b.bw / 2), W - b.bw / 2);
        b.y += floor - oldFloor;
      }
    }
    if (started) { wakeAll(); start(); }
  }

  function init() {
    if (reduce.matches) return;
    enable();
    const io = new IntersectionObserver(entries => {
      for (const en of entries) {
        visible = en.isIntersecting;
        if (visible) {
          if (!started) { started = true; readBounds(); for (const b of bodies) measure(b); spawn(); }
          start();
        } else stop();
      }
    }, { threshold: 0.15 });
    io.observe(play);
    play.addEventListener('pointerdown', onDown);
    play.addEventListener('pointermove', onMove);
    play.addEventListener('pointerup', onUp);
    play.addEventListener('pointercancel', onUp);
    play.addEventListener('lostpointercapture', onUp);
    play.addEventListener('dragstart', e => e.preventDefault());
    if ('ResizeObserver' in window) new ResizeObserver(() => onResize()).observe(play);
    else window.addEventListener('resize', onResize);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(onResize);
  }

  reduce.addEventListener && reduce.addEventListener('change', () => {
    if (reduce.matches) disable();
    else if (!play.classList.contains('lb-live')) { enable(); if (visible) { started = true; spawn(); start(); } }
  });

  init();
})();
