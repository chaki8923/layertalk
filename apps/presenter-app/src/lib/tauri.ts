import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";

/** 起動しているのがどちらの窓か。tauri.conf.json の label と一致させる。 */
export type WindowLabel = "overlay" | "control";

export const currentWindowLabel = (): WindowLabel => getCurrentWindow().label as WindowLabel;

export type MonitorInfo = {
  name: string;
  width: number;
  height: number;
  x: number;
  y: number;
  scale: number;
  is_primary: boolean;
};

export const listMonitors = () => invoke<MonitorInfo[]>("list_monitors");

/** 表示先モニターを変更する。null でプライマリ。 */
export const setOverlayMonitor = (monitor: string | null) =>
  invoke<void>("set_overlay_monitor", { monitor });

export const startPresentation = (monitor: string | null) =>
  invoke<void>("start_presentation", { monitor });

export const stopPresentation = () => invoke<void>("stop_presentation");

export const getPresentationState = () => invoke<boolean>("get_presentation_state");

/** 開始前にオーバーレイを ms ミリ秒だけ見せる。発表中は何もしない。 */
export const peekOverlay = (monitor: string | null, ms: number) =>
  invoke<void>("peek_overlay", { monitor, ms });

/** ディスプレイ構成が変わったときにオーバーレイを貼り直す */
export const refitOverlay = (monitor: string | null) => invoke<void>("refit_overlay", { monitor });

export const showControlWindow = () => invoke<void>("show_control");

/** 発表の開始・終了を購読する。トレイからの終了もここに届く。 */
export const onPresentationStateChanged = (handler: (live: boolean) => void) =>
  listen<boolean>("presentation-state-changed", (event) => handler(event.payload));

/** peek が始まったことを受け取る。ペイロードは表示時間(ms)。 */
export const onOverlayPeek = (handler: (ms: number) => void) =>
  listen<number>("overlay-peek", (event) => handler(event.payload));

// クリックスルーは常時 ON の固定仕様。切り替える API は用意していない
// （発表中に背面が操作できなくなる事故を作らないため）。
