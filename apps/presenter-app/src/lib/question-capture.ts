import type { PresentationSession } from "@layertalk/shared";

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
