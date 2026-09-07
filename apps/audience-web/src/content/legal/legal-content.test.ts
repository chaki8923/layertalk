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

  /**
   * これが落ちるときは、App Store 版のアプリ内から Stripe の販売条件を
   * 見せている。App Store 3.1.1（別の決済手段への誘導）に直結する。
   */
  it("keeps Stripe out of the App Store channel terms", () => {
    const appStore = JSON.stringify(termsContent(config, "app-store"));
    expect(appStore).not.toContain("Stripe");
    expect(appStore).not.toContain("2,980");
    expect(appStore).toContain("App Store");
    // 自動更新しないことは、非自動更新サブスクを売る以上どこかで言い切る必要がある。
    expect(appStore).toContain("自動更新");
  });

  it("keeps the Stripe channel as the default", () => {
    expect(JSON.stringify(termsContent(config))).toContain("Stripe Checkout");
    expect(JSON.stringify(termsContent(config, "stripe"))).toContain("2,980");
  });

  it("discloses both payment routes and the local slide capture in the privacy policy", () => {
    const privacy = JSON.stringify(privacyContent(config));
    // 決済経路はチャネルで切り替えない。1本の URL を App Store Connect に出すため。
    expect(privacy).toContain("App Store");
    expect(privacy).toContain("Apple");
    expect(privacy).toContain("Stripe");
    // 画面を録る機能を持つ以上、ポリシーに書いていないと 5.1.1(i) で詰まる。
    expect(privacy).toContain("スライド");
    expect(privacy).toContain("30日");
  });

  it("numbers privacy sections consecutively", () => {
    const numbers = privacyContent(config).sections
      .map((section) => Number(section.title.split(".")[0]));
    expect(numbers).toEqual(numbers.map((_, index) => index + 1));
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
