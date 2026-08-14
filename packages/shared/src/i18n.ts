/**
 * 日本語／英語の 2 言語だけを扱う、最小の土台。
 *
 * ライブラリを入れていないのは意図的。このパッケージは**生の TS ソース**を配っていて
 * Next の RSC と Vite/Tauri の両方から読まれるので、どちらかに寄った i18n ライブラリを
 * ここに置くと相手側へ依存が漏れる。
 *
 * 文言のカタログは**各アプリが持つ**（発表者用と観客用で共通の文言がほとんど無く、
 * 互いの文字列を相手のバンドルに含めたくないため）。ここに置くのは型だけ。
 * このパッケージ自身が投げるエラーの文言だけは `errors.ts` が持つ。
 *
 * カタログの書き方は各アプリの `src/i18n/ja.ts` を参照。値を埋める文は
 * テンプレート文字列ではなく**関数**にしてある（`(n: number) => string`）。
 * そうすると引数の取り違えと訳し忘れが tsc で落ち、英語の複数形も ternary 1 個で書ける。
 */

export type Locale = "ja" | "en";

export const LOCALES = ["ja", "en"] as const satisfies readonly Locale[];

export const DEFAULT_LOCALE: Locale = "ja";

export function isLocale(value: unknown): value is Locale {
  return value === "ja" || value === "en";
}

/**
 * 文の途中に**別の要素**を挟むときの訳文。
 *
 * 例: 「直前のルーム `<span class="lt-num">ABC123</span>` に戻る」。
 * prefix / suffix を別のキーに割ると英語の語順（`Back to room ABC123`）を作れないので、
 * 1 本の訳文として持ち、前後に分けて JSX へ差し込む。英語では `after` が空になることが多い。
 */
export type Split = { before: string; after: string };
