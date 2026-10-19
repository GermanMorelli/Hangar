; Hangar installer (Inno Setup 6). Don't compile this directly: installer\build.ps1 stages the files in dist\stage,
; builds Hangar.exe and the icons, and then runs ISCC with the version from package.json.
;   {app}\Hangar.exe        launcher (installer\Hangar.cs)
;   {app}\app\              server.js, launch.js, public, shell, node_modules
;   {app}\runtime\node.exe  the Node.js that runs it, so users don't need Node installed
; Data (settings, tabs, scrollback, wallpapers) lives in %LOCALAPPDATA%\Hangar and survives updates.

#ifndef AppVersion
  #define AppVersion "0.0.0"
#endif
#ifndef AppPublisher
  #define AppPublisher "Hangar"
#endif
#define Build "..\dist\build"
#define Stage "..\dist\stage"

[Setup]
AppId={{6A0F3C52-4B7E-4E0B-9C1D-2F5B8E7A9D31}
AppName=Hangar
AppVersion={#AppVersion}
AppVerName=Hangar {#AppVersion}
AppPublisher={#AppPublisher}
VersionInfoVersion={#AppVersion}
VersionInfoDescription=Hangar Setup
DefaultDirName={autopf}\Hangar
DefaultGroupName=Hangar
DisableProgramGroupPage=yes
DisableDirPage=auto
; Per-user by default, like Warp and VS Code's user installer (no admin prompt); the dialog offers "all users".
PrivilegesRequired=lowest
PrivilegesRequiredOverridesAllowed=dialog
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
MinVersion=10.0
OutputDir=..\dist
OutputBaseFilename=Hangar-Setup-{#AppVersion}
SetupIconFile={#Build}\hangar.ico
UninstallDisplayIcon={app}\Hangar.exe
UninstallDisplayName=Hangar
UninstallFilesDir={app}\uninstall
WizardStyle=modern
WizardImageFile={#Build}\wizard.bmp,{#Build}\wizard-2x.bmp
WizardSmallImageFile={#Build}\wizard-small.bmp,{#Build}\wizard-small-2x.bmp
Compression=lzma2/ultra64
SolidCompression=yes
ChangesEnvironment=yes
; Hangar is stopped by [Code] (Hangar.exe --quit) instead of the Restart Manager prompt
CloseApplications=no
#ifexist "..\LICENSE"
LicenseFile=..\LICENSE
#endif

[Languages]
Name: "en"; MessagesFile: "compiler:Default.isl"
Name: "es"; MessagesFile: "compiler:Languages\Spanish.isl"

[CustomMessages]
en.Integration=Windows integration:
es.Integration=Integración con Windows:
en.ContextMenuTask=Add "Open in Hangar" to the right-click menu of folders in Explorer
es.ContextMenuTask=Agregar "Abrir en Hangar" al menú contextual de las carpetas en el Explorador
en.PathTask=Add to PATH (type "hangar ." in any terminal to open that folder)
es.PathTask=Agregar al PATH (escribe "hangar ." en cualquier terminal para abrir esa carpeta)
en.OpenInHangar=Open in Hangar
es.OpenInHangar=Abrir en Hangar
en.DeleteData=Also delete your Hangar data (settings, themes, tabs, scrollback and wallpapers)?%n%n%1
es.DeleteData=¿Borrar también tus datos de Hangar (ajustes, temas, pestañas, historial y fondos)?%n%n%1

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked
Name: "contextmenu"; Description: "{cm:ContextMenuTask}"; GroupDescription: "{cm:Integration}"
Name: "addtopath"; Description: "{cm:PathTask}"; GroupDescription: "{cm:Integration}"

[InstallDelete]
; an update replaces the app wholesale, so files removed from Hangar don't linger
Type: filesandordirs; Name: "{app}\app"

[Files]
Source: "{#Stage}\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{autoprograms}\Hangar"; Filename: "{app}\Hangar.exe"; Parameters: "--window"; Comment: "Terminal workspace with Claude Code"
Name: "{autodesktop}\Hangar"; Filename: "{app}\Hangar.exe"; Parameters: "--window"; Tasks: desktopicon

[Registry]
; App Paths: "hangar" works in Win+R and in Explorer's address bar, where it opens the folder you're in
Root: HKA; Subkey: "Software\Microsoft\Windows\CurrentVersion\App Paths\hangar.exe"; ValueType: string; ValueName: ""; ValueData: "{app}\Hangar.exe"; Flags: uninsdeletekey
Root: HKA; Subkey: "Software\Microsoft\Windows\CurrentVersion\App Paths\hangar.exe"; ValueType: string; ValueName: "Path"; ValueData: "{app}"
; "Open in Hangar": on a folder, on the background of an open folder, and on a drive
Root: HKA; Subkey: "Software\Classes\Directory\shell\Hangar"; ValueType: string; ValueName: ""; ValueData: "{cm:OpenInHangar}"; Flags: uninsdeletekey; Tasks: contextmenu
Root: HKA; Subkey: "Software\Classes\Directory\shell\Hangar"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\Hangar.exe"",0"; Tasks: contextmenu
Root: HKA; Subkey: "Software\Classes\Directory\shell\Hangar\command"; ValueType: string; ValueName: ""; ValueData: """{app}\Hangar.exe"" ""%V"""; Tasks: contextmenu
Root: HKA; Subkey: "Software\Classes\Directory\Background\shell\Hangar"; ValueType: string; ValueName: ""; ValueData: "{cm:OpenInHangar}"; Flags: uninsdeletekey; Tasks: contextmenu
Root: HKA; Subkey: "Software\Classes\Directory\Background\shell\Hangar"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\Hangar.exe"",0"; Tasks: contextmenu
Root: HKA; Subkey: "Software\Classes\Directory\Background\shell\Hangar\command"; ValueType: string; ValueName: ""; ValueData: """{app}\Hangar.exe"" ""%V"""; Tasks: contextmenu
Root: HKA; Subkey: "Software\Classes\Drive\shell\Hangar"; ValueType: string; ValueName: ""; ValueData: "{cm:OpenInHangar}"; Flags: uninsdeletekey; Tasks: contextmenu
Root: HKA; Subkey: "Software\Classes\Drive\shell\Hangar"; ValueType: string; ValueName: "Icon"; ValueData: """{app}\Hangar.exe"",0"; Tasks: contextmenu
Root: HKA; Subkey: "Software\Classes\Drive\shell\Hangar\command"; ValueType: string; ValueName: ""; ValueData: """{app}\Hangar.exe"" ""%V"""; Tasks: contextmenu

[Run]
Filename: "{app}\Hangar.exe"; Parameters: "--window"; Description: "{cm:LaunchProgram,Hangar}"; Flags: nowait postinstall skipifsilent

[Code]
const
  UserEnv = 'Environment';
  SystemEnv = 'SYSTEM\CurrentControlSet\Control\Session Manager\Environment';

// Ask the running Hangar to stop (it saves tabs and scrollback), then make sure the bundled node.exe is gone so its
// files can be replaced or deleted.
procedure StopHangar();
var
  Code: Integer;
  Exe: String;
begin
  Exe := ExpandConstant('{app}\Hangar.exe');
  if FileExists(Exe) then
    Exec(Exe, '--quit', '', SW_HIDE, ewWaitUntilTerminated, Code);
  Exec(ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe'),
    '-NoProfile -NonInteractive -Command "Get-Process node -ErrorAction SilentlyContinue | Where-Object { $_.Path -eq ''' +
    ExpandConstant('{app}\runtime\node.exe') + ''' } | Stop-Process -Force"', '', SW_HIDE, ewWaitUntilTerminated, Code);
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
begin
  StopHangar();
  Result := '';
end;

function EnvRoot(): Integer;
begin
  if IsAdminInstallMode() then Result := HKEY_LOCAL_MACHINE else Result := HKEY_CURRENT_USER;
end;

function EnvKey(): String;
begin
  if IsAdminInstallMode() then Result := SystemEnv else Result := UserEnv;
end;

function PathHas(Paths, Dir: String): Boolean;
begin
  Result := Pos(';' + Uppercase(Dir) + ';', ';' + Uppercase(Paths) + ';') > 0;
end;

procedure AddToPath(Dir: String);
var
  Paths: String;
begin
  if not RegQueryStringValue(EnvRoot(), EnvKey(), 'Path', Paths) then Paths := '';
  if PathHas(Paths, Dir) then exit;
  if (Paths <> '') and (Copy(Paths, Length(Paths), 1) <> ';') then Paths := Paths + ';';
  RegWriteExpandStringValue(EnvRoot(), EnvKey(), 'Path', Paths + Dir);
end;

procedure RemoveFromPath(Dir: String);
var
  Paths: String;
  P: Integer;
begin
  if not RegQueryStringValue(EnvRoot(), EnvKey(), 'Path', Paths) then exit;
  Paths := ';' + Paths + ';';
  P := Pos(';' + Uppercase(Dir) + ';', Uppercase(Paths));
  if P = 0 then exit;
  Delete(Paths, P, Length(Dir) + 1);
  RegWriteExpandStringValue(EnvRoot(), EnvKey(), 'Path', Copy(Paths, 2, Length(Paths) - 2));
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then
    if WizardIsTaskSelected('addtopath') then AddToPath(ExpandConstant('{app}'))
    else RemoveFromPath(ExpandConstant('{app}'));
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
  Data: String;
begin
  if CurUninstallStep = usUninstall then begin
    StopHangar();
    RemoveFromPath(ExpandConstant('{app}'));
  end;
  if CurUninstallStep = usPostUninstall then begin
    Data := ExpandConstant('{localappdata}\Hangar');
    if DirExists(Data) and not UninstallSilent() then
      if MsgBox(FmtMessage(CustomMessage('DeleteData'), [Data]), mbConfirmation, MB_YESNO or MB_DEFBUTTON2) = IDYES then
        DelTree(Data, True, True, True);
  end;
end;
