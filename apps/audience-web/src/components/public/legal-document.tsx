import Link from "next/link";

import type { Locale } from "@layertalk/shared/i18n";

import type { LegalDocumentContent } from "@/content/legal/types";
import { messages } from "@/i18n";

import { PhraseText, ProtectedText } from "./phrase-text";

export function LegalDocument({ document, locale = "ja", alternateHref }: {
  document: LegalDocumentContent;
  locale?: Locale;
  /** もう一方の言語で開いた同じ文書（チャネルは保つ）。英語版があるのはプライバシーポリシーと利用規約だけ。 */
  alternateHref?: string;
}) {
  const t = messages[locale].public.legal;
  // 折り返し位置の保護（ProtectedText / PhraseText）は日本語の文節向け。英文は単語区切りに任せる。
  const text = (value: string) => (locale === "ja" ? <ProtectedText text={value} /> : value);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
      <header>
        <div className="flex items-center justify-between gap-4">
          <p className="text-brand text-[11px] font-bold tracking-[0.18em] uppercase">{t.eyebrow}</p>
          {alternateHref && (
            <Link href={alternateHref} hrefLang={locale === "ja" ? "en" : "ja"} className="lt-nowrap text-text-muted hover:text-brand text-[12px] font-semibold transition-colors">
              {t.switchLanguage}
            </Link>
          )}
        </div>
        <h1 className="mt-3 text-[clamp(1.5rem,5vw,2.5rem)] font-bold tracking-[-0.04em]">
          {locale === "ja"
            ? <PhraseText phrases={document.title === "LayerTalk利用規約" ? ["LayerTalk", "利用規約"] : [document.title]} />
            : document.title}
        </h1>
        <p className="text-text-muted mt-4 max-w-2xl text-[14px] leading-7">{text(document.lead)}</p>
        {document.notice && <p className="text-text-faint mt-3 max-w-2xl text-[12px] leading-6">{document.notice}</p>}
        <dl className="text-text-faint mt-5 flex flex-wrap gap-x-6 gap-y-1 text-[11px]">
          <div className="lt-nowrap flex gap-2"><dt>{t.effective}</dt><dd>{document.effectiveDate}</dd></div>
          <div className="lt-nowrap flex gap-2"><dt>{t.updated}</dt><dd>{document.updatedDate}</dd></div>
        </dl>
      </header>

      <nav aria-label={t.tocLabel} className="border-border bg-surface mt-10 rounded-card border p-5">
        <p className="text-[12px] font-bold">{t.toc}</p>
        <ol className="mt-3 grid gap-2 sm:grid-cols-2">
          {document.sections.map((section) => (
            <li key={section.id}><a href={`#${section.id}`} className="text-text-muted hover:text-brand text-[12px] leading-5 transition-colors">{text(section.title)}</a></li>
          ))}
        </ol>
      </nav>

      <div className="mt-12 space-y-12">
        {document.sections.map((section) => (
          <section key={section.id} id={section.id} className="scroll-mt-24">
            <h2 className="text-[18px] font-bold tracking-[-0.02em]">{text(section.title)}</h2>
            {section.paragraphs?.map((paragraph) => <p key={paragraph} className="text-text-muted mt-4 text-[14px] leading-7">{text(paragraph)}</p>)}
            {section.items && <ul className="text-text-muted mt-4 space-y-2 pl-5 text-[14px] leading-7">{section.items.map((item) => <li key={item} className="list-disc pl-1">{text(item)}</li>)}</ul>}
          </section>
        ))}
      </div>
    </main>
  );
}
