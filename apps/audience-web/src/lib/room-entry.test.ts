import { beforeEach, describe, expect, it, vi } from "vitest";
import type { LayerTalkClient, PublicRoom } from "@layertalk/shared";

const mocks = vi.hoisted(() => ({
  findRoomByCode: vi.fn(),
  resumeAudienceRoom: vi.fn(),
  joinRoom: vi.fn(),
}));

vi.mock("@layertalk/shared", async () => ({
  ...await vi.importActual<typeof import("@layertalk/shared")>("@layertalk/shared"),
  findRoomByCode: mocks.findRoomByCode,
  resumeAudienceRoom: mocks.resumeAudienceRoom,
  joinRoom: mocks.joinRoom,
}));

import { resolveInitialRoomEntry } from "./room-entry";

const room: PublicRoom = {
  id: "11111111-1111-1111-1111-111111111111",
  code: "ABC234",
  title: "Demo",
  language: "ja",
  requires_passcode: true,
};

function clientWithSession(hasSession: boolean) {
  return {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: hasSession ? { user: { id: "user" } } : null } }),
      signInAnonymously: vi.fn().mockResolvedValue({ error: null }),
    },
  } as unknown as LayerTalkClient;
}

describe("resolveInitialRoomEntry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.findRoomByCode.mockResolvedValue(room);
    mocks.resumeAudienceRoom.mockResolvedValue(null);
    mocks.joinRoom.mockResolvedValue({ ...room, requires_passcode: false });
  });

  it("resumes an existing 12-hour access before showing the passcode gate", async () => {
    const client = clientWithSession(true);
    mocks.resumeAudienceRoom.mockResolvedValue({ ...room, requires_passcode: false });

    await expect(resolveInitialRoomEntry(client, room.code, true)).resolves.toMatchObject({ kind: "ready" });
    expect(mocks.resumeAudienceRoom).toHaveBeenCalledWith(client, room);
    expect(mocks.joinRoom).not.toHaveBeenCalled();
    expect(client.auth.signInAnonymously).not.toHaveBeenCalled();
  });

  it("shows the gate when the stored session has no valid room access", async () => {
    const client = clientWithSession(true);

    await expect(resolveInitialRoomEntry(client, room.code, false)).resolves.toEqual({ kind: "gate", room });
    expect(mocks.joinRoom).not.toHaveBeenCalled();
  });

  it("creates an anonymous session and joins an unprotected room", async () => {
    const client = clientWithSession(false);
    mocks.findRoomByCode.mockResolvedValue({ ...room, requires_passcode: false });

    await expect(resolveInitialRoomEntry(client, room.code, false)).resolves.toMatchObject({ kind: "ready" });
    expect(client.auth.signInAnonymously).toHaveBeenCalledOnce();
    expect(mocks.joinRoom).toHaveBeenCalledWith(client, room.code);
  });

  it("surfaces resume failures instead of incorrectly asking for the passcode", async () => {
    const client = clientWithSession(true);
    mocks.resumeAudienceRoom.mockRejectedValue(new Error("offline"));

    await expect(resolveInitialRoomEntry(client, room.code, false)).rejects.toThrow("offline");
    expect(mocks.joinRoom).not.toHaveBeenCalled();
  });
});
