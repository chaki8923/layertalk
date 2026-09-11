import { afterEach, describe, expect, it, vi } from "vitest";

import { onPageVisible } from "./visibility";

let visibility: DocumentVisibilityState = "visible";
Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibility });

const change = (next: DocumentVisibilityState) => {
  visibility = next;
  document.dispatchEvent(new Event("visibilitychange"));
};

afterEach(() => {
  visibility = "visible";
});

describe("onPageVisible", () => {
  it("calls the handler only when the page becomes visible", () => {
    const handler = vi.fn();
    const stop = onPageVisible(handler);

    change("hidden");
    expect(handler).not.toHaveBeenCalled();

    change("visible");
    expect(handler).toHaveBeenCalledTimes(1);
    stop();
  });

  it("stops calling the handler once released", () => {
    const handler = vi.fn();
    const stop = onPageVisible(handler);
    stop();

    change("hidden");
    change("visible");
    expect(handler).not.toHaveBeenCalled();
  });
});
