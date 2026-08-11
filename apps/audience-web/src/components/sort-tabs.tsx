"use client";

import type { SortMode } from "@layertalk/shared";
import { motionPresets } from "@layertalk/shared";
import { motion } from "motion/react";

const OPTIONS: { value: SortMode; label: string }[] = [
  { value: "popular", label: "人気順" },
  { value: "latest", label: "最新順" },
];

type Props = {
  value: SortMode;
  onChange: (value: SortMode) => void;
};

/** iOS のセグメンテッドコントロール風。指示子は layoutId で滑らせる。 */
export function SortTabs({ value, onChange }: Props) {
  return (
    <div
      role="tablist"
      aria-label="コメントの並び順"
      className="border-border bg-surface relative grid grid-cols-2 gap-1 rounded-full border p-1"
    >
      {OPTIONS.map((option) => {
        const active = option.value === value;

        return (
          <motion.button
            key={option.value}
            role="tab"
            aria-selected={active}
            type="button"
            onClick={() => onChange(option.value)}
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
              {option.label}
            </span>
          </motion.button>
        );
      })}
    </div>
  );
}
