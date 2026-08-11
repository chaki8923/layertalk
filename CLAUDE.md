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
- 認証なし。anon(publishable) キーのみ。`.env.local` はコミット済み（公開前提のキー）
- **git リポジトリではない**（未 init）

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

## 設計上の決めごと

- **コメント／スタンプの全面オーバーレイはクリックスルー常時 ON。** 切り替え UI も
  ショートカットも持たない。質問だけは右端の独立ウィンドウに分け、その範囲内で
  展開／折りたたみを操作できる（スライド全面の操作を塞がないため）
- **「プレゼンを開始」を押すまでオーバーレイは `hide()`。** ライブ状態は Rust の `Mutex` が持ち、
  永続化しない（再起動したら必ず停止状態から始まる）
- **開始より前の投稿は流さない。** リハーサルや前の発表で画面が埋まらないようにするため
- **終了してもルームは維持する。** 同じコードですぐ再開できる
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
