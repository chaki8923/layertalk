import { describe, expect, it } from "vitest";

import { messages } from "./index";

const locales = ["ja", "en"] as const;

describe("landing copy", () => {
  // page.tsx は featureIcons / worksWithIcons / stepIcons を添字で引く。
  // カタログ側に4件目を足すと `undefined!` を描画してページごと落ちる。
  it("keeps every icon-backed list at three items in both locales", () => {
    for (const locale of locales) {
      const { features, worksWith, howItWorks } = messages[locale].landing;
      expect(features.items).toHaveLength(3);
      expect(worksWith.points).toHaveLength(3);
      expect(howItWorks.steps).toHaveLength(3);
    }
  });

  // `Messages = typeof ja` はキーの過不足しか見ないので、配列の要素数のずれはここで見る。
  it("keeps the works-with chip row deduped and the same length across locales", () => {
    for (const locale of locales) {
      const { tools } = messages[locale].landing.worksWith;
      expect(tools.length).toBeGreaterThan(0);
      expect(new Set(tools).size).toBe(tools.length);
    }
    expect(messages.en.landing.worksWith.tools).toHaveLength(
      messages.ja.landing.worksWith.tools.length,
    );
  });

  // 本文は terms={tools} で折り返しを止めている。1つも本文に出てこないなら
  // その prop は死んでいて、コピーがチップの一覧からずれている。
  it("names at least one chip-row tool in the section copy", () => {
    for (const locale of locales) {
      const { description, tools } = messages[locale].landing.worksWith;
      expect(tools.some((tool) => description.includes(tool))).toBe(true);
    }
  });
});
