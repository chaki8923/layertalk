import { describe, expect, it } from "vitest";

import { legalPagePath } from "./legal-links";

describe("legalPagePath", () => {
  it("keeps the direct build on the default channel", () => {
    expect(legalPagePath("terms", { locale: "ja", mas: false })).toBe("/legal/terms");
    expect(legalPagePath("support", { locale: "ja", mas: false, hash: "refunds" })).toBe("/support#refunds");
  });

  // これが崩れると、MAS 版のアプリ内から Stripe の販売条件が開く（App Store 3.1.1）。
  it("sends the Mac App Store build to App Store terms, but never adds a channel to the privacy policy", () => {
    expect(legalPagePath("terms", { locale: "ja", mas: true })).toBe("/legal/terms?channel=app-store");
    expect(legalPagePath("tokusho", { locale: "ja", mas: true })).toBe("/legal/tokusho?channel=app-store");
    expect(legalPagePath("support", { locale: "en", mas: true, hash: "refunds" })).toBe("/support?channel=app-store#refunds");
    expect(legalPagePath("privacy", { locale: "ja", mas: true })).toBe("/legal/privacy");
  });

  it("asks for English only where an English version exists", () => {
    expect(legalPagePath("privacy", { locale: "en", mas: true })).toBe("/legal/privacy?lang=en");
    expect(legalPagePath("terms", { locale: "en", mas: true })).toBe("/legal/terms?channel=app-store&lang=en");
    expect(legalPagePath("tokusho", { locale: "en", mas: false })).toBe("/legal/tokusho");
  });
});
