/**
 * 画面下から上へ移動する演出の共通イージング。
 * 開始はほぼ等速、終盤だけを緩やかに減速させる。
 */
export const RISE_EASE: [number, number, number, number] = [0.33, 0.33, 0.7, 0.92];
