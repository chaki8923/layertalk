import "@testing-library/jest-dom/vitest";

import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { JoinForm } from "./join-form";

const push = vi.fn();

vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

describe("JoinForm", () => {
  beforeEach(() => push.mockReset());

  it("normalizes a valid room code and opens the room", () => {
    render(<JoinForm locale="ja" />);
    fireEvent.change(screen.getByRole("textbox", { name: "参加コード" }), { target: { value: "abc234" } });
    fireEvent.click(screen.getByRole("button", { name: "参加する" }));
    expect(push).toHaveBeenCalledWith("/r/ABC234");
  });

  it("shows a localized error for an invalid submitted code", () => {
    render(<JoinForm locale="en" />);
    const input = screen.getByRole("textbox", { name: "Join code" });
    fireEvent.change(input, { target: { value: "ABC" } });
    fireEvent.submit(input.closest("form")!);
    expect(screen.getByRole("alert")).toHaveTextContent("Join codes are 6 characters");
    expect(push).not.toHaveBeenCalled();
  });
});
