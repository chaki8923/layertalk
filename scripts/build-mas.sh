#!/usr/bin/env bash
#
# Mac App Store 提出用の .pkg を作る。
#
# `npm run tauri:build:mas` は **.app までしか作らない**。App Store Connect /
# Transporter が受け取るのは `3rd Party Mac Developer Installer` で署名した
# `.pkg` なので、そこまでを1本にしてある。
#
# 必要なもの（すべて Apple Developer Program の登録が前提）:
#   - キーチェーンに `3rd Party Mac Developer Application: ...` と
#     `3rd Party Mac Developer Installer: ...` の2つの証明書
#   - bundle id `app.layertalk.presenter` の Mac App Store プロビジョニングプロファイル
#
# 使い方:
#   MAS_APP_IDENTITY="3rd Party Mac Developer Application: Example (TEAMID)" \
#   MAS_INSTALLER_IDENTITY="3rd Party Mac Developer Installer: Example (TEAMID)" \
#   MAS_PROVISION_PROFILE=~/Downloads/LayerTalk_MAS.provisionprofile \
#   VITE_AUDIENCE_BASE_URL=https://example.com \
#   ./scripts/build-mas.sh
#
# 署名は `--deep` を使わない。Apple は非推奨にしていて、入れ子の署名を
# 上書きして壊すことがある。内側（フレームワーク・ヘルパ）から順に署名する。

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
tauri_dir="$repo_root/apps/presenter-app/src-tauri"
entitlements="$tauri_dir/Entitlements.mas.plist"
app_path="$tauri_dir/target/release/bundle/macos/LayerTalk.app"
pkg_path="$repo_root/LayerTalk.pkg"

require() {
  if [ -z "${!1:-}" ]; then
    echo "error: $1 is required. See the header of this script." >&2
    exit 1
  fi
}

require MAS_APP_IDENTITY
require MAS_INSTALLER_IDENTITY
require MAS_PROVISION_PROFILE

# ビルド時に注入される値。未設定だと `openAudiencePage` が
# 「Audience URL is not configured」で落ち、法務リンクが全部死ぬ。
require VITE_AUDIENCE_BASE_URL

if [ ! -f "$MAS_PROVISION_PROFILE" ]; then
  echo "error: provisioning profile not found: $MAS_PROVISION_PROFILE" >&2
  exit 1
fi

echo "==> building (LAYERTALK_DISTRIBUTION_CHANNEL=mas)"
cd "$repo_root/apps/presenter-app"
npm run tauri:build:mas

if [ ! -d "$app_path" ]; then
  echo "error: expected bundle not found: $app_path" >&2
  exit 1
fi

echo "==> embedding the provisioning profile"
cp "$MAS_PROVISION_PROFILE" "$app_path/Contents/embedded.provisionprofile"

echo "==> signing nested code, then the app"
# 内側から順に。`find -print0` なのは、パスに空白が入っても壊れないようにするため。
while IFS= read -r -d '' nested; do
  codesign --force --timestamp --options runtime \
    --sign "$MAS_APP_IDENTITY" "$nested"
done < <(find "$app_path/Contents" \
  \( -name "*.dylib" -o -name "*.framework" -o -perm +111 -type f \) \
  -not -path "$app_path/Contents/MacOS/*" -print0 2>/dev/null || true)

codesign --force --timestamp --options runtime \
  --entitlements "$entitlements" \
  --sign "$MAS_APP_IDENTITY" "$app_path"

echo "==> verifying the signature and entitlements"
codesign --verify --strict --verbose=2 "$app_path"
codesign --display --entitlements - "$app_path"

echo "==> building the installer package"
rm -f "$pkg_path"
productbuild --component "$app_path" /Applications \
  --sign "$MAS_INSTALLER_IDENTITY" "$pkg_path"

echo
echo "done: $pkg_path"
echo "Upload it with Transporter, or:"
echo "  xcrun altool --upload-app -f \"$pkg_path\" -t macos -u <apple-id> -p <app-specific-password>"
