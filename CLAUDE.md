# LayerTalk

発表中のスライド最前面に、観客からのリアルタイムコメント／スタンプを
「背景透過・クリックスルー」で重ねて表示する macOS アプリ ＋ 観客用 Web アプリ。

```
apps/audience-web/     観客用 Web    Next.js 16 / React 19 / Tailwind v4 / shadcn(radix-nova)
apps/presenter-app/    発表者用 macOS Tauri v2 + Vite + React
packages/shared/       型・Supabase クライアント・Realtime フック・デザイントークン
supabase/migrations/   MCP で適用済みスキーマのミラー
docs/design-system.md  デザインの唯一の正
assets/branding/       アプリアイコンの原本（`npx tauri icon` の入力。サイトのファビコンも同じ icon.ico）
scripts/realtime-smoke.mjs  Realtime 疎通テスト
```

- Supabase project: `layertalk` / ref `xnqduwlagmfaxzsaaicj`（ap-northeast-1、Pro $10/月）
- **発表者はメール認証、観客は匿名認証。** クライアントが持つのは anon(publishable) キー
  だけ（公開前提のキー）だが、**`auth.uid()` が無いと何もできない**。観客も
  `signInAnonymously` を通ってから `join_room` を呼ぶ。「認証なし」ではないので、
  RLS を読むときにここを取り違えないこと。発表者のサインインは**確認コードと
  パスワードの2通り**（`PresenterAuth`）。パスワードを残してあるのは、コードの受信箱を
  持てない相手（App Review）にアカウントを渡すため。`.env.local` は
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

**4. Tauri の `macOSPrivateApi` は cargo feature とセット**
`tauri.conf.json` だけだとビルドが「allowlist と一致しない」で落ちる。
`tauri = { features = ["macos-private-api", ...] }` が必要。Mac App Store 配布は不可になる。

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
- 切り分けの計測は `LAYERTALK_DEBUG_OVERLAY=1` で出る（`debug_log`）。出力先は
  `~/Library/Application Support/app.layertalk.presenter/overlay-debug.log`。
  **`/tmp` へは書かない** — sandbox では書けずに黙って失敗し、直接配布版では
  同じ Mac の全ユーザーから読めてしまうため

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
Event Pass が切れた瞬間から**全部この黙った 0 行更新**になる。
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

**18. App Sandbox では `/usr/bin/open` の子プロセスが通らない — `tauri-plugin-opener` ごと外した**
`tauri-plugin-opener` の `openUrl` は Rust 側で `/usr/bin/open` を spawn する
（`tauri-plugin-opener/src/open.rs` → `open` crate の `macos.rs`）。Mac App Store 版は
sandbox なので Launch Services を子プロセスから叩けず、**エラーも出ないまま何も開かない**。
これに乗っていたのは**プライバシーポリシー・利用規約・サポート・領収書・画面収録の設定**で、
App Store 5.1.1(i) が「アプリ内からポリシーへ辿れること」を要求している導線そのもの。
`lib.rs` の `open_external_url` が `NSWorkspace::sharedWorkspace().openURL()` を直接叩く。
プラグインは依存ごと外してある（残すと同じ穴に落ちる経路が残る）。
**`@tauri-apps/plugin-opener` を入れ直さないこと。** URL は `lib/tauri.ts` の
`openExternalUrl` を通す。`open_external_url` は http(s) しか受け取らない
（任意スキームを許すと webview の不具合が「勝手に別アプリが起動する」に化ける）。
`x-apple.systempreferences:` を開く `open_screen_capture_settings` だけは別入口にしてある。

**19. `cargo build --release` だけで作った実行ファイルは画面が真っ白になる**
`tauri-macros` の `context.rs:155` が `dev: cfg!(not(feature = "custom-protocol"))` と書いていて、
**この feature は tauri CLI が足している**。cargo から直接ビルドすると release でも
「dev」と判定され、埋め込んだ `dist` ではなく `devUrl`（`http://localhost:1420`）を見に行く。
dev サーバが居なければ**どの窓も真っ白のまま、エラーも出ない**。
`.app` の中の実行ファイルだけ差し替えるときは
`cargo build --release --features tauri/custom-protocol`（このリポジトリの `Cargo.toml` は
再輸出していないので **`tauri/` を付ける**）か、素直に `npm run build:presenter` を通すこと。
（`npm run build:presenter -- --bundles app` は **npm が `--bundles` を自分の設定として食う**ので
`tauri build` には `app` だけが渡り `unexpected argument` で落ちる。フラグを渡したいときは
`npx tauri build` を直接叩く。）
なお `codesign --force` は実行ファイルを書き換えるので**タイムスタンプが更新される**。
「新しいから作り直せている」の判断材料にはならない — 中身は `strings` で確かめる。

**20. 閉じた窓の webview は約6秒でページごと凍る — 発表中はコントロール窓を Rust から起こし続けている**
コントロール窓の webview は、Supabase の購読・ネイティブ描画への送り出し（`overlayPushComment` /
`overlayPushStamp`）・質問スライド撮影の起点をすべて持っている。ところが**閉じた（`hide()` した）窓の
webview は、macOS が約 6 秒でページごと凍らせる**。実測（サンドボックス下の `.app`、2026-09-11）:
- `setInterval` は**間延びではなく停止**する
- **ソケットは繋がったまま。** 凍っているあいだの受信は、窓を出し直した瞬間にまとめて届いた（約 1 分の凍結）。
  症状は「`SUBSCRIBED` は出ている・コントロール窓を閉じた数秒後からスライドに何も出ない・
  開いた瞬間に溜まった分が一気に流れる」になる。**購読の生死を `SUBSCRIBED` で判断しないこと**
- **外から届いたソケットのデータでは起きない**（コメントはまさにそれで届く）
- 起こせるのは **(a) 窓を表示する**か **(b) ネイティブ側から IPC を送る**かの二択
- **他の窓の裏に回っただけの窓は凍らない**（タイマーが 2 秒間隔に間引かれるだけ）。
  全画面スライドの別 Space にあるときは未計測。`visibilityState` は起きていても `hidden` と出るので指標にしない

対策として `start_front_watchdog` が**発表中だけ** 1 秒ごとに `presentation-keepalive` を `emit` し、
`ControlWindow` の `onPresentationKeepalive` が受けている。**Tauri は listener を登録した webview に
しか JS を評価しない**（`emit_js_filter`）ので、**listener の登録そのものが起こす条件**。
何もしていない listener に見えても消さないこと。撮影は**その瞬間の最新フレーム**を上書きせず保存するので、
凍って遅れて発火すると別のスライドが残る。
発表外で凍っていた分は `packages/shared` の `onPageVisible` で**窓が見えたら取り直す**
（`useComments` / `useRoomStamps` / `ReportQueue`）。
計測は `LAYERTALK_DEBUG_OVERLAY=1 LAYERTALK_OVERLAY_SELFTEST=pump-control-live` と
`scripts/pump-poke-outside.mjs`（ログは `pump/control-*` を grep）。

**21. `NSStrokeWidthAttributeName` を負にすると、縁が塗りを潰して文字が黒くなる**
負値は「塗りと縁を両方描く」指定だが、AppKit は塗りの**上に**、輪郭の中心で縁を引く。3px の黒縁（85%）を
載せると白い塗りがほとんど残らず、横流しのコメントが黒い字になった（アドホック署名版の実機で確認）。
CSS の `paint-order: stroke fill` に当たる指定は無いので、**縁（正値＝縁だけ）と塗り（白）を 2 枚の
`CATextLayer` に分け、縁を下に敷く**。→ `overlay_render.rs` の `push_flow_comment`

**22. `kCAFillModeForwards` で止めたレイヤは、外すまで最後の位置に残る**
`setRemovedOnCompletion(false)` + forwards は「終わった状態を保つ」指定なので、画面の中で止まるスタンプは
上部に残り続けた。しかも `sweep` を次の投稿のときにしか呼んでおらず、最後のスタンプがいつまでも消えなかった。
**画面の中で終わるアニメーションは opacity を 0 まで落とし（レイヤ自体の opacity も 0 にしておく）、
発表中はウォッチドッグから `overlay_render::sweep_expired` で外す**

**23. `CATextLayer` の枠をフォントサイズ四方にすると、絵文字の下が切れる**
絵文字の字面はフォントサイズより背が高く、`CATextLayer` は枠の外を描かない。スタンプの絵文字を
`size × size` の枠に入れていたため、下の数ピクセルが欠けた（アドホック署名版の実機で確認）。
**組んだ文字列の実寸（`NSAttributedString::size`）で枠を取る**。→ `overlay_render.rs` の `glyph_frame_size`

## 設計上の決めごと

- **コントロール窓の webview は、発表中だけ Rust が突いて起こし続ける**（罠 #20）。購読・ネイティブ描画への
  送り出し・質問スライド撮影の起点がすべてこの webview にあるので、突かないと発表中にコントロール窓を
  閉じた数秒後からスライドに何も出なくなる
- **コメント／スタンプの全面オーバーレイはクリックスルー常時 ON。** 切り替え UI も
  ショートカットも持たない。操作できるのは右端の質問窓の範囲だけで、そこで
  展開／折りたたみを操作できる（スライド全面の操作を塞がないため）
- **質問パネルの開閉はパネル自身のクリックで行う**（macOS）。この窓だけ `setIgnoresMouseEvents(false)` にし、
  `question_render.rs` の `QuestionPanelView` が `acceptsFirstMouse:` を true にしてクリックを受ける
  （nonactivating な NSPanel なので、スライドショーからフォーカスを奪わない）。展開中の窓はカードの分の
  高さしか取らず、折りたたみ中は右上の小さなタブだけにする — 画面の高さいっぱいに取ると、
  右端のスライドまで操作できなくなる
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
- **画面収録中は、コントロール窓とメニューバーに出す**（App Store 2.5.14）。正は Rust の
  `QuestionCaptureState::is_recording`（ストリームがあり、macOS に止められていない）。発表中だけ回る
  `start_front_watchdog` が変化したときだけ `question-capture-state` を送り、トレイのタイトルを `● REC` にする。
  コントロール窓は発表中に閉じられていることがあるので、**トレイ側の表示を消さないこと**
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
- **通報（`content_reports`）は無料ルームでも必ず動く。** NG ワードと承認制は Event Pass の
  機能だが、通報だけは `has_paid_room_features` を通さない。App Store 1.2 が UGC アプリに
  求める4点（フィルタ／報告手段／ブロック／連絡先）のうち、**報告手段と連絡先を課金の内側に
  入れると無料ルームが要件を1つも満たさなくなる**ため。書き込みは `report_content` RPC のみで、
  INSERT ポリシーは作らない（生 INSERT を開けると room_id を偽って他ルームの表を膨らませられる）。
  読めるのは `is_room_operator` だけ — 観客に自分の通報も見せない（誰が通報したかを
  推測させないため）。「通報済み」の表示は観客側の localStorage が持つ
- **通報を捌く操作と、通報を受け取ることを混ぜない。** 受信・表示（`ReportQueue`）は無料でも動くが、
  コメントの非表示は `moderate_comment` ＝ Event Pass の機能なので落ちる。落ちたときは黙らず
  理由を出すこと（罠 #16 の「画面は成功・DB は無反応」を作らない）。カスタムスタンプの削除は
  課金と無関係に通るので、無料ルームでも必ず消せる
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
- **法務ページは配布チャネルで出し分ける。** `/legal/terms`・`/legal/tokusho`・`/support` は
  `?channel=app-store` を受け取り、支払方法・返金の窓口・価格の書き方を切り替える
  （`content/legal/channel.ts`）。**MAS 版から Stripe 前提の販売条件を開かせないため** —
  App Store 決済のアプリ内から別の決済手段の条件へ誘導する形になり 3.1.1 の指摘対象になる。
  価格も Apple の価格表で決まるので「2,980円」固定はそもそも嘘になる。クエリは
  `apps/presenter-app/src/lib/legal-links.ts` の `legalPagePath` だけが組む（`channel` は `isMasBuild` のときだけ）。
  **プライバシーポリシーだけはチャネルで変えない** — App Store Connect に登録する URL は
  1 本で、クエリ違いで内容が変わるのは筋が悪い。両チャネルの記述を 1 枚に持たせてある
- **法務ページの英語版は `?lang=en`（プライバシーポリシーと利用規約だけ）。** 正は日本語版で、英語版には
  「相違があれば日本語版が優先」を出す。Accept-Language では決めない — 表示言語を決めるのは発表者で、
  App Store Connect の英語ローカライズにも固定の URL を登録するため。**節の id と並びは日英で揃える**
  （アンカーを共有している。`legal-content.test.ts` が固定）。日本語版を直したら英語版も直すこと
- **Event Pass は App Store では Non-Renewing Subscription。** 期間限定アクセスを
  Consumable で売ると Purchasability Type で差し戻される。この型は「同じ Apple ID の
  全デバイスへ届ける責任は開発者にある」ので、**`Transaction.all` を見る「購入を復元」が要る**
  （`storeKitAll` → `restorePurchases`）。`Transaction.unfinished` だけでは、
  1 台目で finish 済みの購入を 2 台目に戻せない。**サーバの `validateEventPassTransaction` も
  NRS だけを受理する** — 型を Consumable から変えたときここが取り残され、Apple が正しく署名した
  取引まで弾いて購入も復元も全件落ちていた（`app-store.test.ts` が型を固定している）
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

- **ブロックはルーム単位で実装済み**（`ban_room_participant` / `SafetyPanel`）。
  `private.comment_authors` が投稿者の `auth.uid()` を持っていて、`has_room_access` が
  ブロック済みの identity の再入室も拒否する。ただし**匿名アプリなので端末は新しい
  identity をいくらでも作れる**ので、ブロックは「その identity を締め出す」までしか効かない。
  App Store 1.2 の4点（フィルタ／通報／ブロック／連絡先）は**すべて無料ルームで動く**。
  ここを「実装できない」と書き戻さないこと — Review Notes をそこから書くと、
  満たしている要件を自分で未達と申告することになる
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
