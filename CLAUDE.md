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

**9. ブラウザの全画面プレゼン（Canva 等）にはオーバーレイが出ない — 調査中**
Keynote / PowerPoint は**同じ Space** に高レベル窓を出すので罠 #5 で勝てるが、**Canva を Chrome の
プレゼンテーションモードにするとコメント／スタンプが完全に見えない**。確定している事実:
- **レベルの問題ではない。** ⇧⌘L のコントロール窓（同じ level 1000 / 同じ collectionBehavior）は
  Canva の全画面に**重なって出る**。オーバーレイとの差は `NSApplication activate` の有無だけ
- **順序の問題でもない。** tao の `show()` は既に `makeKeyAndOrderFront`（`window.rs:668`）を
  呼んでいて、`orderFrontRegardless` を後から足しても症状は変わらなかった
- 残る候補は「別 Space に置き去り」か「前に居るが WKWebView が描画を止めている」。
  `lib.rs` の `log_window_state` に計測を入れた。`LAYERTALK_DEBUG_OVERLAY=1` で起動すると
  `isVisible` / `isOnActiveSpace` / `occlusionState` が 1 秒ごとに出るので、これで切り分ける
  （`onActiveSpace=false` → Space、`occluded=true` → 描画停止）

ここまでで分かった副産物:
- **`isVisible()` を前面化のガードに使うな。** macOS は別 Space の窓や隠れている窓を false と
  報告することがあり、「一度負けたら二度と復帰できない」状態を作る。判断は Rust 側の
  `live` / `panel_shown`（`SessionState`）に寄せてある
- **tao のサイズ・位置の setter は `*_async`。** 当てた直後に `frame` を読むと反映前の値が出る
- 発表**開始後**に全画面にされると新しい Space が後から生まれるので、発表中だけ 1 秒ごとに
  当て直すウォッチドッグ（`start_front_watchdog`）を回している。本筋は
  `NSWorkspace.activeSpaceDidChangeNotification` だが `block2` の依存追加が要るので採らなかった

## 設計上の決めごと

- **コメント／スタンプの全面オーバーレイはクリックスルー常時 ON。** 切り替え UI も
  ショートカットも持たない。操作できるのは右端の質問窓の範囲だけで、そこで
  展開／折りたたみを操作できる（スライド全面の操作を塞がないため）
- **参加 QR は手動トグルだけ。** 自動表示はしない（スライドを勝手に隠さない）。
  URL は `VITE_AUDIENCE_BASE_URL`（未設定なら localhost）で、LAN IP の自動検出はしない
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
- **いいねは `toggle_comment_like` RPC 経由のみ。** anon に `comments` の UPDATE を開けると
  `content` まで書き換えられる。`comment_likes` は RLS ポリシーを一切作らず完全に閉じている
- **スタンプは DB に保存しない。** Broadcast のみ。連打は 100ms 単位で集約してから送る
- **audience-web はダークファースト。** 観客は暗い会場でスマホを見る
- **日本語 Web フォントは読み込まない。** 数MBあり会場の Wi-Fi で初期表示が壊れる

## 既知の制約

- 匿名アプリなので**いいねの水増しは原理的に防げない**（`client_id` は端末が自由に作れる）
- ルーム作成は anon に開いている
- Supabase advisor は5件指摘を出すが、いずれも上記の設計を選んだ結果で意図どおり
- 複数モニター同時表示（ミラー）は未対応。1台を選ぶ方式
- コード署名・公証なし
