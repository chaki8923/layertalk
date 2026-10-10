import Link from "next/link";

import type { Locale } from "@layertalk/shared/i18n";

import { legalDocumentQuery } from "@/content/legal/locale";
import { messages } from "@/i18n";
import type { PublicAppearance } from "./appearance";
import styles from "./mascot-public.module.css";

export function PublicFooter({ locale = "ja", appearance = "default" }: { locale?: Locale; appearance?: PublicAppearance }) {
  const footer = messages[locale].public.footer;
  const mascot = appearance === "mascot";
  // 英語で見ている人には、英語版のある規約・プライバシーを英語で開く。
  const legalQuery = legalDocumentQuery(locale);
  const links = [
    [footer.home, "/"],
    [footer.eventPass, "/event-pass"],
    // 解説記事は日本語だけ。
    ...(locale === "ja" ? ([["盛り上げ方ガイド", "/guides"]] as const) : []),
    [footer.terms, `/legal/terms${legalQuery}`],
    [footer.privacy, `/legal/privacy${legalQuery}`],
    [footer.commerce, "/legal/tokusho"],
    [footer.support, "/support"],
  ] as const;

  return (
    <footer className={mascot ? styles.footer : "border-border mt-auto border-t"}>
      <div className={mascot ? styles.footerInner : "mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6"}>
        <nav aria-label={footer.label} className={mascot ? styles.footerNav : "flex flex-wrap gap-x-5 gap-y-3"}>
          {links.map(([label, href]) => (
            <Link key={href} href={href} className="lt-nowrap text-text-muted hover:text-text text-[12px] font-medium transition-colors">{label}</Link>
          ))}
        </nav>
        <p className={mascot ? styles.copyright : "text-text-faint text-[11px]"}>{footer.copyright}</p>
      </div>
    </footer>
  );
}
