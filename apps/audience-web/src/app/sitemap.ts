import type { MetadataRoute } from "next";

import { getSiteUrl } from "@/lib/seo";

/** `?lang=en` / `?channel=app-store` は canonical が同じページなので載せない。 */
const PUBLIC_PATHS = [
  "/",
  "/event-pass",
  "/legal/privacy",
  "/legal/terms",
  "/legal/tokusho",
  "/support",
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = getSiteUrl();
  return PUBLIC_PATHS.map((path) => ({ url: `${siteUrl}${path}` }));
}
