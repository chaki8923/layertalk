import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";

import type { DisplayPreset } from "@layertalk/shared";

import { DisplayPresetPicker } from "./DisplayPresetPicker";

const preset = (id: string, name: string): DisplayPreset => ({
  id,
  owner_id: "owner-1",
  name,
  display_mode: "flow",
  show_join_qr: false,
  allow_custom_stamps: true,
  hide_layertalk_branding: false,
  brand_color: "#6B8AFF",
  logo_path: null,
  created_at: "2026-08-24T00:00:00Z",
  updated_at: "2026-08-24T00:00:00Z",
});

const presets = [preset("preset-1", "社内向け"), preset("preset-2", "公開イベント")];

function Picker({ onDelete = async () => undefined }: { onDelete?: (value: DisplayPreset) => Promise<void> }) {
  const [selected, setSelected] = useState<string | null>(null);
  return (
    <DisplayPresetPicker
      presets={presets}
      selectedPresetId={selected}
      locale="ja"
      onSelect={(value) => setSelected(value.id)}
      onClear={() => setSelected(null)}
      onDelete={onDelete}
    />
  );
}

describe("DisplayPresetPicker", () => {
  it("clears the selection when the selected preset is pressed again", () => {
    render(<Picker />);
    const button = screen.getByRole("button", { name: "社内向け" });
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(button);
    expect(button).toHaveAttribute("aria-pressed", "false");
  });

  it("requires confirmation and lets the user cancel deletion", () => {
    const onDelete = vi.fn(async () => undefined);
    render(<Picker onDelete={onDelete} />);
    fireEvent.click(screen.getByRole("button", { name: "「社内向け」を削除" }));
    expect(screen.getByRole("alertdialog", { name: "プリセットを削除" })).toHaveTextContent("「社内向け」を削除しますか？");
    fireEvent.click(screen.getByRole("button", { name: "キャンセル" }));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
    expect(onDelete).not.toHaveBeenCalled();
  });

  it("deletes only after confirmation", async () => {
    const onDelete = vi.fn(async () => undefined);
    render(<Picker onDelete={onDelete} />);
    fireEvent.click(screen.getByRole("button", { name: "「公開イベント」を削除" }));
    fireEvent.click(screen.getByRole("button", { name: "削除" }));
    await waitFor(() => expect(onDelete).toHaveBeenCalledWith(presets[1]));
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });

  it("keeps the confirmation open when deletion fails", async () => {
    const onDelete = vi.fn(async () => { throw new Error("failed"); });
    render(<Picker onDelete={onDelete} />);
    fireEvent.click(screen.getByRole("button", { name: "「社内向け」を削除" }));
    fireEvent.click(screen.getByRole("button", { name: "削除" }));
    await waitFor(() => expect(onDelete).toHaveBeenCalledOnce());
    expect(screen.getByRole("alertdialog", { name: "プリセットを削除" })).toBeInTheDocument();
  });
});
