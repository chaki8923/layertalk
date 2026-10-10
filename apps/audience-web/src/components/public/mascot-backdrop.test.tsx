import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { MascotBackdrop } from "./mascot-backdrop";
import { MascotMotionControl, MascotMotionProvider } from "./mascot-motion";

vi.mock("motion/react", () => ({ useReducedMotion: () => false }));

let pageHeight: number;
let bandHeight: number;
let resize: () => void;
let disconnectResize: ReturnType<typeof vi.fn>;
let intersections: Map<Element, (visible: boolean) => void>;
let disconnectIntersections: ReturnType<typeof vi.fn>[];

beforeEach(() => {
  pageHeight = 1500;
  bandHeight = 400;
  intersections = new Map();
  disconnectIntersections = [];
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    return { height: this.hasAttribute("data-band-measure") ? bandHeight : pageHeight } as DOMRect;
  });
  vi.stubGlobal("ResizeObserver", class {
    constructor(callback: ResizeObserverCallback) {
      resize = () => callback([], this as unknown as ResizeObserver);
      disconnectResize = this.disconnect;
    }
    observe = vi.fn();
    disconnect = vi.fn();
  });
  vi.stubGlobal("IntersectionObserver", class {
    private targets = new Set<Element>();
    constructor(private callback: IntersectionObserverCallback) {
      disconnectIntersections.push(this.disconnect);
    }
    observe(target: Element) {
      this.targets.add(target);
      intersections.set(target, (visible) => this.callback([
        { target, isIntersecting: visible } as IntersectionObserverEntry,
      ], this as unknown as IntersectionObserver));
    }
    disconnect = vi.fn(() => this.targets.forEach((target) => intersections.delete(target)));
  });
});

afterEach(() => vi.unstubAllGlobals());

function renderBackdrop() {
  return render(<MascotMotionProvider><MascotMotionControl locale="en" /><MascotBackdrop /></MascotMotionProvider>);
}

describe("document mascot backdrop", () => {
  it("covers the changing page height and retains existing swimmers across resizing", () => {
    const view = renderBackdrop();
    act(() => resize());
    expect(document.querySelectorAll("[data-swimming-band]")).toHaveLength(4);
    expect(document.querySelectorAll("[data-background-mascot]")).toHaveLength(20);
    const variants = Array.from(document.querySelectorAll("[data-background-mascot]"), (element) => element.getAttribute("data-background-mascot"));
    expect(new Set(variants).size).toBe(7);
    const firstSwimmer = document.querySelector("[data-background-mascot]");

    bandHeight = 600;
    act(() => resize());
    expect(document.querySelectorAll("[data-swimming-band]")).toHaveLength(3);
    expect(document.querySelector("[data-background-mascot]")).toBe(firstSwimmer);
    pageHeight = 2500;
    act(() => resize());
    expect(document.querySelectorAll("[data-swimming-band]")).toHaveLength(5);
    expect(document.querySelector("[data-background-mascot]")).toBe(firstSwimmer);

    view.unmount();
    expect(disconnectResize).toHaveBeenCalledOnce();
    expect(disconnectIntersections.every((disconnect) => disconnect.mock.calls.length > 0)).toBe(true);
    expect(intersections.size).toBe(0);
  });

  it("tracks document areas independently while respecting the shared pause", () => {
    renderBackdrop();
    act(() => resize());
    const bands = Array.from(document.querySelectorAll("[data-swimming-band]"));
    act(() => {
      intersections.get(bands[0])!(false);
      intersections.get(bands[2])!(true);
    });
    expect(bands[0]).toHaveAttribute("data-near", "false");
    expect(bands[2]).toHaveAttribute("data-near", "true");
    fireEvent.click(screen.getByRole("button", { name: "Pause motion" }));
    expect(document.querySelector("[data-mascot-backdrop]")).toHaveAttribute("data-active", "false");
    act(() => intersections.get(bands[3])!(true));
    expect(document.querySelector("[data-mascot-backdrop]")).toHaveAttribute("data-active", "false");
    fireEvent.click(screen.getByRole("button", { name: "Resume motion" }));
    expect(document.querySelector("[data-mascot-backdrop]")).toHaveAttribute("data-active", "true");
    expect(bands[0]).toHaveAttribute("data-near", "false");
    expect(bands[3]).toHaveAttribute("data-near", "true");
  });
});
