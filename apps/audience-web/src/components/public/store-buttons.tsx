import { Download } from "lucide-react";

import type { Locale } from "@layertalk/shared/i18n";

import { messages } from "@/i18n";
import { APP_STORE_URL, MICROSOFT_STORE_URL } from "@/lib/seo";
import type { PublicAppearance } from "./appearance";
import styles from "./mascot-public.module.css";

const variantClass = {
  primary: "bg-gradient-brand shadow-glow min-h-12 px-5 text-[14px] text-white",
  secondary: "border-border bg-surface hover:bg-surface-strong min-h-12 border px-5 text-[14px] transition-colors",
  compact: "border-border bg-surface hover:bg-surface-strong min-h-9 border px-3 text-[12px] transition-colors",
} as const;

type Store = "apple" | "microsoft";

const STORE_URL: Record<Store, string> = {
  apple: APP_STORE_URL,
  microsoft: MICROSOFT_STORE_URL,
};

/**
 * 発表者アプリのストアへの外部リンク。Apple / Microsoft の公式バッジ素材は使わない。
 *
 * **OS 判定はしない。** User-Agent で出し分けると、判定が外れた人に相手 OS のボタンしか
 * 見えない状態を作る。両方出して選ばせる方が壊れようが無い（`StoreButtons`）。
 */
export function StoreButton({
  store,
  locale = "ja",
  variant = "primary",
  appearance = "default",
  // display はここで決める（base に inline-flex を置くと hidden と衝突する）。
  className = "inline-flex",
}: {
  store: Store;
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
      href={STORE_URL[store]}
      target="_blank"
      rel="noopener noreferrer"
      className={`lt-tap lt-nowrap items-center justify-center gap-2 ${mascot ? "" : "rounded-control font-bold"} ${look} ${className}`}
    >
      <Download size={variant === "compact" ? 14 : 16} aria-hidden="true" />
      {store === "apple" ? t.apple : t.microsoft}
    </a>
  );
}

/**
 * 2つのストアを並べる。配っているのは同じアプリなので、片方を一次・もう片方を
 * 二次にはしない（`primary` / `secondary` の塗り分けはしているが、これは2つ続けて
 * 同じ塗りが並ぶのを避けるためだけ）。
 *
 * 置き場所は `.actions`（`home.module.css`）で、`flex-wrap` なので狭い画面では折り返す。
 */
export function StoreButtons({
  locale = "ja",
  appearance = "default",
  className = "",
}: {
  locale?: Locale;
  appearance?: PublicAppearance;
  className?: string;
}) {
  return (
    <>
      <StoreButton store="apple" locale={locale} variant="primary" appearance={appearance} className={`inline-flex ${className}`} />
      <StoreButton store="microsoft" locale={locale} variant="secondary" appearance={appearance} className={`inline-flex ${className}`} />
    </>
  );
}
