'use strict';
// Claude Code PreToolUse hook for Hangar's agent runs (wired with --settings, see agentSettings() in server.js): before
// a tool changes files, keep a copy of each one as it was, so the turn can be rolled back in any folder, git or not.
// Write/Edit/MultiEdit/NotebookEdit name their file; for Bash/PowerShell the files are guessed from the command text
// (paths that exist, or that could be created next to existing folders). Only the first copy of a file per turn is
// kept: that's its state before the turn. Copies go to $HANGAR_CHECKPOINT (one folder per turn):
//   manifest.jsonl  one line per file: { path, existed, copy }      copies/<n>  the old contents
// Never blocks the tool: any problem just means no copy.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DIR = process.env.HANGAR_CHECKPOINT;
const MAX_FILE = 5 * 1024 * 1024, MAX_GUESSES = 40;

function main(input) {
  if (!DIR) return;
  const ev = JSON.parse(input), i = ev.tool_input || {}, cwd = ev.cwd || process.cwd();
  let files = [];
  if (['Write', 'Edit', 'MultiEdit'].includes(ev.tool_name)) files = [i.file_path];
  else if (ev.tool_name === 'NotebookEdit') files = [i.notebook_path];
  else if (ev.tool_name === 'Bash' || ev.tool_name === 'PowerShell') files = guess(String(i.command || ''), cwd);
  files = files.filter(Boolean).map((f) => path.resolve(cwd, toWin(f)));
  if (!files.length) return;

  fs.mkdirSync(path.join(DIR, 'copies'), { recursive: true });
  const manifest = path.join(DIR, 'manifest.jsonl');
  let seen = '';
  try { seen = fs.readFileSync(manifest, 'utf8'); } catch { /* first file of the turn */ }
  const known = new Set(seen.split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l).path.toLowerCase(); } catch { return ''; } }));
  for (const file of new Set(files)) {
    if (known.has(file.toLowerCase()) || /[\\/](\.git|node_modules)[\\/]/i.test(file)) continue;
    let st = null;
    try { st = fs.statSync(file); } catch { /* doesn't exist yet */ }
    if (st && (!st.isFile() || st.size > MAX_FILE)) continue;
    const entry = { path: file, existed: !!st };
    if (st) {
      entry.copy = crypto.randomBytes(6).toString('hex');
      fs.copyFileSync(file, path.join(DIR, 'copies', entry.copy));
    }
    fs.appendFileSync(manifest, JSON.stringify(entry) + '\n');
  }
}

// Git Bash style /c/Users/... → C:/Users/...
const toWin = (p) => (process.platform === 'win32' ? p.replace(/^\/([a-zA-Z])(?=\/)/, '$1:') : p);

// File paths in a shell command: quoted or bare tokens with a file extension, resolved against the cwd and every folder
// the command cd's into. Kept if the file exists, or if its folder does (the command may create it).
function guess(cmd, cwd) {
  const dirs = [cwd];
  for (const m of cmd.matchAll(/(?:^|[;&|(\s])(?:cd|Set-Location|pushd)\s+(?:-LiteralPath\s+|-Path\s+)?("[^"]+"|'[^']+'|[^\s;&|)]+)/gi)) {
    const d = path.resolve(cwd, toWin(m[1].replace(/^["']|["']$/g, '')));
    if (isDir(d)) dirs.push(d);
  }
  const out = [];
  // quoted strings (paths with spaces) and bare runs, also inside quotes (e.g. a script's writeFileSync('x.js'))
  const toks = [...cmd.matchAll(/"([^"\n]+)"|'([^'\n]+)'/g)].map((m) => m[1] || m[2]).concat(cmd.match(/[^\s"'`;&|<>(){}=,]+/g) || []);
  for (const raw of new Set(toks)) {
    const tok = toWin(raw.replace(/^[@:]/, ''));
    if (!/\.[A-Za-z0-9]{1,10}$/.test(tok) || /^[a-z]+:\/\//i.test(tok) || tok.length > 260) continue;
    // an existing file wins; otherwise the folder the command moved to last (where it's most likely to write)
    const cands = path.isAbsolute(tok) ? [path.resolve(tok)] : dirs.map((d) => path.resolve(d, tok));
    const f = cands.find(isFile) || [...cands].reverse().find((c) => isDir(path.dirname(c)));
    if (f) out.push(f);
    if (out.length >= MAX_GUESSES) break;
  }
  return out;
}
function isDir(p) { try { return fs.statSync(p).isDirectory(); } catch { return false; } }
function isFile(p) { try { return fs.statSync(p).isFile(); } catch { return false; } }

let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => (input += c));
process.stdin.on('end', () => { try { main(input); } catch { /* never block the tool */ } process.exit(0); });
