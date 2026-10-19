// Clawd for Hangar: a web port of ~/.claude/clawd.cs (sprite 18x5 cells, cells twice as tall as wide).
// draw() paints one Clawd on a canvas; Corral is the strip of walking minis (one per Claude Code session);
// pose() is shared by the tab indicators and the corral so both animate the same way.
(function () {
  'use strict';
  const EYE = '#1A1A1A', CAT_BLACK = '#1E1E1E', CAT_PINK = '#F2A7B5', MIMI_WHITE = '#FFFFFF';
  const SPIN = ['·', '✢', '✳', '✶', '✻', '✽', '✻', '✶', '✳', '✢'];
  const WORKING = new Set(['thinking', 'reading', 'writing', 'running', 'searching']);
  const hump = (u) => 4 * u * (1 - u);
  const rnd = (a, b) => a + Math.floor(Math.random() * (b - a));

  // g = cell width in device px (cell height = 2g). Offsets in pose: cells (x) / tall cells (y) unless noted.
  function draw(ctx, x, y, g, color, p = {}) {
    const h = g * 2;
    const box = (cx, cy, cw, ch, fill, ox = 0, oy = 0) => {
      ctx.fillStyle = fill;
      const X = Math.round(x + ox + cx * g), Y = Math.round(y + oy + cy * h);
      ctx.fillRect(X, Y, Math.max(1, Math.round(x + ox + (cx + cw) * g) - X), Math.max(1, Math.round(y + oy + (cy + ch) * h) - Y));
    };
    const legs = p.legs || [0, 0, 0, 0];
    [4, 6, 11, 13].forEach((lx, i) => box(lx, 4 + legs[i], 1, 1, color));
    const bx = (p.bodyX || 0) * g, by = (p.bodyY || 0) * g;            // body offsets in cells-wide units
    box(3, 0, 12, 4, color, bx, by);
    const aL = p.armL || {}, aR = p.armR || {};
    box(1 + (aL.x || 0), 2 + (aL.y || 0), 2, 1, color, bx, by);
    box(15 + (aR.x || 0), 2 + (aR.y || 0), 2, 1, color, bx, by);
    if (p.skin === 'mimi') {                                              // BuildCat() from clawd.cs
      box(6, 0, 9, 1, CAT_BLACK, bx, by); box(13, 0.9, 2, 0.75, CAT_BLACK, bx, by); box(8.5, 2.05, 1, 0.35, CAT_BLACK, bx, by);
      box(3, -0.55, 3, 0.65, color, bx, by); box(3, -1, 1.3, 0.5, color, bx, by); box(4, -0.55, 1, 0.45, CAT_PINK, bx, by);
      box(12, -0.55, 3, 0.65, CAT_BLACK, bx, by); box(13.7, -1, 1.3, 0.5, CAT_BLACK, bx, by); box(13, -0.55, 1, 0.45, CAT_PINK, bx, by);
      box(8.5, 1.62, 1, 0.3, CAT_PINK, bx, by);
    }
    const eyes = p.eyes || 'open', dx = p.eyeDX || 0, dy = p.eyeDY || 0;
    for (const ex of [5, 12]) {
      if (eyes === 'closed') box(ex, 1.5, 1, 0.3, EYE, bx, by);
      else if (eyes === 'happy') box(ex, 1.25, 1, 0.35, EYE, bx, by);
      else box(ex + dx, 1 + dy, 1, 1, EYE, bx, by);
    }
  }

  // Pose for a status, given a tick counter t (90 ms per tick, like the overlay).
  function pose(status, t, seed = 0) {
    const step = (t >> 1) % 2;
    switch (status) {
      case 'working': case 'agent':
        return { armL: { x: 1.2, y: step ? -0.35 : 0 }, armR: { x: -1.2, y: step ? 0 : -0.35 }, bodyY: step ? -0.4 : 0, eyeDY: 0.2 };
      case 'running': {
        const legs = [0, 0, 0, 0];
        for (let i = 0; i < 4; i++) if (i % 2 === step) legs[i] = -0.45;
        return { legs, bodyY: step ? -0.4 : 0, eyeDX: 0.35 };
      }
      case 'waiting': case 'attention': {
        const k = t % 14;
        return { hop: k < 7 ? hump(k / 7) : 0, armL: { y: -0.6 }, armR: { y: -0.6 } };
      }
      case 'error': return { eyes: 'closed', bodyY: 0.5, armL: { y: 0.3 }, armR: { y: 0.3 } };
      case 'success': return { eyes: 'happy' };
      default: {
        const c = (t + seed) % 60;
        if (c < 2) return { eyes: 'closed' };
        if (c >= 20 && c < 28) return { eyeDX: -0.35 };
        if (c >= 34 && c < 42) return { eyeDX: 0.35 };
        return {};
      }
    }
  }

  // ------------------------------------------------------------------ corral of minis
  const INTER = { greet: 32, hop: 36, highfive: 26, nap: 75, whisper: 42 };

  class Corral {
    constructor(canvas, { onPick } = {}) {
      this.cv = canvas;
      this.ctx = canvas.getContext('2d');
      this.minis = new Map();
      this.parts = [];
      this.tick = 0;
      this.interCool = 80;
      this.inter = null;
      this.onPick = onPick;
      this.opts = { g: 3, interactions: true, speed: 1 };
      this.g = 3;
      this.hover = null;
      canvas.addEventListener('mousemove', (e) => this.mouse(e));
      canvas.addEventListener('mouseleave', () => { this.hover = null; canvas.title = ''; canvas.style.cursor = ''; });
      canvas.addEventListener('click', (e) => { const m = this.hit(e); if (m && this.onPick) this.onPick(m.info); });
    }
    get dpr() { return window.devicePixelRatio || 1; }
    // Cell size: the configured size, shrunk (down to 1.6) so every mini fits side by side.
    get G() { return this.g * this.dpr; }
    fit() {
      const n = Math.max(1, [...this.minis.values()].filter((m) => !m.dead).length);
      const cssW = this.cv.width / this.dpr || 270;
      this.g = Math.max(1.6, Math.min(this.opts.g, (cssW - 16) / (n * 21)));
    }
    get W() { return this.cv.width; }
    get spriteW() { return 18 * this.G; }
    get ground() { return this.cv.height - 4 * this.dpr; }
    resize() {
      const r = this.cv.getBoundingClientRect();
      const w = Math.round(r.width * this.dpr), hh = Math.round(r.height * this.dpr);
      if (w && (w !== this.cv.width || hh !== this.cv.height)) {
        const grew = w > this.cv.width * 1.3 && this.cv.width > 0;
        this.cv.width = w; this.cv.height = hh;
        this.fit();
        for (const m of this.minis.values()) {
          m.x = this.clampX(m.x); m.target = this.clampX(m.target);
          // more room: spread out, walking
          if (grew && !m.dead && m.mode !== 'popin') {
            const to = this.freeX(m);
            if (Math.abs(to - m.x) > 200 * this.dpr) {          // far: teleport with a puff, like the overlay's dance formation
              this.puff(m.x, this.ground - 12 * this.dpr, m.info.color);
              m.x = m.target = to;
              this.puff(m.x, this.ground - 12 * this.dpr, m.info.color);
            } else if (['idle', 'walk', 'look'].includes(m.mode)) { m.mode = 'walk'; m.t = 0; m.target = to; }
          }
        }
      }
    }
    clampX(x) { const half = this.spriteW / 2 + 4; return Math.max(half, Math.min(this.W - half, x)); }
    freeX(self) {
      let best = this.clampX(Math.random() * this.W), bestD = -1;
      for (let n = 0; n < 12; n++) {
        const cx = this.clampX(Math.random() * this.W);
        let d = 1e9;
        for (const o of this.minis.values()) if (o !== self && !o.dead) d = Math.min(d, Math.abs(o.x - cx), Math.abs(o.target - cx));
        if (d > bestD) { bestD = d; best = cx; }
        if (d >= this.spriteW + 8) break;
      }
      return best;
    }
    // list: [{ id, color, skin, state, name, cwd, ... }]
    update(list, opts) {
      if (opts) Object.assign(this.opts, opts);
      this.resize();
      const ids = new Set(list.map((s) => s.id));
      for (const s of list) {
        let m = this.minis.get(s.id);
        if (!m) {
          m = { id: s.id, x: 0, target: 0, mode: 'popin', t: 0, dur: 30, seed: rnd(0, 60), y: 0, dead: false };
          this.minis.set(s.id, m);
          m.x = m.target = this.freeX(m);
          this.puff(m.x, this.ground - 12 * this.dpr, s.skin === 'mimi' ? MIMI_WHITE : s.color);
        } else if (m.dead) { m.dead = false; m.mode = 'popin'; m.t = 0; }
        if (m.info && (m.info.color !== s.color || m.info.skin !== s.skin)) this.puff(m.x, this.ground - 12 * this.dpr, s.color);
        m.info = s;
        if (WORKING.has(s.state) || s.state === 'waiting') this.cancelInter(m);
      }
      for (const m of this.minis.values()) if (!ids.has(m.id) && !m.dead) { m.dead = true; m.mode = 'popout'; m.t = 0; this.cancelInter(m); }
      this.fit();
    }
    puff(x, y, color) {
      for (let i = 0; i < 7; i++) this.parts.push({ kind: 'dot', x, y, vx: (Math.random() - 0.5) * 3 * this.dpr, vy: -Math.random() * 2 * this.dpr, life: 10, age: 0, color: color || '#F4F1EC', size: rnd(2, 5) * this.dpr });
    }
    text(t, x, y, color, vy = -0.8, life = 22, size = 11) {
      this.parts.push({ kind: 'text', t, x, y, vx: 0, vy: vy * this.dpr, life, age: 0, color, size: size * this.dpr });
    }
    cancelInter(m) {
      const it = this.inter;
      if (!it || (it.a !== m && it.b !== m)) return;
      for (const x of [it.a, it.b]) if (x.mode !== 'popout') { x.mode = 'idle'; x.t = 0; x.dur = 20; }
      this.inter = null;
    }
    startInter() {
      const free = [...this.minis.values()].filter((m) => !m.dead && m.info.state === 'idle' && ['idle', 'walk', 'look'].includes(m.mode));
      if (free.length < 2) return;
      const a = free.splice(rnd(0, free.length), 1)[0], b = free[rnd(0, free.length)];
      const kinds = Object.keys(INTER);
      const kind = kinds[rnd(0, kinds.length)];
      const mid = this.clampX((a.x + b.x) / 2), gap = this.spriteW / 2 + (kind === 'nap' ? 2 : 6) * this.dpr;
      const [l, r] = a.x <= b.x ? [a, b] : [b, a];
      l.target = this.clampX(mid - gap); r.target = this.clampX(mid + gap);
      if (r.target - l.target < gap * 1.5) { l.target = this.clampX(r.target - gap * 2); }
      for (const m of [a, b]) { m.mode = 'approach'; m.t = 0; }
      this.inter = { a, b, kind, t: 0, phase: 'approach' };
    }
    walk(m, speed) {
      const d = Math.sign(m.target - m.x);
      m.x += d * Math.min(speed * this.dpr * (this.g / 3) * this.opts.speed, Math.abs(m.target - m.x));
      const p = pose('running', m.t);
      p.eyeDX = d * 0.35;
      m.pose = p;
      return Math.abs(m.target - m.x) < 0.5;
    }
    step() {
      this.tick++;
      const T = this.tick;
      if (this.opts.interactions && !this.inter && --this.interCool <= 0) { this.startInter(); this.interCool = rnd(150, 420); }
      for (const m of [...this.minis.values()]) {
        m.t++;
        m.y = 0; m.over = null; m.scale = 1;
        const st = m.info.state;
        if (m.mode === 'popin') {
          const u = Math.min(1, m.t / 8);
          m.scale = 1 + 2.7 * (u - 1) ** 3 + 1.7 * (u - 1) ** 2;   // ease-out-back: overshoots, then settles
          m.pose = { eyes: 'happy' };
          if (m.t >= 8) { m.mode = 'idle'; m.t = 0; m.dur = rnd(20, 50); }
          continue;
        }
        if (m.mode === 'popout') {
          m.scale = Math.max(0, 1 - m.t / 7);
          m.pose = { eyes: 'closed' };
          if (m.t === 1) this.puff(m.x, this.ground - 12 * this.dpr, m.info.color);
          if (m.t >= 7) this.minis.delete(m.id);
          continue;
        }
        if (WORKING.has(st)) { m.pose = pose('working', m.t); m.over = { t: SPIN[T % SPIN.length], c: m.info.color }; continue; }
        if (st === 'waiting') { const p = pose('waiting', m.t); m.y = -6 * (this.g / 3) * this.dpr * p.hop; m.pose = p; m.over = { t: '?', c: m.info.color }; continue; }
        const it = this.inter && (this.inter.a === m || this.inter.b === m) ? this.inter : null;
        switch (m.mode) {
          case 'idle':
            m.pose = pose('idle', m.t, m.seed);
            if (m.t >= m.dur) {
              const r = rnd(0, 100);
              m.t = 0;
              if (r < 55) { m.mode = 'walk'; m.target = this.freeX(m); }
              else if (r < 80) m.mode = 'look';
              else m.dur = rnd(20, 60);
            }
            break;
          case 'walk': if (this.walk(m, 1.1)) { m.mode = 'idle'; m.t = 0; m.dur = rnd(20, 60); } break;
          case 'look':
            m.pose = m.t < 12 ? { eyeDX: -0.35 } : m.t < 24 ? { eyeDX: 0.35 } : m.t < 28 ? { eyeDY: -0.25 } : {};
            if (m.t >= 28) { m.mode = 'idle'; m.t = 0; m.dur = rnd(15, 40); }
            break;
          case 'approach': if (this.walk(m, 1.4)) m.mode = 'ready'; break;
          case 'ready': m.pose = { eyeDX: it ? Math.sign(this.partner(m).x - m.x) * 0.35 : 0 }; break;
          default: m.pose = {};
        }
      }
      this.stepInter();
      for (let i = this.parts.length - 1; i >= 0; i--) {
        const q = this.parts[i];
        q.age++; q.x += q.vx; q.y += q.vy;
        if (q.kind === 'dot') { q.vx *= 0.85; q.vy *= 0.85; }
        if (q.age >= q.life) this.parts.splice(i, 1);
      }
    }
    partner(m) { const it = this.inter; return it.a === m ? it.b : it.a; }
    stepInter() {
      const it = this.inter;
      if (!it) return;
      const { a, b } = it;
      if (!this.minis.has(a.id) || !this.minis.has(b.id) || a.dead || b.dead) { this.inter = null; return; }
      if (it.phase === 'approach') {
        if (a.mode === 'ready' && b.mode === 'ready') { it.phase = 'act'; it.t = 0; }
        else if (a.t > 220 || b.t > 220) this.cancelInter(a);
        return;
      }
      it.t++;
      const t = it.t, dur = INTER[it.kind], mx = (a.x + b.x) / 2, top = this.ground - 34 * (this.g / 3) * this.dpr;
      for (const m of [a, b]) {
        const dir = Math.sign(this.partner(m).x - m.x) || 1;
        const inner = dir > 0 ? 'armR' : 'armL';
        const p = { eyeDX: dir * 0.35 };
        switch (it.kind) {
          case 'greet': p.eyes = 'happy'; p[inner] = { y: (t >> 2) % 2 ? -0.7 : -0.3 }; break;
          case 'hop': { const k = (t + (m === b ? 9 : 0)) % 18; if (k < 9) m.y = -8 * (this.g / 3) * this.dpr * hump(k / 9); p.eyes = 'happy'; break; }
          case 'highfive': p[inner] = { x: dir * 0.6, y: -0.9 }; if (t > 12) p.eyes = 'happy'; break;
          case 'nap': p.eyes = 'closed'; p.bodyY = 0.5; break;
          case 'whisper': if (m === a) p.bodyX = dir * 1; else p.eyes = (t >> 3) % 2 ? 'happy' : 'open'; break;
        }
        m.pose = p;
      }
      if (it.kind === 'greet' && (t === 6 || t === 16)) this.text('♥', mx - 4 * this.dpr, top, '#FF6B7A');
      if (it.kind === 'highfive' && t === 12) { this.text('✦', mx - 5 * this.dpr, top + 4 * this.dpr, '#F2C14E', -0.4, 14, 13); this.puff(mx, top + 14 * this.dpr, '#F2C14E'); }
      if (it.kind === 'nap' && t % 14 === 1) this.text('z', mx + rnd(-8, 8) * this.dpr, top + 6 * this.dpr, '#CFE0FF', -0.6, 26, 10);
      if (it.kind === 'whisper' && t === 10) this.text('…', mx - 5 * this.dpr, top, '#F2EDE8', -0.3, 24);
      if (t >= dur) {
        for (const m of [a, b]) { m.mode = 'walk'; m.t = 0; m.target = this.freeX(m); }
        this.inter = null;
      }
    }
    render() {
      const { ctx } = this;
      ctx.clearRect(0, 0, this.cv.width, this.cv.height);
      const G = this.G;
      for (const m of [...this.minis.values()].sort((a, b) => a.x - b.x)) {
        const s = m.scale ?? 1;
        if (s <= 0) continue;
        const color = m.info.skin === 'mimi' ? MIMI_WHITE : m.info.color || '#D77757';
        const x0 = m.x - this.spriteW / 2, y0 = this.ground - 5 * 2 * G + m.y;
        ctx.save();
        // shadow
        ctx.fillStyle = 'rgba(0,0,0,.22)';
        ctx.beginPath(); ctx.ellipse(m.x, this.ground + 1 * this.dpr, 7.5 * G * Math.max(0.3, 1 + m.y / 60), 2.5 * this.dpr, 0, 0, Math.PI * 2); ctx.fill();
        if (s !== 1) { ctx.translate(m.x, this.ground); ctx.scale(s, s); ctx.translate(-m.x, -this.ground); }
        draw(ctx, x0, y0, G, color, { ...m.pose, skin: m.info.skin });
        ctx.restore();
        if (m.over) {
          ctx.font = `bold ${12 * this.dpr}px "Segoe UI Symbol", "Segoe UI", sans-serif`;
          ctx.fillStyle = m.over.c; ctx.textAlign = 'center';
          ctx.fillText(m.over.t, m.x, y0 - 4 * this.dpr);
        }
        if (this.hover === m) {
          ctx.strokeStyle = color; ctx.globalAlpha = 0.5; ctx.lineWidth = this.dpr;
          ctx.strokeRect(x0 - 3 * this.dpr, y0 - 3 * this.dpr, this.spriteW + 6 * this.dpr, 10 * G + 6 * this.dpr);
          ctx.globalAlpha = 1;
        }
      }
      for (const q of this.parts) {
        const f = q.age / q.life;
        ctx.globalAlpha = f < 0.55 ? 1 : Math.max(0, (1 - f) / 0.45);
        ctx.fillStyle = q.color;
        if (q.kind === 'dot') ctx.fillRect(q.x, q.y, q.size, q.size);
        else { ctx.font = `bold ${q.size}px "Segoe UI Symbol", "Segoe UI", sans-serif`; ctx.textAlign = 'left'; ctx.fillText(q.t, q.x, q.y); }
      }
      ctx.globalAlpha = 1;
    }
    hit(e) {
      const r = this.cv.getBoundingClientRect(), x = (e.clientX - r.left) * this.dpr, y = (e.clientY - r.top) * this.dpr;
      let best = null;
      for (const m of this.minis.values()) {
        if (m.dead) continue;
        if (Math.abs(m.x - x) <= this.spriteW / 2 + 3 * this.dpr && y >= this.ground - 12 * this.G && y <= this.ground + 4 * this.dpr) best = m;
      }
      return best;
    }
    mouse(e) {
      const m = this.hit(e);
      this.hover = m;
      this.cv.style.cursor = m ? 'pointer' : '';
      this.cv.title = m ? (m.info.label || m.info.name || '') : '';
    }
  }

  window.HangarClawd = { draw, pose, Corral, WORKING, MIMI_WHITE };
})();
