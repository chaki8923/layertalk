/**
 * 凍っているはずの webview に、アプリの外から Realtime のデータを投げ込む。
 *
 *   node scripts/pump-poke-outside.mjs [遅延秒=75]
 *
 * `LAYERTALK_OVERLAY_SELFTEST=pump-control-live` のプローブが張っている固定名のチャンネル
 * （`selftest-pump-control`）へ broadcast を投げる。コメントは postgres_changes、つまり同じ
 * realtime ソケットの受信フレームで届くので、ここで届けば発表中のコメントも届く。
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import WS from "ws";

const here = dirname(fileURLToPath(import.meta.url));
const raw = readFileSync(join(here, "..", "apps/presenter-app/.env.local"), "utf8");
const env = {};
for (const line of raw.split("\n")) {
  const [key, ...rest] = line.split("=");
  if (key) env[key.trim()] = rest.join("=").trim();
}

const client = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
  realtime: { transport: WS },
});

const waitSec = Number(process.argv[2] ?? 75);

for (const win of ["control"]) {
  const channel = client.channel(`selftest-pump-${win}`, {
    config: { broadcast: { self: false } },
  });
  await new Promise((resolve) => channel.subscribe((status) => status === "SUBSCRIBED" && resolve()));
  console.log(`${win}: 購読しました`);
  channel.__win = win;
  client.__channels ??= [];
  client.__channels.push(channel);
}

console.log(`${waitSec} 秒待ってから投げます（webview が止まりきるのを待つ）`);
await new Promise((resolve) => setTimeout(resolve, waitSec * 1000));

for (const channel of client.__channels) {
  const seq = 900 + client.__channels.indexOf(channel);
  const status = await channel.send({ type: "broadcast", event: "ping", payload: { seq } });
  console.log(`${channel.__win}: seq=${seq} 送信 → ${status}  (${new Date().toISOString()})`);
}

await new Promise((resolve) => setTimeout(resolve, 3000));
process.exit(0);
