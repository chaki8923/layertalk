import "@testing-library/jest-dom/vitest";

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PublicShell } from "./public-shell";

describe("PublicShell", () => {
  it("links the brand home and exposes every legal destination", () => {
    render(<PublicShell locale="ja"><main>Content</main></PublicShell>);
    expect(screen.getByRole("link", { name: "LayerTalk home" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("link", { name: "利用規約" })).toHaveAttribute("href", "/legal/terms");
    expect(screen.getByRole("link", { name: "プライバシー" })).toHaveAttribute("href", "/legal/privacy");
    expect(screen.getByRole("link", { name: "特定商取引法に基づく表記" })).toHaveAttribute("href", "/legal/tokusho");
    expect(screen.getByRole("link", { name: "お問い合わせ" })).toHaveAttribute("href", "/support");
  });

  it("localizes the public navigation in English", () => {
    render(<PublicShell locale="en"><main>Content</main></PublicShell>);
    expect(screen.getByRole("navigation", { name: "Public pages" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Join" })).toHaveAttribute("href", "/#join");
    expect(screen.getByRole("link", { name: "Terms" })).toHaveAttribute("href", "/legal/terms");
  });
});
