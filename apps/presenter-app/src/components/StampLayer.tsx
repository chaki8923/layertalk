import { animate } from "motion";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

export type StampLayerHandle = {
  /** 絵文字を count 個ぶん舞い上げる */
  burst: (emoji: string, count: number) => void;
};

/** 同時に生きられるパーティクル数の上限。超えたら古い順に回収する。
 *  上昇が遅い＝1個あたりの寿命が長いぶん、同時数は増える。上限が低すぎると
 *  まだ画面の途中にいる絵文字が消えて「ちらつき」に見えるので余裕を持たせる。 */
const MAX_PARTICLES = 200;

/**
 * 上昇のイージング。
 *
 * ここは触るときに注意がいる。cubic-bezier の第2制御点 (x2, y2) の y を 1.0 に
 * すると、その x の時点で移動距離をほぼ使い切ってしまう。
 * 例えば (0.35, 1.0) だと「時間の 35% で上がりきって、残りは上でじっとしている」
 * という動きになり、総時間をいくら伸ばしても体感速度は変わらない。
 *
 * この曲線は開始時の傾きを 1.0（＝等速）に合わせ、終盤だけ緩やかに減速する。
 * つまり「平均速度 = 上昇距離 ÷ duration」がそのまま体感になるので、
 * コントロール窓のスライダーの数値が素直に効く。
 */
const RISE_EASE: [number, number, number, number] = [0.33, 0.33, 0.7, 0.92];

const random = (min: number, max: number) => min + Math.random() * (max - min);

type Props = {
  opacity?: number;
  /** 1個が上がりきるまでの基準秒数。実際は ±15% ばらつかせる。 */
  durationSec?: number;
};

/**
 * スタンプのパーティクル演出。
 *
 * ここだけ React の宣言的レンダリングを使わず、DOM を直接生成して
 * motion の命令的 animate() を当てている。
 * 100個超のパーティクルを React の state に載せると、毎フレームの再レンダリングで
 * コメントの横流れまでカクつくため。UI とコメントは motion/react のままにしている。
 */
export const StampLayer = forwardRef<StampLayerHandle, Props>(function StampLayer(
  { opacity = 1, durationSec = 11 },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const liveRef = useRef<HTMLSpanElement[]>([]);

  // burst の同一性を保ちたいので、変わる値は ref 経由で読む。
  const durationRef = useRef(durationSec);
  const opacityRef = useRef(opacity);
  useEffect(() => {
    durationRef.current = durationSec;
    opacityRef.current = opacity;
  }, [durationSec, opacity]);

  useImperativeHandle(ref, () => ({
    burst(emoji, count) {
      const container = containerRef.current;
      if (!container) return;

      const live = liveRef.current;
      const spawnCount = Math.min(count, MAX_PARTICLES);
      const alpha = opacityRef.current;
      const base = durationRef.current;

      // 上限を超える分は最も古いものから消す
      const overflow = live.length + spawnCount - MAX_PARTICLES;
      if (overflow > 0) {
        for (const old of live.splice(0, overflow)) old.remove();
      }

      const viewportHeight = window.innerHeight;
      const viewportWidth = window.innerWidth;

      for (let i = 0; i < spawnCount; i += 1) {
        const particle = document.createElement("span");
        particle.textContent = emoji;
        particle.style.cssText = [
          "position:absolute",
          "bottom:-64px",
          `left:${random(0.04, 0.96) * viewportWidth}px`,
          `font-size:${random(28, 52)}px`,
          "line-height:1",
          "will-change:transform,opacity",
          "pointer-events:none",
          "user-select:none",
          `opacity:${alpha}`,
        ].join(";");

        container.appendChild(particle);
        live.push(particle);

        const rise = random(0.55, 0.95) * viewportHeight + 80;
        const sway = random(30, 90) * (Math.random() < 0.5 ? -1 : 1);
        const spin = random(-45, 45);
        const duration = base * random(0.85, 1.15);

        animate(
          particle,
          {
            y: [0, -rise],
            x: [0, sway, -sway * 0.7, sway * 0.35, 0],
            rotate: [0, spin],
            scale: [0.5, 1.15, 1, 1, 0.85],
            opacity: [0, alpha, alpha, alpha, 0],
          },
          {
            duration,
            // 1回のバッチが団子にならないよう散らす
            delay: random(0, 0.6),

            // ⚠️ プロパティ別オプションには duration を必ず書くこと。
            // motion の getValueTransition は transition[key] があるとそれを
            // 「そのまま」使い、トップレベルの duration をマージしない。
            // 省略すると既定の 0.3 秒で動き、外側の duration が完全に無視される。
            // （実測: {duration:4, y:{ease}} → y の実 duration は 0.3 秒）
            y: { duration, ease: RISE_EASE },
            x: { duration, ease: "easeInOut" },
            rotate: { duration, ease: "linear" },
            // 出現のポップだけは総時間に引きずられないよう、前半のごく短い割合で終わらせる
            scale: { duration, times: [0, 0.04, 0.1, 0.85, 1], ease: "easeOut" },
            opacity: { duration, times: [0, 0.03, 0.7, 0.82, 1], ease: "linear" },
          },
        ).finished.finally(() => {
          const index = live.indexOf(particle);
          if (index !== -1) live.splice(index, 1);
          particle.remove();
        });
      }
    },
  }));

  // アンマウント時に残骸を掃除する
  useEffect(
    () => () => {
      for (const particle of liveRef.current) particle.remove();
      liveRef.current = [];
    },
    [],
  );

  return (
    <div
      ref={containerRef}
      className="pointer-events-none absolute inset-0 overflow-hidden"
      aria-hidden
    />
  );
});
