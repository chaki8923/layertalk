"use client";

import {
  ROOM_CODE_LENGTH,
  ROOM_CODE_PATTERN,
  motionPresets,
  normalizeRoomCode,
  type Locale,
} from "@layertalk/shared";
import { motion } from "motion/react";
import { ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { messages } from "@/i18n";

/**
 * 参加コードの入力。
 *
 * ロケールはサーバ側（`app/page.tsx`）が `Accept-Language` から決めて渡す。
 * この画面にはまだルームが無いので、ルームの言語には従えない。
 */
export function JoinForm({ locale }: { locale: Locale }) {
  const t = messages[locale];
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  const normalized = normalizeRoomCode(code);
  const valid = ROOM_CODE_PATTERN.test(normalized);

  const submit = () => {
    if (!valid) {
      setError(t.join.codeLength(ROOM_CODE_LENGTH));
      return;
    }
    router.push(`/r/${normalized}`);
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto]"
    >
      <div>
        <label htmlFor="room-code" className="sr-only">{t.join.codeLabel}</label>
        <input
          id="room-code"
          value={code}
          onChange={(event) => {
            setCode(event.target.value.toUpperCase());
            setError(null);
          }}
          inputMode="text"
          autoCapitalize="characters"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          maxLength={ROOM_CODE_LENGTH}
          placeholder="ABC123"
          aria-label={t.join.codeLabel}
          aria-describedby={error ? "room-code-error" : undefined}
          aria-invalid={Boolean(error)}
          className="border-border bg-bg-elev lt-num placeholder:text-text-faint focus:border-brand h-14 w-full rounded-control border px-4 text-center text-[22px] font-bold tracking-[0.24em] outline-none transition-colors"
        />
      </div>

      <motion.button
        type="submit"
        disabled={!valid}
        whileTap={valid ? { scale: 0.97 } : undefined}
        animate={{ opacity: valid ? 1 : 0.4 }}
        transition={motionPresets.press}
        className="lt-tap lt-nowrap bg-gradient-brand shadow-glow flex h-14 items-center justify-center gap-2 rounded-control px-6 text-[14px] font-semibold text-white disabled:cursor-not-allowed sm:min-w-32"
      >
        {t.join.submit}
        <ArrowRight size={17} strokeWidth={2.5} />
      </motion.button>

      {error && (
        <p id="room-code-error" role="alert" className="text-like text-center text-[12px] sm:col-span-2 sm:text-left">
          {error}
        </p>
      )}
    </form>
  );
}
