import type { Locale } from "@layertalk/shared/i18n";

import { messages } from "@/i18n";

import { PhraseText, ProtectedText } from "./phrase-text";

export function LiveSlideDemo({ locale }: { locale: Locale }) {
  const stage = messages[locale].landing.stage;

  return (
    <div aria-hidden="true" className="relative mx-auto w-full max-w-[44rem] lg:max-w-none">
      <div className="border-border bg-bg-elev shadow-card relative aspect-[16/10] overflow-hidden rounded-sheet border">
        <div className="border-border flex h-10 items-center justify-between border-b px-4">
          <div className="flex items-center gap-2">
            <span className="bg-like/80 h-2 w-2 rounded-full" />
            <span className="bg-brand/80 h-2 w-2 rounded-full" />
            <span className="bg-online/80 h-2 w-2 rounded-full" />
          </div>
          <span className="text-text-faint lt-num text-[9px] font-bold tracking-[0.18em]">{stage.label}</span>
          <span className="bg-online/12 text-online rounded-full px-2 py-1 text-[9px] font-bold">{stage.status}</span>
        </div>

        <div className="lt-stage-grid absolute inset-x-0 top-10 bottom-0 overflow-hidden">
          <div className="absolute inset-[12%_10%] flex flex-col justify-center rounded-card border border-white/10 bg-[linear-gradient(135deg,color-mix(in_srgb,var(--lt-brand)_20%,var(--lt-bg-elev)),var(--lt-bg-elev)_65%)] p-[7%] shadow-2xl">
            <p className="text-brand text-[clamp(.55rem,1.2vw,.75rem)] font-bold tracking-[0.2em] uppercase">LayerTalk session</p>
            <p className="mt-3 max-w-[80%] text-[clamp(1.25rem,3.2vw,2.6rem)] leading-[1.03] font-bold tracking-[-0.055em]">
              {locale === "ja" ? <PhraseText phrases={["アイデアは、", "会場で育つ。"]} /> : stage.slideTitle}
            </p>
            <p className="text-text-muted mt-3 max-w-[70%] text-[clamp(.6rem,1.3vw,.85rem)] leading-relaxed"><ProtectedText text={stage.slideBody} /></p>
          </div>

          <div className="lt-stage-comment top-[28%] [animation-delay:-1.8s]">{stage.comments[0]}</div>
          <div className="lt-stage-comment top-[52%] [animation-delay:-5.2s]">{stage.comments[1]}</div>
          <div className="lt-stage-comment top-[70%] [animation-delay:-3.4s]">{stage.comments[2]}</div>
          <span className="lt-stage-stamp left-[22%] top-[68%] [animation-delay:-1s]">✨</span>
          <span className="lt-stage-stamp left-[78%] top-[72%] [animation-delay:-3.8s]">👏</span>

          <div className="border-border bg-bg/80 absolute right-4 bottom-4 flex items-center gap-2 rounded-full border px-3 py-1.5 backdrop-blur-md">
            <span className="bg-online h-1.5 w-1.5 rounded-full" />
            <span className="lt-num text-[9px] font-bold">{stage.audience}</span>
          </div>
        </div>
      </div>
      <div className="bg-gradient-brand absolute -right-5 -bottom-5 -z-10 h-24 w-24 rounded-sheet opacity-30 blur-2xl" />
    </div>
  );
}
