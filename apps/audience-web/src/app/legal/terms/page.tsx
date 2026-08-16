import type { Metadata } from "next";

import { LegalDocument } from "@/components/public/legal-document";
import { PublicShell } from "@/components/public/public-shell";
import { legalConfig } from "@/content/legal/config";
import { termsContent } from "@/content/legal/terms";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "利用規約 | LayerTalk",
  description: "LayerTalkおよびEvent Passの利用条件を定める利用規約です。",
  path: "/legal/terms",
});

export default function TermsPage() {
  return <PublicShell><LegalDocument document={termsContent(legalConfig)} /></PublicShell>;
}
