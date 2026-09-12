import type { Metadata } from "next";

import { LegalDocument } from "@/components/public/legal-document";
import { PublicShell } from "@/components/public/public-shell";
import { legalConfig } from "@/content/legal/config";
import { legalDocumentQuery, resolveLegalLocale } from "@/content/legal/locale";
import { privacyContent } from "@/content/legal/privacy";
import { privacyContentEn } from "@/content/legal/privacy.en";
import { messages } from "@/i18n";
import { createPageMetadata } from "@/lib/seo";

// `?lang=en` で英語版。正は日本語版。チャネルでは出し分けない（App Store Connect に登録する
// URL を言語ごとに 1 本にするため。両チャネルの記述を 1 枚に持たせてある）。
export async function generateMetadata(props: PageProps<"/legal/privacy">): Promise<Metadata> {
  const locale = resolveLegalLocale((await props.searchParams).lang);
  const meta = messages[locale].public.legal;
  return createPageMetadata({
    title: meta.privacyTitle,
    description: meta.privacyDescription,
    path: `/legal/privacy${legalDocumentQuery(locale)}`,
    locale,
  });
}

export default async function PrivacyPage(props: PageProps<"/legal/privacy">) {
  const locale = resolveLegalLocale((await props.searchParams).lang);
  const document = locale === "en"
    ? privacyContentEn({ supportEmail: legalConfig.supportEmail, effectiveDate: legalConfig.effectiveDateEn, updatedDate: legalConfig.updatedDateEn })
    : privacyContent(legalConfig);
  const alternateHref = `/legal/privacy${legalDocumentQuery(locale === "en" ? "ja" : "en")}`;
  return <PublicShell locale={locale}><LegalDocument document={document} locale={locale} alternateHref={alternateHref} /></PublicShell>;
}
