import type { MetadataRoute } from "next";

import { getSiteUrl } from "@/lib/seo";

export default function robots(): MetadataRoute.Robots {
  return {
    // `/r/` はここで塞がない。クロールを禁止すると noindex が読まれず、QR から共有された
    // ルームの URL が「中身の無いまま」登録される経路が残る。止めるのは `privatePageRobots` の役目。
    rules: { userAgent: "*", allow: "/", disallow: "/api/" },
    sitemap: `${getSiteUrl()}/sitemap.xml`,
  };
}
