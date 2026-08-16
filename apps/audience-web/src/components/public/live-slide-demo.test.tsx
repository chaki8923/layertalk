import "@testing-library/jest-dom/vitest";

import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { LiveSlideDemo } from "./live-slide-demo";

describe("LiveSlideDemo", () => {
  it("renders niconico-style comments as plain single-line text", () => {
    const { container } = render(<LiveSlideDemo locale="ja" />);
    const comments = [...container.querySelectorAll(".lt-stage-comment")];

    expect(comments).toHaveLength(3);
    expect(comments.map((comment) => comment.textContent)).toEqual([
      "その視点、面白い！",
      "質問があります",
      "👏👏👏",
    ]);
    expect(comments.every((comment) => comment.childElementCount === 0)).toBe(true);
  });

  it("uses the localized slide copy", () => {
    const { container } = render(<LiveSlideDemo locale="en" />);

    expect(container).toHaveTextContent("Ideas grow in the room.");
    expect(container).toHaveTextContent("That is a great point!");
  });
});
