/**
 * Tauri の dev ビルド（`tauri.conf.json` の devUrl）。リリース版の origin は
 * `tauri://localhost` になるので、この値は dev でしか現れない。
 *
 * ここで通すのはローカルで動かした audience-web だけ。**デプロイ先はこの穴を開けない**
 * ので、dev の発表者アプリから本番 API を叩くときは `ALLOWED_TAURI_ORIGINS` で明示的に足すこと
 * （不要になったら消せるように、コードではなく環境変数側に置く）。
 */
const TAURI_DEV_ORIGIN = "http://localhost:1420";

const ALLOWED_ORIGINS = new Set([
  "tauri://localhost",
  "http://tauri.localhost",
  "https://tauri.localhost",
  ...(process.env.NODE_ENV === "production" ? [] : [TAURI_DEV_ORIGIN]),
  ...(process.env.ALLOWED_TAURI_ORIGINS ?? "").split(",").map((origin) => origin.trim()).filter(Boolean),
]);

export function corsHeaders(request: Request) {
  const origin = request.headers.get("origin");
  return {
    "Access-Control-Allow-Origin": origin && ALLOWED_ORIGINS.has(origin) ? origin : "null",
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    Vary: "Origin",
  };
}

export function corsJson(request: Request, body: unknown, init: ResponseInit = {}) {
  return Response.json(body, { ...init, headers: { ...corsHeaders(request), ...init.headers } });
}
