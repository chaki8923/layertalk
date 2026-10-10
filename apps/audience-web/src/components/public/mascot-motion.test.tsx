import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MascotMotionControl, MascotMotionProvider, useMascotMotion } from "./mascot-motion";
import { MascotBackdrop } from "./mascot-backdrop";

const preference = vi.hoisted(() => ({ reduced: false }));
vi.mock("motion/react", () => ({ useReducedMotion: () => preference.reduced }));

function Probe() {
  const { enabled } = useMascotMotion();
  return <output aria-label="Animation state">{enabled ? "running" : "stopped"}</output>;
}

function renderControl(locale: "ja" | "en" = "ja") {
  return render(<MascotMotionProvider><MascotMotionControl locale={locale} /><Probe /><MascotBackdrop /></MascotMotionProvider>);
}

const backdrop = () => document.querySelector("[data-mascot-backdrop]");

describe("mascot motion preferences", () => {
  beforeEach(() => {
    preference.reduced = false;
    vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  });

  it("pauses and resumes all mascot motion through the localized control", () => {
    renderControl();
    fireEvent.click(screen.getByRole("button", { name: "動きを止める" }));
    expect(screen.getByLabelText("Animation state")).toHaveTextContent("stopped");
    expect(backdrop()).toHaveAttribute("data-active", "false");
    expect(screen.getByRole("button", { name: "動きを再開" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "動きを再開" }));
    expect(screen.getByLabelText("Animation state")).toHaveTextContent("running");
    expect(backdrop()).toHaveAttribute("data-active", "true");
  });

  it("keeps motion disabled when the system requests reduced motion", () => {
    preference.reduced = true;
    renderControl("en");
    expect(screen.getByRole("button")).toBeDisabled();
    expect(screen.getByLabelText("Animation state")).toHaveTextContent("stopped");
    expect(backdrop()).toHaveAttribute("data-active", "false");
    expect(backdrop()).toHaveAttribute("data-reduced", "true");
  });

  it("stops in a hidden tab and preserves the user's pause when it becomes visible", () => {
    renderControl("en");
    vi.spyOn(document, "hidden", "get").mockReturnValue(true);
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(screen.getByLabelText("Animation state")).toHaveTextContent("stopped");
    expect(backdrop()).toHaveAttribute("data-active", "false");
    fireEvent.click(screen.getByRole("button", { name: "Pause motion" }));
    vi.spyOn(document, "hidden", "get").mockReturnValue(false);
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(screen.getByLabelText("Animation state")).toHaveTextContent("stopped");
    expect(backdrop()).toHaveAttribute("data-active", "false");
    fireEvent.click(screen.getByRole("button", { name: "Resume motion" }));
    expect(screen.getByLabelText("Animation state")).toHaveTextContent("running");
    expect(backdrop()).toHaveAttribute("data-active", "true");
  });
});
