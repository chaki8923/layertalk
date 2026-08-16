import "@testing-library/jest-dom/vitest";

import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { SuccessStatus } from "./success-status";

const refresh = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

describe("SuccessStatus", () => {
  beforeEach(() => { vi.useFakeTimers(); refresh.mockReset(); });
  afterEach(() => vi.useRealTimers());

  it("shows ready without offering another purchase", () => {
    render(<SuccessStatus status="ready" />);
    expect(screen.getByRole("heading", { name: "Event Passを有効にしました" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /再確認/ })).not.toBeInTheDocument();
  });

  it("checks processing payments six times, then shows the delayed state", async () => {
    render(<SuccessStatus status="processing" />);
    for (let index = 0; index < 6; index += 1) {
      await act(async () => { await vi.advanceTimersByTimeAsync(10_000); });
    }
    expect(refresh).toHaveBeenCalledTimes(6);
    expect(screen.getByRole("heading", { name: "確認に時間がかかっています" })).toBeInTheDocument();
  });

  it("directs invalid sessions to support", () => {
    render(<SuccessStatus status="failed" />);
    expect(screen.getByRole("heading", { name: "購入状態を確認できませんでした" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "お問い合わせ" })).toHaveAttribute("href", "/support");
  });
});
