import type { LayerTalkClient } from "./client";
import { COMMENT_MAX_LENGTH, normalizeRoomCode } from "./constants";
import type { Comment, Room } from "./types";

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
