"use client";

import { useComments, type Comment } from "@layertalk/shared";
import { useCallback, useState } from "react";

import { supabase } from "@/lib/supabase";

/** 一時的な検証ページ。useComments の onInsert が実際に発火するかを実測する。
 *  （setState の更新関数内でフラグを立てて判定していたせいで一度も呼ばれなかったバグの回帰確認）
 *  確認が済んだら削除する。 */
const ROOM_ID = "166d9fb1-d3b2-4644-8cd4-7c19ef6f9134";

export default function OnInsertProbePage() {
  const [announced, setAnnounced] = useState<{ at: string; content: string }[]>([]);

  const handleInsert = useCallback((comment: Comment) => {
    setAnnounced((prev) => [
      ...prev,
      { at: new Date().toLocaleTimeString("ja-JP"), content: comment.content },
    ]);
  }, []);

  const { comments, status, loading } = useComments({
    client: supabase,
    roomId: ROOM_ID,
    onInsert: handleInsert,
  });

  return (
    <main className="space-y-6 p-8 font-mono text-[13px]">
      <div>
        <div>status: {status}</div>
        <div>loading: {String(loading)}</div>
        <div>
          一覧の件数: <span id="list-count">{comments.length}</span>
        </div>
        <div>
          onInsert 発火数: <span id="announced-count">{announced.length}</span>
        </div>
      </div>

      <div>
        <h2 className="mb-2 font-bold">onInsert で流れたコメント（＝オーバーレイに出るはずのもの）</h2>
        <ul id="announced-list" className="space-y-1">
          {announced.map((entry, i) => (
            <li key={i}>
              [{entry.at}] {entry.content}
            </li>
          ))}
        </ul>
        {announced.length === 0 && <p className="opacity-60">（まだ無し）</p>}
      </div>

      <div>
        <h2 className="mb-2 font-bold">一覧に入っている全コメント</h2>
        <ul className="space-y-1 opacity-70">
          {comments.map((c) => (
            <li key={c.id}>{c.content}</li>
          ))}
        </ul>
      </div>
    </main>
  );
}
