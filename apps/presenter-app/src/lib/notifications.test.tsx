import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "@tauri-apps/api/core";
import { notificationMessage, useNotifications } from "./notifications";
vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
const mockInvoke = vi.mocked(invoke);
const account = "11111111-1111-1111-1111-111111111111";
const room = "22222222-2222-2222-2222-222222222222";
const url = "https://www.layer-talk.com/r/ABC123";
const destination = { provider: "slack", name: "Sales", enabled: true };
beforeEach(() => {
  mockInvoke.mockReset();
  mockInvoke.mockImplementation(async command => {
    if (command === "notification_list") return [destination];
    if (command === "notification_prepare") return 1;
    if (command === "notification_dispatch") return [{ ...destination, status: "sent" }];
    return undefined;
  });
});
describe("room notifications", () => {
  it("never sends on mount, rerender or room change", async () => {
    const { result, rerender } = renderHook(({ id }) => useNotifications(account, id, "ja", url), { initialProps: { id: room } });
    await waitFor(() => expect(result.current.loaded).toBe(true));
    rerender({ id: account });
    await waitFor(() => expect(result.current.loaded).toBe(true));
    expect(mockInvoke.mock.calls.every(([command]) => command === "notification_list")).toBe(true);
  });
  it("cancels a failed presentation without posting", async () => {
    const { result } = renderHook(() => useNotifications(account, room, "ja", url));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    await act(async () => { await result.current.prepare().cancel(); });
    expect(mockInvoke.mock.calls.some(([c]) => c === "notification_cancel")).toBe(true);
    expect(mockInvoke.mock.calls.some(([c]) => c === "notification_dispatch")).toBe(false);
  });
  it("sends only after start succeeds and creates a new request on restart", async () => {
    const { result } = renderHook(() => useNotifications(account, room, "ja", url));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    const first = result.current.prepare();
    expect(mockInvoke.mock.calls.some(([c]) => c === "notification_dispatch")).toBe(false);
    await act(async () => { await first.send(); });
    await act(async () => { await result.current.prepare().send(); });
    const ids = mockInvoke.mock.calls.filter(([c]) => c === "notification_dispatch").map(([, args]) => (args as { requestId: string }).requestId);
    expect(ids).toHaveLength(2); expect(ids[0]).not.toBe(ids[1]);
  });
  it("does not send a prepared invitation after account change", async () => {
    const { result, rerender } = renderHook(({ id }) => useNotifications(id, room, "ja", url), { initialProps: { id: account as string | null } });
    await waitFor(() => expect(result.current.loaded).toBe(true));
    const prepared = result.current.prepare();
    rerender({ id: null });
    await act(async () => { await prepared.send(); });
    expect(mockInvoke.mock.calls.some(([c]) => c === "notification_dispatch")).toBe(false);
  });
  it("keeps old settings after Keychain save failure and hides raw errors", async () => {
    const { result } = renderHook(() => useNotifications(account, room, "ja", url));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    mockInvoke.mockRejectedValueOnce("https://hooks.slack.com/services/SECRET");
    await act(async () => { expect(await result.current.save("slack", "New", "secret", false)).toBe(false); });
    expect(result.current.items[0].name).toBe("Sales");
    expect(result.current.error).not.toContain("SECRET");
  });
  it("does not dispatch when no destination is enabled", async () => {
    const { result } = renderHook(() => useNotifications(account, room, "ja", url));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    mockInvoke.mockResolvedValueOnce(0);
    await act(async () => { await result.current.prepare().send(); });
    expect(mockInvoke.mock.calls.some(([c]) => c === "notification_dispatch")).toBe(false);
  });
  it("shows partial failures without throwing or retrying automatically", async () => {
    const { result } = renderHook(() => useNotifications(account, room, "en", url));
    await waitFor(() => expect(result.current.loaded).toBe(true));
    mockInvoke.mockImplementation(async command => command === "notification_prepare" ? 2 : [
      { ...destination, status: "sent" }, { provider: "teams", name: "Team", status: "unknown" },
    ]);
    await act(async () => { await result.current.prepare().send(); });
    expect(result.current.results.map(r => r.status)).toEqual(["sent", "unknown"]);
    expect(result.current.working).toBe(false);
    expect(mockInvoke.mock.calls.filter(([c]) => c === "notification_dispatch")).toHaveLength(1);
    expect(notificationMessage("unknown", "en")).toContain("duplicate");
    expect(notificationMessage("accepted", "en")).toContain("Check the channel");
  });
});
