import { corsHeaders, corsJson } from "@/lib/server/cors";
import { serverEnv } from "@/lib/server/env";
import { requirePresenter } from "@/lib/server/supabase-admin";
import { getStripe, randomIntegrationIdentifier } from "@/lib/server/stripe";

export const runtime = "nodejs";

export function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

export async function POST(request: Request) {
  try {
    const { admin, user } = await requirePresenter(request);
    const input = await request.json() as { roomId?: string; attemptId?: string };
    if (!input.roomId || !input.attemptId) return corsJson(request, { error: "Invalid request" }, { status: 400 });

    const { data: room } = await admin.from("rooms").select("id, owner_id").eq("id", input.roomId).maybeSingle();
    if (!room || room.owner_id !== user.id) return corsJson(request, { error: "Room not found" }, { status: 404 });

    const now = new Date().toISOString();
    const { data: entitlement } = await admin.from("entitlements").select("id")
      .eq("room_id", room.id).eq("status", "active").gt("expires_at", now).maybeSingle();
    if (entitlement) return corsJson(request, { error: "Event Pass is already active" }, { status: 409 });

    const { data: existing } = await admin.from("checkout_attempts").select("*").eq("id", input.attemptId).maybeSingle();
    if (existing?.status === "open" && existing.checkout_url && existing.expires_at && existing.expires_at > now) {
      return corsJson(request, { url: existing.checkout_url });
    }

    await admin.from("checkout_attempts").upsert({ id: input.attemptId, owner_id: user.id, room_id: room.id, status: "creating" });
    const { data: profile } = await admin.from("presenter_profiles").select("stripe_customer_id").eq("id", user.id).maybeSingle();
    const stripe = getStripe();
    const appUrl = serverEnv.appUrl().replace(/\/$/, "");
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{ price: serverEnv.stripeEventPassPriceId(), quantity: 1 }],
      ...(profile?.stripe_customer_id
        ? { customer: profile.stripe_customer_id }
        : { customer_creation: "always" as const, customer_email: user.email }),
      client_reference_id: input.attemptId,
      metadata: { owner_id: user.id, room_id: room.id, attempt_id: input.attemptId, product: "event_pass" },
      success_url: `${appUrl}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${appUrl}/billing/cancelled`,
      integration_identifier: randomIntegrationIdentifier(),
    }, { idempotencyKey: `event-pass-${input.attemptId}` });
    if (!session.url) throw new Error("Stripe did not return a Checkout URL");
    await admin.from("checkout_attempts").update({
      stripe_checkout_session_id: session.id,
      checkout_url: session.url,
      status: "open",
      expires_at: new Date(session.expires_at * 1000).toISOString(),
      updated_at: new Date().toISOString(),
    }).eq("id", input.attemptId);
    return corsJson(request, { url: session.url });
  } catch (error) {
    if (error instanceof Response) return new Response(error.body, { status: error.status, headers: corsHeaders(request) });
    return corsJson(request, { error: "Checkout could not be started" }, { status: 500 });
  }
}
