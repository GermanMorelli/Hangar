'use strict';
// Hangar — a Warp-style terminal workspace in one process.
// Terminal: one real shell per tab (node-pty / ConPTY) streamed to xterm.js over a WebSocket. Shell integration
// (OSC 633 marks from shell/hangar.ps1 / hangar.bash) says where each command starts and ends, its exit code and
// the cwd, which drives blocks, tab status, history and notifications.
// Agent view: headless Claude Code (`claude -p --output-format stream-json`) rendered as blocks.
// Persistence: data/state.json (tabs + agent blocks), data/scroll/<tab>.log (scrollback), data/settings.json.

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawn, execFile } = require('child_process');
const { StringDecoder } = require('string_decoder');
const pty = require('node-pty');
const { WebSocketServer } = require('ws');

const PORT = Number(process.env.HANGAR_PORT) || 4747;
const HOST = '127.0.0.1';
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');
const DATA = process.env.HANGAR_DATA || path.join(ROOT, 'data');
const SCROLL_DIR = path.join(DATA, 'scroll');
const STATE_FILE = path.join(DATA, 'state.json');
const SETTINGS_FILE = path.join(DATA, 'settings.json');
const RUN_FILE = path.join(DATA, 'run.json');   // { port, token, pid } while running: launch.js hands folders to this instance
const CLAWD_DIR = process.env.CLAWD_SESSIONS_DIR || path.join(os.homedir(), '.claude', 'clawd_sessions');
const PS_INTEGRATION = path.join(ROOT, 'shell', 'hangar.ps1');
const BASH_INTEGRATION = path.join(ROOT, 'shell', 'hangar.bash').replace(/\\/g, '/');
const TOKEN = crypto.randomBytes(18).toString('hex');
const IS_WIN = process.platform === 'win32';
const VERSION = require('./package.json').version;
const SCROLL_MAX = 2 * 1024 * 1024;   // scrollback kept per tab (raw terminal stream)
const SCROLL_KEEP = 1536 * 1024;
const MAX_AGENT_BLOCKS = 200;
const MAX_TOOL_RESULT = 8 * 1024;
const PERM_MODES = new Set(['default', 'acceptEdits', 'auto', 'bypassPermissions', 'manual', 'dontAsk', 'plan']);
const NM = path.join(ROOT, 'node_modules');
const VENDOR = {
  'xterm.js': '@xterm/xterm/lib/xterm.js', 'xterm.css': '@xterm/xterm/css/xterm.css',
  'addon-webgl.js': '@xterm/addon-webgl/lib/addon-webgl.js', 'addon-fit.js': '@xterm/addon-fit/lib/addon-fit.js',
  'addon-search.js': '@xterm/addon-search/lib/addon-search.js', 'addon-web-links.js': '@xterm/addon-web-links/lib/addon-web-links.js',
  'addon-unicode11.js': '@xterm/addon-unicode11/lib/addon-unicode11.js',
  // syntax colors: highlight.js common bundle (~37 languages) + PowerShell and Dockerfile, which it lacks
  'hljs.js': '@highlightjs/cdn-assets/highlight.min.js',
  'hljs-powershell.js': '@highlightjs/cdn-assets/languages/powershell.min.js',
  'hljs-dockerfile.js': '@highlightjs/cdn-assets/languages/dockerfile.min.js',
};

// ---------------------------------------------------------------- persistence

fs.mkdirSync(SCROLL_DIR, { recursive: true });
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const writeAtomic = (f, s) => { const tmp = f + '.tmp'; fs.writeFileSync(tmp, s); fs.renameSync(tmp, f); };

const state = readJson(STATE_FILE, null) || { tabs: [], activeTabId: null, seq: 1 };
let settings = readJson(SETTINGS_FILE, {});
for (const t of state.tabs) {
  t.git = null;
  t.blocks = (t.blocks || []).filter((b) => b.kind === 'agent');   // v1 command blocks are now real terminal scrollback
  for (const b of t.blocks) if (b.status === 'running') { b.status = 'interrupted'; b.end = b.end || Date.now(); }
  const prev = t.term || {};
  t.term = { running: null, last: prev.last || null, history: (prev.history || []).slice(-100), cliAgent: false, alive: false };
}

// Debounced, but never postponed more than 3 s while things keep changing.
let saveTimer = null, saveFirst = 0;
function save() {
  const now = Date.now();
  if (!saveFirst) saveFirst = now;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushState, now - saveFirst > 3000 ? 0 : 500);
}
function flushState() {
  clearTimeout(saveTimer); saveTimer = null; saveFirst = 0;
  try { writeAtomic(STATE_FILE, JSON.stringify(state)); } catch (e) { console.error('save failed', e.message); }
}
const uid = (p) => p + (state.seq++).toString(36) + crypto.randomBytes(3).toString('hex');

// ---------------------------------------------------------------- live metadata (SSE)

const clients = new Set();
function broadcast(event, data) {
  if (!clients.size) return;
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) res.write(msg);
}
setInterval(() => { for (const res of clients) res.write(': ping\n\n'); }, 20000);

// ---------------------------------------------------------------- tabs

const tabMeta = (t) => { const { blocks, ...rest } = t; return rest; };
const findTab = (id) => state.tabs.find((t) => t.id === id);
function findBlock(id) {
  for (const t of state.tabs) { const b = t.blocks.find((x) => x.id === id); if (b) return [t, b]; }
  return [];
}
function validDir(p) { try { return p && fs.statSync(p).isDirectory() ? path.resolve(p) : null; } catch { return null; } }
function expandPath(p, cwd) {
  p = String(p).trim().replace(/^(['"])(.*)\1$/, '$2');
  if (!p || p === '~') return os.homedir();
  if (/^~[\\/]/.test(p)) p = path.join(os.homedir(), p.slice(2));
  return path.resolve(cwd, p);
}

function newTab({ cwd, title, mode, shell } = {}) {
  const t = {
    id: uid('t'), customTitle: String(title || '').slice(0, 80), cwd: validDir(cwd) || os.homedir(),
    color: '', pinned: false, mode: mode === 'agent' ? 'agent' : 'terminal', shell: availableShells().includes(shell) ? shell : '',
    agentSessionId: null, blocks: [], git: null, created: Date.now(),
    term: { running: null, last: null, history: [], cliAgent: false, alive: false },
  };
  state.tabs.push(t);
  refreshGit(t, true);
  return t;
}

function addBlock(tab, b) {
  tab.blocks.push(b);
  if (tab.blocks.length > MAX_AGENT_BLOCKS) tab.blocks.splice(0, tab.blocks.length - MAX_AGENT_BLOCKS);
  broadcast('block', { tabId: tab.id, block: b });
  save();
}
const pushBlock = (tab, b) => { broadcast('block', { tabId: tab.id, block: b }); save(); };

// ---------------------------------------------------------------- git + project color
// The branch is read from .git/HEAD (no process). `git diff --shortstat` (a process) runs for the active tab every
// 5 s, for the others every 30 s, and right after a command finishes; results are shared per directory.

function gitDir(dir) {
  for (let d = dir, i = 0; d && i < 30; i++) {
    const g = path.join(d, '.git');
    try {
      const st = fs.statSync(g);
      if (st.isDirectory()) return { root: d, git: g };
      const m = fs.readFileSync(g, 'utf8').match(/gitdir:\s*(.+)/);   // worktrees / submodules
      if (m) return { root: d, git: path.resolve(d, m[1].trim()) };
    } catch { /* keep walking */ }
    const up = path.dirname(d);
    if (up === d) break;
    d = up;
  }
  return null;
}
function gitBranch(g) {
  try {
    const head = fs.readFileSync(path.join(g.git, 'HEAD'), 'utf8').trim();
    const m = head.match(/^ref:\s*refs\/heads\/(.+)$/);
    return m ? m[1] : head.slice(0, 7);
  } catch { return null; }
}
const diffCache = new Map();   // repo root -> { at, added, removed, files, pending }
function gitDiff(root, maxAge) {
  const c = diffCache.get(root);
  if (c && (Date.now() - c.at < maxAge || c.pending)) return Promise.resolve(c.pending || c);
  const p = new Promise((res) => execFile('git', ['-C', root, 'diff', '--shortstat', 'HEAD'], { timeout: 5000, windowsHide: true }, (e, out) => {
    const s = e ? '' : String(out);
    const r = { at: Date.now(), files: +(s.match(/(\d+) files? changed/) || [0, 0])[1], added: +(s.match(/(\d+) insertions?/) || [0, 0])[1], removed: +(s.match(/(\d+) deletions?/) || [0, 0])[1] };
    diffCache.set(root, r);
    res(r);
  }));
  diffCache.set(root, { ...(c || { at: 0, files: 0, added: 0, removed: 0 }), pending: p });
  return p;
}

const peacockCache = new Map();
function findPeacock(dir) {
  const hit = peacockCache.get(dir);
  if (hit && Date.now() - hit.at < 30000) return hit.color;
  let color = null;
  for (let d = dir, i = 0; i < 12; i++) {
    try {
      const m = fs.readFileSync(path.join(d, '.vscode', 'settings.json'), 'utf8').match(/"peacock\.color"\s*:\s*"(#[0-9a-f]{3,8})"/i);
      if (m) { color = m[1]; break; }
    } catch { /* no settings here */ }
    const up = path.dirname(d);
    if (up === d) break;
    d = up;
  }
  peacockCache.set(dir, { at: Date.now(), color });
  return color;
}

async function refreshGit(tab, withDiff) {
  const g = gitDir(tab.cwd);
  let info = { branch: null, added: 0, removed: 0, files: 0, peacock: findPeacock(tab.cwd) };
  if (g) {
    info.branch = gitBranch(g);
    const prev = tab.git && tab.git.branch ? tab.git : null;
    const d = withDiff ? await gitDiff(g.root, 3000) : diffCache.get(g.root) || prev || {};
    info = { ...info, added: d.added || 0, removed: d.removed || 0, files: d.files || 0 };
  }
  if (JSON.stringify(info) !== JSON.stringify(tab.git) && findTab(tab.id)) {
    tab.git = info;
    broadcast('tab', tabMeta(tab));
  }
}
let gitTick = 0;
setInterval(() => {
  if (!clients.size) return;   // nobody is looking
  gitTick++;
  for (const t of state.tabs) refreshGit(t, t.id === state.activeTabId || gitTick % 6 === 0);
}, 5000);

// ---------------------------------------------------------------- shells

const BASH = IS_WIN ? ['C:\\Program Files\\Git\\bin\\bash.exe', 'C:\\Program Files (x86)\\Git\\bin\\bash.exe'].find((p) => fs.existsSync(p)) : '/bin/bash';
let PWSH = null;
if (IS_WIN) execFile('where', ['pwsh.exe'], { windowsHide: true }, (e, out) => { if (!e) PWSH = String(out).split(/\r?\n/)[0].trim() || null; });
function availableShells() {
  if (!IS_WIN) return ['bash', 'sh'];
  return ['powershell', ...(PWSH ? ['pwsh'] : []), 'cmd', ...(BASH ? ['bash'] : [])];
}
const defaultShell = () => (IS_WIN ? 'powershell' : 'bash');

function ptySpec(kind) {
  const sh = settings.shell || {};
  kind = availableShells().includes(kind) ? kind : availableShells().includes(sh.kind) ? sh.kind : defaultShell();
  const profile = sh.loadProfile !== false;
  if (kind === 'powershell' || kind === 'pwsh') {
    const args = ['-NoLogo', '-NoExit', '-ExecutionPolicy', 'Bypass', '-Command', `. '${PS_INTEGRATION.replace(/'/g, "''")}'`];
    if (!profile) args.unshift('-NoProfile');
    return { kind, file: kind === 'pwsh' ? PWSH || 'pwsh.exe' : 'powershell.exe', args, env: sh.welcome !== false ? { HANGAR_WELCOME: '1' } : {} };
  }
  if (kind === 'cmd') return { kind, file: 'cmd.exe', args: [], env: {} };
  if (kind === 'sh') return { kind, file: '/bin/sh', args: ['-i'], env: {} };
  return { kind: 'bash', file: BASH || 'bash', args: ['--rcfile', BASH_INTEGRATION, '-i'], env: profile ? { HANGAR_LOAD_PROFILE: '1' } : {} };
}

// ---------------------------------------------------------------- terminals

const terms = new Map();     // tabId -> { p, buf, carry, pendingCmd, outQ, flushT, cols, rows, exited, dirty, paused }
const sockets = new Set();   // WebSocket clients; each has .subs = Set(tabId)
const scrollFile = (id) => path.join(SCROLL_DIR, String(id).replace(/[^\w-]/g, '') + '.log');

function termRec(tab) {
  let r = terms.get(tab.id);
  if (!r) {
    let buf = '';
    try { buf = fs.readFileSync(scrollFile(tab.id), 'utf8'); } catch { /* new tab */ }
    if (buf) buf += '\r\n\x1b[2m── restored scrollback · new session ──\x1b[0m\r\n';
    r = { tabId: tab.id, p: null, buf, carry: '', pendingCmd: '', outQ: '', flushT: null, cols: 120, rows: 30, exited: false, dirty: false, paused: false, restart: false };
    terms.set(tab.id, r);
  }
  return r;
}

function startPty(tab, rec) {
  const spec = ptySpec(tab.shell);
  const env = {
    ...process.env, ...spec.env, TERM_PROGRAM: 'Hangar', TERM_PROGRAM_VERSION: VERSION, COLORTERM: 'truecolor',
    HANGAR: '1', HANGAR_TAB: tab.id, CLAWD_HOST_TAB: tab.id,   // the Clawd hook tags interactive `claude` sessions with this tab
  };
  delete env.CLAWD_HOST;
  try {
    rec.p = pty.spawn(spec.file, spec.args, { name: 'xterm-256color', cols: rec.cols, rows: rec.rows, cwd: validDir(tab.cwd) || os.homedir(), env, useConptyDll: IS_WIN });
  } catch (e) {
    emitOut(rec, `\r\n\x1b[31mHangar could not start ${spec.file}: ${e.message}\x1b[0m\r\n`);
    rec.exited = true;
    return;
  }
  rec.exited = false;
  Object.assign(tab.term, { alive: true, shell: spec.kind, running: null, cliAgent: false });
  const p = rec.p;
  p.onData((d) => { if (rec.p === p) { scanMarks(tab, rec, d); emitOut(rec, d); trimWelcome(rec, d); } });
  p.onExit(({ exitCode }) => {
    if (rec.p !== p) return;
    rec.p = null;
    Object.assign(tab.term, { alive: false, running: null, cliAgent: false });
    if (rec.restart) { rec.restart = false; emitOut(rec, '\r\n\x1b[2m── restarted ──\x1b[0m\r\n'); startPty(tab, rec); return; }
    rec.exited = true;
    emitOut(rec, `\r\n\x1b[2m[shell exited with code ${exitCode} · press Enter to start a new one]\x1b[0m\r\n`);
    broadcast('tab', tabMeta(tab));
  });
  broadcast('tab', tabMeta(tab));
}

function killPty(rec) { if (rec && rec.p) { const p = rec.p; try { p.kill(); } catch { /* already gone */ } } }

function emitOut(rec, d) {
  rec.buf += d;
  if (rec.buf.length > SCROLL_MAX) {
    const cut = rec.buf.length - SCROLL_KEEP, nl = rec.buf.indexOf('\n', cut);
    rec.buf = rec.buf.slice(nl >= 0 ? nl + 1 : cut);
    rec.welcomeAt = null;
  }
  rec.dirty = true;
  rec.outQ += d;
  if (!rec.flushT) rec.flushT = setTimeout(() => flushOut(rec), 6);   // coalesce bursts into one message
}
// shell/welcome.ps1 fences its animation with two marks and the closing one carries the final picture (base64): the
// scrollback keeps that picture instead of every frame.
const WELCOME_MARK = ']633;P;HangarWelcome=';
function trimWelcome(rec, d) {
  const from = rec.buf.length - d.length;
  if (rec.welcomeAt == null) {
    const i = rec.buf.indexOf(WELCOME_MARK + '1', Math.max(0, from - WELCOME_MARK.length));
    if (i < 0) return;
    rec.welcomeAt = i;
  }
  const j = rec.buf.indexOf(WELCOME_MARK, Math.max(rec.welcomeAt + 1, from - 65536));
  const end = j < 0 ? -1 : rec.buf.indexOf('', j);
  if (end < 0) return;
  const pic = Buffer.from(rec.buf.slice(j + WELCOME_MARK.length, end), 'base64').toString('utf8');
  rec.buf = rec.buf.slice(0, rec.welcomeAt) + pic + rec.buf.slice(end + 1);
  rec.welcomeAt = null;
}
function flushOut(rec) {
  rec.flushT = null;
  const d = rec.outQ;
  rec.outQ = '';
  if (!d) return;
  const msg = JSON.stringify({ t: 'o', tab: rec.tabId, d });
  for (const ws of sockets) if (ws.subs.has(rec.tabId) && ws.readyState === 1) ws.send(msg);
}
// Backpressure: if a window can't keep up (e.g. `dir -Recurse C:\`), pause that shell until it drains.
setInterval(() => {
  for (const rec of terms.values()) {
    if (!rec.p) continue;
    let slow = false;
    for (const ws of sockets) if (ws.subs.has(rec.tabId) && ws.bufferedAmount > 4 * 1024 * 1024) slow = true;
    if (slow && !rec.paused) { rec.p.pause(); rec.paused = true; }
    else if (!slow && rec.paused) { rec.p.resume(); rec.paused = false; }
  }
}, 100);
// Scrollback goes to its own file so state.json stays small.
setInterval(() => {
  for (const rec of terms.values()) if (rec.dirty) { rec.dirty = false; fs.writeFile(scrollFile(rec.tabId), rec.buf, () => {}); }
}, 5000);

// OSC 633 (shell integration) — parsed here for metadata; the bytes still go to xterm, which draws the blocks.
const MARK_RE = /\x1b\]633;([^\x07\x1b]*)(?:\x07|\x1b\\)/g;
const unesc = (v) => v.replace(/\\x([0-9a-fA-F]{2})|\\\\/g, (m, hex) => (hex ? String.fromCharCode(parseInt(hex, 16)) : '\\'));
function scanMarks(tab, rec, d) {
  let s = rec.carry + d;
  rec.carry = '';
  const last = s.lastIndexOf('\x1b]633;');
  if (last >= 0 && !/\x07|\x1b\\/.test(s.slice(last))) { rec.carry = s.slice(last, last + 8192); s = s.slice(0, last); }
  if (!s.includes('\x1b]633;')) return;
  for (const m of s.matchAll(MARK_RE)) onMark(tab, rec, m[1]);
}
function onMark(tab, rec, payload) {
  const i = payload.indexOf(';');
  const kind = i < 0 ? payload : payload.slice(0, i), arg = i < 0 ? '' : payload.slice(i + 1);
  const T = tab.term;
  if (kind === 'E') rec.pendingCmd = unesc(arg);
  else if (kind === 'C') {
    const cmd = (rec.pendingCmd || '').trim();
    rec.pendingCmd = '';
    T.running = cmd ? { command: cmd.slice(0, 2000), start: Date.now() } : null;
    T.cliAgent = /^claude(\.exe)?(\s|$)/i.test(cmd);
    if (cmd) broadcast('tab', tabMeta(tab));
  } else if (kind === 'D') {
    if (!T.running) return;
    const done = { ...T.running, end: Date.now(), exitCode: arg === '' ? null : Number(arg) };
    T.last = done;
    T.history.push(done);
    if (T.history.length > 100) T.history.splice(0, T.history.length - 100);
    T.running = null;
    T.cliAgent = false;
    broadcast('cmd-done', { tabId: tab.id, ...done });
    broadcast('tab', tabMeta(tab));
    refreshGit(tab, true);
    save();
  } else if (kind === 'P' && arg.startsWith('Cwd=')) {
    const dir = validDir(unesc(arg.slice(4)));
    if (dir && dir !== tab.cwd) { tab.cwd = dir; broadcast('tab', tabMeta(tab)); refreshGit(tab, true); save(); }
  }
}

function onSocket(ws) {
  ws.subs = new Set();
  sockets.add(ws);
  ws.on('close', () => sockets.delete(ws));
  ws.on('error', () => {});
  ws.on('message', (raw) => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    const tab = findTab(m.tab);
    if (!tab) return;
    const rec = termRec(tab);
    const size = () => {
      if (m.cols > 1 && m.rows > 1) { rec.cols = Math.min(500, m.cols | 0); rec.rows = Math.min(300, m.rows | 0); }
      if (rec.p) try { rec.p.resize(rec.cols, rec.rows); } catch { /* exited */ }
    };
    switch (m.t) {
      case 'attach':
        ws.subs.add(tab.id);
        size();
        ws.send(JSON.stringify({ t: 'replay', tab: tab.id, d: rec.buf }));
        if (!rec.p && !rec.exited) startPty(tab, rec);
        break;
      case 'detach': ws.subs.delete(tab.id); break;
      case 'in':
        if (rec.p) rec.p.write(String(m.d));
        else if (rec.exited && /\r/.test(m.d)) { emitOut(rec, '\r\n'); startPty(tab, rec); }
        break;
      case 'resize': size(); break;
      case 'clear': rec.buf = ''; rec.welcomeAt = null; rec.dirty = true; break;
      case 'restart':
        if (rec.p) { rec.restart = true; killPty(rec); } else { rec.exited = false; startPty(tab, rec); }
        break;
    }
  });
}

// ---------------------------------------------------------------- agent blocks (Claude Code, headless stream-json)

const procs = new Map();   // agent blockId -> { child, killed }
function killTree(child) {
  if (!child || child.exitCode !== null) return;
  if (IS_WIN) execFile('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true }, () => {});
  else try { process.kill(-child.pid, 'SIGTERM'); } catch { child.kill('SIGTERM'); }
}

let claudeBin = null;
function resolveClaude() {
  if (claudeBin) return claudeBin;
  if (process.env.HANGAR_CLAUDE) return (claudeBin = { file: process.env.HANGAR_CLAUDE, shell: false });
  if (IS_WIN) {
    const exe = path.join(process.env.APPDATA || '', 'npm', 'node_modules', '@anthropic-ai', 'claude-code', 'bin', 'claude.exe');
    const local = path.join(os.homedir(), '.local', 'bin', 'claude.exe');
    const found = [exe, local].find((p) => fs.existsSync(p));
    return (claudeBin = found ? { file: found, shell: false } : { file: 'claude', shell: true });
  }
  return (claudeBin = { file: 'claude', shell: false });
}

const toolText = (c) => {
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) return c.map((x) => (x.type === 'text' ? x.text : x.type === 'image' ? '[image]' : '')).join('\n');
  return c == null ? '' : JSON.stringify(c);
};

function runAgent(tab, prompt, opts = {}) {
  const a = settings.agent || {};
  const model = opts.model ?? a.model ?? '';
  const permissionMode = opts.permissionMode || a.permissionMode || 'default';
  const block = {
    id: uid('b'), kind: 'agent', prompt, cwd: tab.cwd, branch: tab.git && tab.git.branch,
    start: Date.now(), end: null, status: 'running', events: [], stderr: '',
    meta: { model: model || null, permissionMode, resumed: !!tab.agentSessionId, sessionId: tab.agentSessionId },
  };
  const args = ['-p', '--output-format', 'stream-json', '--verbose'];
  if (model && /^[\w.\-[\]]+$/.test(model)) args.push('--model', model);
  if (PERM_MODES.has(permissionMode) && permissionMode !== 'default') args.push('--permission-mode', permissionMode);
  if (tab.agentSessionId && /^[0-9a-f-]{36}$/i.test(tab.agentSessionId)) args.push('--resume', tab.agentSessionId);

  args.push('--settings', agentSettings());   // the checkpoint hook (see "file checkpoints")
  const env = { ...process.env, HANGAR: '1', HANGAR_CHECKPOINT: ckptDir(block.id) };
  if (tab.customTitle && /^[\w-]+$/.test(tab.customTitle)) env.CLAWD_NAME = tab.customTitle.toLowerCase();
  // Clawd hook: with CLAWD_HOST the session file outlives each headless run (Hangar removes it when the tab goes).
  if (syncOverlay()) { env.CLAWD_HOST = 'hangar'; env.CLAWD_HOST_TAB = tab.id; }
  const bin = resolveClaude();
  addBlock(tab, block);
  const rec = { child: null, killed: false };
  procs.set(block.id, rec);
  // checkpoint first (usually well under a second), so the turn's changes can be shown and reverted
  const repo = gitDir(tab.cwd);
  (repo ? snapshot(repo, 'hangar: before turn').catch(() => null) : Promise.resolve(null)).then((before) => {
    if (before) block.meta.git = { root: repo.root, gitdir: repo.git, before };
    if (rec.killed) { procs.delete(block.id); Object.assign(block, { status: 'killed', end: Date.now() }); pushBlock(tab, block); return; }
    startClaude(tab, block, rec, bin, args, env, prompt);
  });
  return block;
}

function startClaude(tab, block, rec, bin, args, env, prompt) {
  let child;
  try {
    child = spawn(bin.file, args, { cwd: tab.cwd, env, windowsHide: true, shell: bin.shell });
  } catch (e) {
    procs.delete(block.id);
    Object.assign(block, { status: 'error', end: Date.now(), stderr: `failed to start claude: ${e.message}` });
    pushBlock(tab, block);
    return;
  }
  rec.child = child;
  child.stdin.on('error', () => {});
  child.stdin.end(prompt);

  let pending = '', flush = null;
  const update = () => { if (!flush) flush = setTimeout(() => { flush = null; pushBlock(tab, block); }, 80); };
  const dec = new StringDecoder('utf8');
  child.stdout.on('data', (buf) => {
    pending += dec.write(buf);
    let nl;
    while ((nl = pending.indexOf('\n')) >= 0) {
      const line = pending.slice(0, nl).trim();
      pending = pending.slice(nl + 1);
      if (!line) continue;
      try { onAgentEvent(tab, block, JSON.parse(line)); update(); } catch { /* non-JSON noise */ }
    }
  });
  child.stderr.on('data', (b) => { block.stderr = (block.stderr + b.toString()).slice(-8000); update(); });
  child.on('error', (e) => { block.stderr += `\n${e.message}`; });
  child.on('close', (code) => {
    procs.delete(block.id);
    clearTimeout(flush);
    for (const ev of block.events) if (ev.type === 'tool' && ev.status === 'running') ev.status = rec.killed ? 'cancelled' : 'done';
    block.end = Date.now();
    block.exitCode = code;
    if (rec.killed) block.status = 'killed';
    else if (block.status === 'running') block.status = code === 0 && !block.meta.isError ? 'done' : 'error';
    pushBlock(tab, block);
    broadcast('tab', tabMeta(tab));
    const g = block.meta.git;
    (g ? turnChanges(g).catch(() => {}) : Promise.resolve()).then(() => {
      try { fileTurnChanges(block); } catch { /* no copies */ }
      if (g || block.meta.files) pushBlock(tab, block);
      if (g) refreshRepoTabs(g.root);
    });
  });
}

function onAgentEvent(tab, block, ev) {
  const E = block.events;
  if (ev.type === 'system') {
    if (ev.subtype === 'init') {
      Object.assign(block.meta, { sessionId: ev.session_id, model: ev.model || block.meta.model, tools: (ev.tools || []).length, mcp: (ev.mcp_servers || []).length });
      tab.agentSessionId = ev.session_id;
      noteInit(ev, tab.cwd);
    } else if (ev.subtype === 'notification' && ev.text) E.push({ type: 'notice', text: ev.text });
    else if (ev.subtype === 'hook_response' && ev.output) {
      try { const m = JSON.parse(ev.output).systemMessage; if (m) E.push({ type: 'notice', text: m }); } catch { /* not JSON */ }
    }
  } else if (ev.type === 'assistant' && ev.message) {
    for (const c of ev.message.content || []) {
      if (c.type === 'text' && c.text) {
        const last = E[E.length - 1];
        if (last && last.type === 'text' && last.msgId === ev.message.id) last.text += c.text;
        else E.push({ type: 'text', text: c.text, msgId: ev.message.id });
      } else if (c.type === 'thinking' && c.thinking) E.push({ type: 'thinking', text: c.thinking });
      else if (c.type === 'tool_use') E.push({ type: 'tool', id: c.id, name: c.name, input: c.input, status: 'running' });
    }
    if (ev.message.usage) block.meta.ctxUsage = ev.message.usage;
  } else if (ev.type === 'user' && ev.message && Array.isArray(ev.message.content)) {
    for (const c of ev.message.content) {
      if (c.type !== 'tool_result') continue;
      const t = E.find((x) => x.type === 'tool' && x.id === c.tool_use_id);
      if (!t) continue;
      t.result = toolText(c.content).slice(0, MAX_TOOL_RESULT);
      t.status = c.is_error ? 'error' : 'done';
    }
  } else if (ev.type === 'rate_limit_event' && ev.rate_limit_info) {
    block.meta.rateLimit = ev.rate_limit_info;
    usageFromRateLimit(ev.rate_limit_info);
  } else if (ev.type === 'result' || (ev.total_cost_usd !== undefined && ev.session_id)) {
    if (typeof ev.result === 'string') usageFromText(ev.result);   // a "/usage" prompt
    Object.assign(block.meta, {
      cost: ev.total_cost_usd, durationMs: ev.duration_ms, turns: ev.num_turns, usage: ev.usage,
      isError: !!ev.is_error, resultSubtype: ev.subtype, denials: (ev.permission_denials || []).slice(0, 20),
    });
    if (ev.session_id) { block.meta.sessionId = ev.session_id; tab.agentSessionId = ev.session_id; }
    block.status = ev.is_error ? 'error' : 'done';
  }
}

// ---------------------------------------------------------------- Claude Code slash commands + plan usage
// The `init` event of every headless run lists the slash commands that work in -p mode (plus the ones that only
// work in the interactive TUI). A free probe (`claude -p "/usage"`: no model call, no hooks, no session file)
// keeps that list and the plan usage (5-hour session + weekly windows) fresh; agent runs refresh both too.
const CLAUDE_FILE = path.join(DATA, 'claude.json');
const PROBE_SETTINGS = path.join(DATA, 'probe-settings.json');
const claudeInfo = readJson(CLAUDE_FILE, null) || {};
const initByCwd = new Map();   // cwd (lowercase) -> commands seen in the last run there (project commands included)
const saveClaude = () => { try { writeAtomic(CLAUDE_FILE, JSON.stringify(claudeInfo)); } catch { /* data dir gone */ } };

function noteInit(ev, cwd) {
  if (!Array.isArray(ev.slash_commands)) return;
  const c = {
    slash: ev.slash_commands, terminal: ev.terminal_slash_commands || [], skills: ev.skills || [],
    plugins: (ev.plugins || []).filter((p) => p.path && p.path !== 'builtin').map((p) => ({ name: p.name, path: p.path })), at: Date.now(),
  };
  if (cwd) initByCwd.set(cwd.toLowerCase(), c);
  if (!cwd || !claudeInfo.commands || cwd.toLowerCase() === os.homedir().toLowerCase()) { claudeInfo.commands = c; saveClaude(); }
}

// Built-ins that work headless; skills, custom commands and plugin commands describe themselves (frontmatter).
const BUILTIN_DOCS = {
  clear: 'Start a new conversation in this tab', compact: 'Summarize the conversation to free context', context: 'Show what fills the context window',
  usage: 'Plan usage: session and weekly limits', model: 'Pick the model', init: 'Create a CLAUDE.md for this project',
  review: 'Review a pull request', 'security-review': 'Security review of the pending changes', 'code-review': 'Review the current diff',
  simplify: 'Clean up the changed code', mcp: 'MCP servers', config: 'Settings', agents: 'Subagents', effort: 'Reasoning effort',
  fast: 'Toggle fast mode', 'output-style': 'Output style', rename: 'Rename the conversation', recap: 'Recap of the conversation',
  insights: 'Usage insights', doctor: 'Check the Claude Code install', loop: 'Run a prompt on an interval', schedule: 'Scheduled cloud agents',
  goal: 'Set a goal for the conversation', color: 'Session color', focus: 'Focus mode', batch: 'Run a task over many items',
  debug: 'Debug an issue', verify: 'Verify a change works', 'reload-plugins': 'Reload plugins', 'reload-skills': 'Reload skills',
  'extra-usage': 'Extra usage beyond the plan', 'usage-credits': 'Usage credits', autocompact: 'Auto-compact settings', import: 'Import',
  help: 'All commands', resume: 'Copy the command to resume this conversation in a terminal', new: 'Start a new conversation in this tab',
};
function frontmatter(file) {
  let src = '';
  try { const fd = fs.openSync(file, 'r'); const buf = Buffer.alloc(6144); src = buf.toString('utf8', 0, fs.readSync(fd, buf, 0, buf.length, 0)); fs.closeSync(fd); } catch { return null; }
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  const field = (k) => {
    if (!m) return '';
    const f = m[1].match(new RegExp(`^${k}:[ \\t]*(.*)((?:\\r?\\n[ \\t]+.*)*)`, 'm'));
    if (!f) return '';
    const v = (/^[>|][-+]?$/.test(f[1].trim()) ? f[2] : f[1] + f[2]).replace(/\s+/g, ' ').trim();
    return v.replace(/^(["'])(.*)\1$/, '$2');
  };
  const body = (m ? src.slice(m[0].length) : src).split(/\r?\n/).map((l) => l.replace(/^#+\s*/, '').trim()).find(Boolean) || '';
  return { desc: field('description') || body, hint: field('argument-hint') };
}
// <dir>/commands/**/*.md → name (sub/dir → sub:dir), <dir>/skills/<name>/SKILL.md → name
function scanCommandDir(root, prefix, kindOf, out) {
  const walk = (dir, ns) => {
    let ents = [];
    try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      if (e.isDirectory()) walk(path.join(dir, e.name), ns + e.name + ':');
      else if (e.name.endsWith('.md')) { const fm = frontmatter(path.join(dir, e.name)); if (fm) out.set(prefix + ns + e.name.slice(0, -3), { ...fm, kind: kindOf }); }
    }
  };
  walk(path.join(root, 'commands'), '');
  let skills = [];
  try { skills = fs.readdirSync(path.join(root, 'skills'), { withFileTypes: true }); } catch { /* none */ }
  for (const e of skills) {
    if (!e.isDirectory() && !e.isSymbolicLink()) continue;
    const fm = frontmatter(path.join(root, 'skills', e.name, 'SKILL.md'));
    if (fm) out.set(prefix + e.name, { ...fm, kind: kindOf === 'command' ? 'skill' : kindOf });
  }
}
const docsCache = new Map();   // cwd -> { at, docs }
function commandDocs(cwd, plugins) {
  const key = String(cwd || '').toLowerCase(), hit = docsCache.get(key);
  if (hit && Date.now() - hit.at < 30000) return hit.docs;
  const docs = new Map();
  for (const p of plugins || []) scanCommandDir(p.path, p.name + ':', 'plugin', docs);
  scanCommandDir(path.join(os.homedir(), '.claude'), '', 'command', docs);
  if (cwd) scanCommandDir(path.join(cwd, '.claude'), '', 'command', docs);   // project ones win
  docsCache.set(key, { at: Date.now(), docs });
  return docs;
}
function claudeCommands(cwd) {
  const g = claudeInfo.commands || { slash: [], terminal: [], skills: [], plugins: [] };
  const local = cwd ? initByCwd.get(cwd.toLowerCase()) : null;
  const plugins = [...g.plugins, ...((local && local.plugins) || [])];
  const docs = commandDocs(cwd, plugins), skills = new Set([...g.skills, ...((local && local.skills) || [])]);
  const out = new Map();
  const add = (name, terminalOnly) => {
    if (!name || name.startsWith('_') || name === 'cost' || out.has(name)) return;
    const d = docs.get(name) || {};
    const kind = d.kind || (skills.has(name) ? 'skill' : 'builtin');
    out.set(name, { name, desc: d.desc || BUILTIN_DOCS[name] || '', hint: d.hint || '', kind, terminalOnly: !!terminalOnly });
  };
  for (const n of (local && local.slash) || []) add(n);
  for (const n of g.slash) add(n);
  for (const [n, d] of docs) if (d.kind === 'command' || d.kind === 'skill') add(n);   // new project commands before any run there
  for (const n of ['help', 'new', 'resume']) add(n);                                   // handled by Hangar itself
  for (const n of [...g.terminal, ...((local && local.terminal) || [])]) if (!out.has(n)) add(n, true);
  return { commands: [...out.values()], at: g.at || 0 };
}

// usage: { windows: [{ key, label, pct, resetsAt }], at, plan }
const WINDOW_LABEL = { five_hour: ['session', 'Session · 5h'], seven_day: ['week', 'Week'], seven_day_opus: ['week-opus', 'Week · Opus'], seven_day_sonnet: ['week-sonnet', 'Week · Sonnet'] };
function setUsage(windows, extra = {}) {
  const prev = (claudeInfo.usage && claudeInfo.usage.windows) || [];
  const merged = [...windows, ...prev.filter((p) => !windows.some((w) => w.key === p.key))];
  claudeInfo.usage = { ...(claudeInfo.usage || {}), ...extra, windows: merged, at: Date.now() };
  saveClaude();
  broadcast('usage', claudeInfo.usage);
}
function usageFromRateLimit(info) {
  const u = info && info.unifiedWindows;
  if (!u) return;
  const windows = Object.entries(u).filter(([, w]) => w && typeof w.utilization === 'number').map(([k, w]) => {
    const [key, label] = WINDOW_LABEL[k] || [k, k.replace(/_/g, ' ')];
    return { key, label, pct: Math.round(w.utilization * 1000) / 10, resetsAt: w.resetsAt ? w.resetsAt * 1000 : null };
  });
  if (windows.length) setUsage(windows, { status: info.status || null });
}
// "Current session: 10% used · resets Oct 15, 2:39am (America/Hermosillo)" — the reset is in this machine's zone
function parseReset(s) {
  const m = String(s || '').replace(/\s*\(.*\)\s*$/, '').trim().match(/^(?:([A-Z][a-z]{2})\w* (\d{1,2}),? )?(\d{1,2})(?::(\d{2}))?\s*([ap]m)$/i);
  if (!m) return null;
  const now = new Date(), d = new Date(now);
  let hr = +m[3] % 12;
  if (m[5].toLowerCase() === 'pm') hr += 12;
  if (m[1]) { const mon = 'janfebmaraprmayjunjulaugsepoctnovdec'.indexOf(m[1].toLowerCase()) / 3; if (mon < 0) return null; d.setMonth(mon, +m[2]); }
  d.setHours(hr, +(m[4] || 0), 0, 0);
  if (d < now - 864e5) d.setFullYear(d.getFullYear() + 1);
  else if (!m[1] && d < now) d.setDate(d.getDate() + 1);
  return d.getTime();
}
function usageFromText(text) {
  const windows = [];
  for (const line of String(text).split(/\r?\n/)) {
    const m = line.trim().match(/^Current ([^:]+):\s*(\d+(?:\.\d+)?)% used(?:\s*·\s*resets\s+(.+))?$/i);
    if (!m) continue;
    const what = m[1].trim().toLowerCase(), scope = (what.match(/\(([^)]+)\)/) || [])[1] || '';
    const key = what.startsWith('session') ? 'session' : what.startsWith('week') ? (!scope || /all models/.test(scope) ? 'week' : 'week-' + scope.replace(/\W+/g, '-').replace(/-only$/, '')) : what.replace(/\W+/g, '-');
    const label = key === 'session' ? 'Session · 5h' : key === 'week' ? 'Week' : what.startsWith('week') ? 'Week · ' + scope.replace(/ only$/, '') : m[1];
    windows.push({ key, label, pct: +m[2], resetsAt: parseReset(m[3]) });
  }
  if (!windows.length) return false;
  const plan = /subscription/i.test(text) ? 'subscription' : /api key/i.test(text) ? 'api' : null;
  setUsage(windows, { plan });
  return true;
}

let probing = null, lastProbe = 0;
function probeClaude(force) {
  if (probing || Date.now() - lastProbe < (force ? 10000 : 60000)) return probing || Promise.resolve(false);
  lastProbe = Date.now();
  try { if (!fs.existsSync(PROBE_SETTINGS)) fs.writeFileSync(PROBE_SETTINGS, JSON.stringify({ disableAllHooks: true })); } catch { /* read-only data */ }
  const bin = resolveClaude();
  const args = ['-p', '--output-format', 'stream-json', '--verbose', '--no-session-persistence', '--settings', PROBE_SETTINGS];
  probing = new Promise((done) => {
    let child;
    try { child = spawn(bin.file, args, { cwd: os.homedir(), env: { ...process.env, HANGAR: '1', HANGAR_PROBE: '1' }, windowsHide: true, shell: bin.shell }); } catch { return done(false); }
    const kill = setTimeout(() => killTree(child), 60000);
    let out = '';
    child.stdout.on('data', (b) => { out += b; if (out.length > 4e6) out = out.slice(-2e6); });
    child.stdin.on('error', () => {});
    child.stdin.end('/usage');
    child.on('error', () => {});
    child.on('close', () => {
      clearTimeout(kill);
      let ok = false;
      for (const line of out.split('\n')) {
        let ev; try { ev = JSON.parse(line); } catch { continue; }
        if (ev.type === 'system' && ev.subtype === 'init') noteInit(ev, null);
        else if (ev.type === 'result' && typeof ev.result === 'string') ok = usageFromText(ev.result) || ok;
      }
      broadcast('commands', { at: (claudeInfo.commands || {}).at || 0 });
      done(ok);
    });
  }).finally(() => { probing = null; });
  return probing;
}
setTimeout(() => probeClaude(true), 5000);
// every 5 min while a window is open (interactive sessions spend the same plan)
setInterval(() => { if (clients.size) probeClaude(); }, 5 * 60 * 1000);

// ---------------------------------------------------------------- Clawd overlay sync
// Each agent tab owns one session file in ~/.claude/clawd_sessions (host: "hangar", pid 0), so the desktop Clawd
// keeps its mini alive between headless prompts. The hook updates state/color during runs; Hangar creates the file
// at startup, refreshes it, and deletes it when the tab or the conversation goes away.
const syncOverlay = () => !settings.clawd || settings.clawd.syncOverlay !== false;
const clawdFile = (sid) => path.join(CLAWD_DIR, String(sid).replace(/[^\w-]/g, '') + '.json');
function writeClawd(tab, patch = {}) {
  if (!syncOverlay() || !tab.agentSessionId) return;
  const f = clawdFile(tab.agentSessionId);
  const now = Date.now();
  const s = { ...readJson(f, {}), sid: tab.agentSessionId, cwd: tab.cwd, host: 'hangar', tab: tab.id, pid: 0, ts: now, ...patch };
  if (!s.state) s.state = 'idle';
  if (!s.started) s.started = now;
  if (s.focus == null) s.focus = 0;
  const name = /^[\w-]+$/.test(tab.customTitle || '') ? tab.customTitle.toLowerCase() : '';
  if (name) s.name = name;
  if (name === 'mimi') { s.skin = 'mimi'; s.color = '#FFFFFF'; s.idx = -1; }
  if (!s.color && tab.clawdColor) { s.color = tab.clawdColor; s.idx = -1; }
  try { fs.mkdirSync(CLAWD_DIR, { recursive: true }); writeAtomic(f, JSON.stringify(s)); } catch { /* overlay dir unavailable */ }
}
function removeClawd(tab) {
  if (!tab || !tab.agentSessionId) return;
  const f = clawdFile(tab.agentSessionId), s = readJson(f, null);
  if (s && s.host === 'hangar') try { fs.unlinkSync(f); } catch { /* already gone */ }
}
function syncClawdFiles() {
  if (!syncOverlay()) return;
  for (const t of state.tabs) if (t.agentSessionId) writeClawd(t);
  try {   // orphans from a Hangar that was killed: files pointing at tabs that no longer exist
    for (const name of fs.readdirSync(CLAWD_DIR)) {
      if (!name.endsWith('.json')) continue;
      const s = readJson(path.join(CLAWD_DIR, name), null);
      if (s && s.host === 'hangar' && !state.tabs.some((t) => t.id === s.tab && t.agentSessionId === s.sid)) fs.unlinkSync(path.join(CLAWD_DIR, name));
    }
  } catch { /* no dir yet */ }
}
// pid-less files expire in the overlay after 3 h without updates: keep idle tabs fresh
setInterval(() => { for (const t of state.tabs) if (t.agentSessionId && !t.blocks.some((b) => b.status === 'running')) writeClawd(t); }, 20 * 60 * 1000);

// ---------------------------------------------------------------- Claude Code sessions from Clawd (~/.claude/clawd_sessions)

let external = [];
const fileCache = new Map();   // file -> { mtime, data }
function alive(pid) { if (!pid) return true; try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } }
function readExternal(force) {
  if (!clients.size && !force) return;
  let list = [];
  try {
    for (const f of fs.readdirSync(CLAWD_DIR)) {
      if (!f.endsWith('.json')) continue;
      const full = path.join(CLAWD_DIR, f);
      let mt = 0;
      try { mt = fs.statSync(full).mtimeMs; } catch { continue; }
      let c = fileCache.get(full);
      if (!c || c.mtime !== mt) { c = { mtime: mt, data: readJson(full, null) }; fileCache.set(full, c); }
      const s = c.data;
      if (!s || !alive(s.pid)) continue;
      list.push({ sid: s.sid, name: s.name || '', cwd: s.cwd || '', state: s.state || 'idle', color: s.color || '', skin: s.skin || '', focus: s.focus || 0, started: s.started || 0, host: s.host || '', tab: s.tab || '' });
      const t = s.host === 'hangar' && findTab(s.tab);
      if (t && t.agentSessionId === s.sid && s.color && t.clawdColor !== s.color) { t.clawdColor = s.color; broadcast('tab', tabMeta(t)); save(); }
    }
  } catch { list = []; }
  list.sort((a, b) => (b.focus || b.started) - (a.focus || a.started));
  if (JSON.stringify(list) !== JSON.stringify(external)) { external = list; broadcast('external', external); }
}
setInterval(readExternal, 2500);

// ---------------------------------------------------------------- file viewer (browse, preview, edit any file Claude touches)
// Same trust boundary as the terminal itself (localhost + the random token): no extra path jail.

let SOFFICE = null;   // optional: lets office docs (ppt/doc/xls) preview as PDF instead of "open externally" only
if (IS_WIN) {
  const c = ['C:\\Program Files\\LibreOffice\\program\\soffice.exe', 'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe'].find((p) => fs.existsSync(p));
  if (c) SOFFICE = c;
  else execFile('where', ['soffice.exe'], { windowsHide: true }, (e, out) => { if (!e) SOFFICE = String(out).split(/\r?\n/)[0].trim() || null; });
} else {
  execFile('which', ['soffice'], (e, out) => { if (!e) SOFFICE = String(out).split(/\r?\n/)[0].trim() || null; });
}

const FILE_KINDS = {
  image: new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.ico', '.svg']),
  pdf: new Set(['.pdf']),
  office: new Set(['.doc', '.docx', '.ppt', '.pptx', '.xls', '.xlsx', '.odt', '.odp', '.ods', '.rtf']),
  audio: new Set(['.mp3', '.wav', '.ogg', '.m4a', '.flac']),
  video: new Set(['.mp4', '.webm', '.mov', '.mkv']),
  text: new Set(['.txt', '.md', '.markdown', '.json', '.js', '.jsx', '.ts', '.tsx', '.css', '.html', '.htm', '.xml',
    '.yaml', '.yml', '.csv', '.tsv', '.py', '.java', '.c', '.cpp', '.h', '.hpp', '.cs', '.go', '.rs', '.rb', '.php',
    '.sh', '.ps1', '.sql', '.ini', '.toml', '.env', '.log', '.vue', '.svelte']),
};
function fileKind(ext) { for (const [k, set] of Object.entries(FILE_KINDS)) if (set.has(ext)) return k; return 'binary'; }
const FS_MIME = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp',
  '.bmp': 'image/bmp', '.ico': 'image/x-icon', '.svg': 'image/svg+xml', '.pdf': 'application/pdf',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4', '.flac': 'audio/flac',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime', '.mkv': 'video/x-matroska',
};
const MAX_TEXT_FILE = 4 * 1024 * 1024;

// backgrounds uploaded from Settings → Background (image, GIF or video), kept in data/wallpapers under unique names
const WALL_DIR = path.join(DATA, 'wallpapers');
const WALL_MAX = 512 * 1024 * 1024;
const WALL_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg', '.avif', '.mp4', '.webm', '.mov']);
const wallKind = (ext) => (FILE_KINDS.video.has(ext) ? 'video' : 'image');
function wallpaperPath(name) {
  const b = path.basename(String(name || ''));
  return b && b === name && WALL_EXT.has(path.extname(b).toLowerCase()) ? path.join(WALL_DIR, b) : null;
}
function listWallpapers() {
  let names = [];
  try { names = fs.readdirSync(WALL_DIR); } catch { return []; }
  const out = [];
  for (const name of names) {
    const ext = path.extname(name).toLowerCase();
    if (!WALL_EXT.has(ext)) continue;
    try { const st = fs.statSync(path.join(WALL_DIR, name)); out.push({ file: name, kind: wallKind(ext), size: st.size, mtime: st.mtimeMs }); } catch { /* gone */ }
  }
  return out.sort((a, b) => b.mtime - a.mtime);
}
// streams a raw request body into dir/name (via a .part file); done(size) runs once it is complete and non-empty
function receiveUpload(req, res, dir, name, max, done, allowEmpty) {
  if (Number(req.headers['content-length'] || 0) > max) return json(res, 413, { error: `File is larger than ${max / 1024 / 1024} MB` });
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, name), tmp = file + '.part';
  const out = fs.createWriteStream(tmp);
  let size = 0, over = false;
  const fail = (code, msg) => {
    if (over) return;
    over = true;
    out.destroy();
    fs.rm(tmp, { force: true }, () => {});
    if (!res.headersSent) json(res, code, { error: msg });
  };
  req.on('data', (c) => { size += c.length; if (size > max) { fail(413, `File is larger than ${max / 1024 / 1024} MB`); req.destroy(); } });
  req.on('close', () => { if (!req.complete) fail(400, 'upload aborted'); });
  out.on('error', (e) => fail(500, e.message));
  out.on('finish', () => {
    if (over) return;
    over = true;
    if (!size && !allowEmpty) { fs.rm(tmp, { force: true }, () => {}); return json(res, 400, { error: 'empty file' }); }
    fs.rename(tmp, file, (e) => (e ? json(res, 500, { error: e.message }) : done(file, size)));
  });
  req.pipe(out);
}
function uploadWallpaper(req, res, url) {
  const orig = path.basename(url.searchParams.get('name') || 'wallpaper');
  const ext = path.extname(orig).toLowerCase();
  if (!WALL_EXT.has(ext)) return json(res, 415, { error: 'Use an image, a GIF or a video (png, jpg, gif, webp, avif, mp4, webm, mov)' });
  const stem = path.basename(orig, ext).replace(/[^\w.-]+/g, '-').replace(/^[-.]+|-+$/g, '').slice(0, 40) || 'wallpaper';
  const name = `${Date.now().toString(36)}-${stem}${ext}`;
  receiveUpload(req, res, WALL_DIR, name, WALL_MAX, (file, size) => json(res, 200, { file: name, kind: wallKind(ext), size }));
}

// images pasted or dropped into a terminal: saved to data/pastes, the terminal gets the path (what Claude Code attaches)
const PASTE_DIR = path.join(DATA, 'pastes');
const PASTE_MAX = 64 * 1024 * 1024;
const PASTE_KEEP_MS = 7 * 24 * 3600 * 1000;
const PASTE_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.avif']);
function prunePastes() {
  let names = [];
  try { names = fs.readdirSync(PASTE_DIR); } catch { return; }
  const cutoff = Date.now() - PASTE_KEEP_MS;
  for (const n of names) {
    const f = path.join(PASTE_DIR, n);
    try { if (fs.statSync(f).mtimeMs < cutoff) fs.rmSync(f, { recursive: true, force: true }); } catch { /* gone */ }
  }
}
function pasteStamp() {
  const d = new Date(), pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}-${crypto.randomBytes(2).toString('hex')}`;
}
function uploadPaste(req, res, url) {
  const ext = '.' + String(url.searchParams.get('ext') || 'png').toLowerCase().replace(/^\.+/, '').replace('jpeg', 'jpg');
  if (!PASTE_EXT.has(ext)) return json(res, 415, { error: 'Only images can be pasted (png, jpg, gif, webp, bmp, avif)' });
  receiveUpload(req, res, PASTE_DIR, `paste-${pasteStamp()}${ext}`, PASTE_MAX, (file, size) => { json(res, 200, { path: file, size }); prunePastes(); });
}
// files and folders dropped onto a terminal / the agent input: the browser gets their bytes but never their path, so
// it is found again. A drag from Explorer drags its selection, so the selected items of the open Explorer windows
// come first, then the desktop (not an Explorer window) and the tab's folder. A match has the same name and, for files,
// the same size and modified time. What isn't found (dragged out of a web page, say) gets a folder under data/pastes
// to be copied into.
function shellDropSources() {
  const home = [path.join(os.homedir(), 'Desktop')];
  if (!IS_WIN) return Promise.resolve({ selected: [], folders: home });
  const ps = "[Console]::OutputEncoding = [Text.Encoding]::UTF8; foreach ($w in (New-Object -ComObject Shell.Application).Windows()) { try { foreach ($i in $w.Document.SelectedItems()) { 'S' + $i.Path } } catch {} }; 'D' + [Environment]::GetFolderPath('Desktop'); 'D' + [Environment]::GetFolderPath('CommonDesktopDirectory')";
  return new Promise((ok) => execFile('powershell.exe', ['-NoProfile', '-STA', '-Command', ps], { windowsHide: true, timeout: 8000 }, (e, out) => {
    const lines = String(out || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
    ok({ selected: lines.filter((l) => l[0] === 'S').map((l) => l.slice(1)), folders: [...lines.filter((l) => l[0] === 'D').map((l) => l.slice(1)), ...home] });
  }));
}
async function locateDropped(items, cwd) {   // items: [{ name, size, mtime, dir }] → [path | null]
  const { selected, folders } = await shellDropSources();
  const dirs = [...folders, validDir(resolveFsPath(cwd || ''))].filter(Boolean);
  const same = (file, it) => {
    try {
      const s = fs.statSync(file);
      if (it.dir) return s.isDirectory();
      return s.isFile() && s.size === Number(it.size) && (!it.mtime || Math.abs(Math.floor(s.mtimeMs) - Number(it.mtime)) < 2000);
    } catch { return false; }
  };
  return items.map((it) => {
    const name = path.basename(String((it && it.name) || ''));
    if (!name) return null;
    const lower = name.toLowerCase();
    return [...selected.filter((p) => path.basename(p).toLowerCase() === lower), ...dirs.map((d) => path.join(d, name))].find((c) => same(c, it)) || null;
  });
}
// files and folders brought into the viewer's folder (dropped from Explorer or pasted with Ctrl+V): never overwrite,
// a taken name becomes "name (2).ext" like Explorer does
const DROP_MAX = 4 * 1024 * 1024 * 1024;
function freeName(dir, name) {
  const ext = path.extname(name), stem = name.slice(0, name.length - ext.length);
  let n = 1, out = name;
  while (fs.existsSync(path.join(dir, out))) out = `${stem} (${++n})${ext}`;
  return out;
}
const relParts = (rel) => String(rel || '').split(/[\\/]+/).filter((s) => s && s !== '.' && s !== '..');
function uploadToFolder(req, res, url) {   // raw bytes → dir/rel (rel may have subfolders: a dropped folder's files)
  const dir = validDir(resolveFsPath(url.searchParams.get('dir') || '')), rel = relParts(url.searchParams.get('rel'));
  if (!dir || !rel.length) return json(res, 400, { error: 'bad path' });
  const sub = path.join(dir, ...rel.slice(0, -1));
  receiveUpload(req, res, sub, freeName(sub, rel[rel.length - 1]), DROP_MAX, (file, size) => json(res, 200, { path: file, size }), true);
}
// the files copied in Explorer (Ctrl+C) → copies in dir; [] when the clipboard holds no files
function pasteClipboardFiles(dir) {
  if (!IS_WIN) return Promise.resolve({ files: [], failed: [] });
  const ps = '[Console]::OutputEncoding = [Text.Encoding]::UTF8; Get-Clipboard -Format FileDropList | ForEach-Object { $_.FullName }';
  return new Promise((ok, bad) => execFile('powershell.exe', ['-NoProfile', '-STA', '-Command', ps], { windowsHide: true, timeout: 15000 }, async (e, out) => {
    if (e) return bad(new Error('Could not read the clipboard'));
    const files = [], failed = [];
    for (const src of String(out).split(/\r?\n/).map((s) => s.trim()).filter(Boolean)) {
      try {
        const dest = path.join(dir, freeName(dir, path.basename(src)));
        await fs.promises.cp(src, dest, { recursive: true, errorOnExist: true, force: false, preserveTimestamps: true });
        files.push(dest);
      } catch (err) { failed.push(`${path.basename(src)}: ${err.message}`); }
    }
    ok({ files, failed });
  }));
}
function resolveFsPath(raw, cwd) {
  let p = String(raw || '').trim();
  if (IS_WIN) p = p.replace(/^\/([a-zA-Z])(?=\/)/, '$1:');   // Git Bash style /c/Users/... from Claude's Bash tool
  return p ? path.resolve(expandPath(p, validDir(cwd) || os.homedir())) : null;
}
function looksBinary(buf) { const n = Math.min(buf.length, 8000); for (let i = 0; i < n; i++) if (buf[i] === 0) return true; return false; }
function listDir(dir) {
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    let st;
    try { st = fs.statSync(full); } catch { continue; }
    out.push({ name, path: full, dir: st.isDirectory(), kind: st.isDirectory() ? 'dir' : fileKind(path.extname(name).toLowerCase()), size: st.size, mtime: st.mtimeMs });
  }
  out.sort((a, b) => (a.dir !== b.dir ? (a.dir ? -1 : 1) : a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })));
  return out;
}
function serveFsRaw(req, res, file) {
  let st;
  try { st = fs.statSync(file); } catch { res.writeHead(404); return res.end('not found'); }
  if (!st.isFile()) { res.writeHead(400); return res.end('not a file'); }
  const ext = path.extname(file).toLowerCase();
  const type = FS_MIME[ext] || (fileKind(ext) === 'text' ? 'text/plain; charset=utf-8' : 'application/octet-stream');
  const range = req.headers.range, mm = range && /bytes=(\d*)-(\d*)/.exec(range);
  if (mm) {
    const start = mm[1] ? parseInt(mm[1], 10) : 0, end = mm[2] ? parseInt(mm[2], 10) : st.size - 1;
    if (!Number.isFinite(start) || !Number.isFinite(end) || start > end || end >= st.size) { res.writeHead(416, { 'content-range': `bytes */${st.size}` }); return res.end(); }
    res.writeHead(206, { 'content-type': type, 'accept-ranges': 'bytes', 'cache-control': 'no-store', 'content-range': `bytes ${start}-${end}/${st.size}`, 'content-length': end - start + 1 });
    fs.createReadStream(file, { start, end }).pipe(res);
  } else {
    res.writeHead(200, { 'content-type': type, 'accept-ranges': 'bytes', 'cache-control': 'no-store', 'content-length': st.size });
    fs.createReadStream(file).pipe(res);
  }
}
// office -> PDF conversion (only if LibreOffice is installed), cached per file + mtime under its own hashed folder
const previewCache = new Map();
function convertToPdf(file) {
  const st = fs.statSync(file);
  const key = crypto.createHash('sha1').update(file).digest('hex').slice(0, 16);
  const cached = previewCache.get(key);
  if (cached && cached.mtime === st.mtimeMs) return cached.promise;
  const outDir = path.join(DATA, 'preview-cache', key);
  const outFile = path.join(outDir, path.basename(file, path.extname(file)) + '.pdf');
  const promise = new Promise((resolve, reject) => {
    fs.mkdirSync(outDir, { recursive: true });
    execFile(SOFFICE, ['--headless', '--norestore', '--convert-to', 'pdf', '--outdir', outDir, file], { timeout: 60000, windowsHide: true }, (err) => {
      if (err) return reject(err);
      fs.access(outFile, (e2) => (e2 ? reject(e2) : resolve(outFile)));
    });
  });
  promise.catch(() => previewCache.delete(key));
  previewCache.set(key, { mtime: st.mtimeMs, promise });
  return promise;
}

// ---------------------------------------------------------------- git integration
// Per-turn checkpoints: before and after every agent run the whole working tree (tracked + untracked, minus ignored)
// is written as a dangling commit through a throwaway index, so the user's index, branches and stash are untouched.
// before..after is exactly what the turn changed (Bash/scripts included), and it can be reverted file by file.
// No refs point at those commits: `git gc` drops them after its prune window (2 weeks by default).

function git(args, cwd, { env, buffer, input, timeout = 30000 } = {}) {
  return new Promise((ok) => {
    const child = execFile('git', ['-C', cwd, ...args], { encoding: buffer ? 'buffer' : 'utf8', maxBuffer: 64 * 1024 * 1024, timeout, windowsHide: true, env: env ? { ...process.env, ...env } : process.env },
      (e, out, err) => ok({ code: e ? (typeof e.code === 'number' ? e.code : 1) : 0, out: buffer ? out : String(out || ''), err: String(err || (e && !err ? e.message : '')) }));
    if (input != null) child.stdin.end(input);
  });
}
const IDENT = { GIT_AUTHOR_NAME: 'Hangar', GIT_AUTHOR_EMAIL: 'hangar@localhost', GIT_COMMITTER_NAME: 'Hangar', GIT_COMMITTER_EMAIL: 'hangar@localhost' };
async function snapshot(repo, label) {
  const idx = path.join(os.tmpdir(), `hangar-idx-${process.pid}-${crypto.randomBytes(4).toString('hex')}`);
  try {
    try { fs.copyFileSync(path.join(repo.git, 'index'), idx); } catch { /* no index yet */ }   // reuses the stat cache: only changed files get hashed
    const env = { GIT_INDEX_FILE: idx };
    if ((await git(['add', '-A'], repo.root, { env, timeout: 20000 })).code) return null;
    const tree = (await git(['write-tree'], repo.root, { env })).out.trim();
    if (!tree) return null;
    const head = (await git(['rev-parse', '-q', '--verify', 'HEAD'], repo.root)).out.trim();
    const c = await git(['commit-tree', tree, ...(head ? ['-p', head] : []), '-m', label], repo.root, { env: IDENT });
    return c.code ? null : c.out.trim();
  } finally { fs.rm(idx, { force: true }, () => {}); }
}
const zsplit = (s) => s.split('\0').filter((x, i, a) => i < a.length - 1 || x);
async function turnChanges(g) {
  const after = await snapshot({ root: g.root, git: g.gitdir }, 'hangar: after turn');
  if (!after) return;
  const [ns, st] = await Promise.all([
    git(['diff', '--numstat', '-z', '--no-renames', g.before, after], g.root),
    git(['diff', '--name-status', '-z', '--no-renames', g.before, after], g.root),
  ]);
  const status = new Map(), a = zsplit(st.out);
  for (let i = 0; i + 1 < a.length; i += 2) status.set(a[i + 1], a[i][0]);
  g.files = zsplit(ns.out).map((rec) => {
    const [add, del, file] = rec.split('\t');
    return { path: file, status: status.get(file) || 'M', added: add === '-' ? 0 : +add, removed: del === '-' ? 0 : +del, binary: add === '-' };
  }).filter((f) => f.path).slice(0, 300);
  g.after = after;
}
// File checkpoints: shell/checkpoint-hook.js, a PreToolUse hook on agent runs, copies every file a tool is about to
// change into data/checkpoints/<block>/ — in any folder, git or not (Claude often edits outside the tab's folder). When
// the turn ends the copies are compared with the disk: what differs is what the turn changed (files a git checkpoint
// already lists are left to it), and reverting puts the copies back and deletes the files the turn created.
const CKPT_DIR = path.join(DATA, 'checkpoints');
const AGENT_SETTINGS = path.join(DATA, 'agent-settings.json');
const ckptDir = (blockId) => path.join(CKPT_DIR, String(blockId).replace(/[^\w-]/g, ''));
const sha1 = (buf) => crypto.createHash('sha1').update(buf).digest('hex');
function agentSettings() {   // merged by Claude Code with the user's own settings (their hooks keep running)
  const hook = [process.execPath, path.join(ROOT, 'shell', 'checkpoint-hook.js')].map((p) => `"${p.replace(/\\/g, '/')}"`).join(' ');
  const want = JSON.stringify({ hooks: { PreToolUse: [{ matcher: 'Write|Edit|MultiEdit|NotebookEdit|Bash|PowerShell', hooks: [{ type: 'command', command: hook, timeout: 15 }] }] } }, null, 2);
  let have = '';
  try { have = fs.readFileSync(AGENT_SETTINGS, 'utf8'); } catch { /* first run */ }
  if (have !== want) fs.writeFileSync(AGENT_SETTINGS, want);
  return AGENT_SETTINGS;
}
function readManifest(dir) {   // first entry per file wins: that copy is the file before the turn
  const seen = new Map();
  let text = '';
  try { text = fs.readFileSync(path.join(dir, 'manifest.jsonl'), 'utf8'); } catch { return []; }
  for (const line of text.split('\n')) {
    try { const e = JSON.parse(line); if (e.path && !seen.has(e.path.toLowerCase())) seen.set(e.path.toLowerCase(), e); } catch { /* torn line */ }
  }
  return [...seen.values()];
}
const readOr = (file, fallback = null) => { try { return fs.readFileSync(file); } catch { return fallback; } };
const isBinary = (b) => !!b && b.subarray(0, 8000).includes(0);
function lineCounts(a, b) {   // lines added / removed (as multisets, like the edit chips)
  const split = (buf) => { const t = buf.toString('utf8'); if (!t) return []; const l = t.split(/\r?\n/); if (l[l.length - 1] === '') l.pop(); return l; };
  const left = new Map();
  for (const l of split(a)) left.set(l, (left.get(l) || 0) + 1);
  let added = 0, removed = 0;
  for (const l of split(b)) { const n = left.get(l) || 0; if (n) left.set(l, n - 1); else added++; }
  for (const n of left.values()) removed += n;
  return { added, removed };
}
function fileTurnChanges(block) {
  const dir = ckptDir(block.id), g = block.meta.git, files = [];
  const byGit = new Set(g && g.files ? g.files.map((f) => path.join(g.root, f.path).toLowerCase()) : []);
  for (const e of readManifest(dir)) {
    if (byGit.has(e.path.toLowerCase())) continue;
    const now = readOr(e.path), old = e.existed ? readOr(path.join(dir, 'copies', String(e.copy))) : null;
    if ((e.existed && !old) || (!e.existed && !now) || (old && now && old.equals(now))) continue;
    const binary = isBinary(old) || isBinary(now);
    const counts = binary ? { added: 0, removed: 0 } : lineCounts(old || Buffer.alloc(0), now || Buffer.alloc(0));
    files.push({ path: e.path, status: !e.existed ? 'A' : now ? 'M' : 'D', ...counts, binary, copy: e.copy || null, after: now ? sha1(now) : '' });
  }
  if (files.length) block.meta.files = { files: files.slice(0, 300) };
  else fs.rm(dir, { recursive: true, force: true }, () => {});   // nothing changed: the copies aren't needed
}
// Copies of turns that are gone (deleted, cleared, trimmed) are dropped at startup.
function pruneCheckpoints() {
  const live = new Set();
  for (const t of state.tabs) for (const b of t.blocks || []) live.add(b.id);
  let dirs = [];
  try { dirs = fs.readdirSync(CKPT_DIR); } catch { return; }
  for (const d of dirs) if (!live.has(d)) fs.rm(path.join(CKPT_DIR, d), { recursive: true, force: true }, () => {});
}

// Changed line ranges of a file against an older version — a git revision (HEAD, a turn's checkpoint) or a turn's
// copy ("turn:<block>") — as 0-based [from, to] + pure-deletion points
async function changedLines(file, base) {
  let old;
  if (base.startsWith('turn:')) {
    const [, block] = findBlock(base.slice(5));
    const f = block && block.meta.files && block.meta.files.files.find((x) => x.path.toLowerCase() === file.toLowerCase());
    if (!f || !fs.existsSync(file)) return { lines: [], dels: [] };
    old = f.copy ? readOr(path.join(ckptDir(block.id), 'copies', f.copy), Buffer.alloc(0)) : Buffer.alloc(0);
  } else {
    const repo = gitDir(path.dirname(file));
    if (!repo || !fs.existsSync(file)) return { lines: [], dels: [] };
    const rel = path.relative(repo.root, file).replace(/\\/g, '/');
    const r = await git(['cat-file', '--filters', `${base}:${rel}`], repo.root, { buffer: true });   // --filters: same line endings as a checkout
    old = r.code === 0 ? r.out : Buffer.alloc(0);
  }
  const tmp = path.join(os.tmpdir(), 'hangar-old-' + crypto.randomBytes(4).toString('hex'));
  fs.writeFileSync(tmp, old);
  const d = await git(['diff', '--no-index', '-U0', '--no-color', '--no-ext-diff', tmp, file], path.dirname(file));
  fs.rm(tmp, { force: true }, () => {});
  const lines = [], dels = [];
  for (const m of d.out.matchAll(/^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/gm)) {
    const start = +m[1], count = m[2] == null ? 1 : +m[2];
    if (count) lines.push([start - 1, start + count - 2]); else dels.push(start);
  }
  return { lines, dels };
}
async function repoStatus(dir) {
  const repo = gitDir(dir);
  if (!repo) return null;
  const [st, ns, log] = await Promise.all([
    git(['status', '--porcelain=v1', '-z', '-b', '--untracked-files=all'], repo.root),
    git(['diff', '--numstat', '-z', '--no-renames', 'HEAD'], repo.root),
    git(['log', '-1', '--format=%h %s'], repo.root),
  ]);
  const nums = new Map();
  for (const rec of zsplit(ns.out)) { const [a, d, f] = rec.split('\t'); nums.set(f, { added: a === '-' ? 0 : +a, removed: d === '-' ? 0 : +d }); }
  const out = { root: repo.root, branch: gitBranch(repo), upstream: null, ahead: 0, behind: 0, last: log.out.trim(), files: [] };
  const recs = zsplit(st.out);
  for (let i = 0; i < recs.length; i++) {
    const r = recs[i];
    if (r.startsWith('## ')) {
      const m = r.match(/^## (?:No commits yet on )?([^.\s]+)(?:\.\.\.(\S+))?(?: \[(?:ahead (\d+))?(?:, )?(?:behind (\d+))?\])?/);
      if (m) Object.assign(out, { upstream: m[2] || null, ahead: +(m[3] || 0), behind: +(m[4] || 0) });
      continue;
    }
    const xy = r.slice(0, 2), file = r.slice(3);
    if (xy[0] === 'R' || xy[0] === 'C') i++;   // -z: the original path follows as its own record
    const n = nums.get(file) || { added: 0, removed: 0 };
    if (xy === '??') try {
      const abs = path.join(repo.root, file);
      if (fs.statSync(abs).size < 1e6) { const t = fs.readFileSync(abs, 'utf8'); n.added = t ? t.split('\n').length - (t.endsWith('\n') ? 1 : 0) : 0; }
    } catch { /* gone */ }
    out.files.push({ path: file, abs: path.join(repo.root, file), status: xy === '??' ? '?' : (xy.replace(/\s/g, '')[0] || 'M'), ...n });
    if (out.files.length >= 500) break;
  }
  return out;
}
// Images stay out of Hangar's commits unless ticked one by one in the git panel (includeImages: repo-relative paths)
const IMG_EXTS = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp', 'ico', 'svg', 'tif', 'tiff', 'heic', 'psd'];
const IMG_RE = new RegExp(`\\.(${IMG_EXTS.join('|')})$`, 'i');
const NO_IMAGES = IMG_EXTS.map((e) => `:(exclude,icase)*.${e}`);   // a pathspec * also crosses folders
const cleanIncludes = (list) => (Array.isArray(list) ? list : []).map(String).filter((p) => IMG_RE.test(p) && !p.split(/[\\/]/).includes('..'));
// A commit message from the pending changes (minus left-out images), in the style and language of recent commits
async function commitMessage(root, include = []) {
  const keep = (file) => !IMG_RE.test(file) || include.includes(file);
  const [stat0, diff, recent, untracked0] = await Promise.all([
    git(['status', '--short'], root), git(['diff', 'HEAD', '--no-color', '--no-ext-diff', '--', '.', ...NO_IMAGES], root),
    git(['log', '-8', '--format=%s'], root), git(['ls-files', '--others', '--exclude-standard'], root),
  ]);
  const stat = { out: stat0.out.split('\n').filter((l) => l.trim() && keep(l.slice(3).replace(/^"|"$/g, ''))).join('\n') };
  const untracked = { out: untracked0.out.split('\n').filter((l) => l.trim() && keep(l)).join('\n') };
  if (!stat.out.trim()) throw new Error('nothing to commit (images are left out unless you include them)');
  return new Promise((done, fail) => {
    const prompt = 'Write a git commit message for the changes below. Reply with ONLY the message: a subject line of at most 72 characters in the imperative mood, then (only if it helps) a blank line and a short body. '
      + (recent.out.trim() ? `Match the style and language of these recent commit subjects:\n${recent.out.trim()}\n\n` : '\n')
      + `git status --short:\n${stat.out.slice(0, 4000)}\n\nNew (untracked) files:\n${untracked.out.slice(0, 2000) || '(none)'}\n\ngit diff HEAD:\n${diff.out.slice(0, 60000)}`;
    const bin = resolveClaude();
    let child;
    try { if (!fs.existsSync(PROBE_SETTINGS)) fs.writeFileSync(PROBE_SETTINGS, JSON.stringify({ disableAllHooks: true })); } catch { /* read-only data */ }
    try {
      child = spawn(bin.file, ['-p', '--model', 'haiku', '--output-format', 'text', '--no-session-persistence', '--settings', PROBE_SETTINGS], { cwd: root, env: { ...process.env, HANGAR: '1' }, windowsHide: true, shell: bin.shell });
    } catch (e) { return fail(e); }
    const kill = setTimeout(() => killTree(child), 90000);
    let out = '', err = '';
    child.stdout.on('data', (b) => (out += b));
    child.stderr.on('data', (b) => (err += b));
    child.stdin.on('error', () => {});
    child.stdin.end(prompt);
    child.on('error', fail);
    child.on('close', (code) => { clearTimeout(kill); const msg = out.trim().replace(/^```\w*\n?|```$/g, '').trim(); code === 0 && msg ? done(msg) : fail(new Error(err.trim().slice(-300) || 'claude returned nothing')); });
  });
}
function refreshRepoTabs(root) { for (const t of state.tabs) { const g = gitDir(t.cwd); if (g && g.root === root) refreshGit(t, true); } }

// ---------------------------------------------------------------- HTTP

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};
const json = (res, code, obj) => { res.writeHead(code, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(obj)); };
const readBody = (req) => new Promise((ok, bad) => {
  let s = '';
  req.on('data', (c) => { s += c; if (s.length > 4e6) { bad(new Error('body too large')); req.destroy(); } });
  req.on('end', () => { try { ok(s ? JSON.parse(s) : {}); } catch (e) { bad(e); } });
});
const localHost = (req) => ['127.0.0.1', 'localhost'].includes(String(req.headers.host || '').replace(/:\d+$/, ''));

function info() {
  return { home: os.homedir(), platform: process.platform, shells: availableShells(), defaultShell: defaultShell(), claude: resolveClaude().file, sep: path.sep, version: VERSION, hasOffice: !!SOFFICE };
}

async function api(req, res, url) {
  const m = req.method, p = url.pathname;
  let r;
  if (m === 'GET' && p === '/api/state') { readExternal(true); return json(res, 200, { tabs: state.tabs, activeTabId: state.activeTabId, settings, info: info(), external, usage: claudeInfo.usage || null }); }
  if (m === 'GET' && p === '/api/claude/commands') {
    if (!claudeInfo.commands) await probeClaude(true);
    return json(res, 200, claudeCommands(url.searchParams.get('cwd') || ''));
  }
  if (m === 'POST' && p === '/api/claude/usage') { await probeClaude(true); return json(res, 200, claudeInfo.usage || null); }
  if (m === 'GET' && p === '/api/events') {
    res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
    res.write('retry: 1500\n\n');
    clients.add(res);
    req.on('close', () => clients.delete(res));
    return;
  }

  if (m === 'GET' && p === '/api/git/status') {
    const dir = validDir(url.searchParams.get('cwd'));
    return json(res, 200, (dir && await repoStatus(dir)) || { root: null });
  }
  if (m === 'GET' && p === '/api/git/lines') {
    const file = resolveFsPath(url.searchParams.get('path') || '', url.searchParams.get('cwd'));
    const base = url.searchParams.get('base') || 'HEAD';
    if (!file || !/^(HEAD|[0-9a-f]{7,40}|turn:[\w-]+)$/.test(base)) return json(res, 400, { error: 'bad path or base' });
    return json(res, 200, await changedLines(file, base));
  }
  if (m === 'GET' && p === '/api/fs/stat') {
    const file = resolveFsPath(url.searchParams.get('path') || '', url.searchParams.get('cwd'));
    if (!file) return json(res, 400, { error: 'bad path' });
    try {
      const st = fs.statSync(file), dir = st.isDirectory();
      return json(res, 200, { path: file, exists: true, dir, kind: dir ? 'dir' : fileKind(path.extname(file).toLowerCase()), size: st.size, mtime: st.mtimeMs });
    }
    catch { return json(res, 200, { path: file, exists: false }); }
  }
  if (m === 'GET' && p === '/api/fs/list') {
    let dir = resolveFsPath(url.searchParams.get('dir') || '', url.searchParams.get('cwd'));
    if (!dir) return json(res, 400, { error: 'bad path' });
    let selectFile = null;
    try {
      const st = fs.statSync(dir);
      if (st.isFile()) { selectFile = dir; dir = path.dirname(dir); }
    } catch { return json(res, 404, { error: 'not found' }); }
    try {
      const entries = listDir(dir), parent = path.dirname(dir);
      return json(res, 200, { dir, parent: parent === dir ? null : parent, entries, selectFile });
    } catch (e) { return json(res, e.code === 'EPERM' || e.code === 'EACCES' ? 403 : 500, { error: e.message }); }
  }
  if (m === 'GET' && p === '/api/fs/read') {
    const file = resolveFsPath(url.searchParams.get('path') || '');
    if (!file) return json(res, 400, { error: 'bad path' });
    let st;
    try { st = fs.statSync(file); } catch { return json(res, 404, { error: 'not found' }); }
    if (!st.isFile()) return json(res, 400, { error: 'not a file' });
    if (st.size > MAX_TEXT_FILE) return json(res, 200, { path: file, size: st.size, mtime: st.mtimeMs, truncated: true, text: null });
    let buf;
    try { buf = fs.readFileSync(file); } catch (e) { return json(res, 500, { error: e.message }); }
    if (looksBinary(buf)) return json(res, 200, { path: file, size: st.size, mtime: st.mtimeMs, kind: 'binary', text: null });
    return json(res, 200, { path: file, size: st.size, mtime: st.mtimeMs, text: buf.toString('utf8') });
  }
  if (m === 'GET' && p === '/api/fs/raw') {
    const file = resolveFsPath(url.searchParams.get('path') || '');
    if (!file) return json(res, 400, { error: 'bad path' });
    if (url.searchParams.get('as') === 'pdf') {
      if (!SOFFICE) return json(res, 501, { error: 'LibreOffice not available' });
      let pdf;
      try { pdf = await convertToPdf(file); } catch (e) { return json(res, 500, { error: 'conversion failed: ' + (e.message || e) }); }
      return serveFsRaw(req, res, pdf);
    }
    return serveFsRaw(req, res, file);
  }

  if (m === 'GET' && p === '/api/wallpapers') return json(res, 200, { files: listWallpapers() });
  if (m === 'GET' && p === '/api/wallpaper') {
    const file = wallpaperPath(url.searchParams.get('file'));
    return file ? serveFsRaw(req, res, file) : json(res, 400, { error: 'bad file' });
  }
  if (m === 'POST' && p === '/api/wallpaper') return uploadWallpaper(req, res, url);   // raw bytes, before readBody (JSON only)
  if (m === 'POST' && p === '/api/paste') return uploadPaste(req, res, url);
  if (m === 'POST' && p === '/api/fs/upload') return uploadToFolder(req, res, url);
  if (m === 'DELETE' && p === '/api/wallpaper') {
    const file = wallpaperPath(url.searchParams.get('file'));
    if (!file) return json(res, 400, { error: 'bad file' });
    fs.rm(file, { force: true }, (e) => (e ? json(res, 500, { error: e.message }) : json(res, 200, { ok: true })));
    return;
  }

  const body = m === 'GET' ? {} : await readBody(req);

  if (m === 'PUT' && p === '/api/settings') {
    const wasSync = syncOverlay();
    settings = body && typeof body === 'object' ? body : {};
    if (wasSync && !syncOverlay()) state.tabs.forEach(removeClawd);
    if (!wasSync && syncOverlay()) syncClawdFiles();
    writeAtomic(SETTINGS_FILE, JSON.stringify(settings, null, 2));
    broadcast('settings', { settings, from: req.headers['x-hangar-client'] || '' });
    return json(res, 200, { ok: true });
  }
  if (m === 'PUT' && p === '/api/fs/write') {
    const file = resolveFsPath(body.path || '');
    if (!file) return json(res, 400, { error: 'bad path' });
    try {
      let st = null; try { st = fs.statSync(file); } catch { /* new file */ }
      if (st && st.isDirectory()) return json(res, 400, { error: 'is a directory' });
      writeAtomic(file, String(body.text ?? ''));
      return json(res, 200, { ok: true, mtime: fs.statSync(file).mtimeMs });
    } catch (e) { return json(res, 500, { error: e.message }); }
  }
  if (m === 'POST' && p === '/api/fs/mkdir') {   // a dropped folder: { dir, name } → a new folder (free name), or name as-is with exact
    const dir = validDir(resolveFsPath(body.dir || '')), rel = relParts(body.name);
    if (!dir || !rel.length) return json(res, 400, { error: 'bad path' });
    try {
      const target = body.exact ? path.join(dir, ...rel) : path.join(dir, freeName(dir, rel.join('-')));
      fs.mkdirSync(target, { recursive: true });
      return json(res, 200, { path: target, name: path.basename(target) });
    } catch (e) { return json(res, 500, { error: e.message }); }
  }
  if (m === 'POST' && p === '/api/drop/locate') {   // { items, cwd } → { paths, copyDir }: copyDir only when some weren't found
    const items = Array.isArray(body.items) ? body.items.slice(0, 500) : [];
    const paths = await locateDropped(items, body.cwd);
    let copyDir = null;
    if (paths.includes(null)) { copyDir = path.join(PASTE_DIR, `drop-${pasteStamp()}`); fs.mkdirSync(copyDir, { recursive: true }); prunePastes(); }
    return json(res, 200, { paths, copyDir });
  }
  if (m === 'POST' && p === '/api/fs/paste') {
    const dir = validDir(resolveFsPath(body.dir || ''));
    if (!dir) return json(res, 400, { error: 'bad folder' });
    try { return json(res, 200, await pasteClipboardFiles(dir)); } catch (e) { return json(res, 500, { error: e.message }); }
  }
  if (m === 'POST' && p === '/api/fs/open') {
    const file = resolveFsPath(body.path || '');
    if (!file || !fs.existsSync(file)) return json(res, 404, { error: 'not found' });
    if (IS_WIN) spawn('cmd', ['/c', 'start', '', file], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
    else spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [file], { detached: true, stdio: 'ignore' }).unref();
    return json(res, 200, { ok: true });
  }
  if (m === 'POST' && p === '/api/fs/reveal') {
    const file = resolveFsPath(body.path || '');
    if (!file || !fs.existsSync(file)) return json(res, 404, { error: 'not found' });
    if (IS_WIN) spawn('explorer.exe', ['/select,' + file], { detached: true, stdio: 'ignore' }).unref();
    else if (process.platform === 'darwin') spawn('open', ['-R', file], { detached: true, stdio: 'ignore' }).unref();
    else spawn('xdg-open', [path.dirname(file)], { detached: true, stdio: 'ignore' }).unref();
    return json(res, 200, { ok: true });
  }
  if (m === 'POST' && p === '/api/git/message') {
    const dir = validDir(body.cwd), repo = dir && gitDir(dir);
    if (!repo) return json(res, 400, { error: 'not a git repository' });
    try { return json(res, 200, { message: await commitMessage(repo.root, cleanIncludes(body.includeImages)) }); } catch (e) { return json(res, 500, { error: e.message }); }
  }
  // Commits everything pending except images (unless included), optionally pushes (setting the upstream on the first push)
  if (m === 'POST' && p === '/api/git/commit') {
    const dir = validDir(body.cwd), repo = dir && gitDir(dir);
    const message = String(body.message || '').trim();
    const include = cleanIncludes(body.includeImages);
    if (!repo) return json(res, 400, { error: 'not a git repository' });
    if (!message) return json(res, 400, { error: 'empty commit message' });
    const add = await git(['add', '-A', '--', '.', ...NO_IMAGES], repo.root);
    if (add.code) return json(res, 500, { error: add.err.trim() });
    // images staged some other way (e.g. `git add .` in a terminal) stay out too, unless ticked
    const staged = zsplit((await git(['diff', '--cached', '--name-only', '-z'], repo.root)).out).filter((f) => IMG_RE.test(f) && !include.includes(f));
    if (staged.length) {
      const hasHead = !!(await git(['rev-parse', '-q', '--verify', 'HEAD'], repo.root)).out.trim();
      await git(hasHead ? ['reset', '-q', '--', ...staged] : ['rm', '--cached', '-q', '--', ...staged], repo.root);
    }
    if (include.length) await git(['add', '-A', '--', ...include], repo.root);   // -A: an included image may be a deletion
    if ((await git(['diff', '--cached', '--quiet'], repo.root)).code === 0) return json(res, 400, { error: 'nothing to commit (images are left out unless you include them)' });
    const c = await git(['commit', '-F', '-'], repo.root, { input: message });
    if (c.code) return json(res, 500, { error: (c.out + c.err).trim().slice(-1500) });
    let pushed = null;
    if (body.push) {
      const up = (await git(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'], repo.root)).code === 0;
      const branch = gitBranch(repo);
      const pr = await git(up ? ['push'] : ['push', '-u', 'origin', branch], repo.root, { timeout: 120000 });
      pushed = { ok: pr.code === 0, output: (pr.out + pr.err).trim().slice(-1500) };
    }
    refreshRepoTabs(repo.root);
    return json(res, 200, { ok: true, output: c.out.trim().split('\n')[0], pushed });
  }
  if (m === 'POST' && p === '/api/window') {
    setTimeout(() => openWindow(appUrl), Math.min(5000, Number(body.delay) || 0));
    return json(res, 200, { ok: true });
  }
  if (m === 'POST' && p === '/api/launch') {   // launch.js (Hangar.exe, "Open in Hangar"): a new tab in body.cwd + a window
    const dir = validDir(body.cwd), hadWindow = clients.size > 0;
    if (dir) {
      const t = newTab({ cwd: dir });
      state.activeTabId = t.id;
      broadcast('tab-added', { tab: t, activate: true });
      save();
    }
    if (!hadWindow) openWindow(appUrl);
    return json(res, 200, { ok: true, window: hadWindow });   // window: true → the launcher brings it to the front
  }
  if (m === 'POST' && p === '/api/quit') {   // Hangar.exe --quit (the installer, before updating or uninstalling)
    json(res, 200, { ok: true });
    return setTimeout(shutdown, 50);
  }
  if (m === 'POST' && p === '/api/tabs') {
    const t = newTab(body);
    if (body.activate !== false) state.activeTabId = t.id;
    broadcast('tab-added', { tab: t, activate: body.activate !== false });
    save();
    return json(res, 200, t);
  }
  if (m === 'POST' && p === '/api/tabs/reorder') {
    const order = new Map((body.ids || []).map((id, i) => [id, i]));
    state.tabs.sort((a, b) => (order.get(a.id) ?? 1e9) - (order.get(b.id) ?? 1e9));
    broadcast('tabs-order', { ids: state.tabs.map((t) => t.id) });
    save();
    return json(res, 200, { ok: true });
  }
  if (m === 'POST' && p === '/api/active') {
    const t = findTab(body.tabId);
    if (t) { state.activeTabId = t.id; save(); refreshGit(t, true); }
    return json(res, 200, { ok: true });
  }
  if ((r = p.match(/^\/api\/tabs\/(\w+)(?:\/(\w[\w-]*))?$/))) {
    const tab = findTab(r[1]);
    if (!tab) return json(res, 404, { error: 'no such tab' });
    const action = r[2];
    if (!action && m === 'PATCH') {
      for (const k of ['customTitle', 'color', 'pinned', 'mode']) if (k in body) tab[k] = body[k];
      if ('agentSessionId' in body) { removeClawd(tab); tab.agentSessionId = /^[0-9a-f-]{36}$/i.test(body.agentSessionId || '') ? body.agentSessionId : null; }
      if ('customTitle' in body || 'agentSessionId' in body) writeClawd(tab);
      broadcast('tab', tabMeta(tab));
      save();
      return json(res, 200, tabMeta(tab));
    }
    if (!action && m === 'DELETE') {
      for (const b of tab.blocks) { const pr = procs.get(b.id); if (pr) { pr.killed = true; killTree(pr.child); } }
      const rec = terms.get(tab.id);
      if (rec) { rec.restart = false; killPty(rec); terms.delete(tab.id); }
      fs.unlink(scrollFile(tab.id), () => {});
      removeClawd(tab);
      const idx = state.tabs.indexOf(tab);
      state.tabs.splice(idx, 1);
      const created = state.tabs.length ? null : newTab({});
      if (state.activeTabId === tab.id) state.activeTabId = (state.tabs[Math.min(idx, state.tabs.length - 1)] || state.tabs[0]).id;
      broadcast('tab-removed', { id: tab.id, activeTabId: state.activeTabId });
      if (created) broadcast('tab-added', { tab: created, activate: true });
      save();
      return json(res, 200, { ok: true });
    }
    if (m === 'POST' && action === 'agent') {
      const prompt = String(body.prompt || '').trim();
      if (!prompt) return json(res, 400, { error: 'empty prompt' });
      if (tab.mode !== 'agent') { tab.mode = 'agent'; broadcast('tab', tabMeta(tab)); }
      return json(res, 200, runAgent(tab, prompt, body));
    }
    if (m === 'POST' && action === 'new-conversation') {
      removeClawd(tab);
      tab.agentSessionId = null;
      tab.clawdColor = '';
      broadcast('tab', tabMeta(tab));
      save();
      return json(res, 200, { ok: true });
    }
    if (m === 'POST' && action === 'clear') {
      tab.blocks = tab.blocks.filter((b) => b.status === 'running');
      broadcast('blocks-cleared', { tabId: tab.id, keep: tab.blocks.map((b) => b.id) });
      save();
      return json(res, 200, { ok: true });
    }
  }
  if ((r = p.match(/^\/api\/blocks\/(\w+)(?:\/(\w+))?$/))) {
    const [tab, block] = findBlock(r[1]);
    if (!block) return json(res, 404, { error: 'no such block' });
    const action = r[2];
    const pr = procs.get(block.id);
    if (m === 'POST' && action === 'kill') { if (pr) { pr.killed = true; killTree(pr.child); } return json(res, 200, { ok: true }); }
    // Put every file the turn changed back to its checkpoint (deleting the ones the turn created).
    // Files edited again after the turn are listed first (409) unless the client confirms with force.
    if (m === 'POST' && action === 'revert') {
      const g = block.meta && block.meta.git, fc = block.meta && block.meta.files;
      const gitFiles = g && g.after && g.files && !g.reverted ? g.files : [];
      const copies = fc && fc.files && !fc.reverted ? fc.files : [];
      if (pr) return json(res, 409, { error: 'the turn is still running' });
      if (!gitFiles.length && !copies.length) return json(res, 400, { error: 'no checkpoint for this turn' });
      if (!body.force) {
        const later = [];
        for (const f of gitFiles) {
          const abs = path.join(g.root, f.path);
          const now = fs.existsSync(abs) ? (await git(['hash-object', '--', abs], g.root)).out.trim() : '';
          const then = (await git(['rev-parse', '-q', '--verify', `${g.after}:${f.path}`], g.root)).out.trim();
          if (now !== then) later.push(f.path);
        }
        for (const f of copies) { const now = readOr(f.path); if ((now ? sha1(now) : '') !== f.after) later.push(f.path); }
        if (later.length) return json(res, 409, { error: 'changed after the turn', files: later });
      }
      const failed = [];
      for (const f of gitFiles) {
        const abs = path.join(g.root, f.path);
        try {
          const old = await git(['cat-file', '--filters', `${g.before}:${f.path}`], g.root, { buffer: true });
          if (old.code === 0) { fs.mkdirSync(path.dirname(abs), { recursive: true }); fs.writeFileSync(abs, old.out); }
          else fs.rmSync(abs, { force: true });
        } catch (e) { failed.push(`${f.path}: ${e.message}`); }
      }
      for (const f of copies) {
        try {
          if (f.status === 'A') fs.rmSync(f.path, { force: true });
          else { fs.mkdirSync(path.dirname(f.path), { recursive: true }); fs.writeFileSync(f.path, fs.readFileSync(path.join(ckptDir(block.id), 'copies', f.copy))); }
        } catch (e) { failed.push(`${f.path}: ${e.message}`); }
      }
      // A restored file is written like a checkout (CRLF with autocrlf), so its size can differ from what the index
      // remembers and git status keeps listing it although there's no diff. When its content equals the index entry,
      // `git add` only refreshes that stat info (nothing gets staged); files with other staged content are left alone.
      for (const f of gitFiles) {
        const abs = path.join(g.root, f.path);
        if (!fs.existsSync(abs)) continue;
        const [now, idx] = await Promise.all([git(['hash-object', '--', abs], g.root), git(['ls-files', '-s', '--', f.path], g.root)]);
        if (now.out.trim() && now.out.trim() === (idx.out.split(/\s+/)[1] || '')) await git(['add', '--', f.path], g.root);
      }
      if (gitFiles.length) g.reverted = Date.now();
      if (copies.length) fc.reverted = Date.now();
      pushBlock(tab, block);
      if (gitFiles.length) refreshRepoTabs(g.root);
      return json(res, 200, { ok: !failed.length, files: gitFiles.length + copies.length, failed });
    }
    if (m === 'PATCH' && !action) {
      for (const k of ['bookmarked', 'collapsed']) if (k in body) block[k] = !!body[k];
      pushBlock(tab, block);
      return json(res, 200, { ok: true });
    }
    if (m === 'DELETE' && !action) {
      if (pr) { pr.killed = true; killTree(pr.child); }
      tab.blocks.splice(tab.blocks.indexOf(block), 1);
      fs.rm(ckptDir(block.id), { recursive: true, force: true }, () => {});
      broadcast('block-removed', { tabId: tab.id, id: block.id });
      save();
      return json(res, 200, { ok: true });
    }
  }
  return json(res, 404, { error: 'not found' });
}

function serveFile(res, file, type, transform) {
  fs.readFile(file, (err, buf) => {
    if (err) { res.writeHead(404); return res.end('not found'); }
    if (transform) buf = Buffer.from(transform(buf.toString()));
    res.writeHead(200, { 'content-type': type || MIME[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(buf);
  });
}

const server = http.createServer((req, res) => {
  // Only answer to local names: blocks DNS-rebinding pages from reaching the shells.
  if (!localHost(req)) { res.writeHead(403); return res.end('forbidden'); }
  const url = new URL(req.url, 'http://local');
  if (url.pathname.startsWith('/api/')) {
    const tok = req.headers['x-hangar-token'] || url.searchParams.get('token');
    if (tok !== TOKEN) return json(res, 401, { error: 'bad token' });
    return api(req, res, url).catch((e) => json(res, 500, { error: e.message }));
  }
  if (url.pathname.startsWith('/vendor/')) {
    const rel = VENDOR[url.pathname.slice(8)];
    if (!rel) { res.writeHead(404); return res.end(); }
    return serveFile(res, path.join(NM, rel));
  }
  let rel;
  try { rel = decodeURIComponent(url.pathname); } catch { res.writeHead(400); return res.end('bad url'); }
  if (rel === '/') rel = '/index.html';
  const file = path.normalize(path.join(PUBLIC, rel));
  if (!file.startsWith(PUBLIC + path.sep)) { res.writeHead(403); return res.end(); }
  serveFile(res, file, null, rel === '/index.html' ? (s) => s.replace('__HANGAR_TOKEN__', TOKEN) : null);
});

const wss = new WebSocketServer({ noServer: true, maxPayload: 8 * 1024 * 1024 });
server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, 'http://local');
  const origin = String(req.headers.origin || '');
  const okOrigin = !origin || /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(origin);
  if (url.pathname !== '/ws' || url.searchParams.get('token') !== TOKEN || !localHost(req) || !okOrigin) { socket.destroy(); return; }
  wss.handleUpgrade(req, socket, head, onSocket);
});

// The app window gets its own Edge/Chrome profile so its flags apply: GPU on (default) or --disable-gpu (CPU).
function openWindow(url) {
  if (!IS_WIN) return spawn(process.platform === 'darwin' ? 'open' : 'xdg-open', [url], { detached: true, stdio: 'ignore' }).unref();
  const browser = ['C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe', 'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', path.join(process.env.LOCALAPPDATA || '', 'Google\\Chrome\\Application\\chrome.exe')]
    .find((p) => fs.existsSync(p));
  if (!browser) return spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore', windowsHide: true }).unref();
  const gpu = !(settings.render && settings.render.gpu === false);
  const args = [`--app=${url}`, '--window-size=1400,900', `--user-data-dir=${path.join(DATA, 'window-profile')}`, '--no-first-run', '--no-default-browser-check'];
  args.push(...(gpu ? ['--enable-gpu-rasterization', '--enable-zero-copy'] : ['--disable-gpu', '--disable-gpu-compositing', '--disable-software-rasterizer']));
  spawn(browser, args, { detached: true, stdio: 'ignore' }).unref();
}

// first run / everything closed: start with one tab in the folder Hangar was opened on (launch.js), or home
const LAUNCH_CWD = validDir(process.env.HANGAR_LAUNCH_CWD);
const firstTab = state.tabs.length ? null : newTab({ cwd: LAUNCH_CWD });
if (!findTab(state.activeTabId)) state.activeTabId = state.tabs[0].id;
syncClawdFiles();

const appUrl = `http://${HOST}:${PORT}/`;
server.on('error', (e) => {
  if (e.code === 'EADDRINUSE') {
    console.log(`Hangar is already running at ${appUrl}`);
    if (process.argv.includes('--open')) openWindow(appUrl);
    process.exit(0);
  }
  throw e;
});
server.listen(PORT, HOST, () => {
  console.log(`Hangar running at ${appUrl}`);
  try { writeAtomic(RUN_FILE, JSON.stringify({ port: PORT, token: TOKEN, pid: process.pid, version: VERSION })); } catch { /* read-only data dir */ }
  if (LAUNCH_CWD) {
    state.activeTabId = (firstTab || newTab({ cwd: LAUNCH_CWD })).id;
    save();
  }
  pruneCheckpoints();
  if (process.argv.includes('--open')) openWindow(appUrl);
});

// Installed app (HANGAR_EXIT_WHEN_CLOSED=1, set by Hangar.exe): there's no tray icon, so the server stops once no
// window has been open for a while, like closing Warp. It waits while a command or an agent turn is still running.
if (process.env.HANGAR_EXIT_WHEN_CLOSED === '1') {
  let lastWindow = Date.now() + 40000;   // extra grace for the first window to load
  setInterval(() => {
    if (clients.size) { lastWindow = Date.now(); return; }
    const busy = procs.size > 0 || state.tabs.some((t) => t.term && t.term.running);
    if (!busy && Date.now() - lastWindow > 20000) shutdown();
  }, 5000).unref();
}

let shuttingDown = false;
function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const { child } of procs.values()) killTree(child);
  for (const rec of terms.values()) {
    try { fs.writeFileSync(scrollFile(rec.tabId), rec.buf); } catch { /* best effort */ }
    rec.restart = false;
    killPty(rec);
  }
  state.tabs.forEach(removeClawd);
  flushState();
  try { if (readJson(RUN_FILE, {}).pid === process.pid) fs.unlinkSync(RUN_FILE); } catch { /* already gone */ }
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('SIGHUP', shutdown);   // console window closed (hangar.cmd)
