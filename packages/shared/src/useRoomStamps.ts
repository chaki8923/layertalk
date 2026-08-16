"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchRoomStamps, fetchRoomStampUrl } from "./api";
import type { LayerTalkClient } from "./client";
import { roomStampChannelName } from "./constants";
import { LayerTalkError } from "./errors";
import type { RoomStamp } from "./types";

const oldestFirst = (a: RoomStamp, b: RoomStamp) => a.created_at.localeCompare(b.created_at);

/**
 * useComments と同じ理由の猶予。SUBSCRIBED が返ってもレプリケーションのフィルタは
 * まだ効いておらず、購読直後に入った行を取りこぼす。
 */
const RECONCILE_DELAY_MS = 2500;

export type UseRoomStampsOptions = {
  client: LayerTalkClient | null;
  roomId: string | null;
};

export type UseRoomStampsResult = {
  /** 追加された順（古い順）。押すたびにバーの並びが動かないように固定する。 */
  stamps: RoomStamp[];
  /** Broadcast で飛んできた id から実体を引くための索引 */
  byId: Map<string, RoomStamp>;
  loading: boolean;
  /** 表示側で `resolveErrorMessage(error, locale)` に通す。 */
  error: Error | null;
  /** 楽観的追加・ロールバック用 */
  addLocal: (stamp: RoomStamp) => void;
  removeLocal: (id: string) => void;
};

/**
 * ルーム固有のカスタムスタンプ一覧 + postgres_changes 購読。
 *
 * 観客のスタンプバー、発表者のコントロール窓（削除UI）、オーバーレイ（id→URL の解決）が
 * 同じものを見る。useComments と同じく購読を張ってから取得する。
 */
export function useRoomStamps({ client, roomId }: UseRoomStampsOptions): UseRoomStampsResult {
  const [stamps, setStamps] = useState<RoomStamp[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  /**
   * 取り込み済みの id と、消えた id。
   *
   * ⚠️ useComments と同じ理由で ref に置く。setStamps の更新関数は呼び出し時点では
   * 実行されないので、その中で「新規かどうか」を判定して外へ持ち出してはいけない。
   *
   * deletedIds は取得の行き違い対策。取得の応答が返ってくる前に DELETE が届くと、
   * 消したはずの行が一覧に戻ってしまう。
   */
  const seenIdsRef = useRef<Set<string>>(new Set());
  const deletedIdsRef = useRef<Set<string>>(new Set());

  /**
   * 同じ id が既に居たら何もしない append。
   *
   * ⚠️ 判定を「更新関数の中」でやるのが肝。seenIdsRef は同期的に立つので
   * await をまたぐ取り込みの根拠には使えない（await 中に addLocal / hydrate が
   * 同じ行を入れていても seenIds はもう立っていて、素通りしてしまう）。
   * 実際にこれで、追加した直後だけ同じスタンプが2枚並んでいた。
   */
  const appendUnlessPresent = useCallback((stamp: RoomStamp) => {
    setStamps((prev) =>
      prev.some((s) => s.id === stamp.id) ? prev : [...prev, stamp].sort(oldestFirst),
    );
  }, []);

  const addLocal = useCallback(
    (stamp: RoomStamp) => {
      seenIdsRef.current.add(stamp.id);
      deletedIdsRef.current.delete(stamp.id);
      appendUnlessPresent(stamp);
    },
    [appendUnlessPresent],
  );

  const removeLocal = useCallback((id: string) => {
    seenIdsRef.current.delete(id);
    deletedIdsRef.current.add(id);
    setStamps((prev) => prev.filter((s) => s.id !== id));
  }, []);

  useEffect(() => {
    if (!client || !roomId) {
      setStamps([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    let reconcileTimer: ReturnType<typeof setTimeout> | undefined;

    seenIdsRef.current = new Set();
    deletedIdsRef.current = new Set();
    setStamps([]);
    setLoading(true);
    setError(null);

    const hydrate = async () => {
      try {
        const rows = await fetchRoomStamps(client, roomId);
        if (cancelled) return;

        setStamps((live) => {
          const map = new Map<string, RoomStamp>();
          for (const row of rows) {
            if (deletedIdsRef.current.has(row.id)) continue;
            map.set(row.id, row);
          }
          // 取得の最中に購読で届いた分を落とさない
          for (const row of live) map.set(row.id, row);
          return [...map.values()].sort(oldestFirst);
        });

        for (const row of rows) seenIdsRef.current.add(row.id);
        setError(null);
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err : new LayerTalkError("stamp_fetch_failed", String(err)),
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    const channel = client
      .channel(roomStampChannelName(roomId))
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "room_stamps",
          filter: `room_id=eq.${roomId}`,
        },
        ({ new: row }) => {
          const stamp = row as RoomStamp;
          // 無駄な署名URLの発行を減らすための早期 return。
          // 取り込んでよいかの最終判断は下（await のあと）でやり直す。
          if (seenIdsRef.current.has(stamp.id) || deletedIdsRef.current.has(stamp.id)) return;
          seenIdsRef.current.add(stamp.id);
          void fetchRoomStampUrl(client, stamp.path)
            .then(() => {
              if (cancelled || deletedIdsRef.current.has(stamp.id)) return;
              appendUnlessPresent(stamp);
            })
            .catch(() => {
              // 行だけ先にできて画像がまだ無い（reserve_room_stamp が commit した時点で
              // この INSERT は飛ぶが、Storage の upload はまだ終わっていない。private
              // バケットなので createSignedUrl は確実に 404 する）。
              // seenIds に入れたままだと二度と取り込まれないので戻し、再取得に拾わせる。
              if (cancelled) return;
              seenIdsRef.current.delete(stamp.id);
              clearTimeout(reconcileTimer);
              reconcileTimer = setTimeout(() => void hydrate(), RECONCILE_DELAY_MS);
            });
        },
      )
      .on(
        // ⚠️ DELETE には filter を付けてはいけない。
        // Supabase Realtime の DELETE ペイロードは old に主キーしか載せない
        // （replica identity full にしても実測で {"id": ...} だけだった）。
        // room_id が無いので `room_id=eq.…` は絶対に一致せず、付けると
        // 「消したのにバーから消えない」になる。手元に無い id は下の filter が
        // 空振りするだけなので、全部受け取ってから捨てる。
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "room_stamps" },
        ({ old: row }) => {
          const id = (row as Partial<RoomStamp>).id;
          if (!id) return;
          seenIdsRef.current.delete(id);
          deletedIdsRef.current.add(id);
          setStamps((prev) => prev.filter((s) => s.id !== id));
        },
      )
      .subscribe((state) => {
        if (cancelled) return;
        if (state === "SUBSCRIBED") {
          void hydrate();
          clearTimeout(reconcileTimer);
          reconcileTimer = setTimeout(() => void hydrate(), RECONCILE_DELAY_MS);
        }
      });

    return () => {
      cancelled = true;
      clearTimeout(reconcileTimer);
      void client.removeChannel(channel);
    };
  }, [client, roomId, appendUnlessPresent]);

  const byId = useMemo(() => new Map(stamps.map((s) => [s.id, s])), [stamps]);

  return { stamps, byId, loading, error, addLocal, removeLocal };
}
