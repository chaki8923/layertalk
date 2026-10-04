#Requires -Version 5.1
<#
  Microsoft Store 提出用の .msix を作る。**Windows の VM で走らせる。**

  Tauri に MSIX のバンドルターゲットは無いので、x64 の実行ファイルまでを Tauri CLI に
  作らせて、ペイロードの組み立てと MakeAppx は自分でやる。scripts/build-mas.sh の Windows 版。

  ---------------------------------------------------------------------------
  必要なもの
  ---------------------------------------------------------------------------
    - Rust と `rustup target add x86_64-pc-windows-msvc`
      VM が ARM64 なら既定ターゲットは aarch64 なので、**明示しないと x64 は作られない。**
      できた x64 の実行ファイルは Windows の x64 エミュレーションで試せる。
    - Visual Studio 2022 Build Tools の C++ ワークロード
      **ARM64 の MSVC だけでは x64 をリンクできない。** インストーラで
      「MSVC v143 - VS 2022 C++ x64/x86 build tools」を足すこと。
    - Windows SDK（MakeAppx.exe / MakePri.exe が入る。上の C++ ワークロードに同梱）
    - Node 22 以上
    - apps/presenter-app/.env.local（観客 Web の URL が要る。無いとビルドが落ちる）

  ---------------------------------------------------------------------------
  使い方
  ---------------------------------------------------------------------------
    $env:MSIX_IDENTITY_NAME          = "12345Yourname.LayerTalk"
    $env:MSIX_PUBLISHER              = "CN=A1B2C3D4-1234-5678-9ABC-DEF012345678"
    $env:MSIX_PUBLISHER_DISPLAY_NAME = "Your Name"
    .\scripts\build-msix.ps1

  3つとも Partner Center の値で、**推測して入れてはいけない**。
    MSIX_IDENTITY_NAME / MSIX_PUBLISHER
      Partner Center > (アプリ) > 製品の管理 > 製品 ID
      それぞれ「パッケージ/ID/名前」と「パッケージ/ID/発行者」
    MSIX_PUBLISHER_DISPLAY_NAME
      Partner Center > アカウント設定 > アカウントの詳細 >「発行者の表示名」
  大文字小文字・空白・句読点まで一致していないと認証に落ちる。

  再提出のたびにバージョンの**3番目**を上げる（4番目はストアの予約領域で 0 固定）:
    $env:MSIX_VERSION = "1.0.1.0"

  ---------------------------------------------------------------------------
  罠
  ---------------------------------------------------------------------------
  1. **署名しない。** ストアが Microsoft の証明書で再署名する。自己署名したものを出すと
     Identity/Publisher と証明書の subject が食い違い、publisher mismatch で弾かれる。
     ローカルで試す手順は docs/ms-store-listing.md にある。

  2. **`npm run tauri:build -- --no-bundle` は動かない。** npm が `--no-bundle` を
     自分の設定として食う（CLAUDE.md 罠 #19）。だから `npx tauri build` を直接叩く。

  3. **`--no-bundle` は必須。** 無いと tauri.conf.json の `bundle.targets: ["app","dmg"]` を
     Windows で解決しようとして落ちる。パッケージはこのスクリプトが作る。

  4. **cargo で直接ビルドした .exe を staging に置かないこと**（CLAUDE.md 罠 #19）。
     `custom-protocol` feature を足すのは tauri CLI の側で、cargo から直接だと release でも
     dev と判定され、埋め込んだ dist ではなく devUrl を見に行く。**どの窓も真っ白のまま、
     エラーも出ない。** MSIX の中だと原因がさらに追えない。下の Assert-FrontendEmbedded が
     dist の実ファイル名を .exe のバイト列から探して機械的に弾く。

  5. **このファイルは UTF-8 BOM 付きで保存すること。** Windows PowerShell 5.1 は
     `.ps1` を**システムの ANSI コードページ（日本語環境では CP932）として読む**。
     BOM が無いと日本語のコメントが全部文字化けし、壊れた文字列が構文まで壊して
     「式またはステートメントのトークン '}' を使用できません」の山になる（実際に踏んだ）。
     BOM があれば 5.1 でも 7 でも UTF-8 として読まれる。

  6. **実行ファイルの名前は presenter-app.exe。** Tauri は cargo のバイナリ名を productName に
     改名しない。staging で LayerTalk.exe へ改名する（マニフェストの Executable と合わせる）。
#>

[CmdletBinding()]
param(
  [string]$Version,
  # 修飾子付きアセットと resources.pri を作らない。インストールはできるが、
  # 高 DPI でアイコンがぼけ、タスクバーと Start でアイコンの裏に台座が付く。
  [switch]$SkipAssetVariants,
  [string]$OutputDirectory
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Fail([string]$Message) {
  Write-Host ''
  Write-Host "error: $Message" -ForegroundColor Red
  exit 1
}
function Step([string]$Message) { Write-Host "==> $Message" -ForegroundColor Cyan }

# ネイティブ exe は失敗しても例外を投げない。$LASTEXITCODE を必ず見る。
function Invoke-Native([string]$Exe, [string[]]$Arguments) {
  Write-Host "    $Exe $($Arguments -join ' ')" -ForegroundColor DarkGray
  & $Exe @Arguments
  if ($LASTEXITCODE -ne 0) { Fail "$([IO.Path]::GetFileName($Exe)) exited with $LASTEXITCODE." }
}

function Require-Env([string]$Name, [string]$Where) {
  $value = [Environment]::GetEnvironmentVariable($Name)
  if ([string]::IsNullOrWhiteSpace($value)) { Fail "$Name is required.`n       どこにあるか: $Where" }
  return $value
}

# Windows Kits のパスは SDK のバージョンごとに変わるので決め打ちにしない。
function Find-SdkTool([string]$Name, [string[]]$PreferredArchitectures) {
  if (-not $PreferredArchitectures) {
    $hostArch = switch ($env:PROCESSOR_ARCHITECTURE) { 'ARM64' { 'arm64' } 'AMD64' { 'x64' } default { 'x86' } }
    $PreferredArchitectures = @($hostArch, 'x64', 'x86') | Select-Object -Unique
  }
  $onPath = Get-Command $Name -ErrorAction SilentlyContinue
  if ($onPath) { return $onPath.Source }

  $roots = @(
    (Join-Path ${env:ProgramFiles(x86)} 'Windows Kits\10\bin'),
    (Join-Path $env:ProgramFiles          'Windows Kits\10\bin')
  ) | Where-Object { $_ -and (Test-Path -LiteralPath $_) }

  $found = foreach ($root in $roots) {
    Get-ChildItem -LiteralPath $root -Directory -ErrorAction SilentlyContinue |
      Where-Object { $_.Name -match '^10\.\d+\.\d+\.\d+$' } |
      ForEach-Object {
        $sdk = $_
        foreach ($arch in $PreferredArchitectures) {
          $candidate = Join-Path $sdk.FullName "$arch\$Name"
          if (Test-Path -LiteralPath $candidate) {
            [pscustomobject]@{ Path = $candidate; Sdk = [version]$sdk.Name; Rank = [array]::IndexOf($PreferredArchitectures, $arch) }
          }
        }
      }
  }
  $best = $found | Sort-Object Rank, @{ Expression = 'Sdk'; Descending = $true } | Select-Object -First 1
  if ($best) { return $best.Path }
  Fail "$Name が見つかりません。Windows SDK（Visual Studio Build Tools の C++ ワークロードに同梱）を入れてください。"
}

function Resize-Png([string]$Source, [string]$Destination, [int]$Size) {
  $image = [System.Drawing.Image]::FromFile((Resolve-Path -LiteralPath $Source))
  try {
    $bitmap = New-Object System.Drawing.Bitmap $Size, $Size
    try {
      $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
      try {
        $graphics.CompositingMode    = [System.Drawing.Drawing2D.CompositingMode]::SourceCopy
        $graphics.InterpolationMode  = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.SmoothingMode      = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $graphics.PixelOffsetMode    = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $graphics.DrawImage($image, 0, 0, $Size, $Size)
      } finally { $graphics.Dispose() }
      $bitmap.Save($Destination, [System.Drawing.Imaging.ImageFormat]::Png)
    } finally { $bitmap.Dispose() }
  } finally { $image.Dispose() }
}

# 罠 #4 の機械的な検査。vite が付けたハッシュ入りのファイル名が .exe の中に
# 現れるかを見る。無ければフロントが埋め込まれていない＝起動しても真っ白。
# ハッシュは毎回変わるので、古い exe の使い回しもここで分かる。
function Assert-FrontendEmbedded([string]$Exe, [string]$DistDirectory) {
  $assets = Join-Path $DistDirectory 'assets'
  if (-not (Test-Path -LiteralPath $assets)) { Write-Warning "no $assets - skipping the embedded-frontend check."; return }
  $marker = Get-ChildItem -LiteralPath $assets -File -Filter '*.js' | Sort-Object Length -Descending | Select-Object -First 1
  if (-not $marker) { Write-Warning 'no bundled JS in dist/assets - skipping.'; return }

  $text = [Text.Encoding]::ASCII.GetString([IO.File]::ReadAllBytes($Exe))
  if ($text.IndexOf($marker.Name, [StringComparison]::Ordinal) -ge 0) {
    Write-Host "    embedded frontend ok ($($marker.Name))" -ForegroundColor DarkGray
    return
  }
  Fail @"
ビルドした実行ファイルにフロントが埋め込まれていません（$($marker.Name) がバイナリ中に無い）。

       CLAUDE.md の罠 #19 です。``custom-protocol`` feature を足すのは tauri CLI の側で、
       素の ``cargo build --release`` は release でも dev と判定され、devUrl
       (http://localhost:1420) を見に行きます。**どの窓も真っ白のまま、エラーも出ません。**

       cargo でビルドした exe を手で置かず、このスクリプトに ``npx tauri build`` を走らせてください。
"@
}

# ---------------------------------------------------------------- 前提

Step 'checking prerequisites'

$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$appDir   = Join-Path $repoRoot 'apps\presenter-app'
$tauriDir = Join-Path $appDir  'src-tauri'
$iconsDir = Join-Path $tauriDir 'icons'
$distDir  = Join-Path $appDir  'dist'
$template = Join-Path $tauriDir 'msix\AppxManifest.template.xml'
if (-not (Test-Path -LiteralPath $template)) { Fail "manifest template not found: $template" }

$identityName         = Require-Env 'MSIX_IDENTITY_NAME'          'Partner Center > (アプリ) > 製品の管理 > 製品 ID >「パッケージ/ID/名前」'
$publisher            = Require-Env 'MSIX_PUBLISHER'              'Partner Center > (アプリ) > 製品の管理 > 製品 ID >「パッケージ/ID/発行者」'
$publisherDisplayName = Require-Env 'MSIX_PUBLISHER_DISPLAY_NAME' 'Partner Center > アカウント設定 > アカウントの詳細 >「発行者の表示名」'

# Publisher は識別名。CN= で始まらないのはほぼ確実に貼り間違い（アプリ名や PFN を貼っている）。
if ($publisher -notmatch '^\s*CN\s*=') { Fail "MSIX_PUBLISHER は CN= で始まる識別名です。受け取った値: $publisher" }

# mas が残っていると StoreKit 用の課金経路が入る（Windows に StoreKit は無い）。
if ($env:LAYERTALK_DISTRIBUTION_CHANNEL -eq 'mas') {
  Fail 'LAYERTALK_DISTRIBUTION_CHANNEL=mas が設定されています。Windows は direct（Stripe）です: Remove-Item Env:\LAYERTALK_DISTRIBUTION_CHANNEL'
}

foreach ($tool in @('node', 'npx', 'cargo', 'rustup')) {
  if (-not (Get-Command $tool -ErrorAction SilentlyContinue)) { Fail "$tool が PATH にありません。" }
}
$nodeMajor = [int](((& node --version) -replace '^v', '') -split '\.')[0]
if ($nodeMajor -lt 22) { Fail "Node 22 以上が要ります（今: $(& node --version)）。" }

if ((& rustup target list --installed) -notcontains 'x86_64-pc-windows-msvc') {
  Fail @"
x86_64-pc-windows-msvc のターゲットが入っていません。

       この VM が ARM64 なら既定は aarch64 なので、x64 は自動では作られません:
         rustup target add x86_64-pc-windows-msvc

       加えて x64 の MSVC ツールチェーンが要ります。Visual Studio Build Tools の
       インストーラで「MSVC v143 - VS 2022 C++ x64/x86 build tools」を足してください。
"@
}

$makeAppx = Find-SdkTool 'makeappx.exe'
Write-Host "    makeappx: $makeAppx" -ForegroundColor DarkGray
$makePri = $null
if (-not $SkipAssetVariants) {
  # MakePri に ARM 版は無い。x64 をエミュレーションで走らせる。
  $makePri = Find-SdkTool 'makepri.exe' @('x64', 'x86')
  Write-Host "    makepri:  $makePri" -ForegroundColor DarkGray
  Add-Type -AssemblyName System.Drawing
}

# ---------------------------------------------------------------- バージョン

if (-not $Version) { $Version = $env:MSIX_VERSION }
if (-not $Version) {
  $tauriConfig = Get-Content -LiteralPath (Join-Path $tauriDir 'tauri.conf.json') -Raw | ConvertFrom-Json
  $Version = "$($tauriConfig.version).0"
}
if ($Version -notmatch '^(\d+)\.(\d+)\.(\d+)\.(\d+)$') { Fail "MSIX_VERSION は4つ組です（例 1.0.0.0）。受け取った値: $Version" }
$parts = $Matches[1..4] | ForEach-Object { [int]$_ }
if ($parts[3] -ne 0) {
  Fail "バージョンの4番目は 0 固定です（ストアの予約領域）。再提出なら3番目を上げてください: $($parts[0]).$($parts[1]).$($parts[2] + 1).0"
}
if ($parts[0] -eq 0) { Fail "バージョンの1番目を 0 にはできません: $Version" }
if ($parts | Where-Object { $_ -gt 65535 }) { Fail "バージョンの各部は 0..65535 です: $Version" }

$maxVersionTested = $env:MSIX_MAX_VERSION_TESTED
if (-not $maxVersionTested) {
  $os = [Environment]::OSVersion.Version
  $maxVersionTested = "$($os.Major).$($os.Minor).$($os.Build).0"
}
Write-Host "    version:  $Version  (MaxVersionTested $maxVersionTested)" -ForegroundColor DarkGray

# ---------------------------------------------------------------- ビルド

Step 'building the frontend and the x64 binary'

# tauri build が beforeBuildCommand（tsc && vite build）を先に走らせる。
# 観客 Web の URL が欠けていれば vite.config.ts のガードがここで落とす。
Push-Location -LiteralPath $appDir
try { Invoke-Native 'npx' @('tauri', 'build', '--target', 'x86_64-pc-windows-msvc', '--no-bundle') }
finally { Pop-Location }

$releaseDir = Join-Path $tauriDir 'target\x86_64-pc-windows-msvc\release'
$builtExe = @('LayerTalk.exe', 'presenter-app.exe') |
  ForEach-Object { Join-Path $releaseDir $_ } |
  Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $builtExe) { Fail "$releaseDir に実行ファイルがありません（LayerTalk.exe / presenter-app.exe を探しました）。" }
Write-Host "    built: $builtExe" -ForegroundColor DarkGray
Assert-FrontendEmbedded $builtExe $distDir

# ---------------------------------------------------------------- ペイロード

Step 'staging the payload'

$workDir    = Join-Path $tauriDir 'target\msix'
$stagingDir = Join-Path $workDir  'staging'
if (Test-Path -LiteralPath $stagingDir) { Remove-Item -LiteralPath $stagingDir -Recurse -Force }
$assetsDir = Join-Path $stagingDir 'Assets'
New-Item -ItemType Directory -Path $assetsDir -Force | Out-Null

# マニフェストの Executable に合わせて改名する（罠 #5）。
Copy-Item -LiteralPath $builtExe -Destination (Join-Path $stagingDir 'LayerTalk.exe') -Force

# フロントは .exe に埋め込まれているので dist/ は入れない。
# src-tauri/resources/*.lproj は macOS 専用。capabilities/ はコンパイル時に取り込まれる。
$loader = Join-Path $releaseDir 'WebView2Loader.dll'
if (Test-Path -LiteralPath $loader) {
  Copy-Item -LiteralPath $loader -Destination $stagingDir -Force
  Write-Host '    staged WebView2Loader.dll' -ForegroundColor DarkGray
}

$manifestLogos = @('Square44x44Logo.png', 'Square150x150Logo.png', 'Square71x71Logo.png', 'Square310x310Logo.png', 'StoreLogo.png')

if ($SkipAssetVariants) {
  foreach ($logo in $manifestLogos) { Copy-Item -LiteralPath (Join-Path $iconsDir $logo) -Destination $assetsDir -Force }
  Write-Warning '-SkipAssetVariants: 高 DPI でアイコンがぼけ、タスクバーと Start で台座が付きます。'
} else {
  Step 'generating scale-qualified and target-size assets'
  # tauri icon が出したファイルは、そのまま scale 修飾子に対応する。
  $copyMap = @{
    'Square44x44Logo.png'   = 'Square44x44Logo.scale-100.png'
    'Square71x71Logo.png'   = 'Square71x71Logo.scale-100.png'
    'Square89x89Logo.png'   = 'Square71x71Logo.scale-125.png'
    'Square107x107Logo.png' = 'Square71x71Logo.scale-150.png'
    'Square142x142Logo.png' = 'Square71x71Logo.scale-200.png'
    'Square284x284Logo.png' = 'Square71x71Logo.scale-400.png'
    'Square150x150Logo.png' = 'Square150x150Logo.scale-100.png'
    'Square310x310Logo.png' = 'Square310x310Logo.scale-100.png'
    'StoreLogo.png'         = 'StoreLogo.scale-100.png'
  }
  foreach ($source in $copyMap.Keys) {
    $from = Join-Path $iconsDir $source
    if (-not (Test-Path -LiteralPath $from)) { Fail "アイコンがありません: $from（apps/presenter-app で ``npx tauri icon`` を実行）" }
    Copy-Item -LiteralPath $from -Destination (Join-Path $assetsDir $copyMap[$source]) -Force
  }

  # 残りは icon.png（512x512）から**縮小だけ**で作る。拡大はしない。
  $master = Join-Path $iconsDir 'icon.png'
  if (-not (Test-Path -LiteralPath $master)) { Fail "元のアイコンがありません: $master" }
  $generate = @{
    'Square44x44Logo.scale-125.png'   = 55;  'Square44x44Logo.scale-150.png'   = 66
    'Square44x44Logo.scale-200.png'   = 88;  'Square44x44Logo.scale-400.png'   = 176
    'Square150x150Logo.scale-125.png' = 188; 'Square150x150Logo.scale-150.png' = 225
    'Square150x150Logo.scale-200.png' = 300
    'StoreLogo.scale-125.png'         = 63;  'StoreLogo.scale-150.png'         = 75
    'StoreLogo.scale-200.png'         = 100; 'StoreLogo.scale-400.png'         = 200
  }
  foreach ($name in $generate.Keys) { Resize-Png $master (Join-Path $assetsDir $name) $generate[$name] }

  # targetsize-* は台座の付かないアイコン（タスクバー・Alt+Tab）。これが無いと
  # アイコンの裏に台座が付く。_altform-unplated はテーマ別で、絵は同じでよい。
  foreach ($size in 16, 20, 24, 30, 32, 36, 40, 48, 60, 64, 72, 96, 256) {
    $plated = Join-Path $assetsDir "Square44x44Logo.targetsize-$size.png"
    Resize-Png $master $plated $size
    Copy-Item -LiteralPath $plated -Destination (Join-Path $assetsDir "Square44x44Logo.targetsize-${size}_altform-unplated.png") -Force
    Copy-Item -LiteralPath $plated -Destination (Join-Path $assetsDir "Square44x44Logo.targetsize-${size}_altform-lightunplated.png") -Force
  }
  Write-Host "    generated $((Get-ChildItem -LiteralPath $assetsDir -File).Count) asset files" -ForegroundColor DarkGray
}

# ---------------------------------------------------------------- マニフェスト

Step 'writing AppxManifest.xml'

$manifestPath = Join-Path $stagingDir 'AppxManifest.xml'
$manifestText = Get-Content -LiteralPath $template -Raw
@{
  '@@IDENTITY_NAME@@'          = $identityName
  '@@PUBLISHER@@'              = $publisher
  '@@PUBLISHER_DISPLAY_NAME@@' = $publisherDisplayName
  '@@VERSION@@'                = $Version
  '@@MAX_VERSION_TESTED@@'     = $maxVersionTested
}.GetEnumerator() | ForEach-Object { $manifestText = $manifestText.Replace($_.Key, $_.Value) }

if ($manifestText -match '@@[A-Z_]+@@') { Fail "テンプレートに置換されていない箇所が残っています: $($Matches[0])" }
# MakeAppx のスキーマエラーより読めるので、ここで XML として検査しておく。
try { [xml]$manifestText | Out-Null } catch { Fail "生成したマニフェストが XML として不正です: $($_.Exception.Message)" }
# BOM 無しで書く。
[IO.File]::WriteAllText($manifestPath, $manifestText, (New-Object Text.UTF8Encoding $false))

if (-not $SkipAssetVariants) {
  Step 'indexing resources (MakePri)'
  # priconfig.xml は staging の**外**に作る。中に置くと /pr がそれ自身を索引する。
  $priConfig = Join-Path $workDir 'priconfig.xml'
  Invoke-Native $makePri @('createconfig', '/cf', $priConfig, '/dq', 'ja-JP', '/o')
  Invoke-Native $makePri @('new', '/pr', $stagingDir, '/cf', $priConfig, '/of', (Join-Path $stagingDir 'resources.pri'), '/in', $identityName, '/o')
  if (-not (Test-Path -LiteralPath (Join-Path $stagingDir 'resources.pri'))) { Fail 'MakePri が成功を返したのに resources.pri がありません。' }
}

# ---------------------------------------------------------------- パッケージ

Step 'packing the MSIX (MakeAppx)'

if (-not $OutputDirectory) { $OutputDirectory = $repoRoot }
if (-not (Test-Path -LiteralPath $OutputDirectory)) { New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null }
$msixPath = Join-Path (Resolve-Path -LiteralPath $OutputDirectory) "LayerTalk_${Version}_x64.msix"

# /nv は**付けない**。意味検査（マニフェストが指すファイルが入っているか）こそ欲しい。
Invoke-Native $makeAppx @('pack', '/o', '/d', $stagingDir, '/p', $msixPath)
if (-not (Test-Path -LiteralPath $msixPath)) { Fail "MakeAppx が成功を返したのに $msixPath がありません。" }

Write-Host ''
Write-Host "done: $msixPath ($([math]::Round((Get-Item -LiteralPath $msixPath).Length / 1MB, 1)) MB)" -ForegroundColor Green
Write-Host ''
Write-Host 'このパッケージは意図的に未署名です。署名しないでください。' -ForegroundColor Yellow
Write-Host '  ストアが Microsoft の証明書で再署名します。自分で署名すると Identity/Publisher と'
Write-Host '  証明書の subject が食い違い、publisher mismatch で弾かれます。'
Write-Host ''
Write-Host 'ローカルで試す（署名も証明書も要らない方法）:'
Write-Host "  Add-AppxPackage -Register `"$manifestPath`""
Write-Host '  消すとき: Get-AppxPackage -Name ''*LayerTalk*'' | Remove-AppxPackage'
Write-Host ''
Write-Host '提出は Partner Center > (アプリ) > 申請 > パッケージ から。'
Write-Host '  - runFullTrust の理由を聞かれます（文面は docs/ms-store-listing.md）'
Write-Host '  - プロパティで「購入を許可するが Microsoft の商取引システムを使わない」に必ずチェック'
