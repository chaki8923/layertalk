"use client";

import { AlertCircle, CheckCircle2, Clock3, Loader2, RotateCw } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";

import { PhraseText, ProtectedText } from "@/components/public/phrase-text";
import type { CheckoutLandingState } from "@/lib/server/fulfillment";

const MAX_AUTOMATIC_CHECKS = 6;

export function SuccessStatus({ status }: { status: CheckoutLandingState }) {
  const router = useRouter();
  const [checks, setChecks] = useState(0);
  const [refreshing, startTransition] = useTransition();

  useEffect(() => {
    if (status !== "processing" || checks >= MAX_AUTOMATIC_CHECKS) return;
    const timer = window.setTimeout(() => {
      setChecks((current) => current + 1);
      startTransition(() => router.refresh());
    }, 10_000);
    return () => window.clearTimeout(timer);
  }, [checks, router, status]);

  const delayed = status === "processing" && checks >= MAX_AUTOMATIC_CHECKS;
  const content = status === "ready"
    ? { icon: <CheckCircle2 className="text-online" size={38} />, title: ["Event Passを", "有効にしました"], body: "LayerTalkアプリへ戻ると、購入したルームの状態が自動的に更新されます。" }
    : status === "failed"
      ? { icon: <AlertCircle className="text-like" size={38} />, title: ["購入状態を", "確認できませんでした"], body: "URLが無効か、決済の確認に問題が発生しました。再購入せず、サポートへお問い合わせください。" }
      : delayed
        ? { icon: <Clock3 className="text-brand" size={38} />, title: ["確認に時間が", "かかっています"], body: "決済方法によっては反映まで時間がかかります。購入をやり直さず、後ほど再確認してください。" }
        : { icon: <Loader2 className="text-brand animate-spin motion-reduce:animate-none" size={38} />, title: ["支払いを", "確認しています"], body: "決済情報とEvent Passの有効化を確認しています。このページを閉じずにお待ちください。" };

  const refresh = () => startTransition(() => router.refresh());

  return (
    <div className="border-border bg-bg-elev shadow-card w-full max-w-xl rounded-sheet border p-6 text-center sm:p-9" aria-live="polite">
      <div className="flex justify-center">{content.icon}</div>
      <h1 className="mt-5 text-[24px] font-bold tracking-[-.035em]"><PhraseText phrases={content.title} /></h1>
      <p className="text-text-muted mx-auto mt-3 max-w-md text-[13px] leading-6"><ProtectedText text={content.body} terms={["LayerTalkアプリ"]} /></p>
      {status !== "failed" && <div className="border-border bg-surface mt-6 rounded-card border p-4 text-left"><p className="lt-nowrap text-[12px] font-bold">LayerTalkアプリへ戻る</p><p className="text-text-muted mt-1 text-[11px] leading-5"><ProtectedText text="アプリのウィンドウを開くと購入状態を再取得します。現在はブラウザからアプリを直接開くリンクには対応していません。" terms={["購入状態", "直接開くリンク"]} /></p></div>}
      <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
        {status !== "ready" && <button type="button" onClick={refresh} disabled={refreshing} className="lt-tap lt-nowrap border-border hover:bg-surface-strong inline-flex min-h-11 items-center justify-center gap-2 rounded-control border px-4 text-[12px] font-bold disabled:opacity-50"><RotateCw size={14} className={refreshing ? "animate-spin" : ""} />購入状態を再確認</button>}
        <Link href="/support" className="lt-tap lt-nowrap bg-brand inline-flex min-h-11 items-center justify-center rounded-control px-4 text-[12px] font-bold text-white">お問い合わせ</Link>
      </div>
    </div>
  );
}
