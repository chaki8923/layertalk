/**
 * 観客が開く URL。コントロール窓（コピー・QR）とオーバーレイ（QR）の両方が使う。
 *
 * デプロイ先は `VITE_AUDIENCE_BASE_URL` で渡す。未設定なら開発用の localhost に落ちるが、
 * その URL は観客のスマホからは開けない = QR は実質使えないので、デプロイしたら必ず設定する。
 */
const BASE_URL =
  (import.meta.env.VITE_AUDIENCE_BASE_URL as string | undefined)?.replace(/\/+$/, "") ||
  "http://localhost:3000";

/** ルーム未接続なら null。 */
export function audienceUrl(roomCode: string | null): string | null {
  return roomCode ? `${BASE_URL}/r/${roomCode}` : null;
}
