/**
 * Realtime の疎通スモークテスト。
 *
 *   npm run smoke:realtime
 *
 * このアプリの心臓は Realtime なので、環境やスキーマをいじった後はここを通す。
 * 確認するのは3点:
 *   1. postgres_changes INSERT（コメント追加）
 *   2. postgres_changes UPDATE（いいね）
 *   3. broadcast（スタンプ・DB 非経由）
 *
 * 事前に検証用ルームが1つ必要。無ければ:
 *   insert into public.rooms (title) values ('smoke test') returning id, code;
 * で作って ROOM_ID に入れるか、環境変数 LAYERTALK_SMOKE_ROOM_ID で渡す。
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
const ROOM = process.env.LAYERTALK_SMOKE_ROOM_ID ?? "166d9fb1-d3b2-4644-8cd4-7c19ef6f9134";

if (!URL || !KEY) {
  console.error("apps/audience-web/.env.local に URL / anon キーがありません");
  process.exit(1);
}

const results = { pgInsert: false, pgUpdate: false, broadcast: false };

const clientOptions = {
  auth: { persistSession: false, autoRefreshToken: false },
  realtime: { params: { eventsPerSecond: 20 }, transport: WS },
};

const rx = createClient(URL, KEY, clientOptions); // 受信側（プレゼンター相当）
const tx = createClient(URL, KEY, clientOptions); // 送信側（観客相当）

const filter = `room_id=eq.${ROOM}`;

const commentChannel = rx
  .channel(`comments:${ROOM}`)
  .on("postgres_changes", { event: "INSERT", schema: "public", table: "comments", filter }, (p) => {
    console.log("  ← postgres_changes INSERT:", p.new.content);
    results.pgInsert = true;
  })
  .on("postgres_changes", { event: "UPDATE", schema: "public", table: "comments", filter }, (p) => {
    console.log("  ← postgres_changes UPDATE: likes_count =", p.new.likes_count);
    results.pgUpdate = true;
  });

const stampChannel = rx
  .channel(`stamps:${ROOM}`, { config: { broadcast: { self: true } } })
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
  console.log("購読を開始…");
  await Promise.all([subscribe(commentChannel, "comments"), subscribe(stampChannel, "stamps")]);

  // SUBSCRIBED が返っても、レプリケーションのフィルタが効き始めるまで
  // 1〜2秒のズレがある（この猶予が無いと INSERT を取りこぼす）。
  // アプリ側は useComments の再取得でこの穴を塞いでいる。
  console.log("\n(フィルタ有効化を待つ)");
  await sleep(2000);

  console.log("1) コメントを INSERT");
  const id = crypto.randomUUID();
  const { error: insErr } = await tx
    .from("comments")
    .insert({ id, room_id: ROOM, content: "Realtime スモークテスト" });
  if (insErr) throw new Error("insert: " + insErr.message);
  await sleep(2500);

  console.log("2) いいね RPC で UPDATE を発生させる");
  const { error: rpcErr } = await tx.rpc("toggle_comment_like", {
    p_comment_id: id,
    p_client_id: "realtime-smoke-client-01",
  });
  if (rpcErr) throw new Error("rpc: " + rpcErr.message);
  await sleep(2500);

  console.log("3) スタンプを Broadcast");
  console.log(
    "  send() =>",
    await stampChannel.send({
      type: "broadcast",
      event: "stamp",
      payload: { emoji: "🔥", count: 5, clientId: "realtime-smoke-client-01", at: Date.now() },
    }),
  );
  await sleep(2500);

  // 後片付け（comments の DELETE は anon では通らないので残るが、
  // ルームごと消せば cascade で消える）
  await tx.from("comments").delete().eq("id", id);
} catch (err) {
  console.error("\n❌", err.message);
} finally {
  console.log("\n=== 結果 ===");
  console.log("postgres_changes INSERT:", results.pgInsert ? "✅" : "❌");
  console.log("postgres_changes UPDATE:", results.pgUpdate ? "✅" : "❌");
  console.log("broadcast (anon):       ", results.broadcast ? "✅" : "❌");
  await rx.removeAllChannels();
  process.exit(Object.values(results).every(Boolean) ? 0 : 1);
}
