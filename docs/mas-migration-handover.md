# 引き継ぎ — App Store 対応（4障害の実装完了）

最終更新: 2026-09-12

> **2026-09-12: この文書は経緯の記録。現状と残作業の正は `CLAUDE.md`・`docs/app-store-review-notes.md`・
> `docs/app-store-gates.html`。** 次の節は書かれた時点のまま古くなっている:
> - 「まだ満たせていない 1.2 の要件」— 2026-09-05 に解消（無料の NG ワード拒否とルーム単位のブロック。`CLAUDE.md` の「既知の制約」）
> - 「★ 次にやること — GUI 検証」「★★ スパイク」「A1 の残作業」「A2 / A3 / A4 の要点（未着手）」— いずれも実装済み
> - 「Phase 0（土台）」だけは今も未了（Apple Developer Program の証明書がまだ無い）

> 2026-09-05更新: 以下に記録されたA1〜A4の「未着手」「移行中」は解消済み。
> 残るのはApple Developer Program、App Store Connect、署名、実機Sandbox購入、
> TestFlight相当の外部テスト、審査提出という人手の作業。旧調査記録は判断根拠として残す。

このファイルは**別セッションが続きをやるための引き継ぎ**。プロダクトの仕様書ではないので、
作業が終わったら消してよい。設計上の決めごとで残すべきものは `CLAUDE.md` 側へ既に書いてある。

---

## ⚠️ 最初に読むこと — DB は git と独立に進んでいる

**マイグレーションは MCP で Supabase の本番へ直接適用済み。** `supabase/migrations/` の
ファイルはその**ミラー**であって、適用のトリガーではない（このリポジトリの元からの運用）。

つまり **git を巻き戻しても DB は戻らない。**
`git revert` / `git checkout .` / `git stash` でコードを捨てた場合、`content_reports` と
`moderation_actions` の FK 変更は**本番に残ったまま**になる。戻したいなら DB 側も手で戻すこと。

逆方向は心配ない。DB は共有の本番1つだけなので、どのブランチを checkout しても
「表が無くて落ちる」ことは起きない。

適用済みマイグレーション2本:

| version | 内容 |
|---|---|
| `20260904035052_allow_presenter_account_deletion` | `moderation_actions.actor_id` を `on delete restrict` → **`set null`** + nullable |
| `20260904035142_add_content_reports` | `content_reports` 表 + `report_content` RPC + RLS + Realtime publication 追加 |

**✅ 2026-09-12: 下の修正は本番へ適用済み**（SQL Editor で手動適用。`MCP の apply_migration` を通していないので
`list_migrations` には載らない）。関数定義で3点（`comment_authors` の記録・NG ワードの拒否・`is_permanent_user` のガード）を確認済み。
以下は経緯として残す。

~~⛔ 2026-09-11: 未適用の修正が1本ある。必ず当てること。~~
9/8 に当てた3本（`20260908051937` / `20260908055150` / `20260908055412`）は、9/5 の
`20260905033612_apple_review_safety_storekit` を含まない古いミラーをもとに書かれていて、
本番の `post_comment` と `create_room` を上書きしていた。**コメントからのブロックが全件落ちる。**
`20260911041638_restore_post_comment_authors_and_presenter_gate` で戻す（下の「2026-09-11 追記」）。

---

## この作業は何だったか

`/app-store-review` で監査した結果、MAS 提出を阻む障害が4つ見つかった。利用者の判断は
**「4つ全部やる」＋「StoreKit と Stripe を併存させる」**。

作業は2トラックに分かれている。

- **トラック1（完了）**: 配布方法に関係なく違反していた3件を実装・検証済み
- **トラック2（着手・Phase 1 の途中）**: MAS の4障害。詳細プランは
  `/Users/chaki-ry/.claude-personal/plans/twinkling-popping-seahorse.md`

---

## トラック1 — 完了ぶん（実装・検証済み）

### 1. アカウント削除（App Store 5.1.1(v)）

退会手段が皆無だった。その下に**非自明な地雷**が埋まっていた:

> `moderation_actions.actor_id` が `on delete restrict` だったので、**一度でも承認／非表示を
> 押した発表者は `auth.admin.deleteUser` が FK 違反で必ず失敗する**。詰まるのは
> 「モデレーションを使った人＝課金して使い込んだ人」だけなので、素で試すと気付けない。

本番 DB で `confdeltype = 'r'` を実測して確認 → `set null` へ変更 → 適用後 `'n'` + nullable を再確認済み。

- `supabase/migrations/20260904035052_*.sql`
- `apps/audience-web/src/app/api/account/delete/route.ts`（新規。既存の `requirePresenter` を再利用）
- `apps/presenter-app/src/lib/billing.ts` の `deleteAccount()`
- `apps/presenter-app/src/components/AccountFooter.tsx`（新規。確認入力つきダイアログ）

**Storage のファイルは `deleteUser` の前に消すこと。** cascade は行しか消さない。

### 2. プライバシー／規約／サポート導線（5.1.1(i)）

Event Pass の購入シートの中にしかリンクが無く、購入画面を開かない人には到達不能だった。
`AccountFooter` に常設した。

### 3. 観客からの通報（1.2）

存在しなかった。**`has_paid_room_features` の外**に置いてある（課金の内側に入れると
無料ルームが 1.2 の4要件を1つも満たさなくなる）。

- `packages/shared/src/api.ts` の `reportContent` / `fetchContentReports`
- `apps/audience-web/src/components/report-button.tsx`（新規。`ReportSheet` と `ReportButton`）
- コメントは行内ボタン、カスタムスタンプは**長押し**（44px の丸ボタンの列に1枚ずつ足すと列が2倍になる）
- `apps/presenter-app/src/components/ReportQueue.tsx`（新規。承認待ちキューの隣）

**本番 DB に対してロールバック付きトランザクションで検証済み**（既存データは無傷、0件を再確認）:
コメント・スタンプ両方の通報が書ける／重複は二重計上されない／ガード4つ
（未入室ルーム・他ルームの対象すり替え・対象なし・通報者による読み取り）がすべて拒否される。

### ~~まだ満たせていない 1.2 の要件~~ → 2026-09-05 に解消（以下は当時の記録）

- **フィルタは有料のまま**（利用者が判断を保留した「モデレーションの課金線」）
- **利用者のブロックは原理的に不可能**（匿名アプリなので identity をいくらでも作れる）。
  `CLAUDE.md` の「既知の制約」に記載済み

---

## トラック2 — MAS の4障害（Phase 1 の途中）

### 4つの障害と現状

| # | ガイドライン | 内容 | 状態 |
|---|---|---|---|
| A1 | 2.5.1 公開 API のみ | 透過 WKWebView が private API を要求 | **実装完了** — AppKit/Core Animationへ移植、private feature削除 |
| A2 | 2.4.5(i) サンドボックス | `.entitlements` が存在しない | **実装完了** — MAS用entitlements/config追加 |
| A3 | 2.4.5(vi) 独自コピー防止 | Ed25519 オフラインリース | **実装完了** — MASバンドルからコードごと分離 |
| A4 | 3.1.1 IAP 必須 | Stripe を外部ブラウザで開いている | **実装完了** — StoreKit 2消耗型IAP + サーバJWS検証 |

### 2026-09-05 実装結果

- macOSオーバーレイはコメント（横流し／フキダシ）、絵文字／画像スタンプ、参加QR、
  質問パネルをネイティブ描画する。Supabase購読はコントロールWebViewの1接続へ集約した。
- `macos-private-api`、透過WebView窓定義、MASで不要なウィンドウ権限を削除した。
- `Entitlements.mas.plist` と `tauri.mas.conf.json` を追加。MASは `npm run tauri:build:mas`
  で `.app` のみを生成する。
- MAS課金は自前のSwift StoreKit 2ブリッジを使う。JWSをサーバでApple Root証明書から検証し、
  `appAccountToken`（購入試行UUID）・所有者・ルーム・bundle/product/typeを照合してから
  冪等RPCで7日分を付与し、成功後だけtransactionをfinishする。
- ONE_TIME_CHARGE / REFUND / REFUND_REVERSED通知を処理する。CONSUMPTION_REQUESTは記録するが、
  利用者の明示同意UIが無いため消費情報はAppleへ送らない。
- ガイドライン1.2向けに、無料のNGワード拒否、コメント／スタンプからのルーム単位ブロック、
  ブロック解除、再入室拒否を追加した。
- 直接配布版はStripe + Ed25519リースを維持する。MAS版はVite aliasでStoreKit実装だけを入り口にし、
  `jose`、checkout API、公開鍵参照が生成物に無いことをスキャン済み。

### 2026-09-06 追記 — App Store 審査監査の是正ぶん

上の A1〜A4 とは別に、「実装はあるが審査員がそこへ到達できない」層を潰した。

- **サインイン**: 確認コードに加えて**パスワード**でも入れるようにした（`PresenterAuth`）。
  Supabase にメールのテスト OTP は**存在しない**（`auth.sms.test_otp` は SMS 専用・ローカル限定）
  ので、審査員に受信箱を渡さずに済ませる手段がこれしか無い。手順は
  `docs/app-store-review-notes.md`
- **アプリ内の外部リンク**: `tauri-plugin-opener` を**依存ごと外した**。あれは
  `/usr/bin/open` を spawn するので sandbox では黙って失敗し、プライバシーポリシー・
  規約・サポート・領収書・画面収録設定が全部無反応になる。`open_external_url`
  （`NSWorkspace`）へ置き換え済み。詳細は `CLAUDE.md` の罠 #18
- **法務ページ**: `?channel=app-store` で Stripe / App Store の販売条件を出し分けるようにした。
  プライバシーポリシーには App Store 決済とスライド画像の記述を足した
- **IAP タイプ**: Consumable → **Non-Renewing Subscription**。`Transaction.all` を見る
  「購入を復元」を追加した（`storeKitAll` → `restorePurchases`）
- **法務値の検査**: `verify-billing-publication.mjs` は `VERCEL_ENV=production` でも走る。
  以前は `BILLING_PUBLICATION_ENABLED=false` だと丸ごとスキップしていたが、
  あのフラグは Stripe の checkout ルートしか止めないので、
  「App Store では売っている・法務ページは下書きのまま」が成立していた
- **提出パッケージ**: `./scripts/build-mas.sh` が `.app` → プロファイル埋め込み →
  MAS Distribution 署名 → `productbuild` で `.pkg` までやる

### 2026-09-11 追記 — 並行作業の統合と、本番 DB の退行

別の作業ツリーで、同じ A1・A2・1.2 を**別の設計で**実装していた（オーバーレイ窓の webview を残して
Rust から起こす／発表者を匿名にする／ブロックは実装できない前提 など）。push の時点で食い違いに気付き、
**main はこのリモートの設計を正とした。** 向こうの作業は `archive/native-overlay-sandbox-2026-09-11`
ブランチに退避してあり、main へはまだ無かったものだけを移した。

#### 本番 DB の退行 — 修正マイグレーションを当てること

9/8 の3本は、9/5 の関数を知らないまま `post_comment` と `create_room` を丸ごと書き直していた。
本番の関数定義と件数で確認した事実（2026-09-11）:

| 外れていたもの | 影響 |
|---|---|
| `post_comment` が `private.comment_authors` に投稿者を記録しない | `ban_room_participant` が投稿者を引けず、**コメントからのブロックが `block target not found` で全件落ちる**。本番のコメント 34 件すべてで記録が 0 件。スタンプからのブロックは別の列を引くので動く |
| NG ワードに当たった投稿が「拒否」ではなく `pending`（保留） | 9/5 の「無料の NG ワード拒否」と違う挙動 |
| `create_room` から `is_permanent_user()` のガードが外れた | 匿名でもルームを作れる |

- 修正は `supabase/migrations/20260911041638_restore_post_comment_authors_and_presenter_gate.sql`。
  **戻すのは上の3つだけ。** 9/8 の「非表示・復帰を無料に」「新しいルームに既定 NG ワード」は 9/5 と矛盾しないので残す
- **記録が無いまま投稿された 34 件は、コメントからはブロックできない**（復元できない。非表示にはできる）
- 9/8 の3本は本番に反映済みだが**マイグレーション履歴（`list_migrations`）には載っていない**。
  ミラーを `supabase/migrations/` に足し、先頭に「単独で当て直さないこと」を書いた
- **既存の2ルームには既定 NG ワードが 0 語**（`create_room` の中で入るので新しいルームにしか入らない）。
  審査用のデモルームは作り直すこと
- **関数を書き換えるマイグレーションは、本番の定義を読んでから書くこと。** ミラーは本番より遅れていることがある
  （今回はそれで壊した）: `select pg_get_functiondef('public.post_comment(uuid,uuid,text,boolean)'::regprocedure);`

#### コントロール窓の凍結 — 発表中は Rust から起こす

この設計では、Supabase の購読・ネイティブ描画への送り出し・質問スライド撮影の起点がすべて
コントロール窓の webview にある。**閉じた窓の webview は約 6 秒でページごと凍る**ので、
発表中にコントロール窓を閉じると、その数秒後からスライドに何も出なくなる（CLAUDE.md の罠 #20）。

退避ブランチの実装で、コントロール窓そのものを測った結果（サンドボックス下の `.app`）:

| 見たもの | 結果 |
|---|---|
| 閉じると凍るか | **凍る。** 閉じてから 6 秒でタイマーが止まった |
| 60 秒後に出したとき | 起きた（`gap=54608ms`）。`visibilitychange=visible` も届いた |
| 凍っている間に外から投げた broadcast | **失われず、出した瞬間にまとめて届いた** |
| 他の窓の裏に回っただけのとき | 凍らず、タイマーが 2 秒間隔に間引かれるだけ |
| 閉じたまま発表を開始（keepalive あり、5.2 分） | **最後まで動いた**。往復の取りこぼし 0、外からの broadcast も即時に届いた |

**移植後のこの実装でも同じ条件で確かめた**（`LAYERTALK_DEBUG_OVERLAY=1 LAYERTALK_OVERLAY_SELFTEST=pump-control-live`、
`Entitlements.mas.plist` でアドホック署名したサンドボックス下、3.8 分）: 閉じてから最後までタイマーが止まらず
（115 回・最大間隔 2,031ms）、20 秒ごとの往復は取りこぼし 0（rtt 中央値 83ms）、
t=91s に外から投げた broadcast も送った次の秒に届いた。

#### 移したもの

- `presentation-keepalive`: `start_front_watchdog` → `ControlWindow` の `onPresentationKeepalive`
- `packages/shared` の `onPageVisible` と、`useComments` / `useRoomStamps` / `ReportQueue` の取り直し
- 計測用 `LAYERTALK_OVERLAY_SELFTEST=pump-control-live`（`lib/selftest-pump.ts`・`scripts/pump-poke-outside.mjs`）
- CLAUDE.md の罠 #19（cargo 単体ビルドは真っ白）と #20（閉じた窓の凍結）
- 9/8 のマイグレーションのミラーと、上の修正マイグレーション

#### 移していないが、退避ブランチに実測つきで残っているもの

- **縁取り文字が黒く潰れる疑い（この実装では未確認）**: `overlay_render.rs` の `outlined_string` は、
  負の `NSStrokeWidthAttributeName` を1枚の文字列に載せている。退避ブランチの実装で**同じ作りを
  全画面スクショの画素で測ったところ、30pt・3px では白い塗りが1画素も出ず、字面が `rgb(38,38,38)`
  （黒 85% を白背景に載せた値）になった**。AppKit の負値は「塗り → 縁」の順で描き、縁が輪郭の中心に
  引かれるので内側の半分が塗りを覆う（CSS の `paint-order: stroke fill` に当たる指定が無い）。
  退避ブランチでは縁（正値）と塗り（白）を2枚の `CATextLayer` に分けて直した
- アドホック署名でサンドボックスを効かせて実測する手順（`codesign --force --sign - --entitlements …`、
  効いている証拠は `~/Library/Containers/app.layertalk.presenter/` ができること）
- entitlements の plist に XML コメントを書くと、`plutil -lint` は通るのに `codesign` が
  **終了コード 0 のまま entitlement 抜きで署名する**件（この実装の `Entitlements.mas.plist` にコメントは無い）
- オーバーレイ描画のセルフテスト一式（`LAYERTALK_OVERLAY_SELFTEST=flow|bubble|stamp|qr|peek|panel`）

### 残作業の一覧

**`docs/app-store-gates.html`**（ブラウザで開く）に、登録前に片付くものと登録後にしか
できないものを段で分けて置いてある。チェックを付けて進捗を追える。設定する値
（`LEGAL_*` の7つと URL）の意味と例もそこにある。以下はその要約。

### 提出前に人が行う作業

1. App Store Connectでbundle ID `app.layertalk.presenter` と、**Non-Renewing Subscription**の
   IAPを作り、価格・審査スクリーンショットを登録する。**消耗型で作らないこと**（7日間の
   期間限定アクセスはPurchasability Typeで差し戻される）。作った商品IDを
   `APPLE_EVENT_PASS_PRODUCT_ID`（Vercel）と`VITE_APPLE_EVENT_PASS_PRODUCT_ID`（MASビルド）へ。
2. 数値のApple IDをWebの `APPLE_APP_ID` に設定し、Notifications V2 URLを
   `/api/billing/app-store/notifications` に設定する。
3. `./scripts/build-mas.sh` で署名と`.pkg`化を行い、Sandbox testerで購入・Ask to Buy・
   未完了transaction復旧・返金通知・**別Macでの「購入を復元」**を確認する。
4. Keynote/PowerPoint/ブラウザ全画面で、透過、Retina、クリック透過、ScreenCaptureKit、
   グローバルショートカットをsandbox実機確認する。
5. この変更のSupabase migrationを対象環境へ適用してからWeb/APIをデプロイする。

### A1 の正体（調べ済み。同じ調査を繰り返さないこと）

**private API は KVC キー2つだけ。**

- `WKWebViewConfiguration.setValue:forKey:@"drawsBackground"` … 透過の本体
  （`~/.cargo/registry/src/*/wry-0.55.1/src/wkwebview/mod.rs:367-384`）
- `WKPreferences` の `fullScreenEnabled` … **このアプリは使っていない**（同 `:386-388`）

`tauri` の `macos-private-api` feature = `wry/transparent` + `wry/fullscreen`。
それ以上のことはしていない（`tauri-runtime-wry-2.11.4/src/lib.rs:880-893` は
「feature が無ければ `transparent` を渡さない」というゲートなだけ）。

**macOS に公開 API の代替は無い。** WebKit bug 200528 と feedback-assistant#81 が 2019 年から
未解決で、iOS の `isOpaque = false` に相当するものが存在しない。
→ **透過が要る窓から webview を外す以外に手が無い。**

窓そのものは元から公開 API だけで作れている（`native_overlay` の `setOpaque(false)` +
`clearColor`）ので、変えるのは「窓の中身」だけ。

### 実装済み — `src-tauri/src/overlay_render.rs`（新規）

Core Animation + Core Text によるネイティブ描画。**横流しコメントのみ移植済み。**

- 縁取りは `NSStrokeWidthAttributeName` を**負値**にする（正値だと中抜きになって読めない）。
  `lt-overlay-text` の白塗り＋3px 黒縁85% と同じ
- レーン抽選・ジッター・`estimateTextWidth` は `FlowLayer.tsx` から**係数ごと**移植。
  単体テストで移植元との一致を固定してある
- 座標変換（Web の上原点 → AppKit の下原点）は `top_to_bottom_origin` 1箇所に閉じてある
- `contentsScale` を必ず設定すること（既定 1.0 のままだと Retina でぼやける）

**切り替え式。** `LAYERTALK_NATIVE_OVERLAY=1` のときだけネイティブ経路に入る。既定は従来どおりで、
既存の動作は変わらない。関連コマンド: `is_native_overlay` / `overlay_push_comment` / `overlay_clear`。

### ★ 次にやること — GUI 検証（これがブロッカー）

**まだ画面で一度も確認していない。** ビルドと単体テストは通っているが、実際に描けるかは未確認。

```bash
LAYERTALK_NATIVE_OVERLAY=1 LAYERTALK_DEBUG_OVERLAY=1 npm run dev:presenter
```

ルームを作る → 発表を開始 → コントロール窓のテストコメントを押す。見るのは3点:

1. 文字が**透過して**出るか（＝ private API 無しで透過できているか。A1 の可否そのもの）
2. Retina でぼやけていないか（`contentsScale` の確認）
3. 観客から実際に投稿して流れるか ← **下記のスパイクの合否**

### ★★ スパイクが前倒しで検証できる状態になっている

プランでは「隠れた WKWebView が Supabase の購読を保てるか」を Phase 1 最大の未知数として
別途スパイクする予定だった。**配線の結果、それが上の手順3でそのまま検証できる。**

理由: ネイティブ経路では `show()` が webview を載せ替えないので、オーバーレイの webview は
tao 窓（`visible: false` のまま一度も `show()` されない）に残って動き続ける。

- **流れる → スパイク合格。** 購読はコントロール窓へ寄せる方針のまま Phase 1 を続けられる
- **流れない → 購読を Rust 側へ移す必要がある。** Phase 1 の工数が倍増するので、
  ここで方針を見直すこと

この結合は `lib.rs` の該当分岐にコメントとして残してある。

### A1 の残作業

横流し以外はまだ webview 側にしかない。**ネイティブ経路では bubble モードで何も出ない**
（移行中の既知の穴。コードにも明記済み）。

| 残り | ネイティブでの実装方針 |
|---|---|
| `BubbleLayer.tsx` 白い不透明フキダシ | `CALayer`（`cornerRadius`）+ 折り返しテキスト。幅は `boundingRect` で実測 |
| `StampLayer.tsx` 絵文字・画像 | `CALayer.contents` に `CGImage`、`CAKeyframeAnimation` |
| `JoinQrCard.tsx` 参加 QR | **`CIQRCodeGenerator`（Core Image 内蔵）** — 依存追加なし |
| `QuestionWindow.tsx` 右端パネル | `NSView` + `NSButton`（操作を受けるのでレイヤだけでは足りない） |

全部移し終えてから `Cargo.toml` の `macos-private-api` と `tauri.conf.json` の
`macOSPrivateApi` を落とし、`overlay` / `questions` の窓定義と切り替えフラグごと消す。
**ネイティブ版は直接配布版でも使う**（描画系を2つ並行保守しない）。

### A2 / A3 / A4 の要点（未着手）

プラン本体に詳細があるが、調査で確定した事実だけ再掲:

- **⇧⌘L は sandbox で動く。** `global-hotkey-0.8.0` が `CGEventTap` を使うのは
  **メディアキー専用の経路だけ**（`platform_impl/macos/mod.rs:200-226`）。通常のキー組み合わせは
  `RegisterEventHotKey` で Accessibility 権限も不要
- **ScreenCaptureKit は sandbox で動く。** TCC で制御される。
  `com.apple.security.screen-capture` が要るかは実測で確定させる（資料が割れている）
- **`tauri-plugin-iap`**（`Choochmeque/tauri-plugin-iap`）が StoreKit 2 / macOS 13+ に対応。
  `minimumSystemVersion: 13.0` と一致するが **v0.10 / star 81 なので、着手前にスパイクすること**
- **Ed25519 リースは MAS 版のバイナリからコードごと消すこと。** 使っていなくても
  コンパイルされて入っていれば見られる。Rust は `#[cfg]`、JS は Vite の `define` + tree-shaking

### Phase 0（土台）— まだ誰もやっていない

**署名も公証もされていないので、いまアプリは誰の手元でも起動しない**（Gatekeeper）。
Apple Developer Program の登録が要る＝人間の作業。Phase 1 以降の実機確認にも要るので、
本来はこれが最初。**Phase 0 だけ済ませて中断しても、直接配布版は配れる状態になる。**

---

## 検証コマンドと、いまの結果

```bash
npm run typecheck && npm run lint && npx vitest run   # 71件通過
cd apps/presenter-app/src-tauri && cargo test --lib   # 9件通過（新規3件を含む）
cd apps/presenter-app/src-tauri && cargo build        # リンクまで通過
npm run build:web                                     # 通過
```

**`npm run smoke:realtime` は未実行。** Supabase の room ID / code / presenter access token を
環境変数に入れないと起動しない（元からの要件で、今回の変更による退行ではない）。

---

## 引っかかった点（次のセッションが同じ穴に落ちないように）

- **`Cargo.lock` は動く。** `objc2-quartz-core` の `CALayer` / `CAAnimation` feature を立てると
  `objc2-metal`・`block2`・`libc` が新たに入る（Core Animation が Metal 上に載っているため）。
  作業中に「lock は動かない」と誤って書いたので訂正済み
- **`setDuration` / `setFillMode` は `CAMediaTiming` プロトコルのメソッド。**
  トレイトを import しないと生えてこない
- **`NSAttributedString::size()` は `NSStringDrawing` feature が要る**（`objc2-app-kit`）
- **`fillMode` / タイミング関数は生文字列ではなく定数を使う**
  （`kCAFillModeForwards` / `kCAMediaTimingFunctionLinear`）
- **`contentView` は1枚しか持てない。** ネイティブホストを載せる経路と webview を
  載せ替える経路は排他にしてある。ここを崩すと片方が消える
- 既存の罠は `CLAUDE.md` の「踏んだ罠」を必ず読むこと。特に
  **罠 #3（SUBSCRIBED 直後は流れてこない）／#12（`ディスプレイ N` は ID であって文言ではない）／
  #13（dev と `.app` は localStorage も CORS の origin も別物）／#16（`.select()` の無い UPDATE は
  0行でも成功に見える）** は今回の作業でも踏みかけている
