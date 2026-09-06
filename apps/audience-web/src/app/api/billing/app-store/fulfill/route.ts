import { fulfillAppStoreTransaction } from "@/lib/server/app-store";
import { corsHeaders, corsJson } from "@/lib/server/cors";
import { requirePresenter } from "@/lib/server/supabase-admin";

export const runtime = "nodejs";

export function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}

export async function POST(request: Request) {
  try {
    const { user } = await requirePresenter(request);
    const input = await request.json() as { signedTransaction?: string };
    if (!input.signedTransaction || input.signedTransaction.length > 64_000) {
      return corsJson(request, { error: "Invalid transaction" }, { status: 400 });
    }
    const result = await fulfillAppStoreTransaction(input.signedTransaction, user.id);
    return corsJson(request, result);
  } catch (error) {
    if (error instanceof Response) {
      return new Response(error.body, { status: error.status, headers: corsHeaders(request) });
    }
    console.error("[billing/app-store/fulfill]", error);
    return corsJson(request, { error: "Purchase could not be verified" }, { status: 400 });
  }
}
