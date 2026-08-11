"use client";

import type { Comment } from "@layertalk/shared";
import { motionPresets } from "@layertalk/shared";
import { motion } from "motion/react";

import { LikeButton } from "@/components/like-button";

type Props = {
  comment: Comment;
  liked: boolean;
  isMine: boolean;
  onToggleLike: () => void;
};

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function CommentCard({ comment, liked, isMine, onToggleLike }: Props) {
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
              質問
            </span>
          )}
          <time className="lt-num text-text-faint text-[12px]" dateTime={comment.created_at}>
            {formatTime(comment.created_at)}
          </time>
          {isMine && <span className="text-brand text-[11px] font-semibold">あなた</span>}
        </div>
      </div>

      <LikeButton count={comment.likes_count} liked={liked} onToggle={onToggleLike} />
    </motion.li>
  );
}
