// バレル（"@layertalk/shared"）ではなくサブパスから取ること。
// バレルは useComments などの React フックを再輸出しているので、これを
// server component から読むと "use client" の境界を越えてビルドが落ちる。
import { DEFAULT_LOCALE, isLocale, type Locale } from "@layertalk/shared/i18n";

import { en } from "./en";
import { ja } from "./ja";

/** ja を正とした文言の形。en.ts はこれで縛る。 */
export type Messages = typeof ja;

export const messages: Record<Locale, Messages> = { ja, en };

/** `rooms.language` は DB 上ただの text なので、描画に使う前にここで絞る。 */
export const localeFromRoom = (language: string): Locale =>
  isLocale(language) ? language : DEFAULT_LOCALE;

/**
 * `Accept-Language` から言語を選ぶ。
 *
 * 使うのは「/」（参加コードの入力画面）だけ。ここはまだルームが分からないので
 * ルームの言語に従えない。q 値の重みは見ずに、先に現れた方を採る
 * — 選択肢が 2 つしか無く、日本語話者のブラウザは ja を先頭に置くため。
 */
export function localeFromAcceptLanguage(header: string | null): Locale {
  if (!header) return DEFAULT_LOCALE;
  for (const part of header.split(",")) {
    const tag = part.split(";")[0]!.trim().toLowerCase();
    if (tag.startsWith("ja")) return "ja";
    if (tag.startsWith("en")) return "en";
  }
  return DEFAULT_LOCALE;
}

/** 時刻表示のロケール。en-US は `03:42 PM` になり幅が揃わないので en-GB を使う。 */
export const timeLocale = (locale: Locale): string => (locale === "en" ? "en-GB" : "ja-JP");
