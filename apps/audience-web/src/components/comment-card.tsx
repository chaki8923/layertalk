"use client";

import type { Comment, Locale } from "@layertalk/shared";
import { motionPresets } from "@layertalk/shared";
import { motion } from "motion/react";

import { LikeButton } from "@/components/like-button";
import { timeLocale } from "@/i18n";
import { useLocale, useMessages } from "@/i18n/locale-context";

type Props = {
  comment: Comment;
  liked: boolean;
  isMine: boolean;
  onToggleLike: () => void;
};

function formatTime(iso: string, locale: Locale) {
  return new Date(iso).toLocaleTimeString(timeLocale(locale), {
    hour: "2-digit",
    minute: "2-digit",
    // en-US だと `03:42 PM` になって lt-num の桁揃えが崩れる。24 時制で固定する。
    hour12: false,
  });
}

export function CommentCard({ comment, liked, isMine, onToggleLike }: Props) {
  const t = useMessages();
  const locale = useLocale();

  return (
    <motion.li
      layout="position"
      initial={{ opacity: 0, y: -10, filter: "blur(4px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      exit={{ opacity: 0, scale: 0.97, transition: motionPresets.exit }}
      transition={motionPresets.entrance}
      className={`lt-glass rounded-card shadow-card flex items-start gap-3 p-3.5 ${
        isMine ? "ring-brand/35 ring-1" : ""
      }`}
    >
      <div className="min-w-0 flex-1">
        <p className="text-[15px] leading-[1.55] tracking-[0.01em] break-words whitespace-pre-wrap">
          {comment.content}
        </p>
        <div className="mt-1.5 flex items-center gap-2">
          {comment.is_question && (
            <span className="bg-brand/14 text-brand rounded-chip px-1.5 py-0.5 text-[10px] font-bold tracking-[0.08em]">
              {t.comment.question}
            </span>
          )}
          <time className="lt-num text-text-faint text-[12px]" dateTime={comment.created_at}>
            {formatTime(comment.created_at, locale)}
          </time>
          {isMine && <span className="text-brand text-[11px] font-semibold">{t.comment.mine}</span>}
        </div>
      </div>

      <LikeButton count={comment.likes_count} liked={liked} onToggle={onToggleLike} />
    </motion.li>
  );
}
