/**
 * Windows スパイク: 質問パネル窓のエントリ。
 *
 * **本物の `QuestionWindow` をそのままマウントする。** 確かめたいのは
 * 「窓の矩形が中身に追従して、スライドの右端を塞がないか」なので、
 * ダミーの見た目では意味がない。
 *
 * `ControlWindow` を経由しないのは、あれが Supabase のクライアントを起動時に作るため
 * （`.env.local` が無い VM では例外で真っ白になる）。`QuestionWindow` は
 * Tauri のイベントだけで動くので、単体でマウントできる。
 *
 * 透過と当たり判定の可否が確定したら、このファイルは `main.tsx` の
 * 窓ルーティング（`currentWindowLabel()`）に置き換えて捨てる。
 */
import React from "react";
import ReactDOM from "react-dom/client";

import "./index.css";
import { loadSettings } from "./lib/settings";
import { QuestionWindow } from "./windows/QuestionWindow";

// index.css の `html, body, #root { height: 100% }` をこの窓だけ解除する。
// 中身の高さで文書が止まらないと、窓を中身の大きさへ縮められない。
document.documentElement.dataset.window = "questions";
document.documentElement.lang = loadSettings().language;

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <QuestionWindow />
  </React.StrictMode>,
);
