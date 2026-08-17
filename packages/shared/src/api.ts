import type { LayerTalkClient } from "./client";
import { COMMENT_MAX_LENGTH, ROOM_STAMP_BUCKET, normalizeRoomCode } from "./constants";
import { LayerTalkError } from "./errors";
import type { Locale } from "./i18n";
import type {
  Comment,
  Entitlement,
  ModerationRules,
  PresentationReport,
  PresentationSession,
  PublicRoom,
  Room,
  RoomStamp,
} from "./types";

export async function findRoomByCode(
  client: LayerTalkClient,
  code: string,
): Promise<PublicRoom | null> {
  const { data, error } = await client.rpc("find_public_room_by_code", {
    p_code: normalizeRoomCode(code),
  });

  if (error) throw new LayerTalkError("room_fetch_failed", error.message);
  return data?.[0] ?? null;
}

export async function joinRoom(
  client: LayerTalkClient,
  code: string,
  passcode?: string,
): Promise<PublicRoom | null> {
  const { data, error } = await client.rpc("join_room", {
    p_code: normalizeRoomCode(code),
    p_passcode: passcode || null,
  });
  if (error) throw new LayerTalkError("room_join_failed", error.message);
  const room = data?.[0];
  return room ? ({ ...room, requires_passcode: Boolean(passcode) } as PublicRoom) : null;
}

export type CreateRoomInput = {
  title?: string;
  /** 発表者が選んでいる表示言語。観客用 Web はこれに従う。 */
  language?: Locale;
};

export async function createRoom(
  client: LayerTalkClient,
  { title, language = "ja" }: CreateRoomInput = {},
): Promise<Room> {
  const { data, error } = await client.rpc("create_room", {
    p_title: title?.trim() || null,
    p_language: language,
  });

  if (error) throw new LayerTalkError("room_create_failed", error.message);
  return data;
}

/**
 * 自分が持っているルームを引き直す。
 *
 * **「無い」と「引けなかった」を投げ分ける。** `resume_room` は該当が無いとき
 * `raise exception`（PostgREST では `P0001`）を返すので、それだけを `room_not_found` にする。
 * 呼び出し側は前者では手元の記憶を捨ててよいが、後者では捨ててはいけない
 * — 会場の Wi-Fi が切れているだけのときに、有効なルームを消してしまうため。
 */
export async function resumeRoom(client: LayerTalkClient, code: string): Promise<Room> {
  const { data, error } = await client.rpc("resume_room", { p_code: normalizeRoomCode(code) });
  if (error) {
    throw new LayerTalkError(error.code === "P0001" ? "room_not_found" : "room_fetch_failed", error.message);
  }
  return data;
}

/**
 * ルームの表示言語を差し替える。
 *
 * `rooms` には UPDATE ポリシーを作らない方針（ルームを閉じる概念を持たないため）なので、
 * 書き換えてよい列を関数側で固定した security definer の RPC 経由で行う。
 * `toggle_comment_like` と同じ考え方。
 */
export async function setRoomLanguage(
  client: LayerTalkClient,
  roomId: string,
  language: Locale,
): Promise<void> {
  const { error } = await client.rpc("set_room_language", {
    p_room_id: roomId,
    p_language: language,
  });

  if (error) throw new LayerTalkError("room_language_failed", error.message);
}

/**
 * 送信前に画面へ出すための行を組み立てる。
 *
 * id をここで採番するのが肝。同じ id で INSERT するので、Realtime で返ってくる行と
 * 自動的に一致し、「楽観的に出した行」と「サーバから来た行」の突き合わせが不要になる。
 */
export function buildComment(roomId: string, content: string, isQuestion = false): Comment {
  const trimmed = content.trim();
  if (!trimmed) throw new LayerTalkError("comment_empty");
  if (trimmed.length > COMMENT_MAX_LENGTH) {
    throw new LayerTalkError("comment_too_long");
  }

  return {
    id: crypto.randomUUID(),
    room_id: roomId,
    content: trimmed,
    is_question: isQuestion,
    likes_count: 0,
    created_at: new Date().toISOString(),
    status: "approved",
    question_status: isQuestion ? "open" : null,
    presentation_session_id: null,
    moderated_by: null,
    moderated_at: null,
  };
}

export async function insertComment(
  client: LayerTalkClient,
  comment: Comment,
): Promise<Comment> {
  const { data, error } = await client.rpc("post_comment", {
    p_id: comment.id,
    p_room_id: comment.room_id,
    p_content: comment.content,
    p_is_question: comment.is_question,
  });

  if (error) throw new LayerTalkError("comment_insert_failed", error.message);
  return data;
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

  if (error) throw new LayerTalkError("like_failed", error.message);
  return data as number;
}

/** この匿名Authユーザーがいいね済みのコメント id 群。clientId引数は旧API互換用。 */
export async function fetchLikedIds(
  client: LayerTalkClient,
  roomId: string,
  clientId: string,
): Promise<string[]> {
  const { data, error } = await client.rpc("liked_comment_ids", {
    p_room_id: roomId,
    p_client_id: clientId,
  });

  if (error) throw new LayerTalkError("liked_ids_failed", error.message);
  return (data as string[]) ?? [];
}

// ------------------------------------------------- カスタムスタンプ（ルーム固有）

const roomStampUrls = new Map<string, string>();

/** private Storageの署名URLキャッシュを返す。fetchRoomStamps/uploadRoomStampが事前に温める。 */
export function roomStampUrl(client: LayerTalkClient, path: string): string {
  void client;
  return roomStampUrls.get(path) ?? "";
}

export async function fetchRoomStampUrl(client: LayerTalkClient, path: string): Promise<string> {
  const cached = roomStampUrls.get(path);
  if (cached) return cached;
  const { data, error } = await client.storage.from(ROOM_STAMP_BUCKET).createSignedUrl(path, 3600);
  if (error) throw new LayerTalkError("stamp_fetch_failed", error.message);
  roomStampUrls.set(path, data.signedUrl);
  return data.signedUrl;
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

  if (error) throw new LayerTalkError("stamp_fetch_failed", error.message);
  // ⚠️ allSettled。reserve_room_stamp は commit してから upload するので、
  // 「行はあるが画像はまだ無い」行が一瞬できる。private バケットなのでその1件の
  // createSignedUrl は 404 し、Promise.all だと一覧まるごと throw して
  // バーが空になる。1件を諦めて残りを返し、次の取得で埋める。
  await Promise.allSettled((data ?? []).map((stamp) => fetchRoomStampUrl(client, stamp.path)));
  return data ?? [];
}

/** DB のトリガが投げる上限エラーを、観客に見せられるコードに置き換える。 */
function roomStampInsertError(raw: string): LayerTalkError {
  if (raw.includes("limit reached for client")) {
    return new LayerTalkError("stamp_limit_client", raw);
  }
  if (raw.includes("limit reached for room")) {
    return new LayerTalkError("stamp_limit_room", raw);
  }
  return new LayerTalkError("stamp_upload_failed", raw);
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
  const { data: reserved, error: reserveError } = await client.rpc("reserve_room_stamp", {
    p_room_id: roomId,
    p_client_id: clientId,
  });
  if (reserveError) throw roomStampInsertError(reserveError.message);
  const path = reserved.path;

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

  if (uploadError) {
    await client.rpc("delete_room_stamp", { p_stamp_id: reserved.id });
    throw new LayerTalkError("stamp_upload_failed", uploadError.message);
  }
  await fetchRoomStampUrl(client, path);
  return reserved;
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
  const { data: path, error } = await client.rpc("delete_room_stamp", { p_stamp_id: stamp.id });
  if (error) throw new LayerTalkError("stamp_delete_failed", error.message);
  await client.storage.from(ROOM_STAMP_BUCKET).remove([path || stamp.path]);
  roomStampUrls.delete(stamp.path);
}

export async function fetchActiveEntitlement(
  client: LayerTalkClient,
  roomId: string,
): Promise<Entitlement | null> {
  const { data, error } = await client.from("entitlements").select("*")
    .eq("room_id", roomId).eq("status", "active").gt("expires_at", new Date().toISOString())
    .order("expires_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw new LayerTalkError("entitlement_fetch_failed", error.message);
  return data;
}

export async function fetchModerationRules(
  client: LayerTalkClient,
  roomId: string,
): Promise<ModerationRules> {
  const { data, error } = await client.from("moderation_rules").select("*").eq("room_id", roomId).single();
  if (error) throw new LayerTalkError("moderation_failed", error.message);
  return data;
}

export async function updateModerationRules(
  client: LayerTalkClient,
  roomId: string,
  patch: Partial<Pick<ModerationRules, "comments_paused" | "reactions_paused" | "question_only" | "approval_mode" | "display_delay_seconds" | "custom_stamps_enabled">>,
): Promise<ModerationRules> {
  const { data, error } = await client.from("moderation_rules").update({ ...patch, updated_at: new Date().toISOString() })
    .eq("room_id", roomId).select().single();
  if (error) throw new LayerTalkError("moderation_failed", error.message);
  return data;
}

export async function setRoomPasscode(client: LayerTalkClient, roomId: string, passcode?: string) {
  const { error } = await client.rpc("set_room_passcode", { p_room_id: roomId, p_passcode: passcode || null });
  if (error) throw new LayerTalkError("moderation_failed", error.message);
}

export async function moderateComment(
  client: LayerTalkClient,
  commentId: string,
  action: "approve" | "hide" | "restore" | "mark_answered" | "mark_open",
): Promise<Comment> {
  const { data, error } = await client.rpc("moderate_comment", { p_comment_id: commentId, p_action: action });
  if (error) throw new LayerTalkError("moderation_failed", error.message);
  return data;
}

export async function startPresentationSession(client: LayerTalkClient, roomId: string) {
  const { data, error } = await client.rpc("start_presentation", { p_room_id: roomId });
  if (error) throw new LayerTalkError("session_failed", error.message);
  return data;
}

export async function endPresentationSession(client: LayerTalkClient, sessionId: string) {
  const { data, error } = await client.rpc("end_presentation", { p_session_id: sessionId });
  if (error) throw new LayerTalkError("session_failed", error.message);
  return data;
}

export async function fetchPresentationReport(
  client: LayerTalkClient,
  session: PresentationSession,
): Promise<PresentationReport> {
  const [{ data: comments, error: commentsError }, { data: stamps, error: stampsError }] = await Promise.all([
    client.from("comments").select("*").eq("presentation_session_id", session.id).order("created_at"),
    client.from("stamp_events").select("*").eq("presentation_session_id", session.id).order("created_at"),
  ]);
  if (commentsError || stampsError) throw new LayerTalkError("report_failed", commentsError?.message ?? stampsError?.message);
  const minuteCounts = new Map<number, number>();
  const start = new Date(session.started_at).getTime();
  for (const comment of comments ?? []) {
    const minute = Math.max(0, Math.floor((new Date(comment.created_at).getTime() - start) / 60000));
    minuteCounts.set(minute, (minuteCounts.get(minute) ?? 0) + 1);
  }
  for (const stamp of stamps ?? []) {
    const minute = Math.max(0, Math.floor((new Date(stamp.created_at).getTime() - start) / 60000));
    minuteCounts.set(minute, (minuteCounts.get(minute) ?? 0) + stamp.count);
  }
  const peakMinute = [...minuteCounts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] ?? null;
  const questions = (comments ?? []).filter((comment) => comment.is_question);
  return {
    session,
    comments: comments ?? [],
    stampEvents: stamps ?? [],
    peakMinute,
    totals: {
      comments: comments?.length ?? 0,
      questions: questions.length,
      openQuestions: questions.filter((question) => question.question_status === "open").length,
      stamps: (stamps ?? []).reduce((sum, stamp) => sum + stamp.count, 0),
    },
  };
}
