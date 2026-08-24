import { describe, expect, it, vi } from "vitest";

import { resumeAudienceRoom } from "./api";
import type { LayerTalkClient } from "./client";
import type { PublicRoom } from "./types";

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
