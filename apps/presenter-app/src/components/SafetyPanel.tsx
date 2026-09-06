import { Ban, Loader2, Plus, Shield, Trash2, Undo2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  banRoomParticipant,
  fetchRoomParticipantBlocks,
  LayerTalkError,
  resolveErrorMessage,
  unblockRoomParticipant,
  type Comment,
  type Locale,
  type ModerationTerm,
  type RoomParticipantBlock,
} from "@layertalk/shared";

import { supabase } from "../lib/supabase";

export const PARTICIPANT_BLOCKED_EVENT = "layertalk:participant-blocked";

type Props = {
  roomId: string;
  locale: Locale;
  comments: Comment[];
  onCommentBlocked: (comment: Comment) => void;
};

/** App Review 1.2 の基礎安全機能。Event Pass の有無に関係なく常に操作できる。 */
export function SafetyPanel({ roomId, locale, comments, onCommentBlocked }: Props) {
  const ja = locale === "ja";
  const [terms, setTerms] = useState<ModerationTerm[]>([]);
  const [blocks, setBlocks] = useState<RoomParticipantBlock[]>([]);
  const [newTerm, setNewTerm] = useState("");
  const [termMode, setTermMode] = useState<"contains" | "exact">("contains");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [termResult, nextBlocks] = await Promise.all([
      supabase.from("moderation_terms").select("*").eq("room_id", roomId).order("created_at"),
      fetchRoomParticipantBlocks(supabase, roomId),
    ]);
    if (termResult.error) throw new LayerTalkError("moderation_failed", termResult.error.message);
    setTerms(termResult.data ?? []);
    setBlocks(nextBlocks);
  }, [roomId]);

  useEffect(() => {
    void load().catch((err) => setError(resolveErrorMessage(err, locale)));
    const refresh = () => void load().catch(() => undefined);
    window.addEventListener("focus", refresh);
    window.addEventListener(PARTICIPANT_BLOCKED_EVENT, refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      window.removeEventListener(PARTICIPANT_BLOCKED_EVENT, refresh);
    };
  }, [load, locale]);

  const recent = useMemo(() => [...comments]
    .filter((comment) => comment.status !== "hidden")
    .sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 8), [comments]);

  const addTerm = async () => {
    const term = newTerm.trim();
    if (!term || busy) return;
    setBusy("term"); setError(null);
    const { data, error: insertError } = await supabase.from("moderation_terms")
      .insert({ room_id: roomId, term, match_mode: termMode }).select().single();
    setBusy(null);
    if (insertError) { setError(resolveErrorMessage(new LayerTalkError("moderation_failed", insertError.message), locale)); return; }
    if (data) setTerms((current) => [...current, data]);
    setNewTerm("");
  };

  const blockComment = async (comment: Comment) => {
    if (busy) return;
    setBusy(comment.id); setError(null);
    try {
      await banRoomParticipant(supabase, roomId, { commentId: comment.id }, "operator_block");
      onCommentBlocked({
        ...comment,
        status_before_hidden: comment.status === "hidden"
          ? comment.status_before_hidden
          : comment.status,
        status: "hidden",
      });
      window.dispatchEvent(new Event(PARTICIPANT_BLOCKED_EVENT));
    } catch (err) { setError(resolveErrorMessage(err, locale)); }
    finally { setBusy(null); }
  };

  return (
    <section className="space-y-3">
      <p className="text-text-faint flex items-center gap-1.5 text-[11px] font-bold tracking-wider uppercase">
        <Shield size={13} />{ja ? "安全管理（無料）" : "Safety controls (free)"}
      </p>
      <div className="border-border bg-bg-elev space-y-4 rounded-[20px] border p-4">
        <div>
          <p className="text-[13px] font-bold">{ja ? "NGワード" : "Blocked words"}</p>
          <p className="text-text-faint mt-1 text-[10px] leading-relaxed">
            {ja ? "一致するコメントは保存・表示される前に拒否します。" : "Matching comments are rejected before they are saved or shown."}
          </p>
          <div className="mt-2 flex gap-2">
            <input value={newTerm} maxLength={60} onChange={(event) => setNewTerm(event.target.value)} className="border-border min-w-0 flex-1 rounded-[12px] border bg-transparent px-3 py-2 text-[12px] outline-none" />
            <select aria-label={ja ? "一致方法" : "Match mode"} value={termMode} onChange={(event) => setTermMode(event.target.value as "contains" | "exact")} className="border-border rounded-[12px] border bg-transparent px-2 text-[10px] outline-none">
              <option value="contains">{ja ? "部分" : "Contains"}</option>
              <option value="exact">{ja ? "完全" : "Exact"}</option>
            </select>
            <button type="button" aria-label={ja ? "追加" : "Add"} disabled={!newTerm.trim() || busy === "term"} onClick={() => void addTerm()} className="border-border rounded-[12px] border px-3 disabled:opacity-40">
              {busy === "term" ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            </button>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {terms.map((term) => <button key={term.id} type="button" onClick={() => {
              setError(null);
              void supabase.from("moderation_terms").delete().eq("id", term.id).then(({ error: deleteError }) => {
                if (deleteError) { setError(resolveErrorMessage(new LayerTalkError("moderation_failed", deleteError.message), locale)); return; }
                setTerms((current) => current.filter((item) => item.id !== term.id));
              });
            }} className="bg-surface-strong text-text-muted flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px]">{term.term}<Trash2 size={10} /></button>)}
          </div>
        </div>

        {recent.length > 0 && <div className="border-border border-t pt-4">
          <p className="text-[13px] font-bold">{ja ? "最近の参加者をブロック" : "Block a recent participant"}</p>
          <div className="mt-2 max-h-44 space-y-1.5 overflow-y-auto">
            {recent.map((comment) => <div key={comment.id} className="bg-surface-strong flex items-start gap-2 rounded-[11px] px-2.5 py-2">
              <p className="min-w-0 flex-1 text-[10px] leading-relaxed break-words">{comment.content}</p>
              <button type="button" disabled={Boolean(busy)} onClick={() => void blockComment(comment)} className="text-like lt-tap flex shrink-0 items-center gap-1 text-[9px] font-bold disabled:opacity-40">
                {busy === comment.id ? <Loader2 size={11} className="animate-spin" /> : <Ban size={11} />}
                {ja ? "非表示＋ブロック" : "Hide & block"}
              </button>
            </div>)}
          </div>
        </div>}

        <div className="border-border border-t pt-4">
          <p className="text-[13px] font-bold">{ja ? `ブロック中（${blocks.length}）` : `Blocked (${blocks.length})`}</p>
          {blocks.length === 0 ? <p className="text-text-faint mt-1 text-[10px]">{ja ? "ブロック中の参加者はいません。" : "No participants are blocked."}</p> : (
            <div className="mt-2 max-h-32 space-y-1.5 overflow-y-auto">
              {blocks.map((block) => <div key={block.user_id} className="bg-surface-strong flex items-center gap-2 rounded-[11px] px-2.5 py-2">
                <span className="text-text-faint lt-num min-w-0 flex-1 truncate text-[9px]">{block.user_id}</span>
                <button type="button" disabled={Boolean(busy)} onClick={() => {
                  setBusy(block.user_id); setError(null);
                  void unblockRoomParticipant(supabase, roomId, block.user_id)
                    .then(() => setBlocks((current) => current.filter((item) => item.user_id !== block.user_id)))
                    .catch((err) => setError(resolveErrorMessage(err, locale)))
                    .finally(() => setBusy(null));
                }} className="text-text-muted lt-tap flex shrink-0 items-center gap-1 text-[9px] font-bold disabled:opacity-40">
                  {busy === block.user_id ? <Loader2 size={11} className="animate-spin" /> : <Undo2 size={11} />}
                  {ja ? "解除" : "Unblock"}
                </button>
              </div>)}
            </div>
          )}
        </div>
        {error && <p role="alert" className="text-like text-[10px]">{error}</p>}
      </div>
    </section>
  );
}
