"use client";

import {
  buildComment,
  fetchLikedIds,
  findRoomByCode,
  getClientId,
  insertComment,
  motionPresets,
  normalizeRoomCode,
  sortComments,
  toggleLike,
  useComments,
  useStampChannel,
  type Room,
  type SortMode,
} from "@layertalk/shared";
import { AnimatePresence, motion } from "motion/react";
import { Loader2, MessageSquareOff } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { CommentCard } from "@/components/comment-card";
import { Composer } from "@/components/composer";
import { SortTabs } from "@/components/sort-tabs";
import { StampBar } from "@/components/stamp-bar";
import { supabase } from "@/lib/supabase";

type RoomState =
  | { kind: "loading" }
  | { kind: "ready"; room: Room }
  | { kind: "notfound" }
  | { kind: "error"; message: string };

export function RoomClient({ code }: { code: string }) {
  const [roomState, setRoomState] = useState<RoomState>({ kind: "loading" });
  const [sortMode, setSortMode] = useState<SortMode>("popular");
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [myIds, setMyIds] = useState<Set<string>>(new Set());
  // localStorage はサーバでは読めないので遅延初期化する。
  // SSR 時は空文字、クライアントの初回レンダーで実際の id になる。
  // 画面に出す値ではないのでハイドレーションの不一致にはならず、
  // effect で setState するより 1 レンダー早く確定する。
  const [clientId] = useState(getClientId);

  const room = roomState.kind === "ready" ? roomState.room : null;
  const roomId = room?.id ?? null;

  // コードからルームを解決する
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const found = await findRoomByCode(supabase, code);
        if (cancelled) return;
        setRoomState(found ? { kind: "ready", room: found } : { kind: "notfound" });
      } catch (err) {
        if (cancelled) return;
        setRoomState({
          kind: "error",
          message: err instanceof Error ? err.message : "接続に失敗しました",
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [code]);

  const { comments, status, loading, upsertLocal, removeLocal, patchLikes } = useComments({
    client: supabase,
    roomId,
  });

  const { sendStamp } = useStampChannel({
    client: supabase,
    roomId,
    clientId,
    // 観客側は他人のスタンプを描画しないので、受信ハンドラは持たない
    ignoreSelf: true,
  });

  // いいね済みの復元。localStorage ではなくサーバに問い合わせる
  // （端末を変えても、キャッシュを消しても、二重にいいねできないのが正）。
  useEffect(() => {
    if (!roomId || !clientId) return;

    let cancelled = false;
    void (async () => {
      try {
        const ids = await fetchLikedIds(supabase, roomId, clientId);
        if (!cancelled) setLikedIds(new Set(ids));
      } catch {
        // 失敗しても致命的ではない。押し直せば RPC 側で正しく判定される。
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [roomId, clientId]);

  const handleSubmit = useCallback(
    (text: string) => {
      if (!roomId) return;

      let optimistic;
      try {
        optimistic = buildComment(roomId, text);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "送信できませんでした");
        return;
      }

      // 先に描画してから投げる。ネットワークを待たせない。
      upsertLocal(optimistic);
      setMyIds((prev) => new Set(prev).add(optimistic.id));

      void insertComment(supabase, optimistic).catch(() => {
        removeLocal(optimistic.id);
        toast.error("コメントを送信できませんでした");
      });
    },
    [roomId, upsertLocal, removeLocal],
  );

  const handleToggleLike = useCallback(
    (commentId: string, currentCount: number) => {
      if (!clientId) return;

      const wasLiked = likedIds.has(commentId);

      // 楽観的に反転
      setLikedIds((prev) => {
        const next = new Set(prev);
        if (wasLiked) next.delete(commentId);
        else next.add(commentId);
        return next;
      });
      patchLikes(commentId, Math.max(currentCount + (wasLiked ? -1 : 1), 0));

      void toggleLike(supabase, commentId, clientId)
        .then((serverCount) => patchLikes(commentId, serverCount))
        .catch(() => {
          // 巻き戻す
          setLikedIds((prev) => {
            const next = new Set(prev);
            if (wasLiked) next.add(commentId);
            else next.delete(commentId);
            return next;
          });
          patchLikes(commentId, currentCount);
          toast.error("いいねを反映できませんでした");
        });
    },
    [clientId, likedIds, patchLikes],
  );

  const sorted = useMemo(() => sortComments(comments, sortMode), [comments, sortMode]);

  if (roomState.kind === "loading") {
    return <CenteredMessage icon={<Loader2 size={22} className="animate-spin" />} title="接続中…" />;
  }

  if (roomState.kind === "notfound") {
    return (
      <CenteredMessage
        icon={<MessageSquareOff size={22} />}
        title="ルームが見つかりません"
        body={`コード「${normalizeRoomCode(code)}」のルームは存在しないか、終了しています。`}
        action={
          <Link
            href="/"
            className="rounded-control border-border hover:bg-surface-strong border px-4 py-2 text-[13px] font-semibold transition-colors"
          >
            コードを入力し直す
          </Link>
        }
      />
    );
  }

  if (roomState.kind === "error") {
    return (
      <CenteredMessage
        icon={<MessageSquareOff size={22} />}
        title="接続できませんでした"
        body={roomState.message}
      />
    );
  }

  return (
    <div className="flex h-dvh flex-col">
      {/* ------------------------------------------------------------ ヘッダ */}
      <header className="lt-glass pt-safe sticky top-0 z-20 shrink-0 rounded-none border-x-0 border-t-0 px-4 pb-3">
        <div className="mx-auto flex w-full max-w-lg flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <h1 className="min-w-0 truncate text-[16px] leading-tight font-[650] tracking-[-0.01em]">
              {roomState.room.title ?? "LayerTalk"}
            </h1>
            <ConnectionDot status={status} />
          </div>
          <SortTabs value={sortMode} onChange={setSortMode} />
        </div>
      </header>

      {/* -------------------------------------------------------- コメント一覧 */}
      <main className="min-h-0 flex-1 overflow-y-auto px-4 pt-3">
        <div className="mx-auto w-full max-w-lg pb-56">
          {loading ? (
            <div className="text-text-faint flex justify-center py-16">
              <Loader2 size={20} className="animate-spin" />
            </div>
          ) : sorted.length === 0 ? (
            <div className="text-text-muted py-16 text-center">
              <p className="text-[15px] font-medium">まだコメントがありません</p>
              <p className="text-text-faint mt-1 text-[13px]">
                最初のひとことを送ってみましょう
              </p>
            </div>
          ) : (
            <motion.ul layout className="flex flex-col gap-2.5">
              <AnimatePresence initial={false}>
                {sorted.map((comment) => (
                  <CommentCard
                    key={comment.id}
                    comment={comment}
                    liked={likedIds.has(comment.id)}
                    isMine={myIds.has(comment.id)}
                    onToggleLike={() => handleToggleLike(comment.id, comment.likes_count)}
                  />
                ))}
              </AnimatePresence>
            </motion.ul>
          )}
        </div>
      </main>

      {/* ------------------------------------------------- 下端のフローティング */}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30">
        {/* 一覧が下端で唐突に切れないよう、背景色へのグラデーションで溶かす */}
        <div className="from-bg pointer-events-none h-12 bg-gradient-to-t to-transparent" />
        <div className="bg-bg pb-safe pointer-events-auto px-4">
          <div className="mx-auto flex w-full max-w-lg flex-col gap-2.5 pb-2">
            <StampBar onSend={sendStamp} />
            <Composer onSubmit={handleSubmit} disabled={!roomId} />
          </div>
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ 部品

function ConnectionDot({ status }: { status: "connecting" | "connected" | "disconnected" }) {
  const map = {
    connecting: { label: "接続中", color: "var(--lt-text-faint)" },
    connected: { label: "接続済み", color: "var(--lt-online)" },
    disconnected: { label: "切断", color: "var(--lt-like)" },
  } as const;

  const { label, color } = map[status];

  return (
    <span className="text-text-muted flex shrink-0 items-center gap-1.5 text-[12px] font-medium">
      <motion.span
        className="h-1.5 w-1.5 rounded-full"
        style={{ background: color }}
        animate={status === "connecting" ? { opacity: [1, 0.3, 1] } : { opacity: 1 }}
        transition={status === "connecting" ? { duration: 1.2, repeat: Infinity } : undefined}
      />
      {label}
    </span>
  );
}

function CenteredMessage({
  icon,
  title,
  body,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  body?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-3 px-8 text-center">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={motionPresets.entrance}
        className="text-text-muted flex flex-col items-center gap-3"
      >
        {icon}
        <p className="text-text text-[16px] font-semibold">{title}</p>
        {body && <p className="text-text-muted max-w-xs text-[13px] leading-relaxed">{body}</p>}
        {action && <div className="mt-2">{action}</div>}
      </motion.div>
    </div>
  );
}
