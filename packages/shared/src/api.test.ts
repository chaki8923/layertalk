import { describe, expect, it, vi } from "vitest";

import {
  fetchPresentationReport,
  fetchRoomStampUrl,
  joinRoom,
  resolveRoomStampImageUrl,
  resumeAudienceRoom,
  roomStampUrl,
} from "./api";
import type { LayerTalkClient } from "./client";
import type { Comment, PresentationSession, PublicRoom } from "./types";

const room: PublicRoom = {
  id: "11111111-1111-1111-1111-111111111111",
  code: "ABC234",
  title: "Demo",
  language: "ja",
  requires_passcode: true,
};

function accessClient(result: { data: { expires_at: string } | null; error: { message: string } | null }) {
  const builder = {
    select: vi.fn(),
    eq: vi.fn(),
    gt: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue(result),
  };
  builder.select.mockReturnValue(builder);
  builder.eq.mockReturnValue(builder);
  builder.gt.mockReturnValue(builder);
  const client = { from: vi.fn().mockReturnValue(builder) } as unknown as LayerTalkClient;
  return { client, builder };
}

describe("resumeAudienceRoom", () => {
  it("uses the current user's unexpired RLS-protected access without renewing it", async () => {
    const { client, builder } = accessClient({
      data: { expires_at: "2026-08-24T20:00:00.000Z" },
      error: null,
    });

    await expect(resumeAudienceRoom(client, room)).resolves.toEqual({
      ...room,
      requires_passcode: false,
    });
    expect(client.from).toHaveBeenCalledWith("audience_room_access");
    expect(builder.eq).toHaveBeenCalledWith("room_id", room.id);
    expect(builder.gt).toHaveBeenCalledWith("expires_at", expect.any(String));
  });

  it("returns null when the access is missing or expired", async () => {
    const { client } = accessClient({ data: null, error: null });
    await expect(resumeAudienceRoom(client, room)).resolves.toBeNull();
  });
});

describe("joinRoom", () => {
  const rpcFailing = (error: { code: string; message: string }) =>
    ({ rpc: vi.fn().mockResolvedValue({ data: null, error }) }) as unknown as LayerTalkClient;

  it("tells a wrong passcode apart from other join failures", async () => {
    await expect(joinRoom(rpcFailing({ code: "28P01", message: "invalid room passcode" }), "abc234", "secret"))
      .rejects.toMatchObject({ code: "room_passcode_invalid" });
    // ブロックはパスコード違いとして見せない（正しい値を打ち直させない）が、ブロックとも言わない。
    await expect(joinRoom(rpcFailing({ code: "42501", message: "room participant blocked" }), "abc234", "secret"))
      .rejects.toMatchObject({ code: "room_join_failed" });
  });
});

describe("fetchPresentationReport", () => {
  it("counts approved questions only, the same ones the HTML report lists", async () => {
    const session: PresentationSession = {
      id: "44444444-4444-4444-4444-444444444444",
      room_id: room.id,
      owner_id: "33333333-3333-3333-3333-333333333333",
      entitlement_id: null,
      entitlement_snapshot: { paid: true },
      started_at: "2026-09-13T01:00:00.000Z",
      ended_at: "2026-09-13T01:30:00.000Z",
      created_at: "2026-09-13T01:00:00.000Z",
    };
    const row = (id: string, isQuestion: boolean, status: Comment["status"]): Comment => ({
      id,
      room_id: room.id,
      content: id,
      is_question: isQuestion,
      likes_count: 0,
      status,
      status_before_hidden: status === "hidden" ? "pending" : null,
      question_status: isQuestion ? "open" : null,
      presentation_session_id: session.id,
      moderated_by: null,
      moderated_at: null,
      created_at: "2026-09-13T01:05:00.000Z",
    });
    const table = (data: unknown[]) => {
      const builder = { select: vi.fn(), eq: vi.fn(), order: vi.fn().mockResolvedValue({ data, error: null }) };
      builder.select.mockReturnValue(builder);
      builder.eq.mockReturnValue(builder);
      return builder;
    };
    const tables: Record<string, ReturnType<typeof table>> = {
      comments: table([row("approved", true, "approved"), row("pending", true, "pending"), row("hidden", true, "hidden"), row("comment", false, "approved")]),
      stamp_events: table([]),
    };
    const client = { from: vi.fn((name: string) => tables[name]) } as unknown as LayerTalkClient;

    const report = await fetchPresentationReport(client, session);
    expect(report.totals).toMatchObject({ comments: 4, questions: 1, openQuestions: 1 });
  });
});

describe("room stamp signed URL cache", () => {
  it("refreshes an expired signed URL instead of returning a dead image URL", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-25T00:00:00.000Z"));

    const createSignedUrl = vi
      .fn()
      .mockResolvedValueOnce({ data: { signedUrl: "https://example.test/first" }, error: null })
      .mockResolvedValueOnce({ data: { signedUrl: "https://example.test/second" }, error: null });
    const bucket = { createSignedUrl };
    const client = {
      storage: { from: vi.fn().mockReturnValue(bucket) },
    } as unknown as LayerTalkClient;
    const path = "room/cache-expiry-test.png";

    await expect(fetchRoomStampUrl(client, path)).resolves.toBe("https://example.test/first");
    expect(roomStampUrl(client, path)).toBe("https://example.test/first");

    vi.advanceTimersByTime(59 * 60 * 1000);
    expect(roomStampUrl(client, path)).toBe("");
    await expect(fetchRoomStampUrl(client, path)).resolves.toBe("https://example.test/second");
    expect(createSignedUrl).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });

  it("recovers a custom stamp when its broadcast arrives before the local list", async () => {
    const stamp = {
      id: "22222222-2222-2222-2222-222222222222",
      room_id: room.id,
      path: `${room.id}/broadcast-race-test.png`,
      client_id: "audience-device",
      owner_user_id: "33333333-3333-3333-3333-333333333333",
      created_at: "2026-08-25T00:00:00.000Z",
    };
    const query = {
      select: vi.fn(),
      eq: vi.fn(),
      order: vi.fn().mockResolvedValue({ data: [stamp], error: null }),
    };
    query.select.mockReturnValue(query);
    query.eq.mockReturnValue(query);
    const createSignedUrl = vi.fn().mockResolvedValue({
      data: { signedUrl: "https://example.test/recovered" },
      error: null,
    });
    const client = {
      from: vi.fn().mockReturnValue(query),
      storage: {
        from: vi.fn().mockReturnValue({ createSignedUrl }),
      },
    } as unknown as LayerTalkClient;

    await expect(resolveRoomStampImageUrl(client, room.id, stamp.id)).resolves.toBe(
      "https://example.test/recovered",
    );
    expect(client.from).toHaveBeenCalledWith("room_stamps");
    expect(createSignedUrl).toHaveBeenCalledWith(stamp.path, 3600);
  });
});
