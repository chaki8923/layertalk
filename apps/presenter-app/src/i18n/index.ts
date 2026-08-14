import type { Locale } from "@layertalk/shared";
import { useEffect } from "react";

import { en } from "./en";
import { ja } from "./ja";

/** ja を正とした文言の形。en.ts はこれで縛る。 */
export type Messages = typeof ja;

export const messages: Record<Locale, Messages> = { ja, en };

/**
 * 文言を引く。窓ごとに `settings.language` から呼ぶ。
 *
 * context を挟んでいないのは、3 つの窓が**別々の WKWebView** で動いていて
 * 共通の React ツリーが存在しないため。各窓は既に `settings` を持っているので
 * そこから引くのが一番短い。
 */
export const useMessages = (locale: Locale): Messages => messages[locale];

/**
 * `<html lang>` を追従させる。CJK の行分割とフォントのフォールバックが変わるので、
 * オーバーレイに流れるコメントの見た目に効く。
 */
export function useDocumentLang(locale: Locale): void {
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
}
