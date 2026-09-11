# 引き継ぎ — App Store 対応（監査 → 4障害の解消）

最終更新: 2026-09-08（再監査） / ブランチ `main` / 直前のコミット `5ff19ee 引継ぎmd追加`

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

### ⛔ 未適用が2本ある（2026-09-08 時点）

`20260908051937_free_tier_moderation` は**適用済み**（実測で確認）。上の表へは未転記。

| version | 内容 | 状態 |
|---|---|---|
| `20260908055150_seed_default_moderation_terms` | 新規ルームに既定 NG ワードを入れる（1.2） | **未適用** |
| `20260908055412_allow_anonymous_room_creation` | `create_room` から `is_permanent_user()` を外す（5.1.1(v)） | **未適用** |

**2本は順番どおりに当てること**（後者が前者の `default_moderation_terms()` を呼ぶ）。

**アプリ側のコードは先に入っている。** `20260908055412` を当てるまで、匿名セッションで
起動した発表者は**ルーム作成が `presenter authentication required` で落ちる**。
**デプロイより前に必ず当てること。**

`20260908055412` には **Supabase ダッシュボード側の設定が対で要る**:
**Authentication > Providers で Manual linking を有効にする**（既定は無効・beta）。
入れ忘れると匿名ユーザーが本会員へ昇格できず、購入導線が詰まる。

適用後の確認:

```sql
-- 既定 NG ワードが入るか（新しいルームを1つ作ってから）
select count(*) from public.moderation_terms where room_id = '<新しい room id>';

-- 匿名でも作れるか
select pg_get_functiondef(p.oid) like '%is_permanent_user%' as still_gated
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname='public' and p.proname = 'create_room';   -- false になること
```

**ミラーが本番と食い違っていた箇所が1つ見つかっている。** `moderation_terms` の
RLS ポリシーは、ミラー（`20260815033436_monetization_event_pass.sql:615-617`）では
`has_paid_room_features` 付きだが、**本番は `is_room_operator` だけ**だった（実測）。
新しい migration が貼り直して畳んでいる。他にも同種のズレがある可能性を疑うこと。

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

### 1.2 の要件（2026-09-08 に再監査して更新）

- **フィルタと非表示は無料化した。** 上の「フィルタは有料のまま」は解消済み
  （`20260908051937_free_tier_moderation.sql`）。それまで `moderate_comment` が
  `has_paid_room_features` を要求していたので、実態は「フィルタが有料」より重く、
  **無料ルームでは通報されたコメントを非表示にすることすらできなかった**。
  審査員は無料ルームで試すので、そのまま指摘になる線だった。
  いま無料で動くのは NG ワード・承認/非表示/復帰・通報・カスタムスタンプ削除。
  課金線の現状は `CLAUDE.md` の「設計上の決めごと」が正
- **利用者のブロックは原理的に不可能**（匿名アプリなので identity をいくらでも作れる）。
  `CLAUDE.md` の「既知の制約」に記載済み。ここは変わっていない

---

## トラック2 — MAS の4障害（Phase 1 の途中）

### 4つの障害と現状

| # | ガイドライン | 内容 | 状態 |
|---|---|---|---|
| A1 | 2.5.1 公開 API のみ | 透過 WKWebView が private API を要求 | ✅ **完了**（2026-09-10。下記の実測あり） |
| A2 | 2.4.5(i) サンドボックス | `.entitlements` が存在しない | **実測で通過**（2026-09-10。提出には証明書が要る） |
| A3 | 2.4.5(vi) 独自コピー防止 | Ed25519 オフラインリース | 未着手（A4 に従属） |
| A4 | 3.1.1 IAP 必須 | Stripe を外部ブラウザで開いている | 未着手 |

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

**切り替えフラグはもう無い**（移植が終わったので `LAYERTALK_NATIVE_OVERLAY` ごと落とした）。
ネイティブが唯一の経路。関連コマンド: `overlay_push_comment` / `overlay_push_bubble` /
`overlay_burst_emoji` / `overlay_burst_image` / `overlay_set_join_qr` / `overlay_set_peek_card` /
`overlay_clear`。

### ✅ GUI 検証 — 済（2026-09-08 実測）。**A1 は成立する**

**透過は公開 API だけで作れる。** これが A1 の、ひいては MAS の道の可否そのものだった。
Chrome（明るい背景）と Cursor（暗い背景）の 2 つのアプリの上で確認し、
どちらも**文字の周囲に背後のアプリがそのまま見えた**。不透明な板は出ない。
デバッグログにも `native/overlay: ネイティブ描画のホストを載せました` /
`native/overlay/show: visible=true space:IN` が出ており、ネイティブ分岐を通っている。

| 見たもの | 結果 |
|---|---|
| **透過** | ✅ 合格。**A1 に解がある** |
| 文字が出るか | ✅ 6 本すべて描画・横流し |
| Retina | ✅ 原寸切り出しで輪郭が鮮明。`contentsScale` は効いている |
| 縁取り | ❌ → ✅ **落ちていた。同日修正済み**（下記） |

#### 見つけて直した不具合 — `paint-order` が移植から抜けていた

**症状**: 字面が白ではなく黒で描かれ、暗いスライドでは読めない状態だった。
全画面スクショの画素を数えると、字面が `rgb(38,38,38)` ちょうど
＝ 黒 85% を白背景に載せた値（255 × 0.15 = 38.25）で、**白い塗りが 1 画素も見えていなかった**。

**原因**: 見本の `.lt-overlay-text`（`theme.css:120-126`）には
**`paint-order: stroke fill`** が付いていて、CSS の既定（塗り → 縁）をわざわざ打ち消している
——「無いと縁取りが字面を侵食して細字が潰れる」と、そこのコメントが理由まで書いてある。
一方 AppKit の `NSStrokeWidthAttributeName` に負値を入れたときの順序はまさにその既定で、
`paint-order` に相当する属性が無い。縁は輪郭の**中心**に引かれるので、30pt に 3px だと
字面が黒で埋まりきる。**「負値にすれば CSS と同じ」は移植として不十分だった。**

**直し方**: `Stroke`（正値＝縁だけ）と `Fill`（白の塗りだけ）の 2 枚を
入れ物の `CALayer` に重ね、**アニメーションは入れ物にだけ**当てる
（2 枚を別々に動かすと、ずれた瞬間に縁と字面が分離して見える）。
`contentsScale` は**子の両方**に要る（入れ物に付けても降りてこない）。

**未移植の差分**: `text-shadow: 0 2px 8px rgb(0 0 0 / 0.6)`。白＋黒縁だけでも読めるので落としてある。

#### 再現手順（層を移植するたびに使う）

```bash
LAYERTALK_OVERLAY_SELFTEST=1 LAYERTALK_DEBUG_OVERLAY=1 npm run dev:presenter
```

`LAYERTALK_OVERLAY_SELFTEST=1` は `lib.rs` の `start_overlay_selftest` を起こし、
**サインインもルームも発表開始も無しで**オーバーレイを出してサンプル文を流す。
ネイティブ経路は tao 窓にも認証にも依存していない（`native_overlay::show` は
`tao_ns_window` に触れず、窓は `ensure` が自前で作る）ので、これで足りる。
あとは `screencapture -x` で撮って目視する。
`1` は横流し、ほかに `bubble` / `stamp` / `qr` / `peek` / `panel` / `pump` を取る。**フキダシ・スタンプ・QR・モニターカードを
移植するたびに同じ確認をすること。**

### ★★ 購読のスパイク — 済（2026-09-10 実測）。**隠れた webview は購読を保てない**

Phase 1 最大の未知数だった「一度も表示されない WKWebView が Supabase の購読を保てるか」を、
`LAYERTALK_OVERLAY_SELFTEST=pump` の合成プローブで計測した。プローブは隠れた webview の中で
(1) `setInterval(1000)` の実測間隔、(2) 公開 broadcast チャンネルを 20 秒ごとに自分宛へ往復、
(3) `visibilitychange` / `freeze` / `resume` を、`selftest_heartbeat` 経由で
`LAYERTALK_DEBUG_OVERLAY` のログへ落とす。サンドボックス（アドホック署名）下の
`.app` で実行。`pump` は**オーバーレイを出さない**ので、発表中よりも厳しい条件になる。

**答えは NO。** 隠れた webview のページは**起動から約 6 秒で凍る**。

| 計測 | 条件 | オーバーレイ窓（一度も表示されない） | 質問パネル窓 |
|---|---|---|---|
| A | 窓を一切出さない・15 分放置 | **6 ティックで停止**（t=6s）。復帰なし | 同じく 6 ティックで停止 |
| B | 発表中と同じ（オーバーレイ表示・ウォッチドッグ稼働・パネル表示） | **6 ティックで停止** | **15.8 分生存**。往復 46/46・取りこぼし 0・rtt 中央値 86ms |
| D | 60 秒隠したまま放置 → 窓を出す | 表示の瞬間に復帰（`gap=54924ms`）。**ソケットは切れていない**（rtt 83ms） | 復帰して 1 秒間隔に戻る |
| E | 停止後に**アプリの外から** broadcast を投げる | **起きない・届かない**（送信は `ok`） | 同じ |
| C / F | Rust から 2 秒ごとに IPC で突く | **生き続ける**。自分宛の往復も、**外から来た受信も届く** | 同じ |

分かったことは 3 つ:

- **凍るのは「窓が表示されていないページ」単位。** アプリに見えている窓があっても
  （B のオーバーレイ表示中でも）、webview を載せた tao 窓を出していなければ凍る。
  逆に、見えている窓に載った webview（質問パネル）は 15 分間まったく落ちない
- **タイマーは間延びではなく停止する。** 復帰時のティックは 1 回きりで `gap=54924ms`
  ＝ 55 秒ぶんが溜まって流れるのではなく、その間 1 度も走っていない
- **ソケットは生きたまま。** 凍っているあいだも接続は保たれ、復帰した瞬間に
  往復が通る。つまり症状は「接続は正常・コメントだけ 1 件も来ない」という形になる。
  **`SUBSCRIBED` を根拠に「動いている」と判断できない**

起こす手段は 2 つしかない: **窓を表示する**か、**ネイティブ側から IPC を送る**か。
**外から届いたソケットのデータでは起きない**（E）。コメントはまさにそれで届くので、
放っておくと「発表開始から数秒で、以後 1 件も流れない」になる。

#### 採った対策 — 発表中だけ webview を突く

`start_front_watchdog` が回している 1 秒ごとのループから、オーバーレイ窓へ
`overlay-keepalive` を `emit` する（`lib.rs`）。発表中だけ動き、終了すれば自然に止まる。
F の計測どおり、突いているあいだは**外から来た broadcast も届く**。
受け手は `OverlayWindow` の `onOverlayKeepalive`。**この 2 箇所を消すとコメントが
数秒で流れなくなる。**

**対策後の実測**（`pump-live` を 14.1 分、サンドボックス下の `.app`）:

| | オーバーレイ窓（隠れたまま） | 質問パネル窓 |
|---|---|---|
| ティック | 383 回・**2 秒間隔で最後まで継続**（対策前は 6 回で停止） | 464 回 |
| 20 秒ごとの往復 | 送信 37 / 受信 38・**取りこぼし 0**・rtt 中央値 90ms | 取りこぼし 2（下記の中断中） |
| 外から投げた broadcast | **t=112s で受信**（対策前は届かない） | 同時に受信 |

途中 1 回だけ 75 秒の中断があり、明けに `CHANNEL_ERROR: transport failure` →
自動再接続 → 往復再開、という経過をたどった。**これは webview の凍結ではない** —
同じ時刻に **Rust 側のウォッチドッグ（`std::thread::sleep` のループ）も止まっていた**ので、
プロセスごと（＝マシンのスリープ）で、計測環境の都合。ついでに分かったこととして、
**75 秒級の中断のあとは supabase-js が自力で張り直す**（ただし `SUBSCRIBED` を
挟むので `useComments` の取り直しも走る）。

`visibilityState` は対策後も `hidden` のまま動く。**生死の指標に使わないこと。**

**採らなかった案**: 購読を質問パネル窓（＝見えている webview）へ移す。B のとおり
そちらは無傷なので設計としては筋がよく、オーバーレイ窓の webview ごと落とせる。
ただし質問パネルは**いま「最初の質問が来るまで出さない」**ので、移すなら発表開始と同時に
出す必要があり、見た目の決めごとが変わる。突くだけで足りるうちは触らない。

**購読を Rust へ移す（Realtime の再実装）は不要。** 工数の跳ね上がりは回避できた。

#### 再現手順

```bash
# 隠れた webview を計る（15 分放置）
LAYERTALK_OVERLAY_SELFTEST=pump LAYERTALK_DEBUG_OVERLAY=1 \
  LayerTalk.app/Contents/MacOS/presenter-app
# 発表中と同じ条件（オーバーレイ＋パネル＋ウォッチドッグ）
LAYERTALK_OVERLAY_SELFTEST=pump-live …
# 60 秒隠してから出す／Rust から突く
LAYERTALK_OVERLAY_SELFTEST=pump-wake …   /   pump-poke …
# 止まった webview へ外から投げ込む
node scripts/pump-poke-outside.mjs 75
```

ログの解析は `pump/<窓>-<種別>` を grep するだけ。`gap=` が間延び、`rtt=` が往復。

#### 同じ理屈で気を付ける場所（この計測から派生する既知の穴）

- **質問パネル窓は「最初の質問が来るまで」凍っている。** 起こしているのは
  `sendQuestionToPanel` の Tauri イベントそのもの（IPC ＝ 起こす手段の (b)）なので、
  いまの動線は成立している。**質問の配送をイベント以外の経路に変えると、
  パネルが二度と出てこなくなる**（凍ったページは自分では起きられない）
- **コントロール窓も、隠れているあいだは凍る。** ⇧⌘L で呼び出すと窓の表示で起きるが、
  `useComments` の取り直しは `SUBSCRIBED` のときだけで、ソケットは切れていないので
  再購読が走らない。**凍っていたあいだに届いたコメントが一覧から抜ける**可能性がある
  （承認待ち・通報の一覧が実際より少なく見える）。直すなら「窓が見えたら取り直す」
  を足すことになるが、`useComments` に取り直しの口が無いので `packages/shared` 側の変更になる。
  **未対応**
- **`visibility=hidden` でも動いているときがある。** 対策後のオーバーレイ窓は
  `document.visibilityState` が `hidden` のまま 2 秒間隔で動く（突かれて起きている）。
  つまり `visibilityState` は生死の指標にならない

### A1 の残作業

横流し以外はまだ webview 側にしかない。**ネイティブ経路では bubble モードで何も出ない**
（移行中の既知の穴。コードにも明記済み）。

**Canva（Chrome のプレゼンテーションモード）でも問題ないことを利用者が確認済み**（2026-09-08）。
罠 #9（tao の窓が他アプリの全画面 Space に入れない）は、ネイティブ経路では構造的に消えている。

`BubbleLayer` は **2026-09-08 に移植完了**（実機で確認済み。下表から外した）。
`overlay_render.rs` の `push_bubble` / Tauri コマンド `overlay_push_bubble`。
確認は `LAYERTALK_OVERLAY_SELFTEST=bubble`。白い板・濃い文字・左下のしっぽ・
短文と長文の幅・レーンの重なりなしを、全画面スクショの画素で確かめてある
（板の内側が白 65% / 濃い文字 25%）。

`StampLayer` は **2026-09-09 に移植完了**（実機で確認済み。下表から外した）。
`overlay_render.rs` の `burst_emoji` / `burst_image` / `cache_stamp_image`、
Tauri コマンドは同名。確認は `LAYERTALK_OVERLAY_SELFTEST=stamp`。
絵文字と画像の両方が出て、**粒ごとに位置・大きさ・回転・遅延がばらけ**、
連続フレームの差分（約 120 万画素）とマゼンタ粒の重心 y（1911 → 1292 → 654）で
上昇していることまで実測してある。

**参加QR とモニター確認カード**は **2026-09-09 に移植完了**（実機で確認済み。下表から外した）。
`overlay_render.rs` の `set_join_qr` / `show_peek_card` / `hide_peek_card`。
確認は `LAYERTALK_OVERLAY_SELFTEST=qr` と `=peek`。**出るところと消えるところの両方**を撮ってある
（QR: 左下マゼンタ 1,356 → 0 / peek: ブランド枠 12,842 → 0）。

**参加QR のカードは JS が `<canvas>` に焼く**（`lib/join-qr-bitmap.ts`）。QR は1ピクセル狂うと
読み取れないので `qrcode.react` の出力をそのまま使い、Rust は `CALayer.contents` に載せるだけ。
**文言もキャンバスに焼かれるので、i18n のカタログは Rust へ渡らない。**
Rust へ渡る文言はモニターカードの2つ（`t.monitor.peek` と `monitorName`）だけ。

**カスタムスタンプの画像は JS が bytes を base64 で渡す。** Rust に HTTP クライアントは
足していない（署名 URL を取りに行かせると `reqwest` 一式と Supabase セッションが
Rust 側にも要る）。復号は `NSImage`、キャッシュは id をキーに `RenderState` が持つ。
**Broadcast に URL を載せない設計は変えていない。**

## ✅ A1 完了（2026-09-10）— private API はバイナリから消えた

`macOSPrivateApi` と cargo の `macos-private-api` を落とした。**実測での確認:**

```
strings LayerTalk.app/Contents/MacOS/presenter-app | grep -c drawsBackground   → 0
strings … | grep -c fullScreenEnabled                                          → 0
```

対照も取ってある —— 同じ `strings` が `native/overlay`(×5) / `layertalk-overlay.log` /
`setContentView` / `WKWebView`(×6) を拾えており、wry のソースには `drawsBackground` が8箇所ある。
**それでもリリースバイナリでは 0。**

やったこと:

1. **`questions` 窓を不透明にして中身に合わせた。** 透過が要らなくなるので `transparent` を外せた。
   窓＝見えているパネルそのもの（高さは `ResizeObserver` → `set_question_panel_size`）。
   角丸は webview のレイヤに `cornerRadius`（公開 API）
2. **ネイティブ描画を唯一の経路にした。** `LAYERTALK_NATIVE_OVERLAY` の分岐と
   `is_native_overlay` コマンドを削除
3. `transparent` / `macOSPrivateApi` / `macos-private-api` を削除
4. 死んだ描画層を削除（`FlowLayer` / `BubbleLayer` / `StampLayer` / `overlay-motion.ts` の計520行）。
   **`OverlayWindow.tsx` と `JoinQrCard.tsx` は残る**（前者は購読、後者はコントロール窓が使う）

### まだ見ていないこと

**質問パネルに実際の質問が入った状態は未確認。** `LAYERTALK_OVERLAY_SELFTEST=panel` で
窓の形（不透明・角丸・右端から12・周りが透過・消える）は確かめたが、
**`ResizeObserver` が中身の高さを測って追従するところ**は、発表中＋質問到着が要るので
実ルームでの確認が残っている。パネルは `is_live` ガードの内側にあるためセルフテストでは出せない。

**オーバーレイ窓の描画はこれで全部ネイティブになった。** 残るのは `questions` 窓だけ。

| 残り | ネイティブでの実装方針 |
|---|---|
| `StampLayer.tsx` 絵文字・画像 | `CALayer.contents` に `CGImage`、`CAKeyframeAnimation` |
| `JoinQrCard.tsx` 参加 QR | **`CIQRCodeGenerator`（Core Image 内蔵）** — 依存追加なし |
| `QuestionWindow.tsx` 右端パネル | `NSView` + `NSButton`（操作を受けるのでレイヤだけでは足りない） |

全部移し終えてから `Cargo.toml` の `macos-private-api` と `tauri.conf.json` の
`macOSPrivateApi` を落とし、`overlay` / `questions` の窓定義と切り替えフラグごと消す。
**ネイティブ版は直接配布版でも使う**（描画系を2つ並行保守しない）。

### ✅ A2 — サンドボックス下で動くことを実測（2026-09-10）

`src-tauri/Entitlements.plist`（3キーだけ）と `bundle.macOS.entitlements` を入れ、
**アドホック署名**（証明書不要）で実際にサンドボックスを効かせて計測した。
理由と手順は `src-tauri/Entitlements.README.md`。

| 見たもの | 結果 |
|---|---|
| sandbox が効いている | ✅ `~/Library/Containers/app.layertalk.presenter/` ができた |
| 通信（Supabase 匿名サインイン） | ✅ コントロール窓が通常の UI を出す（失敗時は自作のエラー画面が出るので区別できる） |
| ⇧⌘L の登録 | ✅ 失敗ログ無し。`RegisterEventHotKey` は sandbox で通る |
| オーバーレイのネイティブ描画 | ✅ セルフテストがそのまま動く（スタンプ32,652画素） |
| 書き込み先 | ✅ コンテナ配下へ移った（`Data/Library/Application Support/…`） |
| 窓レベル・Space 追従・トレイ | ✅ 起動して動く |
| **sandbox の拒否** | **`com.apple.Safari.SafeBrowsing.Service` の1種類のみ** |

その1件は WKWebView が Safari の SafeBrowsing を引きに行くだけのもので、
**塞がれても webview は正常に動く**（実測。上の全項目がこの拒否と同時に通っている）。
private なサービスなので entitlement で開ける対象でもない。**足さない。**

`com.apple.security.screen-capture` は**入れていない**。引き継ぎ資料が
「資料が割れている・実測で確定させる」と書いていた項目だが、
**今回の実行では画面収録に触っていないので、要否はまだ確定していない**（下記）。

#### まだ人の手が要るもの

- **画面収録の完走**: TCC の許可ダイアログを人が押す必要がある。しかも
  **アドホック署名はビルドごとに identity が変わる**ので、罠 #17b と同じく毎回聞かれる。
  `com.apple.security.screen-capture` の要否はここで確定する
- **レポート書き出し**: NSSavePanel の操作と、ルーム＋発表セッションが要る
- **質問パネルの高さ追従**: 発表中＋質問到着が要る（前回からの持ち越し）

### A3 / A4 の要点（未着手）

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
cd apps/presenter-app/src-tauri && cargo test --lib   # 15件通過
cd apps/presenter-app/src-tauri && cargo build        # リンクまで通過
npm run build:web                                     # 通過
npm run build:presenter                               # .app は出る。dmg 化で落ちるのは元から
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
