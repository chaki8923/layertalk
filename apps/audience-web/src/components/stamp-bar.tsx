"use client";

import { STAMP_EMOJIS, motionPresets } from "@layertalk/shared";
import { AnimatePresence, motion } from "motion/react";
import { useCallback, useRef, useState } from "react";

type FloatingStamp = {
  key: number;
  emoji: string;
  index: number;
  drift: number;
};

type Props = {
  onSend: (emoji: string) => void;
};

/**
 * 画面下部のスタンプバー。
 *
 * タップした瞬間にローカルで1つ舞い上げる。Broadcast の往復を待つと
 * 100ms 前後の間が空いて「効いていない」ように感じるため。
 */
export function StampBar({ onSend }: Props) {
  const [floating, setFloating] = useState<FloatingStamp[]>([]);
  const seqRef = useRef(0);

  const handleTap = useCallback(
    (emoji: string, index: number) => {
      onSend(emoji);
      motionPresets.haptic(8);

      const key = seqRef.current++;
      setFloating((prev) => [
        ...prev,
        { key, emoji, index, drift: (Math.random() - 0.5) * 34 },
      ]);
      window.setTimeout(() => {
        setFloating((prev) => prev.filter((item) => item.key !== key));
      }, 900);
    },
    [onSend],
  );

  return (
    <div className="relative">
      {/* タップ地点から舞い上がる即時フィードバック */}
      <div className="pointer-events-none absolute inset-x-0 bottom-full h-24">
        <AnimatePresence>
          {floating.map((item) => (
            <motion.span
              key={item.key}
              className="absolute bottom-0 text-[26px]"
              style={{
                left: `${((item.index + 0.5) / STAMP_EMOJIS.length) * 100}%`,
                marginLeft: -13,
              }}
              initial={{ y: 0, opacity: 0, scale: 0.6 }}
              animate={{ y: -80, x: item.drift, opacity: [0, 1, 1, 0], scale: [0.6, 1.2, 1, 0.9] }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.9, ease: "easeOut" }}
            >
              {item.emoji}
            </motion.span>
          ))}
        </AnimatePresence>
      </div>

      <div className="lt-glass rounded-sheet shadow-float flex items-center justify-between gap-1 p-1.5">
        {STAMP_EMOJIS.map((emoji, index) => (
          <motion.button
            key={emoji}
            type="button"
            aria-label={`${emoji} を送る`}
            onClick={() => handleTap(emoji, index)}
            whileTap={{ scale: 0.82 }}
            transition={motionPresets.press}
            className="lt-tap hover:bg-surface-strong flex flex-1 items-center justify-center rounded-full py-2.5 text-[24px] leading-none transition-colors"
          >
            {emoji}
          </motion.button>
        ))}
      </div>
    </div>
  );
}
