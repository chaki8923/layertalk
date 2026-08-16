import type { Metadata } from "next";

import { LegalDocument } from "@/components/public/legal-document";
import { PublicShell } from "@/components/public/public-shell";
import { legalConfig } from "@/content/legal/config";
import { privacyContent } from "@/content/legal/privacy";
import { createPageMetadata } from "@/lib/seo";

export const metadata: Metadata = createPageMetadata({
  title: "プライバシーポリシー | LayerTalk",
  description: "LayerTalkにおける個人情報と利用データの取り扱いについてご案内します。",
  path: "/legal/privacy",
});

export default function PrivacyPage() {
  return <PublicShell><LegalDocument document={privacyContent(legalConfig)} /></PublicShell>;
}
