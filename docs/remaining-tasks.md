# 残りのやるべきこと（App Store 審査まで）

最終更新: 2026-09-21

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
  - Teams（審査用に渡す送信先）: 登録して「テスト送信」が届く。アプリを終了して開き直しても設定が残り、削除できる
- [ ] **スクリーンショットを撮る**
  6 枚（コメントが流れる画面 → 質問パネル → 参加 QR → コントロール窓 → 安全管理 → Event Pass）。
  下に敷くスライドは自作のものにする。撮ったら `./scripts/app-store-screenshot.sh <画像...>` で規定サイズにそろえる
  （この Mac の画面はどちらも 16:10 ではないので、撮ったままでは受け付けられない）。
  IAP 審査用の 1 枚は購入シートが要るので、登録後に撮る（2. の IAP と一緒に）。
- [ ] **ストアの文面を読んで確定させる** — `docs/app-store-listing.md` の日英
  事実との食い違いは 2026-09-13 に直した（ルームコードは英字も入るので「6桁 / 6-digit」を「6文字 / 6-character」に。
  LP も同じ修正）。あとは言い回しを自分の言葉にするだけ。
- [ ] **審査用の Teams 送信先を作る**（2026-09-18 に「Teams のものを用意する」と決めた）
  Teams のチャンネルで Workflows の「When a Teams webhook request is received」を作り、呼び出し元は Anyone にする
  （URL 自体が認証になる）。**URL を知っている人は誰でもそこへ投稿できる**ので、審査用の空のチャンネルにすること。
  旧 Office 365 コネクタの URL は使えない。ワークフローは所有者に紐づくので、必要なら共同所有者を付けておく。
  できた URL は提出時に ASC の Review Notes の `<REVIEW_TEAMS_WEBHOOK_URL>` へ貼る（リポジトリには書かない）。
  審査が通ったらワークフローを止める。手順は `docs/channel-notifications.md`。

## 1. Apple Developer Program に登録する — 済

- [x] **Individual で登録済み**（2026-09-20）。チーム ID `GU7UV62R2R`、販売者名は本名 `RYOU CHAKI`。
  **特商法ページの `LEGAL_SELLER_NAME` / `LEGAL_ADDRESS` をこれと揃えること。**
  DSA のトレーダー情報も同じ自宅住所で申告した（2026-09-21 に本人確認書類を提出、審査中）ので、
  `.env.example:103` が保留にしていた「自宅を公開するかバーチャルオフィスにするか」は**自宅で確定**。

## 2. Apple 側の設定（登録後）— ほぼ済（2026-09-21）

残っているのは **IAP の審査用スクリーンショット**（ビルドが要る）と **DSA の審査結果待ち**だけ。

- [x] **Paid Apps 契約・銀行口座・納税フォーム**（この項目は 9/13 版に無かった。**IAP を作るより先に要る**）
  2026-09-21 に「有料アプリ契約 有効」「銀行口座 有効」「W-8BEN と Certificate of Foreign Status 有効」を確認。
  W-8BEN は **Part II で日米租税条約 第12条第1項・0%** を申請してある（申請しないと 30% 源泉徴収される）。
  Foreign TIN はマイナンバー。
  *ロイヤルティ通貨が `USD` のまま。日本の JPY 口座なので JPY に変えられるか未確認（提出はこのままでも進む）。*
- [x] **証明書 2 枚と Mac App Store 用のプロビジョニングプロファイル**（2026-09-20）
  ```
  MAS_APP_IDENTITY       = 3rd Party Mac Developer Application: RYOU CHAKI (GU7UV62R2R)
  MAS_INSTALLER_IDENTITY = 3rd Party Mac Developer Installer: RYOU CHAKI (GU7UV62R2R)
  MAS_PROVISION_PROFILE  = ~/Downloads/LayerTalk_MAS_macOS.provisionprofile
  ```
  `security find-identity -v` で 3 枚とも valid を確認（`Apple Distribution` も作ったが未使用）。
  プロファイルは `security cms -D` で `Platform = OSX` と `com.apple.application-identifier` を確認済み。
- [x] **App Store Connect にアプリを作った**（2026-09-21）— Apple ID `6814319511`、SKU `layertalk-presenter`、
  名前 `LayerTalk`（取られていなかった）、サブタイトル・カテゴリ済み。**説明文・キーワード・スクリーンショットは未入力。**
- [x] **IAP を Non-Renewing Subscription で作った**（2026-09-21）— 値は `docs/app-store-listing.md` の 6.
  審査用スクリーンショットだけ残り（下の 3. で撮る）。
- [x] **Vercel の `APPLE_APP_ID`（`6814319511`）投入・再デプロイと、通知 URL の登録**（2026-09-21）
  本番・Sandbox の両方に `https://www.layer-talk.com/api/billing/app-store/notifications`。
  **バージョンの選択欄は無い**（新規アプリは V2 固定）。
- [x] **Sandbox tester を作った**（2026-09-21）。地域は日本。
  **メールアドレスは「受信できる本物」でなければならない。** 作成自体は通るが、
  サインインのときに **2ファクタ認証の確認コードがそのアドレスに送られる**ので、読めないと詰む。
  `@example.com` は作成の時点で弾かれ、**App Store Connect は `+` を含むアドレスも受け付けない**。
  **Gmail のドット無視**（`name@gmail.com` → `na.me@gmail.com`。文字列は別物だが同じ受信箱に届く）が使える。
- [x] **App Privacy と年齢レーティング**（2026-09-21）
  プライバシーは5種別すべて「Appの機能」「ユーザの個人情報に関連付けられる」「トラッキングなし」で公開済み。
  年齢制限指定は **13+**（上書きなし）。
- [ ] **DSA トレーダー情報の審査結果**（2026-09-21 提出、EU 27 か国、ステータス「審査中」）
  結果待ちなだけで、**アプリの提出は止めない**。通らないと EU ストアから外れる。

### ここで踏んだ、次に必ず忘れるもの

- **非更新サブスクリプションは「アプリ内購入」ページに無い。** サイドバーの
  **「サブスクリプション」ページの下部**の専用セクションから作る。「アプリ内購入」の＋を押すと
  種類は**消耗型と非消耗型しか出ない**ので、「Apple が NRS を廃止した」と読み違える。
- **プロファイルは「Mac App Store Connect」を選ぶ。** 「App Store Connect」は iOS 用で、
  できあがるのは `Platform = iOS` かつ `application-identifier`（`com.apple.` が付かない）のプロファイル。
  `build-mas.sh` が `com.apple.application-identifier` を要求するのでそこで落ちる。
  見分けは Generate 直前の **Type が `Mac App Store` か `App Store` か**。
- **証明書を作った直後は、プロファイル作成画面の候補に出ないことがある**
  （`No Certificates are available` と出た。別の証明書を作って戻ったら、先に作った分も含めて両方出た）。
  慌てて証明書を作り直す前に、時間をおいて開き直すこと。
- **Apple Developer のサイトはブラウザの自動翻訳で壊れる。** 証明書のダウンロードが
  `ID が「undefined」の「certificates」タイプのリソースは存在しません` になり、ファイルも落ちてこなかった。
  翻訳を切り、一覧ページの URL を直接開いて取り直す。

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
- [ ] **StoreKit を一通り通す**（3.1.1）— 下の「開発署名でローカル起動する」の `.app` で行う
  - [x] **通常購入**（2026-09-21）。Sandbox で完走し、**サーバ側の行まで確認済み**:
    `app_store_transactions.transaction_id = 2000001239356406` / `product_id = app.layertalk.presenter.event_pass` /
    `environment = Sandbox` / `status = purchased`、紐づく `entitlements` が `status = active` /
    `source = app_store` / `kind = event_pass` / `expires_at` が購入の7日後 / `history_expires_at` が30日後。
    `attempt` → StoreKit → `fulfill` → 権利付与が全部通った（行が作られている＝
    `validateEventPassTransaction` の NRS 判定も通っている）
  - [ ] 購入直後に通信を切って再起動しての回収（`billing.mas.ts` の `initializeBillingRecovery`）
  - [ ] 同一 Mac で「購入を復元」— finish 済みでも `Transaction.all` が返すこと
  - [ ] Ask to Buy の承認待ち→承認（Sandbox のファミリー共有が要る。best-effort）
  - [ ] 返金通知で権利が revoked になる（Sandbox で返金を起こせたら。best-effort）
  - [ ] ~~**別の Mac で「購入を復元」**~~ — **2 台目の Mac が無いので検証できない**（2026-09-21 時点）。
    Non-Renewing Subscription は「同じ Apple ID の全デバイスへ届ける責任は開発者にある」型なので、
    本来はここが必須。同一 Mac で `storeKitAll`（`StoreKitBridge.swift` の `allTransactions`）が
    **finish 済みの取引を返すこと**までは確かめ、クロスデバイスは未検証として出す。
    **確かめられなかった経路を黙って `[x]` にしないこと。**

### 開発署名でローカル起動する（StoreKit を通す唯一の手段）

> **macOS 26 に「システム設定 → デベロッパ → Sandbox Apple Account」は無い。** 一度サインインした
> Sandbox アカウントを切り替える UI が見つからず、ここで半日溶かした。Xcode を入れても
> `DevToolsSecurity -enable` をしても、そのペインは現れない。**Xcode は不要**（`build.rs` が使うのは
> Command Line Tools の `xcrun swiftc` だけ）。しかも Xcode を入れると `xcode-select` が
> そちらを向き、**ライセンス未同意で `xcrun swiftc` が落ちてビルドが壊れる**
> （`sudo xcodebuild -license accept` で復旧）。
> Sandbox アカウントを確実に切り替えたいなら **macOS のユーザを新しく作る**（アカウントはユーザ単位）。


**アドホック署名版では StoreKit が動かない。** `embedded.provisionprofile` も
`com.apple.application-identifier` も無いので `Product.products(for:)` が空を返し、
`EventPassPanel.tsx` の `listPrice` が `null` のままになる（価格が **「—」** と表示される）。
Event Pass のスクリーンショットと IAP 審査用のスクリーンショットも、これでは撮れない。

Apple Developer ポータルで 3 つ（証明書とプロファイルは提出用とは**別物**）:

1. **この Mac をデバイス登録** — Devices → ＋ → macOS。Device ID は
   `system_profiler SPHardwareDataType | grep 'Provisioning UDID'` で出る
2. **`Apple Development` 証明書**（CSR は提出用と同じものを使い回せる）
3. **`macOS App Development` プロビジョニングプロファイル** — App ID `app.layertalk.presenter`、
   上の証明書、登録した Mac。**生成前の確認画面で Type が `Mac Development` であること**

```bash
DEV_APP_IDENTITY="Apple Development: RYOU CHAKI (GU7UV62R2R)" \
DEV_PROVISION_PROFILE=~/Downloads/LayerTalk_Dev_macOS.provisionprofile \
./scripts/build-dev.sh
open apps/presenter-app/src-tauri/target/dev-signed/LayerTalk.app
```

- Sandbox のサインインは **システム設定 → デベロッパ → Sandbox Apple Account**（App Store アプリではない）。
  コード側に環境の分岐は無く、OS が決める
- **発表者としてサインインしてから**でないと購入に入れない（`billing-http.ts` が Supabase の
  `access_token` を Bearer に載せる。無いと `Presenter authentication required`）
- サーバ側の設定は要らない。`app-store.ts` の `verifiers()` が**常に SANDBOX verifier を積む**ので、
  Sandbox の取引は本番 Vercel でそのまま検証される
- 署名し直すと画面収録の TCC 許可が外れることがある（下の注記と同じ）
- [ ] **審査用アカウントでサインインし、ルーム作成 → 発表開始まで通る**

## 4. 提出

- [ ] **Review Notes を貼る** — 本文は `docs/app-store-review-notes.md`
  **メモ欄は 4,000 字が上限。ドキュメントの本文はそのままでは入らない**（本文だけで 4,884 字、
  Slack / Teams の節を足すと 5,900 字）。2026-09-22 の提出では、言い回しを詰めて 3,994 字にし、
  **Slack / Teams の節は PDF にして「添付ファイル」欄へ回した**。
  審査用の Teams Webhook URL は添付ファイルの中だけに置く（リポジトリには書かない）。
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
- **ブラウザで落としたプロファイルの拡張属性が、アップロード後まで表に出ない。**
  `com.apple.quarantine` と `kMDItemWhereFroms` が付いたまま `cp` で `.app` に入り、
  **Transporter のアップロードは成功したのに処理で弾かれた**
  （`ITMS-91109: Invalid package contents`、2026-09-22）。
  **`codesign --verify` も `verify:mas-bundle` も全部緑のまま通る**ので、ローカルでは気付けない。
  `build-mas.sh` / `build-dev.sh` が**署名の前に** `xattr -cr` で全部落とすようにしてある。
  署名の**後**に消すと codesign が付けた `com.apple.cs.*` まで飛ぶので、順序を入れ替えないこと。
  確認: `find <app> -exec xattr {} \; | sort | uniq -c` が空であること
- **プロビジョニングプロファイルは種類を取り違えても最後まで気付けない。** ポータルで
  「Mac App Store Connect」ではなく「App Store Connect」を選ぶと iOS 用ができ、entitlements のキーが
  `com.apple.application-identifier` ではなく `application-identifier` になる。
  `build-mas.sh` / `build-dev.sh` が `Platform` に `OSX` が無ければビルド前に落とすようにしてある。
  手で確かめるなら `security cms -D -i <profile> | plutil -p - | grep -A3 Platform`
- **署名 identity の名前は発行時期で変わる。** `security find-identity -v -p codesigning` で実物を確認する
  （**インストーラ証明書は `-p codesigning` では出ない**。`security find-identity -v` で見ること）
- **IAP の説明は 45 文字・表示名は 30 文字。** 下書きの説明文はどちらの言語も上限を超えていた。
  縮めるときも**表示名の「1ルーム」は落とさない**（Event Pass は購入した1ルームでしか使えない）
- **DSA のトレーダー情報は、氏名と住所それぞれに確認書類の提出が要る。** どちらも PDF/JPEG/PNG で 10MB まで。
  iPhone で撮った書類を「ファイルに保存」した PDF は**画像が無圧縮で埋め込まれる**ことがあり、
  1 枚で 37MB になった（JPEG に再エンコードして 1.9MB。`sips` で足りる）

## もう済んでいること（再確認は不要）

- Apple Developer Program の登録、証明書・プロファイル、App Store Connect のアプリと IAP、
  Paid Apps 契約・銀行・納税、Server Notifications、Sandbox tester、App Privacy、年齢レーティング 13+
  — いずれも 2026-09-20〜21。詳細は上の 1. と 2.

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

- **この `.app` では StoreKit が動かない。** 課金まわり（Event Pass の価格表示・購入シート・購入を復元）を
  触るなら `scripts/build-dev.sh` の開発署名版を使う。アドホックには `embedded.provisionprofile` も
  `com.apple.application-identifier` も無いので、商品の取得が空で返り、価格が「—」のままになる
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
