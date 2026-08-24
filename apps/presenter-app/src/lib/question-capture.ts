import type { PresentationSession } from "@layertalk/shared";
import type { ScreenCapturePermission } from "./tauri";

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
