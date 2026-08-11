import type { Tables } from "./database.types";

/** DB のスキーマから直接導出する。手で二重定義しないこと。 */
export type Room = Tables<"rooms">;
export type Comment = Tables<"comments">;

/** Broadcast で飛ばすスタンプ。DB には保存しない。 */
export type StampPayload = {
  emoji: string;
  /** 連打をまとめた個数（送信側で STAMP_BATCH_MS ごとに集約） */
  count: number;
  /** 送信元の識別子。自分の送信をエコーバックで二重表示しないために使う。 */
  clientId: string;
  at: number;
};

export type SortMode = "popular" | "latest";

/** プレゼンター側のコメント表示スタイル */
export type DisplayMode = "bubble" | "flow";

export type ConnectionStatus = "connecting" | "connected" | "disconnected";
