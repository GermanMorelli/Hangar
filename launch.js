'use strict';
// Entry point of the installed app (Hangar.exe runs it on the bundled Node) and of hangar.cmd:
//   node launch.js [folder]   open Hangar, with a new tab in that folder
//   node launch.js --quit     stop the running Hangar (the installer uses it before updating or uninstalling)
// When Hangar is already running (data/run.json has its port and token) the folder is handed to it and this process
// exits: code 10 means a window was already open, so the launcher brings it to the front. Otherwise the server
// starts here, in this same process.

const fs = require('fs');
const path = require('path');
const http = require('http');

const DATA = process.env.HANGAR_DATA || path.join(__dirname, 'data');
const args = process.argv.slice(2);
const quit = args.includes('--quit');
const folder = args.find((a) => !a.startsWith('--'));
const cwd = folder && isDir(path.resolve(folder)) ? path.resolve(folder) : '';

function isDir(p) { try { return fs.statSync(p).isDirectory(); } catch { return false; } }

function call(run, route, body) {
  return new Promise((resolve) => {
    const data = JSON.stringify(body || {});
    const req = http.request({
      host: '127.0.0.1', port: run.port, path: route, method: 'POST', timeout: 2500,
      headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(data), 'x-hangar-token': run.token },
    }, (res) => {
      let s = '';
      res.on('data', (c) => (s += c));
      res.on('end', () => { try { resolve(res.statusCode === 200 ? JSON.parse(s) : null); } catch { resolve(null); } });
    });
    req.on('timeout', () => req.destroy());
    req.on('error', () => resolve(null));
    req.end(data);
  });
}

(async () => {
  let run = null;
  try { run = JSON.parse(fs.readFileSync(path.join(DATA, 'run.json'), 'utf8')); } catch { /* not running */ }
  if (run && run.port && run.token) {
    const r = await call(run, quit ? '/api/quit' : '/api/launch', { cwd });
    if (r) process.exit(!quit && r.window ? 10 : 0);
  }
  if (quit) process.exit(0);   // nothing (reachable) to stop
  process.env.HANGAR_LAUNCH_CWD = cwd;
  if (!process.argv.includes('--open')) process.argv.push('--open');
  require('./server.js');
})();
