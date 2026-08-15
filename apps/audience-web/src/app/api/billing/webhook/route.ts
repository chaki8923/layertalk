import type Stripe from "stripe";

import { serverEnv } from "@/lib/server/env";
import { fulfillCheckoutSession, recordBillingEvent } from "@/lib/server/fulfillment";
import { createAdminClient } from "@/lib/server/supabase-admin";
import { getStripe } from "@/lib/server/stripe";

export const runtime = "nodejs";

function idOf(value: string | { id: string } | null | undefined) {
  return typeof value === "string" ? value : value?.id ?? null;
}

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) return new Response("Missing signature", { status: 400 });
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(await request.text(), signature, serverEnv.stripeWebhookSecret());
  } catch {
    return new Response("Invalid signature", { status: 400 });
  }

  try {
    if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
      await fulfillCheckoutSession(event.data.object, {
        id: event.id, type: event.type, livemode: event.livemode, apiVersion: event.api_version,
      });
    } else if (event.type === "checkout.session.async_payment_failed" || event.type === "checkout.session.expired") {
      const session = event.data.object;
      const admin = createAdminClient();
      await admin.from("checkout_attempts").update({
        status: event.type.endsWith("expired") ? "expired" : "failed",
        updated_at: new Date().toISOString(),
      }).eq("stripe_checkout_session_id", session.id);
      await recordBillingEvent(event, "processed", session.id);
    } else if (event.type === "charge.refunded") {
      const charge = event.data.object;
      if (charge.amount_refunded >= charge.amount) {
        const admin = createAdminClient();
        const { error } = await admin.rpc("revoke_event_pass", {
          p_event_id: event.id, p_event_type: event.type, p_object_id: charge.id,
          p_livemode: event.livemode, p_api_version: event.api_version,
          p_payment_intent_id: idOf(charge.payment_intent), p_reason: "full_refund",
        } as never);
        if (error) throw error;
      } else {
        await recordBillingEvent(event, "ignored", charge.id, "Partial refund requires manual review");
      }
    } else if (event.type === "charge.dispute.created") {
      const dispute = event.data.object;
      const admin = createAdminClient();
      const { error } = await admin.rpc("revoke_event_pass", {
        p_event_id: event.id, p_event_type: event.type, p_object_id: dispute.id,
        p_livemode: event.livemode, p_api_version: event.api_version,
        p_payment_intent_id: idOf(dispute.payment_intent), p_reason: "dispute",
      } as never);
      if (error) throw error;
    } else {
      await recordBillingEvent(event, "ignored", (event.data.object as { id?: string }).id);
    }
    return Response.json({ received: true });
  } catch (error) {
    await recordBillingEvent(event, "failed", (event.data.object as { id?: string }).id,
      error instanceof Error ? error.message : "Unknown webhook error");
    return new Response("Webhook processing failed", { status: 500 });
  }
}
