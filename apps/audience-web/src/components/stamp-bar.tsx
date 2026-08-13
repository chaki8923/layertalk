"use client";

import {
  ROOM_STAMP_MAX_PER_ROOM,
  STAMP_EMOJIS,
  customStampKey,
  motionPresets,
  roomStampUrl,
  toStampPng,
  type RoomStamp,
} from "@layertalk/shared";
import { AnimatePresence, motion } from "motion/react";
import { ImagePlus, Loader2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

import { supabase } from "@/lib/supabase";

/** バーに並ぶ一枚。組み込みの絵文字か、このルームにアップロードされた画像。 */
type BarItem =
  | { kind: "emoji"; key: string; emoji: string }
  | { kind: "custom"; key: string; url: string };

type FloatingStamp = {
  key: number;
  item: BarItem;
  /** バーの左端からのタップ位置(px)。バーが横スクロールするので割合では出せない。 */
  x: number;
  drift: number;
};

type Props = {
  onSend: (key: string) => void;
  stamps: RoomStamp[];
  /** アップロード本体。失敗したら throw する（呼び出し側でロールバックする）。 */
  onUpload: (blob: Blob) => Promise<void>;
  disabled?: boolean;
};

/**
 * 画面下部のスタンプバー。
 *
 * タップした瞬間にローカルで1つ舞い上げる。Broadcast の往復を待つと
 * 100ms 前後の間が空いて「効いていない」ように感じるため。
 *
 * 組み込みの絵文字に続けて、このルームにアップロードされた画像スタンプが並ぶ。
 * 枚数が可変なのでバーは横スクロールする。
 */
export function StampBar({ onSend, stamps, onUpload, disabled = false }: Props) {
  const [floating, setFloating] = useState<FloatingStamp[]>([]);
  const seqRef = useRef(0);
  const barRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // 選んだ画像を「追加する」まで保留しておく。押し間違えてカメラロールの別の写真を
  // そのまま全員に公開してしまわないための一段。native の confirm() は使わない。
  const [pending, setPending] = useState<{ blob: Blob; previewUrl: string } | null>(null);
  const [uploading, setUploading] = useState(false);

  const items = useMemo<BarItem[]>(
    () => [
      ...STAMP_EMOJIS.map((emoji) => ({ kind: "emoji" as const, key: emoji, emoji })),
      ...stamps.map((stamp) => ({
        kind: "custom" as const,
        key: customStampKey(stamp.id),
        url: roomStampUrl(supabase, stamp.path),
      })),
    ],
    [stamps],
  );

  // プレビュー用の ObjectURL を取りこぼさない
  useEffect(() => {
    if (!pending) return;
    return () => URL.revokeObjectURL(pending.previewUrl);
  }, [pending]);

  const handleTap = useCallback(
    (item: BarItem, button: HTMLElement) => {
      onSend(item.key);
      motionPresets.haptic(8);

      // タップ位置を実測する。列が横スクロールする＝長さも可変なので index からは出せない。
      // 基準は浮上レイヤーと同じ包み（＝この relative）にそろえる。
      const bar = barRef.current;
      const x = bar
        ? button.getBoundingClientRect().left -
          bar.getBoundingClientRect().left +
          button.offsetWidth / 2
        : 0;

      const key = seqRef.current++;
      setFloating((prev) => [...prev, { key, item, x, drift: (Math.random() - 0.5) * 34 }]);
      window.setTimeout(() => {
        setFloating((prev) => prev.filter((entry) => entry.key !== key));
      }, 900);
    },
    [onSend],
  );

  const handlePick = useCallback(async (file: File | undefined) => {
    if (!file) return;
    try {
      const blob = await toStampPng(file);
      setPending({ blob, previewUrl: URL.createObjectURL(blob) });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "この画像は使えませんでした");
    }
  }, []);

  const handleConfirmUpload = useCallback(async () => {
    if (!pending) return;
    setUploading(true);
    try {
      await onUpload(pending.blob);
      setPending(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "スタンプを追加できませんでした");
    } finally {
      setUploading(false);
    }
  }, [pending, onUpload]);

  const roomFull = stamps.length >= ROOM_STAMP_MAX_PER_ROOM;

  return (
    <div className="flex flex-col gap-2">
      {/* -------------------------------------------------- 追加まえの確認 */}
      <AnimatePresence>
        {pending && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={motionPresets.entrance}
            className="lt-glass rounded-sheet shadow-float flex items-center gap-3 p-2.5"
          >
            {/* 透過PNGなので、市松ではなく淡い面の上に置いて形を見せる */}
            <div className="rounded-control bg-surface-strong flex h-14 w-14 shrink-0 items-center justify-center">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={pending.previewUrl} alt="" className="h-12 w-12 object-contain" />
            </div>

            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold">この画像をスタンプにする</p>
              <p className="text-text-faint mt-0.5 text-[11px] leading-relaxed">
                このルームにいる全員が押せるようになります
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              <button
                type="button"
                onClick={() => setPending(null)}
                disabled={uploading}
                className="lt-tap rounded-control border-border hover:bg-surface-strong border px-3 py-2 text-[13px] font-semibold transition-colors disabled:opacity-40"
              >
                やめる
              </button>
              <motion.button
                type="button"
                onClick={() => void handleConfirmUpload()}
                disabled={uploading}
                whileTap={{ scale: 0.94 }}
                transition={motionPresets.press}
                className="lt-tap rounded-control bg-gradient-brand shadow-glow flex items-center gap-1.5 px-3 py-2 text-[13px] font-semibold text-white disabled:opacity-60"
              >
                {uploading && <Loader2 size={13} className="animate-spin" />}
                追加する
              </motion.button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ------------------------------------------------------------ バー */}
      <div ref={barRef} className="relative">
        {/* タップ地点から舞い上がる即時フィードバック */}
        <div className="pointer-events-none absolute inset-x-0 bottom-full h-24 overflow-hidden">
          <AnimatePresence>
            {floating.map((entry) => (
              <motion.span
                key={entry.key}
                className="absolute bottom-0 flex items-center justify-center text-[26px] leading-none"
                style={{ left: entry.x, marginLeft: -13 }}
                initial={{ y: 0, opacity: 0, scale: 0.6 }}
                animate={{
                  y: -80,
                  x: entry.drift,
                  opacity: [0, 1, 1, 0],
                  scale: [0.6, 1.2, 1, 0.9],
                }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.9, ease: "easeOut" }}
              >
                {entry.item.kind === "emoji" ? (
                  entry.item.emoji
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={entry.item.url} alt="" className="h-[26px] w-[26px] object-contain" />
                )}
              </motion.span>
            ))}
          </AnimatePresence>
        </div>

        <div className="lt-glass rounded-sheet shadow-float flex items-center p-1.5">
          {/* スクロールするのはスタンプの列だけ。追加ボタンはこの外に固定する
              （中に入れるとカスタムが増えたぶん右へ流れて、画面外に隠れる） */}
          <div className="lt-no-scrollbar flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
            {items.map((item) => (
              <motion.button
                key={item.key}
                type="button"
                aria-label={
                  item.kind === "emoji" ? `${item.emoji} を送る` : "カスタムスタンプを送る"
                }
                onClick={(event) => handleTap(item, event.currentTarget)}
                disabled={disabled}
                whileTap={{ scale: 0.82 }}
                transition={motionPresets.press}
                className="lt-tap hover:bg-surface-strong flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-[24px] leading-none transition-colors disabled:opacity-40"
              >
                {item.kind === "emoji" ? (
                  item.emoji
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={item.url}
                    alt=""
                    draggable={false}
                    className="pointer-events-none h-7 w-7 object-contain"
                  />
                )}
              </motion.button>
            ))}
          </div>

          {/* ------------------------------------------------------ 追加 */}
          <div className="bg-border mx-1.5 h-6 w-px shrink-0" />

          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="hidden"
            onChange={(event) => {
              void handlePick(event.target.files?.[0]);
              // 同じファイルをもう一度選べるように毎回リセットする
              event.target.value = "";
            }}
          />
          <motion.button
            type="button"
            aria-label={roomFull ? "カスタムスタンプは上限です" : "画像からスタンプを追加"}
            title={roomFull ? "カスタムスタンプは上限です" : "画像からスタンプを追加"}
            onClick={() => fileRef.current?.click()}
            disabled={disabled || roomFull || Boolean(pending)}
            whileTap={{ scale: 0.82 }}
            transition={motionPresets.press}
            className="lt-tap border-border text-text-muted hover:bg-surface-strong hover:text-text flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-dashed transition-colors disabled:opacity-35"
          >
            <ImagePlus size={18} />
          </motion.button>
        </div>
      </div>
    </div>
  );
}
