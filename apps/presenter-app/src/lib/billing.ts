import { openUrl } from "@tauri-apps/plugin-opener";
import { importSPKI, jwtVerify } from "jose";

import type { EntitlementLease } from "@layertalk/shared";

import { supabase } from "./supabase";

const API_BASE = (import.meta.env.VITE_BILLING_API_BASE_URL || import.meta.env.VITE_AUDIENCE_BASE_URL || "").replace(/\/$/, "");
const LEASE_KEY = "layertalk:event-pass-lease";

async function bearerHeaders() {
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new Error("Presenter authentication required");
  return { Authorization: `Bearer ${data.session.access_token}`, "Content-Type": "application/json" };
}

export async function startEventPassCheckout(roomId: string) {
  const response = await fetch(`${API_BASE}/api/billing/checkout`, {
    method: "POST",
    headers: await bearerHeaders(),
    body: JSON.stringify({ roomId, attemptId: crypto.randomUUID() }),
  });
  const body = await response.json() as { url?: string; error?: string };
  if (!response.ok || !body.url) throw new Error(body.error ?? "Checkout failed");
  await openUrl(body.url);
}

export async function refreshEntitlementLease(roomId: string): Promise<EntitlementLease | null> {
  const response = await fetch(`${API_BASE}/api/billing/entitlement`, {
    method: "POST",
    headers: await bearerHeaders(),
    body: JSON.stringify({ roomId }),
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
  } catch {
    return null;
  }
}

export async function verifyEntitlementLease(lease: EntitlementLease, roomId: string) {
  const pem = import.meta.env.VITE_ENTITLEMENT_PUBLIC_KEY?.replace(/\\n/g, "\n");
  if (!pem) return null;
  const key = await importSPKI(pem, "EdDSA");
  const { payload } = await jwtVerify(lease.token, key, { algorithms: ["EdDSA"] });
  if (payload.roomId !== roomId || payload.entitlementId !== lease.claims.entitlementId) return null;
  return lease;
}
