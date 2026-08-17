import { corsHeaders, corsJson } from "@/lib/server/cors";
import { serverEnv } from "@/lib/server/env";
import { requirePresenter } from "@/lib/server/supabase-admin";
import { getStripe, randomIntegrationIdentifier } from "@/lib/server/stripe";

export const runtime = "nodejs";

export function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

export async function POST(request: Request) {
  // 失敗したときに作りかけの attempt を片付けるので、catch からも見える位置に置く。
  let admin: Awaited<ReturnType<typeof requirePresenter>>["admin"] | undefined;
  let attemptId: string | undefined;
  try {
    if (!serverEnv.billingPublicationEnabled()) {
      return corsJson(request, { error: "Event Pass sales are not available yet" }, { status: 503 });
    }
    const presenter = await requirePresenter(request);
    admin = presenter.admin;
    const user = presenter.user;
    const input = await request.json() as { roomId?: string; attemptId?: string };
    if (!input.roomId || !input.attemptId) return corsJson(request, { error: "Invalid request" }, { status: 400 });

    const { data: room } = await admin.from("rooms").select("id, owner_id").eq("id", input.roomId).maybeSingle();
    if (!room || room.owner_id !== user.id) return corsJson(request, { error: "Room not found" }, { status: 404 });

    const now = new Date().toISOString();
    const { data: entitlement } = await admin.from("entitlements").select("id")
      .eq("room_id", room.id).eq("status", "active").gt("expires_at", now).maybeSingle();
    if (entitlement) return corsJson(request, { error: "Event Pass is already active" }, { status: 409 });

    const { data: existing } = await admin.from("checkout_attempts").select("*").eq("id", input.attemptId).maybeSingle();
    // Postgres は `...+00:00`、`toISOString()` は `...Z` を返すので文字列比較は成立しない
    // （`+` が `.` より前に並ぶため常に偽になり、この再利用経路が丸ごと死ぬ）。時刻として比べる。
    if (existing?.status === "open" && existing.checkout_url && existing.expires_at
      && Date.parse(existing.expires_at) > Date.now()) {
      return corsJson(request, { url: existing.checkout_url });
    }

    attemptId = input.attemptId;
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
      consent_collection: { terms_of_service: "required" },
      custom_text: {
        submit: {
          message: "購入完了後、このルームでEvent Passが7日間有効になります。返金条件はリンク先をご確認ください。",
        },
      },
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
    // 画面には定数しか返さないので、ここで残さないと原因が完全に消える
    // （環境変数の不足なのか Stripe API の拒否なのかが分からなくなる）。
    console.error("[billing/checkout]", error);
    if (admin && attemptId) {
      await admin.from("checkout_attempts")
        .update({ status: "failed", updated_at: new Date().toISOString() })
        .eq("id", attemptId);
    }
    return corsJson(request, { error: "Checkout could not be started" }, { status: 500 });
  }
}
