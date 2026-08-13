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

/** カスタムスタンプの postgres_changes を購読するチャンネル名 */
export const roomStampChannelName = (roomId: string) => `room-stamps:${roomId}`;

export const STAMP_EVENT = "stamp";

// ------------------------------------------------- カスタムスタンプ（ルーム固有）

/** 画像の実体を置く Storage バケット。public なので署名なしで読める。 */
export const ROOM_STAMP_BUCKET = "room-stamps";

/** アップロード時に正規化する一辺の px。会場の Wi-Fi に数MBを流させないため。 */
export const ROOM_STAMP_SIZE = 128;

/** DB 側トリガ enforce_room_stamp_limits と必ず一致させる */
export const ROOM_STAMP_MAX_PER_ROOM = 24;
export const ROOM_STAMP_MAX_PER_CLIENT = 5;

const CUSTOM_STAMP_PREFIX = "custom:";

/**
 * Broadcast の emoji 欄に載せるキー。
 *
 * 画像の URL は載せない。載せると誰でも任意の画像 URL をスライド最前面に描画させられる。
 * 飛ばすのは id だけで、URL への解決は受信側が自分の持つ room_stamps 一覧で行う。
 * キーが文字列のままなので useStampChannel の集約 Map はそのまま使える。
 */
export const customStampKey = (id: string) => `${CUSTOM_STAMP_PREFIX}${id}`;

/** カスタムスタンプのキーなら id を、通常の絵文字なら null を返す。 */
export const parseCustomStampKey = (key: string) =>
  key.startsWith(CUSTOM_STAMP_PREFIX) ? key.slice(CUSTOM_STAMP_PREFIX.length) : null;

/** ルームコードの形（DB の gen_room_code と揃える）: 紛らわしい文字を除いた6桁 */
export const ROOM_CODE_LENGTH = 6;
export const ROOM_CODE_PATTERN = /^[2-9A-HJ-NP-Z]{6}$/;

export const normalizeRoomCode = (raw: string) => raw.trim().toUpperCase().replace(/\s/g, "");
