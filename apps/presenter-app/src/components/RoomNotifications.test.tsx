import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Notifications } from "../lib/notifications";
import { RoomNotifications } from "./RoomNotifications";
vi.mock("../lib/tauri", () => ({ openExternalUrl: vi.fn() }));
function fixture(): Notifications {
  return { items: [], loaded: true, working: false, error: null, results: [], save: vi.fn().mockResolvedValue(true), remove: vi.fn(), prepare: vi.fn(), manual: vi.fn(), reload: vi.fn() };
}
describe("notification settings", () => {
  it("defaults to off, masks the secret and saves only after explicit action", async () => {
    const n = fixture();
    const view = render(<RoomNotifications notifications={n} locale="ja" audienceUrl="https://www.layer-talk.com/r/ABC123" disabled={false} />);
    const names = screen.getAllByLabelText("送信先の表示名");
    const urls = screen.getAllByLabelText("Webhook URL");
    const switches = screen.getAllByRole("checkbox", { hidden: true });
    expect(switches.every(input => !(input as HTMLInputElement).checked)).toBe(true);
    expect(urls[0]).toHaveAttribute("type", "password");
    fireEvent.click(view.container.querySelector("summary")!);
    fireEvent.change(names[0], { target: { value: "Sales" } });
    fireEvent.change(urls[0], { target: { value: "https://hooks.slack.com/services/T/B/secret" } });
    expect(n.save).not.toHaveBeenCalled();
    fireEvent.click(screen.getAllByText("保存")[0]);
    await waitFor(() => expect(n.save).toHaveBeenCalledWith("slack", "Sales", "https://hooks.slack.com/services/T/B/secret", false));
    await waitFor(() => expect(urls[0]).toHaveValue(""));
    expect(n.manual).not.toHaveBeenCalled();
  });
  it("keeps invitations opt-in and disables editing during a presentation", () => {
    const n = fixture(); n.items = [{ provider: "teams", name: "Review channel", enabled: true }];
    const view = render(<RoomNotifications notifications={n} locale="en" audienceUrl="https://www.layer-talk.com/r/ABC123" disabled />);
    fireEvent.click(view.container.querySelector("summary")!);
    expect(screen.getByText("Send test")).toBeDisabled();
    expect(screen.getByText("Delete")).toBeDisabled();
    expect(screen.getByText(/Stop the presentation/)).toBeInTheDocument();
  });
});
