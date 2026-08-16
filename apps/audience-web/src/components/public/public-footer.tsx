import Link from "next/link";

const links = [
  ["Event Pass", "/event-pass"],
  ["利用規約", "/legal/terms"],
  ["プライバシー", "/legal/privacy"],
  ["特定商取引法に基づく表記", "/legal/tokusho"],
  ["お問い合わせ", "/support"],
] as const;

export function PublicFooter() {
  return (
    <footer className="border-border mt-auto border-t">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6">
        <nav aria-label="法務・サポート" className="flex flex-wrap gap-x-5 gap-y-3">
          {links.map(([label, href]) => (
            <Link key={href} href={href} className="text-text-muted hover:text-text text-[12px] font-medium transition-colors">{label}</Link>
          ))}
        </nav>
        <p className="text-text-faint text-[11px]">© 2026 LayerTalk</p>
      </div>
    </footer>
  );
}
