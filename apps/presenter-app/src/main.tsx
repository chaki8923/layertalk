import React from "react";
import ReactDOM from "react-dom/client";

import "./index.css";
import { loadSettings } from "./lib/settings";
import { currentWindowLabel } from "./lib/tauri";

// 描画より前に当てる。index.html は lang="ja" 固定なので、
// ここで直さないと最初の 1 フレームだけ日本語の行分割で出てしまう。
document.documentElement.lang = loadSettings().language;

const root = ReactDOM.createRoot(document.getElementById("root") as HTMLElement);

/**
 * 窓ごとに中身を差し替える。HTML は `index.html` の1枚だけで、`currentWindowLabel()`
 * （= Tauri の窓ラベル）で分岐する。
 *
 * **静的 import にしないこと。** `ControlWindow` は 69KB、さらに `EventPassPanel` が 41KB あり、
 * 起動時に Supabase のセッション復元まで走る。透過オーバーレイ窓でそれを評価する理由が無い。
 * 動的 import なら、窓ごとに必要なチャンクだけが読まれる。
 *
 * **macOS ではオーバーレイも質問パネルも窓を作らない**（`native_overlay` が自前の NSWindow に
 * Core Animation で描く）ので、ここは常に `control` に落ちる。
 *
 * `data-window` は透過のための CSS フック。`index.css` の
 * `html, body, #root { height: 100% }` を質問パネル窓だけ解除するのに使う。
 * **import を待つ前に立てる** — 後だと最初の1フレームが崩れる。
 */
async function mount() {
  const label = currentWindowLabel();
  document.documentElement.dataset.window = label;

  if (label === "overlay") {
    const { OverlayWindow } = await import("./windows/OverlayWindow");
    root.render(<React.StrictMode><OverlayWindow /></React.StrictMode>);
    return;
  }
  if (label === "questions") {
    const { QuestionWindow } = await import("./windows/QuestionWindow");
    root.render(<React.StrictMode><QuestionWindow /></React.StrictMode>);
    return;
  }
  const { ControlWindow } = await import("./windows/ControlWindow");
  root.render(<React.StrictMode><ControlWindow /></React.StrictMode>);
}

/**
 * 読み込みに失敗したら**画面に出す**。
 *
 * `lib/supabase.ts` は起動時に `VITE_SUPABASE_URL` でクライアントを作るので、
 * `.env.local` が無いとモジュールの評価が例外で止まり、**窓が真っ白になるだけで
 * 何も分からない**（実際に Windows の VM でこれに時間を取られた）。
 * 枠無し・透過の窓では DevTools も開きにくいので、ここで文字にして出す。
 */
void mount().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  const node = document.getElementById("root");
  if (!node) return;
  node.textContent = `LayerTalk を起動できませんでした: ${message}`;
  node.setAttribute(
    "style",
    "position:fixed;inset:0;display:flex;align-items:center;justify-content:center;"
      + "padding:24px;background:#111;color:#fff;font-size:13px;text-align:center;line-height:1.6",
  );
});
