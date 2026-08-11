import { AnimatePresence, motion } from "motion/react";
import { forwardRef, useImperativeHandle, useRef, useState } from "react";

import type { CommentLayerHandle } from "./FlowLayer";

type BubbleItem = {
  key: string;
  text: string;
  slot: number;
  bornAt: number;
};

type Props = {
  fontSize: number;
  opacity: number;
  /** 1件を表示し続ける秒数 */
  holdSec?: number;
};

const COLUMNS = 3;
const ROWS = 4;
const SLOT_COUNT = COLUMNS * ROWS;

/** フキダシ風。仮想グリッドの空きスロットに置いて重なりを避ける。 */
export const BubbleLayer = forwardRef<CommentLayerHandle, Props>(function BubbleLayer(
  { fontSize, opacity, holdSec = 6 },
  ref,
) {
  const [items, setItems] = useState<BubbleItem[]>([]);
  const seqRef = useRef(0);
  const timersRef = useRef<Set<number>>(new Set());

  useImperativeHandle(ref, () => ({
    push(text) {
      const key = `bubble-${seqRef.current++}`;

      setItems((prev) => {
        const used = new Set(prev.map((item) => item.slot));
        const free: number[] = [];
        for (let i = 0; i < SLOT_COUNT; i += 1) {
          if (!used.has(i)) free.push(i);
        }

        if (free.length > 0) {
          const slot = free[Math.floor(Math.random() * free.length)];
          return [...prev, { key, text, slot, bornAt: Date.now() }];
        }

        // 空きが無ければ最古を追い出す。古い声より新しい声を優先する。
        const oldest = prev.reduce((a, b) => (a.bornAt <= b.bornAt ? a : b));
        return [
          ...prev.filter((item) => item.key !== oldest.key),
          { key, text, slot: oldest.slot, bornAt: Date.now() },
        ];
      });

      const timer = window.setTimeout(() => {
        timersRef.current.delete(timer);
        setItems((prev) => prev.filter((item) => item.key !== key));
      }, holdSec * 1000);
      timersRef.current.add(timer);
    },
    clear() {
      for (const timer of timersRef.current) window.clearTimeout(timer);
      timersRef.current.clear();
      setItems([]);
    },
  }));

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <AnimatePresence>
        {items.map((item) => {
          const column = item.slot % COLUMNS;
          const row = Math.floor(item.slot / COLUMNS);

          return (
            <motion.div
              key={item.key}
              className="absolute flex justify-center px-4"
              style={{
                left: `${(column / COLUMNS) * 100}%`,
                top: `${8 + (row / ROWS) * 74}%`,
                width: `${100 / COLUMNS}%`,
                opacity,
              }}
              initial={{ scale: 0.8, opacity: 0, y: 12, filter: "blur(8px)" }}
              animate={{ scale: 1, opacity: 1, y: 0, filter: "blur(0px)" }}
              exit={{ opacity: 0, y: -24, filter: "blur(4px)" }}
              transition={{ type: "spring", stiffness: 400, damping: 30, mass: 0.8 }}
            >
              <span
                className="lt-overlay-text max-w-full text-center font-bold break-words"
                style={{ fontSize, lineHeight: 1.35 }}
              >
                {item.text}
              </span>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </div>
  );
});
