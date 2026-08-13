import type { LayerTalkClient } from "./client";
import {
  COMMENT_MAX_LENGTH,
  ROOM_STAMP_BUCKET,
  ROOM_STAMP_MAX_PER_CLIENT,
  ROOM_STAMP_MAX_PER_ROOM,
  normalizeRoomCode,
} from "./constants";
import type { Comment, Room, RoomStamp } from "./types";

export async function findRoomByCode(
  client: LayerTalkClient,
  code: string,
): Promise<Room | null> {
  const { data, error } = await client
    .from("rooms")
    .select("*")
    .eq("code", normalizeRoomCode(code))
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}

export async function createRoom(client: LayerTalkClient, title?: string): Promise<Room> {
  const { data, error } = await client
    .from("rooms")
    .insert({ title: title?.trim() || null })
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

/**
 * 送信前に画面へ出すための行を組み立てる。
 *
 * id をここで採番するのが肝。同じ id で INSERT するので、Realtime で返ってくる行と
 * 自動的に一致し、「楽観的に出した行」と「サーバから来た行」の突き合わせが不要になる。
 */
export function buildComment(roomId: string, content: string, isQuestion = false): Comment {
  const trimmed = content.trim();
  if (!trimmed) throw new Error("コメントが空です");
  if (trimmed.length > COMMENT_MAX_LENGTH) {
    throw new Error(`コメントは${COMMENT_MAX_LENGTH}文字までです`);
  }

  return {
    id: crypto.randomUUID(),
    room_id: roomId,
    content: trimmed,
    is_question: isQuestion,
    likes_count: 0,
    created_at: new Date().toISOString(),
  };
}

export async function insertComment(
  client: LayerTalkClient,
  comment: Comment,
): Promise<void> {
  const { error } = await client.from("comments").insert({
    id: comment.id,
    room_id: comment.room_id,
    content: comment.content,
    is_question: comment.is_question,
  });

  if (error) throw new Error(error.message);
}

/** いいねのトグル。戻り値は更新後の likes_count。 */
export async function toggleLike(
  client: LayerTalkClient,
  commentId: string,
  clientId: string,
): Promise<number> {
  const { data, error } = await client.rpc("toggle_comment_like", {
    p_comment_id: commentId,
    p_client_id: clientId,
  });

  if (error) throw new Error(error.message);
  return data as number;
}

/** この端末が既にいいね済みのコメント id 群。localStorage を信用せずサーバに問い合わせる。 */
export async function fetchLikedIds(
  client: LayerTalkClient,
  roomId: string,
  clientId: string,
): Promise<string[]> {
  const { data, error } = await client.rpc("liked_comment_ids", {
    p_room_id: roomId,
    p_client_id: clientId,
  });

  if (error) throw new Error(error.message);
  return (data as string[]) ?? [];
}

// ------------------------------------------------- カスタムスタンプ（ルーム固有）

/** Storage のパスから公開 URL を作る。バケットが public なので署名は要らない。 */
export function roomStampUrl(client: LayerTalkClient, path: string): string {
  return client.storage.from(ROOM_STAMP_BUCKET).getPublicUrl(path).data.publicUrl;
}

export async function fetchRoomStamps(
  client: LayerTalkClient,
  roomId: string,
): Promise<RoomStamp[]> {
  const { data, error } = await client
    .from("room_stamps")
    .select("*")
    .eq("room_id", roomId)
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);
  return data ?? [];
}

/** DB のトリガが投げる上限エラーを、観客に見せる日本語に置き換える。 */
function roomStampInsertMessage(raw: string): string {
  if (raw.includes("limit reached for client")) {
    return `ひとつの端末から追加できるのは${ROOM_STAMP_MAX_PER_CLIENT}個までです`;
  }
  if (raw.includes("limit reached for room")) {
    return `このルームのカスタムスタンプは${ROOM_STAMP_MAX_PER_ROOM}個で上限です`;
  }
  return raw;
}

export type UploadRoomStampInput = {
  roomId: string;
  clientId: string;
  /** toStampPng で正規化済みの PNG */
  blob: Blob;
};

/**
 * 画像を Storage に上げてから room_stamps に登録する。
 *
 * 登録に失敗したら上げたファイルを消す。上限トリガに当たったときに、
 * どこからも参照されないファイルが Storage に残り続けるのを防ぐため。
 */
export async function uploadRoomStamp(
  client: LayerTalkClient,
  { roomId, clientId, blob }: UploadRoomStampInput,
): Promise<RoomStamp> {
  const path = `${roomId}/${crypto.randomUUID()}.png`;

  const { error: uploadError } = await client.storage
    .from(ROOM_STAMP_BUCKET)
    .upload(path, blob, {
      contentType: "image/png",
      // パスは uuid で不変なので本当はいくらでもキャッシュさせてよいが、消した画像が
      // CDN に残る時間もこれで決まる（実測: 削除直後の公開URLはまだ 200 を返す）。
      // 発表1回ぶんを賄えれば十分なので1時間で切る。
      cacheControl: "3600",
      upsert: false,
    });

  if (uploadError) throw new Error(uploadError.message);

  const { data, error } = await client
    .from("room_stamps")
    .insert({ room_id: roomId, client_id: clientId, path })
    .select()
    .single();

  if (error) {
    await client.storage.from(ROOM_STAMP_BUCKET).remove([path]);
    throw new Error(roomStampInsertMessage(error.message));
  }

  return data;
}

/**
 * カスタムスタンプを消す。
 *
 * 行が真実（押せるかどうかも、オーバーレイに出るかどうかも行で決まる）なので行を先に消す。
 * ファイルの削除に失敗しても UI 上はもう消えている。
 */
export async function deleteRoomStamp(
  client: LayerTalkClient,
  stamp: Pick<RoomStamp, "id" | "path">,
): Promise<void> {
  const { error } = await client.from("room_stamps").delete().eq("id", stamp.id);
  if (error) throw new Error(error.message);

  await client.storage.from(ROOM_STAMP_BUCKET).remove([stamp.path]);
}
