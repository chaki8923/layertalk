import type { Metadata } from "next";

import { LegalDocument } from "@/components/public/legal-document";
import { PublicShell } from "@/components/public/public-shell";
import { legalConfig } from "@/content/legal/config";
import { privacyContent } from "@/content/legal/privacy";

export const metadata: Metadata = { title: "プライバシーポリシー | LayerTalk" };

export default function PrivacyPage() {
  return <PublicShell><LegalDocument document={privacyContent(legalConfig)} /></PublicShell>;
}
