import React from "react";
import ReactDOM from "react-dom/client";

import "./index.css";
import { loadSettings } from "./lib/settings";
import { currentWindowLabel } from "./lib/tauri";
import { ControlWindow } from "./windows/ControlWindow";
import { OverlayWindow } from "./windows/OverlayWindow";
import { QuestionWindow } from "./windows/QuestionWindow";

// ルーターは使わない。どちらの窓かは Tauri のウィンドウ label で決まる。
const label = currentWindowLabel();

// 描画より前に当てる。index.html は 3 つの窓で共有していて lang="ja" 固定なので、
// ここで直さないと最初の 1 フレームだけ日本語の行分割で出てしまう。
document.documentElement.lang = loadSettings().language;

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    {label === "overlay" ? (
      <OverlayWindow />
    ) : label === "questions" ? (
      <QuestionWindow />
    ) : (
      <ControlWindow />
    )}
  </React.StrictMode>,
);
