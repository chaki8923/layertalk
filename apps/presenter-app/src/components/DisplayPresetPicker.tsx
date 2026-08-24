import { Trash2 } from "lucide-react";
import { useState } from "react";

import type { DisplayPreset, Locale } from "@layertalk/shared";

type Props = {
  presets: DisplayPreset[];
  selectedPresetId: string | null;
  locale: Locale;
  onSelect: (preset: DisplayPreset) => void;
  onClear: () => void;
  onDelete: (preset: DisplayPreset) => Promise<void>;
};

/**
 * Preset selection is only an indicator of the last applied preset. Clearing
 * it intentionally leaves the applied display values untouched.
 */
export function DisplayPresetPicker({ presets, selectedPresetId, locale, onSelect, onClear, onDelete }: Props) {
  const ja = locale === "ja";
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const confirmingPreset = presets.find((preset) => preset.id === confirmingId) ?? null;

  if (presets.length === 0) return null;

  const deletePreset = async (preset: DisplayPreset) => {
    setDeletingId(preset.id);
    try {
      await onDelete(preset);
      setConfirmingId(null);
    } catch {
      // The parent owns the visible error message. Keep the confirmation open
      // so the user can retry or cancel without finding the preset again.
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <>
      <p className="text-text-faint mt-3 text-[10px]">
        {ja ? "押すと設定を適用します。選択中のものをもう一度押すと解除します" : "Tap to apply. Tap the selected preset again to clear the selection"}
      </p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {presets.map((preset) => {
          const selected = selectedPresetId === preset.id;
          return (
            <div key={preset.id} className={`flex items-center overflow-hidden rounded-full ${selected ? "bg-brand/20 text-brand" : "bg-surface-strong text-text-muted"}`}>
              <button
                type="button"
                aria-pressed={selected}
                onClick={() => selected ? onClear() : onSelect(preset)}
                className={`px-2.5 py-1 text-[10px] ${selected ? "font-bold" : ""}`}
              >
                {preset.name}
              </button>
              <button
                type="button"
                aria-label={ja ? `「${preset.name}」を削除` : `Delete “${preset.name}”`}
                onClick={() => setConfirmingId(preset.id)}
                className="border-current/15 mr-0.5 border-l p-1.5 opacity-70 hover:opacity-100"
              >
                <Trash2 size={10} />
              </button>
            </div>
          );
        })}
      </div>
      {confirmingPreset && (
        <div role="alertdialog" aria-label={ja ? "プリセットを削除" : "Delete preset"} className="border-like/25 bg-like/5 mt-2 rounded-[12px] border p-2.5">
          <p className="text-text-muted text-[10px] leading-relaxed">
            {ja ? `「${confirmingPreset.name}」を削除しますか？` : `Delete “${confirmingPreset.name}”?`}
          </p>
          <div className="mt-2 flex gap-2">
            <button type="button" disabled={deletingId !== null} onClick={() => setConfirmingId(null)} className="border-border flex-1 rounded-[10px] border px-2 py-1.5 text-[10px] font-bold disabled:opacity-40">
              {ja ? "キャンセル" : "Cancel"}
            </button>
            <button type="button" disabled={deletingId !== null} onClick={() => void deletePreset(confirmingPreset)} className="bg-like flex-1 rounded-[10px] px-2 py-1.5 text-[10px] font-bold text-white disabled:opacity-40">
              {deletingId === confirmingPreset.id ? (ja ? "削除中…" : "Deleting…") : (ja ? "削除" : "Delete")}
            </button>
          </div>
        </div>
      )}
    </>
  );
}
