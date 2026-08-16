import { afterEach, describe, expect, it } from "vitest";

import {
  createEventPassStructuredData,
  createHomeStructuredData,
  createPageMetadata,
  createRobotsMetadata,
  DEFAULT_SITE_URL,
  getSiteUrl,
  serializeJsonLd,
} from "./seo";

const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL;

afterEach(() => {
  if (originalAppUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
  else process.env.NEXT_PUBLIC_APP_URL = originalAppUrl;
});

describe("SEO metadata", () => {
  it("keeps indexing disabled unless explicitly enabled", () => {
    expect(createRobotsMetadata(false)).toMatchObject({
      index: false,
      follow: false,
      googleBot: { index: false, follow: false, noimageindex: true },
    });
    expect(createRobotsMetadata(true)).toMatchObject({
      index: true,
      follow: true,
      googleBot: { index: true, follow: true, "max-image-preview": "large" },
    });
  });

  it("creates canonical and social metadata for a public page", () => {
    const metadata = createPageMetadata({
      title: "Event Pass | LayerTalk",
      description: "Event Pass details",
      path: "/event-pass",
    });

    expect(metadata.alternates).toMatchObject({ canonical: "/event-pass" });
    expect(metadata.openGraph).toMatchObject({
      type: "website",
      url: "/event-pass",
      siteName: "LayerTalk",
      locale: "ja_JP",
    });
    expect(metadata.twitter).toMatchObject({ card: "summary_large_image" });
  });

  it("uses the production origin when the configured URL is missing or unsafe", () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    expect(getSiteUrl()).toBe(DEFAULT_SITE_URL);

    process.env.NEXT_PUBLIC_APP_URL = "javascript:alert(1)";
    expect(getSiteUrl()).toBe(DEFAULT_SITE_URL);

    process.env.NEXT_PUBLIC_APP_URL = "https://preview.example.com/some/path";
    expect(getSiteUrl()).toBe("https://preview.example.com");
  });
});

describe("structured data", () => {
  it("describes the website, application, and both price options", () => {
    const data = createHomeStructuredData({
      locale: "ja",
      description: "説明",
      featureNames: ["コメント", "質問", "スタンプ"],
    });

    expect(data["@graph"].map((entry) => entry["@type"])).toEqual([
      "WebSite",
      "SoftwareApplication",
    ]);
    expect(data["@graph"][1]).toMatchObject({
      operatingSystem: "macOS 13 or later",
      offers: [
        { name: "LayerTalk Free", price: "0", priceCurrency: "JPY" },
        { name: "LayerTalk Event Pass", price: "2980", priceCurrency: "JPY" },
      ],
    });
  });

  it("adds product and breadcrumb data to Event Pass", () => {
    const data = createEventPassStructuredData();
    expect(data["@graph"].map((entry) => entry["@type"])).toEqual([
      "Product",
      "BreadcrumbList",
    ]);
  });

  it("escapes markup-breaking less-than signs", () => {
    const serialized = serializeJsonLd({ value: "</script><script>alert(1)</script>" });
    expect(serialized).not.toContain("</script>");
    expect(serialized).toContain("\\u003c/script>");
  });
});
