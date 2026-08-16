import type { Metadata } from "next";

import { PublicShell } from "@/components/public/public-shell";
import { resolveCheckoutLandingState } from "@/lib/server/fulfillment";
import { privatePageRobots } from "@/lib/seo";

import { SuccessStatus } from "./success-status";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "購入状態 | LayerTalk", robots: privatePageRobots };

export default async function BillingSuccess({ searchParams }: { searchParams: Promise<{ session_id?: string }> }) {
  const { session_id: sessionId } = await searchParams;
  const status = sessionId ? await resolveCheckoutLandingState(sessionId) : "failed";
  return (
    <PublicShell><main className="flex flex-1 items-center justify-center px-4 py-14 sm:px-6"><SuccessStatus status={status} /></main></PublicShell>
  );
}
