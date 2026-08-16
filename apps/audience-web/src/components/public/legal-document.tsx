import type { LegalDocumentContent } from "@/content/legal/types";

import { PhraseText, ProtectedText } from "./phrase-text";

export function LegalDocument({ document }: { document: LegalDocumentContent }) {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
      <header>
        <p className="text-brand text-[11px] font-bold tracking-[0.18em] uppercase">LayerTalk legal</p>
        <h1 className="mt-3 text-[clamp(1.5rem,5vw,2.5rem)] font-bold tracking-[-0.04em]">
          <PhraseText phrases={document.title === "LayerTalk利用規約" ? ["LayerTalk", "利用規約"] : [document.title]} />
        </h1>
        <p className="text-text-muted mt-4 max-w-2xl text-[14px] leading-7"><ProtectedText text={document.lead} /></p>
        <dl className="text-text-faint mt-5 flex flex-wrap gap-x-6 gap-y-1 text-[11px]">
          <div className="lt-nowrap flex gap-2"><dt>施行日</dt><dd>{document.effectiveDate}</dd></div>
          <div className="lt-nowrap flex gap-2"><dt>最終更新日</dt><dd>{document.updatedDate}</dd></div>
        </dl>
      </header>

      <nav aria-label="この文書の目次" className="border-border bg-surface mt-10 rounded-card border p-5">
        <p className="text-[12px] font-bold">目次</p>
        <ol className="mt-3 grid gap-2 sm:grid-cols-2">
          {document.sections.map((section) => (
            <li key={section.id}><a href={`#${section.id}`} className="text-text-muted hover:text-brand text-[12px] leading-5 transition-colors"><ProtectedText text={section.title} /></a></li>
          ))}
        </ol>
      </nav>

      <div className="mt-12 space-y-12">
        {document.sections.map((section) => (
          <section key={section.id} id={section.id} className="scroll-mt-24">
            <h2 className="text-[18px] font-bold tracking-[-0.02em]"><ProtectedText text={section.title} /></h2>
            {section.paragraphs?.map((paragraph) => <p key={paragraph} className="text-text-muted mt-4 text-[14px] leading-7"><ProtectedText text={paragraph} /></p>)}
            {section.items && <ul className="text-text-muted mt-4 space-y-2 pl-5 text-[14px] leading-7">{section.items.map((item) => <li key={item} className="list-disc pl-1"><ProtectedText text={item} /></li>)}</ul>}
          </section>
        ))}
      </div>
    </main>
  );
}
