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
  /**
   * コントロール窓のセクションの並び。ドラッグで入れ替えられる。
   *
   * 発表者ごとに触る頻度が違うので、手元で並べ替えられるようにしてある。
   * 既定は `SECTION_IDS` の順（表示モニターが開始ボタンの直下、Event Pass が末尾）。
   */
  sectionOrder: SectionId[];
};

/**
 * 並び替えできるセクション。**この配列の順が既定の並びそのもの。**
 *
 * 壇上でよく触る表示モニターを先頭に、ほとんど触らない Event Pass を末尾に置いている。
 */
export const SECTION_IDS = ["monitor", "room", "display", "stamp", "customStamp", "eventPass"] as const;
export type SectionId = (typeof SECTION_IDS)[number];

/**
 * 保存された並び順を実行時の形に直す。
 *
 * 知らない id は捨て、重複も落とし、足りない id は既定の順で末尾に足す。
 * **足す方が本命** — セクションを増やしたときに、古い localStorage のせいで
 * 新しいセクションが永久に見えなくなるのを防ぐため。
 */
export function normalizeSectionOrder(value: unknown): SectionId[] {
  const known = new Set<string>(SECTION_IDS);
  const seen = new Set<SectionId>();
  const order: SectionId[] = [];
  if (Array.isArray(value)) {
    for (const item of value) {
      if (typeof item !== "string" || !known.has(item)) continue;
      const id = item as SectionId;
      if (seen.has(id)) continue;
      seen.add(id);
      order.push(id);
    }
  }
  for (const id of SECTION_IDS) if (!seen.has(id)) order.push(id);
  return order;
}

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
  sectionOrder: [...SECTION_IDS],
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

/**
 * 初回起動だけの表示言語。
 *
 * 「表示言語を決めるのは発表者だけ」という方針は変えていない。**保存値が無いとき
 * だけ**の初期値で、一度でも選べばそちらが正になる。既定を日本語に固定していると、
 * 日本語を読まない相手（App Review を含む）は最初の画面から何も読めない。
 * `navigator.language` は WKWebView でも OS の設定を返す。
 */
function initialLanguage(): Locale {
  try {
    return navigator.language?.toLowerCase().startsWith("ja") ? "ja" : "en";
  } catch {
    return DEFAULT_SETTINGS.language;
  }
}

export function loadSettings(): PresenterSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS, language: initialLanguage() };
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
      // 保存値が正。壊れた値・未知の値だけ初回と同じ判定へ落とす。
      language: parsed.language === "en" || parsed.language === "ja" ? parsed.language : initialLanguage(),
      sectionOrder: normalizeSectionOrder(parsed.sectionOrder),
    };
  } catch {
    return { ...DEFAULT_SETTINGS, language: initialLanguage() };
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
