import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import HomePage from "./page";
import { messages } from "@/i18n";

const request = vi.hoisted(() => ({ locale: "ja" }));
vi.mock("next/headers", () => ({
  headers: async () => new Headers({ "accept-language": request.locale }),
}));

describe("home page audience entry and reading order", () => {
  it.each(["ja", "en"] as const)("leads with the presentation steps and sends code entry to /join in %s", async (locale) => {
    request.locale = locale;
    const page = document.createElement("div");
    page.innerHTML = renderToStaticMarkup(await HomePage());
    const main = page.querySelector("main")!;
    const sections = Array.from(main.children).filter((element) => element.tagName === "SECTION");
    const order = sections.map((section) => section.id || (
      section.querySelector("h1") ? "hero" :
      section.querySelector('a[href="/event-pass"]') ? "event-pass" : "final"
    ));
    expect(order).toEqual([
      "hero", "how-it-works", "features", "works-with", "event-pass",
      ...(locale === "ja" ? ["guides"] : []), "final",
    ]);
    expect(main.querySelector("form, input, #join")).toBeNull();
    expect(page.querySelectorAll('a[href="/join"]').length).toBeGreaterThan(0);
    expect(main.querySelector('[data-mascot="round"]')).toBeNull();
    expect(main.querySelectorAll("[data-mascot]")).toHaveLength(3);
    expect(main.textContent).toContain(messages[locale].landing.eventPass.price);
    expect(main.querySelectorAll("#how-it-works ol > li")).toHaveLength(2);
  });
});
