import { headers } from "next/headers";
import Link from "next/link";
import {
  ArrowRight,
  BadgeHelp,
  Check,
  MessageCircleMore,
  MonitorUp,
  PartyPopper,
  QrCode,
  Radio,
  ShieldCheck,
} from "lucide-react";

import { JoinForm } from "@/components/join-form";
import { LiveSlideDemo } from "@/components/public/live-slide-demo";
import { PhraseText, ProtectedText } from "@/components/public/phrase-text";
import { PublicShell } from "@/components/public/public-shell";
import { localeFromAcceptLanguage, messages } from "@/i18n";
import { createHomeStructuredData, createPageMetadata, serializeJsonLd } from "@/lib/seo";

const featureIcons = [MessageCircleMore, BadgeHelp, PartyPopper] as const;
const stepIcons = [MonitorUp, QrCode, Radio] as const;

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
    featureNames: t.features.items.map(({ title }) => title),
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
                <Link href="/event-pass" className="lt-tap lt-nowrap bg-gradient-brand shadow-glow inline-flex min-h-12 items-center justify-center gap-2 rounded-control px-5 text-[14px] font-bold text-white">
                  {t.primaryCta}<ArrowRight size={16} aria-hidden="true" />
                </Link>
                <Link href="/#join" className="lt-tap lt-nowrap border-border bg-surface hover:bg-surface-strong inline-flex min-h-12 items-center justify-center rounded-control border px-5 text-[14px] font-bold transition-colors">
                  {t.secondaryCta}
                </Link>
              </div>

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

        <section id="join" className="scroll-mt-24 px-4 pb-16 sm:px-6 sm:pb-24">
          <div className="border-border bg-surface shadow-card mx-auto grid max-w-5xl items-center gap-7 rounded-sheet border p-5 backdrop-blur-xl sm:p-7 lg:grid-cols-[.85fr_1.15fr] lg:p-8">
            <div>
              <p className="text-brand text-[10px] font-bold tracking-[.18em] uppercase">{t.join.eyebrow}</p>
              <h2 className="mt-2 text-[22px] font-bold tracking-[-.035em]">{locale === "ja" ? <PhraseText phrases={["観客として", "参加する"]} /> : t.join.title}</h2>
              <p className="text-text-muted mt-2 text-[12px] leading-6"><ProtectedText text={t.join.description} /></p>
            </div>
            <JoinForm locale={locale} />
          </div>
        </section>

        <section id="features" className="border-border scroll-mt-16 border-y">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
            <div className="max-w-2xl">
              <p className="text-brand text-[11px] font-bold tracking-[.18em] uppercase">{t.features.eyebrow}</p>
              <h2 className="mt-4 text-[clamp(2rem,5vw,3.5rem)] leading-[1.05] font-bold tracking-[-.055em]">
                {locale === "ja" ? <PhraseText phrases={["反応が見えると、", "発表は一方通行では", "なくなる"]} /> : t.features.title}
              </h2>
            </div>
            <div className="mt-10 grid gap-2.5 md:grid-cols-3">
              {t.features.items.map((feature, index) => {
                const Icon = featureIcons[index]!;
                return (
                  <article key={feature.title} className="border-border bg-surface rounded-card border p-6">
                    <div className="bg-brand/10 text-brand flex h-10 w-10 items-center justify-center rounded-control"><Icon size={19} aria-hidden="true" /></div>
                    <h3 className="mt-6 text-[16px] font-bold"><ProtectedText text={feature.title} terms={[feature.title]} /></h3>
                    <p className="text-text-muted mt-3 text-[13px] leading-6"><ProtectedText text={feature.description} /></p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section id="how-it-works" className="scroll-mt-16">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
            <div className="grid gap-10 lg:grid-cols-[.8fr_1.2fr] lg:gap-20">
              <div>
                <p className="text-brand text-[11px] font-bold tracking-[.18em] uppercase">{t.howItWorks.eyebrow}</p>
                <h2 className="mt-4 text-[clamp(2rem,5vw,3.2rem)] leading-[1.07] font-bold tracking-[-.05em]">
                  {locale === "ja" ? <PhraseText phrases={["共有するのは、", "ひとつのコードだけ"]} /> : t.howItWorks.title}
                </h2>
              </div>
              <ol className="divide-border border-border divide-y border-y">
                {t.howItWorks.steps.map((step, index) => {
                  const Icon = stepIcons[index]!;
                  return (
                    <li key={step.title} className="grid grid-cols-[2.5rem_1fr_auto] items-center gap-4 py-5 sm:gap-6 sm:py-6">
                      <span className="lt-num text-brand text-[11px] font-bold">{String(index + 1).padStart(2, "0")}</span>
                      <div><h3 className="text-[15px] font-bold"><ProtectedText text={step.title} terms={[step.title]} /></h3><p className="text-text-muted mt-1 text-[12px] leading-5"><ProtectedText text={step.description} /></p></div>
                      <Icon className="text-text-faint" size={19} aria-hidden="true" />
                    </li>
                  );
                })}
              </ol>
            </div>
          </div>
        </section>

        <section className="px-4 pb-16 sm:px-6 sm:pb-24">
          <div className="border-border bg-bg-elev relative mx-auto grid max-w-6xl overflow-hidden rounded-sheet border lg:grid-cols-[1fr_auto]">
            <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_15%_0%,color-mix(in_srgb,var(--lt-brand)_18%,transparent),transparent_45%)]" />
            <div className="relative p-6 sm:p-10 lg:p-12">
              <div className="flex items-center gap-2 text-brand"><ShieldCheck size={18} aria-hidden="true" /><p className="text-[11px] font-bold tracking-[.18em] uppercase">{t.eventPass.eyebrow}</p></div>
              <h2 className="mt-4 max-w-2xl text-[clamp(2rem,5vw,3.5rem)] leading-[1.05] font-bold tracking-[-.055em]">
                {locale === "ja" ? <PhraseText phrases={["本番を安全に", "運営するための", "Event Pass"]} /> : t.eventPass.title}
              </h2>
              <p className="text-text-muted mt-5 max-w-2xl text-[13px] leading-7"><ProtectedText text={t.eventPass.description} /></p>
              <Link href="/event-pass" className="lt-tap lt-nowrap bg-gradient-brand shadow-glow mt-7 inline-flex min-h-12 items-center gap-2 rounded-control px-5 text-[14px] font-bold text-white">
                {t.eventPass.cta}<ArrowRight size={16} aria-hidden="true" />
              </Link>
              <p className="text-text-faint mt-3 text-[11px]"><ProtectedText text={t.eventPass.note} /></p>
            </div>
            <div className="border-border relative flex min-w-[17rem] flex-col justify-center border-t p-6 sm:p-10 lg:border-t-0 lg:border-l lg:p-12">
              <p><span className="lt-num text-[38px] font-bold tracking-[-.05em]">{t.eventPass.price}</span><span className="text-text-muted ml-2 text-[11px]">{t.eventPass.tax}</span></p>
              <p className="lt-nowrap text-text-muted mt-2 text-[13px] font-semibold">{t.eventPass.duration}</p>
            </div>
          </div>
        </section>

        <section className="border-border border-t px-4 py-16 text-center sm:px-6 sm:py-24">
          <div className="mx-auto max-w-3xl">
            <h2 className="text-[clamp(2rem,6vw,4rem)] leading-[1.02] font-bold tracking-[-.06em]">
              {locale === "ja" ? <PhraseText phrases={["次の発表を、", "会場との対話に", "変える。"]} /> : t.finalCta.title}
            </h2>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Link href="/event-pass" className="lt-tap lt-nowrap bg-gradient-brand shadow-glow inline-flex min-h-12 items-center justify-center rounded-control px-5 text-[14px] font-bold text-white">{t.finalCta.presenter}</Link>
              <Link href="/#join" className="lt-tap lt-nowrap border-border hover:bg-surface inline-flex min-h-12 items-center justify-center rounded-control border px-5 text-[14px] font-bold transition-colors">{t.finalCta.audience}</Link>
            </div>
          </div>
        </section>
      </main>
    </PublicShell>
  );
}
