/** Framer Motion 用のトランジション定義。
 *  CSS 側の対応物は packages/shared/styles/theme.css の --ease-* にある。
 *  意図が同じものの別表現なので、片方だけ変えないこと（docs/design-system.md §6）。
 */

import type { Transition } from "motion/react";

/** ボタン押下の沈み込み。速く戻る。 */
export const press: Transition = {
  type: "spring",
  stiffness: 500,
  damping: 32,
  mass: 0.6,
};

/** 新着コメント・シートの出現。わずかに粘る。 */
export const entrance: Transition = {
  type: "spring",
  stiffness: 400,
  damping: 30,
  mass: 0.8,
};

/** レイアウト移動・タブ指示子のスライド。 */
export const soft: Transition = {
  type: "spring",
  stiffness: 220,
  damping: 26,
};

/** あらゆる消失。spring は使わない（消え際が揺れると目障り）。 */
export const exit: Transition = {
  duration: 0.18,
  ease: [0.22, 1, 0.36, 1],
};

/** 押下時の共通プロパティ。<motion.button {...tapProps}> で使う。 */
export const tapProps = {
  whileTap: { scale: 0.94 },
  transition: press,
} as const;

/** 端末が動きの抑制を要求しているか。演出系はこれを見て静的表示に落とす。 */
export const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;

/** 軽い触覚フィードバック。iOS Safari は無視するが Android では効く。 */
export const haptic = (ms = 10) => {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    navigator.vibrate?.(ms);
  }
};
