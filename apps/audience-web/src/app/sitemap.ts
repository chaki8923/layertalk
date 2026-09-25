import type { MetadataRoute } from "next";

import { guidePath, guides } from "@/content/guides";
import { getSiteUrl } from "@/lib/seo";

/** `?lang=en` / `?channel=app-store` は canonical が同じページなので載せない。 */
const PUBLIC_PATHS = [
  "/",
  "/event-pass",
  "/legal/privacy",
  "/legal/terms",
  "/legal/tokusho",
  "/support",
  ...guides.map(({ slug }) => guidePath(slug)),
];

export default function sitemap(): MetadataRoute.Sitemap {
  const siteUrl = getSiteUrl();
  return PUBLIC_PATHS.map((path) => ({ url: `${siteUrl}${path}` }));
}
