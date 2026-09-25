import type { Metadata } from "next";
import Link from "next/link";

import { GuideCards } from "@/components/public/guide-cards";
import { PhraseText } from "@/components/public/phrase-text";
import { PublicShell } from "@/components/public/public-shell";
import { GUIDES_PATH, GUIDES_TITLE, guides } from "@/content/guides";
import { createGuidesIndexStructuredData, createPageMetadata, serializeJsonLd } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "プレゼン・LT・会議を盛り上げる方法ガイド | LayerTalk",
  description: "プレゼンや発表、LT（ライトニングトーク）、会議を盛り上げるためのコツをまとめた解説記事の一覧です。聞き手が反応しやすい場のつくり方を、場面ごとに紹介します。",
  path: GUIDES_PATH,
});

export default function GuidesPage() {
  return (
    // 記事は日本語だけなので、Accept-Language に関係なく日本語の枠で出す。
    <PublicShell locale="ja">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(createGuidesIndexStructuredData(guides.map(({ slug, title }) => ({ slug, title })))) }}
      />
      <main className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
        <nav aria-label="パンくずリスト" className="text-text-faint text-[11px]">
          <Link href="/" className="hover:text-brand transition-colors">LayerTalk</Link>
          <span aria-hidden="true" className="mx-2">/</span>
          <span>{GUIDES_TITLE}</span>
        </nav>
        <h1 className="mt-4 text-[clamp(1.8rem,5vw,3rem)] leading-[1.15] font-bold tracking-[-0.05em]">
          <PhraseText phrases={["プレゼン・LT・会議を", "盛り上げる方法"]} />
        </h1>
        <p className="text-text-muted mt-5 max-w-2xl text-[15px] leading-8">
          聞き手が黙ってしまうのは、反応する手段が無いからかもしれません。発表・LT・会議の場面ごとに、会場を盛り上げるための具体的な工夫をまとめました。
        </p>
        <GuideCards className="mt-10" />
      </main>
    </PublicShell>
  );
}
