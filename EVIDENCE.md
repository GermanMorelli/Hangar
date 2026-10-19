# How Warp's main features work: the evidence

Everything in **Verified locally** comes from files on this machine (Warp 2026, Windows build,
installed at `%LOCALAPPDATA%\Programs\Warp`) and was read during this session.
**Public docs** are links to docs.warp.dev. Anything marked *inference* is my reading of the
evidence and isn't stated in either source.

| Source | Path | What it proves |
|---|---|---|
| Official settings schema (ships with the app, 135 KB) | `%LOCALAPPDATA%\Programs\Warp\resources\settings_schema.json` | Every feature, its options and defaults |
| Your settings | `%LOCALAPPDATA%\warp\Warp\config\settings.toml` | Which features you have on |
| Warp's local database | `%LOCALAPPDATA%\warp\Warp\data\warp.sqlite` | How blocks, tabs and panes are stored |
| Warp's Claude Code plugin | `~\.claude\plugins\cache\claude-code-warp\warp\2.2.0\` | How the agent toolbar and notifications get their data |
| Binaries | `warp.exe`, `conpty.dll`, `dxcompiler.dll`, `dxil.dll` | Real Windows pseudo-console (ConPTY) and a GPU (DirectX) renderer |

---

## 1. Blocks: each command plus its output is one object

**Verified locally**
- `warp.sqlite` → table `blocks`: `stylized_command, stylized_output, pwd, git_branch, git_branch_name, exit_code,
  start_ts, completed_ts, shell, user, host, ps1, prompt_snapshot, ai_metadata, is_background, agent_view_visibility`.
  A block is a database row that stores the command, its output **with styling**, and its context.
- Your database has **563 blocks**, and **394** of them recorded a git branch. Example row:
  `pwd=C:\dev\CONCENTRADO\AdmissionsLab---Landing, git_branch_name=main, exit_code=0, shell=pwsh`.
- Table `commands` (history): `command, exit_code, start_ts, completed_ts, pwd, git_branch, session_id,
  cloud_workflow_id, is_agent_executed`. You have **895** commands; **139** start with `claude`.
- Schema keys: `appearance.blocks.should_show_bootstrap_block` ("Whether the bootstrap block is visible"),
  `should_show_in_band_command_blocks`, `show_block_dividers`, `show_jump_to_bottom_of_block_button`,
  `appearance.spacing` (`normal | compact`), `appearance.input.input_mode`
  (`pinned_to_bottom`: "new blocks are added at the bottom"; `pinned_to_top`: newest on top).

**How it works** (*inference* from the "bootstrap block" setting and the per-block `ps1` and `prompt_snapshot` columns,
consistent with Warp's public engineering posts): when a session starts, Warp injects a bootstrap script into the
shell. The script hooks the prompt so the shell reports where each command starts and ends, its exit code, the cwd
and the branch. Warp cuts the output stream at those markers, and each slice becomes a block.

## 2. Vertical tabs: one row per session with live status

**Verified locally**
- Your `settings.toml`: `[appearance.vertical_tabs] enabled = true`.
- Schema options: `primary_info` (`command | working_directory | branch`, default `command`),
  `compact_subtitle` (`branch | working_directory | command`), `view_mode` (`compact | expanded`),
  `show_diff_stats`, `show_pr_link`, `show_details_on_hover` ("details sidecar"),
  `use_latest_prompt_as_title` ("for agent conversations use the latest user prompt"),
  `appearance.tabs.show_indicators_button` ("activity indicators on tabs"),
  `appearance.tabs.directory_tab_colors` ("Mapping of directory paths to their tab color assignments").
- `warp.sqlite` → `tabs(custom_title, color, tab_group_id, pinned)`, `pane_nodes(tab_id, parent_pane_node_id, flex, is_leaf)`
  (a split tree), `terminal_panes(cwd, shell_launch_data, conversation_ids, active_conversation_id, llm_model_override)`.
  You currently have **11 tabs**, all `powershell.exe`, most running `claude`, `claude mimi` or `claude Roberto`.

**How it works**: a tab is a tree of panes. Each pane knows its cwd, shell and agent conversation. The tab row's
title comes from the last command, the latest prompt, the directory or the branch. Its color comes from a
directory→color map, and its indicator from what the session is doing.

## 3. Theme system: YAML themes plus appearance settings

**Verified locally**
- Your `settings.toml`: `theme = "phenomenon"`, `backdrop = "mica_alt"`, `zoom_level = 125`, `font_size = 16`,
  `ai_font_name = "Hack"`, `cursor_display_type = "bar"`.
- Schema: `appearance.text.*` (font, size, weight, line height, ligatures), `appearance.window.override_opacity`
  (1–100), `override_blur`, `backdrop`, `appearance.cursor.cursor_display_type` (`bar | block | underline`),
  `appearance.panes.should_dim_inactive_panes`, `appearance.themes.selected_system_themes` (light/dark pair).

**Public docs**: custom themes are YAML files (`accent`, `background`, `foreground`, `details`,
`terminal_colors.normal/bright`) dropped into a themes folder.
[Custom themes](https://docs.warp.dev/features/themes/custom-themes) ·
[Settings file](https://docs.warp.dev/terminal/settings/all-settings/)

## 4. CLI-agent toolbar and notifications: how Warp sees Claude Code

**Verified locally**
- Your `settings.toml`: `[agents.third_party] should_render_cli_agent_toolbar = true`.
- Schema: `agents.third_party.should_render_cli_agent_toolbar` ("show the CLI agent footer for coding agent commands"),
  `cli_agent_toolbar_chip_selection_setting` (`default`, or `custom: { left: [...], right: [...] }`),
  `cli_agent_toolbar_enabled_commands`, `auto_open_composer_on_cli_agent_start` (Rich Input).
  Toolbar items (`AgentToolbarItemKind`): `model_selector, context_window_usage, rich_input, file_explorer,
  voice_input, file_attach, share_session, settings, fast_forward_toggle, handoff_to_cloud, usage_summary` + context chips.
- `notifications.preferences` default: `is_agent_task_completed_enabled, is_long_running_enabled
  (long_running_threshold: 30), is_needs_attention_enabled, is_password_prompt_enabled, play_notification_sound`.
- **The data comes from a Claude Code plugin**, `warp@claude-code-warp` (enabled in `~/.claude/settings.json`,
  repo `warpdotdev/claude-code-warp`). `hooks/hooks.json` registers `SessionStart, Stop, Notification(idle_prompt),
  PermissionRequest, UserPromptSubmit, PostToolUse`. `scripts/warp-notify.sh` writes the escape sequence
  `ESC ] 777 ; notify ; warp://cli-agent ; <json> BEL` to the terminal, and `build-payload.sh` builds
  `{v, agent:"claude", event, session_id, cwd, project, …}`.
- ⚠️ **On your machine that plugin is failing right now.** Claude Code printed
  `🚨 Warp notifications require jq! Install it with your system package manager 🚨` during my test run,
  so Warp's Claude notifications aren't reaching you until `jq` is installed (e.g. `winget install jqlang.jq`).

**Public docs**: [Third-party CLI agents](https://docs.warp.dev/agents/cli-agents/overview/) ·
[Claude Code in Warp](https://docs.warp.dev/agent-platform/cli-agents/claude-code/): auto-detects Claude Code;
the toolbelt chips can be reordered, hidden or moved left/right; notifications come from the plugin.

## Also present (not rebuilt)
Workflows (10 saved, e.g. `git reset --soft HEAD~{{num_commits}} && git commit` with typed arguments), Warp Drive,
notebooks, execution profiles (your agent denylist blocks `rm`, `curl`, `ssh`…), secret redaction regexes,
voice input (`voice_input_toggle_key = "alt_right"`), codebase indexing.

---

## From evidence to Hangar

| Warp | Evidence | Hangar |
|---|---|---|
| Block = command + output + pwd + branch + exit + times | `blocks` table | `runCommand()` in `server.js` keeps the same fields. `fillBlock()` / `renderOutput()` in `public/app.js` |
| Block filtering, copy, rerun, bookmark, sticky header, jump to bottom | Schema keys and docs | Block actions bar, `filterBar()` (text or /regex/, ±context, invert) |
| `pinned_to_bottom` / `pinned_to_top` | `InputMode` | `blocks.flow` + `input.position` settings |
| Vertical tabs: primary info, subtitle, compact/expanded, indicators, diff stats, hover sidecar, latest prompt as title | `appearance.vertical_tabs.*` | `renderTabs()`, `tabEl()`, `scheduleHovercard()`; every option is a setting |
| `directory_tab_colors` | Schema | `tabs.directoryColors` + your **Peacock** colors (`.vscode/settings.json`), same as Clawd |
| CLI agent footer with left/right chips | `CLIAgentToolbarChipSelection` | `renderToolbar()`; chips editor in Settings → Agent toolbar |
| Agent notifications / long-running threshold 30 s | `notifications.preferences` | `onBlockFinished()`, `notify()` (toast + sound + desktop) |
| OSC 777 `notify` protocol | Plugin scripts | Server lifts `ESC]777;notify;…` out of output and shows it as a notification |
| YAML themes | Docs | Import **and export** Warp YAML themes, plus 8 presets and unlimited saved themes |
