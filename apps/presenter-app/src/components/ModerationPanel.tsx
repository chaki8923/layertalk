import { Plus, ShieldCheck, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import {
  LayerTalkError,
  moderateComment,
  resolveErrorMessage,
  type Comment,
  type Locale,
  type ModerationTerm,
} from "@layertalk/shared";

import { RecentComments } from "./RecentComments";
import { supabase } from "../lib/supabase";

type Props = {
  roomId: string;
  locale: Locale;
  comments: Comment[];
  onCommentModerated: (comment: Comment) => void;
};

/**
 * NG ワードと、届いたコメントの非表示／復帰。
 *
 * **Event Pass の内側に戻さないこと。** App Store 1.2 は UGC アプリに
 * フィルタ／通報／対処・排除／連絡先の4つを求める。通報（`ReportQueue`）と
 * 連絡先（`AccountFooter`）は元から無料だが、以前はこの2つが `EventPassPanel` の
 * 有料分岐の中にあったので、**無料ルームは「通報はできるが誰も消せない」** 状態だった。
 * 審査員は無料ルームで試すので、そこがそのまま指摘になる。
 *
 * 有料に残っているのは「投稿を全件いったん保留する」承認制トグル・入室パスコード・
 * 表示遅延・質問のみ表示（= `moderation_rules`）と、ブランディング・レポート。
 * それらは `EventPassPanel` のまま。
 *
 * `moderation_terms` を自分で取りに行くのは、`EventPassPanel` の `load` が
 * `if (!active && !ongoingPaid) return;` で無料ルームでは取得ごと打ち切るため。
 */
export function ModerationPanel({ roomId, locale, comments, onCommentModerated }: Props) {
  const ja = locale === "ja";
  const [terms, setTerms] = useState<ModerationTerm[]>([]);
  const [newTerm, setNewTerm] = useState("");
  const [termMode, setTermMode] = useState<"contains" | "exact">("contains");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data, error: loadError } = await supabase
      .from("moderation_terms")
      .select("*")
      .eq("room_id", roomId)
      .order("created_at");
    if (loadError) {
      setError(resolveErrorMessage(new LayerTalkError("moderation_failed", loadError.message), locale));
      return;
    }
    setTerms(data ?? []);
  }, [locale, roomId]);

  useEffect(() => {
    void load();
  }, [load]);

  const addTerm = async () => {
    const term = newTerm.trim();
    if (!term) return;
    setError(null);
    // 罠 #16: 権限で弾かれても PostgREST は 204 を返す。返ってきた行を正とする。
    const { data, error: insertError } = await supabase
      .from("moderation_terms")
      .insert({ room_id: roomId, term, match_mode: termMode })
      .select()
      .maybeSingle();
    if (insertError || !data) {
      setError(resolveErrorMessage(new LayerTalkError("moderation_failed", insertError?.message ?? "no row"), locale));
      return;
    }
    setTerms((current) => [...current, data]);
    setNewTerm("");
  };

  const removeTerm = async (termId: string) => {
    setError(null);
    // DELETE も同じ。`.select()` を付けないと 0 行削除が成功に見える。
    const { data, error: deleteError } = await supabase
      .from("moderation_terms")
      .delete()
      .eq("id", termId)
      .select()
      .maybeSingle();
    if (deleteError || !data) {
      setError(resolveErrorMessage(new LayerTalkError("moderation_failed", deleteError?.message ?? "no row"), locale));
      return;
    }
    setTerms((current) => current.filter((item) => item.id !== termId));
  };

  return (
    <section className="space-y-3">
      <p className="text-text-faint text-[11px] font-bold tracking-wider uppercase">
        {ja ? "コメントの管理" : "Comment moderation"}
      </p>

      <div className="border-border bg-bg-elev space-y-4 rounded-[22px] border p-4">
        <div>
          <p className="flex items-center gap-2 text-[13px] font-bold">
            <ShieldCheck size={14} />
            {ja ? "NGワード" : "Blocked words"}
          </p>
          <p className="text-text-faint mt-1 text-[10px] leading-relaxed">
            {ja
              ? "一致した投稿はスライドに出さず、承認待ちに回します。誤って止めたときは上の承認待ちから出せます。"
              : "Matching posts stay off the slide and go to the approval queue. Release a false positive from the queue above."}
          </p>
          <div className="mt-2 flex gap-2">
            <input
              value={newTerm}
              onChange={(event) => setNewTerm(event.target.value)}
              maxLength={60}
              className="border-border min-w-0 flex-1 rounded-[12px] border bg-transparent px-3 py-2 text-[12px] outline-none"
            />
            <select
              aria-label={ja ? "一致方法" : "Match mode"}
              value={termMode}
              onChange={(event) => setTermMode(event.target.value as "contains" | "exact")}
              className="border-border rounded-[12px] border bg-transparent px-2 text-[10px] outline-none"
            >
              <option value="contains">{ja ? "部分" : "Contains"}</option>
              <option value="exact">{ja ? "完全" : "Exact"}</option>
            </select>
            <button
              type="button"
              disabled={!newTerm.trim()}
              onClick={() => void addTerm()}
              aria-label={ja ? "NGワードを追加" : "Add blocked word"}
              className="border-border rounded-[12px] border px-3 disabled:opacity-40"
            >
              <Plus size={14} />
            </button>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {terms.map((term) => (
              <button
                key={term.id}
                type="button"
                onClick={() => void removeTerm(term.id)}
                className="bg-surface-strong text-text-muted flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px]"
              >
                {term.term}
                <Trash2 size={10} />
              </button>
            ))}
          </div>
        </div>

        <div className="border-border border-t pt-4">
          <RecentComments
            comments={comments}
            locale={locale}
            moderate={(commentId, action) => moderateComment(supabase, commentId, action)}
            onModerated={onCommentModerated}
          />
        </div>

        {error && <p role="alert" className="text-like text-[11px]">{error}</p>}
      </div>
    </section>
  );
}
