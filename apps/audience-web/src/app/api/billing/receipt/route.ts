import type Stripe from "stripe";

import { corsHeaders, corsJson } from "@/lib/server/cors";
import { getStripe } from "@/lib/server/stripe";
import { requirePresenter } from "@/lib/server/supabase-admin";

export const runtime = "nodejs";

export function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

export async function POST(request: Request) {
  try {
    const { admin, user } = await requirePresenter(request);
    const input = await request.json() as { entitlementId?: string };
    if (!input.entitlementId) return corsJson(request, { error: "Invalid request" }, { status: 400 });

    const { data: entitlement } = await admin.from("entitlements")
      .select("owner_id, source, stripe_payment_intent_id")
      .eq("id", input.entitlementId).maybeSingle();
    if (
      !entitlement
      || entitlement.owner_id !== user.id
      || entitlement.source !== "stripe"
      || !entitlement.stripe_payment_intent_id
    ) return corsJson(request, { error: "Receipt not found" }, { status: 404 });

    const paymentIntent = await getStripe().paymentIntents.retrieve(
      entitlement.stripe_payment_intent_id,
      { expand: ["latest_charge"] },
    );
    const charge = paymentIntent.latest_charge as Stripe.Charge | null;
    if (!charge?.receipt_url) return corsJson(request, { error: "Receipt not found" }, { status: 404 });
    return corsJson(request, { url: charge.receipt_url });
  } catch (error) {
    if (error instanceof Response) return new Response(error.body, { status: error.status, headers: corsHeaders(request) });
    return corsJson(request, { error: "Receipt could not be retrieved" }, { status: 502 });
  }
}
