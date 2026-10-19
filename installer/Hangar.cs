// Hangar.exe: the installed app's entry point (Start menu, desktop, "Open in Hangar" in Explorer, `hangar` typed in
// Explorer's address bar, Win+R or a terminal). It runs app\launch.js on the bundled Node with no console window:
//   Hangar.exe [folder]   a new tab in that folder; with no folder, the current directory (Explorer's address bar
//                         starts programs in the folder you're looking at, which is how `hangar` there opens it)
//   Hangar.exe --window   just show Hangar (Start menu and desktop shortcuts)
//   Hangar.exe --quit     stop the running Hangar (the installer, before updating or uninstalling)
// Build: installer\build.ps1 (csc.exe from the .NET Framework that ships with Windows).
using System;
using System.Diagnostics;
using System.IO;
using System.Management;
using System.Runtime.InteropServices;
using System.Text;

static class Launcher {
  [DllImport("user32.dll")] static extern bool EnumWindows(EnumProc cb, IntPtr lParam);
  [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll")] static extern bool IsIconic(IntPtr h);
  [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr h, int cmd);
  [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr h);
  [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32.dll")] static extern void keybd_event(byte vk, byte scan, uint flags, UIntPtr extra);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int max);
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder s, int max);
  delegate bool EnumProc(IntPtr h, IntPtr lParam);

  [STAThread]
  static int Main(string[] args) {
    string root = AppDomain.CurrentDomain.BaseDirectory;
    string node = Path.Combine(root, @"runtime\node.exe");
    string script = Path.Combine(root, @"app\launch.js");
    if (!File.Exists(node) || !File.Exists(script)) return 2;

    bool quit = Array.IndexOf(args, "--quit") >= 0, windowOnly = Array.IndexOf(args, "--window") >= 0;
    string folder = null;
    foreach (string a in args) if (!a.StartsWith("--")) { folder = a; break; }
    if (folder == null && !quit && !windowOnly) folder = Environment.CurrentDirectory;
    folder = CleanFolder(folder, root);

    var psi = new ProcessStartInfo(node) {
      Arguments = Quote(script) + (quit ? " --quit" : "") + (folder != null ? " " + Quote(folder) : ""),
      WorkingDirectory = Path.GetDirectoryName(script), UseShellExecute = false, CreateNoWindow = true,
    };
    string data = Environment.GetEnvironmentVariable("HANGAR_DATA");
    if (string.IsNullOrEmpty(data))
      psi.EnvironmentVariables["HANGAR_DATA"] = data = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "Hangar");
    psi.EnvironmentVariables["HANGAR_EXIT_WHEN_CLOSED"] = "1";
    psi.EnvironmentVariables.Remove("HANGAR_LAUNCH_CWD");   // left behind by whoever started us: it's ours to set

    Process p = Process.Start(psi);
    // launch.js exits right away when it handed the folder to a running Hangar (10 = it already had a window).
    // If it's still running, it became the server, which opens the window itself.
    if (!p.WaitForExit(quit ? 15000 : 6000)) return 0;
    if (p.ExitCode == 10) FocusWindow(Path.Combine(data, "window-profile"));
    return p.ExitCode;
  }

  // Explorer passes "%V" quoted: for a drive that's "C:\", which arrives as C:" (the \" is read as an escaped quote).
  static string CleanFolder(string f, string root) {
    if (f == null) return null;
    f = f.Trim().TrimEnd('"');
    if (f.Length == 2 && f[1] == ':') f += "\\";
    try { f = Path.GetFullPath(f); } catch { return null; }
    if (!Directory.Exists(f)) return null;
    string t = f.TrimEnd('\\'), win = Environment.GetFolderPath(Environment.SpecialFolder.Windows);
    // started from a shortcut without a working folder: show Hangar without adding a tab there
    if (t.Equals(root.TrimEnd('\\'), StringComparison.OrdinalIgnoreCase) || t.Equals(win, StringComparison.OrdinalIgnoreCase)
        || t.Equals(Environment.SystemDirectory, StringComparison.OrdinalIgnoreCase)) return null;
    return f;
  }

  // Command-line quoting: backslashes before the closing quote must be doubled ("C:\\" not "C:\").
  static string Quote(string s) {
    int n = 0;
    while (n < s.Length && s[s.Length - 1 - n] == '\\') n++;
    return "\"" + s + new string('\\', n) + "\"";
  }

  // The Hangar window is an Edge/Chrome app window titled "Hangar", run with this instance's own browser profile
  // (server.js openWindow: --user-data-dir=<data>\window-profile). The profile tells it apart from a browser tab
  // titled "Hangar" or the window of another Hangar (a dev copy, another data folder).
  static void FocusWindow(string profile) {
    for (int i = 0; i < 20; i++) {
      IntPtr found = IntPtr.Zero;
      EnumWindows((h, l) => {
        if (!IsWindowVisible(h)) return true;
        var cls = new StringBuilder(64); GetClassName(h, cls, 64);
        var title = new StringBuilder(256); GetWindowText(h, title, 256);
        if (cls.ToString() != "Chrome_WidgetWin_1" || title.ToString() != "Hangar") return true;
        uint pid; GetWindowThreadProcessId(h, out pid);
        if (CommandLine(pid).IndexOf(profile, StringComparison.OrdinalIgnoreCase) < 0) return true;
        found = h; return false;
      }, IntPtr.Zero);
      if (found != IntPtr.Zero) {
        if (IsIconic(found)) ShowWindow(found, 9);   // SW_RESTORE
        if (!SetForegroundWindow(found) || GetForegroundWindow() != found) {
          keybd_event(0x12, 0, 0, UIntPtr.Zero); keybd_event(0x12, 0, 2, UIntPtr.Zero);   // a tap of Alt lifts the focus lock
          SetForegroundWindow(found);
        }
        return;
      }
      System.Threading.Thread.Sleep(100);
    }
  }

  static string CommandLine(uint pid) {
    try {
      using (var q = new ManagementObjectSearcher("SELECT CommandLine FROM Win32_Process WHERE ProcessId=" + pid))
        foreach (ManagementObject o in q.Get()) return (o["CommandLine"] as string) ?? "";
    } catch { }
    return "";
  }
}
