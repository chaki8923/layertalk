import { corsHeaders, corsJson } from "@/lib/server/cors";
import { serverEnv } from "@/lib/server/env";
import { requirePresenter } from "@/lib/server/supabase-admin";

export const runtime = "nodejs";

export function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

export async function POST(request: Request) {
  try {
    const { admin, user } = await requirePresenter(request);
    const input = await request.json() as { roomId?: string; attemptId?: string };
    if (!input.roomId || !input.attemptId
      || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(input.attemptId)) {
      return corsJson(request, { error: "Invalid request" }, { status: 400 });
    }

    const { data: room } = await admin.from("rooms").select("id, owner_id")
      .eq("id", input.roomId).maybeSingle();
    if (!room || room.owner_id !== user.id) {
      return corsJson(request, { error: "Room not found" }, { status: 404 });
    }
    const { data: active } = await admin.from("entitlements").select("id")
      .eq("room_id", room.id).eq("status", "active")
      .gt("expires_at", new Date().toISOString()).limit(1).maybeSingle();
    if (active) return corsJson(request, { error: "Event Pass is already active" }, { status: 409 });

    const { data: existing, error: existingError } = await admin
      .from("app_store_purchase_attempts").select("*").eq("id", input.attemptId).maybeSingle();
    if (existingError) throw existingError;
    if (existing) {
      if (existing.owner_id !== user.id || existing.room_id !== room.id
        || existing.product_id !== serverEnv.appleEventPassProductId()) {
        return corsJson(request, { error: "Purchase attempt conflict" }, { status: 409 });
      }
      return corsJson(request, { attemptId: existing.id, productId: existing.product_id });
    }

    const { data: attempt, error } = await admin.from("app_store_purchase_attempts").insert({
      id: input.attemptId,
      owner_id: user.id,
      room_id: room.id,
      product_id: serverEnv.appleEventPassProductId(),
      status: "created",
    }).select("id, product_id").single();
    if (error) throw error;
    return corsJson(request, { attemptId: attempt.id, productId: attempt.product_id });
  } catch (error) {
    if (error instanceof Response) {
      return new Response(error.body, { status: error.status, headers: corsHeaders(request) });
    }
    console.error("[billing/app-store/attempt]", error);
    return corsJson(request, { error: "Purchase could not be prepared" }, { status: 500 });
  }
}
