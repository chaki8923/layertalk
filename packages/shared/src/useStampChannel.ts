"use client";

import { useCallback, useEffect, useRef } from "react";
import type { LayerTalkClient } from "./client";
import { STAMP_BATCH_MS, STAMP_EVENT, STAMP_MAX_BATCH, stampChannelName } from "./constants";
import { LayerTalkError } from "./errors";
import type { StampPayload } from "./types";

export type UseStampChannelOptions = {
  client: LayerTalkClient | null;
  roomId: string | null;
  clientId: string;
  /** 受信時のコールバック。presenter 側でパーティクルを生成する。 */
  onStamp?: (payload: StampPayload) => void;
  /** 自分が送ったスタンプのエコーバックを無視するか（観客側は true 相当が自然） */
  ignoreSelf?: boolean;
  /** 送信またはPrivate Broadcastの購読に失敗したときの通知先。 */
  onError?: (error: LayerTalkError) => void;
};

/**
 * スタンプの private Broadcast 送受信。送信RPCはレポート用の集計行もDBへ記録する。
 *
 * 送信は STAMP_BATCH_MS ごとに絵文字単位で集約する。連打をそのまま流すと
 * Realtime のレート上限に当たってメッセージが黙って落ちるため。
 */
export function useStampChannel({
  client,
  roomId,
  clientId,
  onStamp,
  ignoreSelf = false,
  onError,
}: UseStampChannelOptions) {
  const pendingRef = useRef<Map<string, number>>(new Map());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onStampRef = useRef(onStamp);
  useEffect(() => {
    onStampRef.current = onStamp;
  }, [onStamp]);

  const onErrorRef = useRef(onError);
  useEffect(() => {
    onErrorRef.current = onError;
  }, [onError]);

  useEffect(() => {
    if (!client || !roomId) return;

    let disposed = false;

    const channel = client
      .channel(stampChannelName(roomId), {
        // 自分の送信もサーバから返してもらう。presenter は自分では送らないので影響なく、
        // 観客側は ignoreSelf で落とす。
        config: { private: true, broadcast: { self: true } },
      })
      .on("broadcast", { event: STAMP_EVENT }, ({ payload }) => {
        const stamp = payload as StampPayload;
        if (ignoreSelf && stamp.clientId === clientId) return;
        onStampRef.current?.(stamp);
      });

    // Private Broadcastは購読前にRealtimeへ現在のAuthセッションを渡す。
    // コメントのpostgres_changesとは認可経路が別なので、明示的に同期する。
    void client.realtime.setAuth().then(() => {
      if (disposed) return;
      channel.subscribe((status, error) => {
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          onErrorRef.current?.(new LayerTalkError("stamp_send_failed", error?.message ?? status));
        }
      });
    }).catch((error: unknown) => {
      const detail = error instanceof Error ? error.message : String(error);
      onErrorRef.current?.(new LayerTalkError("stamp_send_failed", detail));
    });

    return () => {
      disposed = true;
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      pendingRef.current.clear();
      void client.removeChannel(channel);
    };
  }, [client, roomId, clientId, ignoreSelf]);

  const flush = useCallback(() => {
    timerRef.current = null;
    const pending = pendingRef.current;
    if (!client || !roomId || pending.size === 0) return;

    // 受信用チャンネルが準備中・再接続中でも送信RPCは独立して実行できる。
    // 先にスナップショットを取り、送信中の新しいタップと混ぜない。
    const batch = [...pending];
    pending.clear();
    for (const [emoji, count] of batch) {
      void (async () => {
        try {
          const { error } = await client.rpc("send_stamp", {
            p_room_id: roomId,
            p_stamp_key: emoji,
            p_count: Math.min(count, STAMP_MAX_BATCH),
          });
          if (error) onErrorRef.current?.(new LayerTalkError("stamp_send_failed", error.message));
        } catch (error) {
          const detail = error instanceof Error ? error.message : String(error);
          onErrorRef.current?.(new LayerTalkError("stamp_send_failed", detail));
        }
      })();
    }
  }, [client, roomId]);

  /** 1タップ = 1回呼ぶ。実際の送信は次の flush でまとめて行われる。 */
  const sendStamp = useCallback(
    (emoji: string) => {
      const pending = pendingRef.current;
      pending.set(emoji, (pending.get(emoji) ?? 0) + 1);

      if (timerRef.current === null) {
        timerRef.current = setTimeout(flush, STAMP_BATCH_MS);
      }
    },
    [flush],
  );

  return { sendStamp };
}
