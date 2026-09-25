import Image from "next/image";
import Link from "next/link";

import type { Locale } from "@layertalk/shared/i18n";

import { AppStoreButton } from "@/components/public/app-store-button";
import { messages } from "@/i18n";

import layerTalkMark from "./layertalk-mark.png";

export function PublicHeader({ locale = "ja" }: { locale?: Locale }) {
  const nav = messages[locale].public.nav;

  return (
    <header className="border-border bg-bg/90 sticky top-0 z-40 border-b backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="lt-tap lt-nowrap flex items-center gap-2.5 font-bold tracking-tight" aria-label="LayerTalk home">
          <Image src={layerTalkMark} alt="" width={28} height={28} preload className="h-7 w-7" />
          LayerTalk
        </Link>
        <nav aria-label={nav.label} className="flex items-center gap-1 sm:gap-3">
          <Link href="/#features" className="lt-nowrap text-text-muted hover:text-text hidden rounded-control px-2.5 py-2 text-[12px] font-semibold transition-colors md:inline-flex">{nav.features}</Link>
          <Link href="/#how-it-works" className="lt-nowrap text-text-muted hover:text-text hidden rounded-control px-2.5 py-2 text-[12px] font-semibold transition-colors md:inline-flex">{nav.howItWorks}</Link>
          <Link href="/event-pass" className="lt-nowrap text-text-muted hover:text-text rounded-control px-2.5 py-2 text-[12px] font-semibold transition-colors">{nav.eventPass}</Link>
          <AppStoreButton locale={locale} variant="compact" className="hidden sm:inline-flex" />
          <Link href="/#join" className="lt-tap lt-nowrap border-border bg-surface hover:bg-surface-strong inline-flex min-h-9 items-center rounded-control border px-3 text-[12px] font-bold transition-colors">{nav.join}</Link>
        </nav>
      </div>
    </header>
  );
}
