"use client";

import { Flag, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { reportContent, resolveErrorMessage, type ReportReason } from "@layertalk/shared";

import { useLocale, useMessages } from "@/i18n/locale-context";
import { supabase } from "@/lib/supabase";

const REPORTED_KEY = "layertalk:reported";

/**
 * 「通報済み」は**端末のローカルにだけ**持つ。
 *
 * `content_reports` の SELECT は発表者しか通らない（誰が通報したかを観客に推測させない
 * ため）ので、サーバに聞き直すことはできない。消えても実害は「もう一度押せる」だけで、
 * DB 側は一意索引と `on conflict do nothing` が二重計上を弾く。
 */
export function readReported(): Set<string> {
  try {
    const raw = localStorage.getItem(REPORTED_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function rememberReported(id: string) {
  try {
    const next = readReported();
    next.add(id);
    localStorage.setItem(REPORTED_KEY, JSON.stringify([...next].slice(-200)));
  } catch {
    /* プライベートウィンドウ等。通報自体は通っているので黙って続ける。 */
  }
}

export type ReportTarget =
  | { commentId: string; stampId?: never }
  | { commentId?: never; stampId: string };

const REASONS: ReportReason[] = ["offensive", "harassment", "spam", "other"];

/**
 * 通報の理由を選ばせるシート。開閉は呼び出し側が持つ。
 *
 * コメントは行内のボタン（`ReportButton`）から、カスタムスタンプは長押しから開く
 * — スタンプのバーは 44px の丸ボタンが並ぶ横スクロールで、1つずつ通報ボタンを
 * 足すと押し間違いが増えるうえ、列が2倍の長さになる。
 */
export function ReportSheet({
  roomId,
  target,
  open,
  onClose,
  onReported,
}: {
  roomId: string;
  target: ReportTarget | null;
  open: boolean;
  onClose: () => void;
  onReported?: (id: string) => void;
}) {
  const t = useMessages();
  const locale = useLocale();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && target && !dialog.open) { setError(null); dialog.showModal(); }
    else if ((!open || !target) && dialog.open) dialog.close();
  }, [open, target]);

  const submit = async (reason: ReportReason) => {
    if (busy || !target) return;
    setBusy(true);
    setError(null);
    try {
      await reportContent(supabase, roomId, target, reason);
      const id = target.commentId ?? target.stampId;
      rememberReported(id);
      onReported?.(id);
      onClose();
    } catch (reportError) {
      setError(resolveErrorMessage(reportError, locale));
    } finally {
      setBusy(false);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="report-title"
      onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}
      onClick={(event) => { if (event.target === dialogRef.current && !busy) onClose(); }}
      className="lt-sheet border-border bg-bg-elev text-text m-0 mt-auto max-h-[92dvh] w-full max-w-none overflow-y-auto rounded-t-sheet border border-b-0 p-0"
    >
      <div className="p-5 pb-[max(20px,env(safe-area-inset-bottom))]">
        <h2 id="report-title" className="text-[16px] font-bold tracking-[-.02em]">{t.report.title}</h2>
        <p className="text-text-muted mt-2 text-[12px] leading-5">{t.report.body}</p>

        <div className="mt-4 grid gap-2">
          {REASONS.map((reason) => (
            <button
              key={reason}
              type="button"
              disabled={busy}
              onClick={() => void submit(reason)}
              className="lt-tap border-border min-h-11 rounded-control border px-3 text-left text-[13px] font-medium disabled:opacity-40"
            >
              {t.report.reasons[reason]}
            </button>
          ))}
        </div>

        {error && <p role="alert" className="text-like mt-3 text-[12px]">{error}</p>}

        <div className="mt-4 flex items-center justify-between gap-3">
          {/* 1.2 は「連絡先を公開していること」も求める。通報で解決しない場合の逃げ道。 */}
          <a href="/support" target="_blank" rel="noreferrer" className="text-brand text-[11px] font-semibold">
            {t.report.contact}
          </a>
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="text-text-muted flex items-center gap-1.5 text-[12px] font-semibold disabled:opacity-40"
          >
            {busy && <Loader2 size={13} className="animate-spin motion-reduce:animate-none" />}
            {t.report.cancel}
          </button>
        </div>
      </div>
    </dialog>
  );
}

/**
 * コメント1件ぶんの通報ボタン＋シート（App Store 1.2 の必須要件のひとつ）。
 *
 * **Event Pass を持たないルームでも必ず出すこと。** 通報を有料機能の内側に入れると、
 * 無料ルームが「フィルタも通報手段も無い UGC」になり 1.2 を全く満たさなくなる。
 */
export function ReportButton({ roomId, target }: { roomId: string; target: ReportTarget }) {
  const t = useMessages();
  const targetId = target.commentId ?? target.stampId;
  const [open, setOpen] = useState(false);
  /**
   * localStorage はサーバで読めないので遅延初期化する（`getClientId` と同じ形）。
   * この値は**描画に出る**が、ルームの UI はクライアントで room を解決してからしか
   * 出ないので SSR とはズレない。targetId は1インスタンスにつき不変。
   */
  const [reported, setReported] = useState(() => readReported().has(targetId));

  if (reported) {
    return (
      <span className="text-text-faint flex items-center gap-1 text-[11px]">
        <Flag size={11} />{t.report.done}
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t.report.open}
        title={t.report.open}
        className="text-text-faint hover:text-like flex items-center gap-1 text-[11px]"
      >
        <Flag size={11} />
      </button>
      <ReportSheet
        roomId={roomId}
        target={target}
        open={open}
        onClose={() => setOpen(false)}
        onReported={() => setReported(true)}
      />
    </>
  );
}
