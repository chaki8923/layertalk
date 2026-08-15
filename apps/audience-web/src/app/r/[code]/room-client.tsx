"use client";

import {
  buildComment,
  fetchLikedIds,
  findRoomByCode,
  getClientId,
  insertComment,
  joinRoom,
  motionPresets,
  normalizeRoomCode,
  resolveErrorMessage,
  sortComments,
  toggleLike,
  uploadRoomStamp,
  useComments,
  useRoomStamps,
  useStampChannel,
  type Locale,
  type PublicRoom,
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
import { Turnstile } from "@/components/turnstile";
import { localeFromRoom, messages, type Messages } from "@/i18n";
import { LocaleProvider } from "@/i18n/locale-context";
import { supabase } from "@/lib/supabase";

type RoomState =
  | { kind: "loading" }
  | { kind: "gate"; room: PublicRoom }
  | { kind: "ready"; room: PublicRoom }
  | { kind: "notfound" }
  | { kind: "error"; error: unknown };

export function RoomClient({ code, fallbackLocale }: { code: string; fallbackLocale: Locale }) {
  const [roomState, setRoomState] = useState<RoomState>({ kind: "loading" });
  const [sortMode, setSortMode] = useState<SortMode>("popular");
  const [likedIds, setLikedIds] = useState<Set<string>>(new Set());
  const [myIds, setMyIds] = useState<Set<string>>(new Set());
  const [passcode, setPasscode] = useState("");
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [captchaToken, setCaptchaToken] = useState("");
  // localStorage はサーバでは読めないので遅延初期化する。
  // SSR 時は空文字、クライアントの初回レンダーで実際の id になる。
  // 画面に出す値ではないのでハイドレーションの不一致にはならず、
  // effect で setState するより 1 レンダー早く確定する。
  const [clientId] = useState(getClientId);

  const room = roomState.kind === "ready" ? roomState.room : null;
  const localizedRoom = roomState.kind === "ready" || roomState.kind === "gate" ? roomState.room : null;
  const roomId = room?.id ?? null;

  // 表示言語はルームが持つ。取得できるまでは Accept-Language 由来の推測を使うが、
  // その間に読める文言は出さない（下の loading は文字を持たない）ので入れ替わりは見えない。
  const locale = localizedRoom ? localeFromRoom(localizedRoom.language) : fallbackLocale;
  const t = messages[locale];

  // コードからルームを解決する
  useEffect(() => {
    let cancelled = false;

    void (async () => {
      try {
        const found = await findRoomByCode(supabase, code);
        if (cancelled) return;
        if (!found) {
          setRoomState({ kind: "notfound" });
          return;
        }
        if (found.requires_passcode || process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY) {
          setRoomState({ kind: "gate", room: found });
          return;
        }
        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData.session) {
          const { error: authError } = await supabase.auth.signInAnonymously();
          if (authError) throw authError;
        }
        const joined = await joinRoom(supabase, code);
        if (cancelled) return;
        setRoomState(joined ? { kind: "ready", room: { ...found, ...joined } } : { kind: "notfound" });
      } catch (err) {
        if (cancelled) return;
        setRoomState({ kind: "error", error: err });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [code]);

  const handleJoinRoom = async () => {
    if (roomState.kind !== "gate") return;
    setJoining(true);
    setJoinError(null);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        const { error: authError } = await supabase.auth.signInAnonymously({ options: captchaToken ? { captchaToken } : undefined });
        if (authError) throw authError;
      }
      const joined = await joinRoom(supabase, code, passcode);
      if (!joined) {
        setJoinError(locale === "ja" ? "ルームが見つかりません" : "Room not found");
        return;
      }
      setRoomState({ kind: "ready", room: { ...roomState.room, ...joined } });
    } catch {
      setJoinError(locale === "ja" ? "パスコードが違います" : "Incorrect passcode");
    } finally {
      setJoining(false);
    }
  };

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

  // このルームだけで押せる画像スタンプ。誰かが追加すると全員のバーに並ぶ。
  const { stamps, addLocal: addStampLocal } = useRoomStamps({ client: supabase, roomId });

  /**
   * 失敗したら throw して StampBar 側にトーストを出させる。
   * 上げたファイルの後始末は uploadRoomStamp が中でやるので、ここでの巻き戻しはない。
   */
  const handleUploadStamp = useCallback(
    async (blob: Blob) => {
      if (!roomId || !clientId) return;

      const created = await uploadRoomStamp(supabase, { roomId, clientId, blob });
      // Realtime のエコーを待たずに自分のバーへ出す（useRoomStamps 側で二重にならない）
      addStampLocal(created);
      toast.success(t.stamp.added);
    },
    [roomId, clientId, addStampLocal, t],
  );

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
    (text: string, isQuestion: boolean) => {
      if (!roomId) return;

      let optimistic;
      try {
        optimistic = buildComment(roomId, text, isQuestion);
      } catch (err) {
        toast.error(resolveErrorMessage(err, locale));
        return;
      }

      // 先に描画してから投げる。ネットワークを待たせない。
      upsertLocal(optimistic);
      setMyIds((prev) => new Set(prev).add(optimistic.id));

      void insertComment(supabase, optimistic)
        .then((saved) => {
          if (saved.status === "pending") {
            removeLocal(saved.id);
            toast.success(locale === "ja" ? "承認待ちとして送信しました" : "Sent for approval");
          }
        })
        .catch((err) => {
          removeLocal(optimistic.id);
          toast.error(resolveErrorMessage(err, locale));
        });
    },
    [roomId, upsertLocal, removeLocal, locale],
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
        .catch((err) => {
          // 巻き戻す
          setLikedIds((prev) => {
            const next = new Set(prev);
            if (wasLiked) next.add(commentId);
            else next.delete(commentId);
            return next;
          });
          patchLikes(commentId, currentCount);
          toast.error(resolveErrorMessage(err, locale));
        });
    },
    [clientId, likedIds, patchLikes, locale],
  );

  const sorted = useMemo(() => sortComments(comments, sortMode), [comments, sortMode]);

  // ルームの言語が分かる前に文言を出さない。ここで「接続中…」と書くと、
  // 英語のルームに入った観客が最初の一瞬だけ日本語を読むことになる。
  if (roomState.kind === "loading") {
    return (
      <div className="text-text-faint flex h-dvh items-center justify-center">
        <Loader2 size={22} className="animate-spin" aria-hidden />
      </div>
    );
  }

  if (roomState.kind === "notfound") {
    return (
      <CenteredMessage
        icon={<MessageSquareOff size={22} />}
        title={t.room.notFound}
        body={t.room.notFoundBody(normalizeRoomCode(code))}
        action={
          <Link
            href="/"
            className="rounded-control border-border hover:bg-surface-strong border px-4 py-2 text-[13px] font-semibold transition-colors"
          >
            {t.room.retype}
          </Link>
        }
      />
    );
  }

  if (roomState.kind === "gate") {
    return (
      <div className="flex min-h-dvh items-center justify-center px-5">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            void handleJoinRoom();
          }}
          className="lt-glass w-full max-w-sm rounded-[28px] p-6"
        >
          <p className="text-text-faint text-[11px] font-bold tracking-[0.16em] uppercase">
            {roomState.room.code}
          </p>
          <h1 className="mt-2 text-[22px] font-bold tracking-[-0.02em]">
            {roomState.room.title ?? "LayerTalk"}
          </h1>
          <p className="text-text-muted mt-2 text-[13px] leading-relaxed">
            {roomState.room.requires_passcode
              ? locale === "ja" ? "主催者から共有されたパスコードを入力してください。" : "Enter the passcode shared by the host."
              : locale === "ja" ? "確認が完了すると入室できます。" : "Complete the quick check to join."}
          </p>
          {roomState.room.requires_passcode && <input
            autoFocus
            type="password"
            value={passcode}
            onChange={(event) => setPasscode(event.target.value)}
            minLength={4}
            maxLength={12}
            className="border-border focus:border-brand mt-5 w-full rounded-[14px] border bg-transparent px-4 py-3 text-[16px] outline-none"
          />}
          <Turnstile onToken={setCaptchaToken} />
          {joinError && <p className="text-like mt-2 text-[12px]">{joinError}</p>}
          <button
            type="submit"
            disabled={joining || (roomState.room.requires_passcode && passcode.length < 4) || (Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY) && !captchaToken)}
            className="lt-tap mt-4 flex w-full items-center justify-center rounded-[14px] bg-[linear-gradient(135deg,#6b8aff,#b47cff)] px-4 py-3 text-[14px] font-bold text-white disabled:opacity-40"
          >
            {joining ? <Loader2 size={16} className="animate-spin" /> : locale === "ja" ? "入室する" : "Join room"}
          </button>
        </form>
      </div>
    );
  }

  if (roomState.kind === "error") {
    return (
      <CenteredMessage
        icon={<MessageSquareOff size={22} />}
        title={t.room.connectFailed}
        body={resolveErrorMessage(roomState.error, locale)}
      />
    );
  }

  return (
    <LocaleProvider locale={locale}>
    <div className="flex h-dvh flex-col">
      {/* ------------------------------------------------------------ ヘッダ */}
      <header className="lt-glass pt-safe sticky top-0 z-20 shrink-0 rounded-none border-x-0 border-t-0 px-4 pb-3">
        <div className="mx-auto flex w-full max-w-lg flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <h1 className="min-w-0 truncate text-[16px] leading-tight font-[650] tracking-[-0.01em]">
              {roomState.room.title ?? "LayerTalk"}
            </h1>
            <ConnectionDot status={status} labels={t.status} />
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
              <p className="text-[15px] font-medium">{t.room.emptyTitle}</p>
              <p className="text-text-faint mt-1 text-[13px]">{t.room.emptyBody}</p>
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
            <StampBar
              onSend={sendStamp}
              stamps={stamps}
              onUpload={handleUploadStamp}
              disabled={!roomId}
            />
            <Composer onSubmit={handleSubmit} disabled={!roomId} />
          </div>
        </div>
      </div>
    </div>
    </LocaleProvider>
  );
}

// ------------------------------------------------------------------ 部品

type ConnectionDotProps = {
  status: "connecting" | "connected" | "disconnected";
  labels: Messages["status"];
};

function ConnectionDot({ status, labels }: ConnectionDotProps) {
  const color = {
    connecting: "var(--lt-text-faint)",
    connected: "var(--lt-online)",
    disconnected: "var(--lt-like)",
  }[status];

  const label = labels[status];

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
