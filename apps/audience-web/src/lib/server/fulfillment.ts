import "server-only";

import { createHash } from "node:crypto";

import type Stripe from "stripe";

import { serverEnv } from "./env";
import { createAdminClient } from "./supabase-admin";
import { getStripe } from "./stripe";

function objectId(value: string | { id: string } | null): string | null {
  return typeof value === "string" ? value : value?.id ?? null;
}

export type CheckoutLandingState = "ready" | "processing" | "failed";

export async function resolveCheckoutLandingState(sessionId: string): Promise<CheckoutLandingState> {
  if (!/^cs_(?:test|live)_[A-Za-z0-9]+$/.test(sessionId)) return "failed";
  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ["line_items"] });
    const priceId = session.line_items?.data[0]?.price?.id;
    if (
      session.mode !== "payment"
      || session.metadata?.product !== "event_pass"
      || !session.metadata.owner_id
      || !session.metadata.room_id
      || priceId !== serverEnv.stripeEventPassPriceId()
      || session.currency !== "jpy"
      || session.amount_total !== 2980
    ) return "failed";

    if (session.payment_status === "paid") {
      const landingEventId = `checkout_landing_${createHash("sha256").update(session.id).digest("hex").slice(0, 32)}`;
      const entitlement = await fulfillCheckoutSession(session, {
        id: landingEventId,
        type: "checkout.landing.fulfillment",
        livemode: session.livemode,
        apiVersion: "2026-07-29.dahlia",
      });
      return entitlement ? "ready" : "processing";
    }

    const admin = createAdminClient();
    const { data: attempt } = await admin.from("checkout_attempts").select("status")
      .eq("stripe_checkout_session_id", session.id).maybeSingle();
    if (session.status === "expired" || attempt?.status === "expired" || attempt?.status === "failed") return "failed";
    return "processing";
  } catch {
    return "failed";
  }
}

export async function fulfillCheckoutSession(
  sessionOrId: Stripe.Checkout.Session | string,
  event: { id: string; type: string; livemode: boolean; apiVersion: string | null },
) {
  const stripe = getStripe();
  const session = typeof sessionOrId === "string"
    ? await stripe.checkout.sessions.retrieve(sessionOrId, { expand: ["line_items"] })
    : await stripe.checkout.sessions.retrieve(sessionOrId.id, { expand: ["line_items"] });

  if (session.mode !== "payment" || session.payment_status !== "paid") return null;
  const ownerId = session.metadata?.owner_id;
  const roomId = session.metadata?.room_id;
  const priceId = session.line_items?.data[0]?.price?.id;
  if (!ownerId || !roomId || priceId !== serverEnv.stripeEventPassPriceId()) {
    throw new Error("Checkout metadata or price does not match Event Pass");
  }
  if (session.currency !== "jpy" || session.amount_total !== 2980) {
    throw new Error("Event Pass amount does not match JPY 2,980");
  }

  const admin = createAdminClient();
  const paidAt = new Date((session.created || Math.floor(Date.now() / 1000)) * 1000).toISOString();
  const { data, error } = await admin.rpc("fulfill_event_pass", {
    p_event_id: event.id,
    p_event_type: event.type,
    p_object_id: session.id,
    p_livemode: event.livemode,
    p_api_version: event.apiVersion,
    p_owner_id: ownerId,
    p_room_id: roomId,
    p_checkout_session_id: session.id,
    p_payment_intent_id: objectId(session.payment_intent),
    p_customer_id: objectId(session.customer),
    p_price_id: priceId,
    p_amount_total: session.amount_total,
    p_currency: session.currency,
    p_paid_at: paidAt,
  } as never);
  if (error) throw error;
  return data;
}

export async function recordBillingEvent(
  event: Stripe.Event,
  status: "processed" | "ignored" | "failed",
  objectIdValue?: string,
  errorMessage?: string,
) {
  const admin = createAdminClient();
  await admin.from("billing_events").upsert({
    stripe_event_id: event.id,
    event_type: event.type,
    object_id: objectIdValue ?? null,
    livemode: event.livemode,
    api_version: event.api_version,
    status,
    error_message: errorMessage?.slice(0, 500) ?? null,
    processed_at: new Date().toISOString(),
  });
}
