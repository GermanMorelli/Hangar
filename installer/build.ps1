# Builds the Hangar installer: dist\Hangar-Setup-<version>.exe
#   powershell -ExecutionPolicy Bypass -File installer\build.ps1 [-Node <path to node.exe>]
# Needs: npm install already run, Inno Setup 6 (winget install JRSoftware.InnoSetup) and Windows' own .NET Framework
# csc.exe. The bundled runtime is the node.exe given with -Node, or the one on PATH (x64).
param([string]$Node = (Get-Command node -ErrorAction SilentlyContinue).Source)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$root = Split-Path $PSScriptRoot -Parent
$dist = Join-Path $root 'dist'
$stage = Join-Path $dist 'stage'
$build = Join-Path $dist 'build'
$pkg = Get-Content (Join-Path $root 'package.json') -Raw | ConvertFrom-Json
$version = $pkg.version
$publisher = if ($pkg.author) { "$($pkg.author)" -replace '\s*<.*$', '' } else { 'Hangar' }

if (-not $Node -or -not (Test-Path $Node)) { throw 'node.exe not found: pass -Node <path>' }
if (-not (Test-Path (Join-Path $root 'node_modules\node-pty'))) { throw 'run npm install first' }
$iscc = @("$env:LOCALAPPDATA\Programs\Inno Setup 6\ISCC.exe", "${env:ProgramFiles(x86)}\Inno Setup 6\ISCC.exe", "$env:ProgramFiles\Inno Setup 6\ISCC.exe") |
  Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $iscc) { throw 'Inno Setup 6 not found: winget install JRSoftware.InnoSetup' }
$csc = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'

Write-Host "Hangar $version"
foreach ($d in $stage, $build) { if (Test-Path $d) { Remove-Item $d -Recurse -Force } ; New-Item -ItemType Directory $d | Out-Null }

# ---- app files (what server.js needs at runtime) + production node_modules without debug symbols or other platforms
$app = Join-Path $stage 'app'
New-Item -ItemType Directory $app | Out-Null
foreach ($f in 'server.js', 'launch.js', 'package.json') { Copy-Item (Join-Path $root $f) $app }
foreach ($d in 'public', 'shell') { Copy-Item (Join-Path $root $d) $app -Recurse }
Remove-Item (Join-Path $app 'shell\*welcome*')   # personal welcome animation (.gitignore): not shipped
robocopy (Join-Path $root 'node_modules') (Join-Path $app 'node_modules') /E /NFL /NDL /NJH /NJS /NP `
  /XF *.pdb /XD darwin-arm64 darwin-x64 win32-arm64 | Out-Null
if ($LASTEXITCODE -ge 8) { throw "robocopy failed ($LASTEXITCODE)" }

# ---- runtime
$runtime = Join-Path $stage 'runtime'
New-Item -ItemType Directory $runtime | Out-Null
Copy-Item $Node (Join-Path $runtime 'node.exe')
$nodeLicense = Join-Path (Split-Path $Node) 'LICENSE'
if (Test-Path $nodeLicense) { Copy-Item $nodeLicense (Join-Path $runtime 'LICENSE') }
Write-Host "  runtime: Node $(& $Node -v)"

# ---- icon (.ico with every size Explorer asks for) and the wizard's images, drawn from public/icon-512.png
$logo = [System.Drawing.Image]::FromFile((Join-Path $root 'public\icon-512.png'))
function New-Canvas($w, $h) {
  $bmp = New-Object System.Drawing.Bitmap $w, $h
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = 'HighQualityBicubic'; $g.SmoothingMode = 'AntiAlias'; $g.PixelOffsetMode = 'HighQuality'; $g.TextRenderingHint = 'AntiAliasGridFit'
  return $bmp, $g
}
function Save-Ico($path, $sizes) {
  $pngs = foreach ($s in $sizes) {
    $bmp, $g = New-Canvas $s $s
    $g.DrawImage($logo, 0, 0, $s, $s); $g.Dispose()
    $ms = New-Object System.IO.MemoryStream; $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png); $bmp.Dispose()
    , $ms.ToArray()
  }
  $out = New-Object System.IO.BinaryWriter ([System.IO.File]::Create($path))
  $out.Write([uint16]0); $out.Write([uint16]1); $out.Write([uint16]$sizes.Count)
  $offset = 6 + 16 * $sizes.Count
  for ($i = 0; $i -lt $sizes.Count; $i++) {
    $s = $sizes[$i] % 256   # 0 means 256
    $out.Write([byte]$s); $out.Write([byte]$s); $out.Write([byte]0); $out.Write([byte]0)
    $out.Write([uint16]1); $out.Write([uint16]32); $out.Write([uint32]$pngs[$i].Length); $out.Write([uint32]$offset)
    $offset += $pngs[$i].Length
  }
  foreach ($p in $pngs) { $out.Write($p) }
  $out.Close()
}
function Save-Wizard($path, $w, $h) {   # the tall image on the welcome/finish pages: theme background, logo, name
  $bmp, $g = New-Canvas $w $h
  $bg = New-Object System.Drawing.Drawing2D.LinearGradientBrush ([System.Drawing.Point]::new(0, 0)), ([System.Drawing.Point]::new(0, $h)),
    ([System.Drawing.ColorTranslator]::FromHtml('#1b1f2b')), ([System.Drawing.ColorTranslator]::FromHtml('#0d0f14'))
  $g.FillRectangle($bg, 0, 0, $w, $h)
  $s = [int]($w * 0.62)
  $g.DrawImage($logo, [int](($w - $s) / 2), [int]($h * 0.26), $s, $s)
  $font = New-Object System.Drawing.Font 'Segoe UI Semibold', ([single]($w * 0.13)), ([System.Drawing.GraphicsUnit]::Pixel)
  $fmt = New-Object System.Drawing.StringFormat; $fmt.Alignment = 'Center'
  $g.DrawString('Hangar', $font, [System.Drawing.Brushes]::White, [System.Drawing.RectangleF]::new(0, $h * 0.26 + $s + $w * 0.06, $w, $w * 0.3), $fmt)
  $g.Dispose(); $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Bmp); $bmp.Dispose()
}
function Save-Small($path, $s) {   # top-right corner of the inner pages (white header)
  $bmp, $g = New-Canvas $s $s
  $g.Clear([System.Drawing.Color]::White); $g.DrawImage($logo, 0, 0, $s, $s)
  $g.Dispose(); $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Bmp); $bmp.Dispose()
}
Save-Ico (Join-Path $build 'hangar.ico') @(16, 20, 24, 32, 40, 48, 64, 96, 128, 256)
Save-Wizard (Join-Path $build 'wizard.bmp') 164 314
Save-Wizard (Join-Path $build 'wizard-2x.bmp') 328 628
Save-Small (Join-Path $build 'wizard-small.bmp') 55
Save-Small (Join-Path $build 'wizard-small-2x.bmp') 110
$logo.Dispose()

# ---- Hangar.exe (no console window: /target:winexe), with the icon and version info Explorer and Task Manager show
$info = Join-Path $build 'AssemblyInfo.cs'
@"
using System.Reflection;
[assembly: AssemblyTitle("Hangar")]
[assembly: AssemblyProduct("Hangar")]
[assembly: AssemblyCompany("$publisher")]
[assembly: AssemblyVersion("$version.0")]
[assembly: AssemblyFileVersion("$version.0")]
[assembly: AssemblyInformationalVersion("$version")]
"@ | Set-Content $info -Encoding UTF8
& $csc /nologo /target:winexe /optimize+ /platform:anycpu /r:System.Management.dll "/win32icon:$(Join-Path $build 'hangar.ico')" `
  "/out:$(Join-Path $stage 'Hangar.exe')" (Join-Path $PSScriptRoot 'Hangar.cs') $info
if ($LASTEXITCODE) { throw 'csc failed' }

# ---- the wizard
& $iscc /Q "/DAppVersion=$version" "/DAppPublisher=$publisher" (Join-Path $PSScriptRoot 'hangar.iss')
if ($LASTEXITCODE) { throw 'ISCC failed' }
$setup = Get-Item (Join-Path $dist "Hangar-Setup-$version.exe")
Write-Host ("  {0} ({1:N1} MB)" -f $setup.FullName, ($setup.Length / 1MB))
