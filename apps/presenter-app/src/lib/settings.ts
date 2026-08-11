import { emit, listen } from "@tauri-apps/api/event";
import type { Comment, DisplayMode } from "@layertalk/shared";

export type PresenterSettings = {
  roomId: string | null;
  roomCode: string | null;
  roomTitle: string | null;
  /** 直前に外したルームのコード。押し間違えても1タップで戻れるように残す。 */
  previousRoomCode: string | null;
  displayMode: DisplayMode;
  /** 表示先モニターの名前。null ならプライマリ。 */
  monitorName: string | null;
};

export const DEFAULT_SETTINGS: PresenterSettings = {
  roomId: null,
  roomCode: null,
  roomTitle: null,
  previousRoomCode: null,
  displayMode: "flow",
  monitorName: null,
};

/** シンプルな固定表示。コントロール窓からは変更しない。 */
export const OVERLAY_DEFAULTS = {
  fontSize: 30,
  opacity: 1,
  flowDurationSec: 9,
  bubbleDurationSec: 9,
  stampDurationSec: 9,
} as const;

const STORAGE_KEY = "layertalk:presenter-settings";
const EVENT = "settings-changed";
const TEST_STAMP_EVENT = "test-stamp";
const TEST_COMMENT_EVENT = "test-comment";
const QUESTION_RECEIVED_EVENT = "question-received";

export function loadSettings(): PresenterSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<PresenterSettings>) };
    // 廃止した表示設定をlocalStorageから実行時へ持ち込まない。
    // ここに書き忘れたフィールドは読み込みで捨てられる。
    return {
      roomId: parsed.roomId,
      roomCode: parsed.roomCode,
      roomTitle: parsed.roomTitle,
      previousRoomCode: parsed.previousRoomCode,
      displayMode: parsed.displayMode === "bubble" ? "bubble" : "flow",
      monitorName: parsed.monitorName,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

/**
 * 保存 + 全ウィンドウへ通知。
 *
 * 2つの窓は同一オリジンなので localStorage は共有されるが、別々の WKWebView なので
 * storage イベントは飛ばない。Tauri のイベントで明示的に伝える。
 */
export async function saveSettings(settings: PresenterSettings): Promise<void> {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  await emit(EVENT, settings);
}

export const onSettingsChanged = (handler: (settings: PresenterSettings) => void) =>
  listen<PresenterSettings>(EVENT, (event) => handler(event.payload));

export type TestStamp = { emoji: string; count: number };

/** コントロール窓からオーバーレイにスタンプを撃ち込む。
 *  スマホを持ち出さずに演出の速さを詰めるための確認用。 */
export const sendTestStamp = (stamp: TestStamp) => emit(TEST_STAMP_EVENT, stamp);

export const onTestStamp = (handler: (stamp: TestStamp) => void) =>
  listen<TestStamp>(TEST_STAMP_EVENT, (event) => handler(event.payload));

/** コントロール窓から現在の表示スタイルへ確認用コメントを送る。 */
export const sendTestComment = (text: string) => emit(TEST_COMMENT_EVENT, text);

export const onTestComment = (handler: (text: string) => void) =>
  listen<string>(TEST_COMMENT_EVENT, (event) => handler(event.payload));

/** 既存のRealtime購読で受けた質問を、独立した右端パネル窓へ渡す。 */
export const sendQuestionToPanel = (comment: Comment) => emit(QUESTION_RECEIVED_EVENT, comment);

export const onQuestionReceived = (handler: (comment: Comment) => void) =>
  listen<Comment>(QUESTION_RECEIVED_EVENT, (event) => handler(event.payload));
