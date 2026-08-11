"use client";

import { COMMENT_MAX_LENGTH, motionPresets } from "@layertalk/shared";
import { motion } from "motion/react";
import { ArrowUp } from "lucide-react";
import { useState } from "react";

type Props = {
  onSubmit: (text: string) => void;
  disabled?: boolean;
};

export function Composer({ onSubmit, disabled }: Props) {
  const [draft, setDraft] = useState("");

  const trimmed = draft.trim();
  const remaining = COMMENT_MAX_LENGTH - draft.length;
  const canSend = trimmed.length > 0 && remaining >= 0 && !disabled;

  const submit = () => {
    if (!canSend) return;
    onSubmit(trimmed);
    setDraft("");
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      className="lt-glass rounded-sheet shadow-float flex items-end gap-2 p-2"
    >
      <div className="relative min-w-0 flex-1">
        <textarea
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            // スマホの改行キーは送信にしない。PC からの利用だけ ⌘/Ctrl+Enter を効かせる。
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              submit();
            }
          }}
          rows={1}
          placeholder="コメントを入力"
          disabled={disabled}
          className="placeholder:text-text-faint max-h-28 min-h-[42px] w-full resize-none bg-transparent px-3 py-2.5 text-[15px] leading-[1.45] outline-none disabled:opacity-50"
        />
        {/* 残り20文字を切ってから出す。常時表示は圧迫感がある。 */}
        {remaining <= 20 && (
          <span
            className={`lt-num absolute right-3 -bottom-0.5 text-[11px] font-semibold ${
              remaining < 0 ? "text-like" : "text-text-faint"
            }`}
          >
            {remaining}
          </span>
        )}
      </div>

      <motion.button
        type="submit"
        aria-label="コメントを送信"
        disabled={!canSend}
        whileTap={canSend ? { scale: 0.88 } : undefined}
        animate={{ opacity: canSend ? 1 : 0.35, scale: canSend ? 1 : 0.94 }}
        transition={motionPresets.press}
        className="lt-tap bg-gradient-brand shadow-glow flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full text-white"
      >
        <ArrowUp size={20} strokeWidth={2.5} />
      </motion.button>
    </form>
  );
}
