'use strict';
// End-to-end test: boots the server on a spare port with throwaway data + Clawd dirs, then drives a real shell
// over the same WebSocket the UI uses, and the HTTP/SSE API for everything else.
// HANGAR_TEST_AGENT=1 also runs a real (cheap, haiku) Claude Code prompt.
const { spawn } = require('child_process');
const http = require('http');
const os = require('os');
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const WebSocket = require('ws');

const PORT = 4799;
const DATA = fs.mkdtempSync(path.join(os.tmpdir(), 'hangar-test-'));
const CLAWD = path.join(DATA, 'clawd_sessions');   // never touch the real ~/.claude/clawd_sessions
const BASE = `http://127.0.0.1:${PORT}`;
let token = '';
const events = [];
const done = [];   // cmd-done events

function req(method, url, body) {
  return new Promise((ok, bad) => {
    const r = http.request(BASE + url, { method, headers: { 'content-type': 'application/json', 'x-hangar-token': token } }, (res) => {
      let s = '';
      res.on('data', (c) => (s += c));
      res.on('end', () => { try { ok({ status: res.statusCode, body: s ? JSON.parse(s) : null, raw: s }); } catch { ok({ status: res.statusCode, raw: s }); } });
    });
    r.on('error', bad);
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, ms = 20000, what = 'condition') {
  const end = Date.now() + ms;
  while (Date.now() < end) { const v = await fn(); if (v) return v; await wait(100); }
  throw new Error('timed out waiting for ' + what);
}

(async () => {
  const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env: { ...process.env, HANGAR_PORT: PORT, HANGAR_DATA: DATA, CLAWD_SESSIONS_DIR: CLAWD }, stdio: 'pipe' });
  srv.stderr.on('data', (d) => process.stderr.write(d));
  let ok = false, ws = null;
  try {
    await until(async () => { try { return (await req('GET', '/')).status === 200; } catch { return false; } }, 10000, 'server');
    const html = (await req('GET', '/')).raw;
    token = html.match(/name="hangar-token" content="([0-9a-f]+)"/)[1];
    for (const v of ['xterm.js', 'addon-webgl.js', 'xterm.css']) assert.strictEqual((await req('GET', '/vendor/' + v)).status, 200, 'vendor ' + v);

    const good = token;
    token = 'nope';
    assert.strictEqual((await req('GET', '/api/state')).status, 401, 'bad token rejected');
    token = good;

    http.get(`${BASE}/api/events?token=${token}`, (res) => {
      let buf = '';
      res.on('data', (c) => {
        buf += c;
        let i;
        while ((i = buf.indexOf('\n\n')) >= 0) {
          const chunk = buf.slice(0, i); buf = buf.slice(i + 2);
          const ev = (chunk.match(/^event: (.*)$/m) || [])[1];
          if (!ev) continue;
          events.push(ev);
          if (ev === 'cmd-done') done.push(JSON.parse(chunk.match(/^data: (.*)$/m)[1]));
        }
      });
    }).on('error', () => {});

    // a WebSocket with a bad token is refused
    await new Promise((res) => { const bad = new WebSocket(`ws://127.0.0.1:${PORT}/ws?token=nope`); bad.on('error', res); bad.on('close', res); });
    const tab = (await req('POST', '/api/tabs', { cwd: os.tmpdir() })).body;
    ws = new WebSocket(`ws://127.0.0.1:${PORT}/ws?token=${token}`, { origin: BASE });
    await new Promise((res, rej) => { ws.on('open', res); ws.on('error', rej); });
    let out = '';
    ws.on('message', (m) => { const j = JSON.parse(m); if (j.tab === tab.id && (j.t === 'o' || j.t === 'replay')) out += j.d; });
    const send = (d) => ws.send(JSON.stringify({ t: 'in', tab: tab.id, d }));
    ws.send(JSON.stringify({ t: 'attach', tab: tab.id, cols: 120, rows: 30 }));
    const st0 = (await req('GET', '/api/state')).body;
    console.log('shells:', st0.info.shells.join(', '));
    await until(() => /\x1b\]633;B/.test(out), 20000, 'first prompt (shell integration loaded)');
    console.log('✓ real PowerShell started with shell integration');

    const run = async (cmd, ms = 20000) => {
      const n = done.length;
      send(cmd + '\r');
      return until(() => done.length > n && done[done.length - 1], ms, 'cmd-done for ' + cmd);
    };

    let c = await run('Write-Output "hola ñandú ✓ 😀"');
    assert.strictEqual(c.exitCode, 0);
    assert.strictEqual(c.command, 'Write-Output "hola ñandú ✓ 😀"', 'command line reported: ' + c.command);
    assert.ok(out.includes('hola ñandú ✓ 😀'), 'UTF-8 in and out');
    console.log('✓ command block: exit 0, UTF-8 (ñ ✓ 😀) round trip');

    c = await run('cmd /c exit 3');
    assert.strictEqual(c.exitCode, 3);
    c = await run('Get-Item C:/definitely/not/here');
    assert.strictEqual(c.exitCode, 1, 'cmdlet error is 1, not the stale native code');
    console.log('✓ exit codes: native 3, cmdlet error 1');

    await run('$x = 41');
    await run('Write-Output ($x + 1)');
    assert.ok(/\b42\b/.test(out), 'variables persist between commands');
    console.log('✓ real session: variables persist');

    const sub = fs.mkdtempSync(path.join(os.tmpdir(), 'hangar-cd-'));
    await run(`Set-Location "${sub}"`);
    await until(async () => (await req('GET', '/api/state')).body.tabs.find((t) => t.id === tab.id).cwd.toLowerCase() === sub.toLowerCase(), 5000, 'cwd tracked');
    console.log('✓ cwd tracked from the shell');

    const n1 = done.length;
    send('node -e "process.stdin.once(\'data\', d => { console.log(\'got:\' + d.toString().trim()); process.exit(0) })"\r');
    await wait(1500);
    send('ping\r');
    await until(() => done.length > n1, 15000, 'interactive program finished');
    assert.ok(out.includes('got:ping'), 'interactive stdin');
    console.log('✓ interactive programs get keyboard input');

    const n2 = done.length;
    send('Start-Sleep -Seconds 30\r');
    await wait(1500);
    const t0 = Date.now();
    send('\x03');   // Ctrl+C
    await until(() => done.length > n2, 8000, 'Ctrl+C interrupts');
    console.log(`✓ Ctrl+C interrupts a running command (${Date.now() - t0} ms)`);

    send('Start-Sleep -Milliseconds 2500\r');
    await until(async () => (await req('GET', '/api/state')).body.tabs.find((t) => t.id === tab.id).term.running, 5000, 'running state');
    await until(async () => !(await req('GET', '/api/state')).body.tabs.find((t) => t.id === tab.id).term.running, 8000, 'finished state');
    console.log('✓ the tab knows what is running');

    const ws2 = new WebSocket(`ws://127.0.0.1:${PORT}/ws?token=${token}`, { origin: BASE });
    const replay = await new Promise((res) => {
      ws2.on('open', () => ws2.send(JSON.stringify({ t: 'attach', tab: tab.id, cols: 100, rows: 30 })));
      ws2.on('message', (m) => { const j = JSON.parse(m); if (j.t === 'replay') res(j.d); });
    });
    assert.ok(replay.includes('hola ñandú ✓ 😀'), 'replay has scrollback');
    ws2.close();
    console.log('✓ scrollback replays into a second window');

    await req('PATCH', `/api/tabs/${tab.id}`, { customTitle: 'smoke', color: '#ff00aa', pinned: true });
    await req('PUT', '/api/settings', { version: 2, themeName: 'Dracula', tabs: { position: 'right' }, render: { gpu: false } });
    const s2 = (await req('GET', '/api/state')).body;
    assert.strictEqual(s2.tabs.find((t) => t.id === tab.id).customTitle, 'smoke');
    assert.strictEqual(s2.settings.render.gpu, false);
    console.log('✓ tab patch + settings');

    // Clawd overlay sync: an agent tab owns a session file (host hangar, pid 0) until it closes
    const sid = '33333333-3333-4333-8333-333333333333';
    const t3 = (await req('POST', '/api/tabs', { cwd: os.tmpdir(), mode: 'agent', title: 'mimi' })).body;
    await req('PATCH', `/api/tabs/${t3.id}`, { agentSessionId: sid });
    const cf = path.join(CLAWD, sid + '.json');
    const cs = JSON.parse(fs.readFileSync(cf, 'utf8'));
    assert.strictEqual(cs.host, 'hangar'); assert.strictEqual(cs.pid, 0); assert.strictEqual(cs.tab, t3.id); assert.strictEqual(cs.skin, 'mimi');
    await until(async () => (await req('GET', '/api/state')).body.external.some((e) => e.sid === sid), 6000, 'external sees the hangar session');
    await req('DELETE', `/api/tabs/${t3.id}`);
    assert.ok(!fs.existsSync(cf), 'session file removed with the tab');
    console.log('✓ Clawd session file lifecycle');

    if (process.env.HANGAR_TEST_AGENT) {
      const t4 = (await req('POST', '/api/tabs', { cwd: os.tmpdir(), mode: 'agent' })).body;
      const a0 = (await req('POST', `/api/tabs/${t4.id}/agent`, { prompt: 'Reply with exactly: HANGAR-OK. Do not use tools.', model: 'haiku' })).body;
      const a = await until(async () => { const b = (await req('GET', '/api/state')).body.tabs.find((t) => t.id === t4.id).blocks.find((x) => x.id === a0.id); return b && b.status !== 'running' ? b : null; }, 90000, 'agent');
      const text = a.events.filter((e) => e.type === 'text').map((e) => e.text).join('');
      assert.match(text, /HANGAR-OK/, 'agent replied: ' + JSON.stringify(a.events).slice(0, 300) + ' ' + a.stderr);
      const af = JSON.parse(fs.readFileSync(path.join(CLAWD, a.meta.sessionId + '.json'), 'utf8'));
      assert.strictEqual(af.host, 'hangar');
      console.log(`✓ Claude Code agent: "${text.trim()}" · $${a.meta.cost}`);
    }

    // file viewer: list / read / write / raw over the fs API
    const fdir = fs.mkdtempSync(path.join(os.tmpdir(), 'hangar-fs-'));
    const fpath = path.join(fdir, 'note.md');
    fs.writeFileSync(fpath, 'hello\n');
    let r = await req('GET', `/api/fs/list?dir=${encodeURIComponent(fdir)}`);
    assert.strictEqual(r.body.entries.length, 1);
    assert.strictEqual(r.body.entries[0].kind, 'text');
    r = await req('GET', `/api/fs/list?dir=${encodeURIComponent(fpath)}`);
    assert.strictEqual(r.body.selectFile, fpath, 'pointing fs/list at a file resolves its folder + selects it');
    r = await req('GET', `/api/fs/read?path=${encodeURIComponent(fpath)}`);
    assert.strictEqual(r.body.text, 'hello\n');
    await req('PUT', '/api/fs/write', { path: fpath, text: 'edited\n' });
    r = await req('GET', `/api/fs/read?path=${encodeURIComponent(fpath)}`);
    assert.strictEqual(r.body.text, 'edited\n', 'write + read round trip');
    r = await req('GET', `/api/fs/raw?path=${encodeURIComponent(fpath)}`);
    assert.strictEqual(r.raw, 'edited\n', 'raw serves bytes, not JSON');
    // files dropped on the viewer: raw upload into the folder, never overwriting; dropped folders get a free name
    const drop = (rel, buf) => new Promise((done2, bad) => {
      const u = http.request(BASE + `/api/fs/upload?dir=${encodeURIComponent(fdir)}&rel=${encodeURIComponent(rel)}`, { method: 'POST', headers: { 'content-type': 'application/octet-stream', 'x-hangar-token': token } }, (res) => {
        let s = '';
        res.on('data', (c) => (s += c));
        res.on('end', () => done2({ status: res.statusCode, body: JSON.parse(s) }));
      });
      u.on('error', bad);
      u.end(buf);
    });
    r = await drop('note.md', Buffer.from('dropped'));
    assert.strictEqual(r.body.path, path.join(fdir, 'note (2).md'), 'a taken name becomes "name (2).ext"');
    assert.strictEqual(fs.readFileSync(fpath, 'utf8'), 'edited\n', 'the existing file is untouched');
    assert.strictEqual((await drop('vacío.txt', Buffer.alloc(0))).status, 200, 'empty files can be dropped');
    r = await req('POST', '/api/fs/mkdir', { dir: fdir, name: 'carpeta' });
    assert.strictEqual(r.body.name, 'carpeta');
    assert.strictEqual((await req('POST', '/api/fs/mkdir', { dir: fdir, name: 'carpeta' })).body.name, 'carpeta (2)', 'a dropped folder never merges');
    r = await drop('carpeta/sub/deep.js', Buffer.from('x'));
    assert.ok(fs.existsSync(path.join(fdir, 'carpeta', 'sub', 'deep.js')), 'subfolders of a dropped folder are created');
    await drop('../escape.txt', Buffer.from('x'));
    assert.ok(!fs.existsSync(path.join(fdir, '..', 'escape.txt')) && fs.existsSync(path.join(fdir, 'escape.txt')), '.. in rel stays inside the folder');
    // files dropped on a terminal: found again by name + size + mtime (folders by name); the rest get a copy folder
    const fst = fs.statSync(fpath);
    r = await req('POST', '/api/drop/locate', { cwd: fdir, items: [
      { name: 'note.md', size: fst.size, mtime: Math.floor(fst.mtimeMs) },
      { name: 'carpeta', dir: true },
      { name: 'note.md', size: fst.size + 1, mtime: Math.floor(fst.mtimeMs) },
      { name: 'no-such-file.bin', size: 3, mtime: 0 },
    ] });
    assert.deepStrictEqual(r.body.paths, [fpath, path.join(fdir, 'carpeta'), null, null], 'dropped files are located, a different size is not a match');
    assert.ok(r.body.copyDir && path.dirname(r.body.copyDir) === path.join(DATA, 'pastes') && fs.statSync(r.body.copyDir).isDirectory(), 'a copy folder under data/pastes');
    assert.strictEqual((await req('POST', '/api/drop/locate', { cwd: fdir, items: [{ name: 'carpeta', dir: true }] })).body.copyDir, null, 'no copy folder when all were found');
    fs.rmSync(r.body.copyDir, { recursive: true, force: true });
    fs.rmSync(fdir, { recursive: true, force: true });
    console.log('✓ file viewer: list/read/write/raw/drop');

    // backgrounds: raw upload → data/wallpapers, list, serve with Range (video), delete; no other names or types
    const upload = (name, buf) => new Promise((done2, bad) => {
      const u = http.request(BASE + `/api/wallpaper?name=${encodeURIComponent(name)}`, { method: 'POST', headers: { 'content-type': 'application/octet-stream', 'x-hangar-token': token } }, (res) => {
        let s = '';
        res.on('data', (c) => (s += c));
        res.on('end', () => done2({ status: res.statusCode, body: JSON.parse(s) }));
      });
      u.on('error', bad);
      u.end(buf);
    });
    const vid = Buffer.alloc(4096, 7);
    r = await upload('mi fondo.mp4', vid);
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body.kind, 'video');
    const wfile = r.body.file;
    assert.ok(fs.existsSync(path.join(DATA, 'wallpapers', wfile)), 'stored in data/wallpapers');
    assert.strictEqual((await upload('virus.exe', vid)).status, 415, 'only images and videos');
    r = await req('GET', '/api/wallpapers');
    assert.deepStrictEqual(r.body.files.map((x) => x.file), [wfile]);
    const part = await new Promise((done2) => http.get(BASE + `/api/wallpaper?file=${encodeURIComponent(wfile)}&token=${token}`, { headers: { range: 'bytes=0-99' } }, (res) => { res.resume(); done2(res); }));
    assert.strictEqual(part.statusCode, 206, 'video seeks with Range');
    r = await req('GET', `/api/wallpaper?file=${encodeURIComponent('..\\settings.json')}`);
    assert.strictEqual(r.status, 400, 'no paths outside data/wallpapers');
    await req('DELETE', `/api/wallpaper?file=${encodeURIComponent(wfile)}`);
    assert.strictEqual((await req('GET', '/api/wallpapers')).body.files.length, 0, 'deleted');
    console.log('✓ backgrounds: upload/list/range/delete');

    // images pasted into a terminal: saved under data/pastes, the path comes back (what gets pasted)
    const pasteImg = (ext) => new Promise((done2, bad) => {
      const u = http.request(BASE + `/api/paste?ext=${ext}`, { method: 'POST', headers: { 'content-type': 'application/octet-stream', 'x-hangar-token': token } }, (res) => {
        let s = '';
        res.on('data', (c) => (s += c));
        res.on('end', () => done2({ status: res.statusCode, body: JSON.parse(s) }));
      });
      u.on('error', bad);
      u.end(Buffer.from('89504e470d0a1a0a', 'hex'));
    });
    r = await pasteImg('png');
    assert.strictEqual(r.status, 200);
    assert.strictEqual(path.dirname(r.body.path), path.join(DATA, 'pastes'));
    assert.ok(/paste-\d{8}-\d{6}-[0-9a-f]{4}\.png$/.test(r.body.path) && fs.existsSync(r.body.path), 'image saved with a timestamped name');
    assert.strictEqual((await pasteImg('exe')).status, 415, 'only images');
    console.log('✓ pasted images: saved to data/pastes');

    const seen = new Set(events);
    for (const e of ['tab', 'cmd-done']) assert.ok(seen.has(e), 'SSE delivered ' + e);

    // scrollback is saved to its own file (every 5 s while it changes); state.json stays small
    await wait(6500);
    ws.close();
    const scroll = fs.readFileSync(path.join(DATA, 'scroll', tab.id + '.log'), 'utf8');
    assert.ok(scroll.includes('hola ñandú'), 'scrollback saved');
    const stateKB = fs.statSync(path.join(DATA, 'state.json')).size / 1024;
    assert.ok(stateKB < 50, 'state.json small: ' + stateKB.toFixed(1) + ' KB');
    console.log(`✓ scrollback in data/scroll (${(scroll.length / 1024).toFixed(1)} KB), state.json ${stateKB.toFixed(1)} KB`);
    ok = true;
  } catch (e) {
    console.error('✗', e.stack || e.message);
  } finally {
    try { if (ws) ws.close(); } catch { /* closed */ }
    srv.kill();
    await wait(400);
    try { fs.rmSync(DATA, { recursive: true, force: true }); } catch { /* still locked */ }
    console.log(ok ? '\nALL PASSED' : '\nFAILED');
    process.exit(ok ? 0 : 1);
  }
})();
