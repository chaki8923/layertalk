import { animate, type AnimationPlaybackControls } from "motion";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

import { RISE_EASE } from "../lib/overlay-motion";
import type { CommentLayerHandle } from "./FlowLayer";

type Props = {
  fontSize: number;
  opacity: number;
  /** 画面下から上まで移動する基準秒数。 */
  durationSec?: number;
};

type LiveBubble = {
  element: HTMLDivElement;
  animation: AnimationPlaybackControls;
};

const LANES = 3;
const MAX_ITEMS = 18;
/** 先行するフキダシとの縦の間隔。これだけ空いてから次を発射する。 */
const LANE_GAP_PX = 40;

const random = (min: number, max: number) => min + Math.random() * (max - min);

/**
 * フキダシ風コメントを、スタンプと同じ命令的アニメーションで下から上へ流す。
 * Tauri の WebView ではレイアウト計測後に React state 経由で animate を開始すると
 * 初期位置だけが残ることがあるため、DOM 追加・実寸計測・開始を同じ処理内で完結させる。
 */
export const BubbleLayer = forwardRef<CommentLayerHandle, Props>(function BubbleLayer(
  { fontSize, opacity, durationSec = 9 },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const liveRef = useRef<LiveBubble[]>([]);
  const laneCursorRef = useRef(Math.floor(Math.random() * LANES));
  /**
   * レーンごとの「次に発射してよい時刻(ms)」。FlowLayer が横軸でやっているのと同じ理屈。
   * フキダシは不透明な板なので、重なると後発が先発を完全に隠してしまう。
   */
  const laneFreeAtRef = useRef<number[]>(new Array(LANES).fill(0));

  const fontSizeRef = useRef(fontSize);
  const opacityRef = useRef(opacity);
  const durationRef = useRef(durationSec);
  useEffect(() => {
    fontSizeRef.current = fontSize;
    opacityRef.current = opacity;
    durationRef.current = durationSec;
  }, [durationSec, fontSize, opacity]);

  const discard = (bubble: LiveBubble) => {
    const index = liveRef.current.indexOf(bubble);
    if (index !== -1) liveRef.current.splice(index, 1);
    bubble.element.remove();
  };

  const clear = () => {
    for (const bubble of liveRef.current.splice(0)) {
      bubble.animation.stop();
      bubble.element.remove();
    }
    // 戻し忘れると、再開直後の数件が前回の予約時刻ぶん遅れて出てくる
    laneFreeAtRef.current.fill(0);
  };

  useImperativeHandle(ref, () => ({
    push(text) {
      const container = containerRef.current;
      if (!container) return;

      const lane = laneCursorRef.current;
      laneCursorRef.current = (laneCursorRef.current + 1) % LANES;

      if (liveRef.current.length >= MAX_ITEMS) {
        const oldest = liveRef.current.shift();
        if (oldest) {
          oldest.animation.stop();
          oldest.element.remove();
        }
      }

      // ラッパーがレーンの枠（＝フキダシの横幅の上限）を決め、animate の対象にもなる。
      // 中のフキダシは inline-block なので、文字量に応じて自分で幅を縮める。
      const element = document.createElement("div");
      element.style.cssText = [
        "position:absolute",
        "top:0",
        `left:${(lane / LANES) * 100}%`,
        `width:${100 / LANES}%`,
        "box-sizing:border-box",
        "padding:0 12px",
        "text-align:center",
        `font-size:${fontSizeRef.current}px`,
        "font-weight:700",
        "line-height:1.35",
        // 発射待ちの間の見た目。アニメーションの遅延中は要素の素のスタイルが出るので、
        // ここで消しておかないと画面上端に一瞬フキダシが貼り付く。
        "opacity:0",
        "will-change:transform,opacity",
        "pointer-events:none",
        "user-select:none",
      ].join(";");

      const bubbleBody = document.createElement("div");
      bubbleBody.className = "lt-overlay-bubble";
      bubbleBody.textContent = text;
      element.appendChild(bubbleBody);
      container.appendChild(element);

      const height = element.offsetHeight;
      const viewportHeight = window.innerHeight;
      const alpha = opacityRef.current;
      const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
      const duration = reduceMotion ? 6 : durationRef.current;
      const startY = reduceMotion ? viewportHeight * (0.18 + lane * 0.2) : viewportHeight + 36;
      const endY = reduceMotion ? startY : -(height + 48);
      const sway = reduceMotion ? 0 : random(18, 54) * (Math.random() < 0.5 ? -1 : 1);

      // 先行するフキダシが LANE_GAP_PX ぶん上へ抜けるまで待ってから発射する。
      // 静止表示になる reduceMotion のときはレーンを空けようがないので待たない。
      const now = Date.now();
      let delay = 0;
      if (!reduceMotion) {
        const pxPerSec = (startY - endY) / duration;
        delay = Math.max(0, (laneFreeAtRef.current[lane] - now) / 1000);
        laneFreeAtRef.current[lane] = now + delay * 1000 + ((height + LANE_GAP_PX) / pxPerSec) * 1000;
      }

      const animation = animate(
        element,
        {
          y: [startY, endY],
          x: reduceMotion ? [0, 0] : [0, sway, -sway * 0.55, 0],
          scale: reduceMotion ? [1, 1] : [0.9, 1.03, 1, 0.96],
          opacity: reduceMotion ? [0, alpha, alpha, 0] : [0, alpha, alpha, alpha, 0],
        },
        // duration と同じく delay もプロパティ別に書く。トップレベルに置いても
        // 各プロパティのオプションで丸ごと上書きされて効かない（CLAUDE.md の罠 #1）。
        {
          duration,
          delay,
          y: { duration, delay, ease: reduceMotion ? "linear" : RISE_EASE },
          x: { duration, delay, ease: "easeInOut" },
          scale: {
            duration,
            delay,
            times: reduceMotion ? [0, 1] : [0, 0.06, 0.82, 1],
            ease: "easeOut",
          },
          opacity: {
            duration,
            delay,
            times: reduceMotion ? [0, 0.04, 0.84, 1] : [0, 0.04, 0.72, 0.88, 1],
            ease: "linear",
          },
        },
      );

      const bubble: LiveBubble = { element, animation };
      liveRef.current.push(bubble);
      void animation.finished.then(
        () => discard(bubble),
        () => discard(bubble),
      );
    },
    clear,
  }));

  useEffect(() => clear, []);

  return (
    <div
      ref={containerRef}
      className="pointer-events-none absolute inset-0 overflow-hidden"
      aria-hidden
    />
  );
});
