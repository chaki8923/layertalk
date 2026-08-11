"use client";

import { ROOM_CODE_LENGTH, ROOM_CODE_PATTERN, motionPresets, normalizeRoomCode } from "@layertalk/shared";
import { motion } from "motion/react";
import { ArrowRight } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function HomePage() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  const normalized = normalizeRoomCode(code);
  const valid = ROOM_CODE_PATTERN.test(normalized);

  const submit = () => {
    if (!valid) {
      setError(`参加コードは${ROOM_CODE_LENGTH}文字です`);
      return;
    }
    router.push(`/r/${normalized}`);
  };

  return (
    <main className="flex h-dvh flex-col items-center justify-center px-6">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={motionPresets.entrance}
        className="w-full max-w-sm"
      >
        <div className="mb-8 text-center">
          <h1 className="bg-gradient-brand bg-clip-text text-[30px] leading-tight font-bold tracking-[-0.02em] text-transparent">
            LayerTalk
          </h1>
          <p className="text-text-muted mt-2 text-[14px] leading-relaxed">
            発表者から共有された参加コードを入力してください
          </p>
        </div>

        <form
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
          className="flex flex-col gap-3"
        >
          <input
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
            aria-label="参加コード"
            className="lt-glass rounded-card lt-num placeholder:text-text-faint w-full py-4 text-center text-[26px] font-bold tracking-[0.28em] outline-none"
          />

          {error && <p className="text-like text-center text-[12px]">{error}</p>}

          <motion.button
            type="submit"
            disabled={!valid}
            whileTap={valid ? { scale: 0.97 } : undefined}
            animate={{ opacity: valid ? 1 : 0.4 }}
            transition={motionPresets.press}
            className="lt-tap bg-gradient-brand shadow-glow rounded-control flex items-center justify-center gap-2 py-3.5 text-[15px] font-semibold text-white"
          >
            参加する
            <ArrowRight size={17} strokeWidth={2.5} />
          </motion.button>
        </form>
      </motion.div>
    </main>
  );
}
