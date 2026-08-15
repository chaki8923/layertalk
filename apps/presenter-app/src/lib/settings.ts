import { emit, listen } from "@tauri-apps/api/event";
import type { Comment, DisplayMode, Locale } from "@layertalk/shared";

export type PresenterSettings = {
  roomId: string | null;
  roomCode: string | null;
  roomTitle: string | null;
  /** 直前に外したルームのコード。押し間違えても1タップで戻れるように残す。 */
  previousRoomCode: string | null;
  /** DB上の現在の発表セッション。終了・レポートの境界に使う。 */
  presentationSessionId: string | null;
  /** 無料版にも残す、画面上の全リアクション非常停止。 */
  emergencyPaused: boolean;
  /** スライドの上に参加用 QR を出すか。自動表示はせず、コントロール窓のトグルだけで動かす。 */
  showJoinQr: boolean;
  /**
   * 観客がアップロードしたカスタムスタンプを流すか。
   *
   * 認証がないので「この端末は発表者だ」を DB 側で証明できず、削除は誰でも呼べる。
   * これは DB に一切依存しない非常ブレーキ — 押されても手元で描画しないだけなので必ず効く。
   */
  allowCustomStamps: boolean;
  displayMode: DisplayMode;
  /** 表示先モニターの名前。null ならプライマリ。 */
  monitorName: string | null;
  /**
   * 発表者用アプリの表示言語。ルームにも保存され、観客用 Web もこれに従う。
   *
   * 変更は `setRoomLanguage` で DB にも反映する。ここは端末側の記憶で、
   * 次の起動でも最後に選んだ言語で立ち上がる。
   */
  language: Locale;
};

export const DEFAULT_SETTINGS: PresenterSettings = {
  roomId: null,
  roomCode: null,
  roomTitle: null,
  previousRoomCode: null,
  presentationSessionId: null,
  emergencyPaused: false,
  showJoinQr: false,
  allowCustomStamps: true,
  displayMode: "flow",
  monitorName: null,
  language: "ja",
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
      presentationSessionId: parsed.presentationSessionId,
      emergencyPaused: parsed.emergencyPaused === true,
      showJoinQr: parsed.showJoinQr === true,
      allowCustomStamps: parsed.allowCustomStamps !== false,
      displayMode: parsed.displayMode === "bubble" ? "bubble" : "flow",
      monitorName: parsed.monitorName,
      language: parsed.language === "en" ? "en" : "ja",
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
