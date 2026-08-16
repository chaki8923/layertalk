import "@testing-library/jest-dom/vitest";

import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PhraseText, ProtectedText } from "./phrase-text";

describe("public copy wrapping", () => {
  it("keeps phrases intact and only offers breaks between them", () => {
    const { container } = render(<h1><PhraseText phrases={["会場の声を、", "スライド", "の上へ。"]} /></h1>);

    expect(container.querySelector("h1")).toHaveTextContent("会場の声を、スライドの上へ。");
    expect([...container.querySelectorAll(".lt-nowrap")].map((node) => node.textContent)).toEqual([
      "会場の声を、",
      "スライド",
      "の上へ。",
    ]);
    expect(container.querySelectorAll("wbr")).toHaveLength(2);
  });

  it("protects product terms inside otherwise wrapping body copy", () => {
    const { container } = render(
      <p><ProtectedText text="LayerTalkのEvent PassはStripe Checkoutで購入できます。" /></p>,
    );

    expect(container.querySelector("p")).toHaveTextContent("LayerTalkのEvent PassはStripe Checkoutで購入できます。");
    expect([...container.querySelectorAll(".lt-nowrap")].map((node) => node.textContent)).toEqual([
      "LayerTalk",
      "Event Pass",
      "Stripe Checkout",
    ]);
  });
});
