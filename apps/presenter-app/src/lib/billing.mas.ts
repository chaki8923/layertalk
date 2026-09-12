import type { EntitlementLease } from "@layertalk/shared";

import { BILLING_API_BASE, BillingError, billingBearerHeaders, billingJson, type EventPassProduct, type EventPassPurchaseResult, type RestorePurchasesResult } from "./billing-http";
import {
  onStoreKitTransaction,
  storeKitAll,
  storeKitFinish,
  storeKitProduct,
  storeKitPurchase,
  storeKitUnfinished,
  type StoreKitTransaction,
} from "./tauri";

// 未設定なら vite.config.ts が MAS ビルドを落とす。既定値へ落とすと App Store Connect とずれても気付けない。
const PRODUCT_ID = import.meta.env.VITE_APPLE_EVENT_PASS_PRODUCT_ID ?? "";

export const isMasBuild = true;

export async function getEventPassProduct(): Promise<EventPassProduct> {
  return storeKitProduct(PRODUCT_ID);
}

async function fulfill(transaction: StoreKitTransaction) {
  const response = await fetch(`${BILLING_API_BASE}/api/billing/app-store/fulfill`, {
    method: "POST",
    headers: await billingBearerHeaders(),
    body: JSON.stringify({ signedTransaction: transaction.signedTransaction }),
  });
  const body = await billingJson(response);
  if (!response.ok) throw new BillingError(typeof body.error === "string" ? body.error : "Purchase verification failed", response.status);
  await storeKitFinish(transaction.transactionId);
}

export async function purchaseEventPass(roomId: string, attemptId: string): Promise<EventPassPurchaseResult> {
  const response = await fetch(`${BILLING_API_BASE}/api/billing/app-store/attempt`, {
    method: "POST", headers: await billingBearerHeaders(), body: JSON.stringify({ roomId, attemptId }),
  });
  const body = await billingJson(response);
  if (!response.ok || typeof body.productId !== "string") {
    throw new BillingError(typeof body.error === "string" ? body.error : "Purchase preparation failed", response.status);
  }
  const result = await storeKitPurchase(body.productId, attemptId);
  if (result.status === "success") {
    await fulfill(result);
    return "completed" as const;
  }
  if (result.status === "pending") return "pending" as const;
  if (result.status === "userCancelled") return "cancelled" as const;
  throw new BillingError("message" in result && result.message
    ? result.message
    : "StoreKit purchase failed");
}

async function recover() {
  const result = await storeKitUnfinished();
  for (const transaction of result.transactions) {
    if (transaction.productId !== PRODUCT_ID) continue;
    try { await fulfill(transaction); }
    catch { /* Leave unfinished so StoreKit offers it again on the next recovery. */ }
  }
}

/**
 * 購入を復元する。**`recover()` とは見る先が違う。**
 *
 * `recover()` が見る `Transaction.unfinished` には、**一度 finish したものは入らない**。
 * Event Pass は Non-Renewing Subscription で、Apple は「同じ Apple ID の全デバイスへ
 * 届ける責任は開発者にある」としているので、2 台目の Mac では `Transaction.all` を
 * 見に行かないと何も戻せない。
 *
 * 1 件ずつ続けるのは、履歴には**別の LayerTalk アカウントで買った Pass**も
 * 入っているため（Apple ID は同じでもアプリのアカウントは別でありうる）。サーバは
 * それを 409 で返す。異常ではないので数えない。
 * **それ以外の失敗は数えて返す。** 以前は全部握り潰していたので、サーバの検証が
 * 全件落ちていても「復元できる購入は見つかりませんでした」と出て、壊れていることが見えなかった。
 * 付与そのものは `app_store_transaction_id` の一意制約で冪等なので、何度押しても増えない。
 */
export async function restorePurchases(): Promise<RestorePurchasesResult> {
  const result = await storeKitAll();
  let restored = 0;
  let failed = 0;
  for (const transaction of result.transactions) {
    if (transaction.productId !== PRODUCT_ID) continue;
    try {
      await fulfill(transaction);
      restored += 1;
    } catch (error) {
      if (!(error instanceof BillingError && error.status === 409)) failed += 1;
    }
  }
  return { restored, failed };
}

export async function initializeBillingRecovery() {
  void recover().catch(() => undefined);
  const unlisten = await onStoreKitTransaction((transaction) => {
    if (transaction.productId === PRODUCT_ID) void fulfill(transaction).catch(() => undefined);
  });
  const onFocus = () => void recover().catch(() => undefined);
  window.addEventListener("focus", onFocus);
  return () => { unlisten(); window.removeEventListener("focus", onFocus); };
}

// MAS builds use the server entitlement row as the source of truth and never
// bundle the direct build's Ed25519/jose offline lease verifier.
export async function refreshEntitlementLease(_roomId: string): Promise<EntitlementLease | null> { return null; }
export function loadCachedEntitlementLease(_roomId: string): EntitlementLease | null { return null; }
export async function verifyEntitlementLease(_lease: EntitlementLease, _roomId: string) { return null; }
