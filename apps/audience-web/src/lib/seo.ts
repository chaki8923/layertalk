import type { Metadata } from "next";

import type { Locale } from "@layertalk/shared/i18n";

export const SITE_NAME = "LayerTalk";
export const DEFAULT_SITE_URL = "https://www.layer-talk.com";
export const SOCIAL_IMAGE_ALT = "LayerTalk — Bring the room onto your slides";

const openGraphLocale: Record<Locale, string> = {
  ja: "ja_JP",
  en: "en_US",
};

const documentLocale: Record<Locale, string> = {
  ja: "ja-JP",
  en: "en-US",
};

export function getSiteUrl(): string {
  const configuredUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();

  if (!configuredUrl) return DEFAULT_SITE_URL;

  try {
    const url = new URL(configuredUrl);
    if (url.protocol !== "https:" && url.protocol !== "http:") return DEFAULT_SITE_URL;
    return new URL("/", url).toString().replace(/\/$/, "");
  } catch {
    return DEFAULT_SITE_URL;
  }
}

export function isSearchIndexingEnabled(): boolean {
  return process.env.SEARCH_INDEXING_ENABLED === "true";
}

export function createRobotsMetadata(indexingEnabled = isSearchIndexingEnabled()): Metadata["robots"] {
  if (indexingEnabled) {
    return {
      index: true,
      follow: true,
      googleBot: {
        index: true,
        follow: true,
        "max-video-preview": -1,
        "max-image-preview": "large",
        "max-snippet": -1,
      },
    };
  }

  return {
    index: false,
    follow: false,
    nocache: true,
    googleBot: {
      index: false,
      follow: false,
      noimageindex: true,
    },
  };
}

export const privatePageRobots: Metadata["robots"] = {
  index: false,
  follow: false,
  nocache: true,
  googleBot: {
    index: false,
    follow: false,
    noimageindex: true,
  },
};

type PageMetadataOptions = {
  title: string;
  description: string;
  path: `/${string}` | "/";
  locale?: Locale;
  keywords?: string[];
};

export function createPageMetadata({
  title,
  description,
  path,
  locale = "ja",
  keywords,
}: PageMetadataOptions): Metadata {
  return {
    title,
    description,
    keywords,
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      title,
      description,
      url: path,
      siteName: SITE_NAME,
      locale: openGraphLocale[locale],
      alternateLocale: [openGraphLocale[locale === "ja" ? "en" : "ja"]],
      images: [
        {
          url: "/opengraph-image",
          width: 1200,
          height: 630,
          alt: SOCIAL_IMAGE_ALT,
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [{ url: "/twitter-image", alt: SOCIAL_IMAGE_ALT }],
    },
  };
}

export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}

type HomeStructuredDataOptions = {
  locale: Locale;
  description: string;
  featureNames: string[];
};

export function createHomeStructuredData({
  locale,
  description,
  featureNames,
}: HomeStructuredDataOptions) {
  const siteUrl = getSiteUrl();
  const websiteId = `${siteUrl}/#website`;
  const softwareId = `${siteUrl}/#software`;

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": websiteId,
        url: `${siteUrl}/`,
        name: SITE_NAME,
        description,
        inLanguage: documentLocale[locale],
      },
      {
        "@type": "SoftwareApplication",
        "@id": softwareId,
        url: `${siteUrl}/`,
        name: SITE_NAME,
        description,
        applicationCategory: "BusinessApplication",
        applicationSubCategory: "Presentation software",
        operatingSystem: "macOS 13 or later",
        softwareRequirements:
          locale === "ja"
            ? "発表者はmacOS 13以降、観客は最新の主要ブラウザとインターネット接続が必要です。"
            : "Presenters need macOS 13 or later; audience members need a current web browser and internet connection.",
        inLanguage: ["ja-JP", "en-US"],
        featureList: featureNames,
        offers: [
          {
            "@type": "Offer",
            name: "LayerTalk Free",
            price: "0",
            priceCurrency: "JPY",
            url: `${siteUrl}/`,
          },
          {
            "@type": "Offer",
            name: "LayerTalk Event Pass",
            description:
              locale === "ja"
                ? "購入した1ルームで7日間利用できるイベント向け機能"
                : "Event features for one purchased room for seven days",
            price: "2980",
            priceCurrency: "JPY",
            url: `${siteUrl}/event-pass`,
          },
        ],
        isPartOf: { "@id": websiteId },
      },
    ],
  };
}

export function createEventPassStructuredData() {
  const siteUrl = getSiteUrl();

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Product",
        "@id": `${siteUrl}/event-pass#product`,
        name: "LayerTalk Event Pass",
        description: "購入した1ルームで7日間使える、LayerTalkのイベント運営向け機能です。",
        category: "Presentation software event pass",
        brand: { "@type": "Brand", name: SITE_NAME },
        url: `${siteUrl}/event-pass`,
        offers: {
          "@type": "Offer",
          url: `${siteUrl}/event-pass`,
          price: "2980",
          priceCurrency: "JPY",
        },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          {
            "@type": "ListItem",
            position: 1,
            name: SITE_NAME,
            item: `${siteUrl}/`,
          },
          {
            "@type": "ListItem",
            position: 2,
            name: "Event Pass",
            item: `${siteUrl}/event-pass`,
          },
        ],
      },
    ],
  };
}
