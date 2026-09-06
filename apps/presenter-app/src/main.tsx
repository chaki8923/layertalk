import React from "react";
import ReactDOM from "react-dom/client";

import "./index.css";
import { loadSettings } from "./lib/settings";
import { ControlWindow } from "./windows/ControlWindow";

// 描画より前に当てる。index.html は lang="ja" 固定なので、
// ここで直さないと最初の 1 フレームだけ日本語の行分割で出てしまう。
document.documentElement.lang = loadSettings().language;

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <ControlWindow />
  </React.StrictMode>,
);
