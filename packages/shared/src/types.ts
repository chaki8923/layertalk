import type { Tables } from "./database.types";

/** DB のスキーマから直接導出する。手で二重定義しないこと。 */
export type Room = Tables<"rooms">;
export type Comment = Tables<"comments">;

/** 観客がアップロードした、そのルームでだけ押せる画像スタンプ。 */
export type RoomStamp = Tables<"room_stamps">;

/** Broadcast で飛ばすスタンプ。DB には保存しない。 */
export type StampPayload = {
  /**
   * 押されたスタンプのキー。組み込みは絵文字そのもの、カスタムは
   * `custom:<room_stamps.id>`（customStampKey / parseCustomStampKey を使う）。
   * 画像 URL をここに載せてはいけない。理由は constants.ts の customStampKey を参照。
   */
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
