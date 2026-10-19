# Hangar shell integration for (Git) Bash: same OSC 633 marks as hangar.ps1.
# Started as: bash --rcfile <this file> -i   (HANGAR_LOAD_PROFILE=1 also sources ~/.bashrc)
[ -n "$__HANGAR_INJECTED" ] && return
__HANGAR_INJECTED=1
if [ -n "$HANGAR_LOAD_PROFILE" ]; then
  [ -f ~/.bash_profile ] && . ~/.bash_profile
  [ -f ~/.bashrc ] && . ~/.bashrc
fi

__hangar_esc() { local v="${1//\\/\\\\}"; v="${v//;/\\x3b}"; v="${v//$'\n'/\\x0a}"; printf '%s' "$v"; }
__hangar_cwd() { if command -v cygpath >/dev/null 2>&1; then cygpath -w "$PWD"; else printf '%s' "$PWD"; fi; }

__hangar_ran=
__hangar_at_prompt=
__hangar_prompt() {
  local code=$?
  if [ -n "$__hangar_ran" ]; then printf '\e]633;D;%s\a' "$code"; __hangar_ran=; fi
  printf '\e]633;A\a\e]633;P;Cwd=%s\a' "$(__hangar_esc "$(__hangar_cwd)")"
  __hangar_at_prompt=1
}
__hangar_preexec() {
  [ -z "$__hangar_at_prompt" ] && return
  [ -n "$COMP_LINE" ] && return
  case "$BASH_COMMAND" in __hangar_prompt*) return ;; esac
  __hangar_at_prompt=
  local cmd
  cmd=$(HISTTIMEFORMAT= history 1 | sed 's/^ *[0-9]* *//')
  printf '\e]633;E;%s\a\e]633;C\a' "$(__hangar_esc "$cmd")"
  __hangar_ran=1
}

PROMPT_COMMAND="__hangar_prompt${PROMPT_COMMAND:+; $PROMPT_COMMAND}"
PS1="${PS1:-\\w \\$ }"'\[\e]633;B\a\]'
trap '__hangar_preexec' DEBUG
