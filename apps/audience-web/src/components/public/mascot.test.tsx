import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Mascot } from "./mascot";

// Exercise input routing and cancellation independently of animation timing.
// The provider's reduced-motion/visibility behavior has separate integration tests.
const animation = vi.hoisted(() => ({
  enabled: true, visible: true,
  start: vi.fn((definition: unknown) => { void definition; return Promise.resolve(); }), stop: vi.fn(), reset: vi.fn(),
  tilt: { set: vi.fn(), jump: vi.fn() },
}));
vi.mock("./mascot-motion", () => ({ useMascotMotion: () => ({ enabled: animation.enabled }) }));
vi.mock("motion/react", async () => {
  const React = await import("react");
  const controls = { start: animation.start, stop: animation.stop, set: animation.reset };
  return {
    useInView: () => animation.visible,
    useAnimationControls: () => controls,
    useMotionValue: () => animation.tilt,
    useSpring: () => animation.tilt,
    motion: { div: React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement> & { animate?: unknown; initial?: unknown }>(
      function MotionDiv({ animate, initial, style, ...props }, ref) {
        void animate; void initial; void style;
        return React.createElement("div", { ...props, ref });
      },
    ) },
  };
});

function pointer(button: HTMLElement, type: string, pointerType = "mouse", clientX = 90) {
  const event = new Event(type, { bubbles: true });
  Object.assign(event, { pointerType, clientX });
  fireEvent(button, event);
}

describe("mascot input", () => {
  afterEach(() => vi.unstubAllGlobals());
  beforeEach(() => {
    animation.enabled = true; animation.visible = true;
    animation.start.mockClear(); animation.stop.mockClear(); animation.reset.mockClear();
    animation.tilt.set.mockClear(); animation.tilt.jump.mockClear();
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
  });

  it("uses a named native button so Enter and Space activate the same click action", async () => {
    render(<Mascot locale="en" />);
    const button = screen.getByRole("button", { name: "Make the mascot wobble" });
    expect(button).toHaveAttribute("type", "button");
    await act(async () => fireEvent.click(button));
    expect(animation.start).toHaveBeenCalledWith(expect.objectContaining({
      scaleX: [null, 1.06, .973, 1], scaleY: [null, .94, 1.027, 1],
      transition: expect.objectContaining({ duration: .7 }),
    }));
  });

  it("restarts rapid clicks from the current scale instead of accumulating scale", async () => {
    render(<Mascot locale="ja" />);
    const button = screen.getByRole("button", { name: "キャラをぷにっと動かす" });
    await act(async () => { fireEvent.click(button); fireEvent.click(button); fireEvent.click(button); });
    expect(animation.stop).toHaveBeenCalledTimes(3);
    expect(animation.start).toHaveBeenCalledTimes(3);
    for (const [reaction] of animation.start.mock.calls) {
      expect(reaction).toMatchObject({ scaleX: [null, 1.06, .973, 1] });
    }
  });

  it("leans toward the pointer by at most two degrees and resets on cancellation", async () => {
    render(<Mascot locale="en" />);
    const button = screen.getByRole("button");
    vi.spyOn(button, "getBoundingClientRect").mockReturnValue({ left: 0, width: 100 } as DOMRect);
    await act(async () => pointer(button, "pointerover", "mouse", 150));
    expect(animation.tilt.set).toHaveBeenCalledWith(2);
    expect(animation.start).toHaveBeenCalledTimes(1);
    pointer(button, "pointercancel");
    expect(animation.tilt.set).toHaveBeenLastCalledWith(0);
    expect(animation.start).toHaveBeenLastCalledWith(expect.objectContaining({
      scaleX: 1, scaleY: 1, transition: { duration: .6 },
    }));
  });

  it("does not react to touch hover or move while a finger scrolls", () => {
    render(<Mascot locale="ja" />);
    const button = screen.getByRole("button");
    pointer(button, "pointerover", "touch");
    pointer(button, "pointermove", "touch");
    expect(animation.start).not.toHaveBeenCalled();
    expect(animation.tilt.set).not.toHaveBeenCalled();
  });

  it.each(["paused", "offscreen"])("shows outline feedback without movement when %s", async (state) => {
    animation.enabled = state !== "paused";
    animation.visible = state !== "offscreen";
    const { container } = render(<Mascot locale="en" variant="round" />);
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Make the round mascot wobble" })));
    expect(container.querySelector("[data-mascot]")).toHaveAttribute("data-feedback", "true");
    expect(animation.start).not.toHaveBeenCalled();
    expect(animation.reset).toHaveBeenCalledWith({ scaleX: 1, scaleY: 1 });
  });
});
