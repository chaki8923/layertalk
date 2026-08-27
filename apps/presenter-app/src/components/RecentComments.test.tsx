import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import { LayerTalkError, type Comment } from "@layertalk/shared";

import { RecentComments } from "./RecentComments";

const comment = (
  id: string,
  status: Comment["status"],
  patch: Partial<Comment> = {},
): Comment => ({
  id,
  room_id: "room-1",
  content: `comment-${id}`,
  is_question: false,
  likes_count: 0,
  created_at: `2026-08-27T00:00:0${id}.000Z`,
  status,
  status_before_hidden: null,
  question_status: null,
  presentation_session_id: null,
  moderated_by: null,
  moderated_at: null,
  ...patch,
});

type ModerationAction = "hide" | "restore" | "mark_answered" | "mark_open";

function Harness({
  initial,
  moderate,
}: {
  initial: Comment[];
  moderate: (commentId: string, action: ModerationAction) => Promise<Comment>;
}) {
  const [comments, setComments] = useState(initial);
  return (
    <RecentComments
      comments={comments}
      locale="ja"
      moderate={moderate}
      onModerated={(saved) => setComments((current) =>
        current.map((item) => item.id === saved.id ? saved : item))}
    />
  );
}

describe("RecentComments", () => {
  it("shows approved, pending, and hidden comments in newest-first order", () => {
    render(
      <RecentComments
        comments={[comment("1", "approved"), comment("3", "hidden"), comment("2", "pending")]}
        locale="ja"
        moderate={vi.fn()}
        onModerated={vi.fn()}
      />,
    );

    expect(screen.getAllByText(/^comment-/).map((node) => node.textContent)).toEqual([
      "comment-3",
      "comment-2",
      "comment-1",
    ]);
    expect(screen.getByText("表示中")).toBeInTheDocument();
    expect(screen.getByText("承認待ち")).toBeInTheDocument();
    expect(screen.getByText("非表示")).toBeInTheDocument();
  });

  it("limits the history to the eight newest comments", () => {
    const comments = Array.from({ length: 9 }, (_, index) => comment(String(index + 1), "approved", {
      created_at: `2026-08-27T00:00:${String(index + 1).padStart(2, "0")}.000Z`,
    }));
    render(
      <RecentComments
        comments={comments}
        locale="ja"
        moderate={vi.fn()}
        onModerated={vi.fn()}
      />,
    );

    expect(screen.queryByText("comment-1")).not.toBeInTheDocument();
    expect(screen.getAllByText(/^comment-/)).toHaveLength(8);
  });

  it("applies the returned question state immediately", async () => {
    const open = comment("1", "approved", { is_question: true, question_status: "open" });
    const moderate = vi.fn(async (_id: string, action: ModerationAction) => ({
      ...open,
      question_status: action === "mark_answered" ? "answered" as const : "open" as const,
    }));
    render(<Harness initial={[open]} moderate={moderate} />);

    fireEvent.click(screen.getByRole("button", { name: "未回答" }));

    await screen.findByRole("button", { name: "回答済" });
    expect(moderate).toHaveBeenCalledWith("1", "mark_answered");
  });

  it("keeps hidden rows available and restores them", async () => {
    const visible = comment("1", "approved");
    const moderate = vi.fn(async (_id: string, action: ModerationAction) => ({
      ...visible,
      status: action === "hide" ? "hidden" as const : "approved" as const,
      status_before_hidden: "approved" as const,
    }));
    render(<Harness initial={[visible]} moderate={moderate} />);

    fireEvent.click(screen.getByRole("button", { name: "非表示にする" }));
    await screen.findByRole("button", { name: "表示する" });
    expect(screen.getByText("非表示")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "表示する" }));
    await screen.findByRole("button", { name: "非表示にする" });
    expect(screen.getByText("表示中")).toBeInTheDocument();
    expect(moderate.mock.calls).toEqual([["1", "hide"], ["1", "restore"]]);
  });

  it("restores a hidden pending row to pending without approving it", async () => {
    const pending = comment("1", "pending");
    const moderate = vi.fn(async (_id: string, action: ModerationAction) => ({
      ...pending,
      status: action === "hide" ? "hidden" as const : "pending" as const,
      status_before_hidden: "pending" as const,
    }));
    render(<Harness initial={[pending]} moderate={moderate} />);

    fireEvent.click(screen.getByRole("button", { name: "非表示にする" }));
    await screen.findByText("非表示");

    fireEvent.click(screen.getByRole("button", { name: "表示する" }));
    await screen.findByText("承認待ち");
    expect(screen.queryByText("表示中")).not.toBeInTheDocument();
    expect(moderate.mock.calls).toEqual([["1", "hide"], ["1", "restore"]]);
  });

  it("reports moderation failures without changing the row", async () => {
    const visible = comment("1", "approved");
    const moderate = vi.fn(async () => {
      throw new LayerTalkError("moderation_failed");
    });
    render(<Harness initial={[visible]} moderate={moderate} />);

    fireEvent.click(screen.getByRole("button", { name: "非表示にする" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("運営設定を更新できませんでした"));
    expect(screen.getByText("表示中")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "表示する" })).not.toBeInTheDocument();
  });
});
