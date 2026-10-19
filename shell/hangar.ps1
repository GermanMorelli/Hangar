# Hangar shell integration for Windows PowerShell 5.1 and PowerShell 7.
# Emits OSC 633 marks (the subset VS Code uses): A prompt start, B prompt end, E command line, C command executed,
# D command finished (+ exit code), P;Cwd= current directory. Hangar turns them into blocks, tab status and notifications.
# Loaded after your profile with: powershell -NoExit -Command ". '<this file>'"
if ($Global:__HangarInjected) { return }
$Global:__HangarInjected = $true
$Global:__HangarLastHistoryId = -1

try {
  [Console]::InputEncoding = [System.Text.Encoding]::UTF8
  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
  $Global:OutputEncoding = [System.Text.Encoding]::UTF8
} catch { }

function Global:__Hangar-Escape([string]$Value) {
  if ($null -eq $Value) { return '' }
  $Value -replace '\\', '\\' -replace "`r", '\x0d' -replace "`n", '\x0a' -replace ';', '\x3b' -replace [char]7, '\x07' -replace [char]27, '\x1b'
}

$Global:__HangarOriginalPrompt = $function:Prompt

function Global:Prompt {
  $FakeCode = [int]!$global:?
  $NativeCode = $global:LASTEXITCODE
  Set-StrictMode -Off
  $LastHistoryEntry = Get-History -Count 1
  $e = [char]27; $a = [char]7
  $Result = ''
  if ($Global:__HangarLastHistoryId -ne -1) {
    if ($null -eq $LastHistoryEntry -or $LastHistoryEntry.Id -eq $Global:__HangarLastHistoryId) {
      $Result += "$e]633;D$a"                      # nothing ran (empty line, Ctrl+C)
    } else {
      # A native exit code only counts if this command changed it (it is sticky across commands)
      $Code = $FakeCode
      if ($FakeCode -ne 0 -and $NativeCode -and $NativeCode -ne $Global:__HangarNativeBefore) { $Code = $NativeCode }
      $Result += "$e]633;D;$Code$a"
    }
  }
  $Result += "$e]633;A$a"
  if ($pwd.Provider.Name -eq 'FileSystem') { $Result += "$e]633;P;Cwd=$(__Hangar-Escape $pwd.ProviderPath)$a" }
  if ($FakeCode -ne 0) { Write-Error 'failure' -ErrorAction Ignore }   # keep $? for the user's own prompt
  $Result += $Global:__HangarOriginalPrompt.Invoke()
  $Result += "$e]633;B$a"
  $Global:__HangarLastHistoryId = if ($LastHistoryEntry) { $LastHistoryEntry.Id } else { 0 }
  $global:LASTEXITCODE = $NativeCode
  return $Result
}

# The command line comes from PSReadLine: wrap its entry point to announce it right after Enter.
if (-not (Get-Module -Name PSReadLine)) { Import-Module PSReadLine -ErrorAction SilentlyContinue }
if (Get-Module -Name PSReadLine) {
  $Global:__HangarOriginalReadLine = $function:PSConsoleHostReadLine
  function Global:PSConsoleHostReadLine {
    $CommandLine = $Global:__HangarOriginalReadLine.Invoke()
    $Global:__HangarNativeBefore = $global:LASTEXITCODE
    $e = [char]27; $a = [char]7
    [Console]::Write("$e]633;E;$(__Hangar-Escape ([string]$CommandLine))$a$e]633;C$a")
    $CommandLine
  }
}

# Optional local welcome script (not part of Hangar): runs when a shell/welcome.ps1 exists next to this file
if ($env:HANGAR_WELCOME -eq '1' -and (Test-Path (Join-Path $PSScriptRoot 'welcome.ps1'))) { & (Join-Path $PSScriptRoot 'welcome.ps1') }
