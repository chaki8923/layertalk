"use client";

import { COMMENT_MAX_LENGTH, motionPresets } from "@layertalk/shared";
import { motion } from "motion/react";
import { ArrowUp, CircleHelp } from "lucide-react";
import { useState } from "react";

import { useMessages } from "@/i18n/locale-context";

type Props = {
  onSubmit: (text: string, isQuestion: boolean) => void;
  disabled?: boolean;
};

export function Composer({ onSubmit, disabled }: Props) {
  const t = useMessages();
  const [draft, setDraft] = useState("");
  const [isQuestion, setIsQuestion] = useState(false);

  const trimmed = draft.trim();
  const remaining = COMMENT_MAX_LENGTH - draft.length;
  const canSend = trimmed.length > 0 && remaining >= 0 && !disabled;

  const submit = () => {
    if (!canSend) return;
    onSubmit(trimmed, isQuestion);
    setDraft("");
    // 次の投稿を意図せず質問扱いにしないよう、1件送るごとに通常投稿へ戻す。
    setIsQuestion(false);
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      className="lt-glass rounded-sheet shadow-float flex flex-col gap-1.5 p-2"
    >
      <button
        type="button"
        role="switch"
        aria-checked={isQuestion}
        disabled={disabled}
        onClick={() => setIsQuestion((value) => !value)}
        className={`lt-tap flex min-h-9 w-full items-center justify-between rounded-[18px] px-3 py-1.5 text-left transition-colors disabled:opacity-50 ${
          isQuestion ? "bg-brand/12 text-text" : "text-text-muted hover:bg-surface-strong"
        }`}
      >
        <span className="flex items-center gap-2 text-[12px] font-semibold">
          <span
            className={`flex h-6 w-6 items-center justify-center rounded-full transition-colors ${
              isQuestion ? "bg-brand text-white" : "bg-surface-strong text-text-muted"
            }`}
          >
            <CircleHelp size={15} strokeWidth={2.2} />
          </span>
          {t.composer.asQuestion}
        </span>

        <span
          aria-hidden
          className="relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors"
          style={{ background: isQuestion ? "var(--lt-brand)" : "var(--lt-border-strong)" }}
        >
          <motion.span
            className="absolute top-[3px] h-4 w-4 rounded-full bg-white shadow-sm"
            animate={{ left: isQuestion ? 19 : 3 }}
            transition={motionPresets.press}
          />
        </span>
      </button>

      <div className="flex w-full items-end gap-2">
        <div className="relative min-w-0 flex-1">
          <textarea
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key !== "Enter") return;
              // Shift+Enter は改行のまま通す。
              if (event.shiftKey) return;
              // IME の変換確定の Enter を送信にしない。これを見ないと日本語入力で
              // 変換途中の文字列がそのまま飛ぶ。
              if (event.nativeEvent.isComposing) return;
              event.preventDefault();
              submit();
            }}
            rows={1}
            placeholder={isQuestion ? t.composer.placeholderQuestion : t.composer.placeholderComment}
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
          aria-label={isQuestion ? t.composer.sendQuestion : t.composer.sendComment}
          disabled={!canSend}
          whileTap={canSend ? { scale: 0.88 } : undefined}
          animate={{ opacity: canSend ? 1 : 0.35, scale: canSend ? 1 : 0.94 }}
          transition={motionPresets.press}
          className="lt-tap bg-gradient-brand shadow-glow flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full text-white"
        >
          <ArrowUp size={20} strokeWidth={2.5} />
        </motion.button>
      </div>

      {/* 改行キーが送信に変わったので、黙って変えない。 */}
      <p className="text-text-faint px-3 pt-0.5 text-[11px]">
        {t.composer.enterHint}
      </p>
    </form>
  );
}
