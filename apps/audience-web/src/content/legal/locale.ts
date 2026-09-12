import type { Locale } from "@layertalk/shared/i18n";

import { SALES_CHANNEL_PARAM, type SalesChannel } from "./channel";

/**
 * 法務ページの表示言語。**`?lang=en` のときだけ英語。**
 *
 * Accept-Language では決めない。表示言語を決めるのは発表者（アプリ）で、App Store Connect の
 * 英語ローカライズにも固定の URL を登録するため。英語版があるのはプライバシーポリシーと
 * 利用規約だけで、正は日本語版（英語版に優先関係の注記を出す）。
 */
export const LEGAL_LOCALE_PARAM = "lang";

/** クエリ文字列から解決する。知らない値は日本語へ倒す。 */
export function resolveLegalLocale(value: string | string[] | undefined): Locale {
  const raw = Array.isArray(value) ? value[0] : value;
  return raw === "en" ? "en" : "ja";
}

/** 言語とチャネルを保ったまま法務ページへ渡すクエリ。既定値（日本語・Stripe）は付けない。 */
export function legalDocumentQuery(locale: Locale, channel: SalesChannel = "stripe"): string {
  const params = new URLSearchParams();
  if (channel === "app-store") params.set(SALES_CHANNEL_PARAM, "app-store");
  if (locale === "en") params.set(LEGAL_LOCALE_PARAM, "en");
  const query = params.toString();
  return query ? `?${query}` : "";
}
