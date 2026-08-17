import "@testing-library/jest-dom/vitest";

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { EventPassPurchaseSheet } from "./EventPassPurchaseSheet";

const startCheckout = vi.fn();
const openAudiencePage = vi.fn();

vi.mock("../lib/billing", () => ({
  startEventPassCheckout: (...args: unknown[]) => startCheckout(...args),
  openAudiencePage: (...args: unknown[]) => openAudiencePage(...args),
}));

describe("EventPassPurchaseSheet", () => {
  beforeEach(() => {
    startCheckout.mockReset();
    openAudiencePage.mockReset();
  });

  it("shows the room, duration, amount, and legal links before checkout", () => {
    render(<EventPassPurchaseSheet open roomId="room-1" roomTitle="本番ルーム" roomCode="ABC123" locale="ja" onClose={() => undefined} />);
    expect(screen.getByText("本番ルーム（ABC123）")).toBeInTheDocument();
    expect(screen.getByText("購入完了から7日間")).toBeInTheDocument();
    expect(screen.getByText("¥2,980")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "返金・キャンセル" })).toBeInTheDocument();
  });

  it("reuses one attempt id when checkout opening is retried", async () => {
    startCheckout.mockRejectedValue(new Error("cannot open"));
    render(<EventPassPurchaseSheet open roomId="room-1" roomTitle="本番ルーム" roomCode="ABC123" locale="ja" onClose={() => undefined} />);
    const purchase = screen.getByRole("button", { name: "Stripeで2,980円を支払う" });
    fireEvent.click(purchase);
    await waitFor(() => expect(startCheckout).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(purchase).not.toBeDisabled());
    fireEvent.click(purchase);
    await waitFor(() => expect(startCheckout).toHaveBeenCalledTimes(2));
    expect(startCheckout.mock.calls[0][1]).toBe(startCheckout.mock.calls[1][1]);
  });

  // 全部を「接続を確認してください」に潰していたせいで、CORS で弾かれているのか
  // ルームが消えているのかを壇上で切り分けられなかった。状態ごとの出し分けを固定する。
  it.each([
    [404, "このルームが見つかりません。ルームを作り直してから購入してください。"],
    [401, "サインインの有効期限が切れました。サインインし直してください。"],
    [409, "このルームのEvent Passはすでに有効です。"],
    [503, "Event Passの販売は現在準備中です。"],
    [500, "購入画面を準備できませんでした。時間をおいてもう一度お試しください。"],
  ])("explains a %i instead of blaming the connection", async (status, expected) => {
    startCheckout.mockRejectedValue(Object.assign(new Error("Checkout failed"), { status }));
    render(<EventPassPurchaseSheet open roomId="room-1" roomTitle="本番ルーム" roomCode="ABC123" locale="ja" onClose={() => undefined} />);
    fireEvent.click(screen.getByRole("button", { name: "Stripeで2,980円を支払う" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(expected);
  });

  // status が付かない＝リクエストが飛んでいない。ここだけは接続を疑わせてよい。
  it("blames the connection when the request never left the app", async () => {
    startCheckout.mockRejectedValue(new TypeError("Load failed"));
    render(<EventPassPurchaseSheet open roomId="room-1" roomTitle="本番ルーム" roomCode="ABC123" locale="ja" onClose={() => undefined} />);
    fireEvent.click(screen.getByRole("button", { name: "Stripeで2,980円を支払う" }));
    expect(await screen.findByRole("alert"))
      .toHaveTextContent("購入画面を開けませんでした。接続を確認してもう一度お試しください。");
  });

  it("prevents a second checkout while the first request is pending", async () => {
    startCheckout.mockImplementation(() => new Promise(() => undefined));
    render(<EventPassPurchaseSheet open roomId="room-1" roomTitle="本番ルーム" roomCode="ABC123" locale="ja" onClose={() => undefined} />);
    const purchase = screen.getByRole("button", { name: "Stripeで2,980円を支払う" });
    fireEvent.click(purchase);
    fireEvent.click(purchase);
    expect(startCheckout).toHaveBeenCalledTimes(1);
    expect(purchase).toBeDisabled();
  });
});
