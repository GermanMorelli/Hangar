// Hangar design system: every visual decision is a setting.
// DEFAULTS = the shape of settings.json, THEMES = built-in presets, FORM = what the settings drawer renders.
(function () {
  'use strict';

  const ANSI_NAMES = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white'];

  const THEMES = {
    Midnight: {
      background: '#0d0f14', surface: '#141821', surface2: '#1b202b', foreground: '#e3e6ee', muted: '#8a93a6', border: '#262c39',
      accent: '#7c6cff', accentFg: '#ffffff', success: '#3fb950', error: '#f85149', warning: '#d29922', info: '#58a6ff',
      ansi: ['#1c2029', '#ff6b6b', '#5fd38d', '#f5c26b', '#6aa8ff', '#c08cff', '#5ed4e6', '#d8dce6', '#4b5263', '#ff8f8f', '#7fe3a7', '#ffd88f', '#8fbfff', '#d4a8ff', '#86e3f0', '#ffffff'],
      backgroundImage: '', panelOpacity: 1, blur: 0,
    },
    Paper: {
      background: '#f7f6f3', surface: '#ffffff', surface2: '#f0eee9', foreground: '#23262d', muted: '#6b7280', border: '#e2dfd8',
      accent: '#4f46e5', accentFg: '#ffffff', success: '#1a7f37', error: '#cf222e', warning: '#9a6700', info: '#0969da',
      ansi: ['#24292f', '#cf222e', '#116329', '#7d4e00', '#0550ae', '#8250df', '#1b7c83', '#6e7781', '#57606a', '#a40e26', '#1a7f37', '#9a6700', '#0969da', '#a475f9', '#3192aa', '#8c959f'],
      backgroundImage: '', panelOpacity: 1, blur: 0,
    },
    Claude: {
      background: '#1f1d1a', surface: '#262420', surface2: '#2e2b26', foreground: '#ece6dc', muted: '#a39b8f', border: '#3a362f',
      accent: '#d77757', accentFg: '#1f1d1a', success: '#7fb069', error: '#e5675a', warning: '#e0b45a', info: '#7aa6d8',
      ansi: ['#2e2b26', '#e5675a', '#7fb069', '#e0b45a', '#7aa6d8', '#c792c9', '#6fc2b5', '#d8d0c4', '#5a544a', '#f08a7e', '#9fcd88', '#f0cc7c', '#9cc0e8', '#ddb0de', '#8fd8cc', '#fbf6ee'],
      backgroundImage: '', panelOpacity: 1, blur: 0,
    },
    Dracula: {
      background: '#282a36', surface: '#2f3241', surface2: '#373a4b', foreground: '#f8f8f2', muted: '#9aa0bd', border: '#44475a',
      accent: '#bd93f9', accentFg: '#282a36', success: '#50fa7b', error: '#ff5555', warning: '#f1fa8c', info: '#8be9fd',
      ansi: ['#21222c', '#ff5555', '#50fa7b', '#f1fa8c', '#bd93f9', '#ff79c6', '#8be9fd', '#f8f8f2', '#6272a4', '#ff6e6e', '#69ff94', '#ffffa5', '#d6acff', '#ff92df', '#a4ffff', '#ffffff'],
      backgroundImage: '', panelOpacity: 1, blur: 0,
    },
    'Solarized Dark': {
      background: '#002b36', surface: '#073642', surface2: '#0b3f4c', foreground: '#93a1a1', muted: '#657b83', border: '#164b58',
      accent: '#268bd2', accentFg: '#fdf6e3', success: '#859900', error: '#dc322f', warning: '#b58900', info: '#2aa198',
      ansi: ['#073642', '#dc322f', '#859900', '#b58900', '#268bd2', '#d33682', '#2aa198', '#eee8d5', '#586e75', '#cb4b16', '#93a1a1', '#839496', '#657b83', '#6c71c4', '#93a1a1', '#fdf6e3'],
      backgroundImage: '', panelOpacity: 1, blur: 0,
    },
    Gruvbox: {
      background: '#282828', surface: '#32302f', surface2: '#3c3836', foreground: '#ebdbb2', muted: '#a89984', border: '#504945',
      accent: '#fe8019', accentFg: '#282828', success: '#b8bb26', error: '#fb4934', warning: '#fabd2f', info: '#83a598',
      ansi: ['#282828', '#cc241d', '#98971a', '#d79921', '#458588', '#b16286', '#689d6a', '#a89984', '#928374', '#fb4934', '#b8bb26', '#fabd2f', '#83a598', '#d3869b', '#8ec07c', '#ebdbb2'],
      backgroundImage: '', panelOpacity: 1, blur: 0,
    },
    Synthwave: {
      background: '#1a1033', surface: '#22153f', surface2: '#2b1b4d', foreground: '#f4eaff', muted: '#a99cc7', border: '#3a2766',
      accent: '#ff3ea5', accentFg: '#ffffff', success: '#3cf2c2', error: '#ff4d6d', warning: '#ffd166', info: '#4dd0ff',
      ansi: ['#2b1b4d', '#ff4d6d', '#3cf2c2', '#ffd166', '#4dd0ff', '#ff3ea5', '#72f1ff', '#e9dcff', '#5d4a8a', '#ff7590', '#6ff7d4', '#ffe08f', '#80dcff', '#ff74c0', '#9ff6ff', '#ffffff'],
      backgroundImage: 'radial-gradient(1100px 600px at 85% -10%, #ff3ea538, transparent), radial-gradient(900px 520px at -5% 110%, #4dd0ff26, transparent)',
      panelOpacity: 0.82, blur: 14,
    },
    Glass: {
      background: '#0b1020', surface: '#151b2e', surface2: '#1d2540', foreground: '#e8ecf8', muted: '#94a0c0', border: '#2c3656',
      accent: '#5eead4', accentFg: '#0b1020', success: '#4ade80', error: '#fb7185', warning: '#fbbf24', info: '#60a5fa',
      ansi: ['#1d2540', '#fb7185', '#4ade80', '#fbbf24', '#60a5fa', '#c084fc', '#5eead4', '#e2e8f0', '#475569', '#fda4af', '#86efac', '#fde68a', '#93c5fd', '#d8b4fe', '#99f6e4', '#ffffff'],
      backgroundImage: 'linear-gradient(135deg, #0f766e55 0%, transparent 45%), linear-gradient(315deg, #7c3aed55 0%, transparent 50%)',
      panelOpacity: 0.55, blur: 22,
    },
  };

  const CHIPS = {
    mode: 'Mode toggle', cwd: 'Directory', branch: 'Git branch', diff: 'Diff stats', model: 'Model', permission: 'Permissions',
    context: 'Context used', usage: 'Plan usage', commands: 'Slash commands', session: 'Conversation', newchat: 'New conversation',
  };

  const DEFAULTS = {
    version: 3,
    themeName: 'Midnight',
    theme: JSON.parse(JSON.stringify(THEMES.Midnight)),
    customThemes: {},
    // a background from your computer (image, GIF or video), drawn under every panel
    wallpaper: { file: '', kind: '', fit: 'cover', position: 'center', dim: 0.25, blur: 0, speed: 1, panelOpacity: 0.5, panelBlur: 16 },
    // how agent messages (and the input) look; 'auto' = liquid glass while there is a background
    messages: { style: 'auto', tint: '#ffffff', opacity: 0.1, shade: 0.2, blur: 22, saturate: 1.8, autoContrast: true, minContrast: 4.5 },
    typography: {
      uiFont: "'Inter', 'Segoe UI', system-ui, sans-serif", monoFont: "'Cascadia Code', 'JetBrains Mono', Consolas, monospace",
      googleFonts: '', uiSize: 13, monoSize: 13.5, lineHeight: 1.5, ligatures: true, monoWeight: 400,
    },
    shape: { radius: 10, blockRadius: 10, borderWidth: 1, density: 'normal', shadow: 'soft', gap: 10 },
    tabs: {
      position: 'left', width: 270, viewMode: 'expanded', primaryInfo: 'command', subtitle: 'branch', colorStyle: 'stripe',
      indicatorStyle: 'clawd', showIndicators: true, showDiffStats: true, hoverDetails: true, usePeacock: true, latestPromptAsTitle: true,
      showExternal: false, directoryColors: [], usageBar: true,
    },
    blocks: {
      style: 'card', flow: 'bottom', showTimestamps: true, showDuration: true, showCwd: true, stickyHeaders: true,
      collapseLines: 60, exitBadge: 'pill', commandSize: 1.0,
    },
    render: { gpu: true },
    terminal: {
      cursorStyle: 'bar', cursorBlink: true, cursorColor: '', scrollback: 10000, lineHeight: 1.2, padding: 10, blockGutter: true,
      copyOnSelect: false, rightClick: 'paste', minContrast: 1, smoothScroll: 0,
    },
    input: { position: 'bottom', agentSymbol: '✦', submitOnCtrlEnter: false },
    agent: {
      toolbar: true, cliToolbar: true, model: '', permissionMode: 'default', thinking: 'collapsed', toolStyle: 'compact',
      chips: [
        { id: 'mode', side: 'left' }, { id: 'commands', side: 'left' }, { id: 'cwd', side: 'left' }, { id: 'branch', side: 'left' }, { id: 'diff', side: 'left' },
        { id: 'model', side: 'right' }, { id: 'permission', side: 'right' }, { id: 'context', side: 'right' }, { id: 'usage', side: 'right' },
        { id: 'session', side: 'right' }, { id: 'newchat', side: 'right' },
      ],
    },
    notifications: {
      agentDone: true, longRunning: true, longRunningSeconds: 30, desktop: false, sound: true, soundFreq: 880, soundVolume: 0.15,
      soundUrl: '', toastSeconds: 5, toastPosition: 'bottom-right',
    },
    clawd: {
      corral: 'tabs', size: 3, height: 66, interactions: true, includeExternal: true, colorTabs: true, syncOverlay: true, terminalClawds: true,
    },
    shell: { kind: '', loadProfile: true, welcome: true },
    motion: { animations: true, speed: 1 },
    customCss: '',
  };

  const sel = (path, label, options, help) => ({ path, label, type: 'select', options, help });
  const num = (path, label, min, max, step, unit) => ({ path, label, type: 'range', min, max, step, unit });
  const tog = (path, label, help) => ({ path, label, type: 'toggle', help });
  const txt = (path, label, help) => ({ path, label, type: 'text', help });
  const col = (path, label) => ({ path, label, type: 'color' });

  const FORM = [
    { id: 'theme', title: 'Theme', fields: [
      { type: 'presets' },
      col('theme.background', 'Background'), col('theme.surface', 'Surface'), col('theme.surface2', 'Raised surface'),
      col('theme.foreground', 'Text'), col('theme.muted', 'Muted text'), col('theme.border', 'Borders'),
      col('theme.accent', 'Accent'), col('theme.accentFg', 'Text on accent'), col('theme.success', 'Success'),
      col('theme.error', 'Error'), col('theme.warning', 'Warning'), col('theme.info', 'Info'),
      { type: 'ansi', label: 'ANSI palette (normal / bright)' },
      txt('theme.backgroundImage', 'Background image', 'A URL, or any CSS background like a gradient'),
      num('theme.panelOpacity', 'Panel opacity', 0.2, 1, 0.01), num('theme.blur', 'Glass blur', 0, 40, 1, 'px'),
    ] },
    { id: 'background', title: 'Background & glass', fields: [
      { type: 'wallpaper', label: 'Background from your computer', help: 'An image, a GIF or an MP4/WebM video. Videos loop muted. You can also drop a file here.' },
      sel('wallpaper.fit', 'Fit', [['cover', 'fill the window (crop)'], ['contain', 'show it whole'], ['fill', 'stretch']]),
      sel('wallpaper.position', 'Anchor', ['center', 'top', 'bottom', 'left', 'right']),
      num('wallpaper.dim', 'Dim (keeps text readable)', 0, 0.9, 0.01), num('wallpaper.blur', 'Background blur', 0, 40, 1, 'px'),
      num('wallpaper.speed', 'Video speed', 0.25, 2, 0.05, '×'),
      num('wallpaper.panelOpacity', 'Panel opacity over the background', 0, 1, 0.01), num('wallpaper.panelBlur', 'Panel blur over the background', 0, 40, 1, 'px'),
      sel('messages.style', 'Message style', [['auto', 'Auto: liquid glass when there is a background'], ['liquid', 'Liquid glass'], ['frosted', 'Dark glass'], ['clear', 'Translucent (no blur)'], ['solid', 'Solid'], ['theme', 'Theme default (block style)']]),
      { path: 'messages.tint', label: 'Glass tint', type: 'color' },
      num('messages.opacity', 'Glass opacity', 0, 0.6, 0.01), num('messages.shade', 'Glass shade (minimum)', 0, 0.8, 0.01),
      tog('messages.autoContrast', 'Auto contrast', 'Reads the background under the panels (every frame of a GIF or video) and darkens the glass and panels just enough for the text to read. On a light theme it lightens them instead.'),
      num('messages.minContrast', 'Minimum text contrast', 2, 9, 0.5, ':1'),
      num('messages.blur', 'Glass blur', 0, 60, 1, 'px'),
      num('messages.saturate', 'Glass color boost', 1, 2.5, 0.05, '×'),
    ] },
    { id: 'type', title: 'Typography', fields: [
      txt('typography.uiFont', 'Interface font'), txt('typography.monoFont', 'Terminal font'),
      txt('typography.googleFonts', 'Load Google Fonts', 'Comma-separated families, e.g. "JetBrains Mono, Inter"'),
      num('typography.uiSize', 'Interface size', 10, 20, 0.5, 'px'), num('typography.monoSize', 'Terminal size', 10, 24, 0.5, 'px'),
      num('typography.monoWeight', 'Terminal weight', 300, 700, 100), num('typography.lineHeight', 'Line height (agent view)', 1.1, 2, 0.05),
      tog('typography.ligatures', 'Font ligatures'),
    ] },
    { id: 'shape', title: 'Shape & spacing', fields: [
      num('shape.radius', 'Corner radius', 0, 24, 1, 'px'), num('shape.blockRadius', 'Block radius', 0, 24, 1, 'px'),
      num('shape.borderWidth', 'Border width', 0, 3, 1, 'px'), num('shape.gap', 'Block gap', 0, 32, 1, 'px'),
      sel('shape.density', 'Density', ['compact', 'normal', 'cozy']), sel('shape.shadow', 'Shadows', ['none', 'soft', 'strong']),
    ] },
    { id: 'tabs', title: 'Vertical tabs', fields: [
      sel('tabs.position', 'Panel side', ['left', 'right']), num('tabs.width', 'Panel width', 180, 460, 2, 'px'),
      sel('tabs.viewMode', 'View', ['expanded', 'compact']),
      sel('tabs.primaryInfo', 'Title shows', ['command', 'working_directory', 'branch']),
      sel('tabs.subtitle', 'Subtitle shows', ['branch', 'working_directory', 'command', 'none']),
      sel('tabs.colorStyle', 'Tab color style', ['stripe', 'fill', 'dot', 'none']),
      sel('tabs.indicatorStyle', 'Status indicator', ['clawd', 'dot', 'ring', 'bar', 'glow']),
      tog('tabs.showIndicators', 'Show activity indicators'), tog('tabs.showDiffStats', 'Show git diff stats'),
      tog('tabs.hoverDetails', 'Details card on hover'), tog('tabs.latestPromptAsTitle', 'Use latest prompt as title'),
      tog('tabs.usePeacock', 'Color tabs with the project Peacock color'), tog('tabs.showExternal', 'Show live Claude Code sessions (Clawd)'),
      tog('tabs.usageBar', 'Claude plan usage bar (session + week) under the tabs'),
      { type: 'dircolors', path: 'tabs.directoryColors', label: 'Directory colors' },
    ] },
    { id: 'render', title: 'Rendering', fields: [
      { type: 'gpuinfo' },
      tog('render.gpu', 'Hardware acceleration (GPU)', 'On: the terminal is drawn with WebGL on the GPU and the window composites on the GPU. Off: everything is drawn by the CPU. The window part applies when it is reopened.'),
      { type: 'reopen' },
    ] },
    { id: 'terminal', title: 'Terminal', fields: [
      { path: 'shell.kind', label: 'Shell for new tabs', type: 'shell' }, tog('shell.loadProfile', 'Load my shell profile', 'Needed for your own functions and aliases (e.g. claude <name>)'),
      sel('terminal.cursorStyle', 'Cursor', ['bar', 'block', 'underline']), tog('terminal.cursorBlink', 'Blinking cursor'),
      { path: 'terminal.cursorColor', label: 'Cursor color (empty = accent)', type: 'color', allowEmpty: true },
      num('terminal.lineHeight', 'Line height', 1, 2, 0.05), num('terminal.padding', 'Padding', 0, 32, 1, 'px'),
      num('terminal.scrollback', 'Scrollback', 1000, 100000, 1000, ' lines'),
      tog('terminal.blockGutter', 'Command blocks in the gutter', 'A bar per command, colored by its exit code. Click it to copy or rerun'),
      tog('terminal.copyOnSelect', 'Copy on select'),
      sel('terminal.rightClick', 'Right click', [['paste', 'copy selection / paste'], ['menu', 'context menu']]),
      num('terminal.minContrast', 'Minimum contrast', 1, 7, 0.5), num('terminal.smoothScroll', 'Smooth scrolling', 0, 200, 10, 'ms'),
    ] },
    { id: 'blocks', title: 'Agent blocks', fields: [
      sel('blocks.style', 'Block style', ['card', 'divider', 'minimal']),
      sel('blocks.flow', 'New blocks appear at', ['bottom', 'top']),
      sel('blocks.exitBadge', 'Exit status', ['pill', 'border', 'icon']),
      num('blocks.collapseLines', 'Collapse output after', 10, 400, 10, ' lines'), num('blocks.commandSize', 'Command text scale', 0.8, 1.5, 0.05, '×'),
      tog('blocks.stickyHeaders', 'Sticky command headers'), tog('blocks.showTimestamps', 'Timestamps'),
      tog('blocks.showDuration', 'Durations'), tog('blocks.showCwd', 'Directory & branch'),
    ] },
    { id: 'input', title: 'Agent input', fields: [
      sel('input.position', 'Input position', ['bottom', 'top']), txt('input.agentSymbol', 'Prompt symbol'),
      tog('input.submitOnCtrlEnter', 'Submit with Ctrl+Enter (Enter = new line)'),
    ] },
    { id: 'agent', title: 'Agent toolbar', fields: [
      tog('agent.toolbar', 'Show agent toolbar'), tog('agent.cliToolbar', 'Claude Code bar above the terminal while claude runs in it'),
      sel('agent.model', 'Model', [['', 'Claude Code default'], 'opus', 'sonnet', 'haiku', 'fable']),
      sel('agent.permissionMode', 'Permission mode', ['default', 'plan', 'acceptEdits', 'auto', 'dontAsk', 'bypassPermissions']),
      sel('agent.thinking', 'Thinking', ['collapsed', 'expanded', 'hidden']), sel('agent.toolStyle', 'Tool calls', ['compact', 'detailed']),
      { type: 'chips', path: 'agent.chips', label: 'Toolbar chips' },
    ] },
    { id: 'clawd', title: 'Clawds', fields: [
      sel('clawd.corral', 'Corral (the tamagotchi strip)', [['tabs', 'bottom of the tabs panel'], ['pane', 'above the input'], ['hidden', 'hidden']]),
      num('clawd.size', 'Mini size', 2, 5, 0.5, '×'), num('clawd.height', 'Corral height', 44, 140, 2, 'px'),
      tog('clawd.interactions', 'Minis play together (greet, hop, high five, nap, whisper)'),
      tog('clawd.includeExternal', 'Include Claude Code sessions from other terminals'),
      tog('clawd.terminalClawds', 'Grey Clawds for plain terminal tabs', 'With the "clawd" status indicator'),
      tog('clawd.colorTabs', 'Tabs without a color use their Clawd color'),
      tog('clawd.syncOverlay', 'Keep Hangar sessions alive in the desktop Clawd overlay', 'Each agent tab stays as a mini in the taskbar while the tab exists'),
    ] },
    { id: 'notify', title: 'Notifications', fields: [
      tog('notifications.agentDone', 'When the agent finishes'), tog('notifications.longRunning', 'When a long command finishes'),
      num('notifications.longRunningSeconds', 'Long command threshold', 5, 600, 5, 's'),
      tog('notifications.desktop', 'Desktop notifications when the window is hidden'),
      tog('notifications.sound', 'Sound'), num('notifications.soundFreq', 'Tone', 200, 1600, 10, 'Hz'),
      num('notifications.soundVolume', 'Volume', 0, 1, 0.01), txt('notifications.soundUrl', 'Custom sound URL', 'Overrides the tone'),
      num('notifications.toastSeconds', 'Toast duration', 2, 20, 1, 's'),
      sel('notifications.toastPosition', 'Toast position', ['bottom-right', 'bottom-left', 'top-right', 'top-left']),
    ] },
    { id: 'motion', title: 'Motion', fields: [tog('motion.animations', 'Animations'), num('motion.speed', 'Animation speed', 0.25, 3, 0.05, '×')] },
    { id: 'css', title: 'Custom CSS', fields: [{ type: 'css', path: 'customCss' }] },
    { id: 'io', title: 'Import / export', fields: [{ type: 'io' }] },
  ];

  window.HANGAR = { THEMES, DEFAULTS, FORM, CHIPS, ANSI_NAMES };
})();
