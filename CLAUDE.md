# LayerTalk

発表中のスライド最前面に、観客からのリアルタイムコメント／スタンプを
「背景透過・クリックスルー」で重ねて表示する macOS アプリ ＋ 観客用 Web アプリ。

```
apps/audience-web/     観客用 Web    Next.js 16 / React 19 / Tailwind v4 / shadcn(radix-nova)
apps/presenter-app/    発表者用 macOS Tauri v2 + Vite + React
packages/shared/       型・Supabase クライアント・Realtime フック・デザイントークン
supabase/migrations/   MCP で適用済みスキーマのミラー
docs/design-system.md  デザインの唯一の正
scripts/realtime-smoke.mjs  Realtime 疎通テスト
```

- Supabase project: `layertalk` / ref `xnqduwlagmfaxzsaaicj`（ap-northeast-1、Pro $10/月）
- 認証なし。anon(publishable) キーのみ（公開前提のキー）。`.env.local` は
  `*.local` で **gitignore されている**ので、キーを増やしたら `.env.example` の方も直す
- git リポジトリ。`origin` は `git@github.com:chaki8923/layertalk.git`、既定ブランチは `main`

## コマンド

```bash
npm run dev:web         # 観客用 → localhost:3000
npm run dev:presenter   # 発表者用（オーバーレイ窓 + コントロール窓）
npm run typecheck       # 両アプリ
npm run lint
npm run build:web
npm run build:presenter # .app を作る（release ビルド、数分かかる）
npm run smoke:realtime  # Realtime 3経路の疎通
```

Rust は rustup 導入済み。`~/.config/fish/conf.d/rustup.fish` で PATH を通してある。

## 踏んだ罠（同じ穴に落ちないこと）

**1. motion の `animate()` — プロパティ別オプションに `duration` を書き忘れると外側が捨てられる**
`getValueTransition` は `transition[key]` があればそれを**そのまま**使い、トップレベルをマージしない。
`{duration: 24, y: {ease: X}}` は y の実 duration が既定の **0.3 秒**になる。実測で確認済み。
検証は `animate(...)` の戻り値の `.duration` を読む。→ `StampLayer.tsx` の `RISE_EASE` 付近を参照。

**2. React の state 更新関数は同期実行されない**
```ts
let isNew = false;
setComments(prev => { isNew = true; ... });
if (isNew) callback();   // ← 常に false
```
これで `onInsert` が一度も呼ばれず「スタンプは流れるのにコメントだけ流れない」バグになった。
`useComments` は `seenIdsRef`（ref の Set）で判定している。ここを state に戻さないこと。

**2b. その `seenIdsRef` は await をまたいだ取り込みの根拠にはならない**
`seenIds` は同期的に立つので、「見た → 立てる → await → 入れる」と書くと、await のあいだに
`addLocal` や再取得が同じ行を入れていても素通りする。`useRoomStamps` の INSERT ハンドラが
署名 URL の取得を挟んでこれをやっていて、**自分で追加した直後だけ同じスタンプが2枚並んだ**
（リロードすると `hydrate` が Map で組み直すので1枚に戻る＝DB は1行）。
**await をまたぐ append は必ず更新関数の中で `prev` を見て弾く**こと（`appendUnlessPresent`）。
`useComments` が無事なのは INSERT ハンドラが最後まで同期だから。
ついでに、await が失敗する経路では `seenIds` から id を戻すこと。戻さないと
「取り込み済みだが一覧にいない」行ができて、二度と表示されない。

**3. Realtime の `SUBSCRIBED` は「まだ流れてこない」**
購読確立からレプリケーションのフィルタが効くまで 1〜2 秒のズレがある。
`useComments` は購読直後と 2.5 秒後の 2 回取得し直して回収している。`smoke:realtime` で再現可能。

**4. `macOSPrivateApi` は落とした。二度と戻さないこと**
かつては透過のために `tauri.conf.json` の `macOSPrivateApi` と cargo の
`macos-private-api` を対で立てていた（片方だけだとビルドが「allowlist と一致しない」で落ちる）。
**あの feature の正体は wry に `setValue:forKey:@"drawsBackground"` という private な
KVC キーを使わせること**で、App Store 2.5.1（公開 API のみ）に真正面から反する。
いまは透過が要る窓から webview を外し、Core Animation で直接描いている（`overlay_render.rs`）。
**`transparent: true` を窓に足すと feature ごと復活する**ので、窓を増やすときは気を付ける。
消えたことの確認は実行ファイルを直接見るのが早い:
`strings LayerTalk.app/Contents/MacOS/presenter-app | grep -c drawsBackground` が **0**。
（`strings` が効いていることの対照に `native/overlay` などを数えておくと確実）

**5. `alwaysOnTop` だけではスライドショーの前に出ない**
Keynote / PowerPoint のフルスクリーンは NSFloatingWindowLevel より上。
`lib.rs` で NSWindow を `kCGScreenSaverWindowLevel`(1000) に上げ、collectionBehavior に
`CanJoinAllSpaces | Stationary | IgnoresCycle | FullScreenAuxiliary` を立てている。

**6. shadcn/ui とトークン名が衝突する**
shadcn は `--accent`（ホバー背景の意味）と `--radius-sm|md|lg` を占有する。
ブランド色は `brand`、角丸は `chip / control / card / sheet` という名前にしてある。
shadcn 側の `--background` などは `globals.css` で `--lt-*` に接続済み。
**色や角丸を足すときは `docs/design-system.md` と `theme.css` にだけ書く。**

**7. Node 20 と supabase-js**
supabase-js は Node 22+ 推奨。ブラウザ実行には無関係だが、Node から使う場合は
WebSocket の注入が要る（`scripts/realtime-smoke.mjs` は `ws` を渡している）。

**8. Tauri の `set_focus()` は macOS では最前面化に使えない**
tao の実装は `makeKeyAndOrderFront` ＋ **非推奨の** `activateIgnoringOtherApps:` だけ。
この API は macOS 14 以降、Accessory ポリシー（＝バックグラウンド）のアプリからの要求を
却下することがあり、⇧⌘L が空振りしていた。さらに `isVisible()` が false だと**黙って何もしない**
ので `show()` を必ず先に呼ぶこと。`lib.rs` の `raise_control_window` で
`setCollectionBehavior`（Space を切り替えさせない）→ `setLevel(1000)` →
`orderFrontRegardless` → `NSApplication activate` を自前で叩いている。

**9. ブラウザの全画面プレゼン（Canva 等）に出すには、tao の窓を捨てるしかなかった — 解決済み**
Keynote / PowerPoint は**同じ Space** に高レベル窓を出すので罠 #5 で勝てるが、**Canva を Chrome の
プレゼンテーションモードにすると、tao が作った窓は何をしても入れなかった**。潰した候補:
- **レベルではない。** level 1000 / collectionBehavior 337 に揃えても入れない
- **順序でもない。** tao の `show()` は既に `makeKeyAndOrderFront`（`window.rs:668`）を
  呼んでいて、`orderFrontRegardless` を後から足しても症状は変わらなかった
- 計測すると `isOnActiveSpace` が false のまま（＝別 Space に置き去り。描画停止ではない）。
  一方で**同じプロセス内で作った素の NSWindow は、画面ぴったりのサイズでも入れる**

結論: **原因は tao の窓そのもの**。`lib.rs` の `native_overlay` で、wry が
`ns_window.setContentView(...)` で貼った WKWebView（`wry-0.55.1/src/wkwebview/mod.rs:685`）を
自前で作った NSWindow / NSPanel へ**丸ごと載せ替えている**。webview は生きたままなので IPC も描画も無傷。
tao の窓は表示しないまま残す。オーバーレイは素の `NSWindow`、右端の質問窓は
`NonactivatingPanel` ＋ `setBecomesKeyOnlyIfNeeded(true)`（触ってもスライドショーからフォーカスを奪わない）。
**LP がこの対応を前提に「PowerPoint / Keynote / Google スライド / Canva / Notion」をうたっている**
（`apps/audience-web/src/i18n/ja.ts` の `landing.worksWith`）ので、ここを壊すと表の約束が嘘になる。

同時に分かった、今も有効な制約:
- **`isVisible()` を前面化のガードに使うな。** macOS は別 Space の窓や隠れている窓を false と
  報告することがあり、「一度負けたら二度と復帰できない」状態を作る。判断は Rust 側の
  `live` / `panel_shown`（`SessionState`）に寄せてある
- **`setHidesOnDeactivate(false)` は NSPanel では必須。** NSWindow の既定は false だが
  **NSPanel の既定は true** で、立っているとアプリが非アクティブになった瞬間に消える
- **tao のサイズ・位置の setter は `*_async`。** 当てた直後に `frame` を読むと反映前の値が出る
- 発表**開始後**に全画面にされると新しい Space が後から生まれるので、発表中だけ 1 秒ごとに
  当て直すウォッチドッグ（`start_front_watchdog`）を回している。本筋は
  `NSWorkspace.activeSpaceDidChangeNotification` だが `block2` の依存追加が要るので採らなかった
- 切り分けの計測は残してある。`LAYERTALK_DEBUG_OVERLAY=1` で起動すると `log_window_state` が
  `isVisible` / `isOnActiveSpace` / `occlusionState` を 1 秒ごとに出す
  （`onActiveSpace=false` → Space、`occluded=true` → 描画停止）。
  **このフラグは長いあいだ「ドキュメントにだけ存在」していた**（コードは全ビルドで無条件に
  `/tmp/layertalk-overlay.log` へ追記していた）。いまは実装されていて、出力先は
  `app_data_dir()` 配下の `layertalk-overlay.log`、**起動ごとに作り直す**。
  stderr へは従来どおり常に出る。`/tmp` へ戻さないこと — sandbox で拒否されるうえ、
  ウォッチドッグが毎秒書くので放っておくと際限なく伸びる

**10. `postgres_changes` の DELETE は old に主キーしか載せない**
`replica identity full` にしても実測で `{"id": "…"}` だけだった（`comments` の UPDATE で
old が要るときとは事情が違う）。つまり **DELETE の購読に `room_id=eq.…` の filter を
付けると絶対に一致せず、イベントが一切届かない**。`useRoomStamps` は DELETE だけ
filter 無しで購読し、手元に無い id は受け取ってから捨てている。

**11. Storage の `remove()` は SELECT ポリシーが無いと黙って何もしない**
消す前に `storage.objects` を引くので、DELETE ポリシーだけ作っても
**エラーも返らないまま0件削除**になる（実測でファイルが残り続けた）。
public バケットは画像の取得だけならポリシー無しで通るので気付きにくい。
`room-stamps` には insert / delete に加えて **select** も開けてある。

**12. `ディスプレイ N` は文言ではなく ID — 絶対に翻訳しないこと**
`lib.rs` の `native_overlay::screen_name` と `monitor_label` が作る
`format!("ディスプレイ {}", index + 1)` は、`settings.monitorName` に**保存されて
文字列一致で照合される**（`lib.rs` の 3 箇所）。英語化のときにここを訳すと、
既存ユーザーの保存済みモニター選択が一致しなくなり、**黙って主ディスプレイに戻る**。
壇上で初めて気付く類の壊れ方なので、読める文字列だが不透明な ID として扱う。
コントロール窓の一覧も `monitor.name` を生のまま出している。訳すのは周りの
「主ディスプレイに追従」「・ 主ディスプレイ」など、**モニター未選択のときの表示名**だけ。

**13. dev ビルドと `.app` は localStorage も CORS の origin も別物**
`tauri.conf.json` の `devUrl` は `http://localhost:1420`、リリース版の origin は `tauri://localhost`。
WKWebView はオリジンごとに localStorage を分けるので、**両者はまったく別のルームを覚えている**。
「画面にはコード D9XY37 が出ているのに DB には X7AUJK しか無い」の正体はこれで、
どちらで再現したかを取り違えると原因の説明が最後まで付かない。
`cors.ts` の許可リストも同様で、**dev の origin は本番デプロイでは通らない**
（`NODE_ENV !== "production"` のときだけ足している）。dev ビルドから本番 API を叩くときは
Vercel の `ALLOWED_TAURI_ORIGINS` に `http://localhost:1420` を入れて再デプロイする
（env はビルド時注入なので設定だけでは効かない）。**用が済んだら消すこと。**
弾かれると `fetch` が `TypeError` で落ちるだけなので、画面には通信エラーとしか出ない。

**14. `loadSettings` が返すルームは DB にある保証が無い**
`settings.ts` は `roomId` / `roomCode` を localStorage からそのまま復元する。
`20260815033436_monetization_event_pass.sql` のようにマイグレーションで `rooms` を消すと、
**画面にはコードが残ったまま何も繋がらない幽霊状態**になり、Event Pass の購入も 404 で弾かれる。
`ControlWindow` はサインイン後に `resumeRoom` で 1 度だけ照合して、無ければ外している。
このとき **`room_not_found`（PostgREST の `P0001`）と通信失敗を必ず区別する** こと
— 一緒くたにすると、会場の Wi-Fi が切れているだけで有効なルームを捨ててしまう。

**15. Stripe はアカウント側の既定設定でコードを壊す**
`custom_text` は **Managed Payments**（Stripe が merchant of record になる仕組み。
**既定で有効なアカウントがある**）と併用できず、Checkout Session の作成が 400 で落ちる。
**公式の「非対応パラメーター」表に `custom_text` は載っていない** ので、表を見て安心しないこと。
`checkout/route.ts` は `managed_payments: { enabled: false }` を明示して切っている。
ダッシュボードのトグルで切らないのは、**あの設定を test / live で別々に持つ**ため
（test で切っても live が壊れたままになる）。
特商法表記・返金ポリシー・規約同意・領収書はすべて**発表者が販売者**である前提なので、
Managed Payments を有効にする話は、コードではなく法務ページを書き直す話になる。
なお `consent_collection: { terms_of_service: "required" }` は、ダッシュボードの
公開情報に利用規約 URL が登録されていないと使えない。これも同じく 500 にしか見えない。
**この種の失敗はどれも画面に「購入画面を準備できませんでした」としか出ない。**
原因は Vercel の Function ログの `[billing/checkout]` 行にしか無い。

**16. `.select()` を付けない UPDATE は、0 行でも成功に見える**
PostgREST は RLS で 1 行も一致しなくても **204 / `error: null`** を返す。
`room_branding` の「LayerTalk表記を隠す」がこれで、楽観更新だけが残り
**画面は ON・DB は false・スライドには LayerTalk が出たまま**になった
（実測: `PATCH /rest/v1/room_branding` 6 回すべて 204 なのに行は既定値のまま）。
`room_branding` / `moderation_rules` の UPDATE は `has_paid_room_features` を要求するので、
Event Pass が切れた瞬間から**全部この黙った 0 行更新**になる
（`moderation_terms` と `moderate_comment` は 1.2 のため課金判定の外に出したので、ここには入らない）。
権限付きの表を書くときは `.select().maybeSingle()` を付けて**返ってきた行を正とする**こと
（`lib/branding.ts` の `patchRoomBranding`）。行が無い＝弾かれた、で
`branding_rejected`（権限）と `branding_save_failed`（通信）を必ず分ける。

**16b. 窓をまたぐ状態を Realtime で運ばない**
オーバーレイ窓はブランド設定を `postgres_changes` で受けていたが、書き手はコントロール窓しか
居ないのに罠 #3（SUBSCRIBED 直後は流れてこない）を踏みに行くだけだった。本線は
**Tauri イベント**（`settings.ts:89-94` が書いているとおり、同一オリジンでも別 WKWebView なので
`storage` イベントは飛ばない）。加えて `hideLayerTalk` は **fail-open**（取得できなければ
LayerTalk を出す。無料版が表記を消せてはいけないので既定は変えない）なので、
取得失敗のたびに表記が戻らないよう `localStorage` に最後の値を残す。
**取得に失敗したときキャッシュを消さないこと** — 会場の Wi-Fi が切れただけで表記が戻る。

**17. ScreenCaptureKit は「動いているのに1枚も撮れない」状態を黙って続ける**
質問スライドの撮影が全滅していた件。**権限は通っていた**（`tccd` は Allowed）し、replayd も
`Health: … screenframeCount=10`（＝5秒あたり10枚＝設定どおりの 2 fps）を出し続けていたのに、
`~/Library/Application Support/app.layertalk.presenter/` はディレクトリごと存在しなかった。
重なっていた3つ:
- **`sample.frame_status()` は読めないと `None` を返す。** これが本命。
  `!= Some(SCFrameStatus::Complete)` で捨てていたので、**全フレームが無言で消えていた**。
  実測（macOS 26 / screencapturekit 8.0.1、`SCStreamFrameInfo` の attachment を読む実装）では
  **12枚中12枚が `None`**、それでも `image_buffer()` は全部中身を持っていた。
  **ステータスを「許可リスト」に使わないこと** — 読めないことを理由にフレームを捨てる形になる。
  `Blank` / `Suspended` / `Stopped`（macOS が塞いだ合図。取り込むと真っ黒が保存される）
  だけを弾く**拒否リスト**として書き、中身があるかは `image_buffer()` に判定させる。
  静止したスライドで延々来る `Idle` も、ここで一緒に救われる。
  → `question_capture.rs` の `usable_status`
- **デリゲートを付けていなかった。** `SCStream::new()` だと `did_stop_with_error` の行き先が無く、
  macOS にキャプチャを止められても「まだ準備中」と言い続ける。今回は
  `+[SCAlert …] user acknowledgement refused`（macOS の画面収録確認ダイアログが拒否された）
  が起点だった。**システム設定でオンにしても、このダイアログを断ると撮れない。**
  → `new_with_delegate` + `StreamCallbacks` で `CaptureHealth` に理由を残す
- **フォールバックが無かった。** ストリームが1枚も出さないとその発表は全滅。質問到着時に
  `SCScreenshotManager::capture_sample_buffer` で単発撮影へ落ちるようにした。これは
  **タイムアウトを持たない Condvar 待ち**なので必ず別スレッドへ投げて見切ること
  （`active` の `Mutex` を握ったまま呼ぶと `stop_presentation` まで巻き添えで固まる）。
  `screencapturekit` の `macos_14_0` feature が要る（デプロイメントターゲットは上がらない。
  Swift 側に `#available(macOS 14.0, *)` があるので macOS 13 では Err が返るだけ）
- ついでに `queue_depth` は Apple の文書上の下限が 3。2 にしていた

**保存先は sandbox の有無で変わる。**（罠 #13 / #17b と同じ「dev と .app は別物」の系列）
サンドボックス無し: `~/Library/Application Support/app.layertalk.presenter/`
サンドボックス有り: `~/Library/Containers/app.layertalk.presenter/Data/Library/Application Support/app.layertalk.presenter/`
`app_data_dir()` が返す先が丸ごと動くので、**無い方を見て「1枚も撮れていない」と誤診しないこと**。

切り分けはアプリのログではなく **OS 側**を見る:
`log show --last 10m --info --debug --predicate 'process == "replayd"'` の
`screenframeCount`（OS がフレームを作っているか）と `SCAlert` 行（塞がれていないか）で一発。
`Tauri の同期コマンドはメインスレッドで走る`ので、`capture_question_slide` は
`#[tauri::command(async)]` のまま置くこと。外すと単発撮影の待ちでオーバーレイごと固まる。

**17b. dev ビルドの画面収録の許可先は LayerTalk ではなく「起動元ターミナル」**
罠 #13（dev と `.app` は別物）の TCC 版。`npm run dev:presenter` が動かすのは
`target/debug/presenter-app` という**素のバイナリ**で、.app バンドルに入っていない。
TCC の責任プロセスは起動元（Terminal / iTerm / IDE）になるので、
**システム設定で LayerTalk をオンにしても dev では効かない**。実測ログでも
`Handling access request … from Sub:{com.apple.Terminal}` と出る。
`permission_target()` がこれを見て文言を出し分けている（`launchingApp`）。
署名が無いので `.app` 側も**リビルドで TCC の照合が外れる**ことがある。効かないときは
システム設定で LayerTalk を一度 `−` で外してから `+` で入れ直す。

**18. NG ワードの `contains` は普通の単語を巻き込む**
既定の NG ワードを入れるとき、`カス` が **`カスタムスタンプ`（このアプリの機能名）** に
当たることに気付いた。同種のものが山ほどある: `バカ`→バカンス、`ゴミ`→ゴミ箱、
`帰れ`→持ち帰れ、`ブス`→デブス、英語は `ass`→class/password（Scunthorpe problem）、
`dick`→Dickens、`hell`→shell/hello。
**短い語は入れない。** 誤検知は発表を壊すが、取りこぼしは発表者が自分で足せる — 非対称なので
迷ったら入れない側に倒す。`20260908055150_seed_default_moderation_terms.sql` に
良性コーパスとの照合クエリを置いてあるので、語を足したら必ず回すこと
（`private.default_moderation_terms()` を直接読むので一覧を二重管理しない）。

**19. `paint-order: stroke fill` は AppKit に無い。縁取りは2回描く**
`.lt-overlay-text`（`theme.css:120-126`）は `-webkit-text-stroke: 3px` に
**`paint-order: stroke fill`** を添えて、CSS の既定（塗り → 縁）を打ち消している。
縁は輪郭の**中心**に引かれるので、この指定が無いと幅の半分が字面を内側から食う。
AppKit の `NSStrokeWidthAttributeName` に負値を入れると「塗りと縁の両方」になるが、
その順序は**まさに CSS の既定のほう**で、`paint-order` に当たる属性が存在しない。
`overlay_render.rs` はこれを見落として1枚で描いていた。実測（全画面スクショの画素）で
字面が `rgb(38,38,38)` ＝ 黒85%を白背景に載せた値ちょうどになり、
**白い塗りが1画素も出ていなかった**（30pt に 3px の縁だと字面が埋まりきる）。
**縁（正値＝縁だけ）と塗り（白のみ）の2枚を入れ物の `CALayer` に重ねること。**
アニメーションは入れ物にだけ当てる（別々に動かすとずれた瞬間に縁と字面が分離する）。
`contentsScale` は**子の両方**に要る — 入れ物に付けても降りてこないので、付け忘れた側だけぼやける。
「負値にすれば CSS と同じ」で済ませないこと。

**20. オーバーレイの見た目は `LAYERTALK_OVERLAY_SELFTEST=1` で人手なしに出せる**
ネイティブ経路は **tao の窓にも認証にもルームにも依存していない**
（`native_overlay::show` は `use_native_overlay()` が真なら `tao_ns_window` に触れず早期 return し、
窓は `ensure` が自前で作る）。なので `lib.rs` の `start_overlay_selftest` が
起動直後に `show_overlay` を呼んでサンプル文を流す。
ルーム作成も発表開始もクリックも要らないので、`screencapture -x` と組み合わせれば
**描画の検証は機械的に回せる**。罠 #19 はこれで見つけた。
フキダシ・スタンプ・QR・モニターカードを移植するたびに使うこと。

**21. objc2 は非推奨 API も同じ名前で生やす**
`NSAttributedString` の文字寸法を測るとき、`boundingRectWithSize_options`（2引数）を掴むと
**deprecated カテゴリ**のほうを呼ぶことになる。objc2 は現行版
（`boundingRectWithSize_options_context`）と非推奨版の両方をトレイトとして生やしていて、
**名前が短いのは非推奨のほう**。App Store 2.5.1 は「非推奨の機能・フレームワークを段階的に外す」
ことも求めるので、objc2 で API を選ぶときは `..._context` のような**引数が多いほうを疑ってかかる**。
コンパイラは deprecated 警告を出さない（トレイト経由なので）。

**22. Core Animation の `transform.rotation` はラジアン。CSS の `rotate` は度**
`StampLayer.tsx` の `rotate: [0, random(-45, 45)]` をそのまま `transform.rotation` へ渡すと、
45 度のつもりが **45 ラジアン（≒7回転）** になる。粒が高速で回り続けるという形で出る。
移植のときは度→ラジアンの変換を必ず挟むこと（`overlay_render.rs` の `spin`、
`cargo test` の `spin_is_converted_from_degrees_to_radians` で固定してある）。
同様に **AppKit は上が正**なので、Web の `y: [0, -rise]`（下が正）とは符号も逆になる。

**23. 常設レイヤは「Rust が置く」と「JS が消す」が競合する**
参加QR とモニター確認カードは、粒やコメントと違って**寿命で消えない常設レイヤ**で、
出し入れを持っているのは `OverlayWindow` の effect。ところがセルフテスト
（`LAYERTALK_OVERLAY_SELFTEST`）はルームもサインインも無しで走るので、webview 側は
`showQr = false` と判断して **Rust が置いた直後に `overlaySetJoinQr(null)` を送って消す**。
ログには `qr: 置きました` → `qr: 消されました` が並ぶだけで、**レイヤは正しく作られている
のに画面に出ない**という、描画のバグにしか見えない症状になる。
`is_overlay_selftest()` を JS から見て、セルフテスト中は effect を早期 return させている。
**常設レイヤを足すときは「誰が消す権利を持つか」を先に決めること。**
（切り分けでは、素の色板を置いても出ないことを確かめて「contents の問題ではない」まで
絞り込んでから、`None` で呼ばれた側にログを足して初めて分かった。）

**24. 質問パネルは「窓＝見えているパネル」**
webview を透過できなくなったので（罠 #4）、**質問パネルの窓は中身とピッタリ同じ大きさ**にしてある。
中身より大きい窓を出すと、余白がそのまま不透明に塗られて**縦に伸びた黒帯**になる。
高さは `QuestionWindow` が `ResizeObserver` で測って `set_question_panel_size` で渡し、
Rust が窓の frame を組み直す（`native_overlay::show_panel`）。
角丸は **webview のレイヤに `cornerRadius` + `masksToBounds`**（公開 API）。
CSS 側にも角丸を付けないこと —— 二重に落ちて縁に線が出る。
面の色は `index.css` の `--lt-question-surface` にある。**`--lt-*` のトークンにしない**
（light モードで反転する。オーバーレイは常に暗い前提）。
`html, body, #root` は `background: transparent` なので、**質問窓だけは明示的に塗らないと
WKWebView の既定色（白）がそのまま板になる**。

**25. entitlements の plist に XML コメントを書くと署名できない**
`Entitlements.plist` にコメントを入れると `plutil -lint` は **OK を返すのに**、
`codesign --entitlements` に渡した瞬間
`Failed to parse entitlements: AMFIUnserializeXML: syntax error near line N` で落ちる。
AMFI のパーサがコメントを解釈できないため。**しかも `codesign` の終了コードは 0 のまま**
署名だけが entitlement 無しで完了するので、気付かずに「sandbox が効かない」と悩むことになる。
理由は `Entitlements.README.md` に書く。署名後は必ず
`codesign -d --entitlements - LayerTalk.app` で**乗ったことを確認する**。

**26. App Sandbox は証明書が無くても実測できる**
sandbox はコード署名に入った entitlement を見てカーネルが強制するので、Developer ID は要らない。
**アドホック署名（`codesign --force --sign - --entitlements …`）で本当に効く。**
provisioning profile が要るのは MAS 提出と、profile と突き合わせる種類の entitlement
（iCloud / App Groups / Push）だけ。
**効いていることの直接の証拠は `~/Library/Containers/app.layertalk.presenter/` ができること。**
拒否の観測は `log stream --predicate 'eventMessage CONTAINS "deny" AND eventMessage CONTAINS "presenter-app"'`。
なお `.app` の中の実行ファイルを直接起動しても署名は効いたままなので、
**環境変数を渡してセルフテストをサンドボックス下で回せる**。

**27. `cargo build --release` だけで作った実行ファイルは画面が真っ白になる**
`tauri-macros` の `context.rs:155` が `dev: cfg!(not(feature = "custom-protocol"))` と書いていて、
**この feature は tauri CLI が足している**。cargo から直接ビルドすると release でも
「dev」と判定され、埋め込んだ `dist` ではなく `devUrl`（`http://localhost:1420`）を見に行く。
dev サーバが居なければ**どの窓も真っ白のまま、エラーも出ない**。
症状は「JS が一度も走らない」＝ `command:` のログが1行も出ない、という形で出る。
`.app` の中の実行ファイルだけ差し替えるときは
`cargo build --release --features tauri/custom-protocol`（このリポジトリの `Cargo.toml` は
再輸出していないので **`tauri/` を付ける**）か、素直に `npm run build:presenter` を通すこと。
（`npm run build:presenter -- --bundles app` は **npm が `--bundles` を自分の設定として食う**ので
`tauri build` には `app` だけが渡り `unexpected argument` で落ちる。フラグを渡したいときは
`npx tauri build` を直接叩く。）
なお `codesign --force` は実行ファイルを書き換えるので**タイムスタンプが更新される**。
「新しいから作り直せている」の判断材料にはならない。

**28. 表示されない窓に載った webview は、約6秒でページごと凍る**
オーバーレイ窓の webview は一度も表示されない tao 窓に残っている（罠 #9 の載せ替えは
ネイティブ描画のホストであって webview ではない）。macOS はこのページを
**起動から約 6 秒で凍らせる**。実測（サンドボックス下の `.app`、15 分放置）:
- `setInterval(1000)` は**間延びではなく停止**する。復帰時のティックは 1 回きりで
  `gap=54924ms`（55 秒ぶんが溜まって流れるのではない）
- **ソケットは繋がったまま。** 凍っているあいだも接続は保たれ、復帰した瞬間に往復が通る。
  つまり症状は「`SUBSCRIBED` は出ている・コメントだけ 1 件も来ない」になる。
  **購読の生死を `SUBSCRIBED` で判断しないこと**
- **外から届いたソケットのデータでは起きない。** コメントはまさにそれで届くので、
  放っておくと「発表開始から数秒で、以後 1 件も流れない」
- 起こせるのは **(a) 窓を表示する**か **(b) ネイティブ側から IPC を送る**かの二択
- **凍るのは閉じた（表示していない）窓。** 他の窓の裏に回っただけの窓は凍らず、タイマーが
  2 秒間隔に間引かれるだけだった（コントロール窓で実測）。約 1 分の凍結では、そのあいだの
  受信は失われず、起きた瞬間にまとめて届いた
- **アプリに見えている窓があっても関係ない。** 凍るのはページ単位で、
  オーバーレイを出していても tao 窓を出していなければ凍る。逆に見えている窓に
  載った webview（質問パネル）は 15 分間 1 度も落ちなかった（往復 46/46）
対策として `start_front_watchdog` が**発表中だけ** 1 秒ごとに `presentation-keepalive` を
`emit` している。受け手は `OverlayWindow` と `ControlWindow` の `onPresentationKeepalive`。
**Tauri は listener を登録した webview にしか JS を評価しない**（`emit_js_filter`）ので、
**listener の登録そのものが起こす条件**。何もしていない listener に見えても消さないこと
（オーバーレイ窓で消すとコメントが数秒で止まる。コントロール窓で消すと質問スライド撮影の起点が止まり、
撮影は**その瞬間の最新フレーム**を上書きせず保存するので、遅れて発火すると別のスライドが残る）。
発表外で凍っていた分は `packages/shared` の `onPageVisible` で**窓が見えたら取り直す**
（`useComments` / `useRoomStamps` / `ReportQueue`）。
計測の道具は `LAYERTALK_OVERLAY_SELFTEST` の `pump` / `pump-live` / `pump-wake` /
`pump-poke` / `pump-control` / `pump-control-live` と `scripts/pump-poke-outside.mjs`。詳細は `docs/mas-migration-handover.md`。

## 設計上の決めごと

- **オーバーレイの描画はすべてネイティブ（Core Animation）。** 横流し・フキダシ・スタンプ・
  参加QR・モニター確認カードのどれも `overlay_render.rs` が描く。webview 側の描画層は
  2026-09-10 に削除した（`FlowLayer` / `BubbleLayer` / `StampLayer` / `overlay-motion.ts`）。
  `OverlayWindow.tsx` は**残っている** —— Supabase の購読を持つデータ供給係で、描画はしない。
  **切り替えフラグ（`LAYERTALK_NATIVE_OVERLAY`）はもう無い。** ネイティブが唯一の経路
- **見えている webview は質問パネルだけ。** ほかの窓（オーバーレイ）は
  tao の窓に置いたまま一度も表示しない。ここを増やすと罠 #4 の透過問題が戻る
- **オーバーレイ窓とコントロール窓の webview は、発表中だけ Rust が突いて起こし続ける**（罠 #28）。
  購読を持っているのが「一度も表示されない webview」で、質問スライド撮影の起点がコントロール窓に
  あるので、突かないと発表開始から数秒でコメントが届かなくなり、撮影も止まる。**購読を質問パネル窓へ移す案もある**
  （見えている webview なので凍らない）が、そうすると質問パネルを発表開始と同時に
  出すことになり「最初の質問が来るまで出さない」を変えることになるので採っていない
- **コメント／スタンプの全面オーバーレイはクリックスルー常時 ON。** 切り替え UI も
  ショートカットも持たない。操作できるのは右端の質問窓の範囲だけで、そこで
  展開／折りたたみを操作できる（スライド全面の操作を塞がないため）
- **発表者も匿名で始める。サインインを起動時の壁に戻さないこと**（App Store 5.1.1(v)）。
  かつては起動直後にメール6桁 OTP の全画面ゲートがあり、無料で試すだけの人にもメールを要求していた。
  いまは `ControlWindow` が `signInAnonymously()` でセッションを作り、ルーム作成・発表・
  コメント表示まで匿名で通る。**メールを聞くのは購入・発表レポート・退会のときだけ**
  （どれもサーバの `requirePresenter` が匿名を弾く操作）。入口は `SignInDialog` の2箇所だけ
- **匿名 → 本会員は `updateUser({ email })` で昇格させる。`signInWithOtp` を使わないこと。**
  後者は**別のユーザーになる**ので、匿名のうちに作ったルームが本人から見えなくなる。
  `updateUser` は identity linking なので user id が変わらず、ルームも購入履歴も残る。
  確認の `verifyOtp` は `type: "email_change"`（`"email"` だと必ず「コードが無効」になる）。
  **Supabase 側で Manual linking（Authentication > Providers、既定は無効・beta）を
  有効にしていないと昇格できない** — 切れていると「匿名のまま課金できない人」が生まれる
- **保持ジョブはルームを持つ匿名ユーザーを消さない**（`api/internal/retention/route.ts`）。
  観客の匿名ユーザーを30日で掃除する処理だが、発表者も匿名になったので、
  素通りさせると `rooms` が cascade で落ちて罠 #14 の「コードは残っているが DB に無い」状態になる。
  本人はサインインしていないので復旧手段が無い
- **新しいルームには既定の NG ワードが入る**（`private.default_moderation_terms()`）。
  1.2 の「フィルタする手段」を空のリストで出さないため。**発表者は1語ずつ消せること** —
  消せないと「発表者の意図しない検閲」になる。語を足すときは罠 #18 を読むこと
- **参加 QR は手動トグルだけ。** 自動表示はしない（スライドを勝手に隠さない）。
  URL は `VITE_AUDIENCE_BASE_URL`（未設定なら localhost）で、LAN IP の自動検出はしない
- **フキダシは白の不透明板。** 縁取り文字（`.lt-overlay-text`）とは併用しない（白板の上に
  白文字＋黒縁は読めない）。幅は文字量で伸縮し、上限＝レーン幅に達したら折り返して縦に伸びる。
  140文字でも省略しない（全文が読めることを優先）。不透明なので同じレーンの先行が抜けるまで
  発射を遅らせる — 重ねると後発が先発を完全に隠す
- **横流しの縦位置はランダム。** 空きレーンから抽選し（先頭詰めだと疎なとき全部が最上段に
  なる）、レーン内でさらに `LANE_GAP_PX / 2` まで揺らす。
  **揺れ幅をこれ以上広げると隣のレーンの文字と重なる**
- **押せる場所は `cursor: pointer`。** `<button>` はブラウザ既定でも Tailwind v4 でも
  矢印のままなので、`theme.css` の `@layer base` で両アプリまとめて指カーソルにしている
  （個々のコンポーネントに `cursor-pointer` を撒かない）
- **質問は「流す」と「右端に残す」の両方。** `is_question` でも演出は通常コメントと同じで、
  加えて右端パネルに最大5件を積む（`OverlayWindow` の `handleInsert`）。
  流れて消えたあとも質問だけは参照できるようにするため
- **「プレゼンを開始」を押すまでオーバーレイは `hide()`。** ライブ状態は Rust の `Mutex` が持ち、
  永続化しない（再起動したら必ず停止状態から始まる）
- **開始より前の投稿は流さない。** リハーサルや前の発表で画面が埋まらないようにするため
- **コントロール窓は「呼び出し中だけ」最前面。** ⇧⌘L / トレイで呼んだときだけレベルを
  1000 に上げてスライドショーの上へ出し、フォーカスを失う・閉じると通常レベルへ戻す
  （作業中ずっと他アプリの上に浮かせない）
- **終了してもルームは維持する。** 同じコードですぐ再開できる
- **ルームの切り替えはローカルの接続を外すだけ。** DB 側にルームを閉じる概念は作らない
  （`rooms` に `ended_at` を持たず、UPDATE / DELETE の RLS ポリシーも作らない）。
  切り替えると `roomId / roomCode / roomTitle` を null にして作成／参加カードに戻し、
  外したコードは `previousRoomCode` に残して1タップで戻れるようにする。
  **発表中は切り替えさせない**（コメントが流れなくなる事故を防ぐため）
- **1.2 に要る操作は全部無料。フィルタ・通報・非表示・連絡先を課金の内側へ戻さないこと。**
  App Store 1.2 は UGC アプリに4点（フィルタ／報告手段／ブロック／連絡先）を求める。
  以前は**通報と連絡先だけ無料**で、NG ワード（`moderation_terms`）と非表示（`moderate_comment`）が
  Event Pass の内側にあった。つまり**無料ルームは「通報は届くが誰も消せない」**状態で、
  審査員は無料ルームで試すのでそこが直接の指摘になる
  （`20260908051937_free_tier_moderation.sql` で外した）。いま無料で動くのは
  NG ワード・承認/非表示/復帰（`moderate_comment` の全アクション）・通報・カスタムスタンプ削除。
  有料に残るのは**「投稿を全件いったん保留する」承認制トグル・入室パスコード・表示遅延・
  質問のみ表示**（＝`moderation_rules` の UPDATE）と、ブランディング・レポート・質問スライド撮影。
  NG ワードで `pending` になった投稿を戻す道が要るので、`approve` も無料側に置いてある
  （hide だけ無料にすると誤検知した投稿を二度と出せなくなる）。
  UI は `ModerationPanel`（無料）と `EventPassPanel`（有料）に分かれている
- **通報（`content_reports`）は無料ルームでも必ず動く。** 書き込みは `report_content` RPC のみで、
  INSERT ポリシーは作らない（生 INSERT を開けると room_id を偽って他ルームの表を膨らませられる）。
  読めるのは `is_room_operator` だけ — 観客に自分の通報も見せない（誰が通報したかを
  推測させないため）。「通報済み」の表示は観客側の localStorage が持つ
- **通報の受信も、通報を捌く操作も、どちらも無料で通る。** `ReportQueue` の非表示ボタンに
  課金を疑わせる文言を戻さないこと — いまは落ちる理由が通信断か権限違いしか無いので、
  「Event Pass が要ります」と案内すると誤誘導になる。落ちたときに黙らないのは変わらず必要
  （罠 #16 の「画面は成功・DB は無反応」を作らない）
- **カスタムスタンプの通報は長押し。** バーは 44px の丸ボタンが並ぶ横スクロールで、1枚ごとに
  通報ボタンを足すと列が2倍になり押し間違いも増える。長押しが成立したら、指を離したときの
  click（＝スタンプ送信）を1回だけ捨てる
- **退会はアプリ内に必ず置く**（App Store 5.1.1(v)）。`AccountFooter` の削除ダイアログ →
  `/api/account/delete`。**`moderation_actions.actor_id` を `on delete restrict` に戻さないこと** —
  戻すと、一度でも承認／非表示を押した発表者だけが FK 違反で退会できなくなる
  （＝有料で使い込んだ人ほど詰まる。素で試すと気付けない）。Storage のファイルは
  `on delete cascade` では消えないので、`deleteUser` の**前に**消す
- **プライバシー・規約・サポートへの導線を購入シートの中だけに置かない**（App Store 5.1.1(i)）。
  購入画面を開かない利用者が方針にたどり着けなくなる。`AccountFooter` が常設の入口
- **いいねは `toggle_comment_like` RPC 経由のみ。** anon に `comments` の UPDATE を開けると
  `content` まで書き換えられる。`comment_likes` は RLS ポリシーを一切作らず完全に閉じている
- **スタンプは DB に保存しない。** Broadcast のみ。連打は 100ms 単位で集約してから送る
- **カスタムスタンプはルーム単位。** 観客が誰でも画像を上げられ、そのルームでだけ押せる
  （`room_stamps` + Storage の `room-stamps` バケット）。上限はルーム24枚／1端末5枚で、
  RLS ではなくトリガで守る（同じ表の副問い合わせを `with check` に書くと自分の
  SELECT ポリシーを再帰的に踏む）
- **Broadcast には画像 URL を載せない。** 飛ばすのは `custom:<room_stamps.id>` だけで、
  URL への解決は受信側が自分の持つ一覧で行う。URL を載せると、誰でも任意の画像を
  スライド最前面に描画させられる。知らない id（削除済み含む）は黙って捨てる
- **カスタムスタンプの非常ブレーキは発表者ローカルのトグル。** 認証がないので
  「この端末は発表者だ」を DB 側で証明できず、削除は誰でも呼べる。手元で描画しない
  `allowCustomStamps` なら DB に依存せず必ず効く
- **アップロードは静止画のみ。** ブラウザ側で 128px 四方の PNG に正規化してから上げる
  （会場の Wi-Fi に数MBを流させない。アニメーションGIFは対象外）
- **audience-web はダークファースト。** 観客は暗い会場でスマホを見る
- **日本語 Web フォントは読み込まない。** 数MBあり会場の Wi-Fi で初期表示が壊れる
- **表示言語を決めるのは発表者だけ。** コントロール窓のタイトルバーの JA/EN トグルが唯一の入口で、
  ショートカットもトレイからの切り替えも OS 言語の自動判定も持たない。選んだ値は
  `PresenterSettings.language`（localStorage）と `rooms.language` の両方に入り、
  観客用 Web は**ルームの値に従う**。観客側に切り替え UI は出さない
- **`rooms.language` は `set_room_language` RPC 経由でしか書けない。** `rooms` に UPDATE
  ポリシーを開けない方針（ルームを閉じる概念を作らない）を保ったまま 1 列だけ動かすため、
  `toggle_comment_like` と同じ security definer の関数を通す
- **観客への反映は入室時だけ。** 発表中にトグルを動かしても、既に開いているスマホは
  再読み込みするまで変わらない。`rooms` を Realtime のパブリケーションに足していない
- **文言カタログは各アプリが持つ**（`apps/*/src/i18n/`）。`ja.ts` が正で、`en.ts` は
  `Messages`（= `typeof ja`）で縛ってあるので訳し忘れも余分なキーも `npm run typecheck` で落ちる。
  値を埋める文は**関数**にする（`(n: number) => string`）— プレースホルダ方式だと引数の
  取り違えが実行時まで分からず、英語の複数形も書けない。i18n ライブラリは入れない
- **`packages/shared` が投げるエラーは文言ではなくコード**（`LayerTalkError`）。
  どちらの言語で見せるかは shared には分からないので、表示側が `resolveErrorMessage(err, locale)`
  に通す。Supabase の英語の原文は `detail` に載せるだけで画面には出さない
- **`@layertalk/shared` のバレルを server component から読まないこと。** バレルは
  `useComments` などの React フックを再輸出しているので Next のビルドが落ちる。
  ロケール関連の型と定数は `@layertalk/shared/i18n` から取る（`./motion` と同じ理由のサブパス）

## 既知の制約

- **「不適切な利用者をブロックする」は原理的に実装できない。** 匿名アプリなので端末は
  いくらでも新しい identity を作れる。App Store 1.2 の4点のうちこれだけは満たせず、
  通報 → 発表者が個別に消す、で代替している
- 匿名アプリなので**いいねの水増しは原理的に防げない**（`client_id` は端末が自由に作れる）
- 同じ理由で**カスタムスタンプの削除も誰でも呼べる**。`room_stamps` はこのプロジェクトで
  唯一 DELETE ポリシーを開けている表（不適切な画像を消す操作を詰まらせないため）
- **ルームを消してもカスタムスタンプの画像は Storage に残る。** `on delete cascade` は
  `room_stamps` の行にしか効かない。画像を消すのは `deleteRoomStamp` の経路だけ
- ルーム作成は anon に開いている
- 同じ理由で**ルームの表示言語も誰でも変えられる**（`set_room_language` は anon に開いている）。
  観客のスマホの文言が変わるだけで、発表者の手元は `PresenterSettings.language` が正なので影響しない
- Supabase advisor の指摘はいずれも上記の設計を選んだ結果で意図どおり
  （`set_room_language` や `report_content` が anon / authenticated から呼べるという
  `toggle_comment_like` と同じ種類の指摘と、匿名ユーザーに開いた RLS ポリシーの2種類しかない）
- 複数モニター同時表示（ミラー）は未対応。1台を選ぶ方式
- コード署名・公証なし
- **`.app` のバンドル説明（`tauri.conf.json` の `shortDescription` / `longDescription`）は
  ビルド時固定**なので日本語のまま。英語版を配るなら別のバンドル設定が要る
- audience-web の `/` と `/r/[code]` は `Accept-Language` を読むため**動的レンダリング**になった
  （ルームが分かる前の文言をどちらの言語で出すか決めるため）
