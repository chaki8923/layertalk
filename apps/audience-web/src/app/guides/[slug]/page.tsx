import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { GuideArticle } from "@/components/public/guide-article";
import { PublicShell } from "@/components/public/public-shell";
import { findGuide, guidePath, guides } from "@/content/guides";
import { createGuideStructuredData, createPageMetadata, serializeJsonLd } from "@/lib/seo";

// 記事は `content/guides` にあるものだけ。それ以外の slug は 404。
export const dynamicParams = false;

export function generateStaticParams() {
  return guides.map(({ slug }) => ({ slug }));
}

export async function generateMetadata(props: PageProps<"/guides/[slug]">): Promise<Metadata> {
  const guide = findGuide((await props.params).slug);
  if (!guide) return {};
  // 同じ階層の opengraph-image.tsx が作る、記事タイトル入りのカード。X のカードも同じ画像にそろえる。
  const image = { url: `${guidePath(guide.slug)}/opengraph-image`, width: 1200, height: 630, alt: guide.title };
  const metadata = createPageMetadata({
    title: `${guide.title} | LayerTalk`,
    description: guide.description,
    path: guidePath(guide.slug),
  });
  return {
    ...metadata,
    openGraph: { ...metadata.openGraph, type: "article", publishedTime: guide.publishedDate, modifiedTime: guide.updatedDate, images: [image] },
    twitter: { ...metadata.twitter, images: [image] },
  };
}

export default async function GuidePage(props: PageProps<"/guides/[slug]">) {
  const guide = findGuide((await props.params).slug);
  if (!guide) notFound();

  return (
    // 記事は日本語だけなので、Accept-Language に関係なく日本語の枠で出す。
    <PublicShell locale="ja">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(createGuideStructuredData(guide)) }}
      />
      <GuideArticle guide={guide} />
    </PublicShell>
  );
}
