/** 観客が押せるスタンプ。増やすときは presenter 側のパーティクル上限も見直すこと。 */
export const STAMP_EMOJIS = ["👍", "❤️", "😂", "👀", "🔥", "👏"] as const;
export type StampEmoji = (typeof STAMP_EMOJIS)[number];

/** DB 側の CHECK 制約と必ず一致させる（comments.content の char_length） */
export const COMMENT_MAX_LENGTH = 140;

/** スタンプ連打をまとめる窓。Realtime の既定レート上限に触れないための間引き。 */
export const STAMP_BATCH_MS = 100;

/** 1回の送信でまとめられるスタンプの上限（悪意ある大量送信の抑止） */
export const STAMP_MAX_BATCH = 20;

/** 初回に読み込むコメント件数 */
export const INITIAL_COMMENT_LIMIT = 200;

/** Broadcast のチャンネル名。postgres_changes とは別チャンネルにする。 */
export const stampChannelName = (roomId: string) => `stamps:${roomId}`;

/** コメントの postgres_changes を購読するチャンネル名 */
export const commentChannelName = (roomId: string) => `comments:${roomId}`;

export const STAMP_EVENT = "stamp";

/** ルームコードの形（DB の gen_room_code と揃える）: 紛らわしい文字を除いた6桁 */
export const ROOM_CODE_LENGTH = 6;
export const ROOM_CODE_PATTERN = /^[2-9A-HJ-NP-Z]{6}$/;

export const normalizeRoomCode = (raw: string) => raw.trim().toUpperCase().replace(/\s/g, "");
