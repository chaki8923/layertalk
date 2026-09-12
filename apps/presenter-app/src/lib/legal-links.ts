import type { Locale } from "@layertalk/shared";

export type LegalPage = "privacy" | "terms" | "tokusho" | "support";

const PATHS: Record<LegalPage, string> = {
  privacy: "/legal/privacy",
  terms: "/legal/terms",
  tokusho: "/legal/tokusho",
  support: "/support",
};

/**
 * アプリから開く法務・サポートページのパス。**クエリはここでしか組まない。**
 *
 * - `channel=app-store`: MAS 版から Stripe 前提の規約・特商法・返金案内（「支払方法: Stripe Checkout」
 *   「2,980円」）を開かせると、App Store 決済のアプリ内から**別の決済手段の販売条件へ誘導している**
 *   形になり 3.1.1 の指摘対象になる。プライバシーポリシーは両チャネルの記述を 1 枚に持たせてあるので
 *   付けない（App Store Connect に登録する URL は 1 本で、クエリ違いで内容が変わるのは筋が悪い）。
 * - `lang=en`: 英語版があるのはプライバシーポリシーと利用規約だけ。特商法表記とサポートは日本語のみ。
 *
 * `mas` を引数で受けるのは、MAS 版の分岐もテストで通すため
 * （vitest の `@layertalk/billing-channel` は直接配布版を向いている）。呼び出し側は `isMasBuild` を渡す。
 */
export function legalPagePath(
  page: LegalPage,
  { locale, mas, hash }: { locale: Locale; mas: boolean; hash?: string },
): string {
  const params = new URLSearchParams();
  if (mas && page !== "privacy") params.set("channel", "app-store");
  if (locale === "en" && (page === "privacy" || page === "terms")) params.set("lang", "en");
  const query = params.toString();
  return `${PATHS[page]}${query ? `?${query}` : ""}${hash ? `#${hash}` : ""}`;
}
