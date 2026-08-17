import { importPKCS8, SignJWT } from "jose";

import { EVENT_PASS_FEATURES } from "@layertalk/shared";
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
    const { roomId } = await request.json() as { roomId?: string };
    if (!roomId) return corsJson(request, { error: "Invalid request" }, { status: 400 });
    const { data: activeEntitlement } = await admin.from("entitlements").select("*")
      .eq("room_id", roomId).eq("owner_id", user.id).eq("status", "active")
      .gt("expires_at", new Date().toISOString()).order("expires_at", { ascending: false }).limit(1).maybeSingle();
    let entitlement = activeEntitlement;
    let leaseExpiresAt = entitlement?.expires_at;
    if (!entitlement) {
      const { data: liveSession } = await admin.from("presentation_sessions")
        .select("entitlement_id, entitlement_snapshot").eq("room_id", roomId).eq("owner_id", user.id)
        .is("ended_at", null).contains("entitlement_snapshot", { paid: true }).limit(1).maybeSingle();
      if (liveSession?.entitlement_id) {
        const result = await admin.from("entitlements").select("*").eq("id", liveSession.entitlement_id).maybeSingle();
        entitlement = result.data;
        // The database session snapshot remains authoritative. This signed
        // lease only keeps the local UI stable during a temporary outage.
        leaseExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      }
    }
    if (!entitlement) return corsJson(request, { entitlement: null }, { status: 404 });
    const key = await importPKCS8(serverEnv.entitlementPrivateKey(), "EdDSA");
    const claims = {
      roomId,
      entitlementId: entitlement.id,
      features: [...EVENT_PASS_FEATURES],
      startsAt: entitlement.starts_at,
      expiresAt: leaseExpiresAt ?? entitlement.expires_at,
      historyExpiresAt: entitlement.history_expires_at,
    };
    const token = await new SignJWT(claims).setProtectedHeader({ alg: "EdDSA", kid: serverEnv.entitlementKeyId() })
      .setSubject(user.id).setIssuedAt().setExpirationTime(Math.floor(new Date(claims.expiresAt).getTime() / 1000)).sign(key);
    return corsJson(request, { token, claims: { ...claims, sub: user.id } });
  } catch (error) {
    if (error instanceof Response) return new Response(error.body, { status: error.status, headers: corsHeaders(request) });
    console.error("[billing/entitlement]", error);
    return corsJson(request, { error: "Entitlement could not be issued" }, { status: 500 });
  }
}
