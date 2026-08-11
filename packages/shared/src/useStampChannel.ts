import { useCallback, useEffect, useRef } from "react";
import type { LayerTalkClient } from "./client";
import { STAMP_BATCH_MS, STAMP_EVENT, STAMP_MAX_BATCH, stampChannelName } from "./constants";
import type { StampPayload } from "./types";

export type UseStampChannelOptions = {
  client: LayerTalkClient | null;
  roomId: string | null;
  clientId: string;
  /** 受信時のコールバック。presenter 側でパーティクルを生成する。 */
  onStamp?: (payload: StampPayload) => void;
  /** 自分が送ったスタンプのエコーバックを無視するか（観客側は true 相当が自然） */
  ignoreSelf?: boolean;
};

/**
 * スタンプの Broadcast 送受信。DB は一切経由しない。
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
}: UseStampChannelOptions) {
  const channelRef = useRef<ReturnType<LayerTalkClient["channel"]> | null>(null);
  const pendingRef = useRef<Map<string, number>>(new Map());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const onStampRef = useRef(onStamp);
  useEffect(() => {
    onStampRef.current = onStamp;
  }, [onStamp]);

  useEffect(() => {
    if (!client || !roomId) return;

    const channel = client
      .channel(stampChannelName(roomId), {
        // 自分の送信もサーバから返してもらう。presenter は自分では送らないので影響なく、
        // 観客側は ignoreSelf で落とす。
        config: { broadcast: { self: true } },
      })
      .on("broadcast", { event: STAMP_EVENT }, ({ payload }) => {
        const stamp = payload as StampPayload;
        if (ignoreSelf && stamp.clientId === clientId) return;
        onStampRef.current?.(stamp);
      })
      .subscribe();

    channelRef.current = channel;

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      pendingRef.current.clear();
      channelRef.current = null;
      void client.removeChannel(channel);
    };
  }, [client, roomId, clientId, ignoreSelf]);

  const flush = useCallback(() => {
    timerRef.current = null;
    const channel = channelRef.current;
    const pending = pendingRef.current;
    if (!channel || pending.size === 0) return;

    for (const [emoji, count] of pending) {
      const payload: StampPayload = {
        emoji,
        count: Math.min(count, STAMP_MAX_BATCH),
        clientId,
        at: Date.now(),
      };
      void channel.send({ type: "broadcast", event: STAMP_EVENT, payload });
    }
    pending.clear();
  }, [clientId]);

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
