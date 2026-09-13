# 残りのやるべきこと（App Store 審査まで）

最終更新: 2026-09-13

**審査までの残作業の正はこのファイルだけ。** 以前の `docs/app-store-gates.html`・`docs/mas-migration-handover.md`・
`docs/handoff.md` は消した（中身はここと `CLAUDE.md` に移してある。戻したければ git の履歴から）。
終わった項目は `[x]` にして、日付と確かめ方を1行残すこと。

関連:
- App Store Connect に貼る審査メモの本文と、審査用アカウントの作り方 → `docs/app-store-review-notes.md`
- App Store Connect に入れる値（名前・説明文・App Privacy の回答案・スクリーンショット）→ `docs/app-store-listing.md`

---

## 0. 登録なしで片付くもの（残りは手で触る作業だけ）

コードと DB 側で片付くものは 2026-09-13 に終えた（下の「もう済んでいること」）。残りは画面を触って確かめる作業。
テスト版は `apps/presenter-app/src-tauri/target/adhoc-sandbox/LayerTalk.app`（2026-09-13 に `main` から作り直し、
Slack / Teams 送信も入っている）。動いているテスト版はメニューバーから終了してから開き直す。

- [ ] **審査員と同じ手順でサインインする**（⌘C / ⌘V の確認を兼ねる）
  サインイン画面で「パスワードでログイン」に切り替え、メールとパスワードを**貼り付けて**入る。
  パスワードは 2026-09-13 に `npm run create:review-account` で発行し直した（リポジトリには書かない）。
  手元に無ければもう一度実行すれば新しいものが出る。
- [ ] **審査用アカウントで新しいルームを作り、発表開始まで通す**
  既定の NG ワードはルームを作るときにしか入らないので、審査で見せるルームは必ずこのアカウントで新しく作る
  （2026-09-13 時点でこのアカウントのルームは 0 件）。
- [ ] **テスト版で、まだ見ていない画面を確かめる**
  - アカウント → サポート、画面収録の設定の 2 つのボタンが開く（規約とプライバシーは確認済み）
  - Keynote / PowerPoint / ブラウザの全画面プレゼンに重なる。⇧⌘L でコントロール窓が出る
  - 「質問時のスライドを保存」をオンにした Event Pass のルームで発表すると、メニューバーに「● REC」が出る
    （テスト用の Event Pass は 2026-09-14 13:21 に切れる。以降に試すなら権利を付け直す）
  - Slack / Teams: 送信先を登録して「テスト送信」が届く。アプリを終了して開き直しても設定が残り、削除できる
- [ ] **スクリーンショットを撮る**
  6 枚（コメントが流れる画面 → 質問パネル → 参加 QR → コントロール窓 → 安全管理 → Event Pass）。
  下に敷くスライドは自作のものにする。撮ったら `./scripts/app-store-screenshot.sh <画像...>` で規定サイズにそろえる
  （この Mac の画面はどちらも 16:10 ではないので、撮ったままでは受け付けられない）。
  IAP 審査用の 1 枚は購入シートが要るので、登録後に撮る（2. の IAP と一緒に）。
- [ ] **ストアの文面を読んで確定させる** — `docs/app-store-listing.md` の日英
  事実との食い違いは 2026-09-13 に直した（ルームコードは英字も入るので「6桁 / 6-digit」を「6文字 / 6-character」に。
  LP も同じ修正）。あとは言い回しを自分の言葉にするだけ。
- [ ] **Slack / Teams の審査用送信先を用意するか決める**
  機能は `245a6ba` で入っている。審査メモ末尾の節は「テスト用の送信先は審査メモで非公開に渡す」と書いているので、
  渡すなら自分の Slack に審査用のチャンネルと Incoming Webhook を作り、提出時に ASC の Review Notes にだけ貼る。
  渡さないなら、その一文を「送信先が無くても他の機能は確認できる」に直す。

## 1. Apple Developer Program に登録する

- [ ] **Individual か Organization かを決める**
  Individual は本名が App Store の販売者名として出る。法人名で出すなら Organization で、D-U-N-S 番号の取得が先（日数がかかる）。
  特商法ページの販売事業者名（Vercel の `LEGAL_SELLER_NAME`）と食い違わないようにする。
- [ ] **登録する** — developer.apple.com/programs から。年 $99。Apple ID に 2 ファクタ認証が要る。登録の審査に数日かかることがある

## 2. Apple 側の設定（登録後）

- [ ] **証明書 2 枚と Mac App Store 用のプロビジョニングプロファイル**
  アプリ署名用とインストーラ署名用。App ID は `app.layertalk.presenter`。
  identity の名前は発行時期で違う（`3rd Party Mac Developer Application:` ではなく `Apple Distribution:` のことがある）ので、
  `security find-identity -v -p codesigning` で実物を見てから `build-mas.sh` に渡す。
- [ ] **App Store Connect にアプリを作り、メタデータを入れる** — `docs/app-store-listing.md` のとおり
- [ ] **IAP を Non-Renewing Subscription で作る**（3.1.1）
  **消耗型で作らないこと。** タイプは後から変えられず、同じ商品 ID も使い直せない。
  商品 ID は `app.layertalk.presenter.event_pass`（サーバの既定値と presenter の `.env.local` がこの値）。
  変えるなら、Vercel の `APPLE_EVENT_PASS_PRODUCT_ID` と MAS ビルドの `VITE_APPLE_EVENT_PASS_PRODUCT_ID` の**両方**を合わせる。
  ずれると `/attempt` は通るのに `fulfill` が product mismatch で落ちる。IAP 審査用のスクリーンショットもここで撮る。
- [ ] **Vercel に `APPLE_APP_ID` を入れて再デプロイし、通知 URL を登録する**
  値は数値の Apple ID。無いと、審査の Sandbox は通るのに公開後の実購入が検証できない（`lib/server/app-store.ts` の `verifiers`）。
  App Store Server Notifications V2 の宛先（本番・Sandbox とも）: `https://www.layer-talk.com/api/billing/app-store/notifications`
- [ ] **Sandbox tester を作る** — Users and Access から
- [ ] **App Privacy と年齢レーティングを入れる** — 回答案は `docs/app-store-listing.md`。トラッキングは「なし」

## 3. 署名済みビルドで確かめる

アドホック署名版で確認済みのものは注記した。本番の署名ではプロファイルが入るので、ここで一度通しておく。

- [ ] **`./scripts/build-mas.sh` で `.pkg` を作る**
  `MAS_APP_IDENTITY` / `MAS_INSTALLER_IDENTITY` / `MAS_PROVISION_PROFILE` の 3 つを渡す（`VITE_*` は `.env.local` から読む）。
- [ ] **`npm run verify:mas-bundle` が緑** — 2026-09-13 に緑（Ed25519 の鍵も Stripe の checkout も無し）。提出するビルドでもう一度
- [ ] **法務リンク 4 つが実際に開く**（5.1.1(i)）— プライバシー / 利用規約 / サポート / 画面収録の設定
  壊れても画面には何も出ない。開かないときは `log stream --predicate 'process == "sandboxd"'` に deny が出る。
  *アドホック署名版で、利用規約とプライバシーが開くことは確認済み（2026-09-13）。*
- [x] **MAS ビルドから開く法務ページに Stripe の文字が出ない**（3.1.1）
  2026-09-13 に本番で確認。規約（日英）・特商法は 0 件。サポートの「送ってはいけない情報」に `Stripe API Key` が
  出ていたので、App Store 版からは外した。
- [ ] **オーバーレイと画面収録が動く** — 0. のテスト版での確認が済んでいれば、ここは通しで一度見るだけ
  *アドホック署名版で確認済み（2026-09-13）: コメント・フキダシ・スタンプ・参加 QR・全画面での質問パネル・
  コントロール窓を閉じたままの発表・モニター切り替え・Wi-Fi 再接続・承認制のスライド保存とレポート・入室パスコード。*
- [ ] **StoreKit を一通り通す**（3.1.1）
  通常購入 / Ask to Buy の承認待ち→承認 / 購入直後に通信を切って再起動しての回収 / 返金通知で権利が revoked になる /
  **別の Mac で「購入を復元」**（Non-Renewing Subscription は全デバイスへ届けるのが開発者の責任なので必須）。
  Distribution 署名の `.app` は手元で起動できないので、開発署名のビルドか TestFlight で行う。
- [ ] **審査用アカウントでサインインし、ルーム作成 → 発表開始まで通る**

## 4. 提出

- [ ] **Review Notes を貼る** — 本文は `docs/app-store-review-notes.md`
  `<REVIEW_PASSWORD>` は App Store Connect に直接入れる（リポジトリには書かない）。
- [ ] **Transporter でアップロードして提出する** — IAP は初回だけ、アプリ本体と一緒に審査へ出す
- [ ] **2 回目以降は `bundleVersion` を上げてからビルドする**
  `apps/presenter-app/src-tauri/tauri.mas.conf.json`（いまは `"1"`、version は `1.0.0`）。App Store Connect は同じビルド番号を二度受け付けない

## 5. 審査が通ったら

- [ ] 審査用アカウントを消すか決める（`npm run create:review-account -- --delete`）。次の審査でもまた要るので、
  消した場合は次の提出前に作り直す

---

## 取り返しがつかない / 気付きにくいもの

- **IAP のタイプと商品 ID は後から変えられない。** 消耗型で作ると、新しい ID を採り直すことになる
- **Individual で登録すると、App Store の販売者名が本名になる。** 法人名なら Organization（D-U-N-S が先）
- **Vercel の環境変数はビルド時に注入される。** `LEGAL_*` や `APPLE_APP_ID` は、入れたら必ず再デプロイする
- **法務リンクが死んでも画面には何も出ない。** 押しても無反応になるだけ。署名済み sandbox の `.app` で目で確かめるまで証拠はない
- **署名 identity の名前は発行時期で変わる。** `security find-identity -v -p codesigning` で実物を確認する

## もう済んでいること（再確認は不要）

- 入室パスコードの修正マイグレーション（`20260913050326`）— 2026-09-13 に本番へ適用。`join_room` が
  `active_room_passcode_hash` を通ること、`' Ａｂｃ１ '` が `Abc1` に正規化されることを確認
- `npm run verify:mas-bundle` が緑（2026-09-13）
- App Store 版の法務ページに Stripe の文字が出ないこと（2026-09-13、上の 3.）
- LP とストア文面のルームコードの書き方（「6文字 / 6-character」。2026-09-13）
- 審査用アカウントの作成（2026-09-13）とパスワードの発行
- テスト版（アドホック署名）の作り直し。Slack / Teams 送信を含む `main` から（2026-09-13）
- アプリアイコン（1024px の原本から作り直し、icns に `ic10` が入っている。2026-09-13）
- 特商法・規約の表示値（`LEGAL_*`）— 本番の特商法・サポート・プライバシーに「［…を公開前に設定］」が出ないことを 2026-09-13 に確認
- MAS ビルド用の env（`VITE_AUDIENCE_BASE_URL` / `VITE_APPLE_EVENT_PASS_PRODUCT_ID`）
- private API の排除・sandbox 用 entitlements・Ed25519 リースの MAS からの分離・StoreKit 2 と JWS のサーバ検証
- 1.2 の 4 要件（NG ワード／通報／ブロック／連絡先）— すべて無料ルームで動く
- 退会導線、パスワードでのサインイン、法務ページのチャネル別の出し分けと英語版（`?lang=en`）
- `open_external_url`（NSWorkspace）への置き換えと `tauri-plugin-opener` の除去
- `scripts/build-mas.sh` / `verify-mas-bundle` / `create-review-account` / `app-store-screenshot.sh`
- 審査メモとストア文面の下書き（`docs/app-store-review-notes.md` / `docs/app-store-listing.md`）
- アドホック署名版での実機確認（3. の注記に加えて、退会・メニューバーのアイコン・JA/EN の切り替え）

## 登録前にアドホック署名で試す手順

Developer Program が無くても、sandbox を効かせた `.app` を手元で動かせる。sandbox でしか出ない不具合は
ここで先に拾える（2026-09-13 の確認はこの手順で行った）。

```bash
npm run tauri:build:mas -w @layertalk/presenter-app
cd apps/presenter-app/src-tauri
rm -rf target/adhoc-sandbox/LayerTalk.app && mkdir -p target/adhoc-sandbox
ditto target/release/bundle/macos/LayerTalk.app target/adhoc-sandbox/LayerTalk.app
codesign --force --sign - --options runtime --entitlements Entitlements.mas.plist target/adhoc-sandbox/LayerTalk.app
codesign --verify --strict --verbose=2 target/adhoc-sandbox/LayerTalk.app
codesign -d --entitlements - --xml target/adhoc-sandbox/LayerTalk.app | plutil -p -   # app-sandbox が true
```

- sandbox が効いている証拠は `~/Library/Containers/app.layertalk.presenter/` ができること
- 署名し直すと、画面収録の許可が外れることがある。効かなければシステム設定で LayerTalk を一度 `−` で外して `+` で入れ直す
- 動いているテスト版は、メニューバーから終了してから開き直す

## App Store 以外（任意）— 直接配布

App Store とは別に `.dmg` を配る場合だけ要る。

- 署名しないと、ダウンロードした側で「"LayerTalk" は壊れているため開けません」と出る（quarantine 属性が付くため）。
  配布物としては成立しないと考える
- Developer ID Application 証明書を取り、次の環境変数を入れて `npm run build:presenter` すると、Tauri が署名・公証・staple までやる
  ```bash
  export APPLE_SIGNING_IDENTITY="Developer ID Application: <名前> (<TEAMID>)"
  export APPLE_ID="<Apple ID>"
  export APPLE_PASSWORD="<App 用パスワード>"   # アカウントのパスワードではない
  export APPLE_TEAM_ID="<TEAMID>"
  ```
- 直接配布版の課金（Stripe）の本番前の確認は、`docs/monetization-setup.md` の「Release verification」
