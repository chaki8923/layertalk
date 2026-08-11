import type { Metadata, Viewport } from "next";

import { Toaster } from "@/components/ui/sonner";

import "./globals.css";

export const metadata: Metadata = {
  title: "LayerTalk",
  description: "発表中のスライドに、あなたのコメントとスタンプを届ける",
};

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

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ja" className="h-full">
      <body className="flex min-h-full flex-col">
        {children}
        <Toaster position="top-center" />
      </body>
    </html>
  );
}
