import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";

/** 起動しているのがどちらの窓か。tauri.conf.json の label と一致させる。 */
export type WindowLabel = "overlay" | "control" | "questions";

export const currentWindowLabel = (): WindowLabel => getCurrentWindow().label as WindowLabel;

/** コントロール窓の独自タイトルバー／余白からネイティブドラッグを開始する。 */
export const startCurrentWindowDragging = () => getCurrentWindow().startDragging();

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

export const startPresentation = (monitor: string | null, captureSessionId: string | null = null) =>
  invoke<void>("start_presentation", { monitor, captureSessionId });

export const stopPresentation = () => invoke<void>("stop_presentation");

export type ScreenCapturePermission = {
  supported: boolean;
  granted: boolean;
  restartRequired: boolean;
};

/** request=true のときだけ macOS の画面収録許可ダイアログを開く。 */
export const getScreenCapturePermission = (request = false) =>
  invoke<ScreenCapturePermission>("screen_capture_permission", { request });

/** 最新フレームを質問IDへ固定する。フレーム未到着・非対象セッションなら false。 */
export const captureQuestionSlide = (questionId: string) =>
  invoke<boolean>("capture_question_slide", { questionId });

/** レポートへ埋め込むローカルJPEGを data URL として読む。 */
export const readQuestionCapture = (sessionId: string, questionId: string) =>
  invoke<string | null>("read_question_capture", { sessionId, questionId });

export const getPresentationState = () => invoke<boolean>("get_presentation_state");

/** 開始前にオーバーレイを ms ミリ秒だけ見せる。発表中は何もしない。 */
export const peekOverlay = (monitor: string | null, ms: number) =>
  invoke<void>("peek_overlay", { monitor, ms });

/**
 * ディスプレイ構成が変わったときにオーバーレイを貼り直す。
 *
 * 表示先モニターは**渡さない**。Rust が覚えている値を使う。各窓が自分の
 * `settings` から渡すと、設定変更の到着順で古い名前を送り返してしまい、
 * オーバーレイが主ディスプレイへ引き戻される（実際に起きた）。
 */
export const refitOverlay = () => invoke<void>("refit_overlay");

/** 質問窓を右端のパネル幅／タブ幅へ切り替える。表示先は Rust が持っている。 */
export const setQuestionPanelExpanded = (expanded: boolean) =>
  invoke<void>("set_question_panel_expanded", { expanded });

export const showControlWindow = () => invoke<void>("show_control");

/**
 * トレイメニューのラベルを言語に合わせて書き換える。
 *
 * トレイは Rust が起動時に一度だけ組み立てるので、React 側の文言カタログが届かない。
 * コントロール窓**だけ**が呼ぶこと（3 つの窓から呼ぶと同じ更新が競合する）。
 */
export const setAppLanguage = (language: "ja" | "en") =>
  invoke<void>("set_app_language", { language });

/** 発表の開始・終了を購読する。トレイからの終了もここに届く。 */
export const onPresentationStateChanged = (handler: (live: boolean) => void) =>
  listen<boolean>("presentation-state-changed", (event) => handler(event.payload));

/** peek が始まったことを受け取る。ペイロードは表示時間(ms)。 */
export const onOverlayPeek = (handler: (ms: number) => void) =>
  listen<number>("overlay-peek", (event) => handler(event.payload));

/** 権限取消・ディスプレイ消失など、発表を止めずにキャプチャだけ失敗した通知。 */
export const onQuestionCaptureError = (handler: (message: string) => void) =>
  listen<string>("question-capture-error", (event) => handler(event.payload));

// クリックスルーは常時 ON の固定仕様。切り替える API は用意していない
// （発表中に背面が操作できなくなる事故を作らないため）。
