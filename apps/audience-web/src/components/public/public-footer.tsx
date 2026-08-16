import Link from "next/link";

import type { Locale } from "@layertalk/shared/i18n";

import { messages } from "@/i18n";

export function PublicFooter({ locale = "ja" }: { locale?: Locale }) {
  const footer = messages[locale].public.footer;
  const links = [
    [footer.home, "/"],
    [footer.eventPass, "/event-pass"],
    [footer.terms, "/legal/terms"],
    [footer.privacy, "/legal/privacy"],
    [footer.commerce, "/legal/tokusho"],
    [footer.support, "/support"],
  ] as const;

  return (
    <footer className="border-border mt-auto border-t">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6">
        <nav aria-label={footer.label} className="flex flex-wrap gap-x-5 gap-y-3">
          {links.map(([label, href]) => (
            <Link key={href} href={href} className="text-text-muted hover:text-text text-[12px] font-medium transition-colors">{label}</Link>
          ))}
        </nav>
        <p className="text-text-faint text-[11px]">{footer.copyright}</p>
      </div>
    </footer>
  );
}
