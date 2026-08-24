import type { Locale, PresentationSession } from "@layertalk/shared";
import type { CapturePendingReason, QuestionCaptureError, ScreenCapturePermission, ScreenCapturePermissionTarget } from "./tauri";

const preferenceKey = (roomId: string) => `layertalk:question-capture:${roomId}`;

/** ルームごとの明示的な opt-in。初期値は必ず false。 */
export function loadQuestionCapturePreference(roomId: string): boolean {
  return localStorage.getItem(preferenceKey(roomId)) === "true";
}

export function saveQuestionCapturePreference(roomId: string, enabled: boolean) {
  localStorage.setItem(preferenceKey(roomId), String(enabled));
}

/** サーバーが確定した有料セッションだけをキャプチャ対象にする。 */
export function isPaidPresentationSession(session: PresentationSession): boolean {
  const snapshot = session.entitlement_snapshot;
  return typeof snapshot === "object"
    && snapshot !== null
    && !Array.isArray(snapshot)
    && snapshot.paid === true;
}

export function shouldOpenScreenCaptureSettings(permission: ScreenCapturePermission): boolean {
  return permission.supported && (!permission.granted || permission.restartRequired);
}

export function screenCapturePermissionTargetName(target: ScreenCapturePermissionTarget, locale: Locale): string {
  if (target === "launchingApp") {
    return locale === "ja" ? "起動元アプリ（ターミナル・iTerm・IDEなど）" : "the launching app (Terminal, iTerm, or your IDE)";
  }
  return "LayerTalk";
}

export function questionCaptureErrorMessage(error: QuestionCaptureError, locale: Locale): string {
  const ja = locale === "ja";
  if (error.kind === "permissionDenied") {
    if (error.permissionTarget === "launchingApp") {
      return ja
        ? "開発版は起動元アプリの権限で動作します。システム設定でターミナル（iTermやIDEから起動した場合はそのアプリ）の画面収録をオンにし、開発プロセスを再起動してください。発表は継続できます。"
        : "Development builds use the launching app's permission. Allow Screen Recording for Terminal, iTerm, or your IDE, then restart the development process. The presentation can continue.";
    }
    return ja
      ? "システム設定でLayerTalkの画面収録をオンにし、LayerTalkを再起動してください。発表は継続できます。"
      : "Allow Screen Recording for LayerTalk in System Settings, then restart LayerTalk. The presentation can continue.";
  }
  if (error.kind === "displayUnavailable") {
    return ja
      ? "撮影対象のディスプレイを取得できませんでした。表示先を確認してください。発表は継続できます。"
      : "The selected display could not be captured. Check the presentation display. The presentation can continue.";
  }
  return ja
    ? "画面収録を開始できませんでした。LayerTalkを再起動してもう一度お試しください。発表は継続できます。"
    : "Screen capture could not start. Restart LayerTalk and try again. The presentation can continue.";
}

/**
 * 撮影は動いているのに画像が1枚も取れなかったときの文言。
 *
 * `questionCaptureErrorMessage` が「開始に失敗した」側、こちらが「開始はできたが撮れない」側。
 * `captureBlocked` / `streamStopped` は macOS が確認ダイアログでキャプチャを止めた形なので、
 * **システム設定ではなくダイアログの話をする**（設定は既にオンになっている）。
 */
export function questionCapturePendingMessage(
  reason: CapturePendingReason | undefined,
  locale: Locale,
): string {
  const ja = locale === "ja";
  if (reason === "captureBlocked" || reason === "streamStopped") {
    return ja
      ? "macOSが画面収録を止めています。表示された確認ダイアログで「許可」を選び、発表を開始し直してください。発表は継続できます。"
      : "macOS stopped the screen capture. Choose Allow in the confirmation dialog, then start the presentation again. The presentation can continue.";
  }
  if (reason === "snapshotFailed") {
    return ja
      ? "スライド画像を保存できませんでした。この機能はmacOS 14以降で動作します。発表は継続できます。"
      : "The slide image could not be saved. This feature needs macOS 14 or later. The presentation can continue.";
  }
  return ja
    ? "画面収録の準備が完了せず、この質問のスライド画像を保存できませんでした。発表は継続できます。"
    : "Screen capture was not ready, so this question's slide image could not be saved. The presentation can continue.";
}
