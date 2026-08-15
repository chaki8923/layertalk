/**
 * Realtime の疎通スモークテスト。
 *
 *   npm run smoke:realtime
 *
 * このアプリの心臓は Realtime なので、環境やスキーマをいじった後はここを通す。
 * 確認するのは3点:
 *   1. postgres_changes INSERT（コメント追加）
 *   2. postgres_changes UPDATE（いいね）
 *   3. private broadcast（スタンプ。集計イベントはDBにも記録）
 *
 * 所有している検証用ルームのID/コードと、発表者セッションのaccess tokenを
 * LAYERTALK_SMOKE_ROOM_ID / LAYERTALK_SMOKE_ROOM_CODE /
 * LAYERTALK_SMOKE_PRESENTER_ACCESS_TOKEN で渡す。CAPTCHAを有効にした環境では
 * LAYERTALK_SMOKE_CAPTCHA_TOKEN も必要。
 *
 * Node 20 には WebSocket グローバルが無いため ws を注入している。
 * Node 22 以降なら transport の指定は不要（ブラウザ側は元から不要）。
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import WS from "ws";

const here = dirname(fileURLToPath(import.meta.url));

function readEnv(relativePath, keys) {
  const raw = readFileSync(join(here, "..", relativePath), "utf8");
  const found = {};
  for (const line of raw.split("\n")) {
    const [key, ...rest] = line.split("=");
    if (keys.includes(key?.trim())) found[key.trim()] = rest.join("=").trim();
  }
  return found;
}

const env = readEnv("apps/audience-web/.env.local", [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
]);

const URL = env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const ROOM = process.env.LAYERTALK_SMOKE_ROOM_ID;
const ROOM_CODE = process.env.LAYERTALK_SMOKE_ROOM_CODE;
const PRESENTER_TOKEN = process.env.LAYERTALK_SMOKE_PRESENTER_ACCESS_TOKEN;
const CAPTCHA_TOKEN = process.env.LAYERTALK_SMOKE_CAPTCHA_TOKEN;

if (!URL || !KEY || !ROOM || !ROOM_CODE || !PRESENTER_TOKEN) {
  console.error("Supabase URL/key と smoke 用 room ID/code/presenter access token が必要です");
  process.exit(1);
}

const results = { pgInsert: false, questionFlag: false, pgUpdate: false, broadcast: false };

const clientOptions = {
  auth: { persistSession: false, autoRefreshToken: false },
  realtime: { params: { eventsPerSecond: 20 }, transport: WS },
};

const rx = createClient(URL, KEY, {
  ...clientOptions,
  global: { headers: { Authorization: `Bearer ${PRESENTER_TOKEN}` } },
}); // 受信側（プレゼンター相当）
const tx = createClient(URL, KEY, clientOptions); // 送信側（観客相当）
rx.realtime.setAuth(PRESENTER_TOKEN);

const filter = `room_id=eq.${ROOM}`;

const commentChannel = rx
  .channel(`comments:${ROOM}`)
  .on("postgres_changes", { event: "INSERT", schema: "public", table: "comments", filter }, (p) => {
    console.log(
      "  ← postgres_changes INSERT:",
      p.new.content,
      p.new.is_question ? "(質問)" : "(通常)",
    );
    results.pgInsert = true;
    results.questionFlag = p.new.is_question === true;
  })
  .on("postgres_changes", { event: "UPDATE", schema: "public", table: "comments", filter }, (p) => {
    console.log("  ← postgres_changes UPDATE: likes_count =", p.new.likes_count);
    results.pgUpdate = true;
  });

const stampChannel = rx
  .channel(`room:${ROOM}:stamps`, { config: { private: true, broadcast: { self: true } } })
  .on("broadcast", { event: "stamp" }, ({ payload }) => {
    console.log("  ← broadcast stamp:", payload.emoji, "x", payload.count);
    results.broadcast = true;
  });

const subscribe = (channel, label) =>
  new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label}: subscribe timeout`)), 15000);
    channel.subscribe((status, err) => {
      console.log(`  [${label}] ${status}${err ? " " + err.message : ""}`);
      if (status === "SUBSCRIBED") {
        clearTimeout(timer);
        resolve();
      }
      if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
        clearTimeout(timer);
        reject(new Error(`${label}: ${status} ${err?.message ?? ""}`));
      }
    });
  });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  const { error: authError } = await tx.auth.signInAnonymously({
    options: CAPTCHA_TOKEN ? { captchaToken: CAPTCHA_TOKEN } : undefined,
  });
  if (authError) throw new Error("anonymous auth: " + authError.message);
  const { data: joined, error: joinError } = await tx.rpc("join_room", {
    p_code: ROOM_CODE,
    p_passcode: null,
  });
  if (joinError || !joined?.[0] || joined[0].id !== ROOM) {
    throw new Error("join_room: " + (joinError?.message ?? "room mismatch"));
  }

  console.log("購読を開始…");
  await Promise.all([subscribe(commentChannel, "comments"), subscribe(stampChannel, "stamps")]);

  // SUBSCRIBED が返っても、レプリケーションのフィルタが効き始めるまで
  // 1〜2秒のズレがある（この猶予が無いと INSERT を取りこぼす）。
  // アプリ側は useComments の再取得でこの穴を塞いでいる。
  console.log("\n(フィルタ有効化を待つ)");
  await sleep(2000);

  console.log("1) コメントを INSERT");
  const id = crypto.randomUUID();
  const { error: insErr } = await tx.rpc("post_comment", {
    p_id: id,
    p_room_id: ROOM,
    p_content: "Realtime スモークテスト",
    p_is_question: true,
  });
  if (insErr) throw new Error("insert: " + insErr.message);
  await sleep(2500);

  console.log("2) いいね RPC で UPDATE を発生させる");
  const { error: rpcErr } = await tx.rpc("toggle_comment_like", {
    p_comment_id: id,
    p_client_id: "realtime-smoke-client-01",
  });
  if (rpcErr) throw new Error("rpc: " + rpcErr.message);
  await sleep(2500);

  console.log("3) スタンプを private Broadcast");
  const { error: stampError } = await tx.rpc("send_stamp", {
    p_room_id: ROOM,
    p_stamp_key: "🔥",
    p_count: 5,
  });
  if (stampError) throw new Error("send_stamp: " + stampError.message);
  await sleep(2500);

  // コメントと集計イベントは保持ジョブが削除する。クライアントからの直接
  // DELETEは意図的に許可していない。
} catch (err) {
  console.error("\n❌", err.message);
} finally {
  console.log("\n=== 結果 ===");
  console.log("postgres_changes INSERT:", results.pgInsert ? "✅" : "❌");
  console.log("question flag payload:     ", results.questionFlag ? "✅" : "❌");
  console.log("postgres_changes UPDATE:", results.pgUpdate ? "✅" : "❌");
  console.log("private broadcast:         ", results.broadcast ? "✅" : "❌");
  await rx.removeAllChannels();
  process.exit(Object.values(results).every(Boolean) ? 0 : 1);
}
