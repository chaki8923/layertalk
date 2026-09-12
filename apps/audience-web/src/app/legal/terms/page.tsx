import type { Metadata } from "next";

import { LegalDocument } from "@/components/public/legal-document";
import { PublicShell } from "@/components/public/public-shell";
import { resolveSalesChannel } from "@/content/legal/channel";
import { legalConfig } from "@/content/legal/config";
import { legalDocumentQuery, resolveLegalLocale } from "@/content/legal/locale";
import { termsContent } from "@/content/legal/terms";
import { termsContentEn } from "@/content/legal/terms.en";
import { messages } from "@/i18n";
import { createPageMetadata } from "@/lib/seo";

// `?channel=app-store` で App Store 決済向けの条件を出す。既定は Stripe。
// Mac App Store 版のアプリが購入シートからこのクエリ付きで開く。
// `?lang=en` で英語版。正は日本語版（`content/legal/locale.ts`）。
async function resolveDocument(props: PageProps<"/legal/terms">) {
  const searchParams = await props.searchParams;
  return { channel: resolveSalesChannel(searchParams.channel), locale: resolveLegalLocale(searchParams.lang) };
}

export async function generateMetadata(props: PageProps<"/legal/terms">): Promise<Metadata> {
  const { channel, locale } = await resolveDocument(props);
  const meta = messages[locale].public.legal;
  return createPageMetadata({
    title: meta.termsTitle,
    description: meta.termsDescription,
    path: `/legal/terms${legalDocumentQuery(locale, channel)}`,
    locale,
  });
}

export default async function TermsPage(props: PageProps<"/legal/terms">) {
  const { channel, locale } = await resolveDocument(props);
  const document = locale === "en"
    ? termsContentEn({ supportEmail: legalConfig.supportEmail, effectiveDate: legalConfig.effectiveDateEn, updatedDate: legalConfig.termsUpdatedDateEn }, channel)
    : termsContent({ ...legalConfig, updatedDate: legalConfig.termsUpdatedDate }, channel);
  const alternateHref = `/legal/terms${legalDocumentQuery(locale === "en" ? "ja" : "en", channel)}`;
  return <PublicShell locale={locale}><LegalDocument document={document} locale={locale} alternateHref={alternateHref} /></PublicShell>;
}
