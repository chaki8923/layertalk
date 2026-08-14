"use client";

import type { SortMode } from "@layertalk/shared";
import { motionPresets } from "@layertalk/shared";
import { motion } from "motion/react";

import { useMessages } from "@/i18n/locale-context";

// ラベルはここに置けない（モジュールスコープではフックを呼べない）。
// 値だけ持ち、文言はコンポーネントの中で引く。
const OPTIONS = ["popular", "latest"] as const satisfies readonly SortMode[];

type Props = {
  value: SortMode;
  onChange: (value: SortMode) => void;
};

/** iOS のセグメンテッドコントロール風。指示子は layoutId で滑らせる。 */
export function SortTabs({ value, onChange }: Props) {
  const t = useMessages();

  return (
    <div
      role="tablist"
      aria-label={t.sort.label}
      className="border-border bg-surface relative grid grid-cols-2 gap-1 rounded-full border p-1"
    >
      {OPTIONS.map((option) => {
        const active = option === value;

        return (
          <motion.button
            key={option}
            role="tab"
            aria-selected={active}
            type="button"
            onClick={() => onChange(option)}
            whileTap={{ scale: 0.96 }}
            transition={motionPresets.press}
            className="lt-tap relative rounded-full px-4 py-1.5 text-[13px] font-semibold"
          >
            {active && (
              <motion.span
                layoutId="sort-indicator"
                className="bg-gradient-brand absolute inset-0 rounded-full"
                transition={motionPresets.soft}
              />
            )}
            <span className={`relative ${active ? "text-white" : "text-text-muted"}`}>
              {t.sort[option]}
            </span>
          </motion.button>
        );
      })}
    </div>
  );
}
