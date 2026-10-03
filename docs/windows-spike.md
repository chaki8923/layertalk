# Windows スパイク: 透過オーバーレイ + 最前面 + クリックスルー

最終更新: 2026-09-26 / ブランチ `feature/windows-spike`

**このスパイクが答える問いは1つだけ**:
WebView2 の透過ウィンドウが、PowerPoint のスライドショー全画面の上に、
クリックスルーのまま、ちらつかずに出るか。

- **Yes** → 既存の `cfg(not(target_os = "macos"))` 経路を育てるだけで Windows 版になる。
  `overlay_render.rs` + `question_render.rs` の 1,370 行（AppKit / Core Animation 直描き）は
  **Windows では書かなくてよい**
- **No** → Direct2D / DirectComposition で描く話になり工数が跳ね上がる（＝今はやらない判断材料）

macOS でいちばん苦労した3点は Windows には存在しない: 罠 #9（別 Space に入れない）、
WebKit に透過の公開 API が無いこと（WebKit bug 200528）、App Store 2.5.1 の private API 禁止。

---

## 1. VM を用意する

Apple Silicon なので **Windows 11 ARM64**。VMware Fusion（個人利用は無料）／ UTM（無料）／
Parallels（有料・Windows 11 ARM を自動で取ってくる）。

VM の中に入れるもの:

- **Rust**（`rustup`。既定ターゲットが `aarch64-pc-windows-msvc` になる）
- **Visual Studio 2022 Build Tools** の C++ ワークロード（ARM64 MSVC + Windows SDK）
- **Node 22 以上**（ルートの `package.json` が `engines.node >= 22`。`.nvmrc` の 20.19.0 は古い）
- **WebView2 Runtime**（Windows 11 には同梱。念のため確認）
- **PowerPoint** と **Chrome**（検証対象）

リポジトリは **VM の中に git clone** する。共有フォルダ上の `node_modules` は極端に遅く、
改行コードとシンボリックリンクでも事故る。

```powershell
git clone <repo> ; cd layertalk ; git checkout feature/windows-spike
npm ci
cd apps\presenter-app
$env:LAYERTALK_DEBUG_OVERLAY = "1"
npm run tauri:dev
```

> `.env.local` は gitignore なので手で持ち込む。**スパイクだけなら無くても動く**
> （下の裏口を使う）。コントロール窓の UI まで触るなら
> `VITE_SUPABASE_URL` と `VITE_SUPABASE_ANON_KEY` が要る。

## 2. 動かし方

**`Ctrl+Shift+O` でオーバーレイが出入りする。** これがスパイクの裏口。

「プレゼンを開始」ボタンはルーム必須（`ControlWindow.tsx` の `disabled={!settings.roomId}`）で、
ルームを作るにはサインインが要る。**透過と最前面を見るだけなのに VM で認証を通すのは過剰**なので、
Rust のグローバルショートカットから直接出せるようにしてある（`toggle_spike_overlay`）。
ショートカットは `set_live` も一緒に立てる — **最前面を当て直すウォッチドッグは発表中しか回らない**ので、
これが無いといちばん見たい「スライドショーに勝ち続けられるか」が試せない。

出るのはダミーのページ（`spike-overlay.html`）で、縁取り文字・不透明な板・横に流れる要素・
右下の HUD だけ。**HUD のカウントが止まったら webview が凍っている。**

**`Ctrl+Shift+Q` でダミーの質問を1件流す。** 押すたびに増え、右端に質問パネルが出る。
これも Rust 側の裏口で、Supabase もサインインも要らない。

`Ctrl+Shift+L` でコントロール窓を呼び出せる（macOS の `⇧⌘L` に相当。
Windows で `SUPER` は Windows キーなので `CONTROL` に替えてある）。

### 切り分け用の環境変数

| 変数 | 効果 |
|---|---|
| `LAYERTALK_DEBUG_OVERLAY=1` | `%APPDATA%\app.layertalk.presenter\overlay-debug.log` に書く。**まずこれを付ける** |
| `LAYERTALK_WIN_WEBVIEW_TRANSPARENT=1` | WebView2 の既定背景色 alpha=0 を当て直す。**既定では呼ばない** — wry が `transparent: true` から既に当てているため（`wry/src/webview2/mod.rs:127-131`, `:453`）。ここで直るなら適用順の問題、直らないなら窓側（DWM）か CSS の問題 |
| `LAYERTALK_WIN_NO_TOOLWINDOW=1` | `WS_EX_TOOLWINDOW` を当てない（Alt+Tab に出る）。最前面が壊れる切り分け用 |

ログには毎秒 `win/overlay: ex=0x… topmost=1 noactivate=1 tool=1 layered=1 transparent=1` が出る。
**`topmost` や `noactivate` が 0 に落ちていたら、tao のスタイル書き戻しに消されている**（下の「注意」）。

## 3. 検証（この順で。1 で詰まったら 2 以降はやらない）

### 実測結果（2026-09-27 / Windows 11 ARM64 on Parallels / Apple Silicon）

**答えは Yes。** WebView2 の透過ウィンドウはスライドショーの上に、クリックスルーのまま出た。
つまり **Windows に `overlay_render.rs` + `question_render.rs` 相当（AppKit / Core Animation の
1,370 行）を書き直す必要はない。**

| # | 項目 | 結果 |
|---|---|---|
| 1 | 透過 | **○** |
| 2 | スライドショーの上に出る | **○** |
| 3 | クリックスルー | **○** |
| 4 | フォーカスを奪わない（矢印キーでページ送り） | **○** |
| 5 | Alt+Tab に出ない | **○**（初回は× → `WS_EX_APPWINDOW` を直して再実測で○） |

> `skip_taskbar(true)` にしても**最前面は壊れなかった**（再実測で確認）。
> Alt+Tab に「LayerTalk Control」が出るのは正しい状態 — 発表者が操作する窓なので、
> 隠すのは `overlay` と `questions` だけ。
| 6 | 5分放置して webview が凍らない | **○**（macOS の罠 #20 は Windows では再現せず） |
| 7 | 質問パネルの当たり判定 | **○** 窓を中身の大きさに縮める方式で解決（macOS の `question_render` と同じ考え方）。パネルの上下のスライドはクリックでき、カードが増えると窓が伸び、畳むとタブだけになり、操作しても矢印キーでのページ送りは生きたまま |

**これで Windows 固有の難所は2つとも抜けた**（透過オーバーレイと、フォーカスを奪わない
中身サイズの操作可能パネル）。残る未知数は**質問スライドの撮影**（Windows.Graphics.Capture）、
マルチモニターと DPI、インストーラと署名。

セットアップで踏んだ環境側の穴（コードとは無関係）:
`link.exe not found`（VS Build Tools の C++ ワークロードと **ARM64 コンポーネント**が要る）、
`clang not found`（`ring` が Windows on ARM でアセンブリを組むのに要る → `winget install LLVM.LLVM`）、
`npm ci` が実行ポリシーで弾かれる（`Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`）。


| # | 見るもの | 合格の条件 |
|---|---|---|
| 1 | **透過** | デスクトップの上でオーバーレイの地が透ける。白／黒の板が出ない。**白いスライドと黒いスライドの両方**で見る（たまたま同じ色なだけ、を弾くため） |
| 2 | **最前面（本命）** | PowerPoint で F5。その上に出る。スライドを送ってもちらつかない。**F5 の前に出した場合と、後に出した場合の両方** |
| 3 | **クリックスルー** | 文字の上をクリックしてスライドが送れる。ドラッグ・右クリック・ホイールも下に抜ける。**ここで透過を見直す** — `WS_EX_LAYERED` が付くのはこの瞬間なので、1 で通って 3 で板が出るなら犯人はこれ |
| 4 | **フォーカス** | オーバーレイが出た直後に**矢印キーでページが送れる**（スライドショーがフォーカスを保っている） |
| 5 | **Alt+Tab / タスクバー** | どちらにもオーバーレイが出ない。`Ctrl+Shift+O` を何度か往復しても出ない（毎回スタイルが書き戻されるため） |
| 6 | **ブラウザの全画面** | Chrome で Google スライド / Canva をプレゼンモードにして 2〜4 を再確認。**macOS で唯一勝てなかった相手**なので、ここが Windows の価値を決める |
| 7 | **マルチモニター / DPI** | 2画面で指定した側に出る。125%/150% の画面でサイズが合う |
| 7.5 | **質問パネルの当たり判定** | `Ctrl+Shift+Q` で質問を出し、**パネルのすぐ下・すぐ上のスライドがクリックできる**か。パネル自体のクリック（展開／折りたたみ）が効き、その直後に矢印キーでスライドが送れるか |
| 8 | **凍結** | 発表中に放置して HUD のカウントが進み続けるか。止まるなら macOS の罠 #20 が Windows でも起きる |

記録は各項目のスクリーンショットと `overlay-debug.log`。
**VM の GPU 合成は実機と違うので、1 と 2 が通ったら最終判断は実機で取り直すこと。**

## 4. 実装で踏んだ Windows 固有の注意

**tao はフラグが1つ変わるたびに拡張スタイルを丸ごと書き戻す**
（`tao-0.35.3/src/platform_impl/windows/window_state.rs:426-441` の
`SetWindowLongW(GWL_EXSTYLE, style_ex)`）。値は tao 自身のフラグからだけ計算されるので、
**手で足した拡張スタイルは次の `show()` / `set_ignore_cursor_events()` / `set_always_on_top()` で消える。**

そのため:

- `WS_EX_TOPMOST` は `always_on_top`、`WS_EX_NOACTIVATE` は **`focusable(false)`** に任せる
  （`window_state.rs:296-297`）。**`focused(false)` ではない** — あちらは「最初にフォーカスを
  当てるか」だけで、スタイルには効かない
- tao が知らない `WS_EX_TOOLWINDOW` だけを自前で当て、**窓を見せたあとに**当て直す
  （`apply_overlay_behaviour` の最後・`show()` の直後・ウォッチドッグの毎周）
- 当て直しは**既に立っていれば何もしない**。毎秒 `SWP_FRAMECHANGED` を撃つと、それ自体がちらつく

**`skip_taskbar(true)` を外さないこと。** false だと tao が `WS_EX_APPWINDOW` を立て
（`tao-0.35.3/.../window_state.rs:258-259`）、それが `WS_EX_TOOLWINDOW` を打ち消して
**Alt+Tab とタスクバーに出る**。実測で `ex=0x080c01b8`（`tool=1` なのに一覧に出た）。
tao の `skip_taskbar` は `ITaskbarList::DeleteTab` で所有者ウィンドウを作らないので、
最前面は壊れない（当初警戒していた WPF の報告は tao には当てはまらない）。

**新しく作る窓には capability が要る。** このアプリには `src-tauri/permissions/` が無いので
**独自コマンドは ACL の対象外**（`set_question_panel_size` などは権限なしで通る）。だが
`listen` / `emit` は Tauri のコアプラグインのコマンドなので**権限が要る**。
`capabilities/default.json` は `"windows": ["control"]` だけなので、
`overlay` と `questions` は `capabilities/overlay.json` で別に開けてある。
これを忘れると「窓は出て、独自コマンドも通るのに、イベントだけ何も届かない」という
分かりにくい壊れ方をする（実測: 質問パネルの枠は出るのに質問が1件も出なかった）。
`default.json` を広げずに別ファイルにしたのは、オーバーレイに `dialog` と `fs` を
渡さないため（レポートを書くのはコントロール窓だけ）。

**質問パネルの窓は中身の大きさに縮めること。** Windows では**窓の矩形がそのまま
当たり判定**になるので、画面の高さいっぱいの窓を出すと右端の帯が全部クリックを吸い、
発表者がスライドを触れなくなる。CSS の `pointer-events: none` は OS の当たり判定には
効かないので、窓そのものを縮めるしかない。
`QuestionWindow` が `ResizeObserver` で中身を測り、`set_question_panel_size` で Rust へ渡し、
Rust が `PANEL_SIZE` に置いて右端へ貼り直す。macOS が `question_render` でやっているのと同じ調整。
報告は 1px 以上変わったときだけ・rAF で 1 フレーム 1 回に束ねる
（`motion` のレイアウトアニメーション中は `ResizeObserver` が毎フレーム鳴るため）。
一覧の高さの上限に **`vh` を使わないこと** — 窓の高さが中身に追従するので
「窓が縮む → `vh` が縮む → さらに縮む」と収束しない。`screen.height` を基準にする。

**透過は窓の生成時にしか決められない。** 窓側は tao の `DwmEnableBlurBehindWindow`、
webview 側は wry の `SetDefaultBackgroundColor(alpha=0)`。どちらも生成時だけで、
後から透過にする API は無い。だから窓は `tauri.conf.json` ではなく
**実行時に `WebviewWindowBuilder` で作っている**（config の窓は全プラットフォーム共通で
作られてしまい、macOS ではネイティブ描画の窓と二重になる）。

**`background_color` を絶対に設定しないこと。** Tauri は透過窓の親 HWND を softbuffer で
自分で塗るので、色を指定すると不透明な塗りになって透過が死ぬ。

## 5. 質問スライドの撮影（スパイク②）

**`Ctrl+Shift+O` で発表を開始 → `Ctrl+Shift+Q` で質問を1件流す**と、その瞬間のスライドが
`%APPDATA%\app.layertalk.presenter\question-captures\{セッション}\{質問}.jpg` に保存される。
ログに `capture/done: 1920x1080 frames=1 in 180ms` と保存先のパスが出る。

macOS が ScreenCaptureKit の常時ストリーム（2fps）で撮っているのに対し、**Windows は
質問が届いた瞬間に1枚だけ撮る**。`SCScreenshotManager` のようなブロックする API が無いのと、
**WGC は撮影中ずっと画面に黄色い枠を描く**ため（常時ストリームだと発表中ずっと投影面に出る）。

### 実測結果（2026-10-03 / Windows 11 ARM64 on Parallels / Apple Silicon）

**答えは Yes。全項目○。**

```
capture/start: monitor=\\.\DISPLAY1
capture/done: 1920x1080 frames=1 in 36ms
spike: capture Captured health=CaptureHealth { frames_seen: 1, frames_stored: 1,
       last_status: Some("wgc/ok"), blocked: false, stopped: None }
```

| 項目 | 結果 |
|---|---|
| JPEG ができる | **○** |
| スライドが正しく写っている（色の反転なし） | **○** |
| LayerTalk のオーバーレイが写っていない | **○**（`DwmFlush` 1回で 1枚目から効いた。`SKIP=0` のままでよい） |
| 黄色い録画枠が出ない | **○**（`IsBorderRequired = false` が効いている） |
| カーソルが写っていない | **○** |
| 所要時間 | **26〜36ms**。800ms のタイムアウトに対して十分速く、D3D デバイスを毎回作り直す設計で問題ない |
| 大きさ | **1920×1080**。WGC は実寸で返すので、縮小を入れ忘れると 4K のまま JPEG になる |

**これで Windows 固有の未知数は3つとも潰れた**（透過オーバーレイ、中身サイズの操作可能パネル、
オンデマンド撮影）。残るのは移植の手数だけで、新しい技術的リスクは無い。

### 見るところ

| # | 確認 | ○の条件 |
|---|---|---|
| 1 | 1枚でも撮れるか | JPEG ができる。**×ならここで止める** |
| 2 | 中身が正しいか | スライドが写っている。**色が反転していない**（BGRA→RGB の取り違えは静かに間違う。空や肌の色で分かる） |
| 3 | オーバーレイが写っていないか | コメントが流れている状態で撮り、画像に入らないこと |
| 4 | 黄色い枠 | 撮影の瞬間に投影面に枠が出ないこと（Windows 11 なら `IsBorderRequired = false` が効く） |
| 5 | カーソル | 写っていないこと |
| 6 | 固まらないか | 撮影中もコメントが流れ続ける。ログの所要時間が数百 ms に収まる |
| 7 | 大きさ | JPEG の長辺が 1920 になっていること |

### 切り分け用の環境変数

| 変数 | 効果 |
|---|---|
| `LAYERTALK_WIN_CAPTURE_SKIP=1` | 1枚目を捨てて2枚目を採る。**オーバーレイが写り込むときだけ**使う（既定 0） |

### Windows 固有の注意

- **WGC に縮小は無い。** `SCStreamConfiguration` と違って画面の実寸で返るので、
  `capture_dimensions`（長辺 1920）を自分で通す。忘れると 4K がそのまま JPEG になり、
  1枚 1.5MB 超・取り置き 30 枚で 45MB・レポートの base64 でさらに 1.3 倍になる
- **`WDA_EXCLUDEFROMCAPTURE` は Zoom や OBS からも窓を消す。** macOS の
  `with_excluding_applications` のように「自分の撮影からだけ」除く手段は無いので、
  **撮る瞬間だけ立てて必ず戻す**（`ExcludeGuard` の Drop）。戻し損ねると
  オーバーレイが以後ずっと他のキャプチャから消えたままになる — この設計で最悪の壊れ方
- **`SetWindowDisplayAffinity` は次の合成で効く。** 立てた直後に撮るとオーバーレイが
  1枚目に写るので、`DwmFlush()` で合成を1回通してから撮る
- **`TryGetNextFrame` のポーリングにしない。** 空のときも `Err` を返し、しかも `code()` が
  `HRESULT(0)` なので「まだ来ていない」と本物の失敗（`DXGI_ERROR_DEVICE_REMOVED` など）を
  区別できない。`FrameArrived` で受ける
- **`start()` で試し撮りしない。** `start_presentation` は同期コマンド＝メインスレッドで走るので、
  GPU の往復を挟むとオーバーレイごと固まる（罠 #17 と同じ形）。`start` は
  `IsSupported()` とモニター列挙だけ
- **モニターは GDI のデバイス名（`\\.\DISPLAY1`）で覚える。** `HMONITOR` は 32bit に入らず、
  画面構成が変わると無効になる。`display_id: u32` は列挙順の添字を運ぶだけの一時的な値で、
  `start` がすぐ名前へ格上げし、撮影のたびに名前→位置→添字の順で引き直す

### Mac から Windows のコードを型検査する

`scratchpad/winprobe` が `#[path]` で**本物の `windows_capture.rs` を直接読む**ので、
写し間違いもズレも起きない。

```bash
cd <scratchpad>/winprobe && cargo check --target aarch64-pc-windows-msvc
```

`windows = "0.61"` だけに依存するクレートなので `ring` を経由せず通る。589 行の
WGC + D3D11 コードはこれで VM に行く前に型を通した。
**`windows_overlay.rs` は `tauri::WebviewWindow` を取るのでこの方法では読めない。**

## 5c. 通しで動いた（2026-10-03）

スパイクではなく**本物の経路**で確認済み（Windows 11 ARM64 / Parallels）:

1. コントロール窓でサインイン → ルーム作成
2. 「プレゼンを開始」
3. スマホから投稿 → **コメントとスタンプがスライドの上を流れる**
4. 質問を投稿 → **右端のパネルに積まれる**
5. **質問1件につきスライド画像が1枚保存される**（オーバーレイの写り込みなし）
6. 発表を終了 → **HTML レポートが書き出せる**

`.env.local` は gitignore なので VM へ手で持ち込む必要がある。Parallels なら
`Copy-Item "\\Mac\Home\Desktop\LayerTalk\apps\presenter-app\.env.local" ...` が早い。
**Notepad で作らないこと** — 拡張子に `.txt` が付くか、空のまま保存される
（実際に 0 バイトのファイルができて、Vite が env を読めずに窓が真っ白になった）。

## 5b. 本採用のときの宿題

- **`capture_question` / `hold_question` / `discard_question` は cfg を広げて共有した。**
  本体は `parts.grab_frame()` の1行以外プラットフォーム非依存だったので複製しなかった。
  macOS のコンパイル結果は一字一句同じ
- **失敗の文言が macOS 前提のまま。** Windows の撮影失敗はすべて `AwaitingFirstFrame`
  （4つの理由のうち、文言が macOS を名指ししていない唯一のもの）に寄せてある。
  本当の原因は `CaptureHealth.last_status`（`wgc/timeout` など）に入り `debug_log` へ出る。
  Windows 向けの文言を足すのは Rust の enum → `tauri.ts` の union → `question-capture.ts` の
  文言 → `question-capture.test.ts`（両言語で "macOS 14" を固定している）の4ファイル変更になる
- **`control` 窓は撮影から外していない。** 発表者の手元画面にあるのが普通で、外すと
  Zoom からもコントロール窓が消えるため。投影面にコントロール窓を置くと写り込む

## 6. スパイクの範囲外（わざと入れていない）

質問スライドの撮影（ScreenCaptureKit 相当）・StoreKit・Keychain・インストーラと署名。
いずれも**黙って無反応にはならず、エラーを返す**ことは確認済み。
`open_external_url` だけは Windows で `Err` を返すので、法務・サポート・領収書のリンクは
すべて死ぬ（`ShellExecuteW` の腕を足せば直る。スパイクの範囲外）。

透過が確認できたら、順に:
窓ルーティング（`main.tsx` を `currentWindowLabel()` で分岐）→ 本物の `OverlayWindow` を載せる
→ 質問パネル窓 → モニター選択 → Keychain を Credential Manager に
→ 撮影を Windows.Graphics.Capture に → インストーラと署名。
