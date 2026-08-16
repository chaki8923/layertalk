import Link from "next/link";

export function PublicHeader() {
  return (
    <header className="border-border bg-bg/90 sticky top-0 z-40 border-b backdrop-blur-xl">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/event-pass" className="lt-tap flex items-center gap-2.5 font-bold tracking-tight">
          <span aria-hidden="true" className="relative h-6 w-6">
            <span className="border-brand absolute inset-x-0 top-0 h-4 rounded-chip border" />
            <span className="bg-brand/35 absolute inset-x-1 bottom-0 h-4 rounded-chip" />
          </span>
          LayerTalk
        </Link>
        <nav aria-label="公開ページ" className="flex items-center gap-1 sm:gap-3">
          <Link href="/event-pass#features" className="text-text-muted hover:text-text rounded-control px-2.5 py-2 text-[12px] font-semibold transition-colors">機能</Link>
          <Link href="/support" className="text-text-muted hover:text-text rounded-control px-2.5 py-2 text-[12px] font-semibold transition-colors">お問い合わせ</Link>
        </nav>
      </div>
    </header>
  );
}
