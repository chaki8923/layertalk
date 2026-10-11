import { beforeEach, describe, expect, it } from "vitest";

import { DEFAULT_SETTINGS, loadSettings, SECTION_IDS, SECTION_ORDER_VERSION } from "./settings";

const STORAGE_KEY = "layertalk:presenter-settings";

const store = (value: Record<string, unknown>) =>
  localStorage.setItem(STORAGE_KEY, JSON.stringify(value));

describe("loadSettings / sectionOrder", () => {
  beforeEach(() => localStorage.clear());

  it("starts from the default order", () => {
    expect(loadSettings().sectionOrder).toEqual([...SECTION_IDS]);
  });

  // 既定の並びを変えたときだけ保存値を捨てる。版印が無いと、一度でも並び替えた人には
  // 新しい既定が永久に届かない（`normalizeSectionOrder` は保存値を正とするため）。
  it("resets an order saved before the default changed", () => {
    store({ sectionOrder: ["monitor", "room", "display", "stamp", "customStamp", "eventPass"] });
    expect(loadSettings().sectionOrder).toEqual([...SECTION_IDS]);
  });

  it("keeps a deliberate order once it carries the current version", () => {
    const custom = ["display", ...SECTION_IDS.filter((id) => id !== "display")];
    store({ sectionOrder: custom, sectionOrderVersion: SECTION_ORDER_VERSION });
    expect(loadSettings().sectionOrder).toEqual(custom);
  });

  // 版はそのままでセクションを増やしたとき用。既定へ戻さず末尾に足すだけ。
  it("appends a section that is missing from a current-version order", () => {
    const withoutSafety = SECTION_IDS.filter((id) => id !== "safety");
    store({ sectionOrder: withoutSafety, sectionOrderVersion: SECTION_ORDER_VERSION });
    expect(loadSettings().sectionOrder).toEqual([...withoutSafety, "safety"]);
  });

  it("stamps the current version so the reset happens only once", () => {
    store({ sectionOrder: ["monitor", "room"] });
    expect(loadSettings().sectionOrderVersion).toBe(SECTION_ORDER_VERSION);
    expect(DEFAULT_SETTINGS.sectionOrderVersion).toBe(SECTION_ORDER_VERSION);
  });
});

describe("loadSettings / monitorName", () => {
  beforeEach(() => localStorage.clear());

  // null は「主ディスプレイ」ではなく「自動（外部優先）」。解決は `lib/monitors.ts`。
  it("defaults to automatic", () => {
    expect(loadSettings().monitorName).toBeNull();
  });

  it("restores an explicit pick as-is", () => {
    store({ monitorName: String.raw`\\.\DISPLAY2` });
    expect(loadSettings().monitorName).toBe(String.raw`\\.\DISPLAY2`);
  });
});
