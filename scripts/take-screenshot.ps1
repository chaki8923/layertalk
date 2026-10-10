#Requires -Version 5.1
<#
  ストア提出用のスクリーンショットを撮る。**Windows の VM で走らせる。**

  手でトリミングすると寸法を割りやすい（実際に 1188x669 で撮れてしまい、
  Microsoft Store の最低要件 1366x768 を下回った）ので、撮影と切り落としを
  まとめてやって、要件を満たしているかその場で検査する。

  ---------------------------------------------------------------------------
  使い方
  ---------------------------------------------------------------------------
    1. 撮りたい画面を作る（LayerTalk を出す、スライドを出す、など）
    2. ここで叩く。5秒のカウントダウンのあいだに、撮りたい窓をクリックして前面に出す

         .\scripts\take-screenshot.ps1 -Name コントロール窓

    3. assets\<名前>_windows.png に出る

  ---------------------------------------------------------------------------
  踏んだ罠
  ---------------------------------------------------------------------------
    1. **Mac 側で Parallels の窓を撮らないこと。** 縮小された絵になる。
       VM の中で撮れば、ゲストの実寸（例 1920x1080）がそのまま取れる。

    2. **右下の「Windows のライセンス認証」の透かしは最前面に描かれる。**
       重なった状態で撮ったあとから消すことはできないので、下を切り落とす。
       **透かしの上端は画面の下から 212px**（実測）。既定の 230px で外れる。
       1080 の画面なら 1920x850 になり、要件の 1366x768 は満たす。
       **撮りたい窓は高さ 800px 程度にして上寄りに置くこと** — 下端が切れる。

    3. **SetProcessDPIAware を先に呼ぶこと。** Windows PowerShell 5.1 は
       DPI 非対応なので、表示スケールが 100% でないと Screen.Bounds が
       論理ピクセル（例 1536x864）を返し、画面の一部しか撮れない。

    5. **このコンソール窓が写り込む。** スライドの上に LayerTalk を出して撮るので、
       コンソールが前面に残っていると絵が台無しになる。撮影のあいだだけ
       自分で最小化して、終わったら戻している。

    4. **スクリプト自身は UTF-8 BOM 付きで保存する。** 5.1 は BOM の無い .ps1 を
       システムの ANSI コードページとして読むので、日本語が文字化けして構文が壊れる
       （scripts/build-msix.ps1 と同じ。docs/windows-spike.md 参照）。
#>

param(
  [Parameter(Mandatory = $true)][string]$Name,
  # 下から切り落とす高さ。ライセンス認証の透かしを外すため。
  # **実測で透かしの上端は画面の下から 212px**（1920x1080 で測定、2026-10-10）。
  # 画面の下端からの距離なので、解像度が変わっても同じ値でよい。
  [int]$BottomCrop = 230,
  # 撮るまでの待ち時間。このあいだに撮りたい窓をクリックして前面に出す。
  [int]$Delay = 6,
  [string]$OutputDirectory
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Fail([string]$Message) {
  Write-Host ''
  Write-Host "error: $Message" -ForegroundColor Red
  exit 1
}

# Microsoft Store の最低要件。下回るとアップロードで弾かれる。
$MIN_WIDTH  = 1366
$MIN_HEIGHT = 768

# 5.1 は DPI 非対応なので、先に宣言しないと論理ピクセルしか見えない（罠 3）。
# ついでに自分のコンソール窓を最小化する手段も取る（罠 5）。
if (-not ('LayerTalk.Win32' -as [type])) {
  Add-Type -Namespace LayerTalk -Name Win32 -MemberDefinition @'
[DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
[DllImport("kernel32.dll")] public static extern System.IntPtr GetConsoleWindow();
[DllImport("user32.dll")] public static extern bool ShowWindow(System.IntPtr hWnd, int nCmdShow);
'@
}
[LayerTalk.Win32]::SetProcessDPIAware() | Out-Null

Add-Type -AssemblyName System.Drawing
Add-Type -AssemblyName System.Windows.Forms

if (-not $OutputDirectory) {
  $OutputDirectory = Join-Path (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path 'assets'
}
if (-not (Test-Path -LiteralPath $OutputDirectory)) {
  New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
}

$bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds
$width  = $bounds.Width
$height = $bounds.Height - $BottomCrop
if ($height -le 0) { Fail "BottomCrop ($BottomCrop) が画面の高さ ($($bounds.Height)) 以上です。" }

Write-Host ''
Write-Host "画面 $($bounds.Width)x$($bounds.Height) から $($width)x$($height) を撮ります（下 $BottomCrop px を切り落とし）。" -ForegroundColor Cyan
if ($width -lt $MIN_WIDTH -or $height -lt $MIN_HEIGHT) {
  Fail @"
この大きさではストアの最低要件 ${MIN_WIDTH}x${MIN_HEIGHT} を満たせません（$($width)x$($height)）。

       VM の解像度を上げてください（1920x1080 を推奨）。
       Mac 側で Parallels の窓を撮っていると縮むので、**VM の中で**叩くこと。
"@
}

Write-Host "$Delay 秒後に撮ります。このコンソールは自動で引っ込むので、撮りたい窓をクリックしてください。" -ForegroundColor Yellow
Start-Sleep -Milliseconds 400

# この窓が写り込まないように引っ込める（罠 5）。撮り終えたら戻す。
$SW_MINIMIZE = 6
$SW_RESTORE  = 9
$console = [LayerTalk.Win32]::GetConsoleWindow()
if ($console -ne [IntPtr]::Zero) { [LayerTalk.Win32]::ShowWindow($console, $SW_MINIMIZE) | Out-Null }

try {
  Start-Sleep -Seconds $Delay
  $bitmap   = New-Object Drawing.Bitmap $width, $height
  $graphics = [Drawing.Graphics]::FromImage($bitmap)
  try {
    $graphics.CopyFromScreen($bounds.X, $bounds.Y, 0, 0, (New-Object Drawing.Size $width, $height))
  } finally {
    $graphics.Dispose()
  }
} finally {
  if ($console -ne [IntPtr]::Zero) { [LayerTalk.Win32]::ShowWindow($console, $SW_RESTORE) | Out-Null }
}

$path = Join-Path $OutputDirectory "${Name}_windows.png"
$bitmap.Save($path, [Drawing.Imaging.ImageFormat]::Png)
$bitmap.Dispose()

$saved = [Drawing.Image]::FromFile($path)
$w = $saved.Width; $h = $saved.Height
$saved.Dispose()
if ($w -lt $MIN_WIDTH -or $h -lt $MIN_HEIGHT) { Fail "保存した画像が ${w}x${h} で、要件 ${MIN_WIDTH}x${MIN_HEIGHT} を下回ります。" }

Write-Host ''
Write-Host "done: $path (${w}x${h})" -ForegroundColor Green
Write-Host '  透かしが写っていたら -BottomCrop を増やしてください（例 -BottomCrop 200）。' -ForegroundColor DarkGray
