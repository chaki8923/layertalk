import type { Metadata } from "next";

import { LegalDocument } from "@/components/public/legal-document";
import { PublicShell } from "@/components/public/public-shell";
import { legalConfig } from "@/content/legal/config";
import { termsContent } from "@/content/legal/terms";

export const metadata: Metadata = { title: "利用規約 | LayerTalk" };

export default function TermsPage() {
  return <PublicShell><LegalDocument document={termsContent(legalConfig)} /></PublicShell>;
}
