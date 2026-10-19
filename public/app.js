(() => {
  'use strict';
  const { THEMES, DEFAULTS, FORM, CHIPS, ANSI_NAMES } = window.HANGAR;
  const CL = window.HangarClawd;
  const TOKEN = document.querySelector('meta[name="hangar-token"]').content;
  const CLIENT_ID = Math.random().toString(36).slice(2);

  // ================================================================ tiny DOM + util kit
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (k === 'value') el.value = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const k of kids.flat(3)) if (k != null && k !== false) el.append(k.nodeType ? k : String(k));
    return el;
  }
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const clone = (o) => JSON.parse(JSON.stringify(o));
  const getPath = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
  function setPath(o, p, v) { const ks = p.split('.'); let a = o; for (const k of ks.slice(0, -1)) a = a[k] ??= {}; a[ks[ks.length - 1]] = v; }
  function merge(base, over) {
    if (Array.isArray(base)) return Array.isArray(over) ? over : base;
    if (base && typeof base === 'object') {
      const o = { ...base };
      if (over && typeof over === 'object' && !Array.isArray(over)) for (const k of Object.keys(over)) o[k] = k in base ? merge(base[k], over[k]) : over[k];
      return o;
    }
    return over === undefined || over === null ? base : over;
  }
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const oneLine = (s) => String(s || '').replace(/\s+/g, ' ').trim();
  const base = (p) => String(p || '').split(/[\\/]/).filter(Boolean).pop() || p;
  function shortPath(p) {
    const home = S.info.home;
    if (home && p && p.toLowerCase().startsWith(home.toLowerCase())) return '~' + p.slice(home.length);
    return p || '';
  }
  const fmtTime = (ts) => new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  function fmtDur(ms) {
    if (ms < 1000) return ms + 'ms';
    const s = ms / 1000;
    if (s < 60) return s.toFixed(s < 10 ? 1 : 0) + 's';
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ${Math.floor(s % 60)}s`;
    return `${Math.floor(m / 60)}h ${m % 60}m`;
  }
  const fmtTokens = (n) => (n >= 1000 ? (n / 1000).toFixed(n >= 100000 ? 0 : 1) + 'k' : String(n));
  const fmtSize = (n) => (n < 1024 ? n + ' B' : n < 1048576 ? (n / 1024).toFixed(1) + ' KB' : (n / 1048576).toFixed(1) + ' MB');
  const unesc633 = (v) => String(v).replace(/\\x([0-9a-fA-F]{2})|\\\\/g, (m, hx) => (hx ? String.fromCharCode(parseInt(hx, 16)) : '\\'));

  // colors
  function hexToRgb(hex) {
    let x = String(hex || '').trim().replace('#', '');
    if (x.length === 3 || x.length === 4) x = x.split('').map((c) => c + c).join('');
    if (!/^[0-9a-f]{6}/i.test(x)) return null;
    const n = parseInt(x.slice(0, 6), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const rgbToHex = (c) => '#' + c.map((x) => Math.round(Math.max(0, Math.min(255, x))).toString(16).padStart(2, '0')).join('');
  function mix(a, b, t) { const A = hexToRgb(a), B = hexToRgb(b); return A && B ? rgbToHex(A.map((x, i) => x + (B[i] - x) * t)) : a; }
  function luminance(hex) {
    const c = hexToRgb(hex); if (!c) return 0;
    const [r, g, b] = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }
  const toHex6 = (c) => { const rgb = hexToRgb(c); return rgb ? rgbToHex(rgb) : '#000000'; };
  const withAlpha = (c, a) => toHex6(c) + Math.round(a * 255).toString(16).padStart(2, '0');

  // icons (16px stroke set)
  const P = {
    plus: '<path d="M8 3v10M3 8h10"/>', x: '<path d="M4 4l8 8M12 4l-8 8"/>',
    gear: '<circle cx="8" cy="8" r="2.2"/><path d="M8 1.6v1.9M8 12.5v1.9M1.6 8h1.9M12.5 8h1.9M3.5 3.5l1.3 1.3M11.2 11.2l1.3 1.3M3.5 12.5l1.3-1.3M11.2 4.8l1.3-1.3"/>',
    copy: '<rect x="5.2" y="5.2" width="8.3" height="8.3" rx="1.6"/><path d="M3 10.6V3.9C3 3.4 3.4 3 3.9 3h6.7"/>',
    rerun: '<path d="M13 8a5 5 0 1 1-1.5-3.6M13 2.5V5h-2.5"/>',
    star: '<path d="M8 2l1.8 3.8 4.2.5-3.1 2.9.8 4.1L8 11.3 4.3 13.3l.8-4.1L2 6.3l4.2-.5z"/>',
    down: '<path d="M4 6l4 4 4-4"/>', up: '<path d="M4 10l4-4 4 4"/>',
    trash: '<path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 8.5h5.8l.6-8.5"/>', stop: '<rect x="4" y="4" width="8" height="8" rx="1.5" fill="currentColor"/>',
    sidebar: '<rect x="2" y="3" width="12" height="10" rx="2"/><path d="M6 3v10"/>',
    branch: '<circle cx="4.5" cy="3.5" r="1.5"/><circle cx="4.5" cy="12.5" r="1.5"/><circle cx="11.5" cy="5.5" r="1.5"/><path d="M4.5 5v6M11.5 7c0 3-7 2-7 4"/>',
    folder: '<path d="M2 4.5c0-.6.4-1 1-1h3l1.5 1.5H13c.6 0 1 .4 1 1V12c0 .6-.4 1-1 1H3c-.6 0-1-.4-1-1z"/>',
    file: '<path d="M4 2h5l3 3v9H4z"/><path d="M9 2v3h3"/>',
    sparkle: '<path d="M8 1.5l1.6 4.9 4.9 1.6-4.9 1.6L8 14.5l-1.6-4.9L1.5 8l4.9-1.6z"/>', terminal: '<path d="M3 4.5l3.5 3.5L3 11.5M8.5 12H13"/>',
    enter: '<path d="M13 3.5v5H4M7 5.5l-3 3 3 3"/>', rows: '<path d="M3 4h10M3 8h10M3 12h10"/>',
    cards: '<rect x="2.5" y="2.5" width="11" height="4.5" rx="1.2"/><rect x="2.5" y="9" width="11" height="4.5" rx="1.2"/>',
    clock: '<circle cx="8" cy="8" r="5.5"/><path d="M8 5v3l2 1.5"/>', pin: '<path d="M6 2.5h4M7 2.5v4L4.5 9h7L9 6.5v-4M8 9v4.5"/>',
    chat: '<path d="M8 3H4a1.5 1.5 0 0 0-1.5 1.5v6A1.5 1.5 0 0 0 4 12h1v2l2.5-2H12a1.5 1.5 0 0 0 1.5-1.5V8M12 2v4M10 4h4"/>',
    shield: '<path d="M8 2l5 2v4c0 3-2.3 5-5 6-2.7-1-5-3-5-6V4z"/>',
    chip: '<rect x="4" y="4" width="8" height="8" rx="1.5"/><path d="M6 1.5V4M10 1.5V4M6 12v2.5M10 12v2.5M1.5 6H4M1.5 10H4M12 6h2.5M12 10h2.5"/>',
    gauge: '<path d="M2.5 11a5.5 5.5 0 1 1 11 0"/><path d="M8 11l2.5-3"/>',
    coin: '<circle cx="8" cy="8" r="5.5"/><path d="M9.8 6.2C9.4 5.5 8.8 5.2 8 5.2c-1.1 0-1.8.6-1.8 1.4 0 1.9 3.7 1 3.7 2.9 0 .8-.8 1.4-1.9 1.4-.9 0-1.6-.4-1.9-1.1M8 4v1.2M8 10.9V12"/>',
    fold: '<path d="M4 10l4-4 4 4"/>', unfold: '<path d="M4 6l4 4 4-4"/>',
    search: '<circle cx="7" cy="7" r="4.2"/><path d="M10.2 10.2L13.5 13.5"/>',
    eye: '<path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8Z"/><circle cx="8" cy="8" r="2"/>',
  };
  const icon = (n) => `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${P[n] || ''}</svg>`;

  // ================================================================ state
  const S = { tabs: [], activeTabId: null, info: {}, external: [] };
  let st = clone(DEFAULTS); // effective settings
  const ui = {
    selected: null, unread: new Set(), open: new Map(), histIdx: -1, histDraft: '', hist: null, drafts: new Map(),
    stick: true, editing: null, search: '', drag: null, extStates: new Map(),
  };
  const blockEls = new Map();
  const activeTab = () => S.tabs.find((t) => t.id === S.activeTabId) || S.tabs[0];
  const findTab = (id) => S.tabs.find((t) => t.id === id);
  const orderedTabs = () => [...S.tabs.filter((t) => t.pinned), ...S.tabs.filter((t) => !t.pinned)];
  const runningBlock = (t) => t && [...t.blocks].reverse().find((b) => b.status === 'running');
  function lastBlock(t) { return t.blocks.length ? t.blocks[t.blocks.length - 1] : null; }
  const termOf = (t) => t.term || {};

  async function api(method, url, body) {
    const r = await fetch(url, {
      method, headers: { 'content-type': 'application/json', 'x-hangar-token': TOKEN, 'x-hangar-client': CLIENT_ID },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401) location.reload();
    if (!r.ok) throw new Error(j.error || r.statusText);
    return j;
  }

  // ================================================================ settings → CSS
  function normalizeSettings(raw) {
    raw = raw || {};
    const s = merge(clone(DEFAULTS), raw);
    if (!raw.version || raw.version < 2) { s.shell.loadProfile = true; s.version = 2; }   // v2: real shells need the profile
    const ids = new Set(s.agent.chips.map((c) => c.id));
    for (const id of Object.keys(CHIPS)) if (!ids.has(id)) s.agent.chips.push({ id, side: 'hidden' });
    s.agent.chips = s.agent.chips.filter((c) => CHIPS[c.id]);
    if (!raw.version || raw.version < 3) {   // v3: no cost chip; plan usage and slash commands are visible
      const chips = s.agent.chips, usage = chips.find((c) => c.id === 'usage'), cmds = chips.find((c) => c.id === 'commands');
      if (usage.side === 'hidden') usage.side = 'right';
      if (cmds.side === 'hidden') { chips.splice(chips.indexOf(cmds), 1); chips.splice(chips.findIndex((c) => c.id === 'mode') + 1, 0, { id: 'commands', side: 'left' }); }
      s.version = 3;
    }
    if (!Array.isArray(s.theme.ansi) || s.theme.ansi.length !== 16) s.theme.ansi = clone(THEMES.Midnight.ansi);
    return s;
  }
  const bgImage = (v) => (!v ? 'none' : /^((repeating-)?(linear|radial|conic)-gradient|url|image-set|var)\(/i.test(v.trim()) ? v : `url("${v.replace(/"/g, '%22')}")`);
  function swapClass(el, prefix, val) {
    for (const c of [...el.classList]) if (c.startsWith(prefix)) el.classList.remove(c);
    if (val) el.classList.add(prefix + val);
  }

  const wallUrl = (file) => `/api/wallpaper?file=${encodeURIComponent(file)}&token=${TOKEN}`;
  const wallpaperOn = () => !!(st.wallpaper.file && st.wallpaper.kind);
  // 'auto' = liquid glass over a background (an uploaded file, or an image URL in the theme), theme blocks otherwise
  function messageStyle() {
    const m = st.messages.style;
    if (m !== 'auto') return m;
    const themeImg = /^\s*(url\(|https?:|data:|file:|\/)/i.test(st.theme.backgroundImage || '');
    return wallpaperOn() || themeImg ? 'liquid' : 'theme';
  }
  let wallErrShown = '';
  function applyWallpaper() {
    const w = st.wallpaper, on = wallpaperOn(), img = $('#bg-img'), vid = $('#bg-video');
    const src = on ? wallUrl(w.file) : '';
    const failed = () => { if (wallErrShown !== w.file) { wallErrShown = w.file; toast('Background not found', 'Pick it again in Settings → Background & glass.', 'err'); } };
    if (on && w.kind === 'video') {
      if (vid.dataset.src !== src) { vid.dataset.src = src; vid.onerror = failed; vid.onloadeddata = () => Contrast.run(); vid.src = src; }
      vid.hidden = false;
      vid.playbackRate = w.speed;
      if (!document.hidden && vid.paused) vid.play().catch(() => {});
    } else if (vid.dataset.src) { vid.pause(); vid.removeAttribute('src'); vid.load(); vid.dataset.src = ''; vid.hidden = true; }
    if (on && w.kind === 'image') {
      if (img.dataset.src !== src) { img.dataset.src = src; img.onerror = failed; img.onload = () => Contrast.run(); img.src = src; }
      img.hidden = false;
    } else if (img.dataset.src) { img.removeAttribute('src'); img.dataset.src = ''; img.hidden = true; }
  }
  document.addEventListener('visibilitychange', () => {   // no video decoding while the window is hidden
    const vid = $('#bg-video');
    if (!vid.dataset.src) return;
    if (document.hidden) vid.pause(); else vid.play().catch(() => {});
  });

  // Auto contrast: reads the background under the panes (each frame of a GIF / video, every 1.5 s) and raises the glass
  // shade and the panel opacity just enough that 90% of what sits behind the text reaches the minimum contrast.
  // The shade mixes toward the theme background, so on a light theme it lightens dark backgrounds instead.
  const Contrast = (() => {
    const cv = document.createElement('canvas'), ctx = cv.getContext('2d', { willReadFrequently: true });
    const LIN = Array.from({ length: 256 }, (_, i) => { const v = i / 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; });
    const lum = (c) => 0.2126 * LIN[Math.round(c[0])] + 0.7152 * LIN[Math.round(c[1])] + 0.0722 * LIN[Math.round(c[2])];
    const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
    const toward = (c, d, t) => [c[0] + (d[0] - c[0]) * t, c[1] + (d[1] - c[1]) * t, c[2] + (d[2] - c[2]) * t];
    const state = { shade: 0, panel: 0 };
    let timer = 0;
    const active = () => wallpaperOn() && st.messages.autoContrast;
    function frame() {   // the background as drawn on screen (same fit / anchor), 64 px wide
      const v = $('#bg-video'), i = $('#bg-img');
      let el = null, nw = 0, nh = 0;
      if (!v.hidden && v.readyState >= 2) { el = v; nw = v.videoWidth; nh = v.videoHeight; }
      else if (!i.hidden && i.complete && i.naturalWidth) { el = i; nw = i.naturalWidth; nh = i.naturalHeight; }
      if (!el || !nw || !nh || !innerWidth) return null;
      const W = 64, H = Math.max(1, Math.round((W * innerHeight) / innerWidth)), w = st.wallpaper;
      cv.width = W; cv.height = H;
      ctx.fillStyle = toHex6(st.theme.background); ctx.fillRect(0, 0, W, H);
      let sx = W / nw, sy = H / nh;
      if (w.fit === 'cover') sx = sy = Math.max(sx, sy); else if (w.fit === 'contain') sx = sy = Math.min(sx, sy);
      const dw = nw * sx, dh = nh * sy;
      const x = w.position === 'left' ? 0 : w.position === 'right' ? W - dw : (W - dw) / 2;
      const y = w.position === 'top' ? 0 : w.position === 'bottom' ? H - dh : (H - dh) / 2;
      try { ctx.drawImage(el, x, y, dw, dh); return { px: ctx.getImageData(0, 0, W, H).data, W, H, k: W / innerWidth }; } catch { return null; }
    }
    // smallest value in [from, .95] where 90% of the (dimmed) pixels under rect, mixed by layer(c, v), read against the
    // text (and, with withMuted, the grey text at 3:1)
    function solve(f, rect, from, layer, withMuted) {
      const bg = hexToRgb(st.theme.background) || [0, 0, 0], fgL = luminance(st.theme.foreground), mutedL = luminance(st.theme.muted);
      const dim = st.wallpaper.dim, target = st.messages.minContrast, mutedTarget = Math.min(3, target), pix = [];
      const x0 = Math.max(0, Math.floor(rect.left * f.k)), x1 = Math.min(f.W, Math.ceil(rect.right * f.k));
      const y0 = Math.max(0, Math.floor(rect.top * f.k)), y1 = Math.min(f.H, Math.ceil(rect.bottom * f.k));
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        const i = (y * f.W + x) * 4;
        pix.push(toward([f.px[i], f.px[i + 1], f.px[i + 2]], bg, dim));
      }
      if (!pix.length) return from;
      for (let v = from; v < 0.95; v += 0.02) {
        let ok = 0;
        for (const c of pix) { const L = lum(layer(c, v, bg)); if (ratio(L, fgL) >= target && (!withMuted || ratio(L, mutedL) >= mutedTarget)) ok++; }
        if (ok >= pix.length * 0.9) return v;
      }
      return 0.95;
    }
    function run() {
      let shade = 0, panel = 0;
      const f = active() ? frame() : null;
      if (active() && !f) return;   // media still loading: keep the last values
      if (f) {
        const ms = st.messages, style = messageStyle(), tint = hexToRgb(ms.tint) || [255, 255, 255], a = Math.min(1, ms.opacity * 1.1);
        const pane = $('#pane').getBoundingClientRect();
        if (style === 'liquid') shade = solve(f, pane, ms.shade, (c, v, bg) => toward(toward(c, bg, v), tint, a));
        else if (style === 'frosted') shade = solve(f, pane, ms.shade, (c, v, bg) => toward(c, bg, Math.min(1, 0.45 + ms.opacity + 0.3 * v)));
        panel = solve(f, $('#app').getBoundingClientRect(), basePanelAlpha(), (c, v, bg) => toward(c, bg, v), true);
      }
      // rise right away, ease down only on a clear change: busy videos don't make the glass pump
      const pick = (old, nv) => (nv > old + 0.01 || nv < old - 0.06 ? nv : old);
      const ns = pick(state.shade, shade), np = pick(state.panel, panel);
      if (ns === state.shade && np === state.panel) return;
      state.shade = ns; state.panel = np;
      const r = document.documentElement.style;
      r.setProperty('--msg-shade', String(Math.max(st.messages.shade, ns)));
      r.setProperty('--panel-alpha', String(Math.max(basePanelAlpha(), np)));
    }
    function schedule() {
      clearInterval(timer); timer = 0;
      if (active() && (st.wallpaper.kind === 'video' || /\.(gif|webp|avif)$/i.test(st.wallpaper.file))) timer = setInterval(() => { if (!document.hidden) run(); }, 1500);
      requestAnimationFrame(run);
    }
    addEventListener('resize', debounce(run, 300));
    return { state, run, schedule };
  })();
  function basePanelAlpha() { const t = st.theme; return wallpaperOn() ? Math.min(t.panelOpacity, st.wallpaper.panelOpacity) : t.panelOpacity; }

  function applySettings() {
    const r = document.documentElement.style, t = st.theme, ty = st.typography, sh = st.shape, w = st.wallpaper, ms = st.messages;
    const wp = wallpaperOn(), gpu = st.render.gpu;
    const vars = {
      '--bg': t.background, '--surface': t.surface, '--surface-2': t.surface2, '--fg': t.foreground, '--muted': t.muted, '--border': t.border,
      '--accent': t.accent, '--accent-fg': t.accentFg, '--ok': t.success, '--err': t.error, '--warn': t.warning, '--info': t.info,
      '--font-ui': ty.uiFont, '--font-mono': ty.monoFont, '--ui-size': ty.uiSize + 'px', '--mono-size': ty.monoSize + 'px',
      '--mono-weight': ty.monoWeight, '--lh': ty.lineHeight, '--radius': sh.radius + 'px', '--block-radius': sh.blockRadius + 'px',
      '--bw': sh.borderWidth + 'px', '--gap': sh.gap + 'px', '--tabs-w': st.tabs.width + 'px',
      '--panel-alpha': Math.max(basePanelAlpha(), Contrast.state.panel),
      '--blur': (gpu ? (wp ? w.panelBlur : t.blur) : 0) + 'px', '--speed': st.motion.speed, '--cmd-scale': st.blocks.commandSize,
      '--bg-image': bgImage(t.backgroundImage), '--term-pad': st.terminal.padding + 'px',
      '--wp-fit': w.fit, '--wp-pos': w.position, '--wp-dim': wp ? w.dim : 0, '--wp-blur': (wp ? w.blur : 0) + 'px',
      '--wp-scale': wp && w.blur ? 1 + Math.min(0.2, w.blur * 0.005) : 1,
      '--msg-tint': ms.tint || '#ffffff', '--msg-alpha': ms.opacity, '--msg-shade': Math.max(ms.shade, Contrast.state.shade), '--msg-blur': (gpu ? ms.blur : 0) + 'px', '--msg-sat': ms.saturate,
    };
    t.ansi.forEach((c, i) => { vars['--ansi-' + i] = c; });
    for (const [k, v] of Object.entries(vars)) r.setProperty(k, String(v));
    const b = document.body;
    const flags = {
      'tabs-right': st.tabs.position === 'right', 'tabs-compact': st.tabs.viewMode === 'compact', 'flow-top': st.blocks.flow === 'top',
      'input-top': st.input.position === 'top', 'no-anim': !st.motion.animations, 'no-liga': !ty.ligatures, sticky: st.blocks.stickyHeaders,
      'no-ts': !st.blocks.showTimestamps, 'no-dur': !st.blocks.showDuration, 'no-cwd': !st.blocks.showCwd, 'no-ind': !st.tabs.showIndicators,
      'show-toolbar': st.agent.toolbar, 'tools-detailed': st.agent.toolStyle === 'detailed', cpu: !st.render.gpu, 'has-wallpaper': wp,
    };
    for (const [k, v] of Object.entries(flags)) b.classList.toggle(k, !!v);
    swapClass(b, 'bs-', st.blocks.style); swapClass(b, 'dens-', sh.density); swapClass(b, 'sh-', sh.shadow);
    swapClass(b, 'ind-', st.tabs.indicatorStyle); swapClass(b, 'tc-', st.tabs.colorStyle); swapClass(b, 'exit-', st.blocks.exitBadge);
    swapClass(b, 'msg-', messageStyle());
    applyWallpaper();
    Contrast.schedule();
    $('#toasts').className = st.notifications.toastPosition;
    $('#custom-css').textContent = st.customCss || '';
    const gf = (ty.googleFonts || '').split(',').map((s) => s.trim()).filter(Boolean);
    const link = $('#gfonts');
    const href = gf.length ? 'https://fonts.googleapis.com/css2?' + gf.map((f) => 'family=' + encodeURIComponent(f).replace(/%20/g, '+')).join('&') + '&display=swap' : '';
    if (href && link.getAttribute('href') !== href) { link.href = href; link.onload = () => document.fonts.ready.then(() => Terms.applyAll(true)); }
    else if (!href) link.removeAttribute('href');
    document.documentElement.style.colorScheme = luminance(t.background) > 0.4 ? 'light' : 'dark';
    $('#view-toggle').innerHTML = icon(st.tabs.viewMode === 'compact' ? 'cards' : 'rows');
    Terms.applyAll();
    placeCorral();
  }

  const persistSettings = debounce(() => api('PUT', '/api/settings', st).catch((e) => toast('Settings not saved', e.message, 'err')), 300);
  const rerenderAll = debounce(() => { renderTabs(); renderPane(false); }, 60);
  function settingsChanged({ full = true } = {}) {
    applySettings();
    persistSettings();
    if (full) rerenderAll();
  }

  // ================================================================ syntax colors (highlight.js, colored with the theme's ANSI palette)
  const LANG_BY_EXT = {
    js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'javascript', ts: 'typescript', tsx: 'typescript', mts: 'typescript',
    py: 'python', pyw: 'python', json: 'json', jsonc: 'json', css: 'css', scss: 'scss', less: 'less',
    html: 'xml', htm: 'xml', xml: 'xml', svg: 'xml', vue: 'xml', svelte: 'xml', astro: 'xml', md: 'markdown', markdown: 'markdown',
    sh: 'bash', bash: 'bash', zsh: 'bash', ps1: 'powershell', psm1: 'powershell', psd1: 'powershell', bat: 'dos', cmd: 'dos',
    cs: 'csharp', java: 'java', kt: 'kotlin', kts: 'kotlin', go: 'go', rs: 'rust', rb: 'ruby', php: 'php', swift: 'swift',
    c: 'c', h: 'c', cpp: 'cpp', cc: 'cpp', cxx: 'cpp', hpp: 'cpp', sql: 'sql', yaml: 'yaml', yml: 'yaml',
    toml: 'ini', ini: 'ini', env: 'ini', cfg: 'ini', lua: 'lua', r: 'r', pl: 'perl', diff: 'diff', patch: 'diff', graphql: 'graphql', gql: 'graphql',
  };
  function langOf(file) {
    const name = base(file).toLowerCase();
    if (name === 'dockerfile' || name.startsWith('dockerfile.')) return 'dockerfile';
    if (name === 'makefile') return 'makefile';
    const lang = LANG_BY_EXT[(name.match(/\.([\w]+)$/) || [])[1]];
    return lang && window.hljs && window.hljs.getLanguage(lang) ? lang : null;
  }
  // HTML with colored spans, or null when the language is unknown (callers fall back to escaped text)
  function highlightCode(code, lang) {
    const hl = window.hljs;
    if (!hl || !lang || !hl.getLanguage(lang)) return null;
    try { return hl.highlight(code, { language: lang, ignoreIllegals: true }).value; } catch { return null; }
  }

  // ================================================================ markdown (agent text)
  function md(src) {
    const fences = [];
    src = String(src || '').replace(/```([\w+.#-]*)\n?([\s\S]*?)(?:```|$)/g, (_, lang, code) => {
      code = code.replace(/\n$/, '');
      const alias = { js: 'javascript', ts: 'typescript', py: 'python', sh: 'bash', ps: 'powershell', ps1: 'powershell', pwsh: 'powershell', 'c#': 'csharp', cs: 'csharp', html: 'xml', yml: 'yaml' }[lang.toLowerCase()] || lang.toLowerCase();
      fences.push(`<pre><code>${highlightCode(code, alias) ?? esc(code)}</code></pre>`);
      return `\u0000${fences.length - 1}\u0000`;
    });
    const inline = (s) => esc(s)
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
      .replace(/(^|[^*\w])\*([^*\s][^*]*?)\*(?!\w)/g, '$1<i>$2</i>')
      .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    let html = '', list = null, para = [], table = [];
    const flushP = () => { if (para.length) { html += '<p>' + para.map(inline).join('<br>') + '</p>'; para = []; } };
    const closeList = () => { if (list) { html += `</${list}>`; list = null; } };
    const flushTable = () => {
      if (!table.length) return;
      const rows = table.filter((r) => !/^\s*\|?\s*:?-{2,}/.test(r)).map((r) => r.trim().replace(/^\||\|$/g, '').split('|'));
      html += '<table>' + rows.map((r, i) => '<tr>' + r.map((c) => (i ? `<td>${inline(c.trim())}</td>` : `<th>${inline(c.trim())}</th>`)).join('') + '</tr>').join('') + '</table>';
      table = [];
    };
    for (const line of src.split('\n')) {
      let m;
      if (/^\s*\|.*\|\s*$/.test(line)) { flushP(); closeList(); table.push(line); continue; }
      flushTable();
      if ((m = line.match(/^\u0000(\d+)\u0000$/))) { flushP(); closeList(); html += fences[+m[1]]; continue; }
      if ((m = line.match(/^(#{1,6})\s+(.*)/))) { flushP(); closeList(); const lv = m[1].length <= 2 ? 3 : 4; html += `<h${lv}>${inline(m[2])}</h${lv}>`; continue; }
      if ((m = line.match(/^\s*[-*+]\s+(.*)/))) { flushP(); if (list !== 'ul') { closeList(); html += '<ul>'; list = 'ul'; } html += `<li>${inline(m[1])}</li>`; continue; }
      if ((m = line.match(/^\s*\d+[.)]\s+(.*)/))) { flushP(); if (list !== 'ol') { closeList(); html += '<ol>'; list = 'ol'; } html += `<li>${inline(m[1])}</li>`; continue; }
      if (!line.trim()) { flushP(); closeList(); continue; }
      closeList();
      para.push(line);
    }
    flushTable(); flushP(); closeList();
    return html.replace(/\u0000(\d+)\u0000/g, (_, i) => fences[+i]);
  }

  // ================================================================ Claude sessions (from the Clawd hook files)
  // A tab can hold a headless conversation (agent view) and/or an interactive `claude` running in its terminal;
  // the hook tags the latter with the tab id (CLAWD_HOST_TAB), the former also carries host "hangar".
  const headlessSession = (t) => (t.agentSessionId && S.external.find((x) => x.sid === t.agentSessionId)) || null;
  const interactiveSession = (t) => S.external.find((x) => x.tab === t.id && !x.host) || null;
  const activeSession = (t) => (t.mode === 'agent' ? headlessSession(t) || interactiveSession(t) : interactiveSession(t) || headlessSession(t));
  const isClaudeTab = (t) => t.mode === 'agent' || !!t.agentSessionId || !!termOf(t).cliAgent || !!interactiveSession(t);
  function clawdSessionColor(t) {
    const e = activeSession(t);
    if (e) return e.skin === 'mimi' ? '#FFFFFF' : e.color || '';
    return t.clawdColor || '';
  }
  function clawdState(t) {
    const rb = runningBlock(t);
    if (rb && rb.kind === 'agent') { const e = headlessSession(t); return e && CL.WORKING.has(e.state) ? e.state : 'thinking'; }
    const i = interactiveSession(t);
    if (i) return i.state;
    const lb = lastBlock(t);
    if (lb && lb.meta && lb.meta.denials && lb.meta.denials.length) return 'waiting';
    return 'idle';
  }
  function clawdSkin(t) {
    const e = activeSession(t);
    return (e && e.skin) || (String(t.customTitle).toLowerCase() === 'mimi' ? 'mimi' : '');
  }

  // ================================================================ tabs panel (Warp vertical tabs)
  const STATUS_LABEL = { idle: 'Idle', running: 'Running a command', agent: 'Claude is working', success: 'Last command succeeded', error: 'Last command failed', attention: 'Needs you / finished while away' };
  function tabStatus(t) {
    if (runningBlock(t)) return 'agent';
    const cs = isClaudeTab(t) ? clawdState(t) : 'idle';
    if (cs === 'waiting') return 'attention';
    if (CL.WORKING.has(cs)) return 'agent';
    const T = termOf(t);
    if (T.running && !T.cliAgent) return 'running';
    if (ui.unread.has(t.id)) return 'attention';
    if (t.mode === 'agent') {
      const lb = lastBlock(t);
      if (!lb) return 'idle';
      return lb.status === 'done' ? 'success' : lb.status === 'running' ? 'agent' : 'error';
    }
    if (T.running) return 'idle';   // interactive claude waiting for your prompt
    if (!T.last || T.last.exitCode == null) return 'idle';
    return T.last.exitCode === 0 ? 'success' : 'error';
  }
  function dirColor(cwd) {
    const norm = (p) => String(p).replace(/[\\/]+$/, '').replace(/\//g, '\\').toLowerCase();
    const c = norm(cwd);
    let best = null, len = -1;
    for (const d of st.tabs.directoryColors || []) {
      if (!d.path || !d.color) continue;
      const p = norm(d.path.replace(/^~/, S.info.home || '~'));
      if ((c === p || c.startsWith(p + '\\')) && p.length > len) { best = d.color; len = p.length; }
    }
    return best;
  }
  const tabColor = (t) => t.color || dirColor(t.cwd) || (st.tabs.usePeacock && t.git && t.git.peacock) || (st.clawd.colorTabs && clawdSessionColor(t)) || '';
  function tabTitle(t) {
    if (t.customTitle) return t.customTitle;
    const pi = st.tabs.primaryInfo;
    if (pi === 'working_directory') return shortPath(t.cwd);
    if (pi === 'branch' && t.git && t.git.branch) return t.git.branch;
    if (t.mode === 'agent') {
      const lb = lastBlock(t);
      return lb && st.tabs.latestPromptAsTitle ? oneLine(lb.prompt) : `Claude · ${base(t.cwd)}`;
    }
    const T = termOf(t), i = interactiveSession(t);
    if (i && i.name) return `claude ${i.name}`;
    if (T.running) return oneLine(T.running.command);
    if (T.last) return oneLine(T.last.command);
    return base(t.cwd);
  }
  function tabSubtitle(t) {
    const s = st.tabs.subtitle;
    if (s === 'none') return null;
    if (s === 'branch' && t.git && t.git.branch) return { icon: 'branch', text: t.git.branch };
    if (s === 'command') { const l = termOf(t).last; if (l) return { icon: 'terminal', text: oneLine(l.command) }; }
    return { icon: 'folder', text: shortPath(t.cwd) };
  }
  const diffHtml = (g) => `<span class="a">+${g.added}</span> <span class="r">−${g.removed}</span>`;

  let tabsQueued = false;
  function scheduleTabs() { if (!tabsQueued) { tabsQueued = true; requestAnimationFrame(() => { tabsQueued = false; renderTabs(); }); } }
  function renderTabs() {
    if (ui.editing) return;
    hideHovercard();
    const list = $('#tab-list');
    list.textContent = '';
    const q = ui.search.toLowerCase();
    const tabs = orderedTabs();
    tabs.forEach((t, i) => {
      const title = tabTitle(t);
      if (q && !`${title} ${t.cwd} ${(t.git && t.git.branch) || ''}`.toLowerCase().includes(q)) return;
      if (i > 0 && !t.pinned && tabs[i - 1].pinned && !q) list.append(h('div', { class: 'tabs-divider' }));
      list.append(tabEl(t, title));
    });
    renderExternal();
    renderUsage();
    refreshCorral();
    drawTabClawds();
  }

  function tabEl(t, title) {
    const status = tabStatus(t), sub = tabSubtitle(t), g = t.git;
    const el = h('div', { class: 'tab' + (t.id === S.activeTabId ? ' active' : ''), role: 'tab', draggable: 'true', dataset: { id: t.id } });
    el.style.setProperty('--tab-color', tabColor(t) || 'transparent');
    const titleEl = h('div', { class: 'tab-title' }, h('span', { class: 'cdot' }), ' ', h('span', { class: 'tt' }, title));
    const main = h('div', { class: 'tab-main' }, titleEl,
      sub && h('div', { class: 'tab-sub' }, h('span', { class: 's', html: icon(sub.icon) + esc(sub.text) })));
    const end = h('div', { class: 'tab-end' },
      st.tabs.showDiffStats && g && (g.added || g.removed) ? h('span', { class: 'diff', html: diffHtml(g) }) : null,
      t.pinned ? h('span', { class: 'pin', html: icon('pin'), title: 'Pinned' }) : null,
      h('button', { class: 'icon-btn tab-close', title: 'Close (Alt+W)', html: icon('x'), onclick: (e) => { e.stopPropagation(); closeTab(t); } }));
    const clawdInd = st.tabs.indicatorStyle === 'clawd' && (isClaudeTab(t) || st.clawd.terminalClawds);
    el.append(clawdInd ? h('canvas', { class: 'ind clawd-ind', dataset: { id: t.id }, title: STATUS_LABEL[status] }) : h('span', { class: 'ind ' + status, title: STATUS_LABEL[status] }), main, end);
    el.addEventListener('click', () => activate(t.id));
    el.addEventListener('auxclick', (e) => { if (e.button === 1) closeTab(t); });
    titleEl.addEventListener('dblclick', (e) => { e.stopPropagation(); renameTab(t, el); });
    el.addEventListener('contextmenu', (e) => { e.preventDefault(); tabMenu(t, e.clientX, e.clientY, el); });
    el.addEventListener('mouseenter', () => scheduleHovercard(t, el));
    el.addEventListener('mouseleave', hideHovercard);
    el.addEventListener('dragstart', (e) => { ui.drag = t.id; el.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; hideHovercard(); });
    el.addEventListener('dragend', () => { ui.drag = null; $$('.tab').forEach((x) => x.classList.remove('dragging', 'drop-before', 'drop-after')); });
    el.addEventListener('dragover', (e) => {
      if (!ui.drag || ui.drag === t.id) return;
      e.preventDefault();
      const r = el.getBoundingClientRect(), after = e.clientY > r.top + r.height / 2;
      el.classList.toggle('drop-after', after); el.classList.toggle('drop-before', !after);
    });
    el.addEventListener('dragleave', () => el.classList.remove('drop-before', 'drop-after'));
    el.addEventListener('drop', (e) => {
      e.preventDefault();
      const after = el.classList.contains('drop-after');
      const ids = orderedTabs().map((x) => x.id).filter((id) => id !== ui.drag);
      ids.splice(ids.indexOf(t.id) + (after ? 1 : 0), 0, ui.drag);
      S.tabs.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id));
      renderTabs();
      api('POST', '/api/tabs/reorder', { ids }).catch(() => {});
    });
    return el;
  }

  function renameTab(t, el) {
    el = el || $(`.tab[data-id="${t.id}"]`);
    if (!el) return;
    const holder = $('.tt', el);
    ui.editing = t.id;
    const inp = h('input', { value: t.customTitle || tabTitle(t), spellcheck: 'false' });
    holder.replaceWith(inp);
    inp.focus(); inp.select();
    let done = false;
    const finish = (commit) => {
      if (done) return; done = true; ui.editing = null;
      if (commit) patchTab(t, { customTitle: inp.value.trim().slice(0, 80) }); else renderTabs();
    };
    inp.addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') finish(true); if (e.key === 'Escape') finish(false); });
    inp.addEventListener('blur', () => finish(true));
    inp.addEventListener('click', (e) => e.stopPropagation());
  }

  const SWATCHES = ['#f87171', '#fb923c', '#fbbf24', '#a3e635', '#34d399', '#22d3ee', '#60a5fa', '#818cf8', '#c084fc', '#f472b6', '#d77757', '#94a3b8'];
  const SHELL_LABEL = { powershell: 'Windows PowerShell', pwsh: 'PowerShell 7', cmd: 'Command Prompt', bash: 'Git Bash', sh: 'sh' };
  function tabMenu(t, x, y, el) {
    showMenu(x, y, [
      { label: 'Rename', hint: 'double-click', run: () => renameTab(t, el) },
      { label: t.pinned ? 'Unpin' : 'Pin to top', run: () => patchTab(t, { pinned: !t.pinned }) },
      { swatches: true, current: t.color, pick: (c) => patchTab(t, { color: c }) },
      t.color ? { label: 'Use this color for the folder', hint: base(t.cwd), run: () => { st.tabs.directoryColors = [...st.tabs.directoryColors.filter((d) => d.path.toLowerCase() !== t.cwd.toLowerCase()), { path: t.cwd, color: t.color }]; settingsChanged(); toast('Directory color saved', shortPath(t.cwd)); } } : null,
      { sep: true },
      { label: t.mode === 'agent' ? 'Show the terminal' : 'Show the Claude agent view', hint: 'Ctrl+I', run: () => setMode(t, t.mode === 'agent' ? 'terminal' : 'agent') },
      { label: 'Claude commands…', hint: '/', run: () => Cmds.openFor(t, x, y) },
      { label: 'Restart shell', run: () => wsSend({ t: 'restart', tab: t.id }) },
      { label: 'Clear scrollback', run: () => Terms.clear(t.id) },
      t.agentSessionId ? { label: 'Copy resume command', hint: 'claude --resume', run: () => copy(`claude --resume ${t.agentSessionId}`, 'Resume command copied') } : null,
      { label: 'Duplicate', run: () => newTab({ cwd: t.cwd, shell: t.shell }) },
      { label: 'Copy path', run: () => copy(t.cwd, 'Path copied') },
      { sep: true },
      { label: 'Close other tabs', run: () => S.tabs.filter((o) => o !== t && !o.pinned).forEach((o) => closeTab(o, true)) },
      { label: 'Close', hint: 'Alt+W', danger: true, run: () => closeTab(t) },
    ]);
  }
  function shellMenu(x, y) {
    showMenu(x, y, (S.info.shells || []).map((sh) => ({ label: SHELL_LABEL[sh] || sh, hint: sh === (st.shell.kind || S.info.defaultShell) ? 'default' : '', run: () => newTab({ shell: sh }) })));
  }

  // hover details (Warp's "details sidecar")
  let hoverTimer = null;
  function scheduleHovercard(t, el) {
    clearTimeout(hoverTimer);
    if (!st.tabs.hoverDetails || ui.drag) return;
    hoverTimer = setTimeout(() => {
      const card = $('#hovercard'), g = t.git || {}, T = termOf(t), sess = activeSession(t);
      const row = (k, v) => (v || v === 0 ? h('div', { class: 'row' }, k, h('b', { title: String(v) }, String(v))) : null);
      card.textContent = '';
      card.append(...[
        h('div', { class: 'hc-title' }, tabTitle(t)),
        row('Directory', shortPath(t.cwd)), row('Branch', g.branch),
        g.files ? h('div', { class: 'row' }, 'Changes', h('b', { html: `${g.files} files · ${diffHtml(g)}` })) : null,
        row('Shell', SHELL_LABEL[T.shell || t.shell] || T.shell || t.shell || S.info.defaultShell),
        T.running ? row('Running', `${oneLine(T.running.command).slice(0, 40)} · ${fmtDur(Date.now() - T.running.start)}`) : null,
        !T.running && T.last ? row('Last command', `${oneLine(T.last.command).slice(0, 30)} → ${T.last.exitCode ?? '?'}`) : null,
        sess ? row('Claude', `${sess.name || 'session'} · ${STATE_WORDS[sess.state] || sess.state}`) : null,
        t.agentSessionId ? row('Conversation', t.agentSessionId.slice(0, 8)) : null,
        tabColor(t) ? h('div', { class: 'row' }, 'Color', h('b', { style: { color: tabColor(t) } }, '● ' + tabColor(t))) : null].filter(Boolean));
      const r = el.getBoundingClientRect(), panel = $('#tabs-panel').getBoundingClientRect();
      card.hidden = false;
      const left = st.tabs.position === 'right' ? panel.left - card.offsetWidth - 8 : panel.right + 8;
      card.style.left = left + 'px';
      card.style.top = Math.max(8, Math.min(r.top, innerHeight - card.offsetHeight - 8)) + 'px';
    }, 450);
  }
  function hideHovercard() { clearTimeout(hoverTimer); $('#hovercard').hidden = true; }

  const STATE_WORDS = { thinking: 'thinking', reading: 'reading', writing: 'writing', running: 'running', searching: 'searching', waiting: 'needs you', idle: 'idle' };
  function renderExternal() {
    const wrap = $('#external-wrap'), list = $('#external-list');
    const ex = st.tabs.showExternal ? S.external.filter((e) => !findTab(e.tab)) : [];
    wrap.classList.toggle('empty', !ex.length);
    list.textContent = '';
    for (const s of ex) {
      const busy = !['idle', 'waiting'].includes(s.state);
      list.append(h('div', { class: 'ext', title: `${s.cwd}\nClick to open a tab here`, onclick: () => newTab({ cwd: s.cwd }) },
        h('span', { class: 'dot' + (busy ? ' busy' : ''), style: { background: s.skin === 'mimi' ? '#ffffff' : s.color || 'var(--accent)' } }),
        h('span', { class: 'n' }, s.name || base(s.cwd)),
        h('span', { class: 'st ' + s.state }, STATE_WORDS[s.state] || s.state)));
    }
  }

  // ================================================================ tab actions
  async function newTab(opts = {}) {
    const t = activeTab();
    try { await api('POST', '/api/tabs', { cwd: opts.cwd || (t && t.cwd), mode: opts.mode, title: opts.title, shell: opts.shell || st.shell.kind || '' }); }
    catch (e) { toast('Could not open tab', e.message, 'err'); }
  }
  function activate(id) {
    if (!findTab(id)) return;
    if (S.activeTabId && S.activeTabId !== id) { ui.drafts.set(S.activeTabId, input.value); input.value = ui.drafts.get(id) || ''; autoGrow(); }
    S.activeTabId = id;
    ui.unread.delete(id);
    ui.selected = null;
    ui.histIdx = -1;
    renderTabs();
    renderPane(true);
    api('POST', '/api/active', { tabId: id }).catch(() => {});
  }
  function cycleTab(dir) {
    const tabs = orderedTabs(), i = tabs.findIndex((t) => t.id === S.activeTabId);
    activate(tabs[(i + dir + tabs.length) % tabs.length].id);
  }
  async function closeTab(t, silent) {
    if (!t) return;
    if (!silent && (runningBlock(t) || termOf(t).running) && !confirm('Something is still running in this tab. Close it anyway?')) return;
    api('DELETE', `/api/tabs/${t.id}`).catch((e) => toast('Could not close tab', e.message, 'err'));
  }
  async function patchTab(t, patch) {
    Object.assign(t, patch);
    renderTabs();
    if (t.id === S.activeTabId) { if ('mode' in patch) renderPane(true); else { renderPaneHead(t); renderToolbar(t); } }
    try { await api('PATCH', `/api/tabs/${t.id}`, patch); } catch (e) { toast('Update failed', e.message, 'err'); }
  }
  function setMode(t, mode) { patchTab(t, { mode }); }
  const toggleMode = () => { const t = activeTab(); setMode(t, t.mode === 'agent' ? 'terminal' : 'agent'); };
  function clearActive() {
    const t = activeTab();
    if (t.mode === 'agent') api('POST', `/api/tabs/${t.id}/clear`).catch(() => {});
    else Terms.clear(t.id);
  }
  function togglePanel() {
    if (innerWidth <= 760) document.body.classList.toggle('panel-shown');
    else document.body.classList.toggle('panel-hidden');
    requestAnimationFrame(() => Terms.fitActive());
  }

  // ================================================================ real terminals (xterm.js ⇄ WebSocket ⇄ node-pty)
  let wsock = null, wsReady = false;
  function wsSend(m) { if (wsReady) wsock.send(JSON.stringify(m)); }
  function wsConnect() {
    wsock = new WebSocket(`ws://${location.host}/ws?token=${TOKEN}`);
    wsock.onopen = () => { wsReady = true; for (const tt of Terms.all()) tt.attach(); };
    wsock.onmessage = (e) => {
      const m = JSON.parse(e.data);
      const tt = Terms.get(m.tab);
      if (!tt) return;
      if (m.t === 'o') tt.term.write(m.d);
      else if (m.t === 'replay') tt.replay(m.d);
    };
    wsock.onclose = () => { wsReady = false; setTimeout(wsConnect, 1000); };
  }

  function termTheme(transparent) {
    const t = st.theme, a = t.ansi;
    return {
      background: transparent ? 'rgba(0,0,0,0)' : t.background, foreground: t.foreground,
      cursor: st.terminal.cursorColor || t.accent, cursorAccent: t.background,
      selectionBackground: withAlpha(t.accent, 0.35), selectionInactiveBackground: withAlpha(t.accent, 0.2),
      scrollbarSliderBackground: withAlpha(t.foreground, 0.12), scrollbarSliderHoverBackground: withAlpha(t.foreground, 0.22), scrollbarSliderActiveBackground: withAlpha(t.foreground, 0.3),
      black: a[0], red: a[1], green: a[2], yellow: a[3], blue: a[4], magenta: a[5], cyan: a[6], white: a[7],
      brightBlack: a[8], brightRed: a[9], brightGreen: a[10], brightYellow: a[11], brightBlue: a[12], brightMagenta: a[13], brightCyan: a[14], brightWhite: a[15],
    };
  }
  function termOptions() {
    const ty = st.typography, T = st.terminal, transparent = st.theme.panelOpacity < 1 || !!st.theme.backgroundImage || wallpaperOn();
    return {
      allowProposedApi: true, allowTransparency: transparent, theme: termTheme(transparent),
      fontFamily: ty.monoFont, fontSize: ty.monoSize, fontWeight: ty.monoWeight, fontWeightBold: Math.min(900, ty.monoWeight + 300),
      lineHeight: T.lineHeight, cursorBlink: T.cursorBlink, cursorStyle: T.cursorStyle, cursorInactiveStyle: 'outline',
      scrollback: T.scrollback, minimumContrastRatio: T.minContrast, smoothScrollDuration: st.motion.animations ? T.smoothScroll : 0,
      drawBoldTextInBrightColors: true, rightClickSelectsWord: false, macOptionIsMeta: true,
      windowsPty: { backend: 'conpty', buildNumber: 22621 },   // bundled modern ConPTY (useConptyDll on the server)
      linkHandler: { activate: (e, uri) => openUri(uri), allowNonHttpProtocols: true },   // OSC 8 hyperlinks
    };
  }

  // ================================================================ file paths → viewer (terminal output + agent text)
  const FILE_EXT = 'pdf|pptx?|docx?|xlsx?|odt|odp|ods|rtf|md|markdown|txt|json|csv|tsv|html?|css|jsx?|tsx?|mjs|cjs|py|ps1|sh|ya?ml|toml|xml|svg|png|jpe?g|gif|webp|bmp|ico|mp3|wav|ogg|m4a|mp4|webm|mov|log|ini|sql|cs|go|rs|java|cpp|vue|svelte';
  // absolute (C:\, ~/, ./, ../, Git Bash /c/) or relative with a known extension; existence is checked before linking
  const PATH_RE = new RegExp(String.raw`(?<![\w\\/.:~-])(?:(?:[A-Za-z]:|~|\.{1,2}|\/[A-Za-z](?=\/))[\\/][^\s"'<>|*?()[\]{}\x60]+|(?:[\w.-]+[\\/])*[\w-][\w.-]*\.(?:${FILE_EXT})(?![\w-]))`, 'gi');
  const trimPath = (s) => s.replace(/[.,;!?'"]+$/, '').replace(/(:\d+){1,2}$/, '').replace(/[.,:;!?'"]+$/, '');
  function findPaths(text) {
    const out = [];
    for (const m of text.matchAll(PATH_RE)) { const raw = trimPath(m[0]); if (raw.length > 2) out.push({ raw, index: m.index }); }
    return out;
  }
  // PATH_RE stops at spaces; a whole `code span` that looks like a path counts as one (C:\dev\CHAT REDES\x.py).
  const looksLikePath = (t) => t.length < 400 && !/[\n`<>|*?"]/.test(t)
    && (/^(?:[A-Za-z]:[\\/]|~[\\/]|\.{1,2}[\\/]|\/[A-Za-z]\/)/.test(t) || (/[\\/]/.test(t) && /\.\w{1,8}$/.test(t)));
  const codeSpanPaths = (text) => [...String(text).matchAll(/`([^`\n]+)`/g)].map((m) => trimPath(m[1].trim())).filter(looksLikePath);
  const statCache = new Map();   // cwd + path -> { at, p }
  function statPath(raw, cwd, fresh) {
    const key = (cwd || '') + '\n' + raw, hit = statCache.get(key);
    if (hit && !fresh && Date.now() - hit.at < 8000) return hit.p;
    const p = api('GET', `/api/fs/stat?path=${encodeURIComponent(raw)}&cwd=${encodeURIComponent(cwd || '')}`).catch(() => ({ exists: false }));
    statCache.set(key, { at: Date.now(), p });
    if (statCache.size > 500) statCache.delete(statCache.keys().next().value);
    return p;
  }
  function openUri(uri) {
    if (/^file:/i.test(uri)) {
      let p = decodeURIComponent(new URL(uri).pathname);
      if (/^\/[A-Za-z]:/.test(p)) p = p.slice(1);
      return Files.open(p);
    }
    if (/^https?:/i.test(uri)) window.open(uri, '_blank');
  }
  // Media files Claude made or mentions (images, PDFs, office, video, audio) get a preview card at the end of its
  // message; code/text files stay as plain links. Sources: its text, Write/Edit paths and Bash/PowerShell commands.
  const MEDIA_RE = /\.(png|jpe?g|gif|webp|bmp|svg|pdf|pptx?|docx?|xlsx?|odp|odt|ods|mp4|webm|mov|mp3|wav|ogg|m4a)$/i;
  function mediaCandidates(b) {
    const out = new Set();
    for (const ev of b.events) {
      if (ev.type === 'text') { for (const f of findPaths(ev.text)) out.add(f.raw); for (const p of codeSpanPaths(ev.text)) out.add(p); }
      else if (ev.type === 'tool') {
        const i = ev.input || {};
        if (['Write', 'Edit', 'NotebookEdit'].includes(ev.name) && (i.file_path || i.notebook_path)) out.add(i.file_path || i.notebook_path);
        if ((ev.name === 'Bash' || ev.name === 'PowerShell') && i.command) for (const f of findPaths(i.command)) out.add(f.raw);
      }
    }
    for (const f of turnFiles(b)) if (f.status !== 'D') out.add(f.abs);   // e.g. a chart a Python script wrote
    return [...out].filter((p) => MEDIA_RE.test(p)).slice(0, 12);
  }
  // Files the turn changed: from its git checkpoints (Bash/scripts included) and from the copies the checkpoint hook
  // kept of every file a tool touched (any folder); [] when there are none. base: what the file is diffed against.
  function turnFiles(b) {
    const g = b.meta && b.meta.git, fc = b.meta && b.meta.files, sep = S.info.sep || '\\';
    const out = g && g.files ? g.files.map((f) => ({ ...f, abs: g.root + sep + f.path.replace(/\//g, sep), base: g.before })) : [];
    if (fc && fc.files) for (const f of fc.files) out.push({ ...f, abs: f.path, path: shortPath(f.path), base: 'turn:' + b.id });
    return out;
  }
  const turnReverted = (b) => !!((b.meta.git && b.meta.git.reverted) || (b.meta.files && b.meta.files.reverted));
  // One Edit → { s: its new text, all: replace_all, rel: offsets of lines in s that aren't in the old text, added, removed }
  function editSpec(oldS, newS, all) {
    const split = (s) => { const a = String(s || '').split('\n'); if (a.length > 1 && a[a.length - 1] === '') a.pop(); return s ? a : []; };
    const left = new Map();
    for (const l of split(oldS)) left.set(l, (left.get(l) || 0) + 1);
    const rel = [];
    split(newS).forEach((l, i) => { const n = left.get(l) || 0; if (n) left.set(l, n - 1); else rel.push(i); });
    let removed = 0;
    for (const n of left.values()) removed += n;
    return { s: newS || '', all: !!all, rel, added: rel.length, removed };
  }
  // Code/text files Claude changed in this turn (media files get preview cards instead)
  function codeChanges(b) {
    const exact = turnFiles(b);   // from the checkpoints: the highlight is the diff against the turn's start
    if (exact.length) {
      return exact.filter((f) => f.status !== 'D' && !MEDIA_RE.test(f.path)).slice(0, 20)
        .map((f) => ({ raw: f.abs, added: f.added, removed: f.removed, created: f.status === 'A', spec: { base: f.base } }));
    }
    const map = new Map();
    for (const ev of b.events) {
      if (ev.type !== 'tool' || ev.status === 'error' || !['Edit', 'MultiEdit', 'Write', 'NotebookEdit'].includes(ev.name)) continue;
      const i = ev.input || {}, p = i.file_path || i.notebook_path;
      if (!p || MEDIA_RE.test(p)) continue;
      let c = map.get(p);
      if (!c) map.set(p, (c = { raw: p, edits: [], all: false, added: 0, removed: 0, created: false }));
      const specs = ev.name === 'Edit' ? [editSpec(i.old_string, i.new_string, i.replace_all)]
        : ev.name === 'MultiEdit' ? (i.edits || []).map((e) => editSpec(e.old_string, e.new_string, e.replace_all)) : null;
      if (specs) { for (const s of specs) { c.edits.push(s); c.added += s.added; c.removed += s.removed; } }
      else {
        c.all = true;
        c.added = String(i.content || '').split('\n').length;
        if (/created/i.test(ev.result || '')) c.created = true;
      }
    }
    return [...map.values()].slice(0, 20);
  }
  const changeSpec = (c) => c.spec || (c.all ? { all: true } : { edits: c.edits });
  // Other paths (folders included) Claude names in its text: a plain chip each, after the changed-code chips
  function mentionedPaths(b) {
    const out = new Set();
    for (const ev of b.events) if (ev.type === 'text') { for (const p of codeSpanPaths(ev.text)) out.add(p); for (const f of findPaths(ev.text)) out.add(f.raw); }
    return [...out].filter((p) => !MEDIA_RE.test(p)).slice(0, 12);
  }
  function renderArtifacts(el, b) {
    const media = mediaCandidates(b), code = codeChanges(b), turn = turnFiles(b), named = mentionedPaths(b);
    const key = media.join('\n') + '|' + code.map((c) => `${c.raw}+${c.added}-${c.removed}`).join('\n') + '|' + named.join('\n') + '|' + b.status + '|' + turn.length + '|' + turnReverted(b);
    if (el._artKey === key) return;
    el._artKey = key;
    if (!media.length && !code.length && !turn.length && !named.length) { el._arts.textContent = ''; return; }
    // a finished run re-checks from disk: the files may have been written after the first look
    const fresh = b.status !== 'running';
    const stats = (list) => Promise.all(list.map((p) => statPath(p, b.cwd, fresh)));
    Promise.all([stats(code.map((c) => c.raw)), stats(media), stats(named)]).then(([cs, ms, ns]) => {
      if (el._artKey !== key) return;
      const seen = new Set(), chips = h('div', { class: 'art-files' }), cards = h('div', { class: 'art-media' });
      cs.forEach((f, i) => { if (f.exists && !f.dir && !seen.has(f.path)) { seen.add(f.path); chips.append(codeChip(f, code[i])); } });
      for (const f of ms) if (f.exists && !f.dir && !seen.has(f.path)) { seen.add(f.path); cards.append(artifactCard(f)); }
      for (const f of ns) if (f.exists && !seen.has(f.path)) { seen.add(f.path); chips.append(pathChip(f)); }
      el._arts.textContent = '';
      if (chips.childNodes.length) el._arts.append(chips);
      if (cards.childNodes.length) el._arts.append(cards);
      if (turn.length && b.status !== 'running') el._arts.append(turnRow(b, turn));
    });
  }
  // "N files changed in this turn · +a −b · ↺ Revert this turn" (from the turn's checkpoints)
  function turnRow(b, files) {
    const add = files.reduce((s, f) => s + f.added, 0), rem = files.reduce((s, f) => s + f.removed, 0), n = files.length, done = turnReverted(b);
    return h('div', { class: 'art-turn' + (done ? ' reverted' : '') },
      h('span', { class: 'at-ico', html: icon('branch') }),
      h('span', null, `${n} file${n === 1 ? '' : 's'} changed in this turn`),
      h('span', { class: 'ac-add' }, '+' + add), rem ? h('span', { class: 'ac-rem' }, '−' + rem) : null,
      done ? h('span', { class: 'at-done' }, 'Reverted')
        : h('button', { class: 'btn small', title: 'Put every file this turn touched back to how it was before it (files it created are deleted)', onclick: (e) => { e.stopPropagation(); revertTurn(b, files); } }, '↺ Revert this turn'));
  }
  async function revertTurn(b, files) {
    const list = files.slice(0, 15).map((f) => `  ${f.status === 'A' ? 'delete ' : 'restore'}  ${f.path}`).join('\n') + (files.length > 15 ? `\n  …and ${files.length - 15} more` : '');
    if (!confirm(`Revert everything this turn changed?\n\n${list}`)) return;
    const go = (force) => api('POST', `/api/blocks/${b.id}/revert`, { force });
    let r;
    try { r = await go(false); } catch (e) {
      if (e.message !== 'changed after the turn') return toast('Could not revert', e.message, 'err');
      if (!confirm('Some of these files were edited after this turn (by you or a later turn).\nReverting puts them back to how they were BEFORE this turn, so those later edits are lost too.\n\nRevert anyway?')) return;
      try { r = await go(true); } catch (e2) { return toast('Could not revert', e2.message, 'err'); }
    }
    statCache.clear();
    if (r.failed && r.failed.length) toast('Reverted with errors', r.failed.join('\n'), 'warn');
    else toast('Turn reverted', `${r.files} file${r.files === 1 ? '' : 's'} restored`, 'ok');
  }
  function codeChip(f, c) {
    const name = base(f.path), folder = shortPath(f.path.slice(0, Math.max(0, f.path.length - name.length - 1)));
    const go = () => Files.open(f.path, null, changeSpec(c));
    return h('div', { class: 'art-chip', role: 'button', tabindex: '0', title: `${f.path}\nClick to see the changed lines`,
      onclick: (e) => { e.stopPropagation(); go(); }, onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); go(); } } },
    h('span', { class: 'ac-ico', html: icon('file') }),
    // the rtl box (ellipsis at the start) would move ~ and \ to the other end: LRMs keep the path in order
    h('span', { class: 'ac-text' }, h('span', { class: 'ac-name' }, name), h('span', { class: 'ac-dir' }, '‎' + folder + '‎')),
    c.created ? h('span', { class: 'ac-new' }, 'new') : null,
    h('span', { class: 'ac-add' }, '+' + c.added),
    c.removed ? h('span', { class: 'ac-rem' }, '−' + c.removed) : null);
  }
  function pathChip(f) {
    const name = base(f.path), folder = shortPath(f.path.slice(0, Math.max(0, f.path.length - name.length - 1)));
    const go = () => Files.open(f.path);
    return h('div', { class: 'art-chip', role: 'button', tabindex: '0', title: `${f.path}\nClick to open in the viewer`,
      onclick: (e) => { e.stopPropagation(); go(); }, onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); go(); } } },
    h('span', { class: 'ac-ico', html: icon(f.dir ? 'folder' : 'file') }),
    h('span', { class: 'ac-text' }, h('span', { class: 'ac-name' }, name), folder ? h('span', { class: 'ac-dir' }, '‎' + folder + '‎') : null));
  }
  function artifactCard(f) {
    const url = `/api/fs/raw?path=${encodeURIComponent(f.path)}&token=${TOKEN}&v=${Math.round(f.mtime || 0)}`;
    const pdfView = '#toolbar=0&navpanes=0&scrollbar=0&view=FitH';
    const ext = (f.path.match(/\.(\w+)$/) || [, ''])[1];
    let thumb;
    if (f.kind === 'image') thumb = h('img', { src: url, loading: 'lazy', alt: '' });
    else if (f.kind === 'pdf') thumb = h('iframe', { src: url + pdfView, loading: 'lazy', tabindex: '-1' });
    else if (f.kind === 'office' && S.info.hasOffice) thumb = h('iframe', { src: url + '&as=pdf' + pdfView, loading: 'lazy', tabindex: '-1' });
    else if (f.kind === 'video') thumb = h('video', { src: url, muted: true, preload: 'metadata' });
    else thumb = h('div', { class: 'art-ico', html: icon('file') }, h('span', null, ext));
    return h('div', { class: 'art-card', role: 'button', tabindex: '0', title: f.path,
      onclick: (e) => { e.stopPropagation(); Files.open(f.path); },
      onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); Files.open(f.path); } } },
    h('div', { class: 'art-thumb k-' + f.kind }, thumb),
    h('div', { class: 'art-meta' }, h('span', { class: 'art-name' }, base(f.path)), h('span', { class: 'art-size' }, fmtSize(f.size || 0))));
  }

  // Agent text: wrap paths in clickable links; ones that turn out not to exist go back to plain text.
  function linkifyPaths(root, cwd) {
    for (const code of root.querySelectorAll('code')) {
      if (code.closest('pre, a')) continue;
      const label = code.textContent, raw = trimPath(label.trim());
      if (!looksLikePath(raw)) continue;
      const a = h('a', { class: 'file-link', href: '#', title: 'Open in viewer', onclick: (e) => { e.preventDefault(); e.stopPropagation(); Files.open(raw, cwd); } }, label);
      code.textContent = '';
      code.append(a);
      statPath(raw, cwd).then((r) => { if (!r.exists) a.replaceWith(label); });
    }
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.parentElement.closest('pre, a') ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
    const nodes = [];
    for (let n = walker.nextNode(); n; n = walker.nextNode()) nodes.push(n);
    for (const n of nodes) {
      const found = findPaths(n.data);
      if (!found.length) continue;
      const frag = document.createDocumentFragment();
      let last = 0;
      for (const { raw, index } of found) {
        frag.append(n.data.slice(last, index));
        const a = h('a', { class: 'file-link', href: '#', title: 'Open in viewer', onclick: (e) => { e.preventDefault(); e.stopPropagation(); Files.open(raw, cwd); } }, raw);
        frag.append(a);
        last = index + raw.length;
        statPath(raw, cwd).then((r) => { if (!r.exists) a.replaceWith(raw); });
      }
      frag.append(n.data.slice(last));
      n.replaceWith(frag);
    }
    return root;
  }

  // Keys Hangar keeps for itself even while the terminal has focus. Everything else goes to the shell.
  function isAppKey(e) {
    const k = e.key.toLowerCase(), ctrl = e.ctrlKey || e.metaKey;
    if (e.altKey && !ctrl) return k === 't' || k === 'w' || k === 'v' || /^[1-9]$/.test(k) || k === 'arrowup' || k === 'arrowdown';
    if (ctrl && !e.altKey) {
      if (k === ',' || k === 'tab' || k === 'pageup' || k === 'pagedown') return true;
      if (!e.shiftKey && (k === 'b' || k === 'i' || k === 'arrowup' || k === 'arrowdown')) return true;
      if (e.shiftKey && (k === 'f' || k === 'e')) return true;
    }
    return false;
  }

  // ================================================================ images → terminal / agent input
  // Pasted or dropped images are saved to data/pastes and their path is pasted instead: Claude Code turns an image
  // path into an attachment ([Image #1]), and any other program just gets the path.
  const IMG_EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/bmp': 'bmp', 'image/avif': 'avif' };
  function imagesIn(dt, isPaste) {   // the images of a paste / drop; null when it has text (text wins) or no image
    if (!dt) return null;
    if (isPaste && (dt.getData('text/plain') || '').trim()) return null;
    const files = [...(dt.files || [])].filter((f) => IMG_EXT[f.type]);
    if (!files.length) for (const it of dt.items || []) if (it.kind === 'file' && IMG_EXT[it.type]) { const f = it.getAsFile(); if (f) files.push(f); }
    return files.length ? files : null;
  }
  async function clipboardImages() {   // right-click / menu paste: navigator.clipboard.read() sees images too
    if (!navigator.clipboard || !navigator.clipboard.read) return null;
    const items = await navigator.clipboard.read();
    if (items.some((it) => it.types.includes('text/plain'))) return null;
    const out = [];
    for (const it of items) { const ty = it.types.find((x) => IMG_EXT[x]); if (ty) out.push(await it.getType(ty)); }
    return out.length ? out : null;
  }
  async function savePaste(blob) {
    const r = await fetch(`/api/paste?ext=${IMG_EXT[blob.type] || 'png'}`, { method: 'POST', headers: { 'x-hangar-token': TOKEN, 'content-type': 'application/octet-stream' }, body: blob });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401) location.reload();
    if (!r.ok) throw new Error(j.error || r.statusText);
    return /\s/.test(j.path) ? `"${j.path}"` : j.path;
  }
  async function imagePaths(files) {
    try { return (await Promise.all(files.map(savePaste))).join(' ') + ' '; }
    catch (e) { toast('Image not pasted', e.message, 'err'); return null; }
  }

  // ================================================================ files → terminal / agent input
  // Dropping files or folders from Explorer pastes their paths, like Windows Terminal. The browser only gets their
  // bytes, so the server finds where they are (/api/drop/locate); what it can't find (a file dragged out of a web
  // page, say) is copied to data/pastes and that copy's path is pasted. Rows dragged from Files carry their path.
  const PATH_TYPE = 'application/x-hangar-path';
  const canDropPaths = (dt) => dt.types.includes('Files') || dt.types.includes(PATH_TYPE);
  function quotePath(p, shell) {
    if (shell === 'bash') { p = p.replace(/\\/g, '/'); return /[^\w@%+=:,./-]/.test(p) ? `'${p.replace(/'/g, "'\\''")}'` : p; }
    if (!/[\s&()[\]{}^=;!'+,`~$@#|<>]/.test(p)) return p;
    return shell !== 'cmd' && /[$`]/.test(p) ? `'${p.replace(/'/g, "''")}'` : `"${p}"`;   // PowerShell expands $ inside "…"
  }
  async function sendFile(target, rel, file) {
    const r = await fetch(`/api/fs/upload?dir=${encodeURIComponent(target)}&rel=${encodeURIComponent(rel)}`, { method: 'POST', headers: { 'x-hangar-token': TOKEN, 'content-type': 'application/octet-stream' }, body: file });
    const j = await r.json().catch(() => ({}));
    if (r.status === 401) location.reload();
    if (!r.ok) throw new Error(j.error || r.statusText);
    return j;
  }
  // a dropped folder → its files ({ rel, file }) and folders (rel), through the File System entries API
  async function walkEntry(entry, rel, files, dirs) {
    if (entry.isFile) { try { files.push({ rel, file: await new Promise((ok, bad) => entry.file(ok, bad)) }); } catch { /* unreadable */ } return; }
    dirs.push(rel);
    const reader = entry.createReader();
    for (;;) {
      const batch = await new Promise((ok) => reader.readEntries(ok, () => ok([])));
      if (!batch.length) break;
      for (const c of batch) await walkEntry(c, rel + '/' + c.name, files, dirs);
    }
  }
  // what a drop carries, taken during the event (entries can be read afterwards)
  function dropItems(dt) {
    const own = dt.getData(PATH_TYPE);
    if (own) return { own: own.split('\n').filter(Boolean) };
    return { items: [...dt.items].filter((i) => i.kind === 'file').map((i) => ({ entry: i.webkitGetAsEntry(), file: i.getAsFile() })).filter((i) => i.entry || i.file) };
  }
  async function droppedPaths(drop, tab) {   // → the text to paste ("a b " with a trailing space), or null
    const shell = tab && tab.term && tab.term.shell;
    const out = (paths) => (paths.length ? paths.map((p) => quotePath(p, shell)).join(' ') + ' ' : null);
    if (drop.own) return out(drop.own);
    const items = drop.items;
    if (!items.length) return null;
    try {
      const meta = items.map(({ entry, file }) => ({ name: (entry || file).name, dir: !!(entry && entry.isDirectory), size: file ? file.size : 0, mtime: file ? file.lastModified : 0 }));
      const { paths, copyDir } = await api('POST', '/api/drop/locate', { items: meta, cwd: tab && tab.cwd });
      const missing = items.map((it, i) => (paths[i] ? null : i)).filter((i) => i !== null);
      if (missing.length) {
        const files = [], dirs = [], failed = [], sep = copyDir.includes('\\') ? '\\' : '/';
        for (const i of missing) {
          const { entry, file } = items[i];
          if (entry && entry.isDirectory) { await walkEntry(entry, entry.name, files, dirs); paths[i] = copyDir + sep + entry.name; }
          else files.push({ rel: (entry || file).name, file: file || await new Promise((ok, bad) => entry.file(ok, bad)).catch(() => null), i });
        }
        if (files.length > 5) toast('Copying…', `${files.length} files to ${shortPath(copyDir)}`);
        for (const f of files) {
          try {
            if (!f.file) throw new Error('unreadable');
            const r = await sendFile(copyDir, f.rel, f.file);
            if (f.i !== undefined) paths[f.i] = r.path;   // the name can repeat (two notes.txt): the upload picks "notes (2).txt"
          } catch (err) { failed.push(`${f.rel}: ${err.message}`); }
        }
        for (const d of dirs) if (!files.some((f) => f.rel.startsWith(d + '/'))) await api('POST', '/api/fs/mkdir', { dir: copyDir, name: d, exact: true }).catch(() => {});
        if (failed.length) toast('Some files could not be copied', failed.slice(0, 5).join('\n'), 'warn');
      }
      return out(paths.filter(Boolean));
    } catch (e) { toast('Files not dropped', e.message, 'err'); return null; }
  }

  class TabTerm {
    constructor(tab) {
      this.id = tab.id;
      this.el = h('div', { class: 'term-host', dataset: { id: tab.id } });
      $('#terms').append(this.el);
      this.term = new window.Terminal(termOptions());
      this.fit = new window.FitAddon.FitAddon();
      this.search = new window.SearchAddon.SearchAddon();
      this.term.loadAddon(this.fit);
      this.term.loadAddon(this.search);
      this.term.loadAddon(new window.WebLinksAddon.WebLinksAddon((ev, uri) => { if (ev.ctrlKey || ev.metaKey) window.open(uri, '_blank'); else toast('Ctrl+click to open', uri); }));
      const uni = new window.Unicode11Addon.Unicode11Addon();
      this.term.loadAddon(uni);
      this.term.unicode.activeVersion = '11';
      this.term.open(this.el);
      this.linkFiles();
      this.webgl = null;
      this.visible = false;
      this.blocks = []; this.cur = null; this.pending = ''; this.promptMarker = null; this.replaying = false;
      this.term.parser.registerOscHandler(633, (d) => { this.mark(d); return true; });
      this.term.onData((d) => wsSend({ t: 'in', tab: this.id, d }));
      this.term.onBinary((d) => wsSend({ t: 'in', tab: this.id, d }));
      this.term.onResize(({ cols, rows }) => wsSend({ t: 'resize', tab: this.id, cols, rows }));
      this.term.onSelectionChange(() => { if (st.terminal.copyOnSelect && this.term.hasSelection()) navigator.clipboard.writeText(this.term.getSelection()).catch(() => {}); });
      this.term.attachCustomKeyEventHandler((e) => this.key(e));
      this.el.addEventListener('contextmenu', (e) => this.rightClick(e));
      // images: capture phase, so xterm (text only) never sees an image paste
      this.el.addEventListener('paste', (e) => { const imgs = imagesIn(e.clipboardData, true); if (!imgs) return; e.preventDefault(); e.stopPropagation(); this.pasteImages(imgs); }, true);
      // files and folders: their paths are pasted (an image's path is what `claude` attaches)
      this.el.addEventListener('dragover', (e) => { if (canDropPaths(e.dataTransfer)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; this.el.classList.add('drop'); } });
      this.el.addEventListener('dragleave', (e) => { if (!this.el.contains(e.relatedTarget)) this.el.classList.remove('drop'); });
      this.el.addEventListener('drop', async (e) => {
        this.el.classList.remove('drop');
        if (!canDropPaths(e.dataTransfer)) return;
        e.preventDefault();
        const p = await droppedPaths(dropItems(e.dataTransfer), findTab(this.id));
        if (p) { this.term.paste(p); this.term.focus(); }
      });
      this.search.onDidChangeResults((r) => { if (this.visible) $('#search-count').textContent = r.resultCount ? `${r.resultIndex + 1}/${r.resultCount}` : 'no results'; });
      this.attach();
    }
    attach() { if (wsReady) wsSend({ t: 'attach', tab: this.id, cols: this.term.cols, rows: this.term.rows }); }
    // File paths printed in the terminal (e.g. by `claude`) become links: one click opens them in the file viewer.
    linkFiles() {
      const term = this.term, cell = term.buffer.active.getNullCell();
      term.registerLinkProvider({
        provideLinks: (y, cb) => {
          const buf = term.buffer.active, row = y - 1;
          let a = row, b = row;
          while (a > 0 && row - a < 10 && buf.getLine(a)?.isWrapped) a--;
          while (b - row < 10 && buf.getLine(b + 1)?.isWrapped) b++;
          let text = '';
          const pos = [];   // string index -> [col, row, width]
          for (let r = a; r <= b; r++) {
            const line = buf.getLine(r);
            if (!line) break;
            for (let x = 0; x < term.cols; x++) {
              if (!line.getCell(x, cell) || !cell.getWidth()) continue;
              const ch = cell.getChars() || ' ';
              for (let k = 0; k < ch.length; k++) { text += ch[k]; pos.push([x, r, cell.getWidth()]); }
            }
          }
          const found = findPaths(text).filter(({ raw, index }) => {
            const s = pos[index], e = pos[index + raw.length - 1];
            return s && e && s[1] <= row && e[1] >= row;
          });
          if (!found.length) return cb(undefined);
          const cwd = (findTab(this.id) || {}).cwd;
          Promise.all(found.map((f) => statPath(f.raw, cwd))).then((res) => {
            const links = [];
            found.forEach((f, i) => {
              if (!res[i].exists) return;
              const s = pos[f.index], e = pos[f.index + f.raw.length - 1];
              links.push({
                text: f.raw, range: { start: { x: s[0] + 1, y: s[1] + 1 }, end: { x: e[0] + e[2], y: e[1] + 1 } },
                decorations: { pointerCursor: true, underline: true },
                activate: () => Files.open(res[i].path),
              });
            });
            cb(links.length ? links : undefined);
          });
        },
      });
    }
    replay(d) {
      for (const c of this.blocks) if (c.deco) c.deco.dispose();
      this.blocks = []; this.cur = null; this.pending = '';
      this.term.reset();
      this.replaying = true;
      this.term.write(d, () => { this.replaying = false; this.term.scrollToBottom(); });
    }
    show() {
      this.el.classList.add('on');
      this.visible = true;
      this.gpu();
      requestAnimationFrame(() => { this.fitNow(); if ($('#settings').hidden && document.activeElement !== $('#search-input')) this.term.focus(); });
    }
    hide() { this.el.classList.remove('on'); this.visible = false; this.dropGpu(); }
    // Only the visible terminal holds a WebGL context (browsers cap them at ~16).
    gpu() {
      if (!st.render.gpu) { this.dropGpu(); return; }
      if (!this.visible || this.webgl || !window.WebglAddon) return;
      try {
        const w = new window.WebglAddon.WebglAddon();
        w.onContextLoss(() => { this.dropGpu(); setTimeout(() => this.gpu(), 500); });
        this.term.loadAddon(w);
        this.webgl = w;
      } catch (e) {
        this.webgl = null;
        if (!Terms.gpuWarned) { Terms.gpuWarned = true; toast('GPU renderer unavailable', 'Falling back to CPU rendering: ' + e.message, 'warn'); }
      }
    }
    dropGpu() { if (this.webgl) { try { this.webgl.dispose(); } catch { /* already gone */ } this.webgl = null; } }
    fitNow() { if (this.visible && this.el.clientWidth > 0) { try { this.fit.fit(); } catch { /* not ready */ } } }
    applyOptions(remeasure) {
      const o = termOptions(), term = this.term;
      const transparencyChanged = term.options.allowTransparency !== o.allowTransparency;
      if (transparencyChanged) this.dropGpu();
      for (const [k, v] of Object.entries(o)) if (k !== 'allowProposedApi' && k !== 'windowsPty') term.options[k] = v;
      if (remeasure) { const f = term.options.fontFamily; term.options.fontFamily = 'monospace'; term.options.fontFamily = f; }
      if (transparencyChanged || !st.render.gpu) this.gpu();
      if (st.render.gpu && this.visible && !this.webgl) this.gpu();
      for (const c of this.blocks) this.decorate(c, true);
      this.fitNow();
    }
    key(e) {
      if (e.type !== 'keydown') return true;
      const k = e.key.toLowerCase(), ctrl = e.ctrlKey || e.metaKey;
      // copy / paste like Windows Terminal; Ctrl+C without a selection still interrupts
      if (ctrl && !e.altKey && k === 'c' && (e.shiftKey || this.term.hasSelection())) {
        if (this.term.hasSelection()) { copy(this.term.getSelection()); this.term.clearSelection(); }
        return false;
      }
      if (ctrl && !e.altKey && k === 'v') return false;   // the browser fires a paste event; xterm sends it (bracketed)
      if (isAppKey(e)) return false;
      return true;
    }
    async pasteImages(files) { const p = await imagePaths(files); if (p) { this.term.paste(p); this.term.focus(); } }
    async pasteClipboard() {
      try { const imgs = await clipboardImages(); if (imgs) return this.pasteImages(imgs); } catch { /* read() blocked: try text */ }
      try { this.term.paste(await navigator.clipboard.readText()); } catch { toast('Clipboard blocked', 'Allow clipboard access for Hangar, or use Ctrl+V.', 'warn'); }
    }
    async rightClick(e) {
      e.preventDefault();
      if (e.target.closest('.blk')) return;
      if (st.terminal.rightClick === 'paste') {
        if (this.term.hasSelection()) { copy(this.term.getSelection()); this.term.clearSelection(); return; }
        return this.pasteClipboard();
      }
      showMenu(e.clientX, e.clientY, [
        { label: 'Copy', hint: 'Ctrl+C', run: () => { if (this.term.hasSelection()) copy(this.term.getSelection()); } },
        { label: 'Paste', hint: 'Ctrl+V', run: () => this.pasteClipboard() },
        { label: 'Select all', run: () => this.term.selectAll() },
        { label: 'Find…', hint: 'Ctrl+Shift+F', run: () => openSearch() },
        { sep: true },
        { label: 'Clear scrollback', run: () => Terms.clear(this.id) },
        { label: 'Restart shell', run: () => wsSend({ t: 'restart', tab: this.id }) },
      ]);
    }
    // Shell integration marks → blocks (prompt line … last output line), drawn as a bar in the gutter.
    mark(data) {
      const i = data.indexOf(';');
      const kind = i < 0 ? data : data.slice(0, i), arg = i < 0 ? '' : data.slice(i + 1);
      if (kind === 'A') this.promptMarker = this.term.registerMarker(0);
      else if (kind === 'E') this.pending = unesc633(arg);
      else if (kind === 'C') {
        const cmd = this.pending.trim();
        this.pending = '';
        this.cur = cmd ? { command: cmd, start: Date.now(), replayed: this.replaying, prompt: this.promptMarker, out: this.term.registerMarker(0) } : null;
      } else if (kind === 'D') {
        const c = this.cur;
        this.cur = null;
        if (!c || !c.out) return;
        c.end = Date.now();
        c.exitCode = arg === '' ? null : Number(arg);
        c.endMarker = this.term.registerMarker(0);
        this.blocks.push(c);
        this.decorate(c);
        if (this.blocks.length > 2000) { const old = this.blocks.shift(); if (old.deco) old.deco.dispose(); }
      }
    }
    startLine(c) { return c.prompt && !c.prompt.isDisposed && c.prompt.line <= c.out.line ? c.prompt.line : c.out.line; }
    decorate(c, redo) {
      if (redo && c.deco) { c.deco.dispose(); c.deco = null; }
      if (!st.terminal.blockGutter || !c.endMarker || c.out.isDisposed || c.endMarker.isDisposed) return;
      const startMarker = c.prompt && !c.prompt.isDisposed && c.prompt.line <= c.out.line ? c.prompt : c.out;
      const height = Math.max(1, c.endMarker.line - startMarker.line);
      const kind = c.exitCode === 0 ? 'ok' : c.exitCode == null ? 'unk' : 'err';
      const color = kind === 'ok' ? st.theme.success : kind === 'err' ? st.theme.error : st.theme.muted;
      const deco = this.term.registerDecoration({ marker: startMarker, x: 0, width: 1, height, layer: 'top', overviewRulerOptions: { color, position: 'left' } });
      if (!deco) return;
      c.deco = deco;
      deco.onRender((el) => {
        if (el._hangar) return;
        el._hangar = true;
        el.classList.add('blk', kind);
        if (c.bookmarked) el.classList.add('bookmarked');
        el.title = `${c.command}\n${c.exitCode == null ? '' : 'exit ' + c.exitCode}${c.replayed ? '' : ' · ' + fmtDur(c.end - c.start)}\nClick for actions`;
        el.addEventListener('mousedown', (ev) => { ev.stopPropagation(); ev.preventDefault(); });
        el.addEventListener('click', (ev) => { ev.stopPropagation(); this.blockMenu(c, ev.clientX, ev.clientY); });
      });
    }
    blockText(c) {
      const b = this.term.buffer.active, to = (c.endMarker.isDisposed ? b.length : c.endMarker.line) - 1, lines = [];
      for (let y = c.out.line; y <= to; y++) {
        const l = b.getLine(y);
        if (!l) break;
        const s = l.translateToString(true);
        if (l.isWrapped && lines.length) lines[lines.length - 1] += s; else lines.push(s);
      }
      return lines.join('\n').replace(/\s+$/, '');
    }
    selectBlock(c) {
      if (c.out.isDisposed) return;
      const a = this.startLine(c), z = Math.max(a, (c.endMarker.isDisposed ? this.term.buffer.active.length : c.endMarker.line) - 1);
      this.term.selectLines(a, z);
    }
    blockMenu(c, x, y) {
      this.selectBlock(c);
      showMenu(x, y, [
        { label: 'Copy output', run: () => copy(this.blockText(c), 'Output copied') },
        { label: 'Copy command', run: () => copy(c.command, 'Command copied') },
        { label: 'Copy as Markdown', run: () => copy('```\n> ' + c.command + '\n' + this.blockText(c) + '\n```', 'Block copied') },
        { label: 'Run again', run: () => { if (termOf(findTab(this.id) || {}).running) return toast('Busy', 'Something is running in this tab.', 'warn'); wsSend({ t: 'in', tab: this.id, d: c.command + '\r' }); this.term.focus(); } },
        { label: c.bookmarked ? 'Remove bookmark' : 'Bookmark', run: () => { c.bookmarked = !c.bookmarked; this.decorate(c, true); } },
        { sep: true },
        { label: `${c.exitCode === 0 ? '✓' : c.exitCode == null ? '·' : '✗ ' + c.exitCode}  ${c.replayed ? 'restored' : fmtDur(c.end - c.start) + ' · ' + fmtTime(c.start)}`, run: () => {} },
      ]);
    }
    // Ctrl+↑/↓: jump between commands, like Warp's block navigation
    jump(dir) {
      const vp = this.term.buffer.active.viewportY;
      const list = this.blocks.filter((c) => !c.out.isDisposed);
      if (!list.length) return;
      const lines = list.map((c) => this.startLine(c));
      let target = null;
      if (dir < 0) { for (let i = lines.length - 1; i >= 0; i--) if (lines[i] < vp) { target = list[i]; break; } }
      else { for (let i = 0; i < lines.length; i++) if (lines[i] > vp) { target = list[i]; break; } }
      if (!target) { if (dir > 0) this.term.scrollToBottom(); return; }
      this.term.scrollToLine(this.startLine(target));
      this.selectBlock(target);
    }
    dispose() { this.dropGpu(); this.term.dispose(); this.el.remove(); }
  }

  const Terms = {
    map: new Map(), gpuWarned: false,
    get: (id) => Terms.map.get(id),
    all: () => [...Terms.map.values()],
    ensure(tab) { let tt = Terms.map.get(tab.id); if (!tt) { tt = new TabTerm(tab); Terms.map.set(tab.id, tt); } return tt; },
    show(tab) { const tt = Terms.ensure(tab); for (const o of Terms.map.values()) if (o !== tt && o.visible) o.hide(); if (!tt.visible) tt.show(); else tt.fitNow(); return tt; },
    hideAll() { for (const o of Terms.map.values()) if (o.visible) o.hide(); },
    active() { const t = activeTab(); return t && t.mode !== 'agent' ? Terms.map.get(t.id) : null; },
    fitActive() { const tt = Terms.active(); if (tt) tt.fitNow(); },
    applyAll(remeasure) { for (const tt of Terms.map.values()) tt.applyOptions(remeasure); },
    remove(id) { const tt = Terms.map.get(id); if (tt) { tt.dispose(); Terms.map.delete(id); } },
    clear(id) { const tt = Terms.map.get(id); if (tt) { tt.term.clear(); tt.blocks = tt.blocks.filter((c) => !c.out.isDisposed); } wsSend({ t: 'clear', tab: id }); },
  };
  let fitQueued = false;
  new ResizeObserver(() => { if (!fitQueued) { fitQueued = true; requestAnimationFrame(() => { fitQueued = false; Terms.fitActive(); }); } }).observe($('#terms'));

  // find bar (xterm search addon)
  const sOpts = { regex: false, caseSensitive: false };
  function searchDeco() {
    return { matchBackground: withAlpha(st.theme.warning, 0.35), activeMatchBackground: withAlpha(st.theme.accent, 0.7), matchOverviewRuler: st.theme.warning, activeMatchColorOverviewRuler: st.theme.accent };
  }
  function runSearch(dir) {
    const tt = Terms.active(), q = $('#search-input').value;
    if (!tt) return;
    if (!q) { tt.search.clearDecorations(); $('#search-count').textContent = ''; return; }
    const o = { ...sOpts, decorations: searchDeco(), incremental: dir === 0 };
    if (dir < 0) tt.search.findPrevious(q, o); else tt.search.findNext(q, o);
  }
  function openSearch() {
    const t = activeTab();
    if (t.mode === 'agent') return;
    const bar = $('#search-bar'), inp = $('#search-input');
    bar.hidden = false;
    const tt = Terms.active();
    if (tt && tt.term.hasSelection() && !tt.term.getSelection().includes('\n')) inp.value = tt.term.getSelection();
    inp.focus(); inp.select();
    if (inp.value) runSearch(0);
  }
  function closeSearch() { $('#search-bar').hidden = true; const tt = Terms.active(); if (tt) { tt.search.clearDecorations(); tt.term.focus(); } }
  $('#search-input').addEventListener('input', () => runSearch(0));
  $('#search-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); runSearch(e.shiftKey ? -1 : 1); }
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeSearch(); }
  });
  for (const [id, key] of [['#search-case', 'caseSensitive'], ['#search-regex', 'regex']]) {
    $(id).addEventListener('click', () => { sOpts[key] = !sOpts[key]; $(id).classList.toggle('on', sOpts[key]); runSearch(0); $('#search-input').focus(); });
  }
  $('#search-prev').innerHTML = icon('up'); $('#search-next').innerHTML = icon('down'); $('#search-close').innerHTML = icon('x');
  $('#search-prev').addEventListener('click', () => runSearch(-1));
  $('#search-next').addEventListener('click', () => runSearch(1));
  $('#search-close').addEventListener('click', closeSearch);
  $('#find-btn').innerHTML = icon('search');
  $('#find-btn').addEventListener('click', openSearch);

  // ================================================================ pane
  function chipEl(iconName, text, opts = {}) {
    const tag = opts.onclick ? 'button' : 'span';
    return h(tag, { class: 'chip' + (opts.cls ? ' ' + opts.cls : ''), title: opts.title || text, onclick: opts.onclick, html: (iconName ? icon(iconName) : '') + (opts.html || esc(text)) });
  }
  function renderPaneHead(t) {
    $('#pane-title').textContent = tabTitle(t);
    const meta = $('#pane-meta');
    meta.textContent = '';
    meta.append(chipEl('folder', shortPath(t.cwd), { title: t.cwd + ' — click to copy', onclick: () => copy(t.cwd, 'Path copied') }));
    if (t.git && t.git.branch) meta.append(chipEl('branch', t.git.branch, { title: `${t.git.branch} — click for changes and commit`, onclick: () => Files.openGit(t.cwd) }));
    if (t.git && (t.git.added || t.git.removed)) meta.append(chipEl(null, '', { html: `<span class="diff">${diffHtml(t.git)}</span>`, title: `${t.git.files} files changed` }));
    const T = termOf(t);
    if (t.mode !== 'agent' && T.running && !T.cliAgent) meta.append(chipEl('clock', oneLine(T.running.command).slice(0, 40), { title: 'Running since ' + fmtTime(T.running.start), cls: 'accent' }));
    for (const b of $$('#mode-seg button')) b.classList.toggle('on', b.dataset.mode === (t.mode === 'agent' ? 'agent' : 'terminal'));
    $('#find-btn').hidden = t.mode === 'agent';
  }

  function renderPane(scroll = true) {
    const t = activeTab();
    if (!t) return;
    const agent = t.mode === 'agent';
    document.body.classList.toggle('agent-mode', agent);
    renderPaneHead(t); renderToolbar(t); renderCliToolbar(t); updateModeUI(t);
    if (!agent) {
      $('#blocks').textContent = '';
      blockEls.clear();
      Terms.show(t);
      return;
    }
    Terms.hideAll();
    $('#search-bar').hidden = true;
    const box = $('#blocks');
    const prevScroll = box.scrollTop;
    box.textContent = '';
    blockEls.clear();
    box.append(h('div', { class: 'spacer' }));
    if (!t.blocks.length) box.append(emptyState(t));
    const list = st.blocks.flow === 'top' ? [...t.blocks].reverse() : t.blocks;
    for (const b of list) box.append(blockEl(b));
    if (scroll) { ui.stick = true; scrollToEnd(true); } else box.scrollTop = prevScroll;
    requestAnimationFrame(autoGrow);   // it was hidden (0 px tall) while the terminal showed
    if ($('#settings').hidden) input.focus();
  }

  function emptyState(t) {
    const k = (keys, what) => [h('span', null, ...keys.map((x) => h('kbd', null, x))), h('span', null, what)];
    return h('div', { class: 'empty-state' },
      h('h3', null, 'Ask Claude Code anything'),
      h('div', null, `Prompts run headless in ${shortPath(t.cwd)} (your shell's current folder). The conversation continues across prompts in this tab; tool calls and context show up as blocks. Type / for Claude Code commands and skills.`),
      h('div', { class: 'keys' },
        k(['Enter'], 'Send prompt'), k(['/'], 'Commands & skills'), k(['Ctrl', 'I'], 'Back to the terminal'), k(['↑'], 'Previous prompts'),
        k(['Ctrl', 'C'], 'Stop Claude'), k(['Ctrl', ','], 'Customize everything')));
  }

  function scrollToEnd(force) {
    const box = $('#blocks');
    if (st.blocks.flow === 'top') { if (force) box.scrollTop = 0; return; }
    if (force || ui.stick) box.scrollTop = box.scrollHeight;
  }

  // ================================================================ agent blocks (incremental: unchanged events keep their DOM)
  function blockEl(b) {
    const el = h('div', { dataset: { id: b.id } });
    el.addEventListener('click', (e) => {
      if (e.target.closest('button, input, a, summary, select, textarea') || String(getSelection())) return;
      selectBlock(b.id === ui.selected ? null : b.id);
    });
    fillBlock(el, b);
    blockEls.set(b.id, el);
    return el;
  }
  function fillBlock(el, b) {
    el.className = `block ${b.kind} ${b.status} has-out` + (ui.selected === b.id ? ' selected' : '') + (b.bookmarked ? ' bookmarked' : '') + (b.collapsed ? ' collapsed-out' : '');
    if (!el._body) {
      el.textContent = '';
      el._head = h('div');
      el._body = h('div', { class: 'agent-body' });
      el._tail = h('div', { class: 'agent-tail' });
      el._foot = h('div');
      el._arts = h('div', { class: 'artifacts' });
      el._nodes = [];
      el._body.append(el._tail);
      el.append(el._head, el._body, el._arts, el._foot);
    }
    const head = blockHead(b);
    el._head.replaceWith(head); el._head = head;
    b.events.forEach((ev, i) => {
      const sig = evSig(ev);
      const cached = el._nodes[i];
      if (cached && cached.sig === sig) return;
      const node = eventNode(b, ev, i) || h('span');
      if (cached) cached.node.replaceWith(node); else el._body.insertBefore(node, el._tail);
      el._nodes[i] = { sig, node };
    });
    el._tail.textContent = '';
    if (b.status === 'running') el._tail.append(h('div', { class: 'working', html: `<span class="ind agent"></span><span class="shimmer">${esc(workingLabel(b))}</span>` }));
    if (b.stderr && b.status !== 'running' && (b.status !== 'done' || !b.events.length)) el._tail.append(h('div', { class: 'stderr' }, b.stderr.trim()));
    if (!b.events.length && b.status !== 'running' && !b.stderr) el._tail.append(h('div', { class: 'ev-notice' }, 'Claude Code returned nothing. Is it installed and logged in? (run `claude` in the terminal)'));
    renderArtifacts(el, b);
    const foot = agentFoot(b) || h('div');
    el._foot.replaceWith(foot); el._foot = foot;
    el.querySelector(':scope > .running-bar')?.remove();
    if (b.status === 'running') el.append(h('div', { class: 'running-bar' }));
  }
  const evSig = (ev) => `${ev.type}|${(ev.text || '').length}|${ev.status || ''}|${ev.result == null ? -1 : ev.result.length}|${st.agent.thinking}|${st.agent.toolStyle}`;

  function exitBadge(b) {
    const style = st.blocks.exitBadge;
    if (b.status === 'running') return h('span', { class: 'exit run' }, style === 'icon' ? '●' : 'running');
    const ok = b.status === 'done';
    const sym = ok ? '✓' : b.status === 'killed' ? '■' : b.status === 'interrupted' ? '⚠' : '✗';
    const text = style === 'icon' ? sym : style === 'border' ? (ok ? '' : b.status) : `${sym} ${b.status}`;
    return text ? h('span', { class: 'exit ' + (ok ? 'ok' : 'bad'), title: b.status }, text) : null;
  }
  function blockHead(b) {
    const meta = h('div', { class: 'block-meta' });
    if (b.cwd) meta.append(h('span', { class: 'm-cwd', title: b.cwd, html: icon('folder') + esc(shortPath(b.cwd)) }));
    if (b.branch) meta.append(h('span', { class: 'm-branch', html: icon('branch') + esc(b.branch) }));
    meta.append(h('span', { class: 'm-time', title: new Date(b.start).toLocaleString() }, fmtTime(b.start)));
    meta.append(h('span', { class: 'm-dur' + (b.end ? '' : ' live'), dataset: { start: b.start }, html: icon('clock') + fmtDur((b.end || Date.now()) - b.start) }));
    if (b.meta && b.meta.model) meta.append(h('span', { html: icon('chip') + esc(b.meta.model) }));
    const badge = exitBadge(b);
    if (badge) meta.append(badge);
    const cmd = h('div', { class: 'block-cmd' }, h('span', { class: 'sym' }, st.input.agentSymbol), h('span', { class: 'ctext' }, b.prompt));
    const btn = (ico, title, fn, on) => h('button', { class: 'icon-btn' + (on ? ' on' : ''), title, html: icon(ico), onclick: (e) => { e.stopPropagation(); fn(); } });
    const acts = h('div', { class: 'block-actions' },
      b.status === 'running' ? btn('stop', 'Stop (Ctrl+C)', () => killBlock(b)) : null,
      btn('copy', 'Copy prompt', () => copy(b.prompt, 'Copied')),
      btn('file', 'Copy answer', () => copy(b.events.filter((e) => e.type === 'text').map((e) => e.text).join('\n\n'), 'Answer copied')),
      btn('rerun', 'Ask again', () => runAgentPrompt(locate(b.id)[0] || activeTab(), b.prompt)),
      btn('star', b.bookmarked ? 'Remove bookmark' : 'Bookmark', () => patchBlock(b, { bookmarked: !b.bookmarked }), b.bookmarked),
      btn(b.collapsed ? 'unfold' : 'fold', b.collapsed ? 'Expand' : 'Collapse', () => patchBlock(b, { collapsed: !b.collapsed })),
      b.status !== 'running' ? btn('trash', 'Remove block', () => api('DELETE', `/api/blocks/${b.id}`).catch(() => {})) : null);
    return h('div', { class: 'block-head' }, meta, cmd, acts);
  }
  function locate(id) { for (const t of S.tabs) { const b = t.blocks.find((x) => x.id === id); if (b) return [t, b]; } return []; }

  function toolArg(ev) {
    const i = ev.input || {};
    switch (ev.name) {
      case 'Bash': case 'PowerShell': return i.command || '';
      case 'Read': case 'Write': case 'Edit': case 'NotebookEdit': return shortPath(i.file_path || i.notebook_path || '');
      case 'Grep': return `"${i.pattern || ''}"` + (i.path ? ' in ' + shortPath(i.path) : '');
      case 'Glob': return i.pattern || '';
      case 'WebFetch': return i.url || '';
      case 'WebSearch': return i.query || '';
      case 'Task': case 'Agent': return i.description || '';
      case 'TodoWrite': return `${(i.todos || []).length} todos`;
      default: { const v = Object.values(i).find((x) => typeof x === 'string'); return v || ''; }
    }
  }
  function toolInput(ev) {
    const i = ev.input || {};
    if (ev.name === 'Bash' || ev.name === 'PowerShell') return i.command || '';
    if (ev.name === 'Edit') return `- ${String(i.old_string || '').slice(0, 1500)}\n+ ${String(i.new_string || '').slice(0, 1500)}`;
    if (ev.name === 'TodoWrite') return (i.todos || []).map((t) => `${t.status === 'completed' ? '☑' : t.status === 'in_progress' ? '◐' : '☐'} ${t.content}`).join('\n');
    return JSON.stringify(i, null, 2).slice(0, 4000);
  }
  function detailsEl(key, defaultOpen, cls) {
    const d = h('details', { class: cls });
    d.open = ui.open.has(key) ? ui.open.get(key) : defaultOpen;
    d.addEventListener('toggle', () => ui.open.set(key, d.open));
    return d;
  }
  function workingLabel(b) {
    const run = [...b.events].reverse().find((e) => e.type === 'tool' && e.status === 'running');
    return run ? `${run.name}${toolArg(run) ? ' · ' + oneLine(toolArg(run)).slice(0, 60) : ''}…` : 'Thinking…';
  }
  function eventNode(b, ev, i) {
    const key = b.id + ':' + i;
    if (ev.type === 'text') return linkifyPaths(h('div', { class: 'ev-text', html: md(ev.text) }), b.cwd);
    if (ev.type === 'thinking') {
      if (st.agent.thinking === 'hidden') return null;
      const d = detailsEl(key, st.agent.thinking === 'expanded', 'ev-thinking');
      d.append(h('summary', null, 'Thinking'), h('div', null, ev.text));
      return d;
    }
    if (ev.type === 'tool') {
      const d = detailsEl(key, st.agent.toolStyle === 'detailed' && ev.status === 'error', 'ev-tool');
      const ti = ev.input || {};
      const fp = ['Read', 'Write', 'Edit', 'MultiEdit', 'NotebookEdit'].includes(ev.name) ? ti.file_path || ti.notebook_path : null;
      const spec = ev.name === 'Edit' ? { edits: [editSpec(ti.old_string, ti.new_string, ti.replace_all)] }
        : ev.name === 'MultiEdit' ? { edits: (ti.edits || []).map((x) => editSpec(x.old_string, x.new_string, x.replace_all)) }
          : ev.name === 'Write' || ev.name === 'NotebookEdit' ? { all: true } : null;
      const view = fp ? h('button', { class: 'icon-btn', title: spec ? 'View the changed lines' : 'View file', html: icon('eye'), onclick: (e) => { e.preventDefault(); e.stopPropagation(); Files.open(fp, b.cwd, spec); } }) : null;
      d.append(h('summary', null, h('span', { class: 'tst ' + ev.status }), h('span', { class: 'tname' }, ev.name), h('span', { class: 'targ' }, toolArg(ev)), view),
        h('pre', { class: 'in' }, toolInput(ev)), ev.result != null ? h('pre', null, ev.result || '(no output)') : null);
      return d;
    }
    if (ev.type === 'notice') return h('div', { class: 'ev-notice' }, ev.text);
    return null;
  }
  function ctxTokens(u) { return u ? (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0) : 0; }
  function agentFoot(b) {
    if (b.status === 'running') return null;
    const m = b.meta || {};
    const foot = h('div', { class: 'agent-foot' });
    if (m.turns) foot.append(h('span', null, `${m.turns} turn${m.turns === 1 ? '' : 's'}`));
    if (m.durationMs) foot.append(h('span', null, fmtDur(m.durationMs)));
    if (m.ctxUsage) foot.append(h('span', null, `${fmtTokens(ctxTokens(m.ctxUsage))} context`));
    if (m.permissionMode && m.permissionMode !== 'default') foot.append(h('span', null, m.permissionMode));
    const tab = locate(b.id)[0];
    if (m.denials && m.denials.length) {
      const names = [...new Set(m.denials.map((d) => d.tool_name))].join(', ');
      foot.append(h('span', { class: 'deny' }, `${m.denials.length} blocked by permissions (${names})`,
        h('button', { class: 'btn small', onclick: () => runAgentPrompt(tab, 'Continue. The tool calls that were blocked are now allowed — retry them.', { permissionMode: 'acceptEdits' }) }, 'Retry allowing edits'),
        h('button', { class: 'btn small', onclick: () => runAgentPrompt(tab, 'Continue. The tool calls that were blocked are now allowed — retry them.', { permissionMode: 'bypassPermissions' }) }, 'Retry allowing everything')));
    }
    return foot.childNodes.length ? foot : null;
  }

  function upsertBlockEl(b, isNew) {
    const box = $('#blocks');
    let el = blockEls.get(b.id);
    if (el) { fillBlock(el, b); if (b.status === 'running' || isNew) scrollToEnd(); return; }
    $('.empty-state', box)?.remove();
    el = blockEl(b);
    if (st.blocks.flow === 'top') box.insertBefore(el, $('.spacer', box).nextSibling);
    else box.append(el);
    scrollToEnd(isNew && ui.stick);
  }
  function selectBlock(id) {
    if (ui.selected) blockEls.get(ui.selected)?.classList.remove('selected');
    ui.selected = id;
    const el = id && blockEls.get(id);
    if (el) { el.classList.add('selected'); el.scrollIntoView({ block: 'nearest' }); }
  }
  function moveSelection(dir) {
    const t = activeTab();
    const ids = (st.blocks.flow === 'top' ? [...t.blocks].reverse() : t.blocks).map((b) => b.id);
    if (!ids.length) return;
    let i = ids.indexOf(ui.selected);
    i = i === -1 ? (dir < 0 ? ids.length - 1 : 0) : Math.max(0, Math.min(ids.length - 1, i + dir));
    selectBlock(ids[i]);
  }
  function patchBlock(b, patch) { Object.assign(b, patch); const el = blockEls.get(b.id); if (el) fillBlock(el, b); api('PATCH', `/api/blocks/${b.id}`, patch).catch(() => {}); }
  function killBlock(b) { api('POST', `/api/blocks/${b.id}/kill`).catch(() => {}); }

  setInterval(() => {
    for (const el of $$('.m-dur.live')) el.innerHTML = icon('clock') + fmtDur(Date.now() - +el.dataset.start);
  }, 1000);

  // ================================================================ agent toolbar (agent view) + Claude Code bar (terminal)
  function agentStats(t) {
    let ctx = null;
    for (const b of t.blocks) if (b.meta && b.meta.ctxUsage) ctx = b.meta.ctxUsage;
    return { ctx: ctxTokens(ctx) };
  }
  function renderToolbar(t) {
    const left = $('#agent-toolbar .tb-left'), right = $('#agent-toolbar .tb-right');
    left.textContent = ''; right.textContent = '';
    if (t.mode !== 'agent') return;
    const s = agentStats(t);
    const selChip = (ico, path, options, title) => {
      const sel = h('select', { title }, options.map(([v, l]) => h('option', { value: v }, l)));
      sel.value = getPath(st, path) || '';
      sel.addEventListener('change', () => { setPath(st, path, sel.value); settingsChanged({ full: false }); });
      return h('span', { class: 'chip', title, html: icon(ico) }, sel);
    };
    const make = {
      mode: () => chipEl('terminal', 'Terminal', { onclick: toggleMode, title: 'Back to the terminal (Ctrl+I)' }),
      cwd: () => chipEl('folder', base(t.cwd), { title: t.cwd }),
      branch: () => (t.git && t.git.branch ? chipEl('branch', t.git.branch) : null),
      diff: () => (t.git && (t.git.added || t.git.removed) ? chipEl(null, '', { html: `<span class="diff">${diffHtml(t.git)}</span>`, title: `${t.git.files} files changed` }) : null),
      model: () => selChip('chip', 'agent.model', [['', 'default model'], ['opus', 'opus'], ['sonnet', 'sonnet'], ['haiku', 'haiku'], ['fable', 'fable']], 'Model'),
      permission: () => selChip('shield', 'agent.permissionMode', [['default', 'ask (blocks writes)'], ['plan', 'plan'], ['acceptEdits', 'accept edits'], ['auto', 'auto'], ['dontAsk', "don't ask"], ['bypassPermissions', 'bypass all']], 'Permission mode'),
      context: () => {
        if (!s.ctx) return null;
        const pct = Math.min(100, (s.ctx / 200000) * 100);
        return chipEl('gauge', '', { html: `${fmtTokens(s.ctx)} <span class="meter"><i style="width:${pct}%"></i></span>`, title: `Context window: ${s.ctx.toLocaleString()} tokens` });
      },
      usage: () => {
        const w = usageWindow('session') || usageWindows()[0];
        if (!w) return null;
        return chipEl('gauge', '', { cls: 'usage-chip ' + usageLevel(w.pct), html: `${w.key === 'session' ? '5h' : esc(w.label)} ${fmtPct(w.pct)} <span class="meter"><i style="width:${Math.min(100, w.pct)}%"></i></span>`, title: usageTitle() + '\nClick to refresh', onclick: refreshUsage });
      },
      commands: () => chipEl(null, 'Commands', { html: '<b class="slash">/</b>Commands', title: 'Claude Code commands and skills (type / in the input)', onclick: () => { input.focus(); if (!input.value.startsWith('/')) setInput('/'); Cmds.update(); } }),
      session: () => (t.agentSessionId ? chipEl('chat', t.agentSessionId.slice(0, 8), { title: `Conversation ${t.agentSessionId} — click to copy "claude --resume"`, onclick: () => copy(`claude --resume ${t.agentSessionId}`, 'Resume command copied — paste it in the terminal') }) : null),
      newchat: () => chipEl('plus', 'New', { title: 'Start a new conversation', onclick: () => { api('POST', `/api/tabs/${t.id}/new-conversation`).catch(() => {}); toast('New conversation', 'The next prompt starts fresh.'); } }),
    };
    for (const c of st.agent.chips) {
      if (c.side === 'hidden' || !make[c.id]) continue;
      const el = make[c.id]();
      if (el) (c.side === 'right' ? right : left).append(el);
    }
  }
  // Interactive `claude` in the terminal: a bar like Warp's CLI-agent footer, fed by the Clawd hook.
  function renderCliToolbar(t) {
    const bar = $('#cli-toolbar');
    const sess = interactiveSession(t), T = termOf(t);
    const on = st.agent.cliToolbar && t.mode !== 'agent' && (T.cliAgent || !!sess);
    bar.classList.toggle('on', on);
    bar.textContent = '';
    if (!on) return;
    const state = sess ? sess.state : 'thinking';
    const cv = h('canvas', { class: 'clawd-ind cli-clawd', dataset: { id: t.id } });
    bar.append(...[cv,   // DOM append() would print the nulls as "null"
      chipEl('sparkle', `Claude Code · ${STATE_WORDS[state] || state}`, { cls: state === 'waiting' ? 'accent warn' : 'accent' }),
      sess && sess.name ? chipEl(null, sess.name) : null,
      chipEl('folder', base(t.cwd), { title: t.cwd }),
      t.git && t.git.branch ? chipEl('branch', t.git.branch) : null,
      t.git && (t.git.added || t.git.removed) ? chipEl(null, '', { html: `<span class="diff">${diffHtml(t.git)}</span>` }) : null,
      h('span', { class: 'grow' }),
      sess ? chipEl('chat', sess.sid.slice(0, 8), { title: `Session ${sess.sid} — click to copy "claude --resume"`, onclick: () => copy(`claude --resume ${sess.sid}`, 'Resume command copied') }) : null,
      chipEl(null, 'Commands', { html: '<b class="slash">/</b>Commands', title: 'Claude Code commands and skills: types the command into claude', onclick: (e) => { const r = e.currentTarget.getBoundingClientRect(); Cmds.openFor(t, r.right - 520, r.bottom + 6); } }),
      chipEl('sparkle', 'Agent view', { title: 'Open the structured Claude view of this tab (Ctrl+I)', onclick: toggleMode })].filter(Boolean));
  }

  // ================================================================ agent input
  const input = $('#input');
  function updateModeUI(t) {
    t = t || activeTab();
    const rb = runningBlock(t);
    $('#mode-btn').textContent = st.input.agentSymbol;
    const stop = !!rb && !input.value;
    const run = $('#run-btn');
    run.classList.toggle('stop', stop);
    run.innerHTML = icon(stop ? 'stop' : 'enter');
    run.title = stop ? 'Stop (Ctrl+C)' : 'Send (Enter)';
    input.placeholder = rb ? 'Claude is working… Ctrl+C stops it' : `Ask Claude Code about ${base(t.cwd)}…  (Ctrl+I → terminal)`;
  }
  function promptHistory() {
    if (!ui.hist || ui.hist.dirty) {
      const all = [];
      for (const t of S.tabs) for (const b of t.blocks) all.push(b);
      all.sort((a, b) => a.start - b.start);
      const out = [];
      for (const b of all) if (b.prompt && out[out.length - 1] !== b.prompt) out.push(b.prompt);
      ui.hist = { list: out, dirty: false };
    }
    return ui.hist.list;
  }
  function autoGrow() { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, innerHeight * 0.4) + 'px'; }
  function setInput(v) { input.value = v; input.setSelectionRange(v.length, v.length); autoGrow(); updateModeUI(); }
  const caretLine = () => input.value.slice(0, input.selectionStart).split('\n').length - 1;
  const lineCount = () => input.value.split('\n').length;
  function historyStep(dir) {
    const list = promptHistory();
    if (!list.length) return;
    if (ui.histIdx === -1) { if (dir > 0) return; ui.histDraft = input.value; ui.histIdx = list.length; }
    ui.histIdx += dir;
    if (ui.histIdx < 0) ui.histIdx = 0;
    if (ui.histIdx >= list.length) { ui.histIdx = -1; setInput(ui.histDraft); return; }
    setInput(list[ui.histIdx]);
  }
  function submit() {
    const t = activeTab(), v = input.value.trim();
    if (!v) return;
    if (v.startsWith('/') && Cmds.runLocal(t, v)) { setInput(''); ui.histIdx = -1; return; }
    if (runningBlock(t)) { toast('Claude is still working', 'Wait for it to finish, or press Ctrl+C to stop it.', 'warn'); return; }
    setInput('');
    ui.histIdx = -1;
    runAgentPrompt(t, v);
  }
  function runAgentPrompt(t, prompt, extra = {}) {
    if (!t) return;
    if (runningBlock(t)) { toast('Claude is still working', 'Wait for it to finish, or stop it first.', 'warn'); return; }
    ui.stick = true;
    api('POST', `/api/tabs/${t.id}/agent`, { prompt, model: st.agent.model, permissionMode: st.agent.permissionMode, ...extra })
      .catch((e) => toast('Claude Code failed', e.message, 'err'));
  }
  input.addEventListener('input', () => { ui.histIdx = -1; autoGrow(); updateModeUI(); Cmds.update(); });
  input.addEventListener('click', () => Cmds.update());
  input.addEventListener('blur', () => setTimeout(() => { if (document.activeElement !== input) Cmds.close('input'); }, 120));
  async function insertImagePaths(files) { insertText(await imagePaths(files)); }
  function insertText(p) {
    if (!p) return;
    input.focus();
    input.setRangeText(p, input.selectionStart, input.selectionEnd, 'end');
    input.dispatchEvent(new Event('input'));
  }
  input.addEventListener('paste', (e) => { const imgs = imagesIn(e.clipboardData, true); if (imgs) { e.preventDefault(); insertImagePaths(imgs); } });
  const inputWrap = $('#input-wrap');
  inputWrap.addEventListener('dragover', (e) => { if (canDropPaths(e.dataTransfer)) { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; inputWrap.classList.add('drop'); } });
  inputWrap.addEventListener('dragleave', (e) => { if (!inputWrap.contains(e.relatedTarget)) inputWrap.classList.remove('drop'); });
  inputWrap.addEventListener('drop', async (e) => {
    inputWrap.classList.remove('drop');
    if (!canDropPaths(e.dataTransfer)) return;
    e.preventDefault();
    insertText(await droppedPaths(dropItems(e.dataTransfer), activeTab()));
  });
  input.addEventListener('keydown', (e) => {
    if (Cmds.key(e)) return;
    const t = activeTab();
    if (e.key === 'Enter' && !e.isComposing) {
      const go = st.input.submitOnCtrlEnter ? e.ctrlKey || e.metaKey : !e.shiftKey && !e.ctrlKey;
      if (go) { e.preventDefault(); submit(); return; }
    }
    if (e.key === 'ArrowUp' && !e.ctrlKey && caretLine() === 0) { e.preventDefault(); historyStep(-1); return; }
    if (e.key === 'ArrowDown' && !e.ctrlKey && caretLine() === lineCount() - 1 && ui.histIdx !== -1) { e.preventDefault(); historyStep(1); return; }
    if (e.key.toLowerCase() === 'c' && e.ctrlKey && !e.shiftKey && input.selectionStart === input.selectionEnd) {
      const rb = runningBlock(t);
      if (rb) { e.preventDefault(); killBlock(rb); } else if (input.value) { e.preventDefault(); setInput(''); }
    }
  });
  $('#mode-btn').addEventListener('click', toggleMode);
  $('#run-btn').addEventListener('click', () => {
    const rb = runningBlock(activeTab());
    if (rb && !input.value) killBlock(rb); else submit();
    input.focus();
  });
  for (const b of $$('#mode-seg button')) b.addEventListener('click', () => setMode(activeTab(), b.dataset.mode));

  // ================================================================ slash commands (Claude Code's "/" menu)
  // The list comes from the `init` event of headless runs (what works in -p mode) plus skills/commands on disk.
  // Agent view: typing "/" opens it above the input; Enter runs, Tab completes. Terminal with interactive
  // `claude`: a palette that types the command into the shell.
  const Cmds = (() => {
    const box = $('#cmd-menu');
    const cache = new Map();   // cwd -> { at, list }
    let items = [], sel = 0, mode = null, ptyTab = null, filterEl = null;
    const KIND = { builtin: 'built-in', skill: 'skill', command: 'command', plugin: 'plugin' };
    async function load(cwd) {
      const hit = cache.get(cwd);
      if (hit && Date.now() - hit.at < 60000) return hit.list;
      const r = await api('GET', '/api/claude/commands?cwd=' + encodeURIComponent(cwd || '')).catch(() => ({ commands: [] }));
      cache.set(cwd, { at: Date.now(), list: r.commands || [] });
      return r.commands || [];
    }
    function rank(list, q) {
      q = q.toLowerCase();
      const scored = [];
      for (const c of list) {
        const n = c.name.toLowerCase(), tail = n.split(':').pop();
        const s = !q ? 3 : n.startsWith(q) || tail.startsWith(q) ? 0 : n.includes(q) ? 1 : (c.desc || '').toLowerCase().includes(q) ? 2 : -1;
        if (s >= 0) scored.push([s, c]);
      }
      const order = { builtin: 0, command: 1, skill: 2, plugin: 3 };
      return scored.sort((a, b) => a[0] - b[0] || (order[a[1].kind] ?? 9) - (order[b[1].kind] ?? 9) || a[1].name.localeCompare(b[1].name)).map((x) => x[1]).slice(0, 80);
    }
    // "/na" with the caret inside the first word → "na"; anything else closes the menu
    function inputQuery() {
      const v = input.value, c = input.selectionStart;
      if (!v.startsWith('/') || c !== input.selectionEnd) return null;
      const head = v.slice(0, c);
      return /^\/[^\s/]*$/.test(head) ? head.slice(1) : null;
    }
    let seq = 0;
    async function update() {
      if (mode === 'pty') return;
      const q = inputQuery(), t = activeTab();
      if (q == null || !t || t.mode !== 'agent') return close('input');
      const my = ++seq;
      const list = (await load(t.cwd)).filter((c) => !c.terminalOnly);
      if (my !== seq || inputQuery() == null) return;
      items = rank(list, q); sel = 0; mode = 'input';
      draw();
    }
    function draw() {
      box.textContent = '';
      box.className = 'popup cmd-menu' + (mode === 'pty' ? ' pty' : '');
      if (mode === 'pty') box.append(filterEl);
      const listEl = h('div', { class: 'cmd-list' });
      if (!items.length) listEl.append(h('div', { class: 'cmd-empty' }, 'No matching command'));
      items.forEach((c, i) => {
        const row = h('div', { class: 'cmd-item' + (i === sel ? ' sel' : ''), title: c.desc || c.name },
          h('span', { class: 'cmd-name' }, '/' + c.name, c.hint ? h('span', { class: 'cmd-hint' }, ' ' + c.hint) : null),
          h('span', { class: 'cmd-desc' }, c.desc || ''),
          h('span', { class: 'cmd-kind k-' + c.kind }, c.terminalOnly ? 'terminal' : KIND[c.kind] || c.kind));
        row.addEventListener('mousedown', (e) => { e.preventDefault(); sel = i; choose(true); });
        row.addEventListener('mousemove', () => { if (sel !== i) { sel = i; mark(); } });
        listEl.append(row);
      });
      box.append(listEl);
      box.hidden = false;
      place();
      mark();
    }
    function mark() {
      $$('.cmd-item', box).forEach((r, i) => r.classList.toggle('sel', i === sel));
      $('.cmd-item.sel', box)?.scrollIntoView({ block: 'nearest' });
    }
    let anchor = null;
    function place() {
      box.style.left = box.style.top = box.style.bottom = '';
      if (mode === 'input') {
        const r = $('#input-wrap').getBoundingClientRect();
        box.style.left = r.left + 14 + 'px';
        box.style.width = Math.min(640, r.width - 28) + 'px';
        if (st.input.position === 'top') box.style.top = r.bottom + 4 + 'px'; else box.style.bottom = innerHeight - r.top + 4 + 'px';
      } else {
        box.style.width = '520px';
        box.style.left = Math.max(8, Math.min(anchor.x, innerWidth - 528)) + 'px';
        box.style.top = Math.max(8, Math.min(anchor.y, innerHeight - box.offsetHeight - 8)) + 'px';
      }
    }
    function close(only) {
      if (!mode || (only && mode !== only)) return;
      mode = null; box.hidden = true; items = [];
    }
    function choose(run) {
      const c = items[sel];
      if (!c) return;
      if (mode === 'pty') {
        const tab = ptyTab;
        close();
        wsSend({ t: 'in', tab: tab.id, d: '/' + c.name + (c.hint ? ' ' : '') });
        Terms.active() && Terms.active().term.focus();
        return;
      }
      const rest = input.value.replace(/^\/\S*/, '');
      close();
      setInput('/' + c.name + (rest || ' '));
      if (run && !rest.trim()) submit();
    }
    function key(e) {
      if (!mode || e.isComposing) return false;
      const k = e.key;
      if (k === 'ArrowDown' || k === 'ArrowUp') { e.preventDefault(); if (items.length) { sel = (sel + (k === 'ArrowDown' ? 1 : -1) + items.length) % items.length; mark(); } return true; }
      if (k === 'Tab') { e.preventDefault(); choose(mode === 'pty'); return true; }
      if (k === 'Enter' && !e.shiftKey) { if (!items.length) { const pty = mode === 'pty'; close(); return pty; } e.preventDefault(); choose(true); return true; }
      if (k === 'Escape') { e.preventDefault(); e.stopPropagation(); const pty = mode === 'pty'; close(); if (pty && Terms.active()) Terms.active().term.focus(); return true; }
      return false;
    }
    // Palette for a tab: interactive claude in its terminal → types into it; otherwise → the agent view's "/" menu
    async function openFor(t, x, y) {
      if (t.id !== S.activeTabId) activate(t.id);
      if (t.mode !== 'agent' && (termOf(t).cliAgent || interactiveSession(t))) {
        mode = 'pty'; ptyTab = t; anchor = { x, y }; items = []; sel = 0;
        filterEl = h('input', { class: 'cmd-filter', placeholder: 'Claude Code command…', spellcheck: 'false' });
        filterEl.addEventListener('keydown', (e) => { if (key(e)) e.stopPropagation(); });
        filterEl.addEventListener('blur', () => setTimeout(() => { if (mode === 'pty' && document.activeElement !== filterEl) close(); }, 150));
        const all = await load(t.cwd);
        const refresh = () => { items = rank(all, filterEl.value.replace(/^\//, '')); sel = 0; draw(); filterEl.focus(); };
        filterEl.addEventListener('input', refresh);
        refresh();
        return;
      }
      if (t.mode !== 'agent') setMode(t, 'agent');
      setTimeout(() => { input.focus(); setInput('/'); update(); }, 60);
    }
    // Commands Hangar answers itself (the rest go to `claude -p` like any prompt)
    const MODELS = ['opus', 'sonnet', 'haiku', 'fable'];
    function runLocal(t, v) {
      const [, name, arg = ''] = v.match(/^\/(\S+)\s*([\s\S]*)$/) || [];
      if (!name) return false;
      const a = arg.trim();
      switch (name) {
        case 'help': setTimeout(() => { setInput('/'); update(); }); return true;
        case 'clear': case 'new':
          api('POST', `/api/tabs/${t.id}/new-conversation`).catch(() => {});
          toast('New conversation', 'The next prompt starts fresh. Older blocks stay above (Clear removes them).');
          return true;
        case 'resume':
          if (t.agentSessionId) copy(`claude --resume ${t.agentSessionId}`, 'Resume command copied — paste it in the terminal');
          else toast('No conversation yet', 'Send a prompt first.', 'warn');
          return true;
        case 'model': {
          const pick = (m) => { st.agent.model = m; settingsChanged({ full: false }); renderToolbar(t); toast('Model', m || 'default model'); };
          if (a) { if (/^[\w.\-[\]]+$/.test(a)) pick(a === 'default' ? '' : a); else toast('Bad model name', a, 'err'); return true; }
          const r = $('#input-wrap').getBoundingClientRect();
          showMenu(r.left + 14, r.top - 8 - 32 * (MODELS.length + 1), [['', 'default model'], ...MODELS.map((m) => [m, m])].map(([m, l]) => ({ label: l, hint: (st.agent.model || '') === m ? 'current' : '', run: () => pick(m) })));
          return true;
        }
      }
      const c = [...cache.values()].flatMap((x) => x.list).find((x) => x.name === name);
      if (c && c.terminalOnly) { toast(`/${name} only works in interactive Claude Code`, 'Run `claude` in the terminal (Ctrl+I) and use it there.', 'warn'); return true; }
      return false;
    }
    addEventListener('resize', () => { if (mode) place(); });
    document.addEventListener('mousedown', (e) => { if (mode && !box.contains(e.target) && e.target !== input) close(); });
    return { update, key, close, openFor, runLocal, invalidate: () => cache.clear() };
  })();

  // ================================================================ Claude plan usage (session 5 h + weekly), fed by the server
  const usageWindows = () => {
    const order = (k) => (k === 'session' ? 0 : k === 'week' ? 1 : 2);
    return [...((S.usage && S.usage.windows) || [])].sort((a, b) => order(a.key) - order(b.key));
  };
  const usageWindow = (key) => usageWindows().find((w) => w.key === key) || null;
  const usageLevel = (p) => (p >= 90 ? 'bad' : p >= 75 ? 'warn' : 'ok');
  const fmtPct = (p) => (p < 10 && p % 1 ? p.toFixed(1) : Math.round(p)) + '%';
  function fmtReset(ts) {
    if (!ts) return '';
    const ms = ts - Date.now();
    if (ms <= 0) return 'resetting';
    if (ms < 864e5) { const m = Math.round(ms / 60000); return `resets in ${m >= 60 ? Math.floor(m / 60) + 'h ' : ''}${m % 60}m`; }
    return 'resets ' + new Date(ts).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' });
  }
  function usageTitle() {
    if (!usageWindows().length) return 'Claude plan usage: not known yet';
    return ['Claude plan usage', ...usageWindows().map((w) => `${w.label}: ${fmtPct(w.pct)}${w.resetsAt ? ' · ' + fmtReset(w.resetsAt) : ''}`), `Updated ${fmtTime(S.usage.at)}`].join('\n');
  }
  let usageBusy = false;
  async function refreshUsage() {
    if (usageBusy) return;
    usageBusy = true; $('#usage-bar').classList.add('busy');
    try { const u = await api('POST', '/api/claude/usage'); if (u) S.usage = u; } catch { /* keep the last one */ }
    usageBusy = false; $('#usage-bar').classList.remove('busy');
    renderUsage(); const t = activeTab(); if (t) renderToolbar(t);
  }
  function renderUsage() {
    const bar = $('#usage-bar'), ws = usageWindows();
    bar.hidden = !st.tabs.usageBar || !ws.length;
    if (bar.hidden) return;
    bar.textContent = '';
    bar.title = usageTitle() + '\nClick to refresh';
    for (const w of ws.slice(0, 3)) {
      bar.append(h('div', { class: 'ub-row ' + usageLevel(w.pct) },
        h('div', { class: 'ub-top' }, h('span', null, w.label), h('span', { class: 'ub-reset' }, fmtReset(w.resetsAt)), h('b', null, fmtPct(w.pct))),
        h('div', { class: 'ub-track' }, h('i', { style: { width: Math.min(100, w.pct) + '%' } }))));
    }
  }
  $('#usage-bar').addEventListener('click', refreshUsage);
  setInterval(renderUsage, 60000);

  // ================================================================ menus, toasts, notifications, clipboard
  function showMenu(x, y, items) {
    const m = $('#menu');
    m.textContent = '';
    for (const it of items) {
      if (!it) continue;
      if (it.sep) { m.append(h('div', { class: 'sep' })); continue; }
      if (it.swatches) {
        const row = h('div', { class: 'swatches' });
        row.append(h('span', { class: 'sw none', title: 'No color', onclick: () => { hideMenu(); it.pick(''); } }));
        for (const c of SWATCHES) row.append(h('span', { class: 'sw', title: c, style: { background: c, borderColor: it.current === c ? 'var(--fg)' : '' }, onclick: () => { hideMenu(); it.pick(c); } }));
        const custom = h('input', { type: 'color', value: toHex6(it.current || '#7c6cff'), title: 'Custom color', style: { width: '22px', height: '22px', padding: 0, border: 0, background: 'none' } });
        custom.addEventListener('change', () => { hideMenu(); it.pick(custom.value); });
        row.append(custom);
        m.append(row);
        continue;
      }
      m.append(h('div', { class: 'item' + (it.danger ? ' danger' : ''), onclick: () => { hideMenu(); it.run(); } }, it.label, it.hint ? h('span', { class: 'hint' }, it.hint) : null));
    }
    m.hidden = false;
    m.style.left = Math.max(4, Math.min(x, innerWidth - m.offsetWidth - 8)) + 'px';
    m.style.top = Math.max(4, Math.min(y, innerHeight - m.offsetHeight - 8)) + 'px';
  }
  const hideMenu = () => { $('#menu').hidden = true; };
  document.addEventListener('mousedown', (e) => { if (!e.target.closest('#menu')) hideMenu(); });

  function toast(title, body, kind = 'info', onclick) {
    const el = h('div', { class: 'toast ' + kind }, h('b', null, title), body ? h('span', null, body) : null);
    const close = () => { el.classList.add('out'); setTimeout(() => el.remove(), 250); };
    el.addEventListener('click', () => { if (onclick) onclick(); close(); });
    $('#toasts').append(el);
    setTimeout(close, st.notifications.toastSeconds * 1000);
  }
  let actx = null;
  function ping() {
    const n = st.notifications;
    if (!n.sound) return;
    if (n.soundUrl) { const a = new Audio(n.soundUrl); a.volume = Math.min(1, n.soundVolume * 2); a.play().catch(() => {}); return; }
    try {
      actx = actx || new AudioContext();
      const now = actx.currentTime;
      [0, 0.12].forEach((d, i) => {
        const o = actx.createOscillator(), g = actx.createGain();
        o.type = 'sine';
        o.frequency.value = n.soundFreq * (i ? 1.5 : 1);
        g.gain.setValueAtTime(0.0001, now + d);
        g.gain.exponentialRampToValueAtTime(Math.max(0.0002, n.soundVolume), now + d + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, now + d + 0.3);
        o.connect(g).connect(actx.destination);
        o.start(now + d); o.stop(now + d + 0.35);
      });
    } catch { /* audio unavailable */ }
  }
  function notify(title, body, kind, tabId) {
    toast(title, body, kind, tabId ? () => activate(tabId) : null);
    ping();
    if (st.notifications.desktop && document.hidden && 'Notification' in window && Notification.permission === 'granted') {
      const n = new Notification(title, { body, icon: 'icon-192.png', tag: tabId || undefined });
      n.onclick = () => { window.focus(); if (tabId) activate(tabId); n.close(); };
    }
  }
  const away = (tabId) => tabId !== S.activeTabId || document.hidden || !document.hasFocus();
  const tabName = (t) => t.customTitle || base(t.cwd);
  function onAgentFinished(t, b) {
    if (t.id !== S.activeTabId) ui.unread.add(t.id);
    if (b.meta && b.meta.denials && b.meta.denials.length) notify(`${tabName(t)}: Claude needs permission`, `${b.meta.denials.length} tool call(s) were blocked. Open the tab to allow them.`, 'warn', t.id);
    else if (st.notifications.agentDone && away(t.id)) notify(`${tabName(t)}: Claude finished`, oneLine(b.prompt).slice(0, 120), b.status === 'done' ? 'ok' : 'err', t.id);
  }
  function onCommandFinished(t, c) {
    if (!c.command) return;
    const long = c.end - c.start >= st.notifications.longRunningSeconds * 1000;
    if (t.id !== S.activeTabId && long) ui.unread.add(t.id);
    if (st.notifications.longRunning && long && away(t.id)) {
      notify(`${tabName(t)}: ${c.exitCode === 0 ? 'finished' : 'failed'}`, `${oneLine(c.command).slice(0, 100)} · ${fmtDur(c.end - c.start)}`, c.exitCode === 0 ? 'ok' : 'err', t.id);
    }
  }
  // Interactive `claude` in a Hangar terminal: tell the user when it needs them or finished while they were away
  function onExternalChanged(list) {
    for (const e of list) {
      const prev = ui.extStates.get(e.sid);
      ui.extStates.set(e.sid, e.state);
      const t = e.tab && findTab(e.tab);
      if (!t || e.host || !prev || prev === e.state) continue;
      if (e.state === 'waiting') notify(`${tabName(t)}: Claude needs your OK`, 'It is waiting for a permission answer in the terminal.', 'warn', t.id);
      else if (e.state === 'idle' && CL.WORKING.has(prev) && st.notifications.agentDone && away(t.id)) { ui.unread.add(t.id); notify(`${tabName(t)}: Claude finished`, `${e.name || base(e.cwd)} is waiting for your next prompt.`, 'ok', t.id); }
    }
  }
  async function copy(text, msg) {
    try { await navigator.clipboard.writeText(text); if (msg) toast(msg, String(text).length > 120 ? '' : String(text)); }
    catch { toast('Clipboard unavailable', 'Your browser blocked clipboard access.', 'err'); }
  }

  // ================================================================ settings drawer
  function openSettings() { const d = $('#settings'); d.hidden = false; renderSettings(); $('#settings-search').focus(); }
  function closeSettings() { $('#settings').hidden = true; const t = activeTab(); if (t.mode === 'agent') input.focus(); else Terms.active()?.term.focus(); }

  function fieldRow(f, control, wide) {
    return h('div', { class: 's-field' + (wide ? ' wide' : ''), dataset: { label: (f.label || '').toLowerCase() + ' ' + (f.path || '') } },
      f.label ? h('div', { class: 'lbl' }, f.label) : null, control, f.help ? h('div', { class: 'help' }, f.help) : null);
  }
  function setting(path, value, opts) {
    setPath(st, path, value);
    if (path.startsWith('theme.')) { st.themeName = ''; $$('.preset.on').forEach((p) => p.classList.remove('on')); }
    if (path === 'notifications.desktop' && value && 'Notification' in window && Notification.permission === 'default') Notification.requestPermission();
    if (path === 'render.gpu') { setTimeout(renderSettings, 50); toast(value ? 'GPU rendering on' : 'CPU rendering on', 'The terminal switched already. Reopen the window (Settings → Rendering) to apply it to the whole window.', 'info'); }
    settingsChanged(opts);
  }
  function colorControl(path, allowEmpty) {
    const val = getPath(st, path) || '';
    const pick = h('input', { type: 'color', value: toHex6(val || st.theme.accent) });
    const text = h('input', { type: 'text', value: val, spellcheck: 'false', placeholder: allowEmpty ? 'auto' : '' });
    pick.addEventListener('input', () => { text.value = pick.value; setting(path, pick.value, { full: false }); });
    text.addEventListener('change', () => { if (text.value || allowEmpty) { if (hexToRgb(text.value)) pick.value = toHex6(text.value); setting(path, text.value.trim(), { full: false }); } });
    return h('div', { class: 's-color' }, pick, text);
  }
  function gpuInfo() {
    let renderer = 'WebGL unavailable', hw = false;
    try {
      const c = document.createElement('canvas');
      const gl = c.getContext('webgl2') || c.getContext('webgl');
      if (gl) {
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        renderer = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
        hw = !/swiftshader|llvmpipe|software|basic render|microsoft basic/i.test(renderer);
        const lose = gl.getExtension('WEBGL_lose_context');
        if (lose) lose.loseContext();
      }
    } catch { /* no WebGL */ }
    return { renderer: renderer.replace(/^ANGLE \((.*)\)$/, '$1'), hw };
  }
  function renderField(f) {
    const v = f.path ? getPath(st, f.path) : undefined;
    switch (f.type) {
      case 'color': return fieldRow(f, colorControl(f.path, f.allowEmpty));
      case 'range': {
        const out = h('output', null, v + (f.unit || ''));
        const r = h('input', { type: 'range', min: f.min, max: f.max, step: f.step, value: v });
        r.addEventListener('input', () => { out.textContent = r.value + (f.unit || ''); setting(f.path, +r.value, { full: f.path.startsWith('blocks.') }); });
        return fieldRow(f, h('div', { class: 's-range' }, r, out));
      }
      case 'select': case 'shell': {
        const opts = f.type === 'shell' ? [['', 'Default (' + (SHELL_LABEL[S.info.defaultShell] || 'auto') + ')'], ...(S.info.shells || []).map((x) => [x, SHELL_LABEL[x] || x])] : f.options.map((o) => (Array.isArray(o) ? o : [o, o.replace(/_/g, ' ')]));
        const sel = h('select', null, opts.map(([val, lbl]) => h('option', { value: val }, lbl)));
        sel.value = v ?? '';
        sel.addEventListener('change', () => setting(f.path, sel.value));
        return fieldRow(f, sel);
      }
      case 'toggle': {
        const sw = h('div', { class: 'switch' + (v ? ' on' : ''), role: 'switch', tabindex: '0' });
        const flip = () => { const nv = !getPath(st, f.path); sw.classList.toggle('on', nv); setting(f.path, nv); };
        sw.addEventListener('click', flip);
        sw.addEventListener('keydown', (e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); flip(); } });
        return fieldRow(f, sw);
      }
      case 'text': {
        const inp = h('input', { type: 'text', value: v ?? '', spellcheck: 'false' });
        inp.addEventListener('input', debounce(() => setting(f.path, inp.value), 250));
        const wide = (v || '').length > 28 || /font|image|placeholder|url/i.test(f.path);
        return fieldRow(f, inp, wide);
      }
      case 'gpuinfo': {
        const g = gpuInfo(), tt = Terms.active();
        const termR = tt ? (tt.webgl ? 'WebGL — GPU' : 'DOM — CPU') : (st.render.gpu ? 'WebGL — GPU' : 'DOM — CPU');
        return h('div', { class: 's-field wide', dataset: { label: 'gpu renderer hardware acceleration graphics' } },
          h('div', { class: 'gpu-info' },
            h('span', null, 'Window graphics'), h('b', { class: g.hw ? 'hw' : 'sw' }, g.hw ? 'GPU · ' + g.renderer : 'Software (CPU) · ' + g.renderer),
            h('span', null, 'Terminal renderer'), h('b', { class: termR.includes('GPU') ? 'hw' : 'sw' }, termR)));
      }
      case 'reopen':
        return h('div', { class: 's-field wide', dataset: { label: 'reopen window gpu cpu' } },
          h('div', { class: 'io-btns' }, h('button', { class: 'btn small', onclick: reopenWindow }, 'Reopen window to apply'),
            h('span', { class: 'help', style: { alignSelf: 'center' } }, 'Opens Hangar in its own window with the GPU ' + (st.render.gpu ? 'on' : 'off') + ' and closes this one. Your shells keep running.')));
      case 'presets': return renderPresets();
      case 'wallpaper': return fieldRow(f, wallpaperEditor(), true);
      case 'ansi': {
        const grid = h('div', { class: 'ansi-grid' });
        st.theme.ansi.forEach((c, i) => {
          const inp = h('input', { type: 'color', value: toHex6(c), title: (i < 8 ? '' : 'bright ') + ANSI_NAMES[i % 8] });
          inp.addEventListener('input', () => { st.theme.ansi[i] = inp.value; st.themeName = ''; settingsChanged({ full: false }); });
          grid.append(inp);
        });
        return fieldRow(f, grid, true);
      }
      case 'dircolors': return fieldRow(f, dirColorsEditor(), true);
      case 'chips': return fieldRow(f, chipsEditor(), true);
      case 'css': {
        const ta = h('textarea', { spellcheck: 'false', placeholder: '/* Anything goes. Example: */\n.tab.active { border-radius: 99px; }\n.xterm .blk.err { background: hotpink; }' });
        ta.value = st.customCss || '';
        ta.addEventListener('input', debounce(() => setting('customCss', ta.value, { full: false }), 300));
        return fieldRow({ label: 'Injected after the theme. Every element has a stable class name — inspect with F12.' }, ta, true);
      }
      case 'io': return ioPanel();
      default: return h('div');
    }
  }
  function reopenWindow() {
    api('POST', '/api/window', { delay: 900 }).catch(() => {});
    toast('Reopening…', 'A new Hangar window is opening. If this one stays, close it.', 'info');
    setTimeout(() => window.close(), 300);
  }
  function themePreview(th) {
    return h('div', { class: 'pv', style: { background: th.backgroundImage ? `${bgImage(th.backgroundImage)}, ${th.background}` : th.background, border: `1px solid ${th.border}` } },
      h('i', { style: { background: th.accent, width: '45%' } }), h('i', { style: { background: th.foreground, width: '80%', opacity: 0.8 } }),
      h('i', { style: { background: th.success, width: '30%' } }));
  }
  function renderPresets() {
    const wrap = h('div', { class: 'presets' });
    const all = { ...THEMES, ...st.customThemes };
    for (const [name, th] of Object.entries(all)) {
      const custom = !THEMES[name];
      wrap.append(h('button', { class: 'preset' + (st.themeName === name ? ' on' : ''), onclick: () => applyPreset(name, th) },
        themePreview(th), h('div', { class: 'nm' }, name + (custom ? ' ★' : '')),
        custom ? h('span', { class: 'del', title: 'Delete', onclick: (e) => { e.stopPropagation(); delete st.customThemes[name]; settingsChanged({ full: false }); renderSettings(); } }, '×') : null));
    }
    const save = h('button', { class: 'btn small', onclick: () => {
      const name = prompt('Name for this theme:', st.themeName && !THEMES[st.themeName] ? st.themeName : 'My theme');
      if (!name) return;
      st.customThemes[name] = clone(st.theme); st.themeName = name; settingsChanged({ full: false }); renderSettings();
    } }, 'Save current as theme…');
    return h('div', { class: 's-field wide', dataset: { label: 'theme preset' } }, wrap, h('div', null, save));
  }
  function applyPreset(name, th) {
    st.theme = merge(clone(DEFAULTS.theme), clone(th));
    st.themeName = name;
    settingsChanged();
    renderSettings();
  }
  // Background from your computer: upload (with progress) → data/wallpapers, plus a gallery of earlier uploads
  function wallpaperEditor() {
    const box = h('div', { class: 'wp-ed' });
    const status = h('span', { class: 'help wp-status' });
    const gallery = h('div', { class: 'wp-gallery' });
    const fmtMB = (n) => (n / 1024 / 1024).toFixed(n < 10 * 1024 * 1024 ? 1 : 0) + ' MB';
    const use = (file, kind) => {
      const wasOn = wallpaperOn();
      st.wallpaper.file = file; st.wallpaper.kind = kind;
      settingsChanged();
      drawGallery();
      if (file && !wasOn && st.messages.style === 'auto') toast('Background set', 'Messages switched to liquid glass. Change it under Message style.', 'ok');
    };
    function upload(f) {
      if (!f) return;
      if (!/^(image|video)\//.test(f.type) && !/\.(png|jpe?g|gif|webp|bmp|svg|avif|mp4|webm|mov)$/i.test(f.name)) return toast('Not an image or video', f.name, 'err');
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `/api/wallpaper?name=${encodeURIComponent(f.name)}`);
      xhr.setRequestHeader('x-hangar-token', TOKEN);
      xhr.setRequestHeader('content-type', 'application/octet-stream');
      xhr.upload.onprogress = (e) => { if (e.lengthComputable) status.textContent = `Uploading ${f.name}… ${Math.round((e.loaded / e.total) * 100)}%`; };
      xhr.onload = () => {
        let j = {};
        try { j = JSON.parse(xhr.responseText); } catch { /* not json */ }
        if (xhr.status === 401) return location.reload();
        status.textContent = '';
        if (xhr.status !== 200) return toast('Background not uploaded', j.error || xhr.statusText, 'err');
        use(j.file, j.kind);
      };
      xhr.onerror = () => { status.textContent = ''; toast('Background not uploaded', 'The connection to Hangar failed.', 'err'); };
      status.textContent = `Uploading ${f.name}… (${fmtMB(f.size)})`;
      xhr.send(f);
    }
    function pick() {
      const fi = $('#file-input');
      fi.accept = 'image/*,.gif,video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov'; fi.value = '';
      fi.onchange = () => upload(fi.files[0]);
      fi.click();
    }
    function thumb(x) {
      const src = wallUrl(x.file);
      return x.kind === 'video'
        ? h('video', { src: src + '#t=0.5', muted: true, preload: 'metadata', playsinline: true })
        : h('img', { src, alt: '', loading: 'lazy' });
    }
    async function drawGallery() {
      let files = [];
      try { files = (await api('GET', '/api/wallpapers')).files || []; } catch { /* offline */ }
      gallery.textContent = '';
      gallery.append(h('button', { class: 'wp-item none' + (wallpaperOn() ? '' : ' on'), title: 'No background', onclick: () => use('', '') }, h('span', null, 'None')));
      for (const x of files) {
        const badge = x.kind === 'video' ? 'VIDEO' : /\.gif$/i.test(x.file) ? 'GIF' : '';
        gallery.append(h('button', { class: 'wp-item' + (st.wallpaper.file === x.file ? ' on' : ''), title: `${x.file.replace(/^[a-z0-9]+-/, '')} · ${fmtMB(x.size)}`, onclick: () => use(x.file, x.kind) },
          thumb(x), badge ? h('i', { class: 'wp-badge' }, badge) : null,
          h('span', { class: 'del', title: 'Delete this file', onclick: async (e) => {
            e.stopPropagation();
            try { await api('DELETE', `/api/wallpaper?file=${encodeURIComponent(x.file)}`); } catch (err) { return toast('Not deleted', err.message, 'err'); }
            if (st.wallpaper.file === x.file) use('', ''); else drawGallery();
          } }, '×')));
      }
    }
    box.addEventListener('dragover', (e) => { e.preventDefault(); box.classList.add('drop'); });
    box.addEventListener('dragleave', () => box.classList.remove('drop'));
    box.addEventListener('drop', (e) => { e.preventDefault(); box.classList.remove('drop'); upload(e.dataTransfer.files[0]); });
    box.append(h('div', { class: 'io-btns' }, h('button', { class: 'btn small primary', onclick: pick }, 'Choose image, GIF or video…'), status), gallery);
    drawGallery();
    return box;
  }
  function dirColorsEditor() {
    const box = h('div', { class: 'list-ed' });
    const draw = () => {
      box.textContent = '';
      st.tabs.directoryColors.forEach((d, i) => {
        const p = h('input', { type: 'text', class: 'grow', value: d.path, spellcheck: 'false', placeholder: 'C:\\dev\\project' });
        p.addEventListener('change', () => { d.path = p.value.trim(); settingsChanged(); });
        const c = h('input', { type: 'color', value: toHex6(d.color || '#7c6cff') });
        c.addEventListener('input', () => { d.color = c.value; settingsChanged(); });
        box.append(h('div', { class: 'r' }, p, c, h('button', { class: 'icon-btn', html: icon('x'), title: 'Remove', onclick: () => { st.tabs.directoryColors.splice(i, 1); settingsChanged(); draw(); } })));
      });
      box.append(h('div', null, h('button', { class: 'btn small', onclick: () => { st.tabs.directoryColors.push({ path: activeTab().cwd, color: SWATCHES[st.tabs.directoryColors.length % SWATCHES.length] }); settingsChanged(); draw(); } }, '+ Add directory (starts with current tab)')));
    };
    draw();
    return box;
  }
  function chipsEditor() {
    const box = h('div', { class: 'list-ed' });
    const draw = () => {
      box.textContent = '';
      st.agent.chips.forEach((c, i) => {
        const sel = h('select', null, [['left', 'left'], ['right', 'right'], ['hidden', 'hidden']].map(([v, l]) => h('option', { value: v }, l)));
        sel.value = c.side;
        sel.addEventListener('change', () => { c.side = sel.value; settingsChanged(); });
        const move = (d) => { const j = i + d; if (j < 0 || j >= st.agent.chips.length) return; const arr = st.agent.chips; [arr[i], arr[j]] = [arr[j], arr[i]]; settingsChanged(); draw(); };
        box.append(h('div', { class: 'r' }, h('span', { class: 'grow' }, CHIPS[c.id]), sel,
          h('button', { class: 'icon-btn', html: icon('up'), title: 'Move up', onclick: () => move(-1) }),
          h('button', { class: 'icon-btn', html: icon('down'), title: 'Move down', onclick: () => move(1) })));
      });
    };
    draw();
    return box;
  }

  // Warp theme YAML (accent / background / foreground / details / terminal_colors) ⇄ Hangar theme
  function parseYaml(src) {
    const root = {}, stack = [{ indent: -1, obj: root }];
    for (const raw of src.split(/\r?\n/)) {
      if (!raw.trim() || /^\s*#/.test(raw)) continue;
      const indent = raw.match(/^ */)[0].length;
      const m = raw.trim().match(/^["']?([\w\- ]+?)["']?\s*:\s*(.*)$/);
      if (!m) continue;
      while (stack.length > 1 && indent <= stack[stack.length - 1].indent) stack.pop();
      const parent = stack[stack.length - 1].obj;
      const v = m[2].trim();
      if (v === '' || v === '|' || v === '>') { parent[m[1]] = {}; stack.push({ indent, obj: parent[m[1]] }); continue; }
      const q = v.match(/^(['"])(.*?)\1/);
      parent[m[1]] = q ? q[2] : v.replace(/\s+#.*$/, '');
    }
    return root;
  }
  function warpToTheme(y) {
    const bg = y.background || '#000000', fg = y.foreground || '#ffffff', acc = y.accent || '#7c6cff';
    const dark = luminance(bg) < 0.4;
    const n = (y.terminal_colors && y.terminal_colors.normal) || {}, b = (y.terminal_colors && y.terminal_colors.bright) || {};
    const ansi = ANSI_NAMES.map((k, i) => n[k] || THEMES.Midnight.ansi[i]).concat(ANSI_NAMES.map((k, i) => b[k] || n[k] || THEMES.Midnight.ansi[i + 8]));
    return {
      background: bg, foreground: fg, accent: acc, accentFg: luminance(acc) > 0.45 ? '#111111' : '#ffffff',
      surface: mix(bg, fg, dark ? 0.04 : 0.02), surface2: mix(bg, fg, dark ? 0.08 : 0.05), border: mix(bg, fg, dark ? 0.14 : 0.12),
      muted: mix(fg, bg, 0.42), success: n.green || '#3fb950', error: n.red || '#f85149', warning: n.yellow || '#d29922', info: n.blue || '#58a6ff',
      ansi, backgroundImage: '', panelOpacity: 1, blur: 0,
    };
  }
  function themeToWarp(name) {
    const t = st.theme, q = (c) => `'${toHex6(c)}'`;
    const row = (off) => ANSI_NAMES.map((k, i) => `    ${k}: ${q(t.ansi[i + off])}`).join('\n');
    return `# Exported from Hangar — drop into Warp's themes folder\nname: ${name || 'Hangar'}\naccent: ${q(t.accent)}\nbackground: ${q(t.background)}\nforeground: ${q(t.foreground)}\ndetails: ${luminance(t.background) < 0.4 ? 'darker' : 'lighter'}\nterminal_colors:\n  normal:\n${row(0)}\n  bright:\n${row(8)}\n`;
  }
  function download(name, text, type = 'application/json') {
    const a = h('a', { href: URL.createObjectURL(new Blob([text], { type })), download: name });
    document.body.append(a); a.click(); a.remove();
  }
  function pickFile(accept, cb) {
    const fi = $('#file-input');
    fi.accept = accept; fi.value = '';
    fi.onchange = async () => { const f = fi.files[0]; if (f) cb(await f.text(), f.name); };
    fi.click();
  }
  function replaceSettings(next, msg) {
    st = normalizeSettings(next);
    settingsChanged();
    renderSettings();
    if (msg) toast(msg, '', 'ok');
  }
  function ioPanel() {
    const raw = h('textarea', { spellcheck: 'false', style: { display: 'none', minHeight: '260px' } });
    const applyRaw = h('button', { class: 'btn small primary', style: { display: 'none' }, onclick: () => {
      try { replaceSettings(JSON.parse(raw.value), 'Settings applied'); } catch (e) { toast('Invalid JSON', e.message, 'err'); }
    } }, 'Apply JSON');
    const b = (label, fn, cls) => h('button', { class: 'btn small' + (cls ? ' ' + cls : ''), onclick: fn }, label);
    return h('div', { class: 's-field wide', dataset: { label: 'import export json yaml warp reset' } },
      h('div', { class: 'io-btns' },
        b('Export settings (.json)', () => download('hangar-settings.json', JSON.stringify(st, null, 2))),
        b('Import settings…', () => pickFile('.json,application/json', (txt) => { try { replaceSettings(JSON.parse(txt), 'Settings imported'); } catch (e) { toast('Not a settings file', e.message, 'err'); } })),
        b('Import Warp theme (.yaml)…', () => pickFile('.yaml,.yml', (txt, fname) => {
          const y = parseYaml(txt);
          if (!y.background && !y.accent) return toast('Not a Warp theme', 'Expected accent / background / foreground keys.', 'err');
          const name = y.name || fname.replace(/\.ya?ml$/i, '');
          st.customThemes[name] = warpToTheme(y);
          applyPreset(name, st.customThemes[name]);
          toast('Theme imported', name, 'ok');
        })),
        b('Export theme for Warp (.yaml)', () => download(`${(st.themeName || 'hangar').toLowerCase().replace(/\W+/g, '_')}.yaml`, themeToWarp(st.themeName), 'text/yaml')),
        b('Edit raw JSON', () => { raw.value = JSON.stringify(st, null, 2); raw.style.display = applyRaw.style.display = raw.style.display === 'none' ? '' : 'none'; }),
        b('Reset theme', () => applyPreset('Midnight', THEMES.Midnight)),
        b('Reset everything', () => { if (confirm('Reset every setting to its default?')) replaceSettings({}, 'Settings reset'); }, 'danger')),
      raw, applyRaw);
  }

  function renderSettings() {
    const nav = $('#settings-nav'), body = $('#settings-body');
    const scroll = body.scrollTop;
    nav.textContent = ''; body.textContent = '';
    for (const sec of FORM) {
      nav.append(h('button', { onclick: () => $('#s-' + sec.id).scrollIntoView({ behavior: 'smooth', block: 'start' }) }, sec.title));
      body.append(h('section', { class: 's-section', id: 's-' + sec.id }, h('h3', null, sec.title), sec.fields.map(renderField)));
    }
    body.scrollTop = scroll;
    filterSettings();
  }
  function filterSettings() {
    const q = $('#settings-search').value.trim().toLowerCase();
    for (const sec of $$('.s-section')) {
      let any = false;
      const secMatch = q && $('h3', sec).textContent.toLowerCase().includes(q);
      for (const f of $$('.s-field', sec)) {
        const show = !q || secMatch || (f.dataset.label || '').includes(q);
        f.classList.toggle('hidden-by-search', !show);
        any = any || show;
      }
      sec.classList.toggle('hidden-by-search', !any);
    }
  }
  $('#settings-search').addEventListener('input', filterSettings);
  $('#close-settings').innerHTML = icon('x');
  $('#close-settings').addEventListener('click', closeSettings);
  $('#open-settings').addEventListener('click', openSettings);

  // ================================================================ file viewer (browse / preview / edit)
  const Files = (() => {
    const panel = $('#files'), pathInput = $('#files-path'), list = $('#files-list'), preview = $('#files-preview');
    let dir = '', parentDir = null, entries = [], current = null, dirty = false, showHidden = false;
    let gitMode = false, gitCwd = '', gitInfo = null, draftMsg = '';
    const includeImgs = new Set();   // images are left out of commits unless ticked here (repo-relative paths)
    const IMG_FILE = /\.(png|jpe?g|gif|webp|avif|bmp|ico|svg|tiff?|heic|psd)$/i;   // same list as IMG_EXTS in server.js

    const rawUrl = (p, extra = '') => `/api/fs/raw?path=${encodeURIComponent(p)}&token=${TOKEN}${extra}`;
    function confirmDiscard() {
      if (dirty && !confirm(`Discard unsaved changes in ${current ? current.name : 'this file'}?`)) return false;
      dirty = false;
      return true;
    }
    function highlightSelected(p) { for (const row of $$('.f-row', list)) row.classList.toggle('sel', row.dataset.path === p); }
    function showEmpty() { current = null; preview.textContent = ''; preview.append(h('div', { class: 'files-empty' }, 'Select a file to preview')); }
    function renderList() {
      list.textContent = '';
      const rows = entries.filter((e) => showHidden || !e.name.startsWith('.'));
      if (!rows.length) { list.append(h('div', { class: 'files-empty small' }, 'Empty folder — drop files here or paste them with Ctrl+V')); return; }
      for (const e of rows) {
        list.append(h('div', { class: 'f-row' + (current && current.path === e.path ? ' sel' : ''), dataset: { path: e.path, dir: e.dir ? '1' : '' }, draggable: 'true',
          onclick: () => (e.dir ? navigate(e.path) : openFile(e)),
          ondragstart: (ev) => { ev.dataTransfer.setData(PATH_TYPE, e.path); ev.dataTransfer.setData('text/plain', e.path); ev.dataTransfer.effectAllowed = 'copy'; } },
          h('span', { class: 'f-ico', html: icon(e.dir ? 'folder' : 'file') }),
          h('span', { class: 'f-name', title: e.name }, e.name),
          !e.dir ? h('span', { class: 'f-size' }, fmtSize(e.size)) : null));
      }
    }
    // ---- Git mode: the repo's pending changes (click → diff vs HEAD highlighted) + commit with an AI-written message
    function setGitMode(on) { gitMode = on; $('#files-git').classList.toggle('on', on); }
    async function openGit(cwd) {
      if (!confirmDiscard()) return;
      panel.hidden = false; panel.focus();
      gitCwd = cwd || gitCwd || dir || activeTab().cwd;
      setGitMode(true);
      showEmpty();
      await loadGit();
    }
    async function loadGit() {
      let r;
      try { r = await api('GET', `/api/git/status?cwd=${encodeURIComponent(gitCwd)}`); } catch (e) { return toast('git status failed', e.message, 'err'); }
      if (!gitMode) return;
      gitInfo = r;
      list.textContent = '';
      if (!r.root) { pathInput.value = gitCwd; list.append(h('div', { class: 'files-empty small' }, 'Not a git repository')); return; }
      pathInput.value = r.root;
      const ab = (r.ahead ? ` <span class="g-ab" title="commits to push">↑${r.ahead}</span>` : '') + (r.behind ? ` <span class="g-ab" title="commits to pull">↓${r.behind}</span>` : '');
      list.append(h('div', { class: 'g-head' },
        h('div', { class: 'g-branch', title: r.upstream ? 'tracking ' + r.upstream : 'no upstream yet', html: icon('branch') + esc(r.branch || '(detached)') + ab }),
        r.last ? h('div', { class: 'g-last', title: 'Last commit' }, r.last) : null));
      if (!r.files.length) { list.append(h('div', { class: 'files-empty small' }, 'No changes — working tree clean')); return; }
      for (const p of [...includeImgs]) if (!r.files.some((f) => f.path === p)) includeImgs.delete(p);
      let leftOut = 0;
      for (const f of r.files) {
        const img = IMG_FILE.test(f.path), inc = img && includeImgs.has(f.path);
        if (img && !inc) leftOut++;
        list.append(h('div', { class: 'f-row g-row' + (img && !inc ? ' g-out' : ''), dataset: { path: f.abs }, title: f.path + (img && !inc ? '\nImage: left out of the commit' : ''), onclick: () => openChanged(f) },
          h('span', { class: 'g-st s-' + ({ '?': 'new', A: 'new', D: 'del', R: 'ren' }[f.status] || 'mod') }, f.status === '?' ? 'U' : f.status),
          h('span', { class: 'f-name' }, base(f.path)),
          img ? h('label', { class: 'g-inc', title: 'Images are left out of commits. Tick to include this one.', onclick: (e) => e.stopPropagation() },
            h('input', { type: 'checkbox', checked: inc, onchange: (e) => { if (e.target.checked) includeImgs.add(f.path); else includeImgs.delete(f.path); loadGit(); } }), 'include')
            : h('span', { class: 'g-num' }, f.added ? h('span', { class: 'ac-add' }, '+' + f.added) : null, f.removed ? h('span', { class: 'ac-rem' }, '−' + f.removed) : null)));
      }
      if (leftOut) list.append(h('div', { class: 'g-note' }, `${leftOut} image${leftOut === 1 ? '' : 's'} left out of the commit`));
      const msg = h('textarea', { class: 'g-msg', rows: 3, placeholder: 'Commit message', spellcheck: 'false', value: draftMsg, oninput: () => { draftMsg = msg.value; } });
      const btn = (label, fn, cls) => h('button', { class: 'btn small' + (cls ? ' ' + cls : ''), onclick: fn }, label);
      const gen = btn('✨ Write it', async () => {
        gen.disabled = true; gen.textContent = 'Writing…';
        try { msg.value = draftMsg = (await api('POST', '/api/git/message', { cwd: r.root, includeImages: [...includeImgs] })).message; } catch (e) { toast('Could not write a message', e.message, 'err'); }
        gen.disabled = false; gen.textContent = '✨ Write it';
      });
      const commit = async (push) => {
        if (!msg.value.trim()) { msg.focus(); return toast('Write a commit message first', 'or let Claude write it with ✨', 'warn'); }
        try {
          const c = await api('POST', '/api/git/commit', { cwd: r.root, message: msg.value, push, includeImages: [...includeImgs] });
          draftMsg = '';
          includeImgs.clear();
          toast('Committed', c.output, 'ok');
          if (c.pushed) c.pushed.ok ? toast('Pushed', c.pushed.output.split('\n').pop(), 'ok') : toast('Push failed', c.pushed.output, 'err');
        } catch (e) { toast('Commit failed', e.message, 'err'); }
        loadGit();
      };
      list.append(h('div', { class: 'g-commit' }, msg, h('div', { class: 'g-actions' }, gen, btn('Commit', () => commit(false), 'primary'), btn('Commit & push', () => commit(true)))));
      if (current) highlightSelected(current.path);
    }
    async function openChanged(f) {
      if (f.status === 'D') { current = null; highlightSelected(f.abs); preview.textContent = ''; preview.append(h('div', { class: 'files-empty' }, `${f.path} was deleted`)); return; }
      const s = await statPath(f.abs, null, true);
      if (!s.exists) return toast('File not found', f.path, 'warn');
      openFile({ name: base(f.abs), path: s.path, kind: s.kind, size: s.size }, { base: 'HEAD' });
    }

    async function navigate(p, cwd, changes) {
      if (!confirmDiscard()) return;
      try {
        const r = await api('GET', `/api/fs/list?dir=${encodeURIComponent(p)}&cwd=${encodeURIComponent(cwd || dir || '')}`);
        setGitMode(false);
        dir = r.dir; parentDir = r.parent; entries = r.entries;
        pathInput.value = dir;
        current = null;
        renderList();
        if (r.selectFile) { const e = entries.find((x) => x.path === r.selectFile); if (e) return openFile(e, changes); }
        showEmpty();
      } catch (e) { toast('Could not open folder', e.message, 'err'); }
    }
    function fallbackPanel(msg) { return h('div', { class: 'fp-empty' }, h('p', null, msg)); }
    async function renderOffice(entry, body) {
      if (!S.info.hasOffice) { body.append(fallbackPanel('No inline preview for this format — use Open or Show in folder.')); return; }
      body.append(h('div', { class: 'fp-loading' }, 'Converting to PDF…'));
      const url = rawUrl(entry.path, '&as=pdf');
      try {
        const r = await fetch(url);
        body.textContent = '';
        if (!r.ok) return body.append(fallbackPanel('Conversion failed — use Open or Show in folder.'));
        body.append(h('iframe', { class: 'fp-frame', src: url }));
      } catch (e) { body.textContent = ''; body.append(fallbackPanel('Conversion failed: ' + e.message)); }
    }
    // Textarea editor with line numbers and a layer under it that highlights the lines Claude changed.
    // Changes are located by content (the Edit's new text), so they keep following the file while you type.
    // With a known language the textarea text is transparent and a colored copy (pre.ce-code) sits under it.
    function codeEditor(text, changes, lang) {
      const nums = h('pre', { class: 'ce-nums' }), gmarks = h('div', { class: 'ce-layer' }), hl = h('div', { class: 'ce-layer' });
      const code = lang && text.length < 300000 ? h('pre', { class: 'ce-code', 'aria-hidden': 'true' }) : null;
      const ta = h('textarea', { class: 'fp-editor' + (code ? ' colored' : ''), spellcheck: 'false', wrap: 'off', value: text });
      const el = h('div', { class: 'code-ed' }, h('div', { class: 'ce-gutter' }, nums, gmarks), h('div', { class: 'ce-main' }, hl, code, ta));
      let raf = 0;
      const colorize = () => { raf = 0; code.innerHTML = (highlightCode(ta.value, lang) ?? esc(ta.value)) + '\n'; sync(); };
      if (code) ta.addEventListener('input', () => { if (!raf) raf = requestAnimationFrame(colorize); });
      let ranges = [], dels = [], starts = [0], lines = 0;
      const metrics = () => { const cs = getComputedStyle(ta); return { lh: parseFloat(cs.lineHeight) || 20, pad: parseFloat(cs.paddingTop) || 0 }; };
      function lineOf(off) { let lo = 0, hi = starts.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (starts[m] <= off) lo = m; else hi = m - 1; } return lo; }
      function compute() {
        const t = ta.value;
        starts = [0];
        for (let i = t.indexOf('\n'); i !== -1; i = t.indexOf('\n', i + 1)) starts.push(i + 1);
        ranges = []; dels = [];
        if (!changes) return;
        if (changes.lines) { ranges = changes.lines.map((r) => [...r]); dels = changes.dels || []; return; }   // from git (fixed positions)
        if (changes.all) { ranges = [[0, starts.length - 1]]; return; }
        for (const e of changes.edits) {
          for (let from = 0, n = 0; e.s && n < 100; n++) {
            const i = t.indexOf(e.s, from);
            if (i < 0) break;
            const l0 = lineOf(i);
            if (e.rel.length) for (const r of e.rel) ranges.push([l0 + r, l0 + r]); else dels.push(l0);
            if (!e.all) break;
            from = i + e.s.length;
          }
        }
        ranges.sort((a, b) => a[0] - b[0]);
        ranges = ranges.reduce((acc, r) => { const p = acc[acc.length - 1]; if (p && r[0] <= p[1] + 1) p[1] = Math.max(p[1], r[1]); else acc.push([...r]); return acc; }, []);
      }
      function paint() {
        if (starts.length !== lines) { lines = starts.length; nums.textContent = Array.from({ length: lines }, (_, i) => i + 1).join('\n'); }
        const { lh, pad } = metrics(), bar = (cls, a, z) => h('div', { class: cls, style: { top: pad + a * lh + 'px', height: (z - a + 1) * lh + 'px' } });
        hl.textContent = ''; gmarks.textContent = '';
        for (const [a, z] of ranges) { hl.append(bar('ce-mark', a, z)); gmarks.append(bar('ce-gmark', a, z)); }
        for (const a of dels) gmarks.append(h('div', { class: 'ce-gdel', style: { top: pad + a * lh - 4 + 'px' } }));
        sync();
      }
      function sync() {
        const y = `translateY(${-ta.scrollTop}px)`;
        hl.style.transform = gmarks.style.transform = nums.style.transform = y;
        if (code) code.style.transform = `translate(${-ta.scrollLeft}px, ${-ta.scrollTop}px)`;
      }
      function go(k) {
        const r = ranges[k];
        if (!r) return;
        const { lh, pad } = metrics();
        ta.focus({ preventScroll: true });
        ta.setSelectionRange(starts[r[0]], starts[r[0]]);
        ta.scrollTop = Math.max(0, pad + r[0] * lh - ta.clientHeight / 3);
        sync();
      }
      ta.addEventListener('scroll', sync);
      ta.addEventListener('input', debounce(() => { compute(); paint(); }, 100));
      compute();
      if (code) colorize();
      return { el, ta, count: () => ranges.length + dels.length, hunks: () => ranges.length, paint, go,
        first: () => { paint(); const r = ranges[0] || (dels.length ? [dels[0]] : null); if (r) { ta.scrollTop = Math.max(0, metrics().pad + r[0] * metrics().lh - ta.clientHeight / 3); sync(); } } };
    }
    async function renderText(entry, body, actions, changes) {
      body.append(h('div', { class: 'fp-loading' }, 'Loading…'));
      let r;
      try { r = await api('GET', `/api/fs/read?path=${encodeURIComponent(entry.path)}`); }
      catch (e) { body.textContent = ''; return body.append(fallbackPanel('Could not read file: ' + e.message)); }
      body.textContent = '';
      if (r.kind === 'binary' || r.text == null) return body.append(fallbackPanel(r.truncated ? 'File too large to preview here.' : 'This file can’t be shown as text.'));
      // { base: rev } → the lines that differ from that revision (HEAD, or a turn's checkpoint), computed by git
      if (changes && changes.base) {
        try { changes = await api('GET', `/api/git/lines?path=${encodeURIComponent(entry.path)}&base=${encodeURIComponent(changes.base)}`); } catch { changes = null; }
      }
      const isMd = /\.(md|markdown)$/i.test(entry.name);
      let mode = isMd && !changes ? 'preview' : 'edit';
      const ed = codeEditor(r.text, changes, langOf(entry.path)), ta = ed.ta;
      const mdView = h('div', { class: 'fp-md', html: md(r.text) });
      const pane = h('div', { class: 'fp-textwrap' });
      const status = h('span', { class: 'fp-status' });
      const saveBtn = h('button', { class: 'btn small primary', disabled: true }, 'Save');
      const render = () => { pane.textContent = ''; pane.append(mode === 'edit' || !isMd ? ed.el : mdView); if (mode === 'edit' || !isMd) requestAnimationFrame(ed.first); };
      if (changes && ed.count()) {
        let k = -1;
        const label = h('span', { class: 'fp-changes' }, `${ed.count()} change${ed.count() === 1 ? '' : 's'}`);
        const step = (d) => { const n = ed.hunks(); if (!n) return; k = (k + d + n) % n; ed.go(k); label.textContent = `${k + 1} / ${n}`; };
        actions.append(label,
          h('button', { class: 'icon-btn', title: 'Previous change', html: icon('up'), onclick: () => step(-1) }),
          h('button', { class: 'icon-btn', title: 'Next change', html: icon('down'), onclick: () => step(1) }));
      }
      ta.addEventListener('input', () => { dirty = true; saveBtn.disabled = false; status.textContent = 'Unsaved changes'; });
      ta.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); doSave(); } });
      async function doSave() {
        if (saveBtn.disabled) return;
        try {
          await api('PUT', '/api/fs/write', { path: entry.path, text: ta.value });
          dirty = false; saveBtn.disabled = true; status.textContent = 'Saved';
          if (gitMode) loadGit();
          setTimeout(() => { if (!dirty) status.textContent = ''; }, 1500);
        } catch (e) { toast('Could not save', e.message, 'err'); }
      }
      saveBtn.addEventListener('click', doSave);
      if (isMd) actions.append(h('button', { class: 'btn small', onclick: () => { mode = mode === 'edit' ? 'preview' : 'edit'; render(); } }, 'Edit / preview'));
      actions.append(status, saveBtn);
      body.append(pane);
      render();
    }
    async function openFile(entry, changes) {
      if (!confirmDiscard()) return;
      current = entry;
      highlightSelected(entry.path);
      preview.textContent = '';
      const actions = h('div', { class: 'fp-actions' });
      const body = h('div', { class: 'fp-body' });
      preview.append(h('div', { class: 'fp-head' }, h('span', { class: 'fp-name', title: entry.path }, entry.name), h('span', { class: 'fp-size' }, fmtSize(entry.size)), actions), body);
      // an SVG with only a viewBox has no intrinsic size and collapses to 0×0 in the shrink-to-fit box: .vec gives it the pane
      if (entry.kind === 'image') body.append(h('div', { class: /\.svg$/i.test(entry.path) ? 'fp-media vec' : 'fp-media' }, h('img', { src: rawUrl(entry.path) })));
      else if (entry.kind === 'pdf') body.append(h('iframe', { class: 'fp-frame', src: rawUrl(entry.path) }));
      else if (entry.kind === 'audio') body.append(h('div', { class: 'fp-media' }, h('audio', { controls: true, src: rawUrl(entry.path) })));
      else if (entry.kind === 'video') body.append(h('div', { class: 'fp-media' }, h('video', { controls: true, src: rawUrl(entry.path) })));
      else if (entry.kind === 'office') await renderOffice(entry, body);
      else await renderText(entry, body, actions, changes);
      actions.append(
        h('button', { class: 'btn small', onclick: () => api('POST', '/api/fs/open', { path: entry.path }).catch((e) => toast('Could not open', e.message, 'err')) }, 'Open'),
        h('button', { class: 'btn small', onclick: () => api('POST', '/api/fs/reveal', { path: entry.path }).catch((e) => toast('Could not reveal', e.message, 'err')) }, 'Show in folder'));
    }
    // Focus moves into the drawer so Esc closes it instead of reaching the shell (Esc interrupts `claude`).
    // changes (highlighted): { all } | { base: git rev } | { lines, dels } | { edits: [{ s: new text, all: replace_all, rel: changed line offsets in s }] }
    function open(p, cwd, changes) { panel.hidden = false; panel.focus(); navigate(p, cwd, changes); }
    function close() {
      if (!confirmDiscard()) return;
      panel.hidden = true;
      if (activeTab().mode === 'agent') input.focus(); else Terms.active()?.term.focus();
    }

    // ---- Bring files in: drop them (folders too) from Explorer onto the viewer, or Ctrl+V what was copied there.
    // Nothing is overwritten: the server picks "name (2).ext". Dropping onto a folder row puts them in that folder.
    async function refreshList() {
      if (gitMode || !dir) return;
      try { const r = await api('GET', `/api/fs/list?dir=${encodeURIComponent(dir)}`); if (r.dir === dir) { entries = r.entries; renderList(); } } catch { /* folder gone */ }
    }
    function report(target, n, failed) {
      if (n) toast(`${n} item${n === 1 ? '' : 's'} copied`, 'to ' + shortPath(target), 'ok');
      if (failed.length) toast('Some could not be copied', failed.slice(0, 5).join('\n') + (failed.length > 5 ? `\n…and ${failed.length - 5} more` : ''), 'warn');
    }
    async function bringIn(target, items) {   // items: FileSystemEntry (drop) | File (a pasted screenshot)
      const files = [], dirs = [], failed = [];
      for (const it of items) {
        if (it instanceof File) { files.push({ rel: it.name, file: it }); continue; }
        if (it.isFile) { await walkEntry(it, it.name, files, dirs); continue; }
        try {
          const d = await api('POST', '/api/fs/mkdir', { dir: target, name: it.name });   // a free name: never merges into an existing folder
          const sub = [];
          await walkEntry(it, d.name, files, sub);
          dirs.push(...sub.slice(1));
        } catch (err) { failed.push(`${it.name}: ${err.message}`); }
      }
      if (files.length > 5) toast('Copying…', `${files.length} files to ${shortPath(target)}`);
      let n = 0;
      for (const f of files) { try { await sendFile(target, f.rel, f.file); n++; } catch (err) { failed.push(`${f.rel}: ${err.message}`); } }
      for (const d of dirs) if (!files.some((f) => f.rel.startsWith(d + '/'))) await api('POST', '/api/fs/mkdir', { dir: target, name: d, exact: true }).catch(() => {});
      report(target, n, failed);
      refreshList();
    }
    const canDrop = (e) => e.dataTransfer.types.includes('Files') && !gitMode && !!dir;
    const endDrag = () => { panel.classList.remove('drop'); for (const r of $$('.f-row.drop-into', list)) r.classList.remove('drop-into'); };
    panel.addEventListener('dragover', (e) => {
      if (!canDrop(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      panel.classList.add('drop');
      const row = e.target.closest && e.target.closest('.f-row');
      for (const r of $$('.f-row.drop-into', list)) if (r !== row) r.classList.remove('drop-into');
      if (row && row.dataset.dir) row.classList.add('drop-into');
    });
    panel.addEventListener('dragleave', (e) => { if (!panel.contains(e.relatedTarget)) endDrag(); });
    panel.addEventListener('drop', (e) => {
      if (!canDrop(e)) return;
      e.preventDefault();
      const row = e.target.closest && e.target.closest('.f-row'), target = row && row.dataset.dir ? row.dataset.path : dir;
      endDrag();
      // entries must be taken during the event; reading them afterwards is fine
      const items = [...e.dataTransfer.items].filter((i) => i.kind === 'file').map((i) => i.webkitGetAsEntry() || i.getAsFile()).filter(Boolean);
      bringIn(target, items);
    });
    panel.addEventListener('paste', async (e) => {
      if (e.target.closest('input, textarea, select, [contenteditable]') || gitMode || !dir) return;
      e.preventDefault();
      const target = dir, imgs = [...e.clipboardData.files];   // a screenshot isn't a file in Explorer: upload its bytes instead
      try {
        const r = await api('POST', '/api/fs/paste', { dir: target });
        if (r.files.length || r.failed.length) { report(target, r.files.length, r.failed); return refreshList(); }
      } catch (err) { if (!imgs.length) return toast('Could not paste', err.message, 'err'); }
      if (imgs.length) bringIn(target, imgs);
      else toast('Nothing to paste', 'Copy files or folders in Explorer (Ctrl+C), then Ctrl+V here.', 'warn');
    });

    $('#files-up').innerHTML = icon('up');
    $('#files-up').addEventListener('click', () => (gitMode ? gitInfo && gitInfo.root && navigate(gitInfo.root) : parentDir && navigate(parentDir)));
    $('#files-refresh').innerHTML = icon('rerun');
    $('#files-refresh').addEventListener('click', () => (gitMode ? loadGit() : dir && navigate(dir)));
    $('#files-git').innerHTML = icon('branch');
    $('#files-git').addEventListener('click', () => (gitMode ? navigate((gitInfo && gitInfo.root) || dir || activeTab().cwd) : openGit(dir || activeTab().cwd)));
    $('#files-hidden').innerHTML = icon('eye');
    $('#files-hidden').addEventListener('click', () => { showHidden = !showHidden; $('#files-hidden').classList.toggle('on', showHidden); renderList(); });
    $('#close-files').innerHTML = icon('x');
    $('#close-files').addEventListener('click', close);
    pathInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); navigate(pathInput.value.trim()); } });

    return { open, openGit, close, isDirty: () => dirty };
  })();
  $('#files-btn').innerHTML = icon('folder');
  $('#files-btn').addEventListener('click', () => Files.open(activeTab().cwd));

  // ================================================================ panel chrome
  $('#new-tab').innerHTML = icon('plus');
  $('#new-tab').addEventListener('click', () => newTab());
  $('#new-tab').addEventListener('contextmenu', (e) => { e.preventDefault(); shellMenu(e.clientX, e.clientY); });
  $('#toggle-panel').innerHTML = icon('sidebar');
  $('#toggle-panel').addEventListener('click', togglePanel);
  $('#view-toggle').addEventListener('click', () => { st.tabs.viewMode = st.tabs.viewMode === 'compact' ? 'expanded' : 'compact'; settingsChanged(); });
  $('#clear-btn').addEventListener('click', clearActive);
  $$('[data-icon]').forEach((el) => { el.innerHTML = icon(el.dataset.icon); });
  $('#tab-search').addEventListener('input', (e) => { ui.search = e.target.value; renderTabs(); });
  $('#tab-search').addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.target.value = ''; ui.search = ''; renderTabs(); } });
  $('#blocks').addEventListener('scroll', () => {
    const b = $('#blocks');
    ui.stick = b.scrollHeight - b.scrollTop - b.clientHeight < 40;
  });
  $('#tab-list').addEventListener('dblclick', (e) => { if (e.target.id === 'tab-list') newTab(); });

  $('#panel-resizer').addEventListener('mousedown', (e) => {
    e.preventDefault();
    const bar = e.currentTarget, panel = $('#tabs-panel').getBoundingClientRect();
    bar.classList.add('drag');
    const move = (ev) => {
      const w = st.tabs.position === 'right' ? panel.right - ev.clientX : ev.clientX - panel.left;
      st.tabs.width = Math.round(Math.max(180, Math.min(460, w)));
      document.documentElement.style.setProperty('--tabs-w', st.tabs.width + 'px');
    };
    const up = () => { bar.classList.remove('drag'); removeEventListener('mousemove', move); removeEventListener('mouseup', up); settingsChanged({ full: false }); Terms.fitActive(); };
    addEventListener('mousemove', move);
    addEventListener('mouseup', up);
  });

  // ================================================================ Clawds (the tamagotchis from ~/.claude, ported in clawd.js)
  const corralCanvas = h('canvas', { id: 'corral' });
  const corralEmpty = h('div', { class: 'corral-empty' }, 'Your Claude Code sessions live here');
  const corral = new CL.Corral(corralCanvas, { onPick: (info) => (info.tabId ? activate(info.tabId) : newTab({ cwd: info.cwd })) });
  const seedOf = (id) => [...String(id)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 997, 7);
  let clawdTick = 0;
  function corralSessions() {
    const out = [];
    for (const t of S.tabs) {
      if (!isClaudeTab(t)) continue;
      const state = clawdState(t), sess = activeSession(t), name = t.customTitle || (sess && sess.name) || base(t.cwd);
      out.push({ id: 'tab:' + t.id, tabId: t.id, cwd: t.cwd, skin: clawdSkin(t), state, name,
        color: clawdSessionColor(t) || tabColor(t) || st.theme.accent, label: `${name} · ${STATE_WORDS[state] || state} · Hangar tab` });
    }
    if (st.clawd.includeExternal) for (const e of S.external) {
      if (e.host === 'hangar' || (e.tab && findTab(e.tab))) continue;
      const name = e.name || base(e.cwd);
      out.push({ id: 'ext:' + e.sid, cwd: e.cwd, skin: e.skin, state: e.state, color: e.color || '#D77757', name,
        label: `${name} · ${STATE_WORDS[e.state] || e.state} · ${shortPath(e.cwd)} — click to open a tab here` });
    }
    return out;
  }
  function placeCorral() {
    const where = st.clawd.corral;
    $('#corral-tabs').classList.toggle('on', where === 'tabs');
    $('#corral-pane').classList.toggle('on', where === 'pane');
    document.documentElement.style.setProperty('--corral-h', st.clawd.height + 'px');
    if (where !== 'hidden') {
      const wrap = $('#corral-' + where);
      if (corralCanvas.parentNode !== wrap) wrap.append(corralCanvas, corralEmpty);
    }
    refreshCorral();
  }
  function refreshCorral() {
    if (st.clawd.corral === 'hidden') return;
    const list = corralSessions();
    corralEmpty.hidden = list.length > 0;
    corral.update(list, { g: st.clawd.size, interactions: st.clawd.interactions, speed: st.motion.speed });
  }
  function drawClawdCanvas(cv, t) {
    const dpr = window.devicePixelRatio || 1;
    const w = Math.round(cv.clientWidth * dpr), hh = Math.round(cv.clientHeight * dpr);
    if (!w) return;
    if (cv.width !== w || cv.height !== hh) { cv.width = w; cv.height = hh; }
    const ctx = cv.getContext('2d');
    ctx.clearRect(0, 0, w, hh);
    const status = tabStatus(t), claude = isClaudeTab(t);
    let kind = { agent: 'working', running: 'running', attention: 'attention', error: 'error' }[status] || 'idle';
    if (status === 'success') {
      const end = t.mode === 'agent' ? (lastBlock(t) || {}).end : (termOf(t).last || {}).end;
      if (end && Date.now() - end < 4000) kind = 'success';
    }
    if (claude && clawdState(t) === 'waiting') kind = 'waiting';
    const p = CL.pose(kind, st.motion.animations ? clawdTick : 0, seedOf(t.id));
    const g = w / 18, skin = clawdSkin(t);
    const color = skin === 'mimi' ? CL.MIMI_WHITE : clawdSessionColor(t) || tabColor(t) || (claude ? st.theme.accent : st.theme.muted);
    CL.draw(ctx, 0, hh - 10 * g - (p.hop || 0) * 3 * dpr, g, color, { ...p, skin });
  }
  function drawTabClawds() {
    if (st.tabs.indicatorStyle === 'clawd') for (const cv of $$('#tab-list .clawd-ind')) { const t = findTab(cv.dataset.id); if (t) drawClawdCanvas(cv, t); }
    const cli = $('#cli-toolbar .cli-clawd');
    if (cli) { const t = findTab(cli.dataset.id); if (t) drawClawdCanvas(cli, t); }
  }
  let clawdAcc = 0, clawdLast = performance.now();
  setInterval(() => {
    const now = performance.now();
    clawdAcc += (now - clawdLast) * (st.motion.speed || 1);
    clawdLast = now;
    if (document.hidden || clawdAcc < 90) return;
    clawdAcc = Math.min(clawdAcc - 90, 180);
    clawdTick++;
    if (st.clawd.corral !== 'hidden') {
      corral.resize();
      if (st.motion.animations) corral.step();
      corral.render();
    }
    drawTabClawds();
  }, 30);

  // ================================================================ global shortcuts
  document.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    const inTerm = !!(e.target.closest && e.target.closest('.xterm'));
    const inField = !inTerm && e.target.closest && e.target.closest('input, textarea, select, [contenteditable]');
    const t = activeTab();
    if (e.altKey && !e.ctrlKey && !e.metaKey) {
      if (k === 't') { e.preventDefault(); return newTab(); }
      if (k === 'w') { e.preventDefault(); return closeTab(t); }
      if (k === 'v') { e.preventDefault(); st.tabs.viewMode = st.tabs.viewMode === 'compact' ? 'expanded' : 'compact'; return settingsChanged(); }
      if (/^[1-9]$/.test(k)) { e.preventDefault(); const x = orderedTabs()[+k - 1]; if (x) activate(x.id); return; }
      if (k === 'arrowdown' || k === 'arrowup') { e.preventDefault(); return cycleTab(k === 'arrowdown' ? 1 : -1); }
    }
    if ((e.ctrlKey || e.metaKey) && !e.altKey) {
      if (k === ',') { e.preventDefault(); return $('#settings').hidden ? openSettings() : closeSettings(); }
      if (k === 'b' && !e.shiftKey) { e.preventDefault(); return togglePanel(); }
      if (k === 'i' && !e.shiftKey) { e.preventDefault(); return toggleMode(); }
      if (k === 'tab') { e.preventDefault(); return cycleTab(e.shiftKey ? -1 : 1); }
      if (k === 'pagedown' || k === 'pageup') { e.preventDefault(); return cycleTab(k === 'pagedown' ? 1 : -1); }
      if (e.shiftKey && k === 'f') { e.preventDefault(); return openSearch(); }
      if (e.shiftKey && k === 'e') { e.preventDefault(); return $('#files').hidden ? Files.open(t.cwd) : Files.close(); }
      if ((k === 'arrowup' || k === 'arrowdown') && !e.shiftKey) {
        if (t.mode === 'agent' && !(e.target === input && lineCount() > 1)) { e.preventDefault(); return moveSelection(k === 'arrowup' ? -1 : 1); }
        if (t.mode !== 'agent') { e.preventDefault(); const tt = Terms.active(); if (tt) tt.jump(k === 'arrowup' ? -1 : 1); return; }
      }
      if (t.mode === 'agent' && k === 'l' && !e.shiftKey && !inTerm) { e.preventDefault(); return clearActive(); }
    }
    if (inTerm) return;   // the shell owns the rest
    if (k === 'escape') {
      hideMenu();
      if (!$('#settings').hidden) return closeSettings();
      if (!$('#files').hidden) return Files.close();
      if (!$('#search-bar').hidden) return closeSearch();
      if (ui.selected) { selectBlock(null); input.focus(); }
      return;
    }
    if (ui.selected && !inField && !e.ctrlKey && !e.altKey) {
      const [, b] = locate(ui.selected);
      if (b && k === 'enter') { e.preventDefault(); return patchBlock(b, { collapsed: !b.collapsed }); }
      if (b && k === 'delete' && b.status !== 'running') { e.preventDefault(); return api('DELETE', `/api/blocks/${b.id}`).catch(() => {}); }
    }
    // Typing anywhere goes to the terminal or the prompt box.
    if (!inField && !e.ctrlKey && !e.altKey && !e.metaKey && e.key.length === 1 && $('#settings').hidden && $('#files').hidden) {
      if (t.mode === 'agent') input.focus(); else Terms.active()?.term.focus();
    }
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { ui.unread.delete(S.activeTabId); scheduleTabs(); } });

  // ================================================================ live connection
  const handlers = {
    usage: (u) => { S.usage = u; renderUsage(); const t = activeTab(); if (t) renderToolbar(t); },
    commands: () => Cmds.invalidate(),
    tab: (d) => {
      const t = findTab(d.id);
      if (!t) return;
      const modeChanged = t.mode !== d.mode;
      Object.assign(t, d);
      scheduleTabs();
      if (t.id === S.activeTabId) { if (modeChanged) renderPane(true); else { renderPaneHead(t); renderToolbar(t); renderCliToolbar(t); updateModeUI(t); } }
    },
    'tab-added': ({ tab, activate: act }) => {
      if (!findTab(tab.id)) S.tabs.push(tab);
      if (act) activate(tab.id); else scheduleTabs();
    },
    'tab-removed': ({ id, activeTabId }) => {
      S.tabs = S.tabs.filter((t) => t.id !== id);
      ui.unread.delete(id);
      Terms.remove(id);
      if (S.activeTabId === id || !findTab(S.activeTabId)) { if (findTab(activeTabId)) activate(activeTabId); }
      else scheduleTabs();
    },
    'tabs-order': ({ ids }) => { S.tabs.sort((a, b) => ids.indexOf(a.id) - ids.indexOf(b.id)); scheduleTabs(); },
    block: ({ tabId, block }) => {
      const t = findTab(tabId);
      if (!t) return;
      const i = t.blocks.findIndex((b) => b.id === block.id);
      const prev = i >= 0 ? t.blocks[i] : null;
      if (i >= 0) t.blocks[i] = block; else t.blocks.push(block);
      if (ui.hist) ui.hist.dirty = true;
      if (prev && prev.status === 'running' && block.status !== 'running') onAgentFinished(t, block);
      if (tabId === S.activeTabId && t.mode === 'agent') { upsertBlockEl(block, !prev); renderToolbar(t); updateModeUI(t); renderPaneHead(t); }
      scheduleTabs();
    },
    'block-removed': ({ tabId, id }) => {
      const t = findTab(tabId);
      if (!t) return;
      t.blocks = t.blocks.filter((b) => b.id !== id);
      if (tabId === S.activeTabId && t.mode === 'agent') { blockEls.get(id)?.remove(); blockEls.delete(id); if (!t.blocks.length) renderPane(); }
      scheduleTabs();
    },
    'blocks-cleared': ({ tabId, keep }) => {
      const t = findTab(tabId);
      if (!t) return;
      t.blocks = t.blocks.filter((b) => keep.includes(b.id));
      if (tabId === S.activeTabId && t.mode === 'agent') renderPane();
      scheduleTabs();
    },
    'cmd-done': (c) => { const t = findTab(c.tabId); if (t) onCommandFinished(t, c); },
    external: (list) => {
      S.external = list;
      onExternalChanged(list);
      scheduleTabs();
      const t = activeTab();
      if (t) { renderPaneHead(t); renderCliToolbar(t); }
    },
    settings: ({ settings, from }) => {
      if (from === CLIENT_ID) return;
      st = normalizeSettings(settings);
      applySettings(); rerenderAll();
      if (!$('#settings').hidden) renderSettings();
    },
  };

  let wasDown = false;
  function connect() {
    const es = new EventSource('/api/events?token=' + TOKEN);
    for (const [name, fn] of Object.entries(handlers)) es.addEventListener(name, (e) => { try { fn(JSON.parse(e.data)); } catch (err) { console.error(name, err); } });
    es.onopen = () => { if (wasDown) { wasDown = false; loadState(); } };
    es.onerror = () => {
      if (wasDown) return;
      wasDown = true;
      // A restarted server has a new token: a 401 makes api() reload the page.
      setTimeout(() => api('GET', '/api/state').catch(() => {}), 1500);
    };
  }

  async function loadState() {
    const s = await api('GET', '/api/state');
    S.tabs = s.tabs; S.info = s.info; S.external = s.external || []; S.usage = s.usage || null;
    for (const e of S.external) ui.extStates.set(e.sid, e.state);
    S.activeTabId = s.activeTabId;
    const firstRun = !s.settings || !s.settings.version;
    st = normalizeSettings(s.settings);
    applySettings();
    if (firstRun) persistSettings();
    renderTabs();
    renderPane(true);
    autoGrow();
  }

  window.HangarDebug = { S, Terms, get settings() { return st; } };   // for the console / tests
  loadState().then(() => { connect(); wsConnect(); }).catch((e) => {
    document.body.innerHTML = `<div style="padding:40px;font-family:system-ui">Hangar could not load: ${esc(e.message)}</div>`;
  });
})();
