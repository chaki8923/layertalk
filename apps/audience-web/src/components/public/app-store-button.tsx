import { Download } from "lucide-react";

import type { Locale } from "@layertalk/shared/i18n";

import { messages } from "@/i18n";
import { APP_STORE_URL } from "@/lib/seo";
import type { PublicAppearance } from "./appearance";
import styles from "./mascot-public.module.css";

const variantClass = {
  primary: "bg-gradient-brand shadow-glow min-h-12 px-5 text-[14px] text-white",
  secondary: "border-border bg-surface hover:bg-surface-strong min-h-12 border px-5 text-[14px] transition-colors",
  compact: "border-border bg-surface hover:bg-surface-strong min-h-9 border px-3 text-[12px] transition-colors",
} as const;

/** 発表者アプリ（Mac App Store）への外部リンク。Apple の公式バッジ素材は使わない。 */
export function AppStoreButton({
  locale = "ja",
  variant = "primary",
  appearance = "default",
  // display はここで決める（base に inline-flex を置くと hidden と衝突する）。
  className = "inline-flex",
}: {
  locale?: Locale;
  variant?: keyof typeof variantClass;
  appearance?: PublicAppearance;
  className?: string;
}) {
  const t = messages[locale].public.appStore;
  const mascot = appearance === "mascot";
  const look = mascot ? (variant === "primary" ? styles.primaryButton : variant === "compact" ? styles.compactButton : styles.secondaryButton) : variantClass[variant];

  return (
    <a
      href={APP_STORE_URL}
      target="_blank"
      rel="noopener noreferrer"
      className={`lt-tap lt-nowrap items-center justify-center gap-2 ${mascot ? "" : "rounded-control font-bold"} ${look} ${className}`}
    >
      <Download size={variant === "compact" ? 14 : 16} aria-hidden="true" />
      {variant === "compact" ? t.compact : t.cta}
    </a>
  );
}
