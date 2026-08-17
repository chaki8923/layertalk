import { ExternalLink, Loader2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { Locale } from "@layertalk/shared";

import { openAudiencePage, startEventPassCheckout } from "../lib/billing";

type Props = {
  open: boolean;
  roomId: string;
  roomTitle: string | null;
  roomCode: string | null;
  locale: Locale;
  onClose: () => void;
};

const legalLinks = [
  ["返金・キャンセル", "Refunds and cancellation", "/support#refunds"],
  ["利用規約", "Terms", "/legal/terms"],
  ["プライバシー", "Privacy", "/legal/privacy"],
  ["特商法表記", "Commerce disclosure", "/legal/tokusho"],
] as const;

/**
 * 失敗を1文にする。
 *
 * ここを1本にまとめてしまうと、発表直前に何を直せばいいのか壇上で判断できない。
 * `status` が無い＝リクエストがそもそも飛んでいない（オフライン、CORS で弾かれた、
 * サインインしていない）ときだけ、接続を疑わせる文言に落とす。
 */
function checkoutMessage(error: unknown, ja: boolean): string {
  // `BillingError` の instanceof では見ない。形で見る（errors.ts と同じ理由）。
  const status = typeof error === "object" && error !== null
    && typeof (error as { status?: unknown }).status === "number"
    ? (error as { status: number }).status
    : undefined;
  const message = error instanceof Error ? error.message : "";
  if (status === 503 || message.includes("not available yet")) {
    return ja ? "Event Passの販売は現在準備中です。" : "Event Pass sales are not available yet.";
  }
  if (status === 401) {
    return ja
      ? "サインインの有効期限が切れました。サインインし直してください。"
      : "Your session expired. Please sign in again.";
  }
  if (status === 404) {
    return ja
      ? "このルームが見つかりません。ルームを作り直してから購入してください。"
      : "That room no longer exists. Create a new room, then buy the pass.";
  }
  if (status === 409) {
    return ja
      ? "このルームのEvent Passはすでに有効です。"
      : "This room already has an active Event Pass.";
  }
  if (status !== undefined) {
    return ja
      ? "購入画面を準備できませんでした。時間をおいてもう一度お試しください。"
      : "Could not prepare checkout. Please try again in a moment.";
  }
  return ja
    ? "購入画面を開けませんでした。接続を確認してもう一度お試しください。"
    : "Could not open checkout. Check your connection and try again.";
}

export function EventPassPurchaseSheet({ open, roomId, roomTitle, roomCode, locale, onClose }: Props) {
  const ja = locale === "ja";
  const dialogRef = useRef<HTMLDialogElement>(null);
  const attemptId = useRef<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      attemptId.current = crypto.randomUUID();
      setError(null);
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  const close = () => {
    if (busy) return;
    dialogRef.current?.close();
    attemptId.current = null;
    onClose();
  };

  const purchase = async () => {
    if (busy) return;
    const currentAttemptId = attemptId.current ?? crypto.randomUUID();
    attemptId.current = currentAttemptId;
    setBusy(true);
    setError(null);
    try {
      await startEventPassCheckout(roomId, currentAttemptId);
      dialogRef.current?.close();
      onClose();
    } catch (checkoutError) {
      setError(checkoutMessage(checkoutError, ja));
    } finally {
      setBusy(false);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="event-pass-purchase-title"
      onCancel={(event) => { event.preventDefault(); close(); }}
      onClick={(event) => { if (event.target === dialogRef.current) close(); }}
      className="event-pass-dialog border-border bg-bg-elev text-text m-0 mt-auto max-h-[92dvh] w-full max-w-none overflow-y-auto rounded-t-sheet border border-b-0 p-0 shadow-float"
    >
      <div className="p-5 pb-[max(20px,env(safe-area-inset-bottom))]">
        <div className="flex items-start justify-between gap-4">
          <div><p className="text-brand text-[10px] font-bold tracking-wider uppercase">LayerTalk Event Pass</p><h2 id="event-pass-purchase-title" className="mt-2 text-[18px] font-bold tracking-[-.025em]">{ja ? "このルーム用のEvent Passを購入します" : "Buy an Event Pass for this room"}</h2></div>
          <button type="button" onClick={close} disabled={busy} aria-label={ja ? "閉じる" : "Close"} className="lt-tap border-border text-text-muted flex h-8 w-8 shrink-0 items-center justify-center rounded-control border disabled:opacity-40"><X size={15} /></button>
        </div>

        <dl className="border-border mt-5 overflow-hidden rounded-card border text-[11px]">
          {[
            [ja ? "商品" : "Product", "LayerTalk Event Pass"],
            [ja ? "対象" : "Room", `${roomTitle || (ja ? "無題のルーム" : "Untitled room")}（${roomCode || "------"}）`],
            [ja ? "数量" : "Quantity", "1"],
            [ja ? "期間" : "Duration", ja ? "購入完了から7日間" : "Seven days after purchase"],
            [ja ? "提供時期" : "Availability", ja ? "決済確認後、通常は即時" : "Usually immediately after payment"],
            [ja ? "支払方法" : "Payment", ja ? "Stripe Checkoutに表示される方法" : "Methods shown by Stripe Checkout"],
          ].map(([term, description]) => <div key={term} className="border-border grid grid-cols-[5.5rem_1fr] gap-3 border-b px-3 py-2.5 last:border-b-0"><dt className="text-text-faint">{term}</dt><dd className="text-right font-semibold">{description}</dd></div>)}
        </dl>

        <div className="mt-5 flex items-end justify-between"><span className="text-text-muted text-[12px]">{ja ? "支払額" : "Total"}</span><p><span className="lt-num text-[26px] font-bold">¥2,980</span><span className="text-text-faint ml-1 text-[10px]">{ja ? "税込" : "tax included"}</span></p></div>
        <p className="text-text-muted mt-4 text-[11px] leading-5">{ja ? "決済確認後、このルームの承認制、NGワード、入室パスコード、レポート、ブランド設定が利用できるようになります。" : "After payment, moderation, blocked words, a passcode, reports, and branding become available in this room."}</p>

        <div className="mt-4 flex flex-wrap gap-x-3 gap-y-2">
          {legalLinks.map(([labelJa, labelEn, path]) => <button key={path} type="button" onClick={() => void openAudiencePage(path).catch(() => setError(ja ? "案内ページを開けませんでした。" : "Could not open the information page."))} className="text-brand flex items-center gap-1 text-[10px] font-semibold">{ja ? labelJa : labelEn}<ExternalLink size={10} /></button>)}
        </div>

        {error && <p role="alert" className="text-like mt-4 text-[11px] leading-5">{error}</p>}
        <div className="mt-5 grid gap-2">
          <button type="button" onClick={() => void purchase()} disabled={busy || !roomCode} className="lt-tap bg-brand flex min-h-12 items-center justify-center gap-2 rounded-control px-4 text-[12px] font-bold text-white disabled:opacity-40">{busy ? <><Loader2 size={15} className="animate-spin motion-reduce:animate-none" /><span className="sr-only">{ja ? "Stripe Checkoutを準備中" : "Preparing Stripe Checkout"}</span></> : ja ? "Stripeで2,980円を支払う" : "Pay ¥2,980 with Stripe"}</button>
          <button type="button" onClick={close} disabled={busy} className="lt-tap border-border min-h-10 rounded-control border text-[11px] font-bold disabled:opacity-40">{ja ? "戻る" : "Back"}</button>
        </div>
      </div>
    </dialog>
  );
}
