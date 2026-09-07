import type { Metadata } from "next";

import { LegalDocument } from "@/components/public/legal-document";
import { PublicShell } from "@/components/public/public-shell";
import { legalConfig } from "@/content/legal/config";
import { resolveSalesChannel } from "@/content/legal/channel";
import { termsContent } from "@/content/legal/terms";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "利用規約 | LayerTalk",
  description: "LayerTalkおよびEvent Passの利用条件を定める利用規約です。",
  path: "/legal/terms",
});

// `?channel=app-store` で App Store 決済向けの条件を出す。既定は Stripe。
// Mac App Store 版のアプリが購入シートからこのクエリ付きで開く。
export default async function TermsPage(props: PageProps<"/legal/terms">) {
  const channel = resolveSalesChannel((await props.searchParams).channel);
  return <PublicShell><LegalDocument document={termsContent(legalConfig, channel)} /></PublicShell>;
}
