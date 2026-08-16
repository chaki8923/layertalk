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
                {t.titleLead}<span className="bg-gradient-brand bg-clip-text text-transparent">{t.titleHighlight}</span>
              </h1>
              <p className="text-text-muted mt-7 max-w-xl text-[15px] leading-7 sm:text-[16px]">{t.description}</p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link href="/event-pass" className="lt-tap bg-gradient-brand shadow-glow inline-flex min-h-12 items-center justify-center gap-2 rounded-control px-5 text-[14px] font-bold text-white">
                  {t.primaryCta}<ArrowRight size={16} aria-hidden="true" />
                </Link>
                <Link href="/#join" className="lt-tap border-border bg-surface hover:bg-surface-strong inline-flex min-h-12 items-center justify-center rounded-control border px-5 text-[14px] font-bold transition-colors">
                  {t.secondaryCta}
                </Link>
              </div>

              <ul className="mt-7 flex flex-wrap gap-x-5 gap-y-2" aria-label="LayerTalk highlights">
                {t.signals.map((signal) => (
                  <li key={signal} className="text-text-muted flex items-center gap-1.5 text-[11px] font-semibold">
                    <Check className="text-online" size={13} strokeWidth={2.5} aria-hidden="true" />{signal}
                  </li>
                ))}
              </ul>
            </div>

            <div aria-hidden="true" className="relative mx-auto w-full max-w-[44rem] lg:max-w-none">
              <div className="border-border bg-bg-elev shadow-card relative aspect-[16/10] overflow-hidden rounded-sheet border">
                <div className="border-border flex h-10 items-center justify-between border-b px-4">
                  <div className="flex items-center gap-2">
                    <span className="bg-like/80 h-2 w-2 rounded-full" />
                    <span className="bg-brand/80 h-2 w-2 rounded-full" />
                    <span className="bg-online/80 h-2 w-2 rounded-full" />
                  </div>
                  <span className="text-text-faint lt-num text-[9px] font-bold tracking-[0.18em]">{t.stage.label}</span>
                  <span className="bg-online/12 text-online rounded-full px-2 py-1 text-[9px] font-bold">{t.stage.status}</span>
                </div>

                <div className="lt-stage-grid absolute inset-x-0 top-10 bottom-0 overflow-hidden">
                  <div className="absolute inset-[12%_10%] flex flex-col justify-center rounded-card border border-white/10 bg-[linear-gradient(135deg,color-mix(in_srgb,var(--lt-brand)_20%,var(--lt-bg-elev)),var(--lt-bg-elev)_65%)] p-[7%] shadow-2xl">
                    <p className="text-brand text-[clamp(.55rem,1.2vw,.75rem)] font-bold tracking-[0.2em] uppercase">LayerTalk session</p>
                    <p className="mt-3 max-w-[80%] text-[clamp(1.25rem,3.2vw,2.6rem)] leading-[1.03] font-bold tracking-[-0.055em]">{t.stage.slideTitle}</p>
                    <p className="text-text-muted mt-3 max-w-[70%] text-[clamp(.6rem,1.3vw,.85rem)] leading-relaxed">{t.stage.slideBody}</p>
                  </div>

                  <div className="lt-stage-comment top-[28%] [animation-delay:-1.8s]">
                    <span className="bg-brand mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full text-[9px] text-white">A</span>{t.stage.comments[0]}
                  </div>
                  <div className="lt-stage-comment top-[52%] [animation-delay:-5.2s]">
                    <span className="bg-online mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full text-[9px] text-bg">Q</span>{t.stage.comments[1]}
                  </div>
                  <div className="lt-stage-comment top-[70%] [animation-delay:-3.4s]">{t.stage.comments[2]}</div>
                  <span className="lt-stage-stamp left-[22%] top-[68%] [animation-delay:-1s]">✨</span>
                  <span className="lt-stage-stamp left-[78%] top-[72%] [animation-delay:-3.8s]">👏</span>

                  <div className="border-border bg-bg/80 absolute right-4 bottom-4 flex items-center gap-2 rounded-full border px-3 py-1.5 backdrop-blur-md">
                    <span className="bg-online h-1.5 w-1.5 rounded-full" />
                    <span className="lt-num text-[9px] font-bold">{t.stage.audience}</span>
                  </div>
                </div>
              </div>
              <div className="bg-gradient-brand absolute -right-5 -bottom-5 -z-10 h-24 w-24 rounded-sheet opacity-30 blur-2xl" />
            </div>
          </div>
        </section>

        <section id="join" className="scroll-mt-24 px-4 pb-16 sm:px-6 sm:pb-24">
          <div className="border-border bg-surface shadow-card mx-auto grid max-w-5xl items-center gap-7 rounded-sheet border p-5 backdrop-blur-xl sm:p-7 lg:grid-cols-[.85fr_1.15fr] lg:p-8">
            <div>
              <p className="text-brand text-[10px] font-bold tracking-[.18em] uppercase">{t.join.eyebrow}</p>
              <h2 className="mt-2 text-[22px] font-bold tracking-[-.035em]">{t.join.title}</h2>
              <p className="text-text-muted mt-2 text-[12px] leading-6">{t.join.description}</p>
            </div>
            <JoinForm locale={locale} />
          </div>
        </section>

        <section id="features" className="border-border scroll-mt-16 border-y">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 sm:py-24">
            <div className="max-w-2xl">
              <p className="text-brand text-[11px] font-bold tracking-[.18em] uppercase">{t.features.eyebrow}</p>
              <h2 className="mt-4 text-[clamp(2rem,5vw,3.5rem)] leading-[1.05] font-bold tracking-[-.055em]">{t.features.title}</h2>
            </div>
            <div className="mt-10 grid gap-2.5 md:grid-cols-3">
              {t.features.items.map((feature, index) => {
                const Icon = featureIcons[index]!;
                return (
                  <article key={feature.title} className="border-border bg-surface rounded-card border p-6">
                    <div className="bg-brand/10 text-brand flex h-10 w-10 items-center justify-center rounded-control"><Icon size={19} aria-hidden="true" /></div>
                    <h3 className="mt-6 text-[16px] font-bold">{feature.title}</h3>
                    <p className="text-text-muted mt-3 text-[13px] leading-6">{feature.description}</p>
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
                <h2 className="mt-4 text-[clamp(2rem,5vw,3.2rem)] leading-[1.07] font-bold tracking-[-.05em]">{t.howItWorks.title}</h2>
              </div>
              <ol className="divide-border border-border divide-y border-y">
                {t.howItWorks.steps.map((step, index) => {
                  const Icon = stepIcons[index]!;
                  return (
                    <li key={step.title} className="grid grid-cols-[2.5rem_1fr_auto] items-center gap-4 py-5 sm:gap-6 sm:py-6">
                      <span className="lt-num text-brand text-[11px] font-bold">{String(index + 1).padStart(2, "0")}</span>
                      <div><h3 className="text-[15px] font-bold">{step.title}</h3><p className="text-text-muted mt-1 text-[12px] leading-5">{step.description}</p></div>
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
              <h2 className="mt-4 max-w-2xl text-[clamp(2rem,5vw,3.5rem)] leading-[1.05] font-bold tracking-[-.055em]">{t.eventPass.title}</h2>
              <p className="text-text-muted mt-5 max-w-2xl text-[13px] leading-7">{t.eventPass.description}</p>
              <Link href="/event-pass" className="lt-tap bg-gradient-brand shadow-glow mt-7 inline-flex min-h-12 items-center gap-2 rounded-control px-5 text-[14px] font-bold text-white">
                {t.eventPass.cta}<ArrowRight size={16} aria-hidden="true" />
              </Link>
              <p className="text-text-faint mt-3 text-[11px]">{t.eventPass.note}</p>
            </div>
            <div className="border-border relative flex min-w-[17rem] flex-col justify-center border-t p-6 sm:p-10 lg:border-t-0 lg:border-l lg:p-12">
              <p><span className="lt-num text-[38px] font-bold tracking-[-.05em]">{t.eventPass.price}</span><span className="text-text-muted ml-2 text-[11px]">{t.eventPass.tax}</span></p>
              <p className="text-text-muted mt-2 text-[13px] font-semibold">{t.eventPass.duration}</p>
            </div>
          </div>
        </section>

        <section className="border-border border-t px-4 py-16 text-center sm:px-6 sm:py-24">
          <div className="mx-auto max-w-3xl">
            <h2 className="text-[clamp(2rem,6vw,4rem)] leading-[1.02] font-bold tracking-[-.06em]">{t.finalCta.title}</h2>
            <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
              <Link href="/event-pass" className="lt-tap bg-gradient-brand shadow-glow inline-flex min-h-12 items-center justify-center rounded-control px-5 text-[14px] font-bold text-white">{t.finalCta.presenter}</Link>
              <Link href="/#join" className="lt-tap border-border hover:bg-surface inline-flex min-h-12 items-center justify-center rounded-control border px-5 text-[14px] font-bold transition-colors">{t.finalCta.audience}</Link>
            </div>
          </div>
        </section>
      </main>
    </PublicShell>
  );
}
