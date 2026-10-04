import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig, loadEnv } from "vite";
import { fileURLToPath, URL } from "node:url";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;
// @ts-expect-error process is a nodejs global
const distributionChannel = process.env.LAYERTALK_DISTRIBUTION_CHANNEL === "mas" ? "mas" : "direct";

/**
 * ビルド時に埋め込む値が欠けていたら**ビルドを落とす**。どちらも欠けたまま
 * 出荷すると画面には何も出ず、審査で初めて分かる。
 *
 * - **観客用 Web の URL**（`VITE_BILLING_API_BASE_URL` → `VITE_AUDIENCE_BASE_URL`）。
 *   `BILLING_API_BASE`（`lib/billing-http.ts`）が空文字になり、`openAudiencePage` が
 *   `Audience URL is not configured` で throw する。プライバシーポリシー・利用規約・
 *   サポートのボタンが全部無反応になる（App Store 5.1.1(i)）。
 * - **Event Pass の商品 ID**（`VITE_APPLE_EVENT_PASS_PRODUCT_ID`）。以前は既定値に落ちていたので、
 *   App Store Connect の商品 ID とずれても、価格が「—」のまま購入ボタンが押せないだけだった。
 *   サーバの `APPLE_EVENT_PASS_PRODUCT_ID` と同じ値にする。
 *
 * `.env.local` の値も数える。設定ファイルの `process.env` には .env が入らないので `loadEnv` で読み、
 * シェルの値を優先する（Vite 本体と同じ優先順位）。
 *
 * dev（`npm run dev`）は落とさない。localhost へのフォールバックは dev の前提で、
 * 「LAN IP の自動検出はしない」という既存の決めごとと対になっている。
 * **商品 ID は MAS だけ必須**（Windows と直接配布は StoreKit を使わない）。
 */
function assertBuildEnv(env: Record<string, string | undefined>, channel: "mas" | "direct") {
  const missing: string[] = [];
  if (!env.VITE_BILLING_API_BASE_URL && !env.VITE_AUDIENCE_BASE_URL) {
    missing.push(
      "VITE_BILLING_API_BASE_URL (or VITE_AUDIENCE_BASE_URL): the deployed audience web host. Without it the "
      + "privacy policy, terms and support links in the app are dead, which App Store guideline 5.1.1(i) does not allow "
      + "(the Microsoft Store requires a reachable privacy policy too).",
    );
  }
  if (channel === "mas" && !env.VITE_APPLE_EVENT_PASS_PRODUCT_ID) {
    missing.push(
      "VITE_APPLE_EVENT_PASS_PRODUCT_ID: the Event Pass product ID in App Store Connect, identical to the server's "
      + "APPLE_EVENT_PASS_PRODUCT_ID. Without it the price never loads and the Buy button stays disabled.",
    );
  }
  if (missing.length > 0) {
    throw new Error(`${channel} build: set the following before building.\n- ${missing.join("\n- ")}`);
  }
}

// https://vite.dev/config/
export default defineConfig(async ({ mode }) => {
  // **dev 以外はチャネルを問わず検査する。** 以前は `mas` だけだったので、Windows
  // （= `direct`）は観客 Web の URL が欠けたままビルドが通り、プライバシー・利用規約・
  // サポート・領収書のボタンが**全部無反応**のパッケージができた。
  // どちらのストアも「アプリ内から方針へ辿れること」を要求する。
  if (mode !== "development") {
    const fileEnv = loadEnv(mode, fileURLToPath(new URL(".", import.meta.url)), "VITE_");
    // @ts-expect-error process is a nodejs global
    assertBuildEnv({ ...fileEnv, ...process.env }, distributionChannel);
  }

  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@layertalk/billing-channel": fileURLToPath(new URL(`./src/lib/billing.${distributionChannel}.ts`, import.meta.url)),
      },
    },


    // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
    //
    // 1. prevent Vite from obscuring rust errors
    clearScreen: false,
    // 2. tauri expects a fixed port, fail if that port is not available
    server: {
      port: 1420,
      strictPort: true,
      host: host || false,
      hmr: host
        ? {
            protocol: "ws",
            host,
            port: 1421,
          }
        : undefined,
      watch: {
        // 3. tell Vite to ignore watching `src-tauri`
        ignored: ["**/src-tauri/**"],
      },
    },
  };
});
