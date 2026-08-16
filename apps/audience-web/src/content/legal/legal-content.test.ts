import { describe, expect, it } from "vitest";

import { privacyContent } from "./privacy";
import { termsContent } from "./terms";

const config = {
  supportEmail: "support@example.com",
  refundPolicy: "購入から7日以内に申請してください。",
  effectiveDate: "2026年8月16日",
  updatedDate: "2026年8月16日",
};

describe("legal content", () => {
  it("uses unique, linkable section ids", () => {
    for (const document of [termsContent(config), privacyContent(config)]) {
      const ids = document.sections.map((section) => section.id);
      expect(new Set(ids).size).toBe(ids.length);
      expect(ids.every((id) => /^[a-z][a-z-]+$/.test(id))).toBe(true);
    }
  });

  it("includes Event Pass terms and current providers", () => {
    const terms = termsContent(config);
    const privacy = privacyContent(config);
    expect(JSON.stringify(terms)).toContain("1ルーム");
    expect(JSON.stringify(terms)).toContain("7日間");
    expect(JSON.stringify(terms)).toContain(config.refundPolicy);
    expect(JSON.stringify(privacy)).toContain("Stripe");
    expect(JSON.stringify(privacy)).toContain("Supabase");
    expect(JSON.stringify(privacy)).toContain("Cloudflare Turnstile");
  });
});
