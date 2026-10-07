import { headers } from "next/headers";

import { JoinForm } from "@/components/join-form";
import { PublicShell } from "@/components/public/public-shell";
import { localeFromAcceptLanguage, messages } from "@/i18n";
import { createPageMetadata } from "@/lib/seo";

export async function generateMetadata() {
  const locale = localeFromAcceptLanguage((await headers()).get("accept-language"));
  const t = messages[locale].join;

  return createPageMetadata({
    title: `${t.title} | LayerTalk`,
    description: t.description,
    path: "/join",
    locale,
  });
}

export default async function JoinPage() {
  const locale = localeFromAcceptLanguage((await headers()).get("accept-language"));
  const t = messages[locale].join;

  return (
    <PublicShell locale={locale}>
      <main className="mx-auto w-full max-w-xl flex-1 px-4 py-16 sm:px-6 sm:py-24">
        <h1 className="text-[28px] leading-tight font-bold tracking-[-.035em] sm:text-[36px]">{t.title}</h1>
        <p className="text-text-muted mt-4 text-[14px] leading-7">{t.description}</p>
        <div className="border-border bg-surface mt-8 rounded-sheet border p-5 sm:p-7">
          <JoinForm locale={locale} />
        </div>
      </main>
    </PublicShell>
  );
}
