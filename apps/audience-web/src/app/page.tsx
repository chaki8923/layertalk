import { headers } from "next/headers";
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";

import { AppStoreButton } from "@/components/public/app-store-button";
import { LiveSlideDemo } from "@/components/public/live-slide-demo";
import { PhraseText, ProtectedText } from "@/components/public/phrase-text";
import { AudienceFlow, PresentationSteps } from "@/components/public/presentation-walkthrough";
import { PublicShell } from "@/components/public/public-shell";
import { localeFromAcceptLanguage, messages } from "@/i18n";
import { createHomeStructuredData, createPageMetadata, serializeJsonLd } from "@/lib/seo";

export async function generateMetadata() {
  const locale = localeFromAcceptLanguage((await headers()).get("accept-language"));
  const meta = messages[locale].meta;

  return createPageMetadata({
    title: meta.title,
    description: meta.description,
    path: "/",
    locale,
    keywords: [...meta.keywords],
  });
}

export default async function HomePage() {
  const locale = localeFromAcceptLanguage((await headers()).get("accept-language"));
  const t = messages[locale].landing;
  const structuredData = createHomeStructuredData({
    locale,
    description: messages[locale].meta.description,
    featureNames: [...t.features.items.map(({ title }) => title), t.worksWith.featureName],
  });

  return (
    <PublicShell locale={locale}>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(structuredData) }}
      />
      <main className="overflow-hidden">
        <section className="relative">
          <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 -top-40 h-[40rem] bg-[radial-gradient(circle_at_72%_42%,color-mix(in_srgb,var(--lt-brand)_18%,transparent),transparent_46%)]" />

          <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 pt-14 pb-10 sm:px-6 sm:pt-20 sm:pb-14 lg:grid-cols-[.9fr_1.1fr] lg:gap-16 lg:pt-28 lg:pb-20">
            <div className="max-w-2xl">
              <p className="text-brand text-[11px] font-bold tracking-[0.2em] uppercase">{t.eyebrow}</p>
              <h1 className="mt-5 text-[clamp(3rem,8vw,5.75rem)] leading-[0.96] font-bold tracking-[-0.075em]">
                {locale === "ja" ? <PhraseText phrases={["会場の声を、"]} /> : t.titleLead}
                <span className="bg-gradient-brand bg-clip-text text-transparent">
                  {locale === "ja" ? <PhraseText phrases={["スライド", "の上へ。"]} /> : t.titleHighlight}
                </span>
              </h1>
              <p className="text-text-muted mt-7 max-w-xl text-[15px] leading-7 sm:text-[16px]"><ProtectedText text={t.description} /></p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <AppStoreButton locale={locale} />
                <Link href="/join" className="lt-tap lt-nowrap border-border bg-surface hover:bg-surface-strong inline-flex min-h-12 items-center justify-center rounded-control border px-5 text-[14px] font-bold transition-colors">
                  {t.secondaryCta}
                </Link>
              </div>
              <p className="text-text-faint mt-3 text-[11px]">{messages[locale].public.appStore.note}</p>

              <ul className="mt-7 flex flex-wrap gap-x-5 gap-y-2" aria-label="LayerTalk highlights">
                {t.signals.map((signal) => (
                  <li key={signal} className="lt-nowrap text-text-muted flex items-center gap-1.5 text-[11px] font-semibold">
                    <Check className="text-online" size={13} strokeWidth={2.5} aria-hidden="true" />{signal}
                  </li>
                ))}
              </ul>
            </div>

            <LiveSlideDemo locale={locale} />
          </div>
        </section>

        <section id="how-it-works" className="border-border scroll-mt-16 border-t">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
            <p className="text-brand text-[11px] font-bold tracking-[.18em] uppercase">{t.howItWorks.eyebrow}</p>
            <h2 className="mt-4 max-w-4xl text-[clamp(2rem,5vw,3.5rem)] leading-[1.2] font-bold tracking-[-.055em]">
              {locale === "ja" ? <PhraseText phrases={["開始を押して、", "URLを共有。", "それだけ。"]} /> : t.howItWorks.title}
            </h2>
            <PresentationSteps locale={locale} />
            <p className="text-text-muted mt-5 text-[12px] leading-6">{t.howItWorks.setup}</p>
          </div>
        </section>

        <section id="features" className="border-border scroll-mt-16 border-t">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
            <p className="text-brand text-[11px] font-bold tracking-[.18em] uppercase">{t.features.eyebrow}</p>
            <h2 className="mt-4 max-w-3xl text-[clamp(2rem,5vw,3.5rem)] leading-[1.2] font-bold tracking-[-.055em]">
              {locale === "ja" ? <PhraseText phrases={["スマホからの", "ひとことが、", "スライドに届く。"]} /> : t.features.title}
            </h2>
            <p className="text-text-muted mt-5 max-w-2xl text-[15px] leading-7">{t.features.description}</p>
            <AudienceFlow locale={locale} />
            <dl className="mt-8 grid gap-6 md:grid-cols-3">
              {t.features.items.map((feature) => (
                <div key={feature.title} className="border-brand/30 border-l-2 pl-4">
                  <dt className="text-[14px] font-bold">{feature.title}</dt>
                  <dd className="text-text-muted mt-2 text-[13px] leading-6">{feature.description}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section id="works-with" className="border-border scroll-mt-16 border-t">
          <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:px-6 sm:py-16 lg:grid-cols-[1.1fr_1fr] lg:items-center lg:gap-16">
            <div>
              <h2 className="text-[clamp(1.5rem,3vw,2rem)] leading-snug font-bold tracking-[-.035em]">
                {locale === "ja" ? <PhraseText phrases={["PowerPointも", "Keynoteも、", "そのまま。"]} /> : t.worksWith.title}
              </h2>
              <p className="text-text-muted mt-4 text-[14px] leading-7"><ProtectedText text={t.worksWith.description} terms={t.worksWith.tools} /></p>
            </div>
            <div>
              <ul className="flex flex-wrap gap-2" aria-label={t.worksWith.toolsLabel}>
                {t.worksWith.tools.map((tool) => (
                  <li key={tool} className="lt-nowrap border-border bg-surface rounded-chip border px-4 py-3 text-[13px] font-semibold">{tool}</li>
                ))}
              </ul>
              <p className="text-text-muted mt-4 text-[11px]">{t.worksWith.trademark}</p>
            </div>
          </div>
        </section>

        <section className="px-4 pb-12 sm:px-6 sm:pb-16">
          <div className="border-border bg-surface mx-auto max-w-6xl rounded-card border p-5 sm:p-7">
            <div className="grid gap-5 md:grid-cols-[1fr_auto] md:items-center md:gap-10">
              <div>
                <p className="text-text-muted text-[10px] font-bold tracking-[.15em] uppercase">{t.eventPass.eyebrow}</p>
                <h2 className="mt-2 text-[18px] leading-snug font-bold tracking-[-.025em]"><ProtectedText text={t.eventPass.title} /></h2>
                <p className="text-text-muted mt-2 max-w-2xl text-[12px] leading-6"><ProtectedText text={t.eventPass.description} /></p>
              </div>
              <div>
                <p><span className="lt-num text-[22px] font-bold">{t.eventPass.price}</span><span className="text-text-muted ml-2 text-[11px]">{t.eventPass.tax}</span></p>
                <p className="text-text-muted mt-1 text-[12px]">{t.eventPass.duration}</p>
                <Link href="/event-pass" className="lt-tap text-brand mt-2 inline-flex min-h-11 items-center gap-2 text-[13px] font-bold">
                  {t.eventPass.cta}<ArrowRight size={15} aria-hidden="true" />
                </Link>
              </div>
            </div>
            <p className="text-text-muted border-border mt-4 border-t pt-4 text-[11px] leading-5"><ProtectedText text={t.eventPass.note} /></p>
          </div>
        </section>

        <section className="border-border border-t px-4 py-16 text-center sm:px-6 sm:py-24">
          <div className="mx-auto max-w-3xl">
            <h2 className="text-[clamp(2rem,6vw,4rem)] leading-[1.2] font-bold tracking-[-.06em]">
              {locale === "ja" ? <PhraseText phrases={["次のプレゼンで、", "試してみよう。"]} /> : t.finalCta.title}
            </h2>
            <div className="mt-8 flex justify-center">
              <AppStoreButton locale={locale} />
            </div>
            <p className="text-text-muted mt-4 text-[12px]">{messages[locale].public.appStore.note}</p>
          </div>
        </section>
      </main>
    </PublicShell>
  );
}
