import React from "react";
import ReactDOM from "react-dom/client";

import "./index.css";
import { currentWindowLabel } from "./lib/tauri";
import { ControlWindow } from "./windows/ControlWindow";
import { OverlayWindow } from "./windows/OverlayWindow";
import { QuestionWindow } from "./windows/QuestionWindow";

// ルーターは使わない。どちらの窓かは Tauri のウィンドウ label で決まる。
const label = currentWindowLabel();

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
