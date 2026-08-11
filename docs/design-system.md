# LayerTalk デザインシステム

このドキュメントと `packages/shared/styles/theme.css` が、両アプリのビジュアルの**唯一の正**です。
新しい色・角丸・イージングを画面側に直接書かないでください。必ずここに足してから使います。

---

## 1. 原則

**1. 暗い会場が既定条件**
観客は照明を落とした会場でスマホを見ます。白い画面は眩しく、周囲の迷惑にもなる。
→ `audience-web` は**ダークファースト**。ライトモードは `prefers-color-scheme` で対応するが、設計の基準はダーク。

**2. オーバーレイは「読める」が最優先**
プレゼンター側のコメントは、白背景のスライドにも黒背景の写真にも重なります。
→ 文字は必ず**縁取り + 影**。半透明の背景板に頼らない（スライドを隠すため）。

**3. 動きは短く、減速で終わる**
発表の邪魔をしないこと。入りは spring、抜けは 180ms の easeOut。
1秒を超えるアニメーションは、意図的な演出（横流れ・スタンプ上昇）だけに許可します。

**4. 触覚のあるボタン**
すべての操作可能要素は押下時に沈む（`scale: 0.94`）。iOS 標準アプリの手触りに寄せます。

---

## 2. カラー

セマンティックな名前だけを使います。`--lt-*` が実体で、Tailwind の `@theme inline` 経由で
`bg-bg` / `text-text-muted` / `border-border` のようなユーティリティとして生えます。

| トークン | ダーク（既定） | ライト | 用途 |
|---|---|---|---|
| `--lt-bg` | `#0A0C11` | `#F4F6FB` | ページ地色 |
| `--lt-bg-elev` | `#10141C` | `#FFFFFF` | 持ち上がった面（シート・ヘッダ） |
| `--lt-surface` | `rgb(255 255 255 / .06)` | `rgb(255 255 255 / .72)` | グラスカードの地 |
| `--lt-surface-strong` | `rgb(255 255 255 / .10)` | `rgb(255 255 255 / .90)` | 押下時・強調カード |
| `--lt-border` | `rgb(255 255 255 / .10)` | `rgb(15 20 32 / .08)` | 通常の境界 |
| `--lt-border-strong` | `rgb(255 255 255 / .18)` | `rgb(15 20 32 / .14)` | フォーカス・強調 |
| `--lt-text` | `#EEF1F7` | `#0F1420` | 本文 |
| `--lt-text-muted` | `#9AA3B7` | `#5A6479` | 補助テキスト |
| `--lt-text-faint` | `#646E85` | `#8A93A6` | プレースホルダ・時刻 |

ブランド色は両モード共通（暗所でも明所でも成立する彩度に調整済み）:

| トークン | 値 | 用途 |
|---|---|---|
| `--lt-brand` | `#6B8AFF` | 主アクション・アクティブ状態 |
| `--lt-brand-2` | `#B47CFF` | グラデーションの相方 |
| `--lt-like` | `#FF4D6D` | いいね（ハート） |
| `--lt-online` | `#3DD68C` | 接続中インジケータ |

グラデーションは 1 本だけ: `--lt-gradient-brand` = `linear-gradient(135deg, #6B8AFF, #B47CFF)`。
送信ボタンとアクティブなセグメントにのみ使い、多用しない。ユーティリティは `bg-gradient-brand`。

> **`accent` と名付けていない理由**: shadcn/ui は `--accent` を「ホバー時の背景色」の意味で
> 予約しています。同名にすると audience-web で衝突するため、ブランド色は `brand` に統一しました。
> shadcn コンポーネント側の `--background` / `--foreground` / `--primary` などは
> `apps/audience-web/src/app/globals.css` で上の `--lt-*` に接続してあるので、
> 色を変えたいときも編集するのはこのドキュメントと `theme.css` だけで済みます。

**コントラスト**: 本文 `--lt-text` は両モードで背景に対し 13:1 以上。`--lt-text-muted` は 4.5:1 以上（WCAG AA）。`--lt-text-faint` は装飾のみで、意味を持つ情報には使わない。

---

## 3. 角丸

4段階だけ。中間値を作らない。名前は用途そのもの（こちらも shadcn の `--radius-sm|md|lg` と
衝突しないため）。

| トークン | 値 | 用途 | ユーティリティ |
|---|---|---|---|
| `--radius-chip` | `8px` | タグ・小バッジ | `rounded-chip` |
| `--radius-control` | `14px` | ボタン・入力欄 | `rounded-control` |
| `--radius-card` | `20px` | コメントカード | `rounded-card` |
| `--radius-sheet` | `28px` | シート・フローティングバー | `rounded-sheet` |
| — | `999px` | ピル・アバター | `rounded-full` |

---

## 4. 余白

4px グリッド。Tailwind 既定のスケール（`1`=4px）をそのまま使います。
モバイルの左右パディングは `16px`（`px-4`）で固定。カード間は `10px`（`gap-2.5`）。

セーフエリア: 下端固定要素は必ず `padding-bottom: max(16px, env(safe-area-inset-bottom))`。

---

## 5. タイポグラフィ

```
--font-sans: -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Noto Sans JP",
             "Helvetica Neue", Arial, sans-serif;
```

Web フォントは**読み込みません**。日本語 Web フォントは数 MB あり、会場の混雑した Wi-Fi で
初期表示が壊れます。システムフォントなら iOS/macOS でヒラギノが即座に出ます。

| 用途 | サイズ / 行間 / 字送り | ウェイト |
|---|---|---|
| コメント本文 | 15px / 1.55 / 0.01em | 400 |
| ボタン・タブ | 14px / 1.2 / 0.01em | 600 |
| ヘッダのルーム名 | 16px / 1.3 / -0.01em | 650 |
| いいね数・時刻 | 12px / 1.2 / 0.02em | 500（tabular-nums） |
| オーバーレイのコメント | 30px（固定） | 700 |

数値は必ず `font-variant-numeric: tabular-nums`。いいね数が増減するたび幅が揺れるのを防ぎます。

---

## 6. モーション

CSS 用のイージングは `theme.css`、Framer Motion 用の spring は
`packages/shared/src/motion.ts` に定義。**両者は同じ意図の別表現**なので、片方だけ変えないこと。

| 名前 | 値 | 用途 |
|---|---|---|
| `press` | spring(stiffness 500, damping 32, mass .6) | ボタン押下の沈み込み |
| `entrance` | spring(stiffness 400, damping 30, mass .8) | 新着コメント・シート出現 |
| `soft` | spring(stiffness 220, damping 26) | レイアウト移動・タブ指示子 |
| `exit` | easeOut 180ms | あらゆる消失 |
| `--ease-out-quint` | `cubic-bezier(.22,1,.36,1)` | CSS transition の既定 |
| `--ease-spring-ish` | `cubic-bezier(.34,1.56,.64,1)` | 軽いオーバーシュート |

**演出用の長い動き**（原則の例外）:
- 横流れコメント: `linear`、文字数比例で 6–12 秒
- フキダシコメント: 9秒固定。3レーンを順番に使い、スタンプと同じ
  `RISE_EASE` で画面下から上へ流す。文字の実寸を測って完全に画面外へ出す。
- スタンプ上昇: 9秒固定。フェードは終盤 18% のみ。
  上昇が速いと視線を持っていかれて発表の邪魔になるので、**意図的にゆっくり**にしている。

> ### ⚠️ 命令的 `animate()` の落とし穴（実測で確認済み）
>
> **1. プロパティ別オプションに `duration` を書き忘れると、外側の `duration` が捨てられる。**
> motion の `getValueTransition` は `transition[key]` があればそれを**そのまま**使い、
> トップレベルの値をマージしない。
>
> ```js
> animate(el, { y: [0, -700] }, { duration: 24, y: { ease: X } })
> //                              ~~~~~~~~~~~~ 無視される → 実 duration は既定の 0.3 秒
> animate(el, { y: [0, -700] }, { duration: 24, y: { duration: 24, ease: X } })  // ✅
> ```
>
> 検証方法: `animate(...)` の戻り値の `.duration` を読むと実際の秒数が分かる。
>
> **2. cubic-bezier の第2制御点 (x2, y2) の y を 1.0 にしない。**
> その x の時点で移動距離を使い切ってしまう。`(0.35, 1.0)` は「時間の 35% で上がりきって、
> あとは上でじっとしている」動きになり、総時間を伸ばしても体感速度は変わらない。
> 現行の `RISE_EASE = [0.33, 0.33, 0.7, 0.92]` は開始時の傾きを 1.0（等速）に合わせてあるので、
> 「平均速度 = 上昇距離 ÷ duration」がそのまま体感になり、固定時間どおりの速さに見える。

`prefers-reduced-motion: reduce` のとき、装飾アニメーションは即座に最終状態へ飛ばす
（オーバーレイの横流れは「フキダシ + フェード」に自動フォールバック）。

---

## 7. エレベーション

透過ウィンドウでは `backdrop-filter` が極端に重いため、**グラスモーフィズムは
`audience-web` 限定**。プレゼンターのオーバーレイでは影と不透明度だけで階層を作ります。

| トークン | 用途 |
|---|---|
| `--shadow-card` | コメントカード |
| `--shadow-float` | 下端のフローティングバー |
| `--shadow-glow` | アクセント要素の発光（送信ボタン等） |

グラスの実装は必ずこの3点セット:
`background: var(--lt-surface)` + `backdrop-filter: blur(20px) saturate(180%)` + `border: 1px solid var(--lt-border)`

---

## 8. オーバーレイ専用（presenter-app）

背景は**完全に透明**。`html, body, #root` に色を置かないこと。

コメントの可読性は次の組み合わせで担保します（`.lt-overlay-text` として `theme.css` に定義済み）:

```css
color: #fff;
-webkit-text-stroke: 3px rgba(0, 0, 0, .85);
paint-order: stroke fill;           /* 縁取りを文字の内側に食い込ませない */
text-shadow: 0 2px 8px rgba(0, 0, 0, .6);
```

`paint-order: stroke fill` が要点です。これが無いと縁取りが文字の内側を侵食して細字が潰れます。

質問は通常コメントと同じ演出でそのまま流し、**加えて**画面右端の独立ウィンドウへ
新着順で最大5件を固定表示します（流れて消えても、右端には残る）。
カードは濃い黒背景と白文字、`--lt-brand` の Q ラベルを組み合わせ、スライドの明暗に
左右されないコントラストを確保します。透過ウィンドウで重い `backdrop-filter` は使いません。
パネルは430px幅から56pxのタブへ折りたため、閉じている間の新着は未読数で示します。
コメント／スタンプの全面オーバーレイはクリックスルーのまま、質問窓の範囲だけが操作対象です。
