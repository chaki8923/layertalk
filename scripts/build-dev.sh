#!/usr/bin/env bash
#
# 開発署名（Apple Development）で、手元で起動できる `.app` を作る。
#
# `build-mas.sh` が作る Distribution 署名の `.app` は **手元で起動できない**ので、
# StoreKit の購入を Sandbox で通したり、購入シートのスクリーンショットを撮ったりするには
# こちらを使う。アドホック署名（`docs/remaining-tasks.md` の「登録前にアドホック署名で試す手順」）
# では **StoreKit が商品を取得できない** — `embedded.provisionprofile` も
# `com.apple.application-identifier` も無いため。Event Pass の価格が「—」のままになる。
#
# 必要なもの:
#   - キーチェーンに `Apple Development: ...`（または `Mac Development: ...`）の証明書
#   - bundle id `app.layertalk.presenter` の **macOS App Development** プロビジョニングプロファイル
#     （このスクリプトを走らせる Mac がデバイス登録されていること）
#
# 使い方:
#   DEV_APP_IDENTITY="Apple Development: Example (TEAMID)" \
#   DEV_PROVISION_PROFILE=~/Downloads/LayerTalk_Dev_macOS.provisionprofile \
#   ./scripts/build-dev.sh
#
# フロントは **必ず mas チャネル**で焼く（`npm run tauri:build:mas`）。StoreKit のネイティブ側は
# `src-tauri/build.rs` が OS でしか分岐しないのでどのチャネルでもリンクされるが、購入導線の UI は
# `vite.config.ts` の alias が `billing.mas.ts` を向いていないと出てこない。
#
# 提出用の `target/release/bundle/macos/LayerTalk.app` は署名し直さず、
# `target/dev-signed/LayerTalk.app` に複製してから署名する。

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
tauri_dir="$repo_root/apps/presenter-app/src-tauri"
entitlements="$tauri_dir/Entitlements.mas.plist"
built_app="$tauri_dir/target/release/bundle/macos/LayerTalk.app"
app_path="$tauri_dir/target/dev-signed/LayerTalk.app"

require() {
  if [ -z "${!1:-}" ]; then
    echo "error: $1 is required. See the header of this script." >&2
    exit 1
  fi
}

require DEV_APP_IDENTITY
require DEV_PROVISION_PROFILE

if [ ! -f "$DEV_PROVISION_PROFILE" ]; then
  echo "error: provisioning profile not found: $DEV_PROVISION_PROFILE" >&2
  exit 1
fi

# プロファイルの検証はビルドより先に。数分かけて焼いたあとで種類違いに気付くのは無駄が大きい。
echo "==> checking the provisioning profile"
# `build-mas.sh` と同じ理由（codesign を直接叩くとプロファイルの entitlements が合成されない）ので、
# ここで抜いた値を署名時に足す。plist に XML コメントを書かないこと
# — codesign が entitlements ごと黙って落とす。
work_dir="$(mktemp -d -t layertalk-dev)"
trap 'rm -rf "$work_dir"' EXIT
profile_plist="$work_dir/profile.plist"
signing_entitlements="$work_dir/entitlements.plist"
security cms -D -i "$DEV_PROVISION_PROFILE" > "$profile_plist"

# プロファイルの種類を先に弾く。ポータルで「App Store Connect」や「iOS App Development」を選ぶと
# `Platform = iOS` のプロファイルができ、entitlements のキーが `com.apple.application-identifier`
# ではなく `application-identifier` になる。気付かずに署名すると、起動もアップロードも失敗する。
platforms="$(/usr/libexec/PlistBuddy -c "Print :Platform" "$profile_plist" 2>/dev/null || true)"
case "$platforms" in
  *OSX*) ;;
  *)
    echo "error: the provisioning profile is not for macOS (Platform: ${platforms//$'\n'/ })" >&2
    echo "       pick 'macOS App Development' in the developer portal, not the iOS one." >&2
    exit 1
    ;;
esac

profile_entitlement() {
  /usr/libexec/PlistBuddy -c "Print :Entitlements:$1" "$profile_plist" 2>/dev/null || {
    echo "error: the provisioning profile has no $1 entitlement" >&2
    exit 1
  }
}
app_identifier="$(profile_entitlement com.apple.application-identifier)"
team_identifier="$(profile_entitlement com.apple.developer.team-identifier)"

case "$app_identifier" in
  "$team_identifier.app.layertalk.presenter") ;;
  *)
    echo "error: the provisioning profile is for $app_identifier, not $team_identifier.app.layertalk.presenter" >&2
    exit 1
    ;;
esac

cp "$entitlements" "$signing_entitlements"
/usr/libexec/PlistBuddy \
  -c "Add :com.apple.application-identifier string $app_identifier" \
  -c "Add :com.apple.developer.team-identifier string $team_identifier" \
  "$signing_entitlements"

echo "==> building (LAYERTALK_DISTRIBUTION_CHANNEL=mas)"
cd "$repo_root/apps/presenter-app"
npm run tauri:build:mas

if [ ! -d "$built_app" ]; then
  echo "error: expected bundle not found: $built_app" >&2
  exit 1
fi

echo "==> copying to target/dev-signed"
rm -rf "$app_path"
mkdir -p "$(dirname "$app_path")"
ditto "$built_app" "$app_path"

echo "==> embedding the provisioning profile"
cp "$DEV_PROVISION_PROFILE" "$app_path/Contents/embedded.provisionprofile"
# ブラウザで落としたプロファイルには `com.apple.quarantine` と `kMDItemWhereFroms` が付いていて、
# `cp` がそれごと .app の中へ運ぶ。App Store Connect は拡張属性の付いたファイルを含む
# パッケージを **アップロード後の処理で** 弾く（ITMS-91109 Invalid package contents）。
# ローカルの検証（codesign / verify:mas-bundle）は全部通るので、ここで落とさないと気付けない。
# **署名より前**にやること。署名後に消すと codesign が付けた `com.apple.cs.*` まで飛ぶ。
xattr -cr "$app_path" 2>/dev/null || true

echo "==> signing nested code, then the app"
# `--deep` は使わない（入れ子の署名を上書きして壊すことがある）。内側から順に。
while IFS= read -r -d '' nested; do
  codesign --force --timestamp --options runtime \
    --sign "$DEV_APP_IDENTITY" "$nested"
done < <(find "$app_path/Contents" \
  \( -name "*.dylib" -o -name "*.framework" -o -perm +111 -type f \) \
  -not -path "$app_path/Contents/MacOS/*" -print0 2>/dev/null || true)

codesign --force --timestamp --options runtime \
  --entitlements "$signing_entitlements" \
  --sign "$DEV_APP_IDENTITY" "$app_path"

echo "==> verifying the signature and entitlements"
codesign --verify --strict --verbose=2 "$app_path"
codesign -d --entitlements - --xml "$app_path" | plutil -p -

echo
echo "done: $app_path"
echo "Launch it with:"
echo "  open \"$app_path\""
echo
echo "StoreKit runs against Sandbox. macOS asks for the account when you tap Buy —"
echo "enter a sandbox tester there (its mailbox must be readable: the sign-in sends a 2FA code)."
echo "There is no 'System Settings > Developer > Sandbox Apple Account' pane on macOS 26,"
echo "so the only reliable way to switch a remembered sandbox account is a new macOS user."
echo "Sign in to LayerTalk as a presenter first, or the purchase is refused."
