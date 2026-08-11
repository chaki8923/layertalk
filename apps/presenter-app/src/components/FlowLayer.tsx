import { AnimatePresence, motion } from "motion/react";
import { forwardRef, useImperativeHandle, useRef, useState } from "react";

export type CommentLayerHandle = {
  push: (text: string) => void;
  clear: () => void;
};

type FlowItem = {
  key: string;
  text: string;
  lane: number;
  width: number;
  durationSec: number;
};

type Props = {
  fontSize: number;
  opacity: number;
  /** 画面幅を横断するのにかかる基準秒数 */
  baseDurationSec: number;
};

/** 全角/半角を雑に見分けて文字幅を見積もる。
 *  DOM 計測すると1件ごとに強制レイアウトが走るので、流量が多い場面では見積もりの方が速い。 */
function estimateTextWidth(text: string, fontSize: number): number {
  let units = 0;
  for (const char of text) {
    // 半角英数記号・半角カナはおよそ 0.55em、それ以外（日本語・絵文字）は 1em 強
    units += /[\x20-\x7E｡-ﾟ]/.test(char) ? 0.55 : 1.05;
  }
  return units * fontSize;
}

const LANE_GAP_PX = 24;
const TOP_MARGIN_RATIO = 0.06;
const USABLE_HEIGHT_RATIO = 0.72;

/** ニコニコ動画風の横流れ。 */
export const FlowLayer = forwardRef<CommentLayerHandle, Props>(function FlowLayer(
  { fontSize, opacity, baseDurationSec },
  ref,
) {
  const [items, setItems] = useState<FlowItem[]>([]);

  // レーンごとの「次に空く時刻(ms)」。同じレーンでの追突を防ぐ唯一の状態。
  const laneFreeAtRef = useRef<number[]>([]);
  const seqRef = useRef(0);
  const timersRef = useRef<Set<number>>(new Set());

  const laneHeight = Math.round(fontSize * 1.55);
  const usableTop = Math.round(window.innerHeight * TOP_MARGIN_RATIO);

  useImperativeHandle(ref, () => ({
    push(text) {
      const viewportWidth = window.innerWidth;
      const usableHeight = window.innerHeight * USABLE_HEIGHT_RATIO;
      const laneCount = Math.max(1, Math.floor(usableHeight / (laneHeight + LANE_GAP_PX)));

      const lanes = laneFreeAtRef.current;
      if (lanes.length !== laneCount) {
        const resized = new Array<number>(laneCount).fill(0);
        for (let i = 0; i < Math.min(lanes.length, laneCount); i += 1) resized[i] = lanes[i];
        laneFreeAtRef.current = resized;
      }

      const currentLanes = laneFreeAtRef.current;
      const width = estimateTextWidth(text, fontSize);

      // 速度を全コメントで一定にする。可変にすると長文が短文を追い越して重なる。
      const pxPerSec = viewportWidth / baseDurationSec;
      const durationSec = (viewportWidth + width) / pxPerSec;

      const now = Date.now();
      // 文字列の末尾が画面右端を抜けきるまでの時間。これを過ぎればレーンを再利用できる。
      const clearMs = ((width + LANE_GAP_PX) / pxPerSec) * 1000;

      let lane = currentLanes.findIndex((freeAt) => freeAt <= now);
      if (lane === -1) {
        // 全レーン埋まり → 最も早く空くレーンに重ねる（表示しないよりはまし）
        lane = currentLanes.reduce((best, freeAt, i) => (freeAt < currentLanes[best] ? i : best), 0);
      }
      currentLanes[lane] = now + clearMs;

      const key = `flow-${seqRef.current++}`;
      setItems((prev) => [...prev, { key, text, lane, width, durationSec }]);

      const timer = window.setTimeout(
        () => {
          timersRef.current.delete(timer);
          setItems((prev) => prev.filter((entry) => entry.key !== key));
        },
        durationSec * 1000 + 200,
      );
      timersRef.current.add(timer);
    },
    clear() {
      for (const timer of timersRef.current) window.clearTimeout(timer);
      timersRef.current.clear();
      laneFreeAtRef.current = [];
      setItems([]);
    },
  }));

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      <AnimatePresence>
        {items.map((item) => (
          <motion.div
            key={item.key}
            className="lt-overlay-text absolute font-bold whitespace-nowrap"
            style={{
              top: usableTop + item.lane * (laneHeight + LANE_GAP_PX),
              fontSize,
              lineHeight: 1.2,
              opacity,
            }}
            initial={{ x: window.innerWidth }}
            animate={{ x: -item.width - 40 }}
            exit={{ opacity: 0 }}
            transition={{ duration: item.durationSec, ease: "linear" }}
          >
            {item.text}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
});
