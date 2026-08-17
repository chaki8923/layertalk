import { Check, EyeOff, ShieldAlert } from "lucide-react";
import { useState } from "react";

import {
  moderateComment,
  resolveErrorMessage,
  type Comment,
  type Locale,
} from "@layertalk/shared";

import { useMessages } from "../i18n";
import { supabase } from "../lib/supabase";

type Props = {
  /** ControlWindow が持つ全件（status 混在）。絞り込みはここでやる。 */
  comments: Comment[];
  locale: Locale;
  /** 承認・非表示の結果を手元のリストに即座に反映する（useComments の upsertLocal）。 */
  onModerated: (comment: Comment) => void;
};

/**
 * 承認待ちのコメントを捌くキュー。
 *
 * **コントロール窓のいちばん上に置く。** 壇上では ⇧⌘L で呼び出した1〜2秒で捌く必要があり、
 * Event Pass のパネルまでスクロールさせると間に合わない。
 *
 * 有効な Event Pass が無いと `post_comment` が `pending` を書かないので、
 * 「pending が1件でもある」＝「有料機能が生きている」。entitlement は見なくてよい。
 */
export function PendingApprovalQueue({ comments, locale, onModerated }: Props) {
  const t = useMessages(locale);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  // useComments は新しい順に返す。捌くのは届いた順なので反転する。
  const pending = comments.filter((comment) => comment.status === "pending").reverse();
  if (pending.length === 0) return null;

  const decide = async (comment: Comment, action: "approve" | "hide") => {
    if (busyIds.has(comment.id)) return;
    setBusyIds((current) => new Set(current).add(comment.id));
    setError(null);
    try {
      onModerated(await moderateComment(supabase, comment.id, action));
    } catch (err) {
      // 期限切れ（active Event Pass required）もここに来る。無反応にしないこと。
      setError(resolveErrorMessage(err, locale) || t.approval.failed);
    } finally {
      setBusyIds((current) => {
        const next = new Set(current);
        next.delete(comment.id);
        return next;
      });
    }
  };

  return (
    <section className="border-like/35 bg-like/8 space-y-2.5 rounded-[18px] border p-3">
      <p className="text-like flex items-center gap-1.5 text-[12px] font-bold">
        <ShieldAlert size={14} />
        {t.approval.title(pending.length)}
      </p>

      <div className="max-h-64 space-y-2 overflow-y-auto">
        {pending.map((comment) => {
          const busy = busyIds.has(comment.id);
          return (
            <div key={comment.id} className="bg-bg-elev rounded-[14px] p-2.5">
              {comment.is_question && (
                <span className="text-brand text-[9px] font-bold tracking-wider uppercase">
                  {t.approval.question}
                </span>
              )}
              {/* 140文字まで来るので省略しない。判断材料を削らない。 */}
              <p className="text-[12px] leading-relaxed break-words">{comment.content}</p>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void decide(comment, "approve")}
                  className="lt-tap bg-online/15 text-online flex flex-1 items-center justify-center gap-1 rounded-[11px] px-3 py-1.5 text-[11px] font-bold disabled:opacity-40"
                >
                  <Check size={12} />
                  {t.approval.approve}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void decide(comment, "hide")}
                  className="lt-tap border-border text-text-muted flex flex-1 items-center justify-center gap-1 rounded-[11px] border px-3 py-1.5 text-[11px] font-bold disabled:opacity-40"
                >
                  <EyeOff size={12} />
                  {t.approval.hide}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {error && <p className="text-like text-[11px]">{error}</p>}
    </section>
  );
}
