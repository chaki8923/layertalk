"use client";

import { motionPresets } from "@layertalk/shared";
import { AnimatePresence, motion } from "motion/react";
import { Heart } from "lucide-react";
import { useState } from "react";

import { useMessages } from "@/i18n/locale-context";

type Props = {
  count: number;
  liked: boolean;
  onToggle: () => void;
};

/** 弾けるパーティクルの向き（度）。6方向で十分に「弾けた」感じが出る。 */
const BURST_ANGLES = [0, 60, 120, 180, 240, 300];

export function LikeButton({ count, liked, onToggle }: Props) {
  const t = useMessages();
  const [burstKey, setBurstKey] = useState(0);

  const handleClick = () => {
    // 取り消しのときは弾けさせない（引き算に祝祭感は要らない）
    if (!liked) {
      setBurstKey((key) => key + 1);
      motionPresets.haptic(10);
    }
    onToggle();
  };

  return (
    <motion.button
      type="button"
      onClick={handleClick}
      whileTap={{ scale: 0.9 }}
      transition={motionPresets.press}
      aria-pressed={liked}
      aria-label={liked ? t.comment.unlike : t.comment.like}
      className={`lt-tap relative flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1.5 transition-colors ${
        liked
          ? "border-like/35 bg-like/12 text-like"
          : "border-border text-text-muted hover:border-border-strong"
      }`}
    >
      <span className="relative flex items-center justify-center">
        <motion.span
          animate={liked ? { scale: [1, 1.35, 1] } : { scale: 1 }}
          transition={{ duration: 0.34, ease: [0.34, 1.56, 0.64, 1] }}
          className="flex"
        >
          <Heart size={14} fill={liked ? "currentColor" : "none"} strokeWidth={2.2} />
        </motion.span>

        {/* ハートから弾けるパーティクル */}
        <AnimatePresence>
          {burstKey > 0 && (
            <motion.span
              key={burstKey}
              className="pointer-events-none absolute inset-0"
              initial={{ opacity: 1 }}
              animate={{ opacity: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5 }}
            >
              {BURST_ANGLES.map((angle) => (
                <motion.span
                  key={angle}
                  className="bg-like absolute top-1/2 left-1/2 h-1 w-1 rounded-full"
                  initial={{ x: 0, y: 0, scale: 0 }}
                  animate={{
                    x: Math.cos((angle * Math.PI) / 180) * 13,
                    y: Math.sin((angle * Math.PI) / 180) * 13,
                    scale: [0, 1, 0],
                  }}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                />
              ))}
            </motion.span>
          )}
        </AnimatePresence>
      </span>

      <span className="lt-num text-[12px] leading-none font-semibold">{count}</span>
    </motion.button>
  );
}
