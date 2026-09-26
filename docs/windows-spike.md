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

`Ctrl+Shift+L` でコントロール窓を呼び出せる（macOS の `⇧⌘L` に相当。
Windows で `SUPER` は Windows キーなので `CONTROL` に替えてある）。

### 切り分け用の環境変数

| 変数 | 効果 |
|---|---|
| `LAYERTALK_DEBUG_OVERLAY=1` | `%APPDATA%\app.layertalk.presenter\overlay-debug.log` に書く。**まずこれを付ける** |
| `LAYERTALK_WIN_WEBVIEW_TRANSPARENT=1` | WebView2 の既定背景色 alpha=0 を当て直す。**既定では呼ばない** — wry が `transparent: true` から既に当てているため（`wry/src/webview2/mod.rs:127-131`, `:453`）。ここで直るなら適用順の問題、直らないなら窓側（DWM）か CSS の問題 |
| `LAYERTALK_WIN_SKIP_TASKBAR=1` | Tauri の `skip_taskbar` も使う。既定は `WS_EX_TOOLWINDOW` だけで隠す |
| `LAYERTALK_WIN_NO_TOOLWINDOW=1` | `WS_EX_TOOLWINDOW` を当てない（Alt+Tab に出る）。最前面が壊れる切り分け用 |

ログには毎秒 `win/overlay: ex=0x… topmost=1 noactivate=1 tool=1 layered=1 transparent=1` が出る。
**`topmost` や `noactivate` が 0 に落ちていたら、tao のスタイル書き戻しに消されている**（下の「注意」）。

## 3. 検証（この順で。1 で詰まったら 2 以降はやらない）

| # | 見るもの | 合格の条件 |
|---|---|---|
| 1 | **透過** | デスクトップの上でオーバーレイの地が透ける。白／黒の板が出ない。**白いスライドと黒いスライドの両方**で見る（たまたま同じ色なだけ、を弾くため） |
| 2 | **最前面（本命）** | PowerPoint で F5。その上に出る。スライドを送ってもちらつかない。**F5 の前に出した場合と、後に出した場合の両方** |
| 3 | **クリックスルー** | 文字の上をクリックしてスライドが送れる。ドラッグ・右クリック・ホイールも下に抜ける。**ここで透過を見直す** — `WS_EX_LAYERED` が付くのはこの瞬間なので、1 で通って 3 で板が出るなら犯人はこれ |
| 4 | **フォーカス** | オーバーレイが出た直後に**矢印キーでページが送れる**（スライドショーがフォーカスを保っている） |
| 5 | **Alt+Tab / タスクバー** | どちらにもオーバーレイが出ない。`Ctrl+Shift+O` を何度か往復しても出ない（毎回スタイルが書き戻されるため） |
| 6 | **ブラウザの全画面** | Chrome で Google スライド / Canva をプレゼンモードにして 2〜4 を再確認。**macOS で唯一勝てなかった相手**なので、ここが Windows の価値を決める |
| 7 | **マルチモニター / DPI** | 2画面で指定した側に出る。125%/150% の画面でサイズが合う |
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

**透過は窓の生成時にしか決められない。** 窓側は tao の `DwmEnableBlurBehindWindow`、
webview 側は wry の `SetDefaultBackgroundColor(alpha=0)`。どちらも生成時だけで、
後から透過にする API は無い。だから窓は `tauri.conf.json` ではなく
**実行時に `WebviewWindowBuilder` で作っている**（config の窓は全プラットフォーム共通で
作られてしまい、macOS ではネイティブ描画の窓と二重になる）。

**`background_color` を絶対に設定しないこと。** Tauri は透過窓の親 HWND を softbuffer で
自分で塗るので、色を指定すると不透明な塗りになって透過が死ぬ。

## 5. スパイクの範囲外（わざと入れていない）

質問スライドの撮影（ScreenCaptureKit 相当）・StoreKit・Keychain・インストーラと署名。
いずれも**黙って無反応にはならず、エラーを返す**ことは確認済み。
`open_external_url` だけは Windows で `Err` を返すので、法務・サポート・領収書のリンクは
すべて死ぬ（`ShellExecuteW` の腕を足せば直る。スパイクの範囲外）。

透過が確認できたら、順に:
窓ルーティング（`main.tsx` を `currentWindowLabel()` で分岐）→ 本物の `OverlayWindow` を載せる
→ 質問パネル窓 → モニター選択 → Keychain を Credential Manager に
→ 撮影を Windows.Graphics.Capture に → インストーラと署名。
