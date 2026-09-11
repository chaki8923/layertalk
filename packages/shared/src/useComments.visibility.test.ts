import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { LayerTalkClient } from "./client";
import type { Comment } from "./types";
import { useComments } from "./useComments";

const comment = (id: string): Comment => ({
  id,
  room_id: "room-1",
  content: `comment-${id}`,
  is_question: false,
  likes_count: 0,
  created_at: `2026-09-11T00:00:0${id}.000Z`,
  status: "approved",
  status_before_hidden: null,
  question_status: null,
  presentation_session_id: null,
  moderated_by: null,
  moderated_at: null,
});

/** 取得した回数を数え、購読の状態を外から進められる偽の client。 */
function fakeClient(initialRows: Comment[]) {
  let rows = initialRows;
  let onState: ((state: string) => void) | null = null;
  const fetches = { count: 0 };

  const channel = {
    on: () => channel,
    subscribe: (callback: (state: string) => void) => {
      onState = callback;
      return channel;
    },
  };
  const query = {
    select: () => query,
    eq: () => query,
    order: () => query,
    limit: () => {
      fetches.count += 1;
      return Promise.resolve({ data: rows, error: null });
    },
  };
  const client = {
    channel: () => channel,
    removeChannel: () => Promise.resolve("ok"),
    from: () => query,
  } as unknown as LayerTalkClient;

  return {
    client,
    fetches,
    setRows: (next: Comment[]) => {
      rows = next;
    },
    subscribed: () => act(() => onState?.("SUBSCRIBED")),
  };
}

let visibility: DocumentVisibilityState = "visible";
Object.defineProperty(document, "visibilityState", { configurable: true, get: () => visibility });

const change = (next: DocumentVisibilityState) =>
  act(() => {
    visibility = next;
    document.dispatchEvent(new Event("visibilitychange"));
  });

afterEach(() => {
  visibility = "visible";
});

describe("useComments on becoming visible", () => {
  it("does not refetch before the first fetch has finished", () => {
    const fake = fakeClient([comment("1")]);
    renderHook(() => useComments({ client: fake.client, roomId: "room-1" }));

    change("hidden");
    change("visible");
    expect(fake.fetches.count).toBe(0);
  });

  it("refetches when visible again and announces only comments approved while frozen", async () => {
    const onInsert = vi.fn();
    const fake = fakeClient([comment("1")]);
    const { result } = renderHook(() =>
      useComments({ client: fake.client, roomId: "room-1", onInsert }),
    );

    fake.subscribed();
    await waitFor(() => expect(result.current.comments).toHaveLength(1));
    expect(onInsert).not.toHaveBeenCalled();
    const afterSubscribe = fake.fetches.count;

    // 凍っていたあいだに 2 件目が承認された（Realtime のイベントは届いていない）。
    fake.setRows([comment("2"), comment("1")]);

    change("hidden");
    expect(fake.fetches.count).toBe(afterSubscribe);

    change("visible");
    await waitFor(() => expect(result.current.comments).toHaveLength(2));
    expect(fake.fetches.count).toBe(afterSubscribe + 1);
    expect(onInsert).toHaveBeenCalledTimes(1);
    expect(onInsert).toHaveBeenCalledWith(expect.objectContaining({ id: "2" }));
  });
});
