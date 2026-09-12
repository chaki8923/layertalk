import Link from "next/link";

import type { Locale } from "@layertalk/shared/i18n";

import { legalDocumentQuery } from "@/content/legal/locale";
import { messages } from "@/i18n";

export function PublicFooter({ locale = "ja" }: { locale?: Locale }) {
  const footer = messages[locale].public.footer;
  // 英語で見ている人には、英語版のある規約・プライバシーを英語で開く。
  const legalQuery = legalDocumentQuery(locale);
  const links = [
    [footer.home, "/"],
    [footer.eventPass, "/event-pass"],
    [footer.terms, `/legal/terms${legalQuery}`],
    [footer.privacy, `/legal/privacy${legalQuery}`],
    [footer.commerce, "/legal/tokusho"],
    [footer.support, "/support"],
  ] as const;

  return (
    <footer className="border-border mt-auto border-t">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6">
        <nav aria-label={footer.label} className="flex flex-wrap gap-x-5 gap-y-3">
          {links.map(([label, href]) => (
            <Link key={href} href={href} className="lt-nowrap text-text-muted hover:text-text text-[12px] font-medium transition-colors">{label}</Link>
          ))}
        </nav>
        <p className="text-text-faint text-[11px]">{footer.copyright}</p>
      </div>
    </footer>
  );
}
