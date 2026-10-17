import type { Locale } from "@layertalk/shared/i18n";

import { messages } from "@/i18n";
import { APP_STORE_URL, MICROSOFT_STORE_URL } from "@/lib/seo";

/**
 * 発表者アプリのストアへの外部リンク。**各社が配っている公式バッジをそのまま貼る。**
 *
 * 自前でロゴを描かないこと。Apple の Identity Guidelines は、Apple ロゴを
 * 第三者が単体で使うことを認めていない（使えるのは公式バッジの中だけ）。
 * Windows ロゴにも同様の規定がある。素材は `public/store-badges/`。
 *
 * **OS 判定はしない。** User-Agent で出し分けると、判定が外れた人に相手 OS の
 * ボタンしか見えない状態を作る。両方出して選ばせる方が壊れようが無い。
 */

/**
 * バッジは**版の呼び名が2社で逆**なので、ページの背景で引けるようにここで閉じ込める。
 *
 *   Apple      `black` = 黒い板 → 明るい背景に置く／`white` = 白い板 → 暗い背景に置く
 *   Microsoft  `dark`  = 濃い板 → 明るい背景に置く／`light` = 白い板 → 暗い背景に置く
 *
 * Microsoft は**バッジ自身の色**で名前を付けていて、Apple と同じ読み方をすると
 * 明暗が入れ替わる。下のキーは「どちらの背景に置くか」で統一してある。
 */
const BADGE = {
  apple: {
    onLight: "/store-badges/apple-LOCALE-black.svg",
    onDark: "/store-badges/apple-LOCALE-white.svg",
    // 原寸 40px 高。44px に揃えたときの幅。
    width: { ja: 154, en: 172 },
  },
  microsoft: {
    onLight: "/store-badges/microsoft-LOCALE-dark.svg",
    onDark: "/store-badges/microsoft-LOCALE-light.svg",
    width: { ja: 161, en: 161 },
  },
} as const;

/** バッジの表示高（px）。Microsoft の原寸に合わせ、Apple を同じ高さへ伸ばす。 */
const BADGE_HEIGHT = 44;

type Store = keyof typeof BADGE;

const STORE_URL: Record<Store, string> = {
  apple: APP_STORE_URL,
  microsoft: MICROSOFT_STORE_URL,
};

export function StoreBadge({
  store,
  locale = "ja",
  className = "",
}: {
  store: Store;
  locale?: Locale;
  className?: string;
}) {
  const t = messages[locale].public.appStore;
  const badge = BADGE[store];
  const label = store === "apple" ? t.apple : t.microsoft;
  const src = (template: string) => template.replace("LOCALE", locale);

  return (
    <a
      href={STORE_URL[store]}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      className={`lt-tap inline-flex shrink-0 items-center ${className}`}
    >
      {/*
        明暗の切り替えは `<picture>` でやる。クラスで出し分けると両方のバッジを
        読み込むことになり、JS でやるとハイドレーションのずれになる。
        **既定（`<img>` 側）は暗い背景向け** — `theme.css` の `color-scheme: dark` が既定で、
        明るいのは `prefers-color-scheme: light` のときだけ。
      */}
      <picture>
        <source srcSet={src(badge.onLight)} media="(prefers-color-scheme: light)" />
        {/* `next/image` は使わない。SVG には `dangerouslyAllowSVG` が要るうえ、
            各社配布のバッジは加工せずそのまま出すのが規定。 */}
        <img
          src={src(badge.onDark)}
          alt={label}
          width={badge.width[locale]}
          height={BADGE_HEIGHT}
          style={{ height: BADGE_HEIGHT, width: "auto" }}
        />
      </picture>
    </a>
  );
}

/**
 * 2つのストアを並べる。配っているのは同じアプリなので、片方を一次・もう片方を
 * 二次にはしない。置き場所は `.actions`（`home.module.css`）で、`flex-wrap` なので
 * 狭い画面では折り返す。
 */
export function StoreButtons({ locale = "ja", className = "" }: { locale?: Locale; className?: string }) {
  return (
    <>
      <StoreBadge store="apple" locale={locale} className={className} />
      <StoreBadge store="microsoft" locale={locale} className={className} />
    </>
  );
}
