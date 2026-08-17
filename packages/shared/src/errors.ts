import {
  COMMENT_MAX_LENGTH,
  ROOM_STAMP_MAX_PER_CLIENT,
  ROOM_STAMP_MAX_PER_ROOM,
} from "./constants";
import { DEFAULT_LOCALE, type Locale } from "./i18n";

/**
 * このパッケージが投げるエラーの種類。
 *
 * shared は「どちらの言語で見せるか」を知らない（発表者はコントロール窓の設定、
 * 観客はルームの設定で決まる）ので、**文言ではなくコードを投げて**
 * 表示側で `resolveErrorMessage` に通す。
 */
export type LayerTalkErrorCode =
  | "room_fetch_failed"
  /** ルーム自体が無い／自分のものではない。通信失敗（= room_fetch_failed）と必ず区別する。 */
  | "room_not_found"
  | "room_create_failed"
  | "room_join_failed"
  | "room_language_failed"
  | "comment_empty"
  | "comment_too_long"
  | "comment_insert_failed"
  | "like_failed"
  | "liked_ids_failed"
  | "stamp_fetch_failed"
  | "stamp_send_failed"
  | "stamp_upload_failed"
  | "stamp_delete_failed"
  | "stamp_limit_client"
  | "stamp_limit_room"
  | "entitlement_fetch_failed"
  | "moderation_failed"
  | "logo_upload_failed"
  | "session_failed"
  | "report_failed"
  | "image_unreadable"
  | "image_unsupported_device"
  | "image_convert_failed"
  | "unknown";

const ja: Record<LayerTalkErrorCode, string> = {
  room_fetch_failed: "ルームの取得に失敗しました",
  room_not_found: "このルームは見つかりませんでした",
  room_create_failed: "ルームの作成に失敗しました",
  room_join_failed: "ルームに入室できませんでした。コードとパスコードを確認してください",
  room_language_failed: "表示言語をルームに保存できませんでした",
  comment_empty: "コメントが空です",
  comment_too_long: `コメントは${COMMENT_MAX_LENGTH}文字までです`,
  comment_insert_failed: "コメントを送信できませんでした",
  like_failed: "いいねを反映できませんでした",
  liked_ids_failed: "いいねの状態を取得できませんでした",
  stamp_fetch_failed: "スタンプの取得に失敗しました",
  stamp_send_failed: "スタンプを送信できませんでした。接続を確認してもう一度お試しください",
  stamp_upload_failed: "スタンプを追加できませんでした",
  stamp_delete_failed: "スタンプを削除できませんでした",
  stamp_limit_client: `ひとつの端末から追加できるのは${ROOM_STAMP_MAX_PER_CLIENT}個までです`,
  stamp_limit_room: `このルームのカスタムスタンプは${ROOM_STAMP_MAX_PER_ROOM}個で上限です`,
  entitlement_fetch_failed: "購入状態を確認できませんでした",
  moderation_failed: "運営設定を更新できませんでした",
  logo_upload_failed: "ロゴを保存できませんでした",
  session_failed: "発表セッションを更新できませんでした",
  report_failed: "発表レポートを作成できませんでした",
  image_unreadable: "この画像は読み込めませんでした。別の画像を選んでください",
  image_unsupported_device: "この端末では画像を変換できませんでした",
  image_convert_failed: "画像の変換に失敗しました",
  unknown: "うまくいきませんでした",
};

const en: Record<LayerTalkErrorCode, string> = {
  room_fetch_failed: "Could not load the room",
  room_not_found: "That room no longer exists",
  room_create_failed: "Could not create the room",
  room_join_failed: "Could not join the room. Check the code and passcode",
  room_language_failed: "Could not save the language to the room",
  comment_empty: "Your comment is empty",
  comment_too_long: `Comments can be up to ${COMMENT_MAX_LENGTH} characters`,
  comment_insert_failed: "Could not send your comment",
  like_failed: "Could not register your like",
  liked_ids_failed: "Could not load your likes",
  stamp_fetch_failed: "Could not load the stamps",
  stamp_send_failed: "Could not send the stamp. Check your connection and try again",
  stamp_upload_failed: "Could not add the stamp",
  stamp_delete_failed: "Could not delete the stamp",
  stamp_limit_client: `You can add up to ${ROOM_STAMP_MAX_PER_CLIENT} stamps from one device`,
  stamp_limit_room: `This room is at its limit of ${ROOM_STAMP_MAX_PER_ROOM} custom stamps`,
  entitlement_fetch_failed: "Could not check your purchase",
  moderation_failed: "Could not update the event controls",
  logo_upload_failed: "Could not save the logo",
  session_failed: "Could not update the presentation session",
  report_failed: "Could not create the presentation report",
  image_unreadable: "That image could not be read. Please choose another one",
  image_unsupported_device: "This device cannot convert images",
  image_convert_failed: "Could not convert the image",
  unknown: "Something went wrong",
};

const catalogs: Record<Locale, Record<LayerTalkErrorCode, string>> = { ja, en };

/**
 * 表示側で訳せるエラー。
 *
 * `message` には ja の訳文を入れてある。`resolveErrorMessage` を通していない
 * 呼び出し側に渡っても、少なくとも読める文字列が残るようにするため。
 */
export class LayerTalkError extends Error {
  readonly code: LayerTalkErrorCode;
  /** Supabase / PostgREST の原文。ログと調査のために持つだけで、画面には出さない。 */
  readonly detail?: string;

  constructor(code: LayerTalkErrorCode, detail?: string) {
    super(ja[code]);
    this.name = "LayerTalkError";
    this.code = code;
    this.detail = detail;
  }
}

/** `instanceof` はバンドルをまたぐと壊れることがあるので、形で判定する。 */
function hasErrorCode(err: unknown): err is { code: LayerTalkErrorCode } {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    typeof (err as { code: unknown }).code === "string" &&
    (err as { code: string }).code in ja
  );
}

/**
 * 何が投げられても、その言語で読める 1 文にする。
 *
 * LayerTalkError 以外（想定外の例外、`TypeError: Failed to fetch` など）は
 * `unknown` に丸める。Supabase の英語の原文をそのまま画面に出さないため
 * — 原文は `LayerTalkError.detail` に載せてあるので、調査はそちらで行う。
 */
export function resolveErrorMessage(err: unknown, locale: Locale = DEFAULT_LOCALE): string {
  const table = catalogs[locale] ?? catalogs[DEFAULT_LOCALE];
  if (hasErrorCode(err)) return table[err.code];
  return table.unknown;
}
