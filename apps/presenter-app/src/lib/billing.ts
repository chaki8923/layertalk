import {
  BILLING_API_BASE,
  BillingError,
  billingBearerHeaders,
  billingJson,
} from "./billing-http";
import { openExternalUrl } from "./tauri";

export {
  getEventPassProduct,
  initializeBillingRecovery,
  isMasBuild,
  loadCachedEntitlementLease,
  purchaseEventPass,
  refreshEntitlementLease,
  restorePurchases,
  verifyEntitlementLease,
} from "@layertalk/billing-channel";

export { BillingError } from "./billing-http";

/**
 * サーバが返した状態コードを保ったまま投げる。
 *
 * これが無いと、認証切れ（401）・ルーム消失（404）・環境変数の不足（500）と、
 * そもそも通信できていない場合（CORS など、`fetch` 自体が `TypeError` で落ちる）が
 * 呼び出し側で区別できず、全部「接続を確認してください」に化ける。
 * `status` が無い＝リクエストが飛んでいない、という区別に使う。
 */
export async function openAudiencePage(path: string) {
  if (!BILLING_API_BASE) throw new Error("Audience URL is not configured");
  await openExternalUrl(`${BILLING_API_BASE}${path.startsWith("/") ? path : `/${path}`}`);
}

/**
 * 退会する。App Store 5.1.1(v) が「アカウントを作れるならアプリ内で消せること」を要求する。
 *
 * 課金の話ではないが、この経路が要るものは全部この file が持っている
 * （`API_BASE` / `bearerHeaders` / `BillingError` / CORS を通した Route Handler）ので
 * ここに置く。`status` を保つ理由は `BillingError` の doc を参照。
 *
 * 権利のキャッシュは**呼び出し側ではなくここで**捨てる。消し忘れると、退会後に
 * 同じ端末で新しいアカウントを作ったときに前の Event Pass が生きているように見える。
 */
export async function deleteAccount(): Promise<void> {
  const response = await fetch(`${BILLING_API_BASE}/api/account/delete`, {
    method: "POST",
    headers: await billingBearerHeaders(),
  });
  const body = await billingJson(response);
  if (!response.ok) throw new BillingError(typeof body.error === "string" ? body.error : "Account deletion failed", response.status);
  try { localStorage.removeItem("layertalk:event-pass-lease"); } catch { /* Storage が使えなくても退会は済んでいる */ }
}

export async function openEntitlementReceipt(entitlementId: string) {
  const response = await fetch(`${BILLING_API_BASE}/api/billing/receipt`, {
    method: "POST",
    headers: await billingBearerHeaders(),
    body: JSON.stringify({ entitlementId }),
  });
  const body = await billingJson(response);
  if (!response.ok || typeof body.url !== "string") throw new BillingError(typeof body.error === "string" ? body.error : "Receipt failed", response.status);
  await openExternalUrl(body.url);
}
