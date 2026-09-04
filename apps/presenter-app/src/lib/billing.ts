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

async function jsonBody(response: Response) {
  try { return await response.json() as { url?: string; error?: string }; }
  catch { return {} as { url?: string; error?: string }; }
}

/**
 * サーバが返した状態コードを保ったまま投げる。
 *
 * これが無いと、認証切れ（401）・ルーム消失（404）・環境変数の不足（500）と、
 * そもそも通信できていない場合（CORS など、`fetch` 自体が `TypeError` で落ちる）が
 * 呼び出し側で区別できず、全部「接続を確認してください」に化ける。
 * `status` が無い＝リクエストが飛んでいない、という区別に使う。
 */
export class BillingError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "BillingError";
  }
}

export async function startEventPassCheckout(roomId: string, attemptId: string) {
  const response = await fetch(`${API_BASE}/api/billing/checkout`, {
    method: "POST",
    headers: await bearerHeaders(),
    body: JSON.stringify({ roomId, attemptId }),
  });
  const body = await jsonBody(response);
  if (!response.ok || !body.url) throw new BillingError(body.error ?? "Checkout failed", response.status);
  await openUrl(body.url);
}

export async function openAudiencePage(path: string) {
  if (!API_BASE) throw new Error("Audience URL is not configured");
  await openUrl(`${API_BASE}${path.startsWith("/") ? path : `/${path}`}`);
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
  const response = await fetch(`${API_BASE}/api/account/delete`, {
    method: "POST",
    headers: await bearerHeaders(),
  });
  const body = await jsonBody(response);
  if (!response.ok) throw new BillingError(body.error ?? "Account deletion failed", response.status);
  try { localStorage.removeItem(LEASE_KEY); } catch { /* Storage が使えなくても退会は済んでいる */ }
}

export async function openEntitlementReceipt(entitlementId: string) {
  const response = await fetch(`${API_BASE}/api/billing/receipt`, {
    method: "POST",
    headers: await bearerHeaders(),
    body: JSON.stringify({ entitlementId }),
  });
  const body = await jsonBody(response);
  if (!response.ok || !body.url) throw new BillingError(body.error ?? "Receipt failed", response.status);
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
