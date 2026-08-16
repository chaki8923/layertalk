import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";

import { Toaster } from "@/components/ui/sonner";
import { localeFromAcceptLanguage, messages } from "@/i18n";
import { createRobotsMetadata, getSiteUrl, SITE_NAME } from "@/lib/seo";

import "./globals.css";

/** ルームの言語はここでは分からないので、リンクプレビューの文言は端末の言語で出す。 */
export async function generateMetadata(): Promise<Metadata> {
  const locale = localeFromAcceptLanguage((await headers()).get("accept-language"));
  return {
    metadataBase: new URL(getSiteUrl()),
    applicationName: SITE_NAME,
    title: messages[locale].meta.title,
    description: messages[locale].meta.description,
    keywords: [...messages[locale].meta.keywords],
    authors: [{ name: SITE_NAME, url: "/" }],
    creator: SITE_NAME,
    publisher: SITE_NAME,
    category: "technology",
    referrer: "origin-when-cross-origin",
    formatDetection: {
      telephone: false,
      address: false,
      email: false,
    },
    robots: createRobotsMetadata(),
  };
}

export const viewport: Viewport = {
  // 会場でスマホを縦持ちする前提。入力欄タップ時の自動ズームを止める。
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#0a0c11" },
    { media: "(prefers-color-scheme: light)", color: "#f4f6fb" },
  ],
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // 初期値は端末の言語。ルーム画面では LocaleProvider がルームの言語で当て直す。
  const locale = localeFromAcceptLanguage((await headers()).get("accept-language"));

  return (
    <html lang={locale} className="h-full">
      <body className="flex min-h-full flex-col">
        {children}
        <Toaster position="top-center" />
      </body>
    </html>
  );
}
