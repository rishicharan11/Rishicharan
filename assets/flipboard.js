/* Split-flap ("Solari") board for the hero.
   Mount: <div class="fb" data-fb data-intro data-lead data-roles="A|B|C" data-outro data-interval></div>
   No dependencies. */
(function () {
  'use strict';

  var GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789&#@!?%+-/:<>~';
  var FILLS = ['coral', 'light', 'white', 'coral', 'black', 'light'];
  var GAP_RATIO = 0.12;     // gap as a fraction of tile size
  var NARROW = 560;         // container width below which we wrap into fewer columns
  var MIN_TILE = 22;

  var mqReduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  var mqHover = window.matchMedia('(hover: hover) and (pointer: fine)');

  function rand(a, b) { return a + Math.random() * (b - a); }
  function pick(arr) { return arr[(Math.random() * arr.length) | 0]; }
  function randGlyph() { return GLYPHS.charAt((Math.random() * GLYPHS.length) | 0); }

  // Greedy word wrap; words longer than cols are hard-split.
  // A "^" in the text forces a line break (keeps e.g. a full name on one line).
  function wrap(text, cols) {
    var parts = String(text).split('^');
    if (parts.length > 1) {
      return parts.reduce(function (acc, part) { return acc.concat(wrap(part, cols)); }, []);
    }
    var words = String(text).toUpperCase().trim().split(/\s+/).filter(Boolean);
    var lines = [];
    var cur = '';
    words.forEach(function (w) {
      while (w.length > cols) {
        if (cur) { lines.push(cur); cur = ''; }
        lines.push(w.slice(0, cols));
        w = w.slice(cols);
      }
      if (!cur) cur = w;
      else if (cur.length + 1 + w.length <= cols) cur += ' ' + w;
      else { lines.push(cur); cur = w; }
    });
    if (cur) lines.push(cur);
    if (!lines.length) lines.push('');
    return lines;
  }

  var SVG_NS = 'http://www.w3.org/2000/svg';
  function icon(cls, d) {
    var s = document.createElementNS(SVG_NS, 'svg');
    s.setAttribute('viewBox', '0 0 10 10');
    s.setAttribute('aria-hidden', 'true');
    s.setAttribute('focusable', 'false');
    s.setAttribute('class', cls);
    var p = document.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', d);
    p.setAttribute('fill', 'currentColor');
    s.appendChild(p);
    return s;
  }

  function Board(el) {
    this.el = el;
    this.intro = el.getAttribute('data-intro') || '';
    this.lead = el.getAttribute('data-lead') || '';
    this.roles = (el.getAttribute('data-roles') || '').split('|').map(function (r) { return r.trim(); }).filter(Boolean);
    if (!this.roles.length) this.roles = [''];
    this.interval = Math.max(1500, parseInt(el.getAttribute('data-interval'), 10) || 3200);

    this.roleIndex = 0;
    this.cols = 0;
    this.rows = 0;
    this.tiles = [];        // span elements
    this.shown = [];        // char currently displayed per tile
    this.anim = new Map();  // tile index -> {target, start, end, next}
    this.hoverTimers = new Map();
    this.raf = 0;
    this.timer = 0;
    this.started = false;   // first scramble-in has happened
    this.userPaused = false;
    this.offscreen = true;
    this.hidden = document.hidden;

    this.build();
    this.layout();
    this.bind();
  }

  Board.prototype.build = function () {
    var el = this.el;
    el.textContent = '';
    this.grid = document.createElement('div');
    this.grid.className = 'fb-grid';
    this.grid.setAttribute('aria-hidden', 'true');

    this.sr = document.createElement('p');
    this.sr.className = 'fb-sr';

    var btn = this.btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'fb-pause';
    btn.setAttribute('aria-pressed', 'false');
    btn.setAttribute('aria-label', 'Pause role animation');
    btn.appendChild(icon('fb-ico-pause', 'M2 1h2v8H2zM6 1h2v8H6z'));
    btn.appendChild(icon('fb-ico-play', 'M2.5 1l6 4-6 4z'));

    el.appendChild(this.grid);
    el.appendChild(btn);
    el.appendChild(this.sr);
    this.updateSr();
  };

  Board.prototype.updateSr = function () {
    var role = this.roles[this.roleIndex];
    var parts = [this.intro, (this.lead ? this.lead + ' ' : '') + role, this.outro()].filter(Boolean);
    this.sr.textContent = parts.join('. ').replace(/\^/g, ' ').replace(/\.\./g, '.');
  };
  Board.prototype.outro = function () { return this.el.getAttribute('data-outro') || ''; };

  Board.prototype.longest = function () {
    var self = this;
    var n = Math.max.apply(null, (this.intro + '^' + this.outro()).split('^').map(function (x) { return x.trim().length; }));
    this.roles.forEach(function (r) { n = Math.max(n, (self.lead ? self.lead.length + 1 : 0) + r.length); });
    return n;
  };
  Board.prototype.longestWord = function () {
    var all = [this.intro, this.lead, this.outro()].concat(this.roles).join(' ').replace(/\^/g, ' ').split(/\s+/);
    return all.reduce(function (m, w) { return Math.max(m, w.length); }, 1);
  };

  // Compose the full character array for a given role at the current cols/rows.
  Board.prototype.compose = function (roleIdx, cols, roleRows, rows) {
    var intro = wrap(this.intro, cols);
    var role = wrap((this.lead ? this.lead + ' ' : '') + this.roles[roleIdx], cols);
    var outro = wrap(this.outro(), cols);
    var lines = [];
    var i;
    for (i = 0; i < intro.length; i++) lines.push(intro[i]);
    for (i = 0; i < roleRows; i++) lines.push(role[i] || '');
    for (i = 0; i < outro.length; i++) lines.push(outro[i]);
    while (lines.length < rows) lines.push('');
    var out = [];
    lines.forEach(function (line) {
      for (var c = 0; c < cols; c++) out.push(line.charAt(c) || ' ');
    });
    return out;
  };

  // rows needed for a given column count (stable across roles, pause tile kept free)
  Board.prototype.measureRows = function (cols) {
    var self = this, lead = this.lead ? this.lead + ' ' : '';
    var roleRows = 1;
    for (var i = 0; i < this.roles.length; i++) roleRows = Math.max(roleRows, wrap(lead + this.roles[i], cols).length);
    var rows = wrap(this.intro, cols).length + roleRows + wrap(this.outro(), cols).length;
    var clash = this.roles.some(function (_, ri) { var a = self.compose(ri, cols, roleRows, rows); return a[a.length - 1] !== ' '; });
    return { rows: clash ? rows + 1 : rows, roleRows: roleRows };
  };

  // Pick the column count that gives the biggest tiles within the width and a height budget,
  // so the board wraps into more, larger rows instead of one long thin strip.
  Board.prototype.layout = function () {
    var w = this.el.clientWidth;
    if (!w) return;
    var narrow = w < NARROW;
    var maxH = Math.max(220, window.innerHeight * (narrow ? 0.56 : 0.6));
    var lo = Math.max(this.longestWord() + (narrow ? 0 : 1), narrow ? 8 : 12);
    var hi = narrow ? Math.max(lo, 13) : Math.max(lo, this.longest() + 1);
    var best = null;
    for (var c = hi; c >= lo; c--) {
      var m = this.measureRows(c);
      var tw = w / (c + GAP_RATIO * (c - 1));
      var th = maxH / (m.rows + GAP_RATIO * (m.rows - 1));
      var t = Math.min(tw, th);
      if (!best || t > best.tile + 0.5) best = { cols: c, rows: m.rows, roleRows: m.roleRows, tile: t };
    }
    // trim columns no line uses, so the board hugs its text
    var self2 = this, lead2 = this.lead ? this.lead + ' ' : '', used = 0;
    var all = wrap(this.intro, best.cols).concat(wrap(this.outro(), best.cols));
    this.roles.forEach(function (r) { all = all.concat(wrap(lead2 + r, best.cols)); });
    all.forEach(function (l) { used = Math.max(used, l.length); });
    if (used && used < best.cols) {
      var mt = this.measureRows(used);
      if (mt.rows <= best.rows) {
        best.cols = used; best.rows = mt.rows; best.roleRows = mt.roleRows;
        best.tile = Math.min(w / (used + GAP_RATIO * (used - 1)), maxH / (mt.rows + GAP_RATIO * (mt.rows - 1)));
      }
    }
    var cols = best.cols, rows = best.rows, roleRows = best.roleRows;
    var tile = Math.max(MIN_TILE, Math.floor(best.tile * 100) / 100);
    var gap = Math.floor(tile * GAP_RATIO * 100) / 100;

    var s = this.el.style;
    s.setProperty('--fb-tile', tile + 'px');
    s.setProperty('--fb-gap', gap + 'px');
    s.setProperty('--fb-cols', cols);
    s.setProperty('--fb-rows', rows);

    if (cols === this.cols && rows === this.rows) return;
    this.cols = cols;
    this.rows = rows;
    this.roleRows = roleRows;
    this.rebuildTiles();
    this.el.classList.add('fb--ready');
  };

  Board.prototype.rebuildTiles = function () {
    this.stopAnim(false);
    this.clearHovers();
    var n = this.cols * this.rows;
    var frag = document.createDocumentFragment();
    var target = this.started || mqReduce.matches ? this.target() : null;
    this.tiles = [];
    this.shown = [];
    for (var i = 0; i < n; i++) {
      var t = document.createElement('span');
      t.className = 'fb-t';
      var ch = target ? target[i] : ' ';
      t.textContent = ch === ' ' ? '' : ch;
      this.tiles.push(t);
      this.shown.push(ch);
      frag.appendChild(t);
    }
    this.grid.textContent = '';
    this.grid.appendChild(frag);
    if (target) this.started = true;
  };

  Board.prototype.target = function () {
    return this.compose(this.roleIndex, this.cols, this.roleRows, this.rows);
  };

  Board.prototype.setChar = function (i, ch, fill) {
    var t = this.tiles[i];
    if (fill) {
      t.setAttribute('data-fill', fill);
      t.textContent = '';
    } else {
      if (t.hasAttribute('data-fill')) t.removeAttribute('data-fill');
      t.textContent = ch === ' ' ? '' : ch;
    }
  };

  Board.prototype.flap = function (i, strength) {
    var t = this.tiles[i];
    if (!t.animate) return;
    t.animate(
      [{ transform: 'perspective(120px) rotateX(' + (-strength) + 'deg)' }, { transform: 'none' }],
      { duration: 160, easing: 'cubic-bezier(.2,.8,.2,1)' }
    );
  };

  // Animate from what is shown to `target`. Only tiles whose char changes scramble.
  Board.prototype.go = function (target, intro) {
    if (mqReduce.matches) {
      this.stopAnim(false);
      for (var j = 0; j < target.length; j++) {
        this.setChar(j, target[j]);
        this.shown[j] = target[j];
      }
      this.started = true;
      this.schedule();
      return;
    }
    var now = performance.now();
    var cols = this.cols;
    for (var i = 0; i < target.length; i++) {
      var hv = this.hoverTimers.get(i);
      if (hv) { clearTimeout(hv); this.hoverTimers.delete(i); this.setChar(i, this.shown[i]); }
      var r = (i / cols) | 0;
      var c = i % cols;
      var delay, dur;
      if (intro) {
        delay = (c / cols) * 520 + r * 90 + rand(0, 240);
        dur = rand(320, 760);
      } else {
        delay = (c / cols) * 420 + r * 70 + rand(0, 160);
        dur = rand(320, 680);
      }
      this.anim.set(i, { target: target[i], start: now + delay, end: now + delay + dur, next: 0 });
    }
    this.started = true;
    if (this.anim.size) this.loop();
    else this.schedule();
  };

  Board.prototype.loop = function () {
    if (this.raf) return;
    var self = this;
    var tick = function (now) {
      self.raf = 0;
      self.anim.forEach(function (a, i) {
        if (now < a.start) return;
        if (now >= a.end) {
          self.setChar(i, a.target);
          self.shown[i] = a.target;
          self.anim.delete(i);
          self.flap(i, 70);
          return;
        }
        if (now >= a.next) {
          a.next = now + rand(55, 95);
          if (Math.random() < 0.16) self.setChar(i, null, pick(FILLS));
          else self.setChar(i, randGlyph());
          self.flap(i, 40);
        }
      });
      if (self.anim.size) self.raf = requestAnimationFrame(tick);
      else self.schedule();
    };
    this.raf = requestAnimationFrame(tick);
  };

  Board.prototype.stopAnim = function (settle) {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    var self = this;
    if (settle) {
      this.anim.forEach(function (a, i) { self.setChar(i, a.target); self.shown[i] = a.target; });
    }
    this.anim.clear();
  };

  Board.prototype.clearHovers = function () {
    this.hoverTimers.forEach(function (t) { clearTimeout(t); });
    this.hoverTimers.clear();
  };

  Board.prototype.canRun = function () {
    return !this.userPaused && !this.offscreen && !this.hidden && this.roles.length > 1;
  };

  Board.prototype.schedule = function () {
    clearTimeout(this.timer);
    this.timer = 0;
    if (!this.canRun() || this.anim.size) return;
    var self = this;
    this.timer = setTimeout(function () { self.timer = 0; self.next(); }, this.interval);
  };

  Board.prototype.next = function () {
    if (!this.canRun()) return;
    this.roleIndex = (this.roleIndex + 1) % this.roles.length;
    this.updateSr();
    this.go(this.target(), false);
  };

  Board.prototype.onVisibility = function () {
    if (!this.offscreen && !this.started) {
      this.go(this.target(), true);
      return;
    }
    if (this.canRun()) this.schedule();
    else { clearTimeout(this.timer); this.timer = 0; }
  };

  Board.prototype.hover = function (e) {
    if (mqReduce.matches || !mqHover.matches || !this.started) return;
    var t = e.target;
    if (!t || !t.classList || !t.classList.contains('fb-t')) return;
    var i = this.tiles.indexOf(t);
    if (i < 0 || this.anim.has(i) || this.hoverTimers.has(i)) return;
    var self = this;
    this.setChar(i, null, pick(FILLS));
    this.flap(i, 60);
    this.hoverTimers.set(i, setTimeout(function () {
      self.hoverTimers.delete(i);
      if (self.anim.has(i)) return;
      self.setChar(i, self.shown[i]);
      self.flap(i, 60);
    }, 420));
  };

  Board.prototype.bind = function () {
    var self = this;

    this.btn.addEventListener('click', function () {
      self.userPaused = !self.userPaused;
      self.btn.setAttribute('aria-pressed', String(self.userPaused));
      // label stays "Pause role animation"; aria-pressed carries the state
      if (self.userPaused) { clearTimeout(self.timer); self.timer = 0; }
      else if (self.canRun() && !self.anim.size) self.next();
    });

    this.grid.addEventListener('pointerover', function (e) { self.hover(e); });

    if ('ResizeObserver' in window) {
      new ResizeObserver(function () { self.layout(); }).observe(this.el);
    } else {
      window.addEventListener('resize', function () { self.layout(); });
    }

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        var e = entries[entries.length - 1];
        self.offscreen = !e.isIntersecting;
        self.onVisibility();
      }, { threshold: 0.15 }).observe(this.el);
    } else {
      this.offscreen = false;
      this.onVisibility();
    }

    document.addEventListener('visibilitychange', function () {
      self.hidden = document.hidden;
      if (self.hidden) self.stopAnim(true);
      self.onVisibility();
    });

    var onReduce = function () {
      if (mqReduce.matches) {
        self.stopAnim(true);
        self.clearHovers();
        for (var i = 0; i < self.tiles.length; i++) self.setChar(i, self.shown[i]);
        if (!self.started) self.go(self.target(), true);
        self.schedule();
      }
    };
    if (mqReduce.addEventListener) mqReduce.addEventListener('change', onReduce);
    else if (mqReduce.addListener) mqReduce.addListener(onReduce);
  };

  function init() {
    var els = document.querySelectorAll('[data-fb]');
    for (var i = 0; i < els.length; i++) {
      if (els[i].__fb) continue;
      els[i].__fb = new Board(els[i]);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
