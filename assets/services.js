/* Services viewer (Avara-style).
   Click a card: every card is cloned at its spot on the page, the clones fly into a full-screen stage
   (active one large in the middle, neighbours dimmed at the edges), and a detail panel slides in.
   Prev/next, arrow keys and clicking a neighbour move through the services; Esc, the close button or a link
   inside the panel fly the cards back into the row. No libraries: CSS transitions on transform. */
(() => {
  const dialog = document.getElementById('sv');
  const cards = [...document.querySelectorAll('#practice .pr-card')];
  if (!dialog || !cards.length || typeof dialog.showModal !== 'function') return;

  const stage = dialog.querySelector('.sv-stage');
  const body = dialog.querySelector('.sv-body');
  const count = dialog.querySelector('.sv-count');
  const panel = dialog.querySelector('.sv-panel');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const DURATION = 900;

  let clones = [];
  let active = 0;
  let busy = false;
  let opener = null;
  let swapTimer = 0;

  const pad = n => String(n).padStart(2, '0');

  // where the stage is: left of the panel on desktop, above the sheet on phones
  function stageBox() {
    const vw = innerWidth, vh = innerHeight;
    const p = panel.getBoundingClientRect();
    if (vw < 900) {
      const top = vh - (p.height || vh * 0.58) - 8;
      return { x0: 0, x1: vw, y0: 0, y1: top - 64, mobile: true };
    }
    return { x0: 0, x1: vw - (p.width || 400) - 16, y0: 0, y1: vh - 64, mobile: false };
  }

  // target transform for clone i when service `active` is shown
  function target(i) {
    const c = clones[i];
    const box = stageBox();
    const sw = box.x1 - box.x0, sh = box.y1 - box.y0;
    const ratio = c.w / c.h;
    let h = sh * (box.mobile ? 0.8 : 0.74);
    let w = h * ratio;
    const maxW = sw * (box.mobile ? 0.52 : 0.42);
    if (w > maxW) { w = maxW; h = w / ratio; }
    const s = w / c.w;
    const d = i - active;
    const gap = w * (box.mobile ? 1.12 : 1.22);
    const cx = (box.x0 + box.x1) / 2 + d * gap;
    const cy = (box.y0 + box.y1) / 2 + (box.mobile ? 8 : 16);
    const far = Math.abs(d) > 1;
    const sc = d === 0 ? s : s * 0.84;
    const rot = d === 0 ? 0 : d * 3.5;
    return {
      transform: `translate(${cx - c.w / 2}px, ${cy - c.h / 2}px) scale(${sc}) rotate(${rot}deg)`,
      opacity: d === 0 ? 1 : far ? 0 : 0.32
    };
  }

  // transform that puts a clone exactly over its card on the page
  function home(i) {
    const c = clones[i];
    const r = cards[i].getBoundingClientRect();
    return `translate(${r.left + r.width / 2 - c.w / 2}px, ${r.top + r.height / 2 - c.h / 2}px) scale(${r.width / c.w})`;
  }

  function place(immediate) {
    clones.forEach((c, i) => {
      const t = target(i);
      if (immediate) c.el.style.transition = 'none';
      c.el.style.transform = t.transform;
      c.el.style.opacity = t.opacity;
      c.el.classList.toggle('is-active', i === active);
      c.el.setAttribute('aria-hidden', 'true');
      if (immediate) { c.el.offsetWidth; c.el.style.transition = ''; }
    });
  }

  function fill(animate) {
    const tpl = cards[active].querySelector('template.pr-detail');
    const write = () => {
      const hadFocus = body.contains(document.activeElement) || document.activeElement === document.body;
      body.replaceChildren(tpl ? tpl.content.cloneNode(true) : document.createTextNode(''));
      count.textContent = `${pad(active + 1)} / ${pad(cards.length)}`;
      body.classList.remove('is-swapping');
      if (hadFocus && dialog.open) body.querySelector('.sv-title')?.focus({ preventScroll: true });
    };
    clearTimeout(swapTimer);
    if (!animate || reduce.matches) return write();
    body.classList.add('is-swapping');
    swapTimer = setTimeout(write, 180);
  }

  function lockScroll(on) {
    const root = document.documentElement;
    if (on) {
      const bar = innerWidth - root.clientWidth;
      root.style.overflow = 'hidden';
      if (bar) root.style.paddingRight = bar + 'px';
      window.motionKit?.wheel?.stop();
    } else {
      root.style.overflow = '';
      root.style.paddingRight = '';
      window.motionKit?.wheel?.start();
    }
  }

  function open(index, trigger) {
    if (busy || dialog.open) return;
    busy = true;
    active = index;
    opener = trigger || cards[index].querySelector('.pr-open');

    // clone every card at its current size (untransformed layout size)
    clones = cards.map(card => {
      const el = card.cloneNode(true);
      el.classList.add('sv-clone');
      el.removeAttribute('style');
      const w = card.offsetWidth, h = card.offsetHeight;
      el.style.width = w + 'px';
      el.style.height = h + 'px';
      return { el, w, h };
    });
    stage.replaceChildren(...clones.map(c => c.el));
    clones.forEach((c, i) => c.el.addEventListener('click', () => { if (i !== active) go(i); }));

    fill(false);
    lockScroll(true);
    dialog.showModal();

    // start each clone over its card, then fly
    clones.forEach((c, i) => {
      c.el.style.transition = 'none';
      c.el.style.transform = home(i);
      c.el.style.opacity = 1;
    });
    cards.forEach(card => card.classList.add('is-hidden'));
    stage.offsetWidth;
    clones.forEach(c => { c.el.style.transition = ''; });

    requestAnimationFrame(() => {
      dialog.classList.add('is-open');
      place(false);
      dialog.querySelector('.sv-title')?.focus({ preventScroll: true });
      setTimeout(() => { busy = false; }, reduce.matches ? 200 : DURATION);
    });
  }

  function go(index) {
    if (!dialog.open) return;
    const next = (index + cards.length) % cards.length;
    if (next === active) return;
    active = next;
    place(false);
    fill(true);
  }

  function close(after) {
    if (!dialog.open || busy) return;
    busy = true;
    dialog.classList.remove('is-open');
    clones.forEach((c, i) => {
      c.el.style.transform = home(i);
      c.el.style.opacity = 1;
    });
    setTimeout(() => {
      cards.forEach(card => card.classList.remove('is-hidden'));
      dialog.close();
      stage.replaceChildren();
      clones = [];
      lockScroll(false);
      busy = false;
      if (typeof after === 'function') after();
      else opener?.focus({ preventScroll: true });
    }, reduce.matches ? 220 : DURATION);
  }

  // wiring
  cards.forEach((card, i) => {
    card.addEventListener('click', event => {
      if (event.target.closest('a')) return;
      open(i, card.querySelector('.pr-open'));
    });
  });
  dialog.querySelector('.sv-prev').addEventListener('click', () => go(active - 1));
  dialog.querySelector('.sv-next').addEventListener('click', () => go(active + 1));
  dialog.querySelector('.sv-close').addEventListener('click', () => close());
  dialog.querySelector('.sv-backdrop').addEventListener('click', () => close());
  stage.addEventListener('click', event => { if (event.target === stage) close(); });
  dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
  dialog.addEventListener('keydown', event => {
    if (event.key === 'ArrowRight') { event.preventDefault(); go(active + 1); }
    if (event.key === 'ArrowLeft') { event.preventDefault(); go(active - 1); }
  });
  // links in the panel (Start a project, Seen in): fly back first, then jump
  dialog.addEventListener('click', event => {
    const link = event.target.closest('a[href^="#"]');
    if (!link) return;
    event.preventDefault();
    const dest = document.querySelector(link.getAttribute('href'));
    close(() => {
      if (!dest) return;
      dest.scrollIntoView({ behavior: reduce.matches ? 'auto' : 'smooth', block: 'start' });
      history.replaceState(null, '', link.getAttribute('href'));
    });
  });
  // swipe between services on touch
  let sx = null;
  stage.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse') sx = e.clientX; });
  stage.addEventListener('pointerup', e => {
    if (sx === null) return;
    const dx = e.clientX - sx; sx = null;
    if (Math.abs(dx) > 40) go(active + (dx < 0 ? 1 : -1));
  });
  addEventListener('resize', () => { if (dialog.open && !busy) place(true); });
})();
