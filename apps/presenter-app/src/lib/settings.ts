import { emit, listen } from "@tauri-apps/api/event";
import type { DisplayMode } from "@layertalk/shared";

export type PresenterSettings = {
  roomId: string | null;
  roomCode: string | null;
  roomTitle: string | null;
  displayMode: DisplayMode;
  /** オーバーレイのコメント文字サイズ (px) */
  fontSize: number;
  /** コメント全体の不透明度 0.4–1 */
  opacity: number;
  /** 横流しの基準秒数。文字数に応じて伸縮する。 */
  flowDurationSec: number;
  /** スタンプが下から上まで上がりきる秒数。大きいほどゆっくり。 */
  stampDurationSec: number;
  /** 表示先モニターの名前。null ならプライマリ。 */
  monitorName: string | null;
  commentsEnabled: boolean;
  stampsEnabled: boolean;
};

export const DEFAULT_SETTINGS: PresenterSettings = {
  roomId: null,
  roomCode: null,
  roomTitle: null,
  displayMode: "flow",
  fontSize: 30,
  opacity: 1,
  flowDurationSec: 9,
  stampDurationSec: 9,
  monitorName: null,
  commentsEnabled: true,
  stampsEnabled: true,
};

const STORAGE_KEY = "layertalk:presenter-settings";
const EVENT = "settings-changed";
const TEST_STAMP_EVENT = "test-stamp";

export function loadSettings(): PresenterSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    // 保存済みに無いキーが後から増えても壊れないよう既定値に重ねる。
    return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<PresenterSettings>) };
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
