import { supabase } from "./supabase";

export const BILLING_API_BASE = (
  import.meta.env.VITE_BILLING_API_BASE_URL || import.meta.env.VITE_AUDIENCE_BASE_URL || ""
).replace(/\/$/, "");

export async function billingBearerHeaders() {
  const { data } = await supabase.auth.getSession();
  if (!data.session) throw new Error("Presenter authentication required");
  return { Authorization: `Bearer ${data.session.access_token}`, "Content-Type": "application/json" };
}

export async function billingJson(response: Response) {
  try { return await response.json() as Record<string, unknown>; }
  catch { return {}; }
}

export class BillingError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "BillingError";
  }
}

export type EventPassProduct =
  | { status: "ready"; productId: string; displayName: string; displayPrice: string }
  | { status: "unavailable" | "error"; message?: string };
export type EventPassPurchaseResult = "started" | "completed" | "pending" | "cancelled";
/** `failed` に別アカウントの購入（サーバの 409）は含めない。数えるのは検証や通信の失敗だけ。 */
export type RestorePurchasesResult = { restored: number; failed: number };
