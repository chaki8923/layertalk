import Link from "next/link";
import { ArrowRight } from "lucide-react";

import { guidePath, guides } from "@/content/guides";

import { ProtectedText } from "./phrase-text";

/** 解説記事のカード一覧。LP の `#guides` と `/guides` で共有する。 */
export function GuideCards({ className = "" }: { className?: string }) {
  return (
    <ul className={`grid gap-2.5 md:grid-cols-2 lg:grid-cols-3 ${className}`}>
      {guides.map((guide) => (
        <li key={guide.slug}>
          <Link href={guidePath(guide.slug)} className="border-border bg-surface hover:border-brand/50 flex h-full flex-col rounded-card border p-6 transition-colors">
            <span className="text-[16px] leading-[1.45] font-bold"><ProtectedText text={guide.title} /></span>
            <span className="text-text-muted mt-3 text-[13px] leading-6"><ProtectedText text={guide.lead} /></span>
            <span className="text-brand mt-auto inline-flex items-center gap-1.5 pt-5 text-[12px] font-bold">記事を読む<ArrowRight size={14} aria-hidden="true" /></span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
