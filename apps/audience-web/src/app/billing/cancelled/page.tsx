import type { Metadata } from "next";
import Link from "next/link";
import { CircleSlash2 } from "lucide-react";

import { PublicShell } from "@/components/public/public-shell";

export const metadata: Metadata = { title: "購入は完了していません | LayerTalk" };

export default function BillingCancelled() {
  return (
    <PublicShell>
      <main className="flex flex-1 items-center justify-center px-4 py-14 sm:px-6">
        <div className="border-border bg-bg-elev shadow-card w-full max-w-xl rounded-sheet border p-6 text-center sm:p-9">
          <CircleSlash2 className="text-text-muted mx-auto" size={38} aria-hidden="true" />
          <h1 className="mt-5 text-[24px] font-bold tracking-[-.035em]">購入は完了していません</h1>
          <p className="text-text-muted mt-3 text-[13px] leading-6">料金は請求されていません。LayerTalkアプリへ戻ると、そのまま無料版を利用できます。</p>
          <p className="text-text-faint mt-3 text-[11px] leading-5">もう一度購入する場合は、アプリのEvent Passカードから再開してください。</p>
          <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row"><Link href="/event-pass" className="border-border hover:bg-surface-strong inline-flex min-h-11 items-center justify-center rounded-control border px-4 text-[12px] font-bold">Event Passについて</Link><Link href="/support" className="bg-brand inline-flex min-h-11 items-center justify-center rounded-control px-4 text-[12px] font-bold text-white">お問い合わせ</Link></div>
        </div>
      </main>
    </PublicShell>
  );
}
