import type { EntitlementLease } from "@layertalk/shared";

import { BILLING_API_BASE, BillingError, billingBearerHeaders, billingJson, type EventPassProduct, type EventPassPurchaseResult } from "./billing-http";
import {
  onStoreKitTransaction,
  storeKitFinish,
  storeKitProduct,
  storeKitPurchase,
  storeKitUnfinished,
  type StoreKitTransaction,
} from "./tauri";

const PRODUCT_ID = import.meta.env.VITE_APPLE_EVENT_PASS_PRODUCT_ID
  ?? "app.layertalk.presenter.event_pass";

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
