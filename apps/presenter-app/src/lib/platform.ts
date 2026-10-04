/**
 * 画面に出すプラットフォーム依存の語。
 *
 * **ここは翻訳ではなく事実なので、`i18n` のカタログ（`ja.ts` / `en.ts`）には入れない。**
 * あちらは「どちらの言語で言うか」を持つ場所で、「どの OS で動いているか」は別軸。
 * 両方をカタログに入れると、言語×OS の組み合わせだけキーが増える。
 *
 * 判定に `navigator.userAgent` を使っているのは、Tauri のコマンドを1往復させずに
 * 同期で決めたいため（最初の描画より前に要る）。WebView2 は "Windows NT" を含み、
 * WKWebView は含まない。
 */
export const IS_WINDOWS =
  typeof navigator !== "undefined" && navigator.userAgent.includes("Windows");

/**
 * コントロール窓を呼び出すショートカットの表記。
 *
 * **Rust 側で実際に登録しているキーと必ず揃えること** — `lib.rs` の
 * `CONTROL_SHORTCUT_MODIFIERS`（macOS は SUPER、それ以外は CONTROL）。
 * ずれると「書いてあるキーを押しても何も起きない」という、報告されるまで
 * 気付けない嘘になる。
 */
export const CONTROL_SHORTCUT_LABEL = IS_WINDOWS ? "Ctrl+Shift+L" : "⇧⌘L";

/** 「このMac」／「このPC」。画像や設定の保存先を説明するときに使う。 */
export function thisDevice(ja: boolean): string {
  if (IS_WINDOWS) return ja ? "このPC" : "this PC";
  return ja ? "このMac" : "this Mac";
}

/** OS が持つ資格情報の保管庫の名前。Webhook の URL を預ける先。 */
export function credentialStoreName(ja: boolean): string {
  if (IS_WINDOWS) return ja ? "資格情報マネージャー" : "Windows Credential Manager";
  return "Keychain";
}
