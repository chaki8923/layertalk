import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { fileURLToPath, URL } from "node:url";

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;
// @ts-expect-error process is a nodejs global
const distributionChannel = process.env.LAYERTALK_DISTRIBUTION_CHANNEL === "mas" ? "mas" : "direct";

/**
 * MAS ビルドだけ、観客用 Web の URL が空なら**ビルドを落とす**。
 *
 * `BILLING_API_BASE`（`lib/billing-http.ts`）は `VITE_BILLING_API_BASE_URL` →
 * `VITE_AUDIENCE_BASE_URL` の順に見て、どちらも無いと空文字になる。空のまま出荷すると
 * `openAudiencePage` が `Audience URL is not configured` で throw し、
 * **プライバシーポリシー・利用規約・サポートのボタンが全部無反応**になる。
 * App Store 5.1.1(i) が「アプリ内からポリシーへ辿れること」を要求している導線そのもので、
 * しかも画面には何も出ないので、審査で初めて分かる。
 *
 * 直接配布版は落とさない。localhost へのフォールバックは dev の前提で、
 * 「LAN IP の自動検出はしない」という既存の決めごとと対になっている。
 */
if (distributionChannel === "mas") {
  // @ts-expect-error process is a nodejs global
  const base = process.env.VITE_BILLING_API_BASE_URL || process.env.VITE_AUDIENCE_BASE_URL;
  if (!base) {
    throw new Error(
      "MAS build: set VITE_BILLING_API_BASE_URL (or VITE_AUDIENCE_BASE_URL) to the deployed "
      + "audience web host. Without it the privacy policy, terms and support links in the app "
      + "are dead, which App Store guideline 5.1.1(i) does not allow.",
    );
  }
}

// https://vite.dev/config/
export default defineConfig(async () => ({
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
}));
