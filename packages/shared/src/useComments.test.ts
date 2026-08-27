import { describe, expect, it } from "vitest";

import type { Comment } from "./types";
import { registerApprovedComment } from "./useComments";

const comment = (
  status: Comment["status"],
  statusBeforeHidden: Comment["status_before_hidden"] = null,
): Comment => ({
  id: "comment-1",
  room_id: "room-1",
  content: "comment",
  is_question: false,
  likes_count: 0,
  created_at: "2026-08-27T00:00:00.000Z",
  status,
  status_before_hidden: statusBeforeHidden,
  question_status: null,
  presentation_session_id: null,
  moderated_by: null,
  moderated_at: null,
});

describe("registerApprovedComment", () => {
  it("does not announce pending hide and restore transitions", () => {
    const approvedIds = new Set<string>();

    expect(registerApprovedComment(comment("pending"), approvedIds)).toBe(false);
    expect(registerApprovedComment(comment("hidden", "pending"), approvedIds)).toBe(false);
    expect(registerApprovedComment(comment("pending", "pending"), approvedIds)).toBe(false);
    expect(approvedIds.size).toBe(0);
  });

  it("does not replay an approved comment after hide and restore", () => {
    const approvedIds = new Set<string>();

    expect(registerApprovedComment(comment("approved"), approvedIds)).toBe(true);
    expect(registerApprovedComment(comment("hidden", "approved"), approvedIds)).toBe(false);
    expect(registerApprovedComment(comment("approved", "approved"), approvedIds)).toBe(false);
  });

  it("announces an explicit approval after a pending restore exactly once", () => {
    const approvedIds = new Set<string>();

    expect(registerApprovedComment(comment("pending", "pending"), approvedIds)).toBe(false);
    expect(registerApprovedComment(comment("approved"), approvedIds)).toBe(true);
    expect(registerApprovedComment(comment("approved"), approvedIds)).toBe(false);
  });

  it("suppresses an approved restore first seen during reconnect", () => {
    const approvedIds = new Set<string>();

    expect(registerApprovedComment(comment("approved", "approved"), approvedIds)).toBe(false);
    expect(approvedIds).toContain("comment-1");
  });

  it("announces a newly received approved comment", () => {
    expect(registerApprovedComment(comment("approved"), new Set())).toBe(true);
  });
});
