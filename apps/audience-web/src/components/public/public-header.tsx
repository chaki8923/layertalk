import Link from "next/link";

import type { Locale } from "@layertalk/shared/i18n";

import { messages } from "@/i18n";

export function PublicHeader({ locale = "ja" }: { locale?: Locale }) {
  const nav = messages[locale].public.nav;

  return (
    <header className="border-border bg-bg/90 sticky top-0 z-40 border-b backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="lt-tap flex items-center gap-2.5 font-bold tracking-tight" aria-label="LayerTalk home">
          <span aria-hidden="true" className="relative h-6 w-6">
            <span className="border-brand absolute inset-x-0 top-0 h-4 rounded-chip border" />
            <span className="bg-brand/35 absolute inset-x-1 bottom-0 h-4 rounded-chip" />
          </span>
          LayerTalk
        </Link>
        <nav aria-label={nav.label} className="flex items-center gap-1 sm:gap-3">
          <Link href="/#features" className="text-text-muted hover:text-text hidden rounded-control px-2.5 py-2 text-[12px] font-semibold transition-colors md:inline-flex">{nav.features}</Link>
          <Link href="/#how-it-works" className="text-text-muted hover:text-text hidden rounded-control px-2.5 py-2 text-[12px] font-semibold transition-colors md:inline-flex">{nav.howItWorks}</Link>
          <Link href="/event-pass" className="text-text-muted hover:text-text rounded-control px-2.5 py-2 text-[12px] font-semibold transition-colors">{nav.eventPass}</Link>
          <Link href="/#join" className="lt-tap border-border bg-surface hover:bg-surface-strong inline-flex min-h-9 items-center rounded-control border px-3 text-[12px] font-bold transition-colors">{nav.join}</Link>
        </nav>
      </div>
    </header>
  );
}
