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

export type ScreenCapturePermissionTarget = "layerTalk" | "launchingApp";

export type ScreenCapturePermission = {
  supported: boolean;
  granted: boolean;
  restartRequired: boolean;
  permissionTarget: ScreenCapturePermissionTarget;
};

/** request=true のときだけ macOS の画面収録許可ダイアログを開く。 */
export const getScreenCapturePermission = (request = false) =>
  invoke<ScreenCapturePermission>("screen_capture_permission", { request });

/** macOSの「プライバシーとセキュリティ > 画面収録」を開く。 */
export const openScreenCaptureSettings = () =>
  invoke<void>("open_screen_capture_settings");

/**
 * `framePending` になった理由。
 *
 * ここを潰して「準備できませんでした」の一言に戻さないこと。macOS の確認ダイアログを
 * 拒否したのか、まだ1枚も来ていないのか、macOS 13 で単発撮影が使えないのかで、
 * 発表者が壇上でやるべきことが違う。
 */
export type CapturePendingReason =
  | "awaitingFirstFrame"
  | "captureBlocked"
  | "streamStopped"
  | "snapshotFailed";

export type CaptureQuestionResult = {
  status: "captured" | "inactive" | "framePending";
  reason?: CapturePendingReason;
};

/** 最新フレームを質問IDへ固定する。撮影停止中と初回フレーム待ちを区別して返す。 */
export const captureQuestionSlide = (questionId: string) =>
  invoke<CaptureQuestionResult>("capture_question_slide", { questionId });

/** レポートへ埋め込むローカルJPEGを data URL として読む。 */
export const readQuestionCapture = (sessionId: string, questionId: string) =>
  invoke<string | null>("read_question_capture", { sessionId, questionId });

/** セッション用にローカル保存されている質問画像の枚数。 */
export const questionCaptureCount = (sessionId: string) =>
  invoke<number>("question_capture_count", { sessionId });

export const overlayPushComment = (
  text: string,
  fontSize: number,
  opacity: number,
  baseDurationSec: number,
) => invoke<void>("overlay_push_comment", { text, fontSize, opacity, baseDurationSec });

/** フキダシ表示。横流しとはレーンの規則が別物なので、コマンドも分けてある。 */
export const overlayPushBubble = (
  text: string,
  fontSize: number,
  opacity: number,
  baseDurationSec: number,
) => invoke<void>("overlay_push_bubble", { text, fontSize, opacity, baseDurationSec });

export const overlayBurstEmoji = (
  emoji: string,
  count: number,
  opacity: number,
  baseDurationSec: number,
) => invoke<void>("overlay_burst_emoji", { emoji, count, opacity, baseDurationSec });

/**
 * カスタムスタンプの PNG を Rust 側へ覚えさせる。
 *
 * **Broadcast に URL は載らない**（誰でも任意の画像をスライド最前面に描画できてしまう）。
 * 署名 URL の解決は JS 側に残したまま、bytes だけを Rust へ渡す。
 */
export const overlayCacheStampImage = (id: string, pngBase64: string) =>
  invoke<void>("overlay_cache_stamp_image", { id, pngBase64 });

export const overlayBurstImage = (
  id: string,
  count: number,
  opacity: number,
  baseDurationSec: number,
) => invoke<void>("overlay_burst_image", { id, count, opacity, baseDurationSec });

/**
 * セルフテスト（`LAYERTALK_OVERLAY_SELFTEST`）が走っているか。
 *
 * 常設レイヤ（参加QR・モニターカード）は普段この窓が出し入れを持っているが、
 * セルフテストはルーム無しで走るので、**放っておくと置いた直後に消しに行く**。
 */
export const isOverlaySelftest = () => invoke<string | null>("is_overlay_selftest");

/**
 * 発表中に Rust から 1 秒ごとに届く「起きていろ」の合図。
 *
 * 見えていない窓の webview は、macOS が**約 6 秒でページごと凍らせる**（実測）。凍ると
 * `setInterval` が止まり、Supabase の購読は繋がったまま何も届かなくなる。外から来た
 * broadcast では起きず、**ネイティブ側からの IPC だけが起こせる**ので、
 * `start_front_watchdog` が突いている。
 *
 * **listener を登録すること自体が起こす条件。** Tauri は event に listener を登録した
 * webview にしか JS を評価しない（`emit_js_filter`）ので、登録を外すとその窓は起きない。
 * 受けているのはオーバーレイ窓（購読）とコントロール窓（質問スライド撮影の起点）。
 */
export const onPresentationKeepalive = (handler: (seq: number) => void) =>
  listen<number>("presentation-keepalive", (event) => handler(event.payload));

/** セルフテストのプローブからの通報。`LAYERTALK_DEBUG_OVERLAY` のログに落ちる。 */
export const selftestHeartbeat = (kind: string, seq: number, detail: string) =>
  invoke<void>("selftest_heartbeat", { kind, seq, detail });

/**
 * 参加QR を左下に出す。`null` で消す。
 *
 * **カードは JS 側で `<canvas>` に描いて PNG にする。** QR は1ピクセル狂うと
 * 読み取れないので、`qrcode.react` の出力をそのまま焼く。
 */
export const overlaySetJoinQr = (pngBase64: string | null) =>
  invoke<void>("overlay_set_join_qr", { pngBase64 });

/** モニター確認カード。両方 null で消す。`monitor` は訳さない（罠 #12）。 */
export const overlaySetPeekCard = (caption: string | null, monitor: string | null) =>
  invoke<void>("overlay_set_peek_card", { caption, monitor });

export const overlayClear = () => invoke<void>("overlay_clear");

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

/**
 * 質問窓の大きさを Rust へ伝える。表示先（どのモニターか）は Rust が持っている。
 *
 * **webview が不透明になったので「窓＝見えているパネル」。** 中身より大きい窓を出すと
 * 縦に伸びた黒帯になるので、展開中は高さを実測して渡す（`ResizeObserver`）。
 * 折りたたみ中はタブの寸法が固定なので `height` は無視される。
 */
export const setQuestionPanelSize = (expanded: boolean, height: number | null) =>
  invoke<void>("set_question_panel_size", { expanded, height });

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

export type QuestionCaptureError = {
  kind: "permissionDenied" | "displayUnavailable" | "captureStartFailed";
  detail: string;
  permissionTarget: ScreenCapturePermissionTarget;
};

/** 権限取消・ディスプレイ消失など、発表を止めずにキャプチャだけ失敗した通知。 */
export const onQuestionCaptureError = (handler: (error: QuestionCaptureError) => void) =>
  listen<QuestionCaptureError>("question-capture-error", (event) => handler(event.payload));

// クリックスルーは常時 ON の固定仕様。切り替える API は用意していない
// （発表中に背面が操作できなくなる事故を作らないため）。
