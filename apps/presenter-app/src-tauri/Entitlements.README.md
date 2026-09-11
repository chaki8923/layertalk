# Entitlements.plist の中身と理由

**`Entitlements.plist` にコメントを書かないこと。** `plutil -lint` は通るが、
`codesign --entitlements` に渡すと **AMFI のパーサが XML コメントを解釈できず**
`AMFIUnserializeXML: syntax error near line N` で落ちる。理由はこのファイルに書く。

| key | なぜ要るか |
|---|---|
| `com.apple.security.app-sandbox` | App Store 2.4.5(i)。MAS 提出の必須条件 |
| `com.apple.security.network.client` | Supabase（HTTPS と Realtime の WebSocket）と `www.layer-talk.com`（課金 API・法務ページ）。**着信は無いので `network.server` は入れない** |
| `com.apple.security.files.user-selected.read-write` | 発表レポートの書き出し。`save()`（NSSavePanel）で利用者が選んだ1ファイルにだけ書く（`EventPassPanel.tsx` の `exportReport`）。sandbox では powerbox がその場所だけを開ける。**質問スライドの画像はアプリのコンテナ配下**なのでこれとは無関係 |

## あえて入れていないもの

`com.apple.security.screen-capture` / `network.server` / `files.downloads.read-write`。
**最小で保つこと。** 先回りで盛ると「本当に要るのか誰も知らない entitlement」が残り、
審査で説明できなくなる。足すのは**実測で拒否を見てから**。

## 証明書が無くても実測できる

App Sandbox はコード署名に入った entitlement を見てカーネルが強制するので、
Developer ID は要らない。アドホック署名で実際に効く:

```bash
npm run build:presenter
APP=apps/presenter-app/src-tauri/target/release/bundle/macos/LayerTalk.app
codesign --force --sign - --entitlements apps/presenter-app/src-tauri/Entitlements.plist "$APP"
codesign -d --entitlements - "$APP"        # 乗ったことの確認
```

**効いていることの直接の証拠**は、起動後に `~/Library/Containers/app.layertalk.presenter/`
ができること。無ければ以降の計測は全部無意味。

拒否の観測はアプリのログではなく OS 側（罠 #17 と同じ流儀）:

```bash
log stream --style compact \
  --predicate 'eventMessage CONTAINS "deny" AND eventMessage CONTAINS "presenter-app"'
```

## 証明書が入ったら

- `tauri.conf.json` の `bundle.macOS.signingIdentity` に Mac App Distribution を設定
- provisioning profile を `bundle.macOS.files` で `embedded.provisionprofile` として埋める
- `bundle.targets` に MAS 用（`.pkg`）を足す
