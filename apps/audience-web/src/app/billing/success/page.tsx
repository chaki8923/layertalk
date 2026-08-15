import { CheckCircle2 } from "lucide-react";

import { fulfillCheckoutSession } from "@/lib/server/fulfillment";

export const dynamic = "force-dynamic";

export default async function BillingSuccess({ searchParams }: { searchParams: Promise<{ session_id?: string }> }) {
  const { session_id: sessionId } = await searchParams;
  let ready = false;
  if (sessionId) {
    try {
      ready = Boolean(await fulfillCheckoutSession(sessionId, {
        id: `checkout_landing_${sessionId}`,
        type: "checkout.landing.fulfillment",
        livemode: !sessionId.startsWith("cs_test_"),
        apiVersion: "2026-06-24.dahlia",
      }));
    } catch {
      ready = false;
    }
  }
  return (
    <main className="flex min-h-dvh items-center justify-center px-6">
      <div className="lt-glass w-full max-w-md rounded-[28px] p-8 text-center">
        <CheckCircle2 className="text-online mx-auto" size={36} />
        <h1 className="mt-4 text-[24px] font-bold">{ready ? "Event Passを有効にしました" : "支払いを確認しています"}</h1>
        <p className="text-text-muted mt-3 text-[14px] leading-relaxed">
          LayerTalkアプリへ戻ってください。購入状態は自動的に更新されます。
        </p>
      </div>
    </main>
  );
}
