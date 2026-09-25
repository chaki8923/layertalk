import Link from "next/link";

import { guidePath, guides, type GuideArticle as GuideArticleContent } from "@/content/guides";
import { messages } from "@/i18n";

import { AppStoreButton } from "./app-store-button";
import { ProtectedText } from "./phrase-text";

/** 解説記事（日本語のみ）。見た目は `LegalDocument` と揃え、末尾にアプリへの導線と関連記事を置く。 */
export function GuideArticle({ guide }: { guide: GuideArticleContent }) {
  const related = guides.filter((item) => item.slug !== guide.slug);
  const text = (value: string) => <ProtectedText text={value} />;

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
      <article>
        <header>
          <nav aria-label="パンくずリスト" className="text-text-faint text-[11px]">
            <Link href="/" className="hover:text-brand transition-colors">LayerTalk</Link>
            <span aria-hidden="true" className="mx-2">/</span>
            <span>盛り上げ方ガイド</span>
          </nav>
          <h1 className="mt-4 text-[clamp(1.6rem,5vw,2.5rem)] leading-[1.25] font-bold tracking-[-0.04em]">{text(guide.title)}</h1>
          <p className="text-text-muted mt-5 text-[15px] leading-8">{text(guide.lead)}</p>
          <p className="text-text-faint mt-4 text-[11px]">
            <time dateTime={guide.updatedDate}>{guide.updatedDate.replaceAll("-", ".")}</time> 更新
          </p>
        </header>

        <nav aria-label="この記事の目次" className="border-border bg-surface mt-10 rounded-card border p-5">
          <p className="text-[12px] font-bold">目次</p>
          <ol className="mt-3 space-y-2">
            {guide.sections.map((section) => (
              <li key={section.id}><a href={`#${section.id}`} className="text-text-muted hover:text-brand text-[13px] leading-6 transition-colors">{text(section.title)}</a></li>
            ))}
          </ol>
        </nav>

        <div className="mt-12 space-y-12">
          {guide.sections.map((section) => (
            <section key={section.id} id={section.id} className="scroll-mt-24">
              <h2 className="text-[20px] leading-[1.4] font-bold tracking-[-0.02em]">{text(section.title)}</h2>
              {section.paragraphs?.map((paragraph) => <p key={paragraph} className="text-text-muted mt-4 text-[15px] leading-8">{text(paragraph)}</p>)}
              {section.items && <ul className="text-text-muted mt-4 space-y-2 pl-5 text-[15px] leading-8">{section.items.map((item) => <li key={item} className="list-disc pl-1">{text(item)}</li>)}</ul>}
            </section>
          ))}
        </div>
      </article>

      <aside className="border-border bg-bg-elev mt-16 rounded-sheet border p-6 sm:p-8">
        <p className="text-brand text-[11px] font-bold tracking-[.18em] uppercase">LayerTalk</p>
        <p className="mt-3 text-[20px] leading-[1.4] font-bold tracking-[-0.02em]">{text("会場のコメントを、スライドの上に流そう")}</p>
        <p className="text-text-muted mt-3 text-[14px] leading-7">
          {text("LayerTalkは、観客のコメント・質問・スタンプを発表中のスライドへリアルタイムに重ねるMac用アプリです。観客はQRコードか6文字コードで参加でき、アプリも登録も要りません。")}
        </p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <AppStoreButton />
          <Link href="/" className="lt-tap lt-nowrap border-border bg-surface hover:bg-surface-strong inline-flex min-h-12 items-center justify-center rounded-control border px-5 text-[14px] font-bold transition-colors">
            LayerTalkについて
          </Link>
        </div>
        <p className="text-text-faint mt-3 text-[11px]">{messages.ja.public.appStore.note}</p>
      </aside>

      {related.length > 0 && (
        <nav aria-label="関連する記事" className="mt-12">
          <p className="text-[12px] font-bold">あわせて読みたい</p>
          <ul className="mt-3 space-y-3">
            {related.map((item) => (
              <li key={item.slug}>
                <Link href={guidePath(item.slug)} className="border-border hover:border-brand/50 block rounded-card border p-5 transition-colors">
                  <span className="block text-[15px] font-bold">{text(item.title)}</span>
                  <span className="text-text-muted mt-2 block text-[13px] leading-6">{text(item.lead)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </main>
  );
}
