import { Eye, EyeOff } from "lucide-react";
import { useMemo, useState } from "react";

import {
  resolveErrorMessage,
  type Comment,
  type Locale,
} from "@layertalk/shared";

type ModerationAction = "hide" | "restore" | "mark_answered" | "mark_open";

type Props = {
  comments: Comment[];
  locale: Locale;
  moderate: (commentId: string, action: ModerationAction) => Promise<Comment>;
  /** RPC の返却行を ControlWindow が持つ useComments へ即時反映する。 */
  onModerated: (comment: Comment) => void;
};

/** Event Pass 内に置く、承認状態を問わない直近コメントの履歴。 */
export function RecentComments({ comments, locale, moderate, onModerated }: Props) {
  const ja = locale === "ja";
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const recent = useMemo(
    () => [...comments]
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, 8),
    [comments],
  );

  if (recent.length === 0) return null;

  const run = async (comment: Comment, action: ModerationAction) => {
    if (busyIds.has(comment.id)) return;
    setBusyIds((current) => new Set(current).add(comment.id));
    setError(null);
    try {
      onModerated(await moderate(comment.id, action));
    } catch (err) {
      setError(resolveErrorMessage(err, locale));
    } finally {
      setBusyIds((current) => {
        const next = new Set(current);
        next.delete(comment.id);
        return next;
      });
    }
  };

  return (
    <div className="border-border border-t pt-4">
      <p className="text-[13px] font-bold">{ja ? "最近のコメント" : "Recent comments"}</p>
      <div className="mt-2 max-h-44 space-y-1.5 overflow-y-auto">
        {recent.map((comment) => {
          const busy = busyIds.has(comment.id);
          const hidden = comment.status === "hidden";
          const status = comment.status === "pending"
            ? { label: ja ? "承認待ち" : "Pending", className: "text-like bg-like/10" }
            : hidden
              ? { label: ja ? "非表示" : "Hidden", className: "text-text-faint bg-border/40" }
              : { label: ja ? "表示中" : "Visible", className: "text-online bg-online/10" };

          return (
            <div
              key={comment.id}
              aria-busy={busy}
              className={`bg-surface-strong rounded-[11px] px-2.5 py-2 ${hidden ? "opacity-70" : ""}`}
            >
              <div className="flex items-start gap-2">
                <p className="min-w-0 flex-1 text-[10px] leading-relaxed break-words">{comment.content}</p>
                {comment.is_question && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void run(comment, comment.question_status === "answered" ? "mark_open" : "mark_answered")}
                    className={`${comment.question_status === "answered" ? "text-online" : "text-text-faint"} lt-tap shrink-0 text-[9px] font-bold disabled:opacity-40`}
                  >
                    {comment.question_status === "answered"
                      ? (ja ? "回答済" : "Answered")
                      : (ja ? "未回答" : "Open")}
                  </button>
                )}
                <button
                  type="button"
                  disabled={busy}
                  aria-label={hidden ? (ja ? "表示する" : "Show") : (ja ? "非表示にする" : "Hide")}
                  onClick={() => void run(comment, hidden ? "restore" : "hide")}
                  className="text-text-faint hover:text-like lt-tap shrink-0 disabled:opacity-40"
                >
                  {hidden ? <Eye size={12} /> : <EyeOff size={12} />}
                </button>
              </div>
              <span className={`${status.className} mt-1 inline-flex rounded-full px-1.5 py-0.5 text-[8px] font-bold`}>
                {status.label}
              </span>
            </div>
          );
        })}
      </div>
      {error && <p role="alert" className="text-like mt-2 text-[10px]">{error}</p>}
    </div>
  );
}
