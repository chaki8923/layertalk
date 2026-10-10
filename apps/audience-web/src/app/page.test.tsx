import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

import HomePage from "./page";
import { mascotVariants } from "@/components/public/mascot-data";
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
    const mascots = Array.from(main.querySelectorAll("[data-mascot]"));
    expect(mascots.map((mascot) => mascot.getAttribute("data-mascot")).sort()).toEqual(Object.keys(mascotVariants).sort());
    expect(main.querySelector('#how-it-works [data-mascot]')?.getAttribute("data-mascot")).toBe("round");
    expect(main.querySelector('#works-with [data-mascot]')?.getAttribute("data-mascot")).toBe("flat");
    const pass = sections.find((section) => section.querySelector('a[href="/event-pass"]'))!;
    expect(pass.querySelector('[data-mascot]')?.getAttribute("data-mascot")).toBe("puff");
    expect(Array.from(sections.at(-1)!.querySelectorAll("[data-mascot]")).map((mascot) => mascot.getAttribute("data-mascot"))).toEqual(["tall", "lean"]);
    for (const mascot of mascots.filter((mascot) => mascot.getAttribute("data-mascot") !== "neutral")) {
      expect(mascot.querySelector("img")?.getAttribute("loading")).toBe("lazy");
    }
    expect(main.textContent).toContain(messages[locale].landing.eventPass.price);
    expect(main.querySelectorAll("#how-it-works ol > li")).toHaveLength(2);
  });
});
