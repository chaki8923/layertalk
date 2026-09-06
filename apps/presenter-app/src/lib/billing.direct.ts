import { openUrl } from "@tauri-apps/plugin-opener";
import { importSPKI, jwtVerify } from "jose";

import type { EntitlementLease } from "@layertalk/shared";

import { BILLING_API_BASE, BillingError, billingBearerHeaders, billingJson, type EventPassProduct, type EventPassPurchaseResult } from "./billing-http";

const LEASE_KEY = "layertalk:event-pass-lease";

export const isMasBuild = false;

export async function getEventPassProduct(): Promise<EventPassProduct> {
  return { status: "ready", productId: "stripe:event-pass", displayPrice: "¥2,980", displayName: "LayerTalk Event Pass" };
}

export async function purchaseEventPass(roomId: string, attemptId: string): Promise<EventPassPurchaseResult> {
  const response = await fetch(`${BILLING_API_BASE}/api/billing/checkout`, {
    method: "POST",
    headers: await billingBearerHeaders(),
    body: JSON.stringify({ roomId, attemptId }),
  });
  const body = await billingJson(response);
  if (!response.ok || typeof body.url !== "string") {
    throw new BillingError(typeof body.error === "string" ? body.error : "Checkout failed", response.status);
  }
  await openUrl(body.url);
  return "started";
}

export async function refreshEntitlementLease(roomId: string): Promise<EntitlementLease | null> {
  const response = await fetch(`${BILLING_API_BASE}/api/billing/entitlement`, {
    method: "POST", headers: await billingBearerHeaders(), body: JSON.stringify({ roomId }),
  });
  if (response.status === 404) return loadCachedEntitlementLease(roomId);
  if (!response.ok) throw new Error("Entitlement check failed");
  const lease = await response.json() as EntitlementLease;
  localStorage.setItem(LEASE_KEY, JSON.stringify(lease));
  return verifyEntitlementLease(lease, roomId);
}

export function loadCachedEntitlementLease(roomId: string): EntitlementLease | null {
  try {
    const raw = localStorage.getItem(LEASE_KEY);
    if (!raw) return null;
    const lease = JSON.parse(raw) as EntitlementLease;
    if (lease.claims.roomId !== roomId || new Date(lease.claims.expiresAt).getTime() <= Date.now()) return null;
    return lease;
  } catch { return null; }
}

export async function verifyEntitlementLease(lease: EntitlementLease, roomId: string) {
  const pem = import.meta.env.VITE_ENTITLEMENT_PUBLIC_KEY?.replace(/\\n/g, "\n");
  if (!pem) return null;
  const key = await importSPKI(pem, "EdDSA");
  const { payload } = await jwtVerify(lease.token, key, { algorithms: ["EdDSA"] });
  return payload.roomId === roomId && payload.entitlementId === lease.claims.entitlementId ? lease : null;
}

export async function initializeBillingRecovery() { return () => undefined; }
