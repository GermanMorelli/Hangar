# Hangar

A Warp-style workspace built around a **real terminal**, where **every visual decision is a setting**. It has
vertical tabs, command blocks, a Claude Code agent view and toolbar, your Clawds, and a theme engine, all in one Node
process. `EVIDENCE.md` documents how Warp implements each of these, with proof taken from the Warp installation on
this machine.

## Install (Windows)
Run `Hangar-Setup-<version>.exe`. The wizard installs for your user only (no admin prompt; it also offers
"all users"), bundles its own Node.js, and adds:
- **Hangar in the Start menu**, so Windows search finds it (plus an optional desktop shortcut).
- **`hangar` in Explorer's address bar** (and Win+R): type it while looking at a folder and Hangar opens a new tab
  there (registered under App Paths).
- **"Open in Hangar"** when you right-click a folder, the background of a folder, or a drive (optional).
- **`hangar` on PATH** (optional): `hangar .` or `hangar C:\some\folder` from any terminal.

If Hangar is already open, all of these add a tab to the open window and bring it to the front instead of starting
a second copy. The installed app keeps its data in `%LOCALAPPDATA%\Hangar` (kept across updates; the uninstaller
asks whether to delete it) and stops on its own about 20 s after its last window closes, unless a command or an
agent turn is still running. Updating is running a newer setup over the old one.

Build the installer (needs Inno Setup 6: `winget install JRSoftware.InnoSetup`):
```
npm install
powershell -ExecutionPolicy Bypass -File installer\build.ps1     # → dist\Hangar-Setup-<version>.exe
```

## Run from source
```
npm install                 # once: node-pty (prebuilt for Windows), ws, xterm.js
node launch.js [folder]     # or double-click hangar.cmd
```
It opens in its own app window (Edge/Chrome `--app`, with its own profile so the GPU flag applies) at
http://127.0.0.1:4747. Data lives in `./data`.

## The terminal
- **Real shells:** each tab is its own PowerShell (or pwsh / cmd / Git Bash) on **ConPTY**, through node-pty with the
  modern bundled `conpty.dll` (the one Windows Terminal uses; it keeps ✓, → and emoji intact). vim, htop, ssh and the
  interactive `claude` all work, and variables, venvs and `cd` persist like in any terminal. Your profile loads, so
  `claude <name>` works.
- **Drawn by xterm.js on the GPU (WebGL).** Settings → Rendering shows which GPU is in use (for example
  *NVIDIA GeForce GTX 1650*). Turning **Hardware acceleration** off switches the terminal to the CPU renderer
  immediately, and *Reopen window* restarts the window with `--disable-gpu`.
- **Command blocks:** shell integration (`shell/hangar.ps1`, `hangar.bash`) marks each command with OSC 633, the same
  marks VS Code uses. Each command gets a bar in the gutter, green for exit 0 and red otherwise. Click it to copy the
  output, copy the command, copy as Markdown, run again or bookmark. **Ctrl+↑/↓** jumps between commands.
- **Paste images:** Ctrl+V or right-click paste an image into the terminal. It's saved to `data/pastes` (kept 7
  days) and its path is pasted, so `claude` attaches it as `[Image #1]`. The same works in the agent input.
- **Drop files and folders** from Explorer onto the terminal or the agent input to paste their **real paths**, as
  Windows Terminal does (quoted when needed for the tab's shell; Git Bash gets `C:/...`). The browser only gets the
  file's bytes, so the server finds it again: the items selected in open Explorer windows, then the desktop and the
  tab's folder, matched by name, size and modified time. Anything it can't find (e.g. dragged out of a web page) is
  copied to `data/pastes/drop-<time>/` and that path is pasted. Rows of the Files drawer can be dragged in too.
- **Find** (Ctrl+Shift+F) with match case, regex and a match counter. Copy/paste works like Windows Terminal:
  Ctrl+C copies when text is selected and interrupts otherwise, Ctrl+V and right-click paste. Ctrl+click opens links.
- **Scrollback survives** reloads and restarts. Each tab keeps its last 2 MB in `data/scroll/<tab>.log`, replayed
  into new windows. A second window sees the same live shells.
- **The tab knows what's running:** title, running command, last exit code, cwd, branch and git diff all come from
  shell integration. When a long command finishes while you're away, you get a notification.

## Files
**Ctrl+Shift+E** (or the folder button) opens a file drawer in the tab's current folder:
- **Text and code** open in an editable view with Save (up to 4 MB).
- **Images, PDF, audio and video** play inside Hangar.
- **Office documents** are shown as PDF when LibreOffice (`soffice`) is installed; the previews are cached in
  `data/preview-cache`.
- **Open** opens the file in its usual app; **Show in folder** reveals it in Explorer.
- In the Claude agent view, Read / Write / Edit / NotebookEdit rows have an eye button that opens the file Claude touched.
- **File paths in the terminal and in Claude's answers are links:** paths that exist (relative to the tab's folder,
  Windows or Git Bash `/c/...` style) are underlined, and one click opens them in the viewer. OSC 8 hyperlinks work too.
- **Preview cards:** when Claude mentions or creates an image or PDF in the agent view, a card with the preview (and
  its size) appears under the answer; click it to open the file.

## Vertical tabs
Each tab has a Clawd or activity indicator, a title from the running or last command (or the Claude session name), a
subtitle (branch / directory / command) and git diff stats (+/−). There's a details card on hover, and you can pin,
drag to reorder, rename (double-click), and set a per-tab or per-directory color. Right-click **+** to open a tab with
a specific shell. Right-click a tab to restart its shell or clear its scrollback.

## Claude Code
- **In the terminal:** run `claude` as usual. While it runs, a bar above the terminal shows its live state (thinking,
  writing, needs you…) from your Clawd hook, plus the folder, branch, diff, and the session id (click it to copy
  `claude --resume`). You get a notification when it needs your OK or finishes while you're away.
- **Agent view** (Ctrl+I or the *Claude agent* switch): headless `claude -p --output-format stream-json` in the
  shell's current folder. Tool calls show as expandable rows, with markdown answers, thinking, turns, cost, context and
  plan usage, plus buttons to retry blocked tool calls. Only the parts of a block that changed are re-rendered while it
  streams.
- **↺ Revert this turn:** every agent turn that changes files ends with "N files changed in this turn" and a button
  that puts them all back (files it created are deleted; if you edited one since, it asks first). Two sources: in a
  git repo, a snapshot of the whole tree before and after the turn; anywhere else, a PreToolUse hook
  (`shell/checkpoint-hook.js`, passed with `--settings data/agent-settings.json`, merged with your own hooks) copies
  each file into `data/checkpoints/<turn>/` right before Write/Edit/MultiEdit/NotebookEdit touch it, and for
  Bash/PowerShell the files named in the command. Not covered: files a command changes without naming them (e.g. a
  script that writes elsewhere) outside a git repo, and `claude` run interactively in the terminal.

## Clawds (tamagotchis)
A web port of the desktop Clawd (`~/.claude/clawd.cs`): the same 18×5 sprite and colors, including the *mimi* cat.
Each tab's indicator is its Clawd: it types while Claude works, walks while a command runs, hops with "?" when it
needs you, looks sad on failure and blinks when idle. The **corral** holds a mini for every Claude Code session, both
Hangar's and other terminals'. They walk, greet with ♥, hop, high-five, nap and whisper. Agent-view sessions stay
alive as minis in the **desktop overlay** too (`CLAWD_HOST`, see `~/.claude/CLAWD.md`).

## Fully customizable design
Open **Settings** (Ctrl+,). Every change applies live and is saved to `data/settings.json`. You can customize:
- **Theme**: 12 design tokens + the 16-color ANSI palette (also used by the terminal), background image or gradient,
  panel opacity, glass blur, 8 presets and your own saved themes. Warp YAML themes import and export.
- **Background & glass**: an image, a GIF or an MP4/WebM video from your computer (button or drag and drop). It is
  saved in `data/wallpapers`, earlier ones stay in a gallery, and videos loop muted and pause while the window is hidden.
  You can set the fit, anchor, dim, blur, video speed, and the panel opacity/blur over it. With a background on,
  agent messages and the input turn **liquid glass** (the *Auto* preset). You can switch to dark glass, translucent,
  solid or the theme's block style, and adjust the tint, opacity, shade, blur and color boost. **Auto contrast** reads
  the background under the panels (every frame of a GIF or video, every 1.5 s) and darkens the glass and panels just
  enough for the text to reach the minimum contrast (4.5:1 by default). On a light theme it lightens them instead.
- **Typography, shape, density, shadows, motion.**
- **Rendering**: GPU on/off, with the detected GPU shown.
- **Terminal**: shell, profile, cursor style/blink/color, line height, padding, scrollback, block bars, copy on
  select, right-click behavior, minimum contrast, smooth scrolling.
- **Vertical tabs, agent blocks, agent input, agent toolbar chips, Clawds, notifications.**
- **Custom CSS**: anything else (e.g. `.xterm .blk.err { background: hotpink }`).

## Shortcuts
| Keys | Action |
|---|---|
| Ctrl+I | Terminal ⇄ Claude agent view |
| Ctrl+↑ / Ctrl+↓ | Previous / next command (terminal) · select blocks (agent view) |
| Ctrl+Shift+F | Find in terminal |
| Ctrl+Shift+E | Files |
| Ctrl+C / Ctrl+V | Copy selection (or interrupt) / paste |
| Alt+T · Alt+W · Alt+1…9 · Alt+↑/↓ · Ctrl+Tab | New tab · close · jump · previous/next |
| Ctrl+B · Alt+V · Ctrl+, | Tabs panel · compact view · settings |
Everything else goes to the shell (Ctrl+L, Tab completion, PSReadLine history…).

## Architecture
```
server.js           http + SSE (metadata), WebSocket /ws (terminal I/O), node-pty shells, OSC 633 parser,
                    Claude Code bridge, git (branch from .git/HEAD, diff on demand), Clawd sync, /api/fs (Files)
shell/hangar.ps1    PowerShell integration (prompt + PSReadLine hooks → OSC 633), UTF-8 console
shell/hangar.bash   the same for Git Bash
shell/checkpoint-hook.js  PreToolUse hook of agent runs: copies files before tools change them (↺ Revert this turn)
public/app.js       tabs, terminals (xterm.js + WebGL), blocks, agent view, settings, Clawds, notifications
public/clawd.js     Clawd sprite, poses and the corral (port of ~/.claude/clawd.cs)
public/settings.js  DEFAULTS (settings shape), THEMES, FORM (the settings drawer)
brand/build.js      the logo (hangar arch whose ribs are the theme's palette); regenerates public/icon.svg, icon-*.png
                    and the tabs-panel mark in index.html (that one is inline and re-tints with the active theme)
launch.js           entry point: hands [folder] to the running Hangar (data/run.json has its port and token) or starts
                    the server; --quit stops it
installer/          Hangar.cs (Hangar.exe, the windowless launcher), hangar.iss (the Inno Setup wizard), build.ps1
test/smoke.js       end-to-end: real shell over the WebSocket, Files API (HANGAR_TEST_AGENT=1 adds a real Claude prompt)
```
Security: the server binds `127.0.0.1` only. It rejects other `Host` headers and foreign WebSocket origins, and every
API/WebSocket call needs a random token generated per run.

## Performance (measured on this machine)
- **Idle page:** ~1% of one core (corral animating), 3.7 MB JS heap.
- **20,000 lines** (1.4 MB): the window keeps up with the shell. It finishes when PowerShell finishes (~5.6 s; the
  same command takes 4.6 s through raw ConPTY). Writing the same 1.4 MB straight into the terminal takes ~110 ms on
  the GPU.
- **`state.json` stays small** (a few KB): scrollback lives in its own files, saved every 5 s while it changes.
- **Git polling:** the branch comes from a file read; `git diff` runs only for the active tab (every 5 s), for the
  others every 30 s, and nothing runs when no window is open.
- **Slow windows:** if a window can't keep up, its shell is paused until it drains (backpressure at 4 MB).

## Limits
- Agent view is headless (`claude -p`), so it can't ask permission mid-run. For full interactivity, run `claude` in
  the terminal.
- No split panes, workflows or Warp Drive yet.

## Test
```
npm test                       # real shell: UTF-8, exit codes, persistence, cwd, stdin, Ctrl+C, replay, scrollback files, Clawd sync
HANGAR_TEST_AGENT=1 npm test   # + a real Claude Code round trip (haiku, < $0.01)
```
