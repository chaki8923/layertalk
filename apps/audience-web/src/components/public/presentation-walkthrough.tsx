import type { Locale } from "@layertalk/shared/i18n";
import { ArrowDown, ArrowRight, Check, Copy, Monitor, MousePointer2, Play, Send } from "lucide-react";

import { messages } from "@/i18n";

const exampleUrl = "www.layer-talk.com/r/ABC234";

function StartPreview({ locale }: { locale: Locale }) {
  const t = messages[locale].landing.howItWorks;

  return (
    <div className="border-border bg-bg-elev shadow-card w-full max-w-sm rounded-card border p-5 sm:p-6">
      <div className="border-border flex items-center justify-between border-b pb-4">
        <span className="text-[14px] font-bold">LayerTalk</span>
        <span className="text-text-muted text-[11px]">Mac</span>
      </div>
      <p className="text-text-muted mt-5 text-[11px] font-semibold">{t.displayLabel}</p>
      <div className="border-border mt-2 flex items-center gap-3 rounded-control border p-3">
        <Monitor className="text-brand shrink-0" size={18} />
        <span className="min-w-0 text-[12px] font-semibold">{t.displayValue}</span>
        <Check className="text-brand ml-auto shrink-0" size={15} />
      </div>
      <div className="bg-gradient-brand shadow-glow relative mt-5 flex min-h-14 items-center justify-center gap-2 rounded-control px-3 text-center text-[15px] font-bold text-white">
        <Play className="shrink-0" size={17} fill="currentColor" />
        {t.startButton}
        <MousePointer2 className="text-text fill-bg-elev absolute -right-2 -bottom-3" size={30} strokeWidth={1.5} />
      </div>
    </div>
  );
}

function SharePreview({ locale }: { locale: Locale }) {
  const t = messages[locale].landing.howItWorks;

  return (
    <div className="w-full max-w-sm">
      <div className="border-border bg-bg-elev shadow-card rounded-card border p-4">
        <div className="border-brand/40 bg-brand/10 text-brand flex min-h-12 items-center justify-center gap-2 rounded-control border px-3 text-center text-[13px] font-bold">
          <Copy className="shrink-0" size={16} />{t.copyButton}
        </div>
        <p className="text-text-muted mt-3 text-center font-mono text-[11px] break-all">{exampleUrl}</p>
      </div>
      <ArrowDown className="text-brand mx-auto my-3" size={20} />
      <div className="border-border bg-bg-elev rounded-card border p-4">
        <p className="text-text-muted text-[10px] font-semibold">{t.chatLabel}</p>
        <div className="bg-brand/10 mt-2 ml-4 rounded-control p-3 text-[12px] leading-6">
          <p>{t.invitation}</p>
          <p className="text-brand font-mono text-[11px] break-all">{exampleUrl}</p>
        </div>
      </div>
    </div>
  );
}

/** Static illustrations of the real controls, not interactive demo buttons. */
export function PresentationSteps({ locale }: { locale: Locale }) {
  const t = messages[locale].landing.howItWorks;

  return (
    <ol className="mt-10 grid gap-5 md:grid-cols-2 sm:mt-12 sm:gap-6">
      {t.steps.map((step, index) => (
        <li key={step.title} className="border-border overflow-hidden rounded-sheet border">
          <div className="p-5 sm:p-8">
            <span className="lt-num text-brand text-[13px] font-bold tracking-[.15em]">{String(index + 1).padStart(2, "0")}</span>
            <h3 className="mt-3 text-[clamp(1.125rem,2.5vw,1.5rem)] leading-snug font-bold tracking-[-.035em]">{step.title}</h3>
            <p className="text-text-muted mt-3 text-[14px] leading-7">{step.description}</p>
          </div>
          <div aria-hidden="true" className="border-border bg-surface border-t px-5 pt-4 pb-7 sm:px-8 sm:pb-8">
            <p className="text-text-muted text-[10px] font-semibold">{t.previewLabel}</p>
            <div className="flex min-h-72 items-center justify-center pt-4">
              {index === 0 ? <StartPreview locale={locale} /> : <SharePreview locale={locale} />}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}

export function AudienceFlow({ locale }: { locale: Locale }) {
  const t = messages[locale].landing.features;

  return (
    <figure className="border-border bg-surface mt-10 rounded-sheet border px-5 py-8 sm:p-10">
      <div aria-hidden="true" className="grid items-center justify-items-center gap-6 md:grid-cols-[.8fr_auto_1.5fr] md:gap-8">
        <div className="w-full max-w-64">
          <p className="text-text-muted mb-4 text-center text-[12px] font-semibold">{t.audienceLabel}</p>
          <div className="border-border-strong bg-bg-elev shadow-card rounded-sheet border p-4">
            <div className="bg-border-strong mx-auto mb-5 h-1 w-10 rounded-full" />
            <p className="border-border border-b pb-3 text-[13px] font-bold">LayerTalk</p>
            <div className="bg-surface mt-4 rounded-control p-3 text-[13px] leading-6">{t.comment}</div>
            <div className="border-brand/30 mt-3 rounded-control border p-3">
              <p className="text-brand text-[10px] font-bold">{t.items[1].title}</p>
              <p className="mt-1 text-[11px] leading-5">{t.question}</p>
            </div>
            <div className="mt-5 flex justify-around text-[23px]"><span>👏</span><span>👍</span><span>🎉</span></div>
            <div className="border-border mt-4 flex items-center gap-2 border-t pt-3">
              <div className="bg-surface h-8 flex-1 rounded-chip" />
              <span className="bg-gradient-brand flex h-8 w-8 items-center justify-center rounded-chip text-white"><Send size={14} /></span>
            </div>
          </div>
        </div>

        <ArrowRight className="text-brand rotate-90 md:rotate-0" size={28} />

        <div className="w-full min-w-0">
          <p className="text-text-muted mb-4 text-center text-[12px] font-semibold">{t.screenLabel}</p>
          <div className="border-border-strong bg-bg-elev shadow-card overflow-hidden rounded-card border">
            <div className="border-border flex items-center gap-1.5 border-b p-3">
              <span className="bg-border-strong h-2 w-2 rounded-full" /><span className="bg-border-strong h-2 w-2 rounded-full" /><span className="bg-border-strong h-2 w-2 rounded-full" />
            </div>
            <div className="relative flex aspect-[4/3] flex-col justify-center overflow-hidden p-5 sm:aspect-[16/10] sm:p-8">
              <p className="text-brand text-[10px] font-bold tracking-[.18em]">PRESENTATION</p>
              <p className="mt-3 text-[clamp(1.5rem,3vw,2.5rem)] font-bold tracking-[-.05em]">{t.slideTitle}</p>
              <div className="bg-brand/10 mt-5 h-2 w-3/5 rounded-full" />
              <div className="bg-brand/10 mt-2 h-2 w-2/5 rounded-full" />
              <div className="border-brand/30 bg-bg-elev/95 absolute top-5 right-3 max-w-[calc(100%-1.5rem)] rounded-control border px-4 py-2.5 text-[clamp(.75rem,2vw,1rem)] font-bold shadow-lg sm:top-7 sm:right-5">{t.comment}</div>
              <span className="absolute right-[16%] bottom-[12%] text-[36px]">👏</span>
              <span className="absolute right-[32%] bottom-[20%] text-[25px]">👍</span>
            </div>
          </div>
          <div className="bg-border-strong mx-auto h-5 w-12" />
          <div className="bg-border-strong mx-auto h-1 w-28 rounded-full" />
        </div>
      </div>
      <figcaption className="sr-only">{t.diagramCaption}</figcaption>
    </figure>
  );
}
