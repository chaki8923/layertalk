import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PresentationSession } from "@layertalk/shared";

const mocks = vi.hoisted(() => ({ questionCaptureCount: vi.fn() }));

vi.mock("../lib/tauri", () => ({
  getScreenCapturePermission: vi.fn(),
  openScreenCaptureSettings: vi.fn(),
  questionCaptureCount: mocks.questionCaptureCount,
  readQuestionCapture: vi.fn(),
}));
vi.mock("../lib/supabase", () => ({ supabase: {} }));

import { ReportList } from "./EventPassPanel";

const session = {
  id: "11111111-1111-1111-1111-111111111111",
  room_id: "22222222-2222-2222-2222-222222222222",
  owner_id: "33333333-3333-3333-3333-333333333333",
  entitlement_id: null,
  entitlement_snapshot: { paid: true },
  started_at: "2026-08-24T01:00:00.000Z",
  ended_at: "2026-08-24T01:10:00.000Z",
  created_at: "2026-08-24T01:00:00.000Z",
} satisfies PresentationSession;

describe("ReportList", () => {
  beforeEach(() => mocks.questionCaptureCount.mockReset());

  it("shows a reason instead of HTML export when no slide images exist", async () => {
    mocks.questionCaptureCount.mockResolvedValue(0);
    render(<ReportList sessions={[session]} locale="ja" roomTitle="Demo" roomCode="ABC123" />);

    await screen.findByText("スライド画像がないため出力できません");
    expect(screen.queryByRole("button", { name: "HTML" })).not.toBeInTheDocument();
  });

  it("offers HTML export when at least one slide image exists", async () => {
    mocks.questionCaptureCount.mockResolvedValue(1);
    render(<ReportList sessions={[session]} locale="ja" roomTitle="Demo" roomCode="ABC123" />);

    await waitFor(() => expect(screen.getByRole("button", { name: "HTML" })).toBeEnabled());
  });
});
