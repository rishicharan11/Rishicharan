/* Pixel Breaker: a small brick-breaker in the footer.
   Skill "slabs" float at the top in the brand palette; bounce the ball off the paddle to break them.
   A broken slab leaves a dashed outline, and every so often a new slab drops into an empty slot.
   Clear a wave for a bonus and a slightly faster ball. Three lives.
   Controls: mouse or touch drag moves the paddle, arrow keys too; Space or a click/tap launches the ball.
   The page keeps its own scrolling: keys are only captured while the game frame has focus.
   No libraries; one canvas; runs only while the footer is on screen. */
(() => {
  const root = document.querySelector('#footer .bk');
  if (!root) return;
  const frame = root.querySelector('.bk-frame');
  const field = root.querySelector('.bk-field');
  const canvas = root.querySelector('.bk-canvas');
  const ctx = canvas.getContext('2d');
  const msg = root.querySelector('.bk-msg');
  const msgText = root.querySelector('.bk-msg__t');
  const scoreEl = root.querySelector('.bk-score-n');
  const livesEl = root.querySelector('.bk-lives-n');
  const hearts = [...root.querySelectorAll('.bk-hearts svg')];
  const pauseBtn = root.querySelector('.bk-pause');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');

  const C = { blue: '#232de4', white: '#ffffff', coral: '#e26255', black: '#0a0a0a' };
  const SKILLS = ['UI/UX design', 'User research', 'Dashboards', 'Visual design', 'Prototyping', 'Figma', 'AI',
    'Web design', 'Workshops', 'Design systems', 'Mobile apps', 'Product design', 'Interaction', 'CX design',
    'Experiments', 'Brand design', 'Design ops', 'Wireframes', 'Usability'];
  // slab looks: [fill, text, border]
  const LOOKS = {
    white: [C.white, C.blue, null],
    line: [null, C.white, C.white],
    coral: [C.coral, C.black, null],
    black: [C.black, C.white, null]
  };
  const LOOK_BAG = ['white', 'white', 'white', 'line', 'line', 'coral', 'coral', 'black'];
  const MAX_LIVES = 3;

  let W = 0, H = 0, dpr = 1, fs = 20;
  let slabs = [], parts = [], trail = [];
  let paddle = { x: 0, w: 200, h: 24, y: 0, tx: 0, v: 0 };
  let ball = { x: 0, y: 0, vx: 0, vy: 0, r: 9, stuck: true };
  let score = 0, lives = MAX_LIVES, wave = 1, over = false, paused = false, visible = false;
  let keys = { left: false, right: false };
  let raf = 0, lastT = 0, clock = 0, refillAt = 0;

  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = arr => arr[Math.floor(Math.random() * arr.length)];
  const shuffle = arr => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; };
  const font = size => `500 ${size}px Geist, "Geist Fallback", Arial, sans-serif`;
  const speed = () => Math.min(Math.max(W * 0.4, 330), 600) * (1 + (wave - 1) * 0.07);

  /* ---------- layout ---------- */
  function resize() {
    const r = field.getBoundingClientRect();
    W = Math.max(1, Math.round(r.width)); H = Math.max(1, Math.round(r.height));
    dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr);
    fs = W < 560 ? 12 : W < 900 ? 15 : W < 1150 ? 19 : 22;
    paddle.w = Math.min(Math.max(W * 0.15, 104), 240);
    paddle.h = W < 560 ? 20 : 26;
    paddle.y = H - (W < 560 ? 40 : 52);
    ball.r = W < 560 ? 7 : 9;
    paddle.x = Math.min(Math.max(paddle.x || W / 2, paddle.w / 2 + 8), W - paddle.w / 2 - 8);
    paddle.tx = paddle.x;
    layout(false);
    if (ball.stuck) stick();
    draw();
  }

  // pack slabs into justified rows that fill the width (like the reference)
  function layout(fresh) {
    const pad = W < 560 ? 12 : 24, gap = W < 560 ? 6 : 12, h = fs * 2.3, rowGap = W < 560 ? 8 : 12;
    const top = W < 560 ? 16 : 22;
    const maxRows = W < 560 ? 5 : W < 900 ? 4 : 3;
    ctx.font = font(fs);
    let words;
    if (fresh || !slabs.length) {
      words = shuffle(SKILLS.slice()).map(t => ({ text: t.toUpperCase(), look: pick(LOOK_BAG) }));
    } else {
      words = slabs.map(s => ({ text: s.text, look: s.look, alive: s.alive, ghost: s.ghost }));
    }
    const rows = [[]]; let used = 0;
    const avail = W - pad * 2;
    for (const w of words) {
      const bw = ctx.measureText(w.text).width + fs * 2.6;
      if (used && used + gap + bw > avail) {
        if (rows.length >= maxRows) break;
        rows.push([]); used = 0;
      }
      rows[rows.length - 1].push({ ...w, bw });
      used += (used ? gap : 0) + bw;
    }
    const out = [];
    rows.forEach((row, ri) => {
      const total = row.reduce((a, w) => a + w.bw, 0) + gap * (row.length - 1);
      const extra = row.length > 1 || total > avail * 0.7 ? (avail - total) / row.length : 0;
      let x = pad + (extra ? 0 : (avail - total) / 2);
      row.forEach(w => {
        const ww = w.bw + extra;
        out.push({
          text: w.text, look: w.look, x, y: top + ri * (h + rowGap), w: ww, h,
          alive: w.alive !== undefined ? w.alive : true, ghost: w.ghost || 0,
          phase: Math.random() * Math.PI * 2, drop: fresh ? 1 : 0, pop: 0, delay: fresh ? (ri * 0.08 + Math.random() * 0.12) : 0
        });
        x += ww + gap;
      });
    });
    slabs = out;
  }

  /* ---------- game state ---------- */
  function stick() {
    ball.stuck = true; ball.vx = 0; ball.vy = 0;
    ball.x = paddle.x; ball.y = paddle.y - paddle.h / 2 - ball.r - 2;
    trail = [];
  }
  function launch() {
    if (over) { restart(); return; }
    if (paused) { setPaused(false); return; }
    if (!ball.stuck) return;
    const a = rand(-0.35, 0.35);
    const sp = speed();
    ball.vx = Math.sin(a) * sp; ball.vy = -Math.cos(a) * sp;
    ball.stuck = false;
    say(null);
    if (!refillAt) refillAt = clock + 10;
  }
  function restart() {
    score = 0; lives = MAX_LIVES; wave = 1; over = false; refillAt = 0;
    layout(true); stick(); hud(); say('Press space or click to play');
  }
  function newWave(bonus) {
    if (bonus) { score += 250; wave += 1; }
    layout(true);
    if (!ball.stuck) { const sp = speed(), m = Math.hypot(ball.vx, ball.vy) || 1; ball.vx *= sp / m; ball.vy *= sp / m; }
    hud();
  }
  function loseLife() {
    lives -= 1; hud();
    burst(ball.x, H - 6, 14, true);
    if (lives <= 0) { over = true; ball.stuck = true; say(`Game over · ${String(score).padStart(5, '0')} · click to replay`); return; }
    stick(); say('Ball lost · space to bounce');
  }
  function hud() {
    scoreEl.textContent = String(score).padStart(5, '0');
    livesEl.textContent = String(Math.max(lives, 0));
    hearts.forEach((h, i) => h.classList.toggle('is-lost', i >= lives));
  }
  function say(text) {
    if (!text) { msg.classList.add('is-hidden'); return; }
    msgText.textContent = text; msg.classList.remove('is-hidden');
  }
  function setPaused(p) {
    paused = p; pauseBtn.setAttribute('aria-pressed', String(p)); pauseBtn.setAttribute('aria-label', p ? 'Resume' : 'Pause');
    if (p) say('Paused · space to resume'); else if (!ball.stuck) say(null); else if (!over) say('Press space or click to play');
  }

  /* ---------- particles ---------- */
  function burst(x, y, n, white) {
    const count = reduce.matches ? Math.ceil(n / 3) : n;
    for (let i = 0; i < count; i++) {
      const a = rand(0, Math.PI * 2), sp = rand(80, 320);
      parts.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 60, rot: rand(0, 6), vr: rand(-8, 8),
        s: rand(5, 11), life: 1, tri: Math.random() < 0.55, col: white && Math.random() < 0.5 ? C.white : C.coral });
    }
  }

  /* ---------- physics ---------- */
  function slabY(s) { return s.y + (reduce.matches ? 0 : Math.sin(clock * 1.3 + s.phase) * 2.5) - s.drop * (s.y + s.h + 40); }

  function step(dt) {
    clock += dt;
    // paddle: keys give velocity, pointer gives a target
    const kv = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    if (kv) paddle.tx = paddle.x + kv * W * 1.1 * dt;
    paddle.tx = Math.min(Math.max(paddle.tx, paddle.w / 2 + 8), W - paddle.w / 2 - 8);
    const prev = paddle.x;
    paddle.x += (paddle.tx - paddle.x) * Math.min(1, dt * 18);
    paddle.v = (paddle.x - prev) / Math.max(dt, 1e-3);

    // slabs drop in / pop in
    for (const s of slabs) {
      if (s.delay > 0) { s.delay -= dt; continue; }
      if (s.drop > 0) s.drop = Math.max(0, s.drop - dt * 2.2);
      if (s.pop > 0) s.pop = Math.max(0, s.pop - dt * 3);
      if (!s.alive && s.ghost < 1) s.ghost = Math.min(1, s.ghost + dt * 3);
    }
    // a new slab drops into an empty slot every so often
    if (refillAt && clock > refillAt && !over) {
      const empty = slabs.filter(s => !s.alive);
      if (empty.length) { const s = pick(empty); s.alive = true; s.ghost = 0; s.pop = 1; s.look = pick(LOOK_BAG); }
      refillAt = clock + rand(8, 13);
    }

    if (ball.stuck) { ball.x = paddle.x; ball.y = paddle.y - paddle.h / 2 - ball.r - 2; }
    else {
      const sp = Math.hypot(ball.vx, ball.vy);
      const n = Math.max(1, Math.ceil(sp * dt / (ball.r * 0.6)));
      for (let i = 0; i < n && !ball.stuck; i++) move(dt / n);
      trail.push({ x: ball.x, y: ball.y });
      if (trail.length > 16) trail.shift();
    }

    for (const p of parts) { p.vy += 520 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt; p.life -= dt * 1.3; }
    parts = parts.filter(p => p.life > 0);
  }

  function move(dt) {
    ball.x += ball.vx * dt; ball.y += ball.vy * dt;
    const r = ball.r;
    if (ball.x < r) { ball.x = r; ball.vx = Math.abs(ball.vx); }
    if (ball.x > W - r) { ball.x = W - r; ball.vx = -Math.abs(ball.vx); }
    if (ball.y < r) { ball.y = r; ball.vy = Math.abs(ball.vy); }
    if (ball.y > H + r * 2) { loseLife(); return; }

    // paddle: the bounce angle depends on where the ball lands
    const px = paddle.x - paddle.w / 2, py = paddle.y - paddle.h / 2;
    if (ball.vy > 0 && ball.y + r >= py && ball.y - r <= py + paddle.h && ball.x >= px - r && ball.x <= px + paddle.w + r) {
      const off = Math.max(-1, Math.min(1, (ball.x - paddle.x) / (paddle.w / 2 + r)));
      const a = off * 1.05 + Math.max(-0.2, Math.min(0.2, paddle.v / 4000));
      const sp = speed();
      ball.vx = Math.sin(a) * sp; ball.vy = -Math.abs(Math.cos(a) * sp);
      ball.y = py - r - 0.5;
      paddle.hit = 1;
    }

    // slabs
    for (const s of slabs) {
      if (!s.alive || s.drop > 0.05 || s.delay > 0) continue;
      const sy = slabY(s);
      const cx = Math.max(s.x, Math.min(ball.x, s.x + s.w));
      const cy = Math.max(sy, Math.min(ball.y, sy + s.h));
      const dx = ball.x - cx, dy = ball.y - cy;
      if (dx * dx + dy * dy > r * r) continue;
      // reflect on the shallower overlap
      const ox = Math.min(ball.x + r - s.x, s.x + s.w - (ball.x - r));
      const oy = Math.min(ball.y + r - sy, sy + s.h - (ball.y - r));
      if (ox < oy) { ball.vx = ball.x < s.x + s.w / 2 ? -Math.abs(ball.vx) : Math.abs(ball.vx); }
      else { ball.vy = ball.y < sy + s.h / 2 ? -Math.abs(ball.vy) : Math.abs(ball.vy); }
      s.alive = false; s.ghost = 0;
      score += 50; hud();
      burst(ball.x, ball.y, 10, false);
      if (!slabs.some(t => t.alive)) { burst(W / 2, H / 3, 30, true); newWave(true); say(`Wave ${wave}`); setTimeout(() => { if (!ball.stuck && !paused) say(null); }, 1100); }
      break;
    }
  }

  /* ---------- drawing ---------- */
  function pill(x, y, w, h) {
    const r = h / 2;
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.lineTo(x + w - r, y); ctx.arc(x + w - r, y + r, r, -Math.PI / 2, Math.PI / 2);
    ctx.lineTo(x + r, y + h); ctx.arc(x + r, y + r, r, Math.PI / 2, Math.PI * 1.5); ctx.closePath();
  }

  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = font(fs);

    for (const s of slabs) {
      if (s.delay > 0) continue;
      const y = slabY(s);
      if (!s.alive) {
        // dashed outline where a slab used to be
        ctx.save(); ctx.globalAlpha = 0.55 * s.ghost; ctx.setLineDash([8, 7]); ctx.lineWidth = 1.5; ctx.strokeStyle = C.white;
        pill(s.x + 0.75, y + 0.75, s.w - 1.5, s.h - 1.5); ctx.stroke(); ctx.restore();
        continue;
      }
      const sc = 1 - s.pop * 0.3;
      ctx.save();
      ctx.translate(s.x + s.w / 2, y + s.h / 2); ctx.scale(sc, sc); ctx.translate(-s.w / 2, -s.h / 2);
      const [fill, text, border] = LOOKS[s.look];
      pill(0, 0, s.w, s.h);
      if (fill) { ctx.fillStyle = fill; ctx.fill(); }
      if (border) { ctx.lineWidth = 2; ctx.strokeStyle = border; pill(1, 1, s.w - 2, s.h - 2); ctx.stroke(); }
      ctx.fillStyle = text; ctx.fillText(s.text, s.w / 2, s.h / 2 + 1);
      ctx.restore();
    }

    // ball trail: a fading streak
    if (trail.length > 1 && !reduce.matches) {
      ctx.lineCap = 'round';
      for (let i = 1; i < trail.length; i++) {
        const k = i / trail.length;
        ctx.strokeStyle = `rgba(255,255,255,${k * 0.35})`;
        ctx.lineWidth = ball.r * 2 * k * 0.9;
        ctx.beginPath(); ctx.moveTo(trail[i - 1].x, trail[i - 1].y); ctx.lineTo(trail[i].x, trail[i].y); ctx.stroke();
      }
    }

    // particles: coral and white confetti
    for (const p of parts) {
      ctx.save(); ctx.globalAlpha = Math.max(0, p.life); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.fillStyle = p.col;
      if (p.tri) { ctx.beginPath(); ctx.moveTo(0, -p.s / 2); ctx.lineTo(p.s / 2, p.s / 2); ctx.lineTo(-p.s / 2, p.s / 2); ctx.closePath(); ctx.fill(); }
      else ctx.fillRect(-p.s / 4, -p.s / 2, p.s / 2, p.s);
      ctx.restore();
    }

    // ball
    ctx.fillStyle = C.white; ctx.beginPath(); ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2); ctx.fill();

    // paddle: white pill with a coral bar
    const squash = paddle.hit ? paddle.hit * 3 : 0;
    const px = paddle.x - paddle.w / 2, py = paddle.y - paddle.h / 2 + squash;
    ctx.fillStyle = C.white; pill(px, py, paddle.w, paddle.h - squash); ctx.fill();
    const bw = paddle.w * 0.32, bh = Math.max(5, paddle.h * 0.26);
    ctx.fillStyle = C.coral; pill(paddle.x - bw / 2, py + (paddle.h - squash) / 2 - bh / 2, bw, bh); ctx.fill();
  }

  /* ---------- loop ---------- */
  function frameLoop(t) {
    const dt = Math.min(0.033, (t - (lastT || t)) / 1000);
    lastT = t;
    if (!paused) {
      step(dt);
      if (paddle.hit) paddle.hit = Math.max(0, paddle.hit - dt * 6);
    }
    draw();
    raf = visible ? requestAnimationFrame(frameLoop) : 0;
  }
  function run() { if (!raf && visible) { lastT = 0; raf = requestAnimationFrame(frameLoop); } }

  /* ---------- input ---------- */
  const toLocal = e => e.clientX - field.getBoundingClientRect().left;
  canvas.addEventListener('pointermove', e => { paddle.tx = toLocal(e); });
  canvas.addEventListener('pointerdown', e => {
    paddle.tx = toLocal(e);
    frame.focus({ preventScroll: true });
    if (e.pointerType === 'mouse') launch();
  });
  canvas.addEventListener('pointerup', e => { if (e.pointerType !== 'mouse') launch(); });

  frame.addEventListener('keydown', e => {
    if (e.target.closest('button')) return; // let the HUD buttons handle Space/Enter
    if (e.key === 'ArrowLeft' || e.key === 'a') { keys.left = true; e.preventDefault(); }
    else if (e.key === 'ArrowRight' || e.key === 'd') { keys.right = true; e.preventDefault(); }
    else if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); launch(); }
    else if (e.key === 'p') { e.preventDefault(); if (!over) setPaused(!paused); }
  });
  frame.addEventListener('keyup', e => {
    if (e.key === 'ArrowLeft' || e.key === 'a') keys.left = false;
    if (e.key === 'ArrowRight' || e.key === 'd') keys.right = false;
  });
  frame.addEventListener('focusout', () => { keys.left = keys.right = false; });

  root.querySelector('.bk-wave').addEventListener('click', () => { if (over) restart(); else newWave(false); });
  pauseBtn.addEventListener('click', () => { if (!over) setPaused(!paused); });
  root.querySelector('.bk-full').addEventListener('click', () => {
    if (document.fullscreenElement) document.exitFullscreen?.();
    else frame.requestFullscreen?.().then(() => frame.focus({ preventScroll: true })).catch(() => {});
  });
  document.addEventListener('fullscreenchange', () => requestAnimationFrame(resize));

  // run only on screen; pause a ball in flight when the footer leaves the screen or the tab hides
  new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (!visible && !ball.stuck && !over && !paused) setPaused(true);
    run();
  }, { threshold: 0.15 }).observe(field);
  document.addEventListener('visibilitychange', () => { if (document.hidden && !ball.stuck && !over) setPaused(true); });
  new ResizeObserver(() => resize()).observe(field);

  hud();
  resize();
  layout(true);
  (document.fonts?.ready || Promise.resolve()).then(() => { layout(true); stick(); draw(); });
})();
