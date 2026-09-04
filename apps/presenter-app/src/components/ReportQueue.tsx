import { EyeOff, Flag, Loader2, Trash2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  deleteRoomStamp,
  fetchContentReports,
  moderateComment,
  resolveErrorMessage,
  roomStampUrl,
  type Comment,
  type ContentReport,
  type Locale,
  type RoomStamp,
} from "@layertalk/shared";

import { useMessages } from "../i18n";
import { supabase } from "../lib/supabase";

type Props = {
  roomId: string | null;
  locale: Locale;
  /** `useComments` が持つ全件（status 混在）。通報の対象を引くのに使う。 */
  comments: Comment[];
  stamps: RoomStamp[];
  onModerated: (comment: Comment) => void;
  onStampDeleted: (stampId: string) => void;
};

/** 同じ対象への通報はまとめて1行にする。件数は判断材料になるので残す。 */
type Grouped = {
  key: string;
  commentId: string | null;
  stampId: string | null;
  count: number;
  reasons: ContentReport["reason"][];
};

/**
 * 観客から届いた通報（App Store 1.2）。
 *
 * **`has_paid_room_features` に依存させないこと。** 通報の受け取りと表示は無料ルームでも
 * 動く（`content_reports` の SELECT は `is_room_operator` だけを見ている）。
 * 一方で「非表示にする」= `moderate_comment` は Event Pass の機能なので、そこだけ落ちる。
 * 落ちたときは黙らず `needsPass` を出す — 罠 #16 の「画面は成功・DB は無反応」を作らない。
 * カスタムスタンプの削除は課金と無関係に通るので、無料でも必ず消せる。
 */
export function ReportQueue({ roomId, locale, comments, stamps, onModerated, onStampDeleted }: Props) {
  const t = useMessages(locale);
  const [reports, setReports] = useState<ContentReport[]>([]);
  const [busyKeys, setBusyKeys] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!roomId) { setReports([]); return; }
    void fetchContentReports(supabase, roomId).then(setReports).catch(() => {
      // 通報が読めないだけで壇上の操作を止めない。次の INSERT か再取得で復帰する。
    });
  }, [roomId]);

  useEffect(() => {
    if (!roomId) return;
    load();
    const channel = supabase.channel(`reports:${roomId}`).on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "content_reports", filter: `room_id=eq.${roomId}` },
      (payload) => setReports((prev) => {
        const row = payload.new as ContentReport;
        return prev.some((report) => report.id === row.id) ? prev : [row, ...prev];
      }),
    ).subscribe();

    // 罠 #3: SUBSCRIBED からレプリケーションのフィルタが効くまで 1〜2 秒ある。
    // `useComments` と同じく購読直後にもう一度取り直して取りこぼしを回収する。
    const recovery = window.setTimeout(load, 2500);
    return () => {
      window.clearTimeout(recovery);
      void supabase.removeChannel(channel);
    };
  }, [roomId, load]);

  const commentsById = useMemo(() => new Map(comments.map((comment) => [comment.id, comment])), [comments]);
  const stampsById = useMemo(() => new Map(stamps.map((stamp) => [stamp.id, stamp])), [stamps]);

  const grouped = useMemo<Grouped[]>(() => {
    const byTarget = new Map<string, Grouped>();
    for (const report of reports) {
      // 既に非表示にしたコメントは片付いたものとして出さない。
      const comment = report.comment_id ? commentsById.get(report.comment_id) : null;
      if (report.comment_id && comment?.status === "hidden") continue;
      // 削除済みのスタンプは行ごと cascade で消えるが、手元の一覧が先に古くなることがある。
      if (report.room_stamp_id && !stampsById.has(report.room_stamp_id)) continue;

      const key = report.comment_id ?? report.room_stamp_id ?? report.id;
      const existing = byTarget.get(key);
      if (existing) {
        existing.count += 1;
        if (!existing.reasons.includes(report.reason)) existing.reasons.push(report.reason);
        continue;
      }
      byTarget.set(key, {
        key,
        commentId: report.comment_id,
        stampId: report.room_stamp_id,
        count: 1,
        reasons: [report.reason],
      });
    }
    return [...byTarget.values()];
  }, [reports, commentsById, stampsById]);

  /**
   * `hint` は「この操作が落ちる一番ありそうな理由」。非表示は Event Pass を要求するので
   * `needsPass` を添える。スタンプの削除は課金と無関係に通るはずなので、素の理由だけ出す
   * — ここを一緒くたにすると、通信断を「課金してください」と誤って案内することになる。
   */
  const runAction = async (key: string, action: () => Promise<void>, hint?: string) => {
    if (busyKeys.has(key)) return;
    setBusyKeys((current) => new Set(current).add(key));
    setError(null);
    try {
      await action();
    } catch (err) {
      const message = resolveErrorMessage(err, locale);
      setError(hint ? `${message}｜${hint}` : message);
    } finally {
      setBusyKeys((current) => {
        const next = new Set(current);
        next.delete(key);
        return next;
      });
    }
  };

  if (!roomId || grouped.length === 0) return null;

  return (
    <section className="border-like/35 bg-like/8 space-y-2.5 rounded-[18px] border p-3">
      <p className="text-like flex items-center gap-1.5 text-[12px] font-bold">
        <Flag size={14} />
        {t.reports.title(grouped.length)}
      </p>

      <div className="max-h-64 space-y-2 overflow-y-auto">
        {grouped.map((group) => {
          const busy = busyKeys.has(group.key);
          const comment = group.commentId ? commentsById.get(group.commentId) : null;
          const stamp = group.stampId ? stampsById.get(group.stampId) : null;
          return (
            <div key={group.key} className="bg-bg-elev rounded-[14px] p-2.5">
              <div className="flex flex-wrap items-center gap-1.5">
                {group.reasons.map((reason) => (
                  <span key={reason} className="bg-like/15 text-like rounded-chip px-1.5 py-0.5 text-[9px] font-bold">
                    {t.reports.reason[reason]}
                  </span>
                ))}
                {group.count > 1 && <span className="text-text-faint lt-num text-[10px]">×{group.count}</span>}
              </div>

              {comment && (
                // 140文字まで来るので省略しない。判断材料を削らない。
                <p className="mt-1.5 text-[12px] leading-relaxed break-words">{comment.content}</p>
              )}
              {stamp && (
                <div className="mt-1.5 flex items-center gap-2">
                  <img src={roomStampUrl(supabase, stamp.path)} alt="" className="h-9 w-9 rounded-[8px] object-contain" />
                  <span className="text-text-muted text-[11px]">{t.reports.stampTarget}</span>
                </div>
              )}
              {!comment && !stamp && <p className="text-text-faint mt-1.5 text-[11px]">{t.reports.missingTarget}</p>}

              <div className="mt-2 flex gap-2">
                {comment && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void runAction(group.key, async () => {
                      onModerated(await moderateComment(supabase, comment.id, "hide"));
                    }, t.reports.needsPass)}
                    className="lt-tap border-border text-text-muted flex flex-1 items-center justify-center gap-1 rounded-[11px] border px-3 py-1.5 text-[11px] font-bold disabled:opacity-40"
                  >
                    {busy ? <Loader2 size={12} className="animate-spin" /> : <EyeOff size={12} />}
                    {t.approval.hide}
                  </button>
                )}
                {stamp && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void runAction(group.key, async () => {
                      await deleteRoomStamp(supabase, stamp);
                      onStampDeleted(stamp.id);
                    })}
                    className="lt-tap border-border text-like flex flex-1 items-center justify-center gap-1 rounded-[11px] border px-3 py-1.5 text-[11px] font-bold disabled:opacity-40"
                  >
                    {busy ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                    {t.customStamp.delete}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {error && <p className="text-like text-[11px]">{error}</p>}
    </section>
  );
}
