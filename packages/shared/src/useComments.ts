import { useCallback, useEffect, useRef, useState } from "react";
import type { LayerTalkClient } from "./client";
import { INITIAL_COMMENT_LIMIT, commentChannelName } from "./constants";
import type { Comment, ConnectionStatus, SortMode } from "./types";

const newestFirst = (a: Comment, b: Comment) => b.created_at.localeCompare(a.created_at);

/** id をキーに 2 つのリストを畳む。overlay 側が勝つ。 */
function mergeById(base: Comment[], overlay: Comment[]): Comment[] {
  const map = new Map(base.map((c) => [c.id, c]));
  for (const c of overlay) map.set(c.id, c);
  return [...map.values()].sort(newestFirst);
}

export function sortComments(comments: Comment[], mode: SortMode): Comment[] {
  const copy = [...comments];
  if (mode === "latest") return copy.sort(newestFirst);
  return copy.sort((a, b) => b.likes_count - a.likes_count || newestFirst(a, b));
}

/**
 * SUBSCRIBED が返ってから、実際にレプリケーションのフィルタが効き始めるまでの猶予(ms)。
 *
 * 実測: SUBSCRIBED 直後に INSERT すると postgres_changes が届かず、
 * 2秒待ってから INSERT すると届く。この穴を塞ぐため、購読確立の直後と
 * この時間の経過後の2回、取得し直して取りこぼしを回収する。
 */
const RECONCILE_DELAY_MS = 2500;

export type UseCommentsOptions = {
  client: LayerTalkClient | null;
  roomId: string | null;
  /** 新着1件ごとに呼ばれる。presenter 側の演出トリガに使う。 */
  onInsert?: (comment: Comment) => void;
  limit?: number;
};

export type UseCommentsResult = {
  comments: Comment[];
  status: ConnectionStatus;
  loading: boolean;
  error: string | null;
  /** 楽観的追加・ロールバック用。id を指定して upsert する。 */
  upsertLocal: (comment: Comment) => void;
  removeLocal: (id: string) => void;
  /** likes_count をローカルだけ書き換える（RPC の応答を即座に反映する用） */
  patchLikes: (id: string, likesCount: number) => void;
};

/**
 * comments の初期取得 + postgres_changes 購読。
 *
 * 購読を張ってから取得する。逆順にすると、取得〜購読開始の隙間に入ったコメントを
 * どちらの経路でも拾えず、恒久的に取りこぼす。
 */
export function useComments({
  client,
  roomId,
  onInsert,
  limit = INITIAL_COMMENT_LIMIT,
}: UseCommentsOptions): UseCommentsResult {
  const [comments, setComments] = useState<Comment[]>([]);
  const [status, setStatus] = useState<ConnectionStatus>("connecting");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // コールバックの同一性でチャンネルを張り直したくないので ref に逃がす。
  const onInsertRef = useRef(onInsert);
  useEffect(() => {
    onInsertRef.current = onInsert;
  }, [onInsert]);

  /**
   * 演出を発火済みのコメント id。
   *
   * ⚠️ ここを setComments の更新関数の中で判定してはいけない。
   * React は更新関数を呼び出し時点では実行せず、次のレンダーまで遅延させる。
   * 以前クロージャ変数で「新規かどうか」を受け取ろうとして、
   * onInsert が一度も呼ばれない（＝コメントがオーバーレイに流れない）バグを作った。
   * ref なら React のレンダリング周期に依存せず、その場で同期的に判定できる。
   */
  const seenIdsRef = useRef<Set<string>>(new Set());

  /** 未処理なら記録して true を返す */
  const markSeen = useCallback((id: string) => {
    if (seenIdsRef.current.has(id)) return false;
    seenIdsRef.current.add(id);
    return true;
  }, []);

  const upsertLocal = useCallback(
    (comment: Comment) => {
      // 自分の楽観的追加。Realtime のエコーで演出を二重に走らせないため記録しておく。
      markSeen(comment.id);
      setComments((prev) => mergeById(prev, [comment]));
    },
    [markSeen],
  );

  const removeLocal = useCallback((id: string) => {
    seenIdsRef.current.delete(id);
    setComments((prev) => prev.filter((c) => c.id !== id));
  }, []);

  const patchLikes = useCallback((id: string, likesCount: number) => {
    setComments((prev) => prev.map((c) => (c.id === id ? { ...c, likes_count: likesCount } : c)));
  }, []);

  useEffect(() => {
    if (!client || !roomId) return;

    let cancelled = false;
    let reconcileTimer: ReturnType<typeof setTimeout> | undefined;
    let firstSubscribe = true;

    // ルームが変わったら演出済みの記録もリセットする
    seenIdsRef.current = new Set();
    setComments([]);
    setLoading(true);
    setStatus("connecting");
    setError(null);

    const filter = `room_id=eq.${roomId}`;

    /**
     * @param announce 取得した中の未処理コメントを onInsert に流すか。
     *   初回は false（開始前の投稿を画面に洪水させない）。
     *   再取得は true（購読ギャップで取りこぼした＝本当の新着だけが未処理で残る）。
     */
    const hydrate = async (announce: boolean) => {
      const { data, error: fetchError } = await client
        .from("comments")
        .select("*")
        .eq("room_id", roomId)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (cancelled) return;

      if (fetchError) {
        setError(fetchError.message);
        setLoading(false);
        return;
      }

      setError(null);
      const rows = data ?? [];

      // 古い順に流したいので、announce のときだけ並べ直す
      const fresh = rows.filter((row) => markSeen(row.id));
      if (announce) {
        for (const row of [...fresh].reverse()) onInsertRef.current?.(row);
      }

      // Realtime 経由で持っている行の方が新しいので、そちらを上書き側にする。
      setComments((live) => mergeById(rows, live));
      setLoading(false);
    };

    const channel = client
      .channel(commentChannelName(roomId))
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "comments", filter },
        ({ new: row }) => {
          const comment = row as Comment;
          // 自分の楽観的追加や、hydrate で既に拾った行はここで弾く
          if (!markSeen(comment.id)) return;

          setComments((prev) => [comment, ...prev]);
          onInsertRef.current?.(comment);
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "comments", filter },
        ({ new: row }) => {
          const comment = row as Comment;
          setComments((prev) => prev.map((c) => (c.id === comment.id ? { ...c, ...comment } : c)));
        },
      )
      .subscribe((state) => {
        if (cancelled) return;

        if (state === "SUBSCRIBED") {
          setStatus("connected");

          // 初回は既存の投稿を流さない（開始した瞬間に過去ログが洪水しない）。
          // 再接続時は切断中に増えた分だけが未処理で残るので、それは新着として流す。
          const isInitial = firstSubscribe;
          firstSubscribe = false;

          void hydrate(!isInitial);
          clearTimeout(reconcileTimer);
          reconcileTimer = setTimeout(() => void hydrate(true), RECONCILE_DELAY_MS);
        } else if (state === "CHANNEL_ERROR" || state === "TIMED_OUT" || state === "CLOSED") {
          setStatus("disconnected");
        }
      });

    return () => {
      cancelled = true;
      clearTimeout(reconcileTimer);
      void client.removeChannel(channel);
    };
  }, [client, roomId, limit, markSeen]);

  return { comments, status, loading, error, upsertLocal, removeLocal, patchLikes };
}
