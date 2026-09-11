import { listen } from "@tauri-apps/api/event";

import { supabase } from "./supabase";
import { selftestHeartbeat } from "./tauri";

/**
 * `LAYERTALK_OVERLAY_SELFTEST=pump` の計測プローブ。
 *
 * **移行計画いちばんの未知数を潰すためだけに置いてある。**
 * ネイティブ経路では、Supabase の購読を持っているオーバーレイ窓の WKWebView が
 * tao 窓（一度も `show()` されない）にぶら下がったまま動き続ける。macOS が
 * App Nap や WKWebView の抑制でこれを止めるなら、購読を Rust 側へ移す
 * ＝ Realtime を Rust で実装し直すことになるので、**設計の分岐点**になる。
 *
 * 計るのは3つだけ:
 * - **タイマー**: `setInterval(1000)` の実測間隔。supabase-js のハートビートも
 *   タイマーなので、ここが延びれば購読も道連れになる
 * - **ソケット**: 20秒ごとに自分宛の broadcast を投げて往復を見る
 * - **ページの状態**: `visibilitychange` / `freeze` / `resume`。止まった理由の切り分け用
 *
 * 通報はすべて Rust の `selftest_heartbeat` → `LAYERTALK_DEBUG_OVERLAY` のログ。
 * 解析は grep で足りる。
 */
export function startSelftestPump(win: "overlay" | "questions" | "control"): () => void {
  const startedAt = Date.now();
  // **窓ごとに分けて記録する。** 見えていない窓（オーバーレイ）と見えている窓（質問パネル）で
  // 結果が割れるなら、購読をどちらに置くかがそのまま答えになる。
  const report = (kind: string, seq: number, detail: string) => {
    const elapsed = Math.round((Date.now() - startedAt) / 1000);
    void selftestHeartbeat(`${win}-${kind}`, seq, `t=${elapsed}s ${detail}`).catch(() => {});
  };

  report("start", 0, `visibility=${document.visibilityState} ua-hidden=${document.hidden}`);

  // --- タイマー ---------------------------------------------------------
  // 「何回来たか」ではなく**間隔**を残す。抑制は回数ではなく間延びとして出る。
  let ticks = 0;
  let lastTick = Date.now();
  const timer = window.setInterval(() => {
    const now = Date.now();
    const gap = now - lastTick;
    lastTick = now;
    ticks += 1;
    report("tick", ticks, `gap=${gap}ms visibility=${document.visibilityState}`);
  }, 1000);

  // --- ソケット ---------------------------------------------------------
  // **public broadcast で張る。** アプリ本体は private だが、知りたいのは
  // ソケットの生存であって認可ではない。private だと `realtime.messages` の
  // RLS が絡んで、切り分けたい対象がぼやける。
  const sentAt = new Map<number, number>();
  let sends = 0;
  let recvs = 0;
  const channel = supabase
    // **チャンネル名は固定にする。** 外（Node）から同じ名前に投げ込んで、
    // 「止まった webview が受信で起きるか」を試すため（`scripts/pump-poke-outside.mjs`）。
    .channel(`selftest-pump-${win}`, {
      config: { broadcast: { self: true } },
    })
    .on("broadcast", { event: "ping" }, ({ payload }) => {
      const seq = Number((payload as { seq?: number }).seq ?? -1);
      const sent = sentAt.get(seq);
      sentAt.delete(seq);
      recvs += 1;
      report("recv", seq, sent ? `rtt=${Date.now() - sent}ms recvs=${recvs}` : `rtt=? recvs=${recvs}`);
    });

  let pinger: number | null = null;
  const ping = () => {
    sends += 1;
    const seq = sends;
    sentAt.set(seq, Date.now());
    void channel
      .send({ type: "broadcast", event: "ping", payload: { seq } })
      .then((status) => report("send", seq, `status=${String(status)}`))
      .catch((error: unknown) => report("send", seq, `error=${String(error)}`));
  };

  channel.subscribe((status, error) => {
    report("channel", sends, `status=${status}${error ? ` error=${error.message}` : ""}`);
    if (status !== "SUBSCRIBED" || pinger !== null) return;
    ping();
    pinger = window.setInterval(ping, 20_000);
  });

  // --- Rust からの突き（`pump-poke` のときだけ飛んでくる） ----------------
  // 隠れた webview が止まったあと、**IPC で起こし直せるか**を見る。
  // 起こせるなら、購読の置き場所を変えずに済む。
  let pokes = 0;
  const unlistenPoke = listen<number>("selftest-poke", ({ payload }) => {
    pokes += 1;
    report("poke", pokes, `n=${payload} ticks=${ticks}`);
  });

  // --- ページの状態 -----------------------------------------------------
  const onVisibility = () => report("page", ticks, `visibilitychange=${document.visibilityState}`);
  const onFreeze = () => report("page", ticks, "freeze");
  const onResume = () => report("page", ticks, "resume");
  document.addEventListener("visibilitychange", onVisibility);
  document.addEventListener("freeze", onFreeze);
  document.addEventListener("resume", onResume);

  return () => {
    window.clearInterval(timer);
    if (pinger !== null) window.clearInterval(pinger);
    document.removeEventListener("visibilitychange", onVisibility);
    document.removeEventListener("freeze", onFreeze);
    document.removeEventListener("resume", onResume);
    void unlistenPoke.then((off) => off());
    void supabase.removeChannel(channel);
  };
}
