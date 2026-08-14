"use client";

import { DEFAULT_LOCALE, type Locale } from "@layertalk/shared";
import { createContext, useContext, useEffect } from "react";

import { messages, type Messages } from "./index";

/**
 * ルームの表示言語をツリー全体へ配る。
 *
 * ルーム画面は Composer / StampBar / SortTabs / CommentCard（→ LikeButton）まで
 * 5 段あるので、`t` を prop で降ろすより context の方が短い。
 */
const LocaleContext = createContext<Locale>(DEFAULT_LOCALE);

export function LocaleProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: React.ReactNode;
}) {
  // `<html lang>` はルート layout で ja 固定になっている。ルームの言語が分かった
  // 時点で当て直す（フォントのフォールバックと行分割が変わる）。
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>;
}

export const useLocale = (): Locale => useContext(LocaleContext);

export const useMessages = (): Messages => messages[useContext(LocaleContext)];
